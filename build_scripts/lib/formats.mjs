// ==================== 客户端产物格式转换 ====================
//
// 输入统一是「归一化后的 classical 规则行」（buildSortedRulesetForClash 的输出），
// 每行形如 `DOMAIN,example.com` / `DOMAIN-SUFFIX,foo.com` / `IP-CIDR,1.2.3.0/24,no-resolve`。
// 输出三套互不干扰的产物：
//   mihomo/      -> YAML，带 payload:，每条规则用单引号包裹（behavior: classical 的 rule-provider YAML）
//   quantumultx/ -> QX 的 .list，类型名按 KOP-XIAO resource-parser.js 的 Rule_Policy 规则转换
//   loon/        -> Loon 的 .list，类型名按 Sub-Store LoonRules producer 的规则转换
//
// 三套都不带策略字段（策略由各客户端的引用处指定，例如 QX 的 force-policy、
// Loon 的 [Remote Rule]、mihomo 的 rules: RULE-SET,x,策略）。
//
// 头部注释沿用本项目自己的 buildHeaderBlock 风格（# NAME / # UPDATE / # TOTAL / 各类型计数），
// 不采用 magicrule 的 # AUTHOR / # REPO / # BEHAVIOR 头。
// 本模块保持零外部依赖，便于独立测试。

export const OUTPUT_FORMATS = [
  { key: "mihomo", dir: "mihomo", ext: "yaml", kind: "mihomo-yaml" },
  { key: "quantumultx", dir: "quantumultx", ext: "list", kind: "quantumultx-list" },
  { key: "loon", dir: "loon", ext: "list", kind: "loon-list" },
];

// ==================== 头部注释（项目自有风格）====================

// header 里类型行的展示顺序，与 classical 产物的 buildHeaderBlock 保持一致。
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

