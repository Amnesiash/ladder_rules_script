import { createReadStream, createWriteStream } from "node:fs";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile, access, chmod } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { toSafeFileStem } from "./lib/source";
import { fetchWithFallback } from "./lib/fetch";
import { buildRulesetPartsForClash } from "./lib/ruleset-sort-clash";

const MIHOMO_VERSION_URL = "https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt";
const MIHOMO_RELEASE_BASE_URL = "https://github.com/MetaCubeX/mihomo/releases/download";
const execFileAsync = promisify(execFile);

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

function platformToGoos(platform = process.platform): string {
  return platform === "win32" ? "windows" : platform;
}

function archToGoarch(arch = process.arch): string {
  if (arch === "x64") return "amd64";
  if (arch === "ia32") return "386";
  return arch;
}

function mihomoBaseName(): string {
  const goos = platformToGoos();
  const goarch = archToGoarch();
  if (goarch === "amd64") return `mihomo-${goos}-${goarch}-v1`;
  if (goarch === "arm64") return goos === "android" ? `mihomo-${goos}-${goarch}-v8` : `mihomo-${goos}-${goarch}`;
  return `mihomo-${goos}-${goarch}`;
}

async function fetchMihomoVersion(): Promise<string> {
  const res = await fetchWithFallback(MIHOMO_VERSION_URL, {
    headers: { "user-agent": "ladder_rules_script-build" },
  });
  const version = (await res.text()).trim();
  if (!version) throw new Error("Mihomo version response was empty");
  if (!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/u.test(version)) {
    throw new Error(`Unexpected Mihomo version response: ${version.slice(0, 80)}`);
  }
  return version;
}

function readableStreamToNodeStream(stream: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(stream);
}

async function downloadMihomoPackage(url: string, targetPath: string) {
  const res = await fetchWithFallback(url, {
    headers: { "user-agent": "ladder_rules_script-build" },
  });
  if (!res.body) throw new Error(`Mihomo package response had no body: ${url}`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(readableStreamToNodeStream(res.body), createWriteStream(targetPath, { mode: 0o755 }));
}

async function ensureMihomo(repoRoot: string): Promise<string> {
  const version = await fetchMihomoVersion().catch(async () => {
    const cacheRoot = path.join(repoRoot, ".tools", "mihomo-release");
    const cached = (await readdir(cacheRoot).catch(() => []))
      .filter((name) => /^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/u.test(name))
      .sort()
      .at(-1);
    if (!cached) throw new Error("Unable to resolve Mihomo version and no cached Mihomo binary was found");
    return cached;
  });
  const baseName = mihomoBaseName();
  const cacheDir = path.join(repoRoot, ".tools", "mihomo-release", version);
  const binaryPath = path.join(cacheDir, baseName);

  try {
    await access(binaryPath);
    return binaryPath;
  } catch {
    // Download below.
  }

  const packageName = `${baseName}-${version}.gz`;
  const packagePath = path.join(cacheDir, packageName);
  const packageUrl = `${MIHOMO_RELEASE_BASE_URL}/${version}/${packageName}`;
  await downloadMihomoPackage(packageUrl, packagePath);
  await pipeline(createReadStream(packagePath), zlib.createGunzip(), createWriteStream(binaryPath, { mode: 0o755 }));
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

function parseExistingClashPayload(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => l.trim() === "payload:");
  if (startIndex === -1) return [];
  const payload: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("- ")) continue;
    payload.push(trimmed.slice(2));
  }
  return payload;
}

function formatRulesHeader(name: string, total: number): string {
  const updateTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(/\//g, "-");
  return [`# NAME: ${name}`, `# UPDATE: ${updateTime}`, `# TOTAL: ${total}`, ""].join("\n");
}

function ipcidrTextLineForViewing(line: string): string {
  if (/^IP-CIDR6?,/u.test(line)) return line.replace(/,no-resolve$/iu, "");
  return `${line.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${line}`;
}

async function writeClashNamedTextFile(outDir: string, fileStem: string, rules: string[]) {
  const name = toSafeFileStem(fileStem);
  const outPath = path.join(outDir, `${name}.txt`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, formatRulesHeader(name, rules.length) + "\n" + rules.join("\n") + "\n");
}

async function writeClashNamedYamlFile(outDir: string, fileStem: string, rules: string[]) {
  const name = toSafeFileStem(fileStem);
  const outPath = path.join(outDir, `${name}.yaml`);
  const body = rules.map((r) => `  - ${r}`).join("\n");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, formatRulesHeader(name, rules.length) + "\n" + "payload:" + "\n" + body + "\n");
}

async function writeClashMrsProviderFiles({
  outDir,
  fileStem,
  behavior,
  rules,
  mihomoPath,
}: {
  outDir: string;
  fileStem: string;
  behavior: "domain" | "ipcidr";
  rules: string[];
  mihomoPath: string;
}) {
  const name = toSafeFileStem(fileStem);
  const tmpDir = path.join(outDir, ".tmp");
  const sourcePath = path.join(tmpDir, `${name}.${behavior}.txt`);
  const mrsPath = path.join(outDir, `${name}.mrs`);
  await mkdir(tmpDir, { recursive: true });
  await writeFile(sourcePath, rules.join("\n") + "\n");

  try {
    await execFileAsync(mihomoPath, ["convert-ruleset", behavior, "text", sourcePath, mrsPath], {
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join("\n").trim();
    throw new Error(`Mihomo convert-ruleset failed for ${name}: ${detail}`);
  }

  const visibleRules = behavior === "ipcidr" ? rules.map(ipcidrTextLineForViewing) : rules;
  await writeClashNamedTextFile(outDir, name, visibleRules);
  await rm(tmpDir, { recursive: true, force: true });
}

async function buildReleaseClash(clashRulesDir: string, releaseClashDir: string, mihomoPath: string) {
  const entries = await readdir(clashRulesDir, { withFileTypes: true }).catch(() => []);
  await rm(releaseClashDir, { recursive: true, force: true });
  await mkdir(releaseClashDir, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;
    const sourcePath = path.join(clashRulesDir, entry.name);
    const content = await readFile(sourcePath, "utf8");
    const sectionName = toSafeFileStem(path.basename(entry.name, ".yaml"));
    const outDir = path.join(releaseClashDir, sectionName);

    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `${sectionName}.yaml`), content);

    const payload = parseExistingClashPayload(content);
    const parts = buildRulesetPartsForClash(payload);
    if (parts.domain.length > 0) {
      await writeClashMrsProviderFiles({
        outDir,
        fileStem: `${sectionName}_Domain`,
        behavior: "domain",
        rules: parts.domain,
        mihomoPath,
      });
    }
    if (parts.ipcidr.length > 0) {
      await writeClashMrsProviderFiles({
        outDir,
        fileStem: `${sectionName}_IP`,
        behavior: "ipcidr",
        rules: parts.ipcidr,
        mihomoPath,
      });
    }
    if (parts.remaining.length > 0) {
      await writeClashNamedYamlFile(outDir, `${sectionName}_Remaining`, parts.remaining);
    }
  }
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
  const mihomoPath = await ensureMihomo(repoRoot);

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
      if (entry.name === "source") return; // Internal: per-author source artifacts for development.
      const src = path.join(rulesDirAbs, entry.name);
      const dst = path.join(outDirAbs, entry.name);
      await rm(dst, { recursive: true, force: true });
      if (entry.name === "Clash") {
        await buildReleaseClash(src, dst, mihomoPath);
        return;
      }
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
