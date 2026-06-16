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

export function buildSortedRulesetForClash(lines) {
  const normalized = normalizeRulesetLines(lines);
  const sorted = sortAndDedupRulesetLines(normalized, sortBucket);
  return sorted.filter((line) => {
    const type = normalizeRuleType(line);
    return type !== "URL-REGEX" && type !== "USER-AGENT";
  });
}

function normalizeRuleType(line) {
  const type = String(line ?? "").split(",", 1)[0].trim().toUpperCase();
  if (type === "DST-PORT") return "DEST-PORT";
  return type;
}
