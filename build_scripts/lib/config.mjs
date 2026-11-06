import fs from "node:fs/promises";
import path from "node:path";

export class SourceConfigError extends Error {
  constructor(message, context = {}) {
    const location = [context.sourceName, context.entryName].filter(Boolean).join(":");
    super(location ? `${location}: ${message}` : message);
    this.name = "SourceConfigError";
    this.context = context;
  }
}

export function sanitizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ==================== 源文件解析（兼容 rule_source.txt 格式）====================

/**
 * 解析段标题行尾的指令，写法：[段名]!skip mrs
 *   !skip mrs   该段不生成任何 MRS 产物（mrs/domain 与 mrs/ip 都跳过）
 * classical 的 <stem>.list 始终生成，不受指令影响。
 */
const SECTION_HEADER_RE = /^\[(.+?)\]\s*(!.*)$/;
const SECTION_PLAIN_RE = /^\[(.+)\]$/;

function applyDirective(rest, section, warnings) {
  const text = String(rest).trim();
  if (/^!skip\s+mrs$/i.test(text)) {
    section.skipMrs = true;
    return;
  }
  warnings.push(`未知指令 "${text}"（段 ${section.name}），已忽略`);
}

export function parseSourceFile(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  const warnings = [];
  let current;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withDirective = line.match(SECTION_HEADER_RE);
    if (withDirective) {
      current = { name: withDirective[1].trim(), urls: [], skipMrs: false };
      sections.push(current);
      applyDirective(withDirective[2], current, warnings);
      continue;
    }

    const sectionMatch = line.match(SECTION_PLAIN_RE);
    if (sectionMatch) {
      current = { name: sectionMatch[1].trim(), urls: [], skipMrs: false };
      sections.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith("!")) {
      warnings.push(`指令 "${line}"（段 ${current.name}）须写在段标题行尾，如 [${current.name}]!skip mrs，已忽略`);
      continue;
    }

    current.urls.push(line);
  }

  const kept = sections.filter((s) => s.name.length && s.urls.length);
  if (warnings.length) Object.defineProperty(kept, "warnings", { value: warnings, enumerable: false });
  return kept;
}

/**
 * 将带有 / 的名称转换为安全的路径片段。
 * 只过滤文件名中的非法字符（Windows 保留字符和控制字符），保留 ! + 等合法字符。
 * 例如: "Extra/Apple" -> "Extra/Apple", "Extra/Streaming/!CN" -> "Extra/Streaming/!CN"
 * 支持多级目录结构。
 */
export function toSafePathStem(name) {
  return String(name ?? "")
    .trim()
    .split("/")
    .map((part) => sanitizePathSegment(part))
    .filter(Boolean)
    .join("/");
}

/**
 * 清理路径片段中的非法文件名字符。
 * Windows 保留字符: < > : " | ? * 以及控制字符（含 \x00-\x1f）
 * 注意: / 和 \ 已在 split("/") 时被处理，不会出现在片段中
 */
export function sanitizePathSegment(part) {
  return part
    .replace(/[<>:"|?*\x00-\x1f]+/g, "_")
    .trim();
}

// ==================== 源目录发现 ====================

async function discoverSourceConfigPaths(sourceDir) {
  const configFiles = [];
  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name === "source.yaml" || entry.name === "source.json")) {
        configFiles.push(path.join(sourceDir, entry.name));
      }
    }
  } catch {
    // ignore
  }
  return configFiles;
}

export async function discoverSourceDirs(sourceRoot) {
  let entries;
  try {
    entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceDir = path.join(sourceRoot, entry.name);
    const configPaths = await discoverSourceConfigPaths(sourceDir);
    if (configPaths.length > 0) dirs.push(sourceDir);
  }
  return dirs.sort();
}

