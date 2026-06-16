import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadAllSources, toSafeFileStem, toSafePathStem } from "./config.mjs";
import { buildSortedRulesetForClash } from "./rules.mjs";
import { fetchWithFallback, sourceConfigsFromSourceTxt, deriveCacheFileNameFromUrl } from "./subscriptions.mjs";
import { makeArtifact, writeArtifactManifest } from "./notifications.mjs";

const execFileAsync = promisify(execFile);

export class BuildReleaseError extends Error {
  constructor(message, context = {}) {
    const location = [context.sourceName, context.entryName].filter(Boolean).join(":");
    super(location ? `${location}: ${message}` : message);
    this.name = "BuildReleaseError";
    this.context = context;
  }
}

export async function buildRelease({
  projectRoot = process.cwd(),
  sourceRoot = path.join(projectRoot, "rules/source"),
  outputRoot = path.join(projectRoot, "rules"),
  repository = process.env.GITHUB_REPOSITORY,
  fetchImpl = fetch,
  warn = (message) => console.warn(message),
} = {}) {
  projectRoot = path.resolve(projectRoot);
  sourceRoot = path.resolve(sourceRoot);
  outputRoot = path.resolve(outputRoot);

  await fs.mkdir(outputRoot, { recursive: true });

  const sourceTxtConfigs = await sourceConfigsFromSourceTxt({ projectRoot, sourceRoot });
  const sourceConfigs = sourceTxtConfigs.length > 0 ? sourceTxtConfigs : await loadAllSources({ projectRoot, sourceRoot });

  const allArtifacts = [];

  for (const sourceConfig of sourceConfigs) {
    const groups = new Map();
    for (const file of sourceConfig.files) {
      const key = file.name || file.slug;
      if (!groups.has(key)) groups.set(key, { name: key, entries: [], sourceConfig });
      groups.get(key).entries.push(file);
    }

    for (const group of groups.values()) {
      for (const entry of group.entries) {
        try {
          const entryArtifacts = await processEntry({ entry, outputRoot, fetchImpl, projectRoot, sourceRoot });
          allArtifacts.push(...entryArtifacts);
        } catch (error) {
          if (error instanceof BuildReleaseError) {
            warn(`Skipping ${entry.name}: ${error.message}`);
          } else {
            throw error;
          }
        }
      }
    }
  }

  // 清理不再�?rule_source.txt 生成的旧输出文件
  const cleanupResult = await cleanupOrphanedOutputFiles({ outputRoot, artifacts: allArtifacts });
  if (cleanupResult.removed.length > 0) {
    console.log(`已清�?${cleanupResult.removed.length} 个旧输出文件`);
    for (const item of cleanupResult.removed) {
      console.log(`  - ${path.relative(projectRoot, item)}`);
    }
  }

  const manifestDir = path.join(projectRoot, "build_scripts");
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = await writeArtifactManifest({ outputRoot: manifestDir, artifacts: allArtifacts });
  allArtifacts.push(
    makeArtifact({
      entry: { slug: "artifacts-manifest", name: "artifacts-manifest", sourceRelativeDir: "" },
      outputRoot: manifestDir,
      filePath: manifestPath,
      kind: "manifest",
      label: "release artifact manifest",
    }),
  );

  return { outputRoot, artifacts: allArtifacts, sourceConfigs, cleanup: cleanupResult };
}

/**
 * 清理不再由当�?rule_source.txt 生成的旧输出文件
 * 保留本次构建生成的文件（�?release/ 下），删除其�?.list 文件
 * 跳过 custom/ �?source/ 目录
 */
async function cleanupOrphanedOutputFiles({ outputRoot, artifacts }) {
  const removed = [];
  
  // 收集本次构建生成的所�?.list 文件路径
  const generatedFiles = new Set();
  for (const artifact of artifacts) {
    if (artifact.kind === "clash" && artifact.filePath) {
      generatedFiles.add(path.resolve(artifact.filePath));
    }
  }
  
  // 扫描 outputRoot 的父目录（Rules/），跳过 custom/ �?source/
  try {
    const scanRoot = path.dirname(outputRoot);
    const allFiles = await listAllFiles(scanRoot);
    const skipDirs = [path.resolve(scanRoot, "custom"), path.resolve(scanRoot, "source")];
    
    for (const fullPath of allFiles) {
      if (!fullPath.endsWith(".list")) continue;
      
      const resolvedPath = path.resolve(fullPath);
      
      // 跳过 custom/ �?source/ 目录下的文件
      if (skipDirs.some((dir) => resolvedPath.startsWith(dir + path.sep) || resolvedPath === dir)) continue;
      
      // 如果文件不在本次生成的列表中，删除它
      if (!generatedFiles.has(resolvedPath)) {
        try {
          await fs.unlink(resolvedPath);
          removed.push(resolvedPath);
        } catch (err) {
          console.warn(`清理文件失败: ${resolvedPath}: ${err.message}`);
        }
      }
    }
    
    // 清理空目�?
    await removeEmptySubdirs(outputRoot);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`扫描输出目录失败: ${err.message}`);
    }
  }
  
  return { removed };
}

async function processEntry({ entry, outputRoot, fetchImpl, projectRoot, sourceRoot }) {
  const content = await fetchEntryContent(entry, fetchImpl, { sourceRoot, sourceName: entry.sourceName });
  const artifacts = [];

  const clashLines = buildSortedRulesetForClash(content.split(/\r?\n/));
  if (clashLines.length) {
    const rulesPath = await writeRulesFile({ outputRoot, entry, lines: clashLines, projectRoot });
    artifacts.push(makeArtifact({ entry, outputRoot, filePath: rulesPath, kind: "clash", label: `${entry.name} Rules` }));
  }

  return artifacts;
}

