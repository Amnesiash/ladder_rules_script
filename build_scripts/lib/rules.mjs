import { isIP } from "node:net";

const SAFE_DOMAIN_TYPES = new Set(["DOMAIN-SUFFIX", "DOMAIN-WILDCARD"]);
const SAFE_IPCIDR_TYPES = new Set(["IP-CIDR", "IP-CIDR6"]);
const COMMENT_PREFIXES = ["#", "//"];

export class RuleSplitError extends Error {
  constructor(message, context = {}) {
    const location = [context.sourceName, context.entryName].filter(Boolean).join(":");
    super(location ? `${location}: ${message}` : message);
    this.name = "RuleSplitError";
    this.context = context;
  }
}

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

// ==================== 规则解析 ====================

export function parseRuleContent(content, format, context = {}) {
  if (format === "mrs") {
    return [];
  }
  if (format === "text") {
    return String(content)
      .split(/\r?\n/)
      .map(normalizeRawRuleLine)
      .filter((line) => line && !COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix)));
  }
  if (format === "yaml") {
    const lines = String(content).split(/\r?\n/);
    const rules = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        rules.push(normalizeRawRuleLine(trimmed.slice(2)));
      } else if (trimmed && !trimmed.startsWith("#")) {
        rules.push(normalizeRawRuleLine(trimmed));
      }
    }
    return rules;
  }
  throw new RuleSplitError(`unsupported rule format: ${format}`, context);
}

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

export function splitRules({ content, format, behavior, context = {} }) {
  if (format === "mrs") {
    return {
      domain: [],
      ipcidr: [],
      remaining: [],
      passthroughMrs: true,
    };
  }

  const rules = parseRuleContent(content, format, context);
  const buckets = {
    domain: [],
    ipcidr: [],
    remaining: [],
    passthroughMrs: false,
  };

  for (const rule of rules) {
    addRuleToBuckets(rule, behavior, buckets);
  }

  return buckets;
}

function addRuleToBuckets(rule, behavior, buckets) {
  const trimmed = String(rule ?? "").trim();
  if (!trimmed) return;

  const parts = trimmed.split(",").map((p) => p.trim());
  const type = (parts[0] ?? "").toUpperCase();

  if (behavior === "domain") {
    if (type === "DOMAIN" || type === "DOMAIN-SUFFIX" || type === "DOMAIN-KEYWORD" || type === "DOMAIN-WILDCARD") {
      buckets.domain.push(trimmed);
      return;
    }
  }

  if (behavior === "ipcidr") {
    if (type === "IP-CIDR" || type === "IP-CIDR6") {
      buckets.ipcidr.push(trimmed);
      return;
    }
  }

  buckets.remaining.push(trimmed);
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

function getClashTextSortRank(line) {
  const type = normalizeRuleType(line);
  return REFERENCE_RULE_ORDER.get(type) ?? 16;
}

function uniqueStable(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function sortBucket(line) {
  const type = normalizeRuleType(line);
  return REFERENCE_RULE_ORDER.get(type) ?? 16;
}

function sortClassicalRulesStable(lines) {
  return lines
    .map((line, index) => ({ line, index, bucket: sortBucket(line) }))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      return a.index - b.index;
    })
    .map((item) => item.line);
}

function parseClassicalPayload(line) {
  const parts = line.split(",").map((part) => part.trim());
  return {
    type: (parts[0] ?? "").toUpperCase(),
    payload: parts[1] ?? "",
  };
}

