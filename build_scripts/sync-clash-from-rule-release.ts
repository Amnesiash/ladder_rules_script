import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

type Options = {
  ruleRepo: string;
  ladderRepo: string;
};

function parseArgs(argv: string[]): Options {
  let ruleRepo = "";
  let ladderRepo = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--rule-repo") ruleRepo = argv[++i] ?? ruleRepo;
    else if (arg === "--ladder-repo") ladderRepo = argv[++i] ?? ladderRepo;
    else if (arg === "--help" || arg === "-h") {
      // eslint-disable-next-line no-console
      console.log(
        [
          "Usage:",
          "  bun run build_scripts/sync-clash-from-rule-release.ts --rule-repo <path> [--ladder-repo <path>]",
          "",
          "Notes:",
          "  Expects rule repo to have `.release/Rules/Clash/` (release branch).",
          "  Copies all contents under that folder into `Rules/Clash/` in ladder repo.",
          "  Deletes README* and non-rule files at the rule repo root `.release/` only.",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  if (!ruleRepo) throw new Error("--rule-repo is required");
  if (!ladderRepo) ladderRepo = path.resolve(import.meta.dir, ".."); // default to this repo

  return { ruleRepo, ladderRepo };
}

async function main() {
  const opts = parseArgs(Bun.argv.slice(2));

  const ruleRepoAbs = path.resolve(opts.ruleRepo);
  const ladderRepoAbs = path.resolve(opts.ladderRepo);

  const releaseRoot = path.join(ruleRepoAbs, ".release");
  const releaseStat = await stat(releaseRoot).catch(() => undefined);
  if (!releaseStat?.isDirectory()) {
    throw new Error(`Expected directory not found: ${releaseRoot}`);
  }

  const outDir = path.join(ladderRepoAbs, "Rules", "Clash");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Copy all category directories from rule `.release/*` into ladder `Rules/Clash/*`,
  // excluding README* files. This mirrors the rule repo release branch artifacts.
  const entries = await readdir(releaseRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fromDir = path.join(releaseRoot, entry.name);
    const fromStat = await stat(fromDir).catch(() => undefined);
    if (!fromStat?.isDirectory()) continue;
    const toDir = path.join(outDir, entry.name);
    await mkdir(toDir, { recursive: true });
    await cp(fromDir, toDir, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return !/^README/i.test(base);
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Synced Clash rules: ${outDir}`);
}

await main();