async function fetchEntryContent(entry, fetchImpl, { sourceRoot, sourceName } = {}) {
  if (Array.isArray(entry.urls) && entry.urls.length > 0) {
    const parts = [];
    for (const url of entry.urls) {
      if (entry.type === "http") {
        const content = await fetchUrlContent(url, fetchImpl);
        parts.push(content);
        await saveToCache({ url, content, sourceRoot, sourceName });
      } else if (entry.type === "file") {
        parts.push(await fs.readFile(url, "utf8"));
      } else if (entry.type === "inline") {
        parts.push(String(url));
      } else {
        throw new BuildReleaseError(`unsupported entry type: ${entry.type}`, { entryName: entry.name });
      }
    }
    return parts.join("\n");
  }

  if (entry.type === "http") {
    const content = await fetchUrlContent(entry.url, fetchImpl);
    await saveToCache({ url: entry.url, content, sourceRoot, sourceName });
    return content;
  }
  if (entry.type === "file") {
    return await fs.readFile(entry.url, "utf8");
  }
  if (entry.type === "inline") {
    return entry.url;
  }
  throw new BuildReleaseError(`unsupported entry type: ${entry.type}`, { entryName: entry.name });
}

async function fetchUrlContent(url, fetchImpl) {
  const res = await fetchWithFallback(url, {}, fetchImpl);
  return await res.text();
}

async function saveToCache({ url, content, sourceRoot, sourceName }) {
  if (!sourceRoot || !sourceName) return;
  const cacheFileName = deriveCacheFileNameFromUrl(url);
  if (!cacheFileName) return;
  const cacheDir = path.join(sourceRoot, sourceName);
  const cachePath = path.join(cacheDir, cacheFileName);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, content);
}

async function writeRulesFile({ outputRoot, entry, lines, projectRoot }) {
  // 支持 [Extra/Apple] 多级路径: entry.name 可能�?"Extra/Apple"
  const name = toSafePathStem(entry.name);
  const outPath = path.join(outputRoot, `${name}.list`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  // 规则体未变化时，复用上次 main 分支的文件（含旧时间戳）�?
  // 避免�?header 时间不同导致 sha256 变化和误报通知
  const relativePath = path.relative(projectRoot, outPath).split(path.sep).join("/");
  const previousContent = await readPreviousMainFile(relativePath, projectRoot);
  if (previousContent !== null) {
    const previousBody = extractBodyLines(previousContent);
    const newBody = lines.join("\n");
    if (previousBody === newBody) {
      await fs.writeFile(outPath, previousContent);
      return outPath;
    }
  }

  const updateTime = formatUpdateTimeShanghai();
  const header = buildHeaderBlock({ name: entry.name, updateTime, bodyLines: lines });
  await fs.writeFile(outPath, header + lines.join("\n") + "\n");
  return outPath;
}

async function readPreviousMainFile(relativePath, cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["show", `origin/main:${relativePath}`], {
      cwd,
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** 递归列出目录下所有文�?*/
async function listAllFiles(dir) {
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
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

/** 递归清理子目录中的空目录 */
async function removeEmptySubdirs(rootDir) {
  const dirs = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
    if (current !== rootDir) dirs.push(current);
  }
  // 从深到浅删除空目�?
  dirs.sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    try {
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0) await fs.rmdir(dir);
    } catch {
      // ignore
    }
  }
}

function extractBodyLines(content) {
  return content
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join("\n");
}

function buildHeaderBlock({ name, updateTime, bodyLines }) {
  const typeCounts = countRuleTypes(bodyLines);
  const lines = [
    `# NAME: ${name}`,
    `# UPDATE: ${updateTime}`,
    `# TOTAL: ${bodyLines.length}`,
  ];

  for (const [type, count] of typeCounts) {
    lines.push(`# ${type}: ${count}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function countRuleTypes(lines) {
  const counts = new Map();
  for (const line of lines) {
    const type = normalizeRuleHeaderType(line);
    if (!type) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const ordered = [];
  for (const type of RULE_TYPE_HEADER_ORDER) {
    const count = counts.get(type);
    if (count) ordered.push([type, count]);
    counts.delete(type);
  }

  const remaining = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  ordered.push(...remaining);
  return ordered;
}

function normalizeRuleHeaderType(line) {
  const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
  return type || null;
}

const RULE_TYPE_HEADER_ORDER = [
  "DOMAIN",
  "HOST",
  "DOMAIN-SUFFIX",
  "HOST-SUFFIX",
  "GEOSITE",
  "DOMAIN-KEYWORD",
  "HOST-KEYWORD",
  "DOMAIN-WILDCARD",
  "HOST-WILDCARD",
  "DOMAIN-REGEX",
  "URL-REGEX",
  "USER-AGENT",
  "DST-PORT",
  "DEST-PORT",
  "SRC-PORT",
  "NETWORK",
  "DSCP",
  "IP-CIDR",
  "IP-CIDR6",
  "IP6-CIDR",
  "IP-SUFFIX",
  "IP-ASN",
  "GEOIP",
  "SRC-GEOIP",
  "SRC-IP-CIDR",
  "SRC-IP-SUFFIX",
  "SRC-IP-ASN",
  "IN-PORT",
  "IN-TYPE",
  "IN-USER",
  "IN-NAME",
  "PROCESS-NAME",
  "PROCESS-NAME-WILDCARD",
  "PROCESS-NAME-REGEX",
  "PROCESS-PATH",
  "PROCESS-PATH-WILDCARD",
  "PROCESS-PATH-REGEX",
  "UID",
  "AND",
  "OR",
  "NOT",
  "SUB-RULE",
  "RULE-SET",
  "MATCH",
];

function formatUpdateTimeShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")} ${map.get("hour")}:${map.get("minute")}:${map.get("second")}`;
}