export async function loadAllSources({ projectRoot, sourceRoot }) {
  const dirs = await discoverSourceDirs(sourceRoot);
  const configs = [];
  for (const sourceDir of dirs) {
    const configPaths = await discoverSourceConfigPaths(sourceDir);
    configs.push(await loadSourceConfig({ projectRoot, sourceRoot, sourceDir, configPaths }));
  }
  return configs;
}

export async function loadSourceConfig({ projectRoot, sourceRoot, sourceDir, configPaths }) {
  const sourceName = path.basename(sourceDir);
  const sourceRelativeDir = path.relative(sourceRoot, sourceDir).split(path.sep).join("/");
  const resolvedConfigPaths = configPaths ?? [path.join(sourceDir, "source.yaml")];
  const configFiles = [];
  const files = [];

  for (const sourceYamlPath of resolvedConfigPaths) {
    const configFileName = path.basename(sourceYamlPath);
    const sourceConfigRelativePath = path.relative(projectRoot, sourceYamlPath).split(path.sep).join("/");
    const raw = await fs.readFile(sourceYamlPath, "utf8");
    let parsed;
    try {
      parsed = simpleYamlParse(raw);
    } catch (error) {
      throw new SourceConfigError(`${configFileName}: invalid YAML: ${error.message}`, {
        sourceName,
      });
    }

    const entries = sourceEntriesFromConfig(parsed);
    if (!entries) {
      throw new SourceConfigError(`${configFileName} must contain a source entry array`, {
        sourceName,
      });
    }

    configFiles.push({
      fileName: configFileName,
      relativePath: path.relative(projectRoot, sourceYamlPath).split(path.sep).join("/"),
    });

    files.push(
      ...entries.map((entry, index) =>
        normalizeEntry({
          entry,
          index: files.length + index,
          projectRoot,
          sourceDir,
          sourceName,
        })
      )
    );
  }

  return {
    sourceName,
    sourceRelativeDir,
    configFiles,
    files,
  };
}

function sourceEntriesFromConfig(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.source)) return parsed.source;
  if (Array.isArray(parsed.entries)) return parsed.entries;
  return null;
}

function normalizeEntry({ entry, index, projectRoot, sourceDir, sourceName }) {
  const entryName = entry.name || entry.slug || `entry-${index}`;
  const type = entry.type || "http";
  const url = entry.url;
  const format = entry.format || inferFormatFromUrl(url);
  const behavior = entry.behavior || "classical";

  if (!VALID_TYPES.has(type)) {
    throw new SourceConfigError(`invalid type: ${type}`, { sourceName, entryName });
  }
  if (!VALID_FORMATS.has(format)) {
    throw new SourceConfigError(`invalid format: ${format}`, { sourceName, entryName });
  }
  if (!VALID_BEHAVIORS.has(behavior)) {
    throw new SourceConfigError(`invalid behavior: ${behavior}`, { sourceName, entryName });
  }

  return {
    name: sanitizeName(entryName),
    type,
    url,
    format,
    behavior,
    sourceName,
    sourceDir,
  };
}

const VALID_TYPES = new Set(["http", "file", "inline"]);
const VALID_FORMATS = new Set(["yaml", "text", "mrs"]);
const VALID_BEHAVIORS = new Set(["domain", "ipcidr", "classical"]);

function inferFormatFromUrl(url) {
  const lowered = String(url ?? "").toLowerCase();
  if (lowered.endsWith(".yaml") || lowered.endsWith(".yml")) return "yaml";
  return "text";
}

// ==================== 简单 YAML 解析器 ====================

function simpleYamlParse(text) {
  const lines = text.split(/\r?\n/);
  const result = {};
  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ")) {
      if (currentArray) {
        const value = trimmed.slice(2).trim();
        currentArray.push(simpleYamlValue(value));
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value) {
        result[key] = simpleYamlValue(value);
        currentKey = null;
        currentArray = null;
      } else {
        currentKey = key;
        currentArray = [];
        result[key] = currentArray;
      }
    }
  }

  return result;
}

function simpleYamlValue(value) {
  if (!value) return value;
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
