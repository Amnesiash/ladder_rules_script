import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);
const MANIFEST_FILE_NAME = "artifacts-manifest.json";
// manifest 落在 rules/ 根目录，三套客户端产物各有自己的 kind
const MANIFEST_RELATIVE_PATH = `rules/${MANIFEST_FILE_NAME}`;
const PROVIDER_KINDS = new Set([
  "classical-yaml",
  "remaining-yaml",
  "clash",
  "mihomo-yaml",
  "quantumultx-list",
  "loon-list",
]);
// 从 git ls-tree 回退推断产物时，按一级目录名判定 kind
const PROVIDER_KIND_BY_DIR = new Map([
  ["mihomo", "mihomo-yaml"],
  ["quantumultx", "quantumultx-list"],
  ["loon", "loon-list"],
]);
const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

// ==================== Manifest 文件操作 ====================

export async function loadManifestFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return parseManifest(content, filePath);
}

export async function loadPreviousManifest({
  previousManifestPath,
  previousReleaseDir,
  previousRef = "origin/main",
  cwd = process.cwd(),
} = {}) {
  if (previousManifestPath) {
    return loadManifestFile(previousManifestPath);
  }
  if (previousReleaseDir) {
    return loadManifestFromReleaseDir(previousReleaseDir);
  }
  if (!previousRef) return null;
  return loadManifestFromGitRef({ ref: previousRef, cwd });
}

