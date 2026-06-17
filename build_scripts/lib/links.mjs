const DEFAULT_MAIN_BRANCH = "main";
const DEFAULT_RELEASE_BRANCH = "main";

export class LinkGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LinkGenerationError";
  }
}

export function resolveRepository(repository = process.env.GITHUB_REPOSITORY) {
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new LinkGenerationError("GitHub repository must be provided as owner/repo");
  }
  return repository;
}

export function githubBlobURL({ repository, branch, filePath }) {
  return `https://github.com/${resolveRepository(repository)}/blob/${branch}/${encodePath(filePath)}`;
}

export function githubRawURL({ repository, branch, filePath }) {
  return `https://raw.githubusercontent.com/${resolveRepository(repository)}/${branch}/${encodePath(filePath)}`;
}

function encodePath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

export function renderReleaseReadme({
  sourceConfig,
  artifacts,
  repository,
  mainBranch = DEFAULT_MAIN_BRANCH,
  releaseBranch = DEFAULT_RELEASE_BRANCH,
}) {
  const repo = resolveRepository(repository);
  const relevantArtifacts = artifacts.filter(
    (artifact) => artifact.sourceRelativeDir === sourceConfig.sourceRelativeDir,
  );

  const sections = [
    `# ${sourceConfig.sourceName}`,
    "",
    renderSourceConfigLinks({ sourceConfig, repository: repo, mainBranch }),
    "",
    "## 订阅列表",
    "",
    renderSourceTable({
      files: sourceConfig.files,
      repository: repo,
      mainBranch,
    }),
    "",
    "## Mihomo 用法（复制粘贴）",
    "",
    renderMihomoConfig({
      artifacts: relevantArtifacts,
      repository: repo,
      releaseBranch,
    }),
    "",
    "## 产物文件",
    "",
    renderArtifacts({
      artifacts: relevantArtifacts,
      repository: repo,
      releaseBranch,
    }),
    "",
  ];

  return sections.join("\n");
}

export function renderRulesReadme({
  sourceConfigs = [],
  artifacts = [],
  repository,
  releaseBranch = DEFAULT_RELEASE_BRANCH,
  updateTimes = {},
}) {
  const repo = resolveRepository(repository);
  const providerArtifacts = artifacts.filter((artifact) => artifact.kind && artifact.kind !== "manifest");

  // 分离一级规则集（常用）和带层级的规则集（其他）
  const sortedConfigs = sortRulesSourceConfigs(sourceConfigs);
  const topLevelConfigs = sortedConfigs.filter((c) => !c.pathName || !c.pathName.includes("/"));
  const nestedConfigs = sortedConfigs.filter((c) => c.pathName && c.pathName.includes("/"));

  const rows = renderRulesRows({
    sourceConfigs: topLevelConfigs,
    artifacts: providerArtifacts,
    repository: repo,
    releaseBranch,
    updateTimes,
  });

  const otherSection = renderOtherRulesets({
    sourceConfigs: nestedConfigs,
    artifacts: providerArtifacts,
    repository: repo,
    releaseBranch,
    updateTimes,
  });

  const parts = [
    "# 规则",
    "",
    "本目录自动生成规则文件仓库，包含各类代理软件使用的规则集合。",
    "",
    "---",
    "",
    "## 常用规则集",
    "",
    "| 文件名 | 包含内容 | 用途 | 最近更新 |",
    "| --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - |",
    "",
  ];

  if (otherSection) {
    parts.push("## 其他规则集", "", otherSection, "");
  }

  parts.push(
    "## 使用示例",
    "",
    "### Clash 使用示例",
    "",
    renderRulesClashExample({ sourceConfigs: sortedConfigs, repository: repo, releaseBranch }),
    "",
    "### QX 使用示例",
    "",
    renderRulesQxExample(),
    "",
  );

  return parts.join("\n");
}

function sortRulesSourceConfigs(sourceConfigs) {
  const order = new Map(RULE_SOURCE_ORDER.map((name, index) => [name, index]));
  return [...sourceConfigs].sort((left, right) => {
    const leftIndex = order.has(left.sourceName) ? order.get(left.sourceName) : Number.POSITIVE_INFINITY;
    const rightIndex = order.has(right.sourceName) ? order.get(right.sourceName) : Number.POSITIVE_INFINITY;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return String(left.sourceName).localeCompare(String(right.sourceName));
  });
}

function renderSourceConfigLinks({ sourceConfig, repository, mainBranch }) {
  const configFiles = sourceConfig.configFiles?.length
    ? sourceConfig.configFiles
    : [{ fileName: "source.yaml", relativePath: `source/${sourceConfig.sourceRelativeDir}/source.yaml` }];
  const links = configFiles.map(
    (configFile) => `[${configFile.fileName}](${githubBlobURL({ repository, branch: mainBranch, filePath: configFile.relativePath })})`,
  );
  return `配置文件：${links.join("、")}`;
}

