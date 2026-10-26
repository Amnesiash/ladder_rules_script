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
    "说明：规则生成过程按 rule_source.txt 原始内容读取、解析和处理；仅在最终生成 release 产物时将目录层级和文件名转换为小写。",
    "",
    "---",
    "",
    "## 常用规则集",
    "",
    "| 文件名 | 包含内容 | 用途 | 日期 |",
    "| --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - |",
    "",
  ];

  if (otherSection) {
    parts.push("## 额外规则集", "", otherSection, "");
  }

  parts.push(
    "## 使用示例",
    "",
    "### Clash 使用示例",
    "",
    renderRulesClashExample({ sourceConfigs: sortedConfigs.slice(0, 1), repository: repo, releaseBranch }),
    "",
    "### Mihomo 使用示例",
    "",
    renderMihomoConfig({ artifacts: providerArtifacts, repository: repo, releaseBranch }),
    "",
    "### QX 使用示例",
    "",
    renderRulesQxExample(),
    "",
  );

  return parts.join("\n");
}

function sortRulesSourceConfigs(sourceConfigs) {
  const order = new Map(RULE_SOURCE_ORDER.map((name, index) => [name.toLowerCase(), index]));
  return [...sourceConfigs].sort((left, right) => {
    const leftName = String(left.sourceName ?? "").toLowerCase();
    const rightName = String(right.sourceName ?? "").toLowerCase();
    const leftIndex = order.has(leftName) ? order.get(leftName) : Number.POSITIVE_INFINITY;
    const rightIndex = order.has(rightName) ? order.get(rightName) : Number.POSITIVE_INFINITY;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return leftName.localeCompare(rightName);
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
    const filePathName = (sourceConfig.pathName || sourceConfig.sourceName).toLowerCase();
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
    const policy = getRulePolicy(sourceConfig.sourceName);
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
    "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true",
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
  const mrsArtifacts = artifacts.filter((a) => a.kind === "domain-mrs" || a.kind === "ipcidr-mrs");
  const examples = [
    mrsArtifacts.find((artifact) => artifact.kind === "domain-mrs"),
    mrsArtifacts.find((artifact) => artifact.kind === "ipcidr-mrs"),
  ].filter(Boolean);

  if (!examples.length) return "_暂无 MRS 产物_";

  const lines = [
    "```yaml",
    "d: &r2 {type: http, behavior: domain, format: mrs, interval: 86400}",
    "i: &r3 {type: http, behavior: ipcidr, format: mrs, interval: 86400}",
    "",
    "rule-providers:",
  ];
  for (const artifact of examples) {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const releasePath = rawPath.startsWith("rules/release/") ? rawPath : `rules/release/${rawPath}`;
    const rawUrl = `https://github.com/${repository}/raw/${releaseBranch}/${releasePath}`;
    const anchor = artifact.kind === "ipcidr-mrs" ? "r3" : "r2";
    lines.push(`  ${artifact.slug}:`);
    lines.push(`    <<: *${anchor}`);
    lines.push(`    url: ${rawUrl}`);
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

function renderRuleFileLinks({ sourceConfig, artifacts, repository, releaseBranch }) {
  const relevantArtifacts = artifacts.filter((artifact) => artifact.sourceRelativeDir === sourceConfig.sourceRelativeDir);
  const byKind = new Map(relevantArtifacts.map((artifact) => [artifact.kind, artifact]));
  const files = [
    ["clash", ".list"],
    ["domain-mrs", "_domain.mrs"],
    ["ipcidr-mrs", "_ip.mrs"],
  ];
  const fileStem = String(sourceConfig.pathName || sourceConfig.sourceName || "").toLowerCase();
  const links = [];

  for (const [kind, suffix] of files) {
    const artifact = byKind.get(kind);
    const fileName = artifact?.relativePath?.split("/").pop() || `${fileStem}${suffix}`;
    const filePath = artifact?.relativePath || `${fileStem}${suffix}`;
    const releasePath = filePath.startsWith("rules/release/") ? filePath : `rules/release/${filePath}`;
    const url = githubRawURL({ repository, branch: releaseBranch, filePath: releasePath });
    if (artifact) links.push(`[\`${fileName}\`](${url})`);
  }

  return links.join("<br>");
}

function getRuleRowInfo(sourceName) {
  const exact = RULE_ROW_INFO[sourceName];
  if (exact) return exact;
  const lowered = String(sourceName ?? "").toLowerCase();
  const key = Object.keys(RULE_ROW_INFO).find((name) => name.toLowerCase() === lowered);
  return key ? RULE_ROW_INFO[key] : DEFAULT_RULE_ROW_INFO;
}

function getRulePolicy(sourceName) {
  const exact = RULE_POLICY_BY_SOURCE_NAME[sourceName];
  if (exact) return exact;
  const lowered = String(sourceName ?? "").toLowerCase();
  const key = Object.keys(RULE_POLICY_BY_SOURCE_NAME).find((name) => name.toLowerCase() === lowered);
  return key ? RULE_POLICY_BY_SOURCE_NAME[key] : "DIRECT";
}

function renderRulesRows({ sourceConfigs, artifacts, repository, releaseBranch, updateTimes = {} }) {
  const rows = [];
  for (const sourceConfig of sourceConfigs) {
    const fileCell = renderRuleFileLinks({ sourceConfig, artifacts, repository, releaseBranch });
    const info = getRuleRowInfo(sourceConfig.sourceName);
    const updateTime = updateTimes[sourceConfig.pathName || sourceConfig.sourceName] || "-";

    rows.push(`| ${fileCell || "-"} | ${escapeTableCell(info.content)} | ${escapeTableCell(info.purpose)} | ${updateTime} |`);
  }

  return rows;
}

function renderOtherRulesets({ sourceConfigs, artifacts, repository, releaseBranch, updateTimes = {} }) {
  if (!sourceConfigs.length) return "";

  const sortedConfigs = [...sourceConfigs].sort((a, b) => {
    const pathA = a.pathName || a.sourceName || "";
    const pathB = b.pathName || b.sourceName || "";
    return pathA.localeCompare(pathB, undefined, { sensitivity: "base" });
  });
  const groups = new Map();
  for (const sourceConfig of sortedConfigs) {
    const pathName = sourceConfig.pathName || sourceConfig.sourceName || "";
    const [rootName] = pathName.split("/");
    if (!groups.has(rootName)) groups.set(rootName, []);
    groups.get(rootName).push(sourceConfig);
  }

  return [...groups.entries()].map(([rootName, configs]) => {
    const cells = configs.map((sourceConfig) => {
      const pathName = sourceConfig.pathName || sourceConfig.sourceName || "";
      const title = pathName.split("/").pop();
      const links = renderRuleFileLinks({ sourceConfig, artifacts, repository, releaseBranch }) || "-";
      return {
        title: `<strong><code>${escapeTableCell(title)}</code></strong>`,
        links,
      };
    });
    const columns = 5;
    const rows = [
      `| ${escapeTableCell(rootName)} | ${Array.from({ length: columns - 1 }, () => "&nbsp;").join(" | ")} |`,
      `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`,
    ];
    for (let i = 0; i < cells.length; i += columns) {
      const row = cells.slice(i, i + columns);
      while (row.length < columns) row.push({ title: "&nbsp;", links: "&nbsp;" });
      rows.push(`| ${row.map((cell) => cell.title).join(" | ")} |`);
      rows.push(`| ${row.map((cell) => cell.links).join(" | ")} |`);
    }
    return rows.join("\n");
  }).join("\n\n");
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
  Lan: {
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
  "Lan",
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
  Lan: "DIRECT",
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
