// ==================== 文本处理 ====================

function stripInlineSuffixComments(line) {
  const index = line.indexOf(" //");
  if (index === -1) return line;
  return line.slice(0, index);
}

function isCommentLine(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("#") || trimmed.startsWith(";");
}

function normalizeCommaSpacing(line) {
  return line.replace(/,\s*/g, ",");
}

function isLikelyYamlHeaderLine(line) {
  const trimmed = line.trim();
  return (
    trimmed === "payload:" ||
    trimmed === "rules:" ||
    trimmed === "rule-providers:" ||
    trimmed === "rule_providers:" ||
    trimmed === "domain:" ||
    trimmed === "ipcidr:" ||
    trimmed === "ip-cidr:" ||
    trimmed === "process-name:" ||
    trimmed === "process_name:"
  );
}

function normalizeLooseDomainSyntax(line) {
  if (["MATCH", "AND", "OR", "NOT"].includes(line)) return line;

  if (line.startsWith("+.")) {
    const domain = line.slice(2).trim();
    if (!domain) return line;
    return `DOMAIN-SUFFIX,${domain}`;
  }

  if (!line.includes(",") && !/\s/u.test(line)) {
    if (line.includes(":")) return line;
    if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(?:\/[0-9]+)?$/u.test(line)) return line;
    if (/^(?:[a-fA-F0-9]+:|(?:[a-fA-F0-9]+:+)+[a-fA-F0-9]+)(?:\/[0-9]+)?$/u.test(line)) return line;
    return `DOMAIN-SUFFIX,${line}`;
  }

  return line;
}

function ensureCidrPrefixes(line) {
  let out = line;

  if (!out.startsWith("IP-CIDR,")) {
    if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+/u.test(out)) {
      out = `IP-CIDR,${out}`;
    }
  }

  if (!out.startsWith("IP-CIDR6,")) {
    if (/^(?:[a-fA-F0-9]+:|(?:[a-fA-F0-9]+:+)+[a-fA-F0-9]+\/[0-9]+)/u.test(out)) {
      out = `IP-CIDR6,${out}`;
    } else if (out.includes(":") && out.includes("/") && /\/[0-9]+$/u.test(out)) {
      out = `IP-CIDR6,${out}`;
    }
  }

  return out;
}

// ==================== 规则类型名归一化 ====================

// 语义相同、但 mihomo 不认的类型名 → mihomo 类型名。
//
// 规则源里会混进别家客户端的写法，这些名字 mihomo 的 parser 一个都不认：
//
//   Quantumult X:
//     HOST            -> DOMAIN
//     HOST-SUFFIX     -> DOMAIN-SUFFIX
//     HOST-KEYWORD    -> DOMAIN-KEYWORD
//     HOST-WILDCARD   -> DOMAIN-WILDCARD
//     IP6-CIDR        -> IP-CIDR6
//   Surge:
//     DEST-PORT       -> DST-PORT
//
// Surge 与 Loon 的 IP-CIDR6 与 mihomo 同名，不需要改名。
//
// 不做归一化的话，mihomo 的 parser 会走 default 分支报
// "unsupported rule type"，整条规则被丢弃，且只写日志、不中断启动
// —— 属于静默失效（见 rules/parser.go）。
//
// 注意：HOST-WILDCARD 的通配符语法与 mihomo DOMAIN-WILDCARD 一致
// （`*` 任意多字符、`?` 恰好一个字符），值可以直接搬。
const RULE_TYPE_ALIASES = new Map([
  ["IP6-CIDR", "IP-CIDR6"],
  ["HOST", "DOMAIN"],
  ["HOST-SUFFIX", "DOMAIN-SUFFIX"],
  ["HOST-KEYWORD", "DOMAIN-KEYWORD"],
  ["HOST-WILDCARD", "DOMAIN-WILDCARD"],
  ["DEST-PORT", "DST-PORT"],
]);

/** 取某个类型名归一化后的 mihomo 类型名；不需要改名时返回 null。 */
export function ruleTypeAliasTarget(type) {
  return RULE_TYPE_ALIASES.get(String(type ?? "").trim().toUpperCase()) ?? null;
}

function normalizeRuleTypeAlias(line, stats) {
  const comma = line.indexOf(",");
  if (comma === -1) return line;

  const source = line.slice(0, comma).trim().toUpperCase();
  const canonical = RULE_TYPE_ALIASES.get(source);
  if (!canonical) return line;

  if (stats?.aliased) stats.aliased.set(source, (stats.aliased.get(source) ?? 0) + 1);
  return `${canonical}${line.slice(comma)}`;
}

