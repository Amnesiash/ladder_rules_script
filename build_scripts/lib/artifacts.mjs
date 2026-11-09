import fs from "node:fs/promises";
import path from "node:path";
import { loadAllSources, toSafePathStem } from "./config.mjs";
import { buildSortedRulesetForClash, ruleTypeAliasTarget } from "./rules.mjs";
import { fetchWithFallback, sourceConfigsFromSourceTxt, deriveCacheFileNameFromUrl, parseAuthorMarkedUrl, readPreviousMainFile, formatUpdateTimeShanghai, listFilesRecursively } from "./subscriptions.mjs";
import { makeArtifact, writeArtifactManifest } from "./notifications.mjs";
import { OUTPUT_FORMATS, renderFormat } from "./formats.mjs";

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

  // 清理不再由 rule_source.txt 生成的旧输出文件（只在三个客户端目录内）
  const cleanupResult = await cleanupOrphanedOutputFiles({ outputRoot, artifacts: allArtifacts });
  if (cleanupResult.removed.length > 0) {
    console.log(`已清理 ${cleanupResult.removed.length} 个旧输出文件`);
    for (const item of cleanupResult.removed) {
      console.log(`  - ${path.relative(projectRoot, item)}`);
    }
  }

  // manifest 写入 rules/ 根目录（三个客户端目录之外）
  const manifestDir = outputRoot;
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = await writeArtifactManifest({ outputRoot: manifestDir, artifacts: allArtifacts });
  allArtifacts.push(
    makeArtifact({
      entry: { slug: "artifacts-manifest", name: "artifacts-manifest", sourceRelativeDir: "" },
      outputRoot: manifestDir,
      filePath: manifestPath,
      kind: "manifest",
      label: "artifact manifest",
    }),
  );

  return { outputRoot, artifacts: allArtifacts, sourceConfigs, cleanup: cleanupResult };
}

/**
 * 清理三个客户端目录（mihomo/ quantumultx/ loon/）里不再由当前 rule_source.txt 生成的文件。
 * 只在这三个目录内部递归扫描，绝不触碰 rules/custom、rules/source、rules/update-log 等目录。
 * 生成清单由本次 processEntry 登记的 artifact 提供，三套格式一律纳入，不会被当孤儿删除。
 */
async function cleanupOrphanedOutputFiles({ outputRoot, artifacts }) {
  const removed = [];

  const pathKey = (filePath) => {
    const resolved = path.resolve(filePath);
    return process.platform === "darwin" || process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };

  const generatedFiles = new Set();
  for (const artifact of artifacts) {
    if (artifact.filePath) generatedFiles.add(pathKey(artifact.filePath));
  }

  const managedExts = new Set([".list", ".yaml", ".yml", ".mrs", ".txt"]);

  for (const fmt of OUTPUT_FORMATS) {
    const clientDir = path.join(outputRoot, fmt.dir);
    let allFiles;
    try {
      allFiles = await listFilesRecursively(clientDir);
    } catch (err) {
      if (err.code !== "ENOENT") console.warn(`扫描输出目录失败: ${clientDir}: ${err.message}`);
      continue;
    }
    for (const fullPath of allFiles) {
      if (!managedExts.has(path.extname(fullPath).toLowerCase())) continue;
      if (generatedFiles.has(pathKey(fullPath))) continue;
      try {
        await fs.unlink(fullPath);
        removed.push(fullPath);
      } catch (err) {
        console.warn(`清理文件失败: ${fullPath}: ${err.message}`);
      }
    }
  }

  // 清理客户端目录内遗留的空子目录（例如旧版 extra/）
  for (const fmt of OUTPUT_FORMATS) {
    await removeEmptySubdirs(path.join(outputRoot, fmt.dir));
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

  if (clashLines.length === 0) return artifacts;

  // 三套产物共用同一份归一化规则与同一个更新时间戳
  const updateTime = formatUpdateTimeShanghai();
  const stem = toSafePathStem(entry.name).toLowerCase();

  for (const fmt of OUTPUT_FORMATS) {
    const body = renderFormat(fmt.key, { name: entry.name, lines: clashLines, updateTime });
    const outPath = path.join(outputRoot, fmt.dir, `${stem}.${fmt.ext}`);
    await writeFormatFile({ outPath, body, projectRoot });
    artifacts.push(makeArtifact({
      entry: { ...entry, name: stem, slug: stem },
      outputRoot,
      filePath: outPath,
      kind: fmt.kind,
      label: `${stem} ${fmt.key}`,
    }));
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

/**
 * 写入单个客户端产物文件。stem 已保证不含路径分隔符，产物一律落在客户端目录的一级。
 * 规则体未变化时复用上次 main 分支的文件（含旧时间戳），避免仅 header 时间不同
 * 导致 sha256 变化和误报通知。
 */
async function writeFormatFile({ outPath, body, projectRoot }) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const relativePath = path.relative(projectRoot, outPath).split(path.sep).join("/");
  const previousContent = await readPreviousMainFile(relativePath, projectRoot);
  if (previousContent !== null) {
    const previousBody = extractBodyLines(previousContent);
    const newBody = extractBodyLines(body);
    if (previousBody === newBody) {
      await fs.writeFile(outPath, previousContent);
      return outPath;
    }
  }

  await fs.writeFile(outPath, body);
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
