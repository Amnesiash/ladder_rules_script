import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parseSourceFile, sanitizeName, toSafePathStem, sanitizePathSegment } from "./config.mjs";

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
    // 支持 [Extra/Apple] 这样的多级路径命名
    // sourceName 保持为 sanitize 后的扁平名称（用于标识符）
    // sourceRelativeDir 使用路径形式（用于输出目录结构）
    const sourceName = sanitizeName(section.name);
    const pathName = toSafePathStem(section.name);
    const sourceRelativeDir = sourceName;
    const firstUrl = section.urls[0];
    const files = [
      {
        name: pathName,
        type: "http",
        url: firstUrl,
        urls: [...section.urls],
        format: inferFormatFromUrl(firstUrl),
        behavior: "classical",
        sourceName,
        sourceRelativeDir,
      },
    ];

    configs.push({
      sourceName,
      sourceRelativeDir,
      pathName,
      configFiles: [],
      files,
    });
  }

  return configs;
}

// ==================== 缓存同步清理 ====================

/**
 * 从 URL 推导出预期的缓存文件名
 * 例如: https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list
 *       -> ProxyMedia@ACL4SSR.list
 * 
 * 只过滤 Windows 非法文件名字符，保留 ! + 等合法字符
 * 例如: !CN.list -> !CN@xxx.list, Direct+.list -> Direct+@xxx.list
 */
export function deriveCacheFileNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    
    if (pathParts.length < 2) return null;
    
    // 提取文件名（最后一个部分）
    const fileName = pathParts[pathParts.length - 1];
    const dotIndex = fileName.lastIndexOf(".");
    const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const ext = dotIndex > 0 ? fileName.slice(dotIndex) : "";
    
    // 提取来源（GitHub 用户名/组织名，路径的第一个部分）
    const source = pathParts[0];
    
    // 只过滤 Windows 非法文件名字符，保留 ! + 等合法字符
    const sanitizedBaseName = sanitizePathSegment(baseName);
    const sanitizedSource = sanitizePathSegment(source);
    
    return `${sanitizedBaseName}@${sanitizedSource}${ext}`;
  } catch {
    return null;
  }
}

/**
 * 同步清理 source 缓存文件夹
 * 删除 rule_source.txt 中不再引用的缓存文件
 */
export async function syncSourceCache({ projectRoot, sourceRoot }) {
  const sourceTxtPath = path.join(projectRoot, "Rules", "rule_source.txt");
  const content = await safeReadFile(sourceTxtPath);
  if (!content) return { removed: [], errors: [] };

  const sections = parseSourceFile(content.toString("utf8"));
  
  // 构建预期的缓存文件映射: { sectionName: Set<fileName> }
  const expectedCacheFiles = new Map();
  
  for (const section of sections) {
    const sectionName = sanitizeName(section.name);
    const fileNames = new Set();
    
    for (const url of section.urls) {
      const cacheFileName = deriveCacheFileNameFromUrl(url);
      if (cacheFileName) {
        fileNames.add(cacheFileName);
      }
    }
    
    expectedCacheFiles.set(sectionName, fileNames);
  }
  
  const removed = [];
  const errors = [];
  
  // 扫描 source 目录 (Rules/source)
  try {
    const sourceEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
    
    for (const entry of sourceEntries) {
      if (!entry.isDirectory()) continue;
      
      const sectionName = entry.name;
      const sectionDir = path.join(sourceRoot, sectionName);
      const expectedFiles = expectedCacheFiles.get(sectionName);
      
      // 如果 rule_source.txt 中没有这个 section，删除整个目录
      if (!expectedFiles) {
        try {
          await fs.rm(sectionDir, { recursive: true, force: true });
          removed.push({ type: "directory", path: sectionDir });
        } catch (err) {
          errors.push({ path: sectionDir, error: err.message });
        }
        continue;
      }
      
      // 检查该 section 目录下的文件
      try {
        const files = await fs.readdir(sectionDir);
        
        for (const file of files) {
          if (!expectedFiles.has(file)) {
            const filePath = path.join(sectionDir, file);
            try {
              await fs.unlink(filePath);
              removed.push({ type: "file", path: filePath });
            } catch (err) {
              errors.push({ path: filePath, error: err.message });
            }
          }
        }
        
        // 如果目录为空，删除目录
        const remainingFiles = await fs.readdir(sectionDir);
        if (remainingFiles.length === 0) {
          await fs.rmdir(sectionDir);
          removed.push({ type: "empty-directory", path: sectionDir });
        }
      } catch (err) {
        if (err.code !== "ENOENT") {
          errors.push({ path: sectionDir, error: err.message });
        }
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      errors.push({ path: sourceRoot, error: err.message });
    }
  }
  
  return { removed, errors };
}

// ==================== 备份 source.txt ====================

// 兼容 ladder_rules_script 的 rule_source.txt 格式
// 当前实现为空操作，保持兼容性
export async function backupSourceTxtEntries({ projectRoot, sourceRoot }) {
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
