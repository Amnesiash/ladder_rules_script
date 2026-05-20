import { normalizeRulesetLines, sortAndDedupRulesetLines } from "./ruleset-sort-common";

function sortBucket(line: string): number {
  // Keep consistent with the reference sort buckets.
  if (line.startsWith("DOMAIN,")) return 0;
  if (line.startsWith("DOMAIN-SUFFIX,")) return 1;
  if (line.startsWith("DOMAIN-KEYWORD,")) return 2;
  if (line.startsWith("DOMAIN-WILDCARD,")) return 3;
  if (line.startsWith("IP-CIDR,")) return 4;
  if (line.startsWith("IP-CIDR6,")) return 5;
  if (line.startsWith("IP-ASN,")) return 6;
  if (line.startsWith("PROCESS-NAME,")) return 7;
  if (line.startsWith("URL-REGEX,")) return 8;
  if (line.startsWith("USER-AGENT,")) return 9;
  if (line.startsWith("GEOIP,")) return 10;
  if (line.startsWith("AND,")) return 11;
  if (line.startsWith("OR,")) return 12;
  if (line.startsWith("NOT,")) return 13;
  if (line.startsWith("DEST-PORT,")) return 14;
  return 15;
}

function filterForClashProviders(line: string): string | null {
  // Match the reference workflow: drop USER-AGENT and URL-REGEX for Clash/Mihomo providers.
  if (line.startsWith("USER-AGENT,")) return null;
  if (line.startsWith("URL-REGEX,")) return null;
  return line;
}

export function buildSortedRulesetForClash(lines: string[]): string[] {
  const normalized = normalizeRulesetLines(lines);
  const sorted = sortAndDedupRulesetLines(normalized, sortBucket);
  return sorted.map(filterForClashProviders).filter((l): l is string => Boolean(l));
}