// mihomo rules/parser.go 的 switch 能识别的全部规则类型（即 ParseRule 的 case 全集）。
// 用于把「会被 mihomo 静默丢弃的规则」暴露到构建日志里 —— 别名表没覆盖到的新类型
// 会在这里报出来，而不是悄悄消失。
//
// 注意：端口只有 DST-PORT，没有 DEST-PORT（那是 Surge 的写法，已进别名表）。
// URL-REGEX / USER-AGENT 不在这个名单里 —— parser.go 并没有对应 case，
// 它们由 INTENTIONALLY_DROPPED_RULE_TYPES 主动剔除，因此也不会触发告警。
const MIHOMO_RULE_TYPES = new Set([
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "DOMAIN-REGEX",
  "DOMAIN-WILDCARD",
  "GEOSITE",
  "GEOIP",
  "SRC-GEOIP",
  "IP-ASN",
  "SRC-IP-ASN",
  "IP-CIDR",
  "IP-CIDR6",
  "SRC-IP-CIDR",
  "IP-SUFFIX",
  "SRC-IP-SUFFIX",
  "SRC-PORT",
  "DST-PORT",
  "IN-PORT",
  "DSCP",
  "PROCESS-NAME",
  "PROCESS-PATH",
  "PROCESS-NAME-REGEX",
  "PROCESS-PATH-REGEX",
  "PROCESS-NAME-WILDCARD",
  "PROCESS-PATH-WILDCARD",
  "NETWORK",
  "UID",
  "IN-TYPE",
  "IN-USER",
  "IN-NAME",
  "REMATCH-NAME",
  "SUB-RULE",
  "AND",
  "OR",
  "NOT",
  "RULE-SET",
  "MATCH",
]);

// 会被 buildSortedRulesetForClash 主动剔除的类型，不参与「不被支持」告警。
// mihomo 的规则引擎没有这两种类型（parser.go 无对应 case），
// 但规则源里常见，剔除属于既定策略，不算异常。
const INTENTIONALLY_DROPPED_RULE_TYPES = new Set(["URL-REGEX", "USER-AGENT"]);

/**
 * 找出 mihomo 不认识、且不会被主动剔除的规则类型。
 * 这些行在客户端里等同不存在，需要让构建日志报出来。
 */
export function findUnsupportedRuleTypes(lines) {
  const found = new Map();
  for (const line of lines) {
    const comma = line.indexOf(",");
    if (comma === -1) continue;
    const type = line.slice(0, comma).trim().toUpperCase();
    if (!type || MIHOMO_RULE_TYPES.has(type) || INTENTIONALLY_DROPPED_RULE_TYPES.has(type)) continue;
    found.set(type, (found.get(type) ?? 0) + 1);
  }
  return found;
}

/**
 * 逐行归一化。
 * @param {string[]} lines 原始行
 * @param {{aliased?: Map<string, number>}|null} stats 可选；传入时会把「类型名归一化」
 *   的次数累计到 stats.aliased（key 为改写前的类型名），供构建日志展示。
 */
export function normalizeRulesetLines(lines, stats = null) {
  return lines
    .map((l) => String(l ?? ""))
    .map((l) => stripInlineSuffixComments(l))
    .map((l) => normalizeRawRuleLine(l))
    .filter((l) => l.length > 0)
    .filter((l) => !isCommentLine(l))
    .filter((l) => !isLikelyYamlHeaderLine(l))
    .map(normalizeCommaSpacing)
    .map(normalizeLooseDomainSyntax)
    // 类型名归一化必须早于 ensureCidrPrefixes：IP6-CIDR 先变成 IP-CIDR6，
    // 后续 CIDR 兜底识别才不会把已改好的行再包一层前缀。
    .map((l) => normalizeRuleTypeAlias(l, stats))
    .map(ensureCidrPrefixes);
}

export function sortAndDedupRulesetLines(lines, bucketOf) {
  const indexed = lines.map((line) => ({ line, bucket: bucketOf(line) }));
  indexed.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    return a.line.localeCompare(b.line);
  });

  const seen = new Set();
  const deduped = [];
  for (const item of indexed) {
    const key = item.line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item.line);
  }
  return deduped;
}

// ==================== 目标 IP 规则的 no-resolve 归一化 ====================

// 只有“目标 IP 类”规则才谈得上 no-resolve（mihomo: 仅支持关于 目标IP 的规则）
// 依据 rules/parser.go：真正读取 no-resolve 参数的只有 GEOIP / IP-ASN /
// IP-CIDR & IP-CIDR6 / IP-SUFFIX / RULE-SET。
// 注意两点：
//   1. SRC-GEOIP / SRC-IP-ASN / SRC-IP-CIDR / SRC-IP-SUFFIX 在 parser 里把
//      src+noResolve 硬编码为 true、不读 params，因此不需要也不应该补；
//   2. IP6-CIDR 不是 mihomo 的规则类型（那是 Quantumult X 的写法），已在上游的
//      normalizeRuleTypeAlias() 里统一改写成 IP-CIDR6，这里不需要再列出。
const TARGET_IP_RULE_TYPES = new Set([
  "IP-CIDR",
  "IP-CIDR6",
  "IP-SUFFIX",
  "IP-ASN",
  "GEOIP",
]);

const NO_RESOLVE_PARAM = "no-resolve";

function splitRuleParams(line) {
  const parts = String(line ?? "").split(",");
  return {
    type: parts[0].trim().toUpperCase(),
    params: parts.slice(1).map((p) => p.trim()),
  };
}

