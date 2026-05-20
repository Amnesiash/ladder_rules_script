function stripInlineSuffixComments(line: string): string {
  const index = line.indexOf(" //");
  if (index === -1) return line;
  return line.slice(0, index);
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("#") || trimmed.startsWith(";");
}

function normalizeCommaSpacing(line: string): string {
  return line.replace(/,\s*/g, ",");
}

function stripNoResolveSuffix(line: string): string {
  return line.replace(/,no-resolve$/iu, "");
}

function isLikelyYamlHeaderLine(line: string): boolean {
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

function normalizeLooseDomainSyntax(line: string): string {
  // Some upstream lists use adblock-style "+.example.com" or bare domains.
  // Convert them into classical rules so they can be consumed by all clients.
  if (line.startsWith("+.")) {
    const domain = line.slice(2).trim();
    if (!domain) return line;
    return `DOMAIN-SUFFIX,${domain}`;
  }

  // Bare domain (no commas, no spaces), treat as DOMAIN-SUFFIX.
  // This matches common ruleset expectations better than leaving it as-is.
  if (!line.includes(",") && !/\s/u.test(line)) {
    // IPv6-ish tokens should not be treated as domains.
    if (line.includes(":")) return line;
    // Exclude IP/CIDR-ish tokens from being misclassified.
    if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(?:\/[0-9]+)?$/u.test(line)) return line;
    if (/^(?:[a-fA-F0-9]+:|(?:[a-fA-F0-9]+:+)+[a-fA-F0-9]+)(?:\/[0-9]+)?$/u.test(line)) return line;
    return `DOMAIN-SUFFIX,${line}`;
  }

  return line;
}

function ensureCidrPrefixes(line: string): string {
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
      // Accept shorthand IPv6 CIDR notations like "::/127".
      out = `IP-CIDR6,${out}`;
    }
  }

  return out;
}

export function normalizeRulesetLines(lines: string[]): string[] {
  return lines
    .map((l) => String(l ?? ""))
    .map((l) => stripInlineSuffixComments(l))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !isCommentLine(l))
    .filter((l) => !isLikelyYamlHeaderLine(l))
    .map(normalizeCommaSpacing)
    .map(stripNoResolveSuffix)
    .map(normalizeLooseDomainSyntax)
    .map(ensureCidrPrefixes);
}

export function sortAndDedupRulesetLines(lines: string[], bucketOf: (line: string) => number): string[] {
  const indexed = lines.map((line) => ({ line, bucket: bucketOf(line) }));
  indexed.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    return a.line.localeCompare(b.line);
  });

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of indexed) {
    const key = item.line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item.line);
  }
  return deduped;
}
