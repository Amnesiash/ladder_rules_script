import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parseSourceFile, sanitizeName } from "./config.mjs";

const execFileAsync = promisify(execFile);

// ==================== 文件读取 ====================

async function safeReadFile(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

// ==================== 目录操作 ====================

async function listFilesRecursively(rootDir) {
  const result = [];
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

async function removeEmptyDirs(rootDir) {
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
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
    }
    dirs.push(current);
  }
  dirs.sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    if (dir === rootDir) continue;
    try {
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0) await fs.rmdir(dir);
    } catch {
      // ignore
    }
  }
}

// ==================== 网络请求 ====================

function proxyCandidatesForUrl(url) {
  if (!/^https?:\/\//iu.test(url)) return [];
  const candidates = [];
  if (/^https:\/\/raw\.githubusercontent\.com\//iu.test(url) || /^https:\/\/github\.com\//iu.test(url)) {
    candidates.push(`https://ghproxy.com/${url}`);
    candidates.push(`https://ghp.ci/${url}`);
  }
  return candidates;
}

async function fetchViaCurl(url, options = {}) {
  const curlArgs = ["-L", "--silent", "--show-error", "--max-time", String(options.timeout ?? 60), "-w", "\n%{http_code}", url];
  const { stdout } = await execFileAsync("curl", curlArgs, { maxBuffer: 1024 * 1024 * 20 });
  const output = String(stdout ?? "");
  const lastNewline = output.lastIndexOf("\n");
  const statusText = lastNewline === -1 ? output.trim() : output.slice(lastNewline + 1).trim();
  const body = lastNewline === -1 ? "" : output.slice(0, lastNewline);
  const status = Number(statusText);

  return {
    ok: Number.isFinite(status) && status >= 200 && status < 300,
    status: Number.isFinite(status) ? status : 0,
    text: async () => body,
  };
}

export async function fetchWithFallback(url, options = {}, fetchImpl = fetch) {
  const candidates = [url, ...proxyCandidatesForUrl(url)];
  let lastError;

  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate, options);
      if (response?.ok) return response;
      lastError = new Error(`HTTP ${response?.status ?? "unknown"}`);
    } catch (error) {
      lastError = error;
    }

    try {
      const response = await fetchViaCurl(candidate, options);
      if (response?.ok) return response;
      lastError = new Error(`HTTP ${response?.status ?? "unknown"}`);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError?.message ? `: ${lastError.message}` : "";
  throw new Error(`Unable to connect. Is the computer able to access the url?${message}`);
}

// ==================== 源配置解析 ====================

export async function sourceConfigsFromSourceTxt({ projectRoot, sourceRoot }) {
  const sourceTxtPath = path.join(projectRoot, "Rules", "rule_source.txt");
  const content = await safeReadFile(sourceTxtPath);
  if (!content) return [];

  const sections = parseSourceFile(content.toString("utf8"));
  const configs = [];

  for (const section of sections) {
    const sourceName = sanitizeName(section.name);
    const sourceRelativeDir = sourceName;
    const firstUrl = section.urls[0];
    const files = [
      {
        name: sourceName,
        type: "http",
        url: firstUrl,
        urls: [...section.urls],
        format: inferFormatFromUrl(firstUrl),
        behavior: "classical",
        sourceName,
        sourceRelativeDir: sourceName,
      },
    ];

    configs.push({
      sourceName,
      sourceRelativeDir,
      configFiles: [],
      files,
    });
  }

  return configs;
}

// ==================== 备份 source.txt ====================

export async function backupSourceTxtEntries({ projectRoot, sourceRoot }) {
  // 兼容 ladder_rules_script 的 rule_source.txt 格式
  // 当前实现为空操作，保持兼容性
  return [];
}

function inferFormatFromUrl(url) {
  const lowered = String(url ?? "").toLowerCase();
  if (lowered.endsWith(".yaml") || lowered.endsWith(".yml")) return "yaml";
  return "text";
}

// ==================== 导出 ====================

export {
  safeReadFile,
  listFilesRecursively,
  removeEmptyDirs,
};
