import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { loadAllSources, toSafePathStem } from "./config.mjs";
import { buildSortedRulesetForClash, ruleTypeAliasTarget } from "./rules.mjs";
import { fetchWithFallback, sourceConfigsFromSourceTxt, deriveCacheFileNameFromUrl, parseAuthorMarkedUrl, readPreviousMainFile, formatUpdateTimeShanghai, listFilesRecursively } from "./subscriptions.mjs";
import { installMihomo } from "./mihomo.mjs";
import { makeArtifact, writeArtifactManifest } from "./notifications.mjs";

const execFileAsync = promisify(execFile);

/**
 * 生成日志用的条目标签。
 * sourceName 与 name 在 sourceConfigsFromSourceTxt 中都是完整路径（如 Extra/Telegram），
 * 两者相同时只保留一项，避免出现 [Extra/Telegram/Extra/Telegram]。
 */
function formatEntryLabel({ sourceName, name } = {}) {
  const label = name ?? "";
  if (!sourceName || sourceName === label) return `[${label}]`;
  return `[${sourceName}/${label}]`;
}

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
  outputRoot = path.join(projectRoot, "Rules"),
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
  const skippedEntries = [];

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
          const entryArtifacts = await processEntry({ entry, outputRoot, fetchImpl, projectRoot, sourceRoot, warn });
          allArtifacts.push(...entryArtifacts);
        } catch (error) {
          const errorInfo = {
            name: entry.name,
            source: entry.sourceName || group.name,
            urls: entry.urls || [entry.url],
            error: error.message,
          };
          skippedEntries.push(errorInfo);
          warn(`⚠️  跳过 ${formatEntryLabel({ sourceName: errorInfo.source, name: errorInfo.name })}: ${errorInfo.error}`);
          if (errorInfo.urls.length > 0) {
            warn(`   URL: ${errorInfo.urls.join(", ")}`);
          }
        }
      }
    }
  }

  // 输出汇总报告
  if (skippedEntries.length > 0) {
    console.log(`\n📊 构建汇总:`);
    console.log(`   ✅ 成功生成: ${allArtifacts.length} 个规则文件`);
    console.log(`   ⚠️  跳过: ${skippedEntries.length} 个条目`);
    console.log(`\n跳过的详情:`);
    for (const item of skippedEntries) {
      console.log(`   - ${formatEntryLabel({ sourceName: item.source, name: item.name })}: ${item.error}`);
    }
    console.log("");
  }

  // 清理不再由 rule_source.txt 生成的旧输出文件
  const cleanupResult = await cleanupOrphanedOutputFiles({ outputRoot, artifacts: allArtifacts });
  if (cleanupResult.removed.length > 0) {
    console.log(`已清理 ${cleanupResult.removed.length} 个旧输出文件`);
    for (const item of cleanupResult.removed) {
      console.log(`  - ${path.relative(projectRoot, item)}`);
    }
  }

  // manifest 写入 release 目录
  const manifestDir = outputRoot;
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
 * 清理不再由当前 rule_source.txt 生成的旧输出文件
 * 保留本次构建生成的文件（在 release/ 下），删除其他 .list 文件
 * 跳过 custom/ 和 source/ 目录
 */
async function cleanupOrphanedOutputFiles({ outputRoot, artifacts }) {
  const removed = [];
  
  // macOS/Windows 的默认文件系统通常大小写不敏感，统一比较路径大小写，
  // 避免旧的 Advertising.list 与新生成的 advertising.list 被视为两个文件。
  const pathKey = (filePath) => {
    const resolved = path.resolve(filePath);
    return process.platform === "darwin" || process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };

  // 收集本次构建生成的所有 .list 文件路径
  const generatedFiles = new Set();
  for (const artifact of artifacts) {
    if (artifact.kind === "clash" && artifact.filePath) {
      generatedFiles.add(pathKey(artifact.filePath));
    }
    if (artifact.kind === "domain-mrs" || artifact.kind === "ipcidr-mrs") {
      generatedFiles.add(pathKey(artifact.filePath));
    }
  }
  
  // 扫描 outputRoot 的父目录（rules/），跳过 custom/ 和 source/
  try {
    const scanRoot = path.dirname(outputRoot);
    const allFiles = await listFilesRecursively(scanRoot);
    const skipDirs = [path.resolve(scanRoot, "custom"), path.resolve(scanRoot, "source")];
    
    for (const fullPath of allFiles) {
      if (!fullPath.endsWith(".list") && !fullPath.endsWith(".mrs")) continue;
      
      const resolvedPath = path.resolve(fullPath);
      
      // 跳过 custom/ 和 source/ 目录下的文件
      if (skipDirs.some((dir) => resolvedPath.startsWith(dir + path.sep) || resolvedPath === dir)) continue;
      
      // 如果文件不在本次生成的列表中，删除它
      if (!generatedFiles.has(pathKey(resolvedPath))) {
        try {
          await fs.unlink(resolvedPath);
          removed.push(resolvedPath);
        } catch (err) {
          console.warn(`清理文件失败: ${resolvedPath}: ${err.message}`);
        }
      }
    }
    
    // 清理空目录
    await removeEmptySubdirs(outputRoot);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`扫描输出目录失败: ${err.message}`);
    }
  }
  
  return { removed };
}

