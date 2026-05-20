import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSourceFile, toSafeFileStem } from "./lib/source";
import { fetchWithFallback } from "./lib/fetch";
import { splitRuleLines } from "./lib/text";
import { formatUpdateTimeShanghai } from "./lib/time";
import { resolveRuleSourcePath } from "./lib/source-path";
import { buildSortedRulesetForLoon } from "./lib/ruleset-sort-loon";
import { buildSortedRulesetForShadowrocket } from "./lib/ruleset-sort-shadowrocket";
import { buildSortedRulesetForQuantumultX } from "./lib/ruleset-sort-quantumultx";
import { buildSortedRulesetForClash } from "./lib/ruleset-sort-clash";

type Options = {
  repoRoot: string;
  outRulesRoot: string;
  clean: boolean;
};

function parseArgs(argv: string[]): Options {
  let repoRoot = ".";
  let outRulesRoot = "Rules";
  let clean = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo-root") repoRoot = argv[++i] ?? repoRoot;
    else if (arg === "--out-rules-root") outRulesRoot = argv[++i] ?? outRulesRoot;
    else if (arg === "--clean") clean = true;
    else if (arg === "--help" || arg === "-h") {
      // eslint-disable-next-line no-console
      console.log(
        [
          "Usage:",
          "  bun run build_scripts/generate-rules.ts [--clean] [--repo-root <path>] [--out-rules-root <dir>]",
          "",
          "Notes:",
          "  - Reads subscriptions from Rules/rule_source.txt.",
          "  - Generates sorted+deduped rules for Clash / Loon / Shadowrocket / QuantumultX.",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return { repoRoot, outRulesRoot, clean };
}

function uniqueOrdered(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const v = line.trim();
    if (!v || v.startsWith("#")) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithFallback(url, {
    headers: { "user-agent": "ladder_rules_script-build" },
  });
  return await res.text();
}

function transformQxLine(line: string): string | null {
  // Match reference behavior: exclude unsupported/complex rule types for QuantumultX ruleset output.
  if (
    line.startsWith("URL-REGEX") ||
    line.startsWith("PROCESS-NAME") ||
    line.startsWith("AND") ||
    line.startsWith("OR") ||
    line.startsWith("NOT") ||
    line.startsWith("DEST-PORT")
  ) {
    return null;
  }

  let x = line;
  x = x.replace(/^DOMAIN,/, "HOST,");
  x = x.replace(/^DOMAIN-SUFFIX,/, "HOST-SUFFIX,");
  x = x.replace(/^DOMAIN-KEYWORD,/, "HOST-KEYWORD,");
  x = x.replace(/^DOMAIN-WILDCARD,/, "HOST-WILDCARD,");
  x = x.replace(/^IP-CIDR6,/, "IP6-CIDR,");
  x = x.replace(/,no-resolve$/i, "");
  return x;
}

function stripUpdateHeader(text: string): string {
  // Our outputs are prefixed with 3 header lines + one blank line:
  //   # NAME: ...
  //   # UPDATE: ...
  //   # TOTAL: ...
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[i]?.startsWith("# NAME:")) i++;
  if (lines[i]?.startsWith("# UPDATE:")) i++;
  if (lines[i]?.startsWith("# TOTAL:")) i++;
  // Drop the first blank line if present.
  if (lines[i] === "") i++;
  return lines.slice(i).join("\n");
}

function formatRulesHeader(name: string, updateTime: string, total: number): string {
  return [`# NAME: ${name}`, `# UPDATE: ${updateTime}`, `# TOTAL: ${total}`, ""].join("\n");
}

function inferAuthorFromUrl(url: string): string {
  try {
    const u = new URL(url);

    if (u.hostname === "raw.githubusercontent.com") {
      // /<owner>/<repo>/<ref>/<path...>
      const parts = u.pathname.split("/").filter(Boolean);
      const owner = parts[0];
      if (owner) return owner;
    }

    if (u.hostname === "github.com") {
      // /<owner>/<repo>/...
      const parts = u.pathname.split("/").filter(Boolean);
      const owner = parts[0];
      if (owner) return owner;
    }

    if (u.hostname === "cdn.jsdelivr.net") {
      // /gh/<owner>/<repo>@<ref>/<path...>
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "gh" && parts[1]) return parts[1];
    }

    return u.hostname;
  } catch {
    return "unknown";
  }
}

function inferOriginalFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (last && !last.endsWith("/")) return last;
    return "";
  } catch {
    return "";
  }
}