function renderRulesClashExample({ sourceConfigs, repository, releaseBranch }) {
  if (!sourceConfigs.length) return "_暂无可用配置示例_";

  const lines = [
    "```yaml",
    "c: &RuleSet_c {type: http, behavior: classical, format: text, interval: 86400}",
    "",
    "rule-providers:",
    "  # 规则集",
  ];

  for (const sourceConfig of sourceConfigs) {
    const filePathName = sourceConfig.pathName || sourceConfig.sourceName;
    const rawUrl = githubRawURL({
      repository,
      branch: releaseBranch,
      filePath: `rules/release/${filePathName}.list`,
    });
    lines.push(`  ${sourceConfig.sourceName}: {<<: *RuleSet_c, url: ${rawUrl}}`);
  }

  lines.push("");
  lines.push("rules:");
  lines.push("  # 订阅规则");
  for (const sourceConfig of sourceConfigs) {
    const policy = RULE_POLICY_BY_SOURCE_NAME[sourceConfig.sourceName] || "DIRECT";
    lines.push(`  - RULE-SET,${sourceConfig.sourceName},${policy}`);
  }
  lines.push("  - GEOIP,CN,DIRECT");
  lines.push("");
  lines.push("  # 兜底规则");
  lines.push("  - MATCH,漏网之鱼");
  lines.push("```");
  return lines.join("\n");
}

function renderRulesQxExample() {
  return [
    "```ini",
    "[general]",
    "# 资源解析器，自定义各类远程资源的转换，如节点，规则 filter，重写 rewrite 等，url 地址可远程，可task_local本地/iCloud(Quantumult X/Scripts目录)",
    "resource_parser_url=https://raw.githubusercontent.com/KOP-XIAO/QuantumultX/master/Scripts/resource-parser.js",
    "",
    "[filter_remote]",
    "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true",
    "```",
  ].join("\n");
}

function renderSourceTable({ files, repository, mainBranch }) {
  if (!files?.length) return "_暂无订阅_";
  const rows = files.map((file) => {
    const name = file.name || file.slug;
    const blobUrl = file.url ? githubBlobURL({ repository, branch: mainBranch, filePath: file.url }) : null;
    return blobUrl ? `| ${name} | [${blobUrl}](${blobUrl}) |` : `| ${name} | - |`;
  });
  return ["| 名称 | 链接 |", "| --- | --- |", ...rows].join("\n");
}

function renderMihomoConfig({ artifacts, repository, releaseBranch }) {
  const mrsArtifacts = artifacts.filter((a) => a.kind?.includes("mrs"));
  const yamlArtifacts = artifacts.filter((a) => a.kind?.includes("yaml"));

  if (!mrsArtifacts.length && !yamlArtifacts.length) return "_暂无可用产物_";

  const lines = ["```yaml", "rule-providers:"];

  for (const artifact of mrsArtifacts) {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    lines.push(`  ${artifact.slug}:`);
    lines.push(`    type: http`);
    lines.push(`    behavior: ${artifact.behavior || "domain"}`);
    lines.push(`    format: mrs`);
    lines.push(`    url: ${rawUrl}`);
    lines.push(`    interval: 86400`);
  }

  for (const artifact of yamlArtifacts) {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    lines.push(`  ${artifact.slug}:`);
    lines.push(`    type: http`);
    lines.push(`    behavior: classical`);
    lines.push(`    format: yaml`);
    lines.push(`    url: ${rawUrl}`);
    lines.push(`    interval: 86400`);
  }

  lines.push("```");
  return lines.join("\n");
}

function renderArtifacts({ artifacts, repository, releaseBranch }) {
  if (!artifacts.length) return "_暂无产物_";
  const rows = artifacts.map((artifact) => {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    return `| ${artifact.label} | [下载](${rawUrl}) |`;
  });
  return ["| 名称 | 链接 |", "| --- | --- |", ...rows].join("\n");
}

function renderRulesRows({ sourceConfigs, artifacts, repository, releaseBranch, updateTimes = {} }) {
  const rows = [];
  for (const sourceConfig of sourceConfigs) {
    const relevantArtifacts = artifacts.filter((artifact) => artifact.sourceRelativeDir === sourceConfig.sourceRelativeDir);
    const artifactByKind = new Map();
    for (const artifact of relevantArtifacts) {
      artifactByKind.set(artifact.kind, artifact);
    }

    const artifact = artifactByKind.get("clash");
    const filePathName = sourceConfig.pathName || sourceConfig.sourceName;
    const displayName = sourceConfig.displayName || sourceConfig.sourceName;
    const fileCell = artifact
      ? `[\`${displayName}.list\`](${githubRawURL({ repository, branch: releaseBranch, filePath: `rules/release/${filePathName}.list` })})`
      : `\`${displayName}.list\``;
    const info = RULE_ROW_INFO[sourceConfig.sourceName] || DEFAULT_RULE_ROW_INFO;
    const updateTime = updateTimes[sourceConfig.pathName || sourceConfig.sourceName] || "-";

    rows.push(`| ${fileCell} | ${escapeTableCell(info.content)} | ${escapeTableCell(info.purpose)} | ${updateTime} |`);
  }

  return rows;
}

