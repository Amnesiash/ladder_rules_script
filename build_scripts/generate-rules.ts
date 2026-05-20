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
          "  - Generates sorted+deduped rules for Loon / Shadowrocket / QuantumultX.",
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

async function writeRulesFile(outDir: string, sectionName: string, rules: string[]) {
  await mkdir(outDir, { recursive: true });
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(sectionName);
  const outPath = path.join(outDir, `${name}.list`);

  // Compare-update semantics:
  // - If the rules content hasn't changed, keep the existing file unchanged (no UPDATE timestamp churn).
  // - Only rewrite when rules differ.
  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingRules = existing
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith("#"));

  const sameRules =
    existingRules.length === rules.length &&
    existingRules.every((v, i) => v === rules[i]);

  if (sameRules) return;

  const header = [`# NAME: ${name}`, `# UPDATE: ${updateTime}`, `# TOTAL: ${rules.length}`, "", ""].join("\n");
  await writeFile(outPath, header + rules.join("\n") + "\n");
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

  if (opts.clean) {
    await rm(loonDir, { recursive: true, force: true });
    await rm(shadowDir, { recursive: true, force: true });
    await rm(qxDir, { recursive: true, force: true });
  }

  for (const section of sections) {
    const contents = await Promise.all(section.urls.map((u) => fetchText(u)));
    const merged = uniqueOrdered(contents.flatMap((t) => splitRuleLines(t)));

    const loonSorted = buildSortedRulesetForLoon(merged).filter((l) => !l.startsWith("PROCESS-NAME,"));
    const shadowSorted = buildSortedRulesetForShadowrocket(merged).filter((l) => !l.startsWith("PROCESS-NAME,"));
    const qxSorted = buildSortedRulesetForQuantumultX(merged)
      .map((l) => transformQxLine(l))
      .filter((l): l is string => Boolean(l))
      .map((l) => `${l},${section.name}`);

    await writeRulesFile(loonDir, section.name, loonSorted);
    await writeRulesFile(shadowDir, section.name, shadowSorted);
    await writeRulesFile(qxDir, section.name, qxSorted);
  }
}

await main();