function hasNoResolveParam(line) {
  return splitRuleParams(line).params.some((p) => p.toLowerCase() === NO_RESOLVE_PARAM);
}

/**
 * 给一条目标 IP 规则补上 no-resolve；不适用或已有该参数时原样返回。
 * 参数追加在行尾（策略列之后），例如 IP-CIDR,1.2.3.0/24,DIRECT → IP-CIDR,1.2.3.0/24,DIRECT,no-resolve
 */
function withNoResolveParam(line) {
  const { type, params } = splitRuleParams(line);
  if (!TARGET_IP_RULE_TYPES.has(type)) return line;
  if (!params[0]) return line;
  if (hasNoResolveParam(line)) return line;
  return `${String(line).trim().replace(/[,\s]+$/u, "")},${NO_RESOLVE_PARAM}`;
}

/**
 * 为目标 IP 类规则统一补上 no-resolve。
 *
 * 原因：域名请求匹配到目标 IP 规则时，mihomo 会先触发 DNS 解析再比对
 * （rules/common/ipcidr.go），解析结果会写回 metadata.DstIP 并对该连接后续所有规则生效
 * （tunnel/tunnel.go）。对于规则集里这些按 IP 段/ASN 兜底的规则，这一步解析既非必要，
 * 又会把解析时机提前。统一标注 no-resolve 后，这类规则只在目标已经是 IP 时才参与匹配。
 *
 * 补全后原本「带 no-resolve」与「不带 no-resolve」的同款规则会变成完全相同的行，
 * 由后续 sortAndDedupRulesetLines 自然合并，无需额外去重逻辑。
 *
 * @returns {{ lines: string[], added: Array<{from: string, to: string}> }}
 */
export function ensureNoResolveOnTargetIpRules(lines) {
  const added = [];
  const next = lines.map((line) => {
    const updated = withNoResolveParam(line);
    if (updated !== line) added.push({ from: line, to: updated });
    return updated;
  });
  return { lines: next, added };
}

// ==================== 规则解析 ====================

function normalizeRawRuleLine(rawLine) {
  let line = String(rawLine ?? "").trim();
  if (!line) return "";

  if (/^-\s+/u.test(line)) line = line.replace(/^-\s+/u, "").trim();

  if (
    (line.startsWith("'") && line.endsWith("'") && line.length >= 2) ||
    (line.startsWith("\"") && line.endsWith("\"") && line.length >= 2)
  ) {
    line = line.slice(1, -1).trim();
  }

  line = stripInlineComment(line);
  return line.trim();
}

function stripInlineComment(line) {
  const text = String(line ?? "");
  const markers = [" //", "\t//", " #", "\t#"];
  let cut = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index !== -1) {
      if (cut === -1 || index < cut) cut = index;
    }
  }
  return cut === -1 ? text : text.slice(0, cut).trim();
}

// ==================== Clash 规则处理 ====================

const REFERENCE_RULE_ORDER = new Map([
  ["DOMAIN", 0],
  ["DOMAIN-SUFFIX", 1],
  ["DOMAIN-KEYWORD", 3],
  ["DOMAIN-WILDCARD", 4],
  ["IP-CIDR", 5],
  ["IP-CIDR6", 6],
  ["IP-ASN", 7],
  ["PROCESS-NAME", 8],
  ["URL-REGEX", 9],
  ["USER-AGENT", 10],
  ["GEOIP", 11],
  ["AND", 12],
  ["OR", 13],
  ["NOT", 14],
  ["DEST-PORT", 15],
]);

function sortBucket(line) {
  const type = normalizeRuleType(line);
  return REFERENCE_RULE_ORDER.get(type) ?? 16;
}

export function buildSortedRulesetForClash(lines, options = {}) {
  const stats = { aliased: new Map() };
  const normalized = normalizeRulesetLines(lines, stats);

  // 先统一补 no-resolve，再排序去重——补全后重复的两种写法会自然合并为一行
  const { lines: flagged, added } = ensureNoResolveOnTargetIpRules(normalized);
  const sorted = sortAndDedupRulesetLines(flagged, sortBucket);
  const result = sorted.filter((line) => {
    const type = normalizeRuleType(line);
    return type !== "URL-REGEX" && type !== "USER-AGENT";
  });

  const mergedCount = flagged.length - sorted.length;
  const aliased = stats.aliased;
  // 别名表没覆盖到、又不属于主动剔除的类型：这些行在客户端里等同不存在，
  // 必须报出来而不是悄悄丢掉。检查 sorted 而非 result，避免剔除名单内的类型误报。
  const unsupportedRuleTypes = findUnsupportedRuleTypes(sorted);

  const hasNews =
    added.length > 0 || mergedCount > 0 || aliased.size > 0 || unsupportedRuleTypes.size > 0;
  if (hasNews && typeof options.onNormalize === "function") {
    options.onNormalize({ added, mergedCount, aliased, unsupportedRuleTypes });
  }

  return result;
}

function normalizeRuleType(line) {
  const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
  if (type === "DST-PORT") return "DEST-PORT";
  return type;
}
