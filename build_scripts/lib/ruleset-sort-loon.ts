import { normalizeRulesetLines, sortAndDedupRulesetLines } from "./ruleset-sort-common";

function sortBucket(line: string): number {
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

export function buildSortedRulesetForLoon(lines: string[]): string[] {
  const normalized = normalizeRulesetLines(lines);
  return sortAndDedupRulesetLines(normalized, sortBucket);
}