function countRuleTypes(lines) {
  const counts = new Map();
  for (const line of lines) {
    const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
    if (!type) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  const ordered = [];
  for (const type of RULE_TYPE_HEADER_ORDER) {
    const count = counts.get(type);
    if (count) ordered.push([type, count]);
    counts.delete(type);
  }
  ordered.push(...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  return ordered;
}

/**
 * 生成项目自有风格的头部注释。
 * @param {string} name 段名（如 Private / SteamCN）
 * @param {string} updateTime 更新时间
 * @param {string[]} bodyLines 规则正文行（用于统计类型计数）
 */
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
  // 不带尾部空行，由各格式自己补一个空行分隔头部与正文
  return lines.join("\n");
}

// ==================== 规则行解析 ====================

function splitRule(line) {
  const parts = String(line ?? "").split(",");
  const type = (parts[0] ?? "").trim().toUpperCase();
  const value = (parts[1] ?? "").trim();
  const rest = parts.slice(2).map((p) => p.trim()).filter(Boolean);
  return { type, value, rest };
}

// ==================== mihomo（YAML + payload）====================

/**
 * 生成 mihomo 的 behavior:classical YAML 产物。
 * 格式与 magicrule 的 *_classical_*.yaml 一致：payload: 下每行 `- 'DOMAIN,xxx'`。
 * 头部注释使用本项目自有风格。
 */
function toMihomoYaml({ name, updateTime, lines }) {
  const bodyLines = lines.map((line) => `- '${String(line).replace(/'/g, "''")}'`);
  const header = buildHeaderBlock({ name, updateTime, bodyLines: lines });
  return [header, "", "payload:", ...bodyLines].join("\n") + "\n";
}

// ==================== Quantumult X（.list）====================

// KOP-XIAO resource-parser.js 的 Rule_Policy 转换规则（见其 2446-2503 行）：
//   DOMAIN          -> host          （^domain 一律替换成 host）
//   DOMAIN-SUFFIX   -> host-suffix
//   DOMAIN-KEYWORD  -> host-keyword
//   DOMAIN-WILDCARD -> host-wildcard
//   DOMAIN-REGEX    -> host-wildcard（简单正则可转，复杂正则丢弃）
//   IP-CIDR         -> ip-cidr
//   IP-CIDR6        -> ip6-cidr
//   GEOIP           -> geoip（解析器白名单含 geoip）
//   USER-AGENT      -> user-agent（解析器白名单含 user-agent）
//   IP-ASN          -> ip-asn（解析器白名单含 ip-asn）
//   no-resolve 等附加标记一律移除（QX 不使用 no-resolve）
//   URL-REGEX / PROCESS-* / AND|OR|NOT / GEOSITE / RULE-SET / MATCH 等丢弃
//
// 注意：解析器默认会补第三段策略（Shawn / policy=），本产物按要求不带策略，
// 只输出 `类型, 值` 两段，策略由 QX 引用处的 force-policy 指定。
const QX_TYPE_MAP = new Map([
  ["DOMAIN", "host"],
  ["DOMAIN-SUFFIX", "host-suffix"],
  ["DOMAIN-KEYWORD", "host-keyword"],
  ["DOMAIN-WILDCARD", "host-wildcard"],
  ["IP-CIDR", "ip-cidr"],
  ["IP-CIDR6", "ip6-cidr"],
  ["GEOIP", "geoip"],
  ["USER-AGENT", "user-agent"],
  ["IP-ASN", "ip-asn"],
]);

// DOMAIN-REGEX：resource-parser.js 只把「简单」正则转成 host-wildcard，
// 复杂正则会跳过（其 2456-2465 行）。这里采用相同的保守策略。
function simpleRegexToWildcard(pattern) {
  if (!/^\^?(?:[a-z0-9_-]|\\\.|\.\*?)+\$?$/i.test(pattern)) return null;
  return pattern
    .replace(/^\^|\$$/g, "")
    .replace(/\\\.|\.\*|\./g, (token) => (token === "\\." ? "." : token === ".*" ? "*" : "?"))
    .replace(/\*+/g, "*");
}

function toQuantumultXLine(line) {
  const { type, value } = splitRule(line);
  if (!value) return null;

  if (type === "DOMAIN-REGEX") {
    const wildcard = simpleRegexToWildcard(value);
    if (wildcard === null) return null;
    const prefix = value.startsWith("^") ? "" : "*";
    const suffix = value.endsWith("$") ? "" : "*";
    return `host-wildcard, ${(prefix + wildcard + suffix).replace(/\*+/g, "*")}`;
  }

  const target = QX_TYPE_MAP.get(type);
  if (!target) return null;
  return `${target}, ${value}`;
}

function toQuantumultXList({ name, updateTime, lines }) {
  const bodyLines = [];
  for (const line of lines) {
    const converted = toQuantumultXLine(line);
    if (converted) bodyLines.push(converted);
  }
  const header = buildHeaderBlock({ name, updateTime, bodyLines });
  return [header, "", ...bodyLines].join("\n") + "\n";
}

// ==================== Loon（.list）====================

// Sub-Store 的 LoonRules producer（见 backend/src/core/rule-utils/producers.js）：
//   - 类型名基本直出，不做 DOMAIN->HOST / IP-CIDR6->IP6-CIDR 这类 QX 改写
//   - 输出 `类型,匹配值` 两段，不带策略
//   - IP-CIDR / IP-CIDR6 只保留 no-resolve 这一个 option，其余附加参数过滤掉
//   - DST-PORT 在 Loon 官方类型名里是 DEST-PORT，SRC-PORT 保持同名
//
// 以 Loon 官方文档支持的类型为准，转换规则参考 Sub-Store：
//   - 保留：DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD / IP-CIDR / IP-CIDR6 /
//           IP-ASN / GEOIP / USER-AGENT / URL-REGEX / DEST-PORT / SRC-PORT / PROTOCOL
//   - 丢弃：DOMAIN-REGEX / DOMAIN-WILDCARD / GEOSITE / RULE-SET / SUB-RULE /
//           AND|OR|NOT / PROCESS-* / SRC-* / MATCH 等 Loon 无对应类型的写法
// 注：Sub-Store 的 UNSUPPORTED 含 GEOIP，但 Loon 自身的 IP 类规则支持 GEOIP，
//     这里按 Loon 官方能力保留；no-resolve 只在 IP 类规则上保留。
const LOON_TYPE_MAP = new Map([
  ["DOMAIN", "DOMAIN"],
  ["DOMAIN-SUFFIX", "DOMAIN-SUFFIX"],
  ["DOMAIN-KEYWORD", "DOMAIN-KEYWORD"],
  ["IP-CIDR", "IP-CIDR"],
  ["IP-CIDR6", "IP-CIDR6"],
  ["IP-ASN", "IP-ASN"],
  ["GEOIP", "GEOIP"],
  ["USER-AGENT", "USER-AGENT"],
  ["URL-REGEX", "URL-REGEX"],
  ["DST-PORT", "DEST-PORT"],
  ["SRC-PORT", "SRC-PORT"],
  ["PROTOCOL", "PROTOCOL"],
]);

const LOON_NO_RESOLVE_TYPES = new Set(["IP-CIDR", "IP-CIDR6", "IP-ASN", "GEOIP"]);

function toLoonLine(line) {
  const { type, value, rest } = splitRule(line);
  if (!value) return null;
  const target = LOON_TYPE_MAP.get(type);
  if (!target) return null;

  let out = `${target},${value}`;
  if (LOON_NO_RESOLVE_TYPES.has(type) && rest.some((p) => p.toLowerCase() === "no-resolve")) {
    out += ",no-resolve";
  }
  return out;
}

function toLoonList({ name, updateTime, lines }) {
  const bodyLines = [];
  for (const line of lines) {
    const converted = toLoonLine(line);
    if (converted) bodyLines.push(converted);
  }
  const header = buildHeaderBlock({ name, updateTime, bodyLines });
  return [header, "", ...bodyLines].join("\n") + "\n";
}

// ==================== 对外统一入口 ====================

/**
 * 把归一化后的 classical 规则行转换成指定客户端格式的完整文件内容。
 * @param {"mihomo"|"quantumultx"|"loon"} format
 * @param {string} name 段名
 * @param {string[]} lines 归一化后的规则行
 * @param {string} updateTime 更新时间（Asia/Shanghai），由调用方统一传入，保证三套产物头一致
 * @returns {string} 完整文件内容（含头部注释）
 */
export function renderFormat(format, { name, lines, updateTime } = {}) {
  const time = updateTime ?? "";
  const ruleLines = Array.isArray(lines) ? lines : [];
  switch (format) {
    case "mihomo":
      return toMihomoYaml({ name, updateTime: time, lines: ruleLines });
    case "quantumultx":
      return toQuantumultXList({ name, updateTime: time, lines: ruleLines });
    case "loon":
      return toLoonList({ name, updateTime: time, lines: ruleLines });
    default:
      throw new Error(`unknown output format: ${format}`);
  }
}
