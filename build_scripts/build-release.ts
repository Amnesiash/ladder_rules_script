import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

type BuildOptions = {
  clean: boolean;
  prune: boolean;
  outDir: string;
  rulesDir: string;
  repo?: string;
};

function parseArgs(argv: string[]): BuildOptions {
  let clean = true;
  let prune = false;
  let outDir = ".release";
  let rulesDir = "Rules";
  let repo: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--clean") clean = true;
    else if (arg === "--no-clean") clean = false;
    else if (arg === "--prune") prune = true;
    else if (arg === "--out" || arg === "-o") outDir = argv[++i] ?? outDir;
    else if (arg === "--rules" || arg === "-r") rulesDir = argv[++i] ?? rulesDir;
    else if (arg === "--repo") repo = argv[++i] ?? repo;
    else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else if (arg?.startsWith("--")) {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return { clean, prune, outDir, rulesDir, repo };
}

function printHelpAndExit(): never {
  // Keep this short: intended for terminal usage.
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  bun run build:release [--no-clean] [--prune] [--out <dir>] [--rules <dir>] [--repo <name>]",
      "",
      "Options:",
      "  --no-clean     Do not remove output dir before build.",
      "  --clean        Remove output dir before build (default).",
      "  --prune        Delete README* and *.json under output dir.",
      "  --out, -o      Output directory (default: .release).",
      "  --rules, -r    Rules directory to package (default: Rules).",
      "  --repo         Optional repo name to record in BUILD_INFO.json.",
    ].join("\n"),
  );
  process.exit(0);
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(p)));
    } else if (entry.isFile()) {
      files.push(p);
    }
  }
  return files;
}

async function pruneReleaseDir(outDirAbs: string): Promise<void> {
  const files = await listFilesRecursively(outDirAbs);
  const toDelete = files.filter((p) => {
    const base = path.basename(p);
    return /^README/i.test(base) || base.toLowerCase().endsWith(".json");
  });
  await Promise.all(
    toDelete.map((p) => rm(p, { force: true })),
  );
}

async function main() {
  const opts = parseArgs(Bun.argv.slice(2));

  const repoRoot = path.resolve(import.meta.dir, "..");
  const outDirAbs = path.resolve(repoRoot, opts.outDir);
  const rulesDirAbs = path.resolve(repoRoot, opts.rulesDir);

  const rulesStat = await stat(rulesDirAbs).catch(() => undefined);
  if (!rulesStat?.isDirectory()) {
    throw new Error(`Rules directory not found: ${rulesDirAbs}`);
  }

  if (opts.clean) {
    // eslint-disable-next-line no-console
    console.log(`Cleaning ${opts.outDir}/`);
    await rm(outDirAbs, { recursive: true, force: true });
  }

  await mkdir(outDirAbs, { recursive: true });

  // Publish as:
  //   .release/Clash
  //   .release/Loon
  //   .release/QuantumultX
  //   .release/Shadowrocket
  //
  // i.e. do not wrap in an extra Rules/ folder to match downstream expectations.
  const entries = await readdir(rulesDirAbs, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      if (entry.name === "Custom") return; // Requirement: do not publish Custom folder.
      const src = path.join(rulesDirAbs, entry.name);
      const dst = path.join(outDirAbs, entry.name);
      await rm(dst, { recursive: true, force: true });
      await cp(src, dst, { recursive: true });
    }),
  );

  if (opts.prune) {
    await pruneReleaseDir(outDirAbs);
  }

  const fileCount = (await listFilesRecursively(outDirAbs)).length;
  // eslint-disable-next-line no-console
  console.log(`Built ${opts.outDir}/ (files: ${fileCount})`);
}

await main();