async function writeSourceFile(outRoot: string, groupName: string, url: string, rawLines: string[]) {
  const author = inferAuthorFromUrl(url);
  const groupStem = toSafeFileStem(groupName);
  const authorStem = toSafeFileStem(author);

  const outDir = path.join(outRoot, groupStem);
  await mkdir(outDir, { recursive: true });

  const originalName = inferOriginalFilenameFromUrl(url);
  const originalExt = path.extname(originalName) || ".list";
  const originalBase = originalName ? path.basename(originalName, originalExt) : groupStem;
  const filenameStem = toSafeFileStem(originalBase) || groupStem;
  const filename = `${filenameStem}@${authorStem}${originalExt}`;
  const outPath = path.join(outDir, filename);

  // IMPORTANT: `Rules/source/**` must be the raw author file from the URL.
  // Do not normalize, sort, dedup, or strip any suffixes. Only persist the fetched lines.
  await writeFile(outPath, rawLines.join("\n") + "\n");
}

async function writeRulesFile(outDir: string, sectionName: string, rules: string[]) {
  await mkdir(outDir, { recursive: true });
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(sectionName);
  const outPath = path.join(outDir, `${name}.list`);

  // Compare-update semantics:
  // - If the rules content hasn't changed, keep the existing file unchanged (no UPDATE timestamp churn).
  // - Only rewrite when rules differ.
  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingRules = stripUpdateHeader(existing)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith("#"));

  const sameRules =
    existingRules.length === rules.length &&
    existingRules.every((v, i) => v === rules[i]);

  if (sameRules) return;

  const header = formatRulesHeader(name, updateTime, rules.length);
  await writeFile(outPath, header + "\n" + rules.join("\n") + "\n");
}

function parseExistingClashPayload(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => l.trim() === "payload:");
  if (startIndex === -1) return [];
  const payload: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith("- ")) continue;
    payload.push(trimmed.slice(2));
  }
  return payload;
}

async function writeClashRulesFile(outDir: string, sectionName: string, rules: string[]) {
  await mkdir(outDir, { recursive: true });
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(sectionName);
  const outPath = path.join(outDir, `${name}.yaml`);

  // Compare-update semantics: only rewrite when payload differs.
  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingPayload = existing ? parseExistingClashPayload(existing) : [];
  const samePayload =
    existingPayload.length === rules.length &&
    existingPayload.every((v, i) => v === rules[i]);
  if (samePayload) return;

  const header = formatRulesHeader(name, updateTime, rules.length);
  const body = rules.map((r) => `  - ${r}`).join("\n");
  await writeFile(outPath, header + "\n" + "payload:" + "\n" + body + "\n");
}

async function main() {
  const opts = parseArgs(Bun.argv.slice(2));
  const repoRoot = path.resolve(process.cwd(), opts.repoRoot);

  const sourcePath = await resolveRuleSourcePath(repoRoot);
  const sourceText = await readFile(sourcePath, "utf8");
  const sections = parseSourceFile(sourceText);
  if (!sections.length) throw new Error(`No sections found in ${sourcePath}`);

  const loonDir = path.join(repoRoot, opts.outRulesRoot, "Loon");
  const shadowDir = path.join(repoRoot, opts.outRulesRoot, "Shadowrocket");
  const qxDir = path.join(repoRoot, opts.outRulesRoot, "QuantumultX");
  const clashDir = path.join(repoRoot, opts.outRulesRoot, "Clash");
  const sourceDir = path.join(repoRoot, opts.outRulesRoot, "source");

  if (opts.clean) {
    await rm(loonDir, { recursive: true, force: true });
    await rm(shadowDir, { recursive: true, force: true });
    await rm(qxDir, { recursive: true, force: true });
    await rm(clashDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  }

  for (const section of sections) {
    const contents = await Promise.all(section.urls.map((u) => fetchText(u)));

    // Per-author source files under Rules/source/<Group>/<Group>@<Author>.list
    await Promise.all(
      section.urls.map(async (url, idx) => {
        const text = contents[idx] ?? "";
        const lines = splitRuleLines(text);
        await writeSourceFile(sourceDir, section.name, url, lines);
      }),
    );

    const mergedLinesRaw = contents.flatMap((t) => splitRuleLines(t));
    const merged = uniqueOrdered(mergedLinesRaw);

    const loonSorted = buildSortedRulesetForLoon(merged).filter((l) => !l.startsWith("PROCESS-NAME,"));
    const shadowSorted = buildSortedRulesetForShadowrocket(merged).filter((l) => !l.startsWith("PROCESS-NAME,"));
    const qxSorted = buildSortedRulesetForQuantumultX(merged)
      .map((l) => transformQxLine(l))
      .filter((l): l is string => Boolean(l))
      .map((l) => `${l},${section.name}`);

    await writeRulesFile(loonDir, section.name, loonSorted);
    await writeRulesFile(shadowDir, section.name, shadowSorted);
    await writeRulesFile(qxDir, section.name, qxSorted);

    // Clash/Mihomo uses classical rules in YAML "payload:" format.
    const clashSorted = buildSortedRulesetForClash(merged);
    await writeClashRulesFile(clashDir, section.name, clashSorted);
  }
}

await main();
