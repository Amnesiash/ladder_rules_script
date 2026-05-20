import { isIP } from "node:net";
import { normalizeRulesetLines } from "./ruleset-sort-common";

const SAFE_DOMAIN_TYPES = new Set(["DOMAIN-SUFFIX", "DOMAIN-WILDCARD"]);
const SAFE_IPCIDR_TYPES = new Set(["IP-CIDR", "IP-CIDR6"]);

type ClassifiedRule =
  | { kind: "domain"; payload: string; raw: string }
  | { kind: "ipcidr"; payload: string; raw: string }
  | { kind: "remaining"; raw: string };

export type ClashRulesetParts = {
  combined: string[];
  domain: string[];
  ipcidr: string[];
  remaining: string[];
};

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

function uniqueStable(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function sortClassicalRulesStable(lines: string[]): string[] {
  return lines
    .map((line, index) => ({ line, index, bucket: sortBucket(line) }))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      return a.index - b.index;
    })
    .map((item) => item.line);
}

function parseClassicalPayload(line: string): { type: string; payload: string } {
  const parts = line.split(",").map((part) => part.trim());
  return {
    type: (parts[0] ?? "").toUpperCase(),
    payload: parts[1] ?? "",
  };
}

function isMihomoDomainTriePayload(domain: string): boolean {
  if (!domain || domain.endsWith(".")) return false;
  if (/^\s|\s$/u.test(domain)) return false;
  if (/['"]/u.test(domain)) return false;
  const parts = domain.toLowerCase().split(".");
  if (parts.length === 1) return parts[0] !== "";
  return parts.slice(1).every((part) => part !== "");
}

function isLiteralClassicalDomainPayload(domain: string): boolean {
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

function domainPayloadFor(type: string, payload: string): string {
  const value = payload.trim();
  if (type === "DOMAIN-SUFFIX") return `+.${value.replace(/^\.+/u, "")}`;
  return value;
}

function normalizeCidrPayload(value: string, family: 0 | 4 | 6): string | null {
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

function classifyClassicalRule(line: string): ClassifiedRule {
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

function ruleFromDomainPayload(payload: string): string | null {
  if (!payload.trim()) return null;
  if (payload.startsWith("+.")) return `DOMAIN-SUFFIX,${payload.slice(2)}`;
  if (payload.startsWith("*.")) return `DOMAIN-WILDCARD,${payload}`;
  return `DOMAIN,${payload}`;
}

function ruleFromCidrPayload(payload: string): string | null {
  if (!payload.trim()) return null;
  return `${payload.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${payload},no-resolve`;
}

export function buildRulesetPartsForClash(lines: string[]): ClashRulesetParts {
  const normalized = normalizeRulesetLines(lines);
  const domains: string[] = [];
  const cidrs: string[] = [];
  const remaining: string[] = [];

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
    ...domain.map(ruleFromDomainPayload).filter((l): l is string => Boolean(l)),
    ...ipcidr.map(ruleFromCidrPayload).filter((l): l is string => Boolean(l)),
    ...remainingRules,
  ];

  return {
    combined: sortClassicalRulesStable(uniqueStable(combined)),
    domain,
    ipcidr,
    remaining: sortClassicalRulesStable(remainingRules),
  };
}

export function buildSortedRulesetForClash(lines: string[]): string[] {
  return buildRulesetPartsForClash(lines).combined;
}