function renderOtherRulesets({ sourceConfigs, artifacts, repository, releaseBranch, updateTimes = {} }) {
  if (!sourceConfigs.length) return "";

  // 按显示名（路径最后一段）A-Z 排序
  const sortedConfigs = [...sourceConfigs].sort((a, b) => {
    const nameA = (a.pathName || a.sourceName || "").split("/").pop().toLowerCase();
    const nameB = (b.pathName || b.sourceName || "").split("/").pop().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const cells = [];
  for (const sourceConfig of sortedConfigs) {
    const relevantArtifacts = artifacts.filter((artifact) => artifact.sourceRelativeDir === sourceConfig.sourceRelativeDir);
    const artifactByKind = new Map();
    for (const artifact of relevantArtifacts) {
      artifactByKind.set(artifact.kind, artifact);
    }

    const artifact = artifactByKind.get("clash");
    const filePathName = sourceConfig.pathName || sourceConfig.sourceName;
    // 取路径最后一段作为显示文件名（如 Extra/Apple → Apple）
    const fileNamePart = filePathName.split("/").pop();
    const rawUrl = artifact
      ? githubRawURL({ repository, branch: releaseBranch, filePath: `rules/release/${filePathName}.list` })
      : null;
    const updateTime = updateTimes[sourceConfig.pathName || sourceConfig.sourceName] || "-";

    const cellContent = rawUrl
      ? `[${fileNamePart}.list](${rawUrl})<br>更新时间：${updateTime}`
      : `${fileNamePart}.list<br>更新时间：${updateTime}`;

    cells.push(cellContent);
  }

  // 每行固定 5 个单元格，不足补空，带表头的 Markdown 表格
  const COLS = 5;
  const header = `| ${Array.from({ length: COLS }, () => "---").join(" | ")} |`;
  const rows = [header];
  for (let i = 0; i < cells.length; i += COLS) {
    const rowCells = cells.slice(i, i + COLS);
    while (rowCells.length < COLS) rowCells.push("");
    rows.push(`| ${rowCells.join(" | ")} |`);
  }

  return rows.join("\n");
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

const DEFAULT_RULE_ROW_INFO = {
  content: "规则集合",
  purpose: "按需分流与策略匹配",
};

const RULE_ROW_INFO = {
  China: {
    content: "中国网站列表",
    purpose: "国内网站、服务，确保直连访问",
  },
  Direct: {
    content: "直连域名列表",
    purpose: "国内可直连的常用服务，避免不必要的代理",
  },
  Proxy: {
    content: "代理服务列表",
    purpose: "国外代理、VPN、科学上网服务",
  },
  Streaming: {
    content: "国际流媒体",
    purpose: "Netflix、Disney+、HBO 等国际流媒体",
  },
  AI: {
    content: "AI 服务",
    purpose: "ChatGPT、Claude、Gemini 等主要 AI 服务",
  },
  Private: {
    content: "私有网络",
    purpose: "内网设备管理、路由器配置、本地服务访问",
  },
  WeChat: {
    content: "微信服务",
    purpose: "微信相关服务、API 与访问优化",
  },
  StreamingHMT: {
    content: "港澳台流媒体",
    purpose: "哔哩哔哩、爱奇艺等港澳台流媒体",
  },
  Apple: {
    content: "苹果服务",
    purpose: "苹果全球服务、iCloud、App Store 国际版",
  },
  SteamCN: {
    content: "Steam国内直连",
    purpose: "Steam 国内可直连访问内容",
  },
  Telegram: {
    content: "Telegram",
    purpose: "Telegram 官方及第三方客户端、API 服务",
  },
};

const RULE_SOURCE_ORDER = [
  "Private",
  "Direct",
  "WeChat",
  "SteamCN",
  "AI",
  "Apple",
  "Telegram",
  "StreamingHMT",
  "Streaming",
  "Proxy",
  "China",
];

const RULE_POLICY_BY_SOURCE_NAME = {
  Private: "DIRECT",
  Direct: "DIRECT",
  WeChat: "DIRECT",
  SteamCN: "DIRECT",
  AI: "AI",
  Apple: "苹果服务",
  Telegram: "Telegram",
  StreamingHMT: "哔哩哔哩",
  Streaming: "国际媒体",
  Proxy: "全球加速",
  China: "DIRECT",
};