async function processEntry({ entry, outputRoot, fetchImpl, projectRoot, sourceRoot, warn }) {
  const content = await fetchEntryContent(entry, fetchImpl, { sourceRoot, sourceName: entry.sourceName, warn });
  const artifacts = [];

  const clashLines = buildSortedRulesetForClash(content.split(/\r?\n/), {
    onNormalize: ({ added, mergedCount, aliased, unsupportedRuleTypes }) => {
      const label = formatEntryLabel(entry);

      // 别家客户端的类型名被改写成 mihomo 认得的写法
      if (aliased?.size > 0) {
        const detail = [...aliased.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([from, count]) => `${from}→${ruleTypeAliasTarget(from) ?? "?"} ×${count}`)
          .join("，");
        warn(`🧭 ${label} 归一化非 mihomo 规则类型: ${detail}`);
      }

      // 别名表没覆盖到的类型：客户端会整条忽略，必须显式暴露
      if (unsupportedRuleTypes?.size > 0) {
        const detail = [...unsupportedRuleTypes.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([type, count]) => `${type} ×${count}`)
          .join("，");
        warn(`⚠️  ${label} 含 mihomo 不支持的规则类型（这些行会被客户端丢弃）: ${detail}`);
      }

      if (added.length > 0) {
        const preview = added.slice(0, 3).map((item) => item.to).join(" | ");
        const rest = added.length > 3 ? ` ... 其余 ${added.length - 3} 条` : "";
        warn(`ℹ️  ${label} 为 ${added.length} 条目标 IP 规则补充 no-resolve: ${preview}${rest}`);
      }
      if (mergedCount > 0) {
        warn(`ℹ️  ${label} 去重合并 ${mergedCount} 条重复规则`);
      }
    },
  });
  if (clashLines.length) {
    const rulesPath = await writeRulesFile({ outputRoot, entry, lines: clashLines, projectRoot });
    artifacts.push(makeArtifact({
      entry: { ...entry, name: toSafePathStem(entry.name).toLowerCase(), slug: toSafePathStem(entry.name).toLowerCase() },
      outputRoot,
      filePath: rulesPath,
      kind: "clash",
      label: `${toSafePathStem(entry.name).toLowerCase()} Rules`,
    }));
  }

  // MRS 只接受 domain/ipcidr 两种 behavior。按规则类型拆分后分别转换，
  // 避免把混合 classical 规则误标成单一 behavior，且让调用方可按需加载。
  const domainLines = selectMihomoMRSLines(clashLines, "domain");
  const ipLines = selectMihomoMRSLines(clashLines, "ipcidr");
  if (domainLines.length > 0 || ipLines.length > 0) {
    const mrsArtifacts = await writeMihomoMRSArtifacts({
      entry,
      outputRoot,
      projectRoot,
      domainLines,
      ipLines,
      warn,
    });
    artifacts.push(...mrsArtifacts);
  }

  return artifacts;
}

const MRS_DOMAIN_TYPES = new Set(["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-WILDCARD"]);
const MRS_IPCIDR_TYPES = new Set(["IP-CIDR", "IP-CIDR6", "IP-SUFFIX"]);

function selectMihomoMRSLines(lines, behavior) {
  const allowed = behavior === "domain" ? MRS_DOMAIN_TYPES : MRS_IPCIDR_TYPES;
  const selected = [];

  for (const line of lines) {
    const parts = String(line).split(",");
    const type = parts.shift()?.trim().toUpperCase();
    if (!allowed.has(type)) continue;
    const value = parts.shift()?.trim();
    if (!value) continue;
    selected.push(behavior === "domain" && type === "DOMAIN-SUFFIX" ? `+.${value}` : value);
  }

  return selected;
}

function normalizeMihomoMRSInputLine(line) {
  return String(line)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "no-resolve")
    .join(",");
}

