import fs from "node:fs/promises";
import path from "node:path";
import { loadAllSources, toSafeFileStem } from "./config.mjs";
import { renderReleaseReadme } from "./links.mjs";
import { buildSortedRulesetForClash, buildSortedRulesetForLoon, buildSortedRulesetForShadowrocket, buildSortedRulesetForQuantumultX } from "./rules.mjs";
import { fetchWithFallback, sourceConfigsFromSourceTxt } from "./subscriptions.mjs";
import { makeArtifact, writeArtifactManifest } from "./notifications.mjs";

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
  sourceRoot = path.join(projectRoot, "source"),
  outputRoot = path.join(projectRoot, ".release"),
  workRoot = path.join(projectRoot, ".release-work"),
  repository = process.env.GITHUB_REPOSITORY,
  mainBranch = "main",
  releaseBranch = "release",
  fetchImpl = fetch,
  warn = (message) => console.warn(message),
} = {}) {
  // 解析路径
  projectRoot = path.resolve(projectRoot);
  sourceRoot = path.resolve(sourceRoot);
  outputRoot = path.resolve(outputRoot);
  workRoot = path.resolve(workRoot);

  // 清理并创建目录
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.rm(workRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(workRoot, { recursive: true });

  // 加载源配置
  const sourceTxtConfigs = await sourceConfigsFromSourceTxt({ projectRoot, sourceRoot });
  const sourceConfigs = sourceTxtConfigs.length > 0 ? sourceTxtConfigs : await loadAllSources({ projectRoot, sourceRoot });
  
  const allArtifacts = [];

  // 处理每个源配置
  for (const sourceConfig of sourceConfigs) {
    const dirArtifacts = [];
    
    // 按名称分组处理
    const groups = new Map();
    for (const file of sourceConfig.files) {
      const key = file.name || file.slug;
      if (!groups.has(key)) groups.set(key, { name: key, entries: [], sourceConfig });
      groups.get(key).entries.push(file);
    }

    for (const group of groups.values()) {
      for (const entry of group.entries) {
        try {
          const entryArtifacts = await processEntry({
            entry,
            outputRoot,
            workRoot,
            fetchImpl,
            warn,
          });
          dirArtifacts.push(...entryArtifacts);
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

    // 生成 README
    if (dirArtifacts.length > 0) {
      const readme = renderReleaseReadme({
        sourceConfig,
        artifacts: allArtifacts,
        repository,
        mainBranch,
        releaseBranch,
      });
      const readmePath = path.join(outputRoot, sourceConfig.sourceRelativeDir, "README.md");
      await fs.mkdir(path.dirname(readmePath), { recursive: true });
      await fs.writeFile(readmePath, readme);
      
      const readmeArtifact = makeArtifact({
        entry: { slug: "README", name: "README", sourceRelativeDir: sourceConfig.sourceRelativeDir },
        outputRoot,
        filePath: readmePath,
        kind: "readme",
        label: `${sourceConfig.sourceName} README`,
      });
      dirArtifacts.push(readmeArtifact);
      allArtifacts.push(readmeArtifact);
    }
  }

  // 写入 manifest
  const manifestPath = await writeArtifactManifest({ outputRoot, artifacts: allArtifacts });
  allArtifacts.push(
    makeArtifact({
      entry: { slug: "artifacts-manifest", name: "artifacts-manifest", sourceRelativeDir: "" },
      outputRoot,
      filePath: manifestPath,
      kind: "manifest",
      label: "release artifact manifest",
    }),
  );

  return { outputRoot, artifacts: allArtifacts, sourceConfigs };
}

async function processEntry({ entry, outputRoot, workRoot, fetchImpl, warn }) {
  // 获取规则内容
  const content = await fetchEntryContent(entry, fetchImpl);

  const artifacts = [];

  // Clash 格式 (排序后的 text)
  const clashLines = buildSortedRulesetForClash(content.split(/\r?\n/));
  if (clashLines.length) {
    const clashPath = await writeRulesFile({
      outputRoot,
      entry,
      kind: "clash",
      suffix: ".txt",
      lines: clashLines,
    });
    artifacts.push(makeArtifact({ entry, outputRoot, filePath: clashPath, kind: "clash", label: `${entry.name} Clash` }));
  }

  // Loon 格式
  const loonLines = buildSortedRulesetForLoon(content.split(/\r?\n/));
  if (loonLines.length) {
    const loonPath = await writeRulesFile({ outputRoot, entry, kind: "loon", suffix: ".list", lines: loonLines });
    artifacts.push(makeArtifact({ entry, outputRoot, filePath: loonPath, kind: "loon", label: `${entry.name} Loon` }));
  }

  // Shadowrocket 格式
  const srLines = buildSortedRulesetForShadowrocket(content.split(/\r?\n/));
  if (srLines.length) {
    const srPath = await writeRulesFile({ outputRoot, entry, kind: "shadowrocket", suffix: ".list", lines: srLines });
    artifacts.push(makeArtifact({ entry, outputRoot, filePath: srPath, kind: "shadowrocket", label: `${entry.name} Shadowrocket` }));
  }

  // QuantumultX 格式
  const qxLines = buildSortedRulesetForQuantumultX(content.split(/\r?\n/));
  if (qxLines.length) {
    const qxPath = await writeRulesFile({
      outputRoot,
      entry,
      kind: "quantumultx",
      suffix: ".list",
      lines: qxLines,
      policyName: toSafeFileStem(entry.name),
    });
    artifacts.push(makeArtifact({ entry, outputRoot, filePath: qxPath, kind: "quantumultx", label: `${entry.name} QuantumultX` }));
  }

  return artifacts;
}

async function fetchEntryContent(entry, fetchImpl) {
  if (Array.isArray(entry.urls) && entry.urls.length > 0) {
    const parts = [];
    for (const url of entry.urls) {
      if (entry.type === "http") {
        const res = await fetchWithFallback(url, {}, fetchImpl);
        parts.push(await res.text());
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
    const res = await fetchWithFallback(entry.url, {}, fetchImpl);
    return await res.text();
  }
  if (entry.type === "file") {
    return await fs.readFile(entry.url, "utf8");
  }
  if (entry.type === "inline") {
    return entry.url;
  }
  throw new BuildReleaseError(`unsupported entry type: ${entry.type}`, { entryName: entry.name });
}

async function writeRulesFile({ outputRoot, entry, kind, suffix, lines, policyName, includeHeader = true }) {
  const name = toSafeFileStem(entry.name);
  const outPath = path.join(outputRoot, kindFolderName(kind), `${name}${suffix}`);
  const updateTime = formatUpdateTimeShanghai();
  const bodyLines = policyName ? lines.map((line) => `${line},${policyName}`) : lines;
  const header = includeHeader ? buildHeaderBlock({ name: entry.name, updateTime, bodyLines }) : "";

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, header + bodyLines.join("\n") + "\n");
  return outPath;
}

function kindFolderName(kind) {
  switch (kind) {
    case "clash":
      return "Clash";
    case "loon":
      return "Loon";
    case "shadowrocket":
      return "Shadowrocket";
    case "quantumultx":
      return "QuantumultX";
    default:
      return kind;
  }
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