function isMihomoDomainTriePayload(domain) {
  if (!domain || domain.endsWith(".")) return false;
  if (/^\s|\s$/u.test(domain)) return false;
  if (/['"]/u.test(domain)) return false;
  const parts = domain.toLowerCase().split(".");
  if (parts.length === 1) return parts[0] !== "";
  return parts.slice(1).every((part) => part !== "");
}

function isLiteralClassicalDomainPayload(domain) {
  return (
    isMihomoDomainTriePayload(domain) &&
    !domain.includes("/") &&
    !domain.startsWith("#") &&
    !domain.startsWith("//") &&
    !domain.startsWith(".") &&
    !domain.includes("*") &&
    !domain.includes("+")
  );
}

function domainPayloadFor(type, payload) {
  const value = payload.trim();
  if (type === "DOMAIN-SUFFIX") return `+.${value.replace(/^\.+/u, "")}`;
  return value;
}

function normalizeCidrPayload(value, family) {
  const cidr = value.trim();
  if (cidr.includes(",")) return null;

  if (!cidr.includes("/")) {
    const addressFamily = isIP(cidr);
    if (addressFamily === 0) return null;
    if (family !== 0 && addressFamily !== family) return null;
    return `${cidr}/${addressFamily === 6 ? 128 : 32}`;
  }

  const slashIndex = cidr.lastIndexOf("/");
  if (slashIndex <= 0 || slashIndex !== cidr.indexOf("/")) return null;

  const address = cidr.slice(0, slashIndex);
  const prefixText = cidr.slice(slashIndex + 1);
  if (!/^\d+$/u.test(prefixText)) return null;

  const addressFamily = isIP(address);
  if (addressFamily === 0) return null;
  if (family !== 0 && addressFamily !== family) return null;

  const prefix = Number(prefixText);
  const maxPrefix = addressFamily === 6 ? 128 : 32;
  if (prefix < 0 || prefix > maxPrefix) return null;
  return `${address}/${prefix}`;
}

function classifyClassicalRule(line) {
  const { type, payload } = parseClassicalPayload(line);
  if (!type || !payload) return { kind: "remaining", raw: line };

  if (type === "DOMAIN") {
    if (isLiteralClassicalDomainPayload(payload)) {
      return { kind: "domain", payload: payload.trim(), raw: line };
    }
    return { kind: "remaining", raw: line };
  }

  if (SAFE_DOMAIN_TYPES.has(type)) {
    const domainPayload = domainPayloadFor(type, payload);
    if (isMihomoDomainTriePayload(domainPayload)) {
      return { kind: "domain", payload: domainPayload, raw: line };
    }
    return { kind: "remaining", raw: line };
  }

  if (SAFE_IPCIDR_TYPES.has(type)) {
    const cidrPayload = normalizeCidrPayload(payload, type === "IP-CIDR6" ? 6 : 4);
    if (cidrPayload) return { kind: "ipcidr", payload: cidrPayload, raw: line };
    return { kind: "remaining", raw: line };
  }

  return { kind: "remaining", raw: line };
}

function ruleFromDomainPayload(payload) {
  if (!payload.trim()) return null;
  if (payload.startsWith("+.")) return `DOMAIN-SUFFIX,${payload.slice(2)}`;
  if (payload.startsWith("*.")) return `DOMAIN-WILDCARD,${payload}`;
  return `DOMAIN,${payload}`;
}

function ruleFromCidrPayload(payload) {
  if (!payload.trim()) return null;
  return `${payload.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${payload},no-resolve`;
}

export function buildRulesetPartsForClash(lines) {
  const normalized = normalizeRulesetLines(lines);
  const domains = [];
  const cidrs = [];
  const remaining = [];

  for (const line of normalized) {
    const classified = classifyClassicalRule(line);
    if (classified.kind === "domain") domains.push(classified.payload);
    else if (classified.kind === "ipcidr") cidrs.push(classified.payload);
    else remaining.push(classified.raw);
  }

  const domain = uniqueStable(domains);
  const ipcidr = uniqueStable(cidrs);
  const remainingRules = uniqueStable(remaining);
  const combined = [
    ...domain.map(ruleFromDomainPayload).filter((l) => Boolean(l)),
    ...ipcidr.map(ruleFromCidrPayload).filter((l) => Boolean(l)),
    ...remainingRules,
  ];

  return {
    combined: sortClassicalRulesStable(uniqueStable(combined)),
    domain,
    ipcidr,
    remaining: sortClassicalRulesStable(remainingRules),
  };
}

export function buildSortedRulesetForClash(lines) {
  const normalized = normalizeRulesetLines(lines);
  const sorted = sortAndDedupRulesetLines(normalized, sortBucket);
  return sorted.filter((line) => {
    const type = normalizeRuleType(line);
    return type !== "URL-REGEX" && type !== "USER-AGENT";
  });
}

// ==================== Loon 规则处理 ====================

export function buildSortedRulesetForLoon(lines) {
  const normalized = normalizeRulesetLines(lines);
  return sortAndDedupRulesetLines(normalized, sortBucket).filter((line) => normalizeRuleType(line) !== "PROCESS-NAME");
}

// ==================== Shadowrocket 规则处理 ====================

export function buildSortedRulesetForShadowrocket(lines) {
  const normalized = normalizeRulesetLines(lines);
  return sortAndDedupRulesetLines(normalized, sortBucket).filter((line) => normalizeRuleType(line) !== "PROCESS-NAME");
}

// ==================== QuantumultX 规则处理 ====================

function transformQxLine(line) {
  if (
    line.startsWith("URL-REGEX") ||
    line.startsWith("PROCESS-NAME") ||
    line.startsWith("AND") ||
    line.startsWith("OR") ||
    line.startsWith("NOT") ||
    line.startsWith("DEST-PORT") ||
    line.startsWith("DST-PORT")
  ) {
    return null;
  }

  let x = line;
  x = x.replace(/,no-resolve$/i, "");
  x = x.replace(/^DOMAIN,/, "HOST,");
  x = x.replace(/^DOMAIN-SUFFIX,/, "HOST-SUFFIX,");
  x = x.replace(/^DOMAIN-KEYWORD,/, "HOST-KEYWORD,");
  x = x.replace(/^DOMAIN-WILDCARD,/, "HOST-WILDCARD,");
  x = x.replace(/^IP-CIDR6,/, "IP6-CIDR,");
  return x;
}

export function buildSortedRulesetForQuantumultX(lines) {
  const normalized = normalizeRulesetLines(lines);
  const sorted = sortAndDedupRulesetLines(normalized, sortBucket);
  return sorted.map(transformQxLine).filter((l) => l !== null);
}

function normalizeRuleType(line) {
  const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
  if (type === "DST-PORT") return "DEST-PORT";
  return type;
}
