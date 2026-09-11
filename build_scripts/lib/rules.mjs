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
// IP6-CIDR 是 Quantumult X 的 IPv6 CIDR 类型名（QX 九种分流类型之一），
// mihomo / Surge / Loon 都写作 IP-CIDR6。
// 不归一化的话，mihomo 的 parser 会走 default 分支报 unsupported rule type，整条规则被丢弃
// （见 rules/parser.go），且报错只写日志不中断构建，很容易被忽略。
const RULE_TYPE_ALIASES = new Map([
  ["IP6-CIDR", "IP-CIDR6"],
]);

function normalizeRuleTypeAlias(line) {
  const comma = line.indexOf(",");
  if (comma === -1) return line;

  const canonical = RULE_TYPE_ALIASES.get(line.slice(0, comma).trim().toUpperCase());
  if (!canonical) return line;

  return `${canonical}${line.slice(comma)}`;
}

export function normalizeRulesetLines(lines) {
  return lines
    .map((l) => String(l ?? ""))
    .map((l) => stripInlineSuffixComments(l))
    .map((l) => normalizeRawRuleLine(l))
    .filter((l) => l.length > 0)
    .filter((l) => !isCommentLine(l))
    .filter((l) => !isLikelyYamlHeaderLine(l))
    .map(normalizeCommaSpacing)
    .map(normalizeLooseDomainSyntax)
    .map(normalizeRuleTypeAlias)
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
  const normalized = normalizeRulesetLines(lines);

  // 先统一补 no-resolve，再排序去重——补全后重复的两种写法会自然合并为一行
  const { lines: flagged, added } = ensureNoResolveOnTargetIpRules(normalized);
  const sorted = sortAndDedupRulesetLines(flagged, sortBucket);
  const result = sorted.filter((line) => {
    const type = normalizeRuleType(line);
    return type !== "URL-REGEX" && type !== "USER-AGENT";
  });

  const mergedCount = flagged.length - sorted.length;
  if ((added.length > 0 || mergedCount > 0) && typeof options.onNormalize === "function") {
    options.onNormalize({ added, mergedCount });
  }

  return result;
}

function normalizeRuleType(line) {
  const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
  if (type === "DST-PORT") return "DEST-PORT";
  return type;
}
