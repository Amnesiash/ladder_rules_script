import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
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
          "  Expects rule repo artifacts to have either:",
          "  - `Clash/` at artifacts root, OR",
          "  - `Rules/Clash/` at artifacts root.",
          "  Copies all category folders under that location into `Rules/Clash/` in ladder repo.",
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

  // The upstream rule repo may expose artifacts either at:
  // - repoRoot/.release/* (build output in a working tree), OR
  // - repoRoot/* directly (when checking out its `release` branch).
  const dotReleaseRoot = path.join(ruleRepoAbs, ".release");
  const dotReleaseStat = await stat(dotReleaseRoot).catch(() => undefined);
  const artifactsRoot = dotReleaseStat?.isDirectory() ? dotReleaseRoot : ruleRepoAbs;

  const outDir = path.join(ladderRepoAbs, "Rules", "Clash");
  const tmpDir = path.join(ladderRepoAbs, ".tmp-sync-clash");
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  async function findClashRoot(root: string): Promise<string | null> {
    const directCandidates = [
      path.join(root, "Clash"),
      path.join(root, "Rules", "Clash"),
      path.join(root, "rules", "Clash"),
      path.join(root, "Rules", "clash"),
      path.join(root, "rules", "clash"),
    ];
    for (const c of directCandidates) {
      if ((await stat(c).catch(() => undefined))?.isDirectory()) return c;
    }

    async function walkDirs(dir: string, depth: number): Promise<string | null> {
      if (depth < 0) return null;
      const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        if (!d.isDirectory()) continue;
        if (d.name === ".git" || d.name === "node_modules" || d.name === ".bun") continue;
        const abs = path.join(dir, d.name);
        if (d.name.toLowerCase() === "clash") return abs;
        const found = await walkDirs(abs, depth - 1);
        if (found) return found;
      }
      return null;
    }

    return await walkDirs(root, 4);
  }

  const clashRoot = await findClashRoot(artifactsRoot);
  if (!clashRoot) {
    throw new Error(`Clash artifacts not found under: ${artifactsRoot}`);
  }

  // Copy all category directories from rule `.release/*` into ladder `Rules/Clash/*`,
  // excluding README* files. This mirrors the rule repo release branch artifacts.
  const entries = await readdir(clashRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git") continue;
    if (entry.name === ".github") continue;
    if (entry.name === "node_modules") continue;
    if (entry.name === ".bun") continue;
    if (entry.name === ".release") continue;
    const fromDir = path.join(clashRoot, entry.name);
    const fromStat = await stat(fromDir).catch(() => undefined);
    if (!fromStat?.isDirectory()) continue;
    const toDir = path.join(tmpDir, entry.name);
    await mkdir(toDir, { recursive: true });
    await cp(fromDir, toDir, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return !/^README/i.test(base);
      },
    });
  }

  async function listFilesRecursively(dir: string): Promise<string[]> {
    const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const d of dirents) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) files.push(...(await listFilesRecursively(p)));
      else if (d.isFile()) files.push(p);
    }
    return files;
  }

  async function hashTree(root: string): Promise<string> {
    const files = (await listFilesRecursively(root)).sort();
    const h = createHash("sha256");
    for (const abs of files) {
      const rel = path.relative(root, abs).replaceAll(path.sep, "/");
      h.update(rel);
      h.update("\0");
      h.update(await readFile(abs));
      h.update("\0");
    }
    return h.digest("hex");
  }

  const newHash = await hashTree(tmpDir);
  const existingStat = await stat(outDir).catch(() => undefined);
  const oldHash = existingStat?.isDirectory() ? await hashTree(outDir) : "";

  if (oldHash && oldHash === newHash) {
    await rm(tmpDir, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log(`Clash rules unchanged: ${outDir}`);
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.dirname(outDir), { recursive: true });
  await cp(tmpDir, outDir, { recursive: true });
  await rm(tmpDir, { recursive: true, force: true });

  // eslint-disable-next-line no-console
  console.log(`Synced Clash rules: ${outDir}`);
}

await main();