async function writeMihomoMRSArtifacts({ entry, outputRoot, projectRoot, domainLines, ipLines, warn }) {
  const artifacts = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ladder-rules-mrs-"));

  try {
    const cacheRoot = path.join(projectRoot, ".tools", "mihomo-cache");
    const binaryPath = await installMihomo({ cacheRoot });
    for (const [behavior, lines] of [["domain", domainLines], ["ip", ipLines]]) {
      if (lines.length === 0) continue;
      const inputPath = path.join(tempDir, `${behavior}.txt`);
      const relativePath = `${toSafePathStem(entry.name).toLowerCase()}_${behavior}.mrs`;
      const outputPath = path.join(outputRoot, relativePath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const mrsInputLines = lines.map(normalizeMihomoMRSInputLine).filter(Boolean);
      if (mrsInputLines.length === 0) continue;
      await fs.writeFile(inputPath, `${mrsInputLines.join("\n")}\n`);
      await execFileAsync(binaryPath, ["convert-ruleset", behavior === "domain" ? "domain" : "ipcidr", "text", inputPath, outputPath]);
      artifacts.push(makeArtifact({
        entry: {
          ...entry,
          name: `${toSafePathStem(entry.name).toLowerCase()}_${behavior}`,
          slug: `${toSafePathStem(entry.name).toLowerCase()}_${behavior}`,
          behavior: behavior === "domain" ? "domain" : "ipcidr",
        },
        outputRoot,
        filePath: outputPath,
        kind: behavior === "domain" ? "domain-mrs" : "ipcidr-mrs",
        label: `${entry.name}_${behavior}.mrs`,
      }));
    }
  } catch (error) {
    warn(`⚠️  ${formatEntryLabel(entry)} MRS 转换失败: ${error.message}`);
    for (const artifact of artifacts) await fs.rm(artifact.filePath, { force: true });
    return [];
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  return artifacts;
}


async function fetchEntryContent(entry, fetchImpl, { sourceRoot, sourceName, warn } = {}) {
  const logWarn = warn || ((msg) => console.warn(msg));
  if (Array.isArray(entry.urls) && entry.urls.length > 0) {
    const parts = [];
    for (const url of entry.urls) {
      const markedUrl = parseAuthorMarkedUrl(url).url;
      try {
        if (entry.type === "http") {
          const content = await fetchUrlContent(markedUrl, fetchImpl);
          parts.push(content);
          await saveToCache({ url, content, sourceRoot, sourceName });
        } else if (entry.type === "file") {
          parts.push(await fs.readFile(markedUrl, "utf8"));
        } else if (entry.type === "inline") {
          parts.push(String(markedUrl));
        } else {
          throw new BuildReleaseError(`unsupported entry type: ${entry.type}`, { entryName: entry.name });
        }
      } catch (error) {
        logWarn(`Warning: Failed to fetch ${url}: ${error.message}`);
      }
    }
    if (parts.length === 0) {
      throw new BuildReleaseError(`All URLs failed for entry ${entry.name}`, { entryName: entry.name });
    }
    return parts.join("\n");
  }

  if (entry.type === "http") {
    const markedUrl = parseAuthorMarkedUrl(entry.url);
    const content = await fetchUrlContent(markedUrl.url, fetchImpl);
    await saveToCache({ url: entry.url, content, sourceRoot, sourceName });
    return content;
  }
  if (entry.type === "file") {
    return await fs.readFile(parseAuthorMarkedUrl(entry.url).url, "utf8");
  }
  if (entry.type === "inline") {
    return parseAuthorMarkedUrl(entry.url).url;
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
  // 支持 [Extra/Apple] 多级路径: entry.name 可能是 "Extra/Apple"
  const name = toSafePathStem(entry.name).toLowerCase();
  const outPath = path.join(outputRoot, `${name}.list`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  // 规则体未变化时，复用上次 main 分支的文件（含旧时间戳），
  // 避免仅 header 时间不同导致 sha256 变化和误报通知
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
  // 从深到浅删除空目录
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

export function buildHeaderBlock({ name, updateTime, bodyLines }) {
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

// header 里类型行的展示顺序。
// 只列可能出现在产物里的类型 —— 别家客户端的写法（HOST*、IP6-CIDR、DEST-PORT）
// 已在 normalizeRuleTypeAlias 阶段改写，URL-REGEX / USER-AGENT 已被剔除，
// 都不会进到 body，因此不在此表。表外类型会按字母序追加到末尾。
const RULE_TYPE_HEADER_ORDER = [
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "GEOSITE",
  "DOMAIN-KEYWORD",
  "DOMAIN-WILDCARD",
  "DOMAIN-REGEX",
  "DST-PORT",
  "SRC-PORT",
  "NETWORK",
  "DSCP",
  "IP-CIDR",
  "IP-CIDR6",
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
  "UID",
  "REMATCH-NAME",
  "PROCESS-NAME",
  "PROCESS-NAME-WILDCARD",
  "PROCESS-NAME-REGEX",
  "PROCESS-PATH",
  "PROCESS-PATH-WILDCARD",
  "PROCESS-PATH-REGEX",
  "AND",
  "OR",
  "NOT",
  "SUB-RULE",
  "RULE-SET",
  "MATCH",
];