export async function loadManifestFromReleaseDir(releaseDir) {
  const manifestPath = path.join(releaseDir, MANIFEST_FILE_NAME);
  try {
    return await loadManifestFile(manifestPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const paths = await listFiles(releaseDir);
  return manifestFromReleasePaths(paths);
}

export async function loadManifestFromGitRef({ ref, cwd = process.cwd() }) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${ref}:${MANIFEST_RELATIVE_PATH}`],
      { cwd, maxBuffer: 1024 * 1024 * 8 },
    );
    return parseManifest(stdout, `${ref}:${MANIFEST_RELATIVE_PATH}`);
  } catch {
    // Older branches do not have a manifest
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-tree", "-r", "--name-only", ref],
      { cwd, maxBuffer: 1024 * 1024 * 8 },
    );
    const paths = stdout.split(/\r?\n/u).filter(Boolean);
    return manifestFromReleasePaths(paths);
  } catch {
    return null;
  }
}

async function listFiles(dir) {
  const result = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) result.push(fullPath);
    }
  }
  return result;
}

function parseManifest(content, label) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid artifact manifest ${label}: ${error.message}`);
  }
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  return {
    version: manifest.version ?? 1,
    artifacts: artifacts
      .filter((artifact) => PROVIDER_KINDS.has(artifact.kind))
      .map((artifact) => ({
        ...artifact,
        relativePath: artifact.relativePath || artifact.outputPath || path.join(artifact.sourceRelativeDir || "", artifact.outputPath || ""),
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  };
}

function manifestFromReleasePaths(paths) {
  return {
    version: 1,
    artifacts: paths
      .map(providerArtifactFromPath)
      .filter(Boolean)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  };
}

function providerArtifactFromPath(absolutePath) {
  const relativePath = path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
  if (relativePath === MANIFEST_FILE_NAME || relativePath === MANIFEST_RELATIVE_PATH || relativePath.endsWith("/README.md")) {
    return null;
  }

  // 现行产物落在 rules/<客户端目录>/ 下，去掉 "rules/" 前缀，
  // 与 makeArtifact 输出的 relativePath（相对 rules/）保持一致。
  if (relativePath.startsWith("rules/")) {
    const outputRelative = relativePath.slice("rules/".length);
    const clientDir = outputRelative.split("/")[0];
    const kind = PROVIDER_KIND_BY_DIR.get(clientDir);
    if (kind) {
      return {
        relativePath: outputRelative,
        fileName: path.posix.basename(outputRelative),
        sourceRelativeDir: path.posix.dirname(outputRelative),
        kind,
        sha256: null,
      };
    }
  }

  // 兼容旧布局：独立的 classical-yaml / Clash .txt 产物
  const fileName = path.posix.basename(relativePath);
  const sourceRelativeDir = path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath);
  if (fileName.endsWith(".yaml")) {
    return { relativePath, fileName, sourceRelativeDir, kind: "classical-yaml", sha256: null };
  }
  if (fileName.endsWith(".txt") && relativePath.startsWith("Clash/")) {
    return { relativePath, fileName, sourceRelativeDir, kind: "clash", sha256: null };
  }
  return null;
}

// ==================== 变更检测 ====================

export function compareProviderArtifactChanges(previousManifest, currentManifest) {
  if (!previousManifest) {
    return { added: [], removed: [], updated: [] };
  }

  const previousMap = new Map();
  const currentMap = new Map();

  for (const artifact of previousManifest.artifacts || []) {
    previousMap.set(artifact.relativePath, artifact);
  }
  for (const artifact of currentManifest.artifacts || []) {
    currentMap.set(artifact.relativePath, artifact);
  }

  const added = [];
  const removed = [];
  const updated = [];

  for (const [path, current] of currentMap) {
    const previous = previousMap.get(path);
    if (!previous) added.push(current);
    else if (previous.sha256 !== current.sha256) updated.push(current);
  }

  for (const [path, previous] of previousMap) {
    if (!currentMap.has(path)) removed.push(previous);
  }

  return { added, removed, updated };
}

export function hasProviderArtifactChanges(changes) {
  return changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0;
}

// ==================== Telegram 消息渲染 ====================

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderTelegramArtifactChangeMessage({
  changes,
  repository,
  releaseBranch = "main",
  maxItemsPerSection = 25,
  maxMessageLength = TELEGRAM_MESSAGE_MAX_LENGTH,
}) {
  const itemLimits = {
    added: Math.min(changes.added.length, maxItemsPerSection),
    removed: Math.min(changes.removed.length, maxItemsPerSection),
    updated: Math.min(changes.updated.length, maxItemsPerSection),
  };

  let message = renderTelegramMessageWithLimits({
    changes,
    repository,
    releaseBranch,
    itemLimits,
  });

  // 自动截断以适应 Telegram 限制
  while (message.length > maxMessageLength && (itemLimits.added > 0 || itemLimits.removed > 0 || itemLimits.updated > 0)) {
    if (itemLimits.added >= itemLimits.removed && itemLimits.added >= itemLimits.updated && itemLimits.added > 0) {
      itemLimits.added -= 1;
    } else if (itemLimits.updated >= itemLimits.removed && itemLimits.updated > 0) {
      itemLimits.updated -= 1;
    } else {
      itemLimits.removed -= 1;
    }
    message = renderTelegramMessageWithLimits({
      changes,
      repository,
      releaseBranch,
      itemLimits,
    });
  }

  return message;
}

function renderTelegramMessageWithLimits({ changes, repository, releaseBranch, itemLimits }) {
  const lines = [
    "<b>📦 rule provider 产物变化</b>",
    repository ? `<code>${escapeHtml(repository)}</code>` : null,
    `新增 <b>${changes.added.length}</b> / 减少 <b>${changes.removed.length}</b> / 更新 <b>${changes.updated.length}</b>`,
    "",
    renderChangeSection({ title: "新增", artifacts: changes.added, repository, releaseBranch, maxItems: itemLimits.added }),
    renderChangeSection({ title: "更新", artifacts: changes.updated, repository, releaseBranch, maxItems: itemLimits.updated }),
    renderChangeSection({ title: "减少", artifacts: changes.removed, repository, releaseBranch, maxItems: itemLimits.removed }),
  ].filter((line) => line !== null && line !== "");

  return lines.join("\n");
}

function renderChangeSection({ title, artifacts, repository, releaseBranch, maxItems }) {
  if (!artifacts.length || maxItems <= 0) return null;

  const items = artifacts.slice(0, maxItems);
  const lines = [`<b>${title}</b>`];

  for (const artifact of items) {
    const displayName = artifact.relativePath || artifact.outputPath || artifact.label || "-";
    if (repository && releaseBranch) {
      const url = `https://raw.githubusercontent.com/${repository}/${releaseBranch}/rules/${artifact.relativePath}`;
      lines.push(`- <a href="${url}">${escapeHtml(displayName)}</a>`);
    } else {
      lines.push(`- ${escapeHtml(displayName)}`);
    }
  }

  if (artifacts.length > maxItems) {
    lines.push(`... 及其他 ${artifacts.length - maxItems} 项`);
  }

  return lines.join("\n");
}

export async function sendTelegramMessage({ botToken, chatId, text, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: HTTP ${response.status} ${await response.text()}`);
  }
}

export async function sendTelegramNotification({
  botToken,
  chatId,
  changes,
  repository,
  dryRun = false,
  previousReleaseDir,
  currentReleaseDir,
  previousRef,
  cwd = process.cwd(),
}) {
  if (!botToken || !chatId) {
    console.log("Telegram notification skipped: missing botToken or chatId");
    return;
  }

  if (!hasProviderArtifactChanges(changes)) {
    console.log("No provider artifact changes detected.");
    return;
  }

  const message = await renderTelegramArtifactChangeMessage({
    changes,
    repository,
  });

  if (dryRun) {
    console.log("Telegram notification (dry run):");
    console.log(message);
    return;
  }

  try {
    await sendTelegramMessage({ botToken, chatId, text: message });
    console.log(`Telegram notification sent for ${changes.added.length} additions and ${changes.removed.length} removals.`);
  } catch (error) {
    console.error(`Failed to send Telegram notification: ${error.message}`);
  }
}

// ==================== Artifact 管理 ====================

export function makeArtifact({ entry, outputRoot, filePath, kind, label }) {
  const sourceRelativeDir = entry.sourceRelativeDir || "";
  const outputPath = path.relative(outputRoot, filePath).split(path.sep).join("/");

  return {
    slug: entry.slug || entry.name,
    name: entry.name,
    sourceRelativeDir,
    outputPath,
    relativePath: outputPath,
    filePath,
    kind,
    label,
    behavior: entry.behavior,
  };
}

export async function writeArtifactManifest({ outputRoot, artifacts }) {
  const manifestPath = path.join(outputRoot, MANIFEST_FILE_NAME);
  const manifest = {
    timestamp: new Date().toISOString(),
    artifacts: await Promise.all(artifacts.map(async (a) => ({
      slug: a.slug,
      name: a.name,
      sourceRelativeDir: a.sourceRelativeDir,
      outputPath: a.outputPath,
      relativePath: a.relativePath || a.outputPath || path.join(a.sourceRelativeDir || "", a.outputPath || ""),
      kind: a.kind,
      label: a.label,
      behavior: a.behavior,
      sha256: await computeFileSha256(a.filePath),
    }))),
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

async function computeFileSha256(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}
