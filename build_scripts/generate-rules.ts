import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile, access, chmod, readdir, copyFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { parseSourceFile, toSafeFileStem } from "./lib/source";
import { fetchWithFallback } from "./lib/fetch";
import { splitRuleLines } from "./lib/text";
import { formatUpdateTimeShanghai } from "./lib/time";
import { resolveRuleSourcePath } from "./lib/source-path";
import { buildSortedRulesetForLoon } from "./lib/ruleset-sort-loon";
import { buildSortedRulesetForShadowrocket } from "./lib/ruleset-sort-shadowrocket";
import { buildSortedRulesetForQuantumultX } from "./lib/ruleset-sort-quantumultx";
import { buildRulesetPartsForClash } from "./lib/ruleset-sort-clash";

const MIHOMO_VERSION_URL = "https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt";
const MIHOMO_RELEASE_BASE_URL = "https://github.com/MetaCubeX/mihomo/releases/download";

const execFileAsync = promisify(execFile);

type GeneratedFiles = Set<string>;

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

async function downloadMihomoPackage(url: string, targetPath: string) {
  const res = await fetchWithFallback(url, {
    headers: { "user-agent": "ladder_rules_script-build" },
  });
  if (!res.body) throw new Error(`Mihomo package response had no body: ${url}`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(ReadableStreamToNodeStream(res.body), createWriteStream(targetPath, { mode: 0o755 }));
}

function ReadableStreamToNodeStream(stream: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(stream);
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

function transformQxLine(line: string): string | null {
  // Match reference behavior: exclude unsupported/complex rule types for QuantumultX ruleset output.
  if (
    line.startsWith("URL-REGEX") ||
    line.startsWith("PROCESS-NAME") ||
    line.startsWith("AND") ||
    line.startsWith("OR") ||
    line.startsWith("NOT") ||
    line.startsWith("DEST-PORT") ||
    // GEOIP in upstream lists is often non-country (e.g. GEOIP,NETFLIX) and not usable in QX rulesets.
    line.startsWith("GEOIP")
  ) {
    return null;
  }

  let x = line;
  // QX output should not include ",no-resolve".
  x = x.replace(/,no-resolve$/i, "");
  x = x.replace(/^DOMAIN,/, "HOST,");
  x = x.replace(/^DOMAIN-SUFFIX,/, "HOST-SUFFIX,");
  x = x.replace(/^DOMAIN-KEYWORD,/, "HOST-KEYWORD,");
  x = x.replace(/^DOMAIN-WILDCARD,/, "HOST-WILDCARD,");
  x = x.replace(/^IP-CIDR6,/, "IP6-CIDR,");
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

async function stageGeneratedFile(targetPath: string, workPath: string, content: string | Buffer) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await mkdir(path.dirname(workPath), { recursive: true });
  await writeFile(workPath, next);

  const existing = await readFile(targetPath).catch(() => undefined);
  if (existing?.equals(next)) return targetPath;

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(workPath, targetPath);
  return targetPath;
}

async function writeSourceFile(outRoot: string, workRoot: string, groupName: string, url: string, rawLines: string[]) {
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
  const workPath = path.join(workRoot, groupStem, filename);

  // IMPORTANT: `Rules/source/**` must be the raw author file from the URL.
  // Do not normalize, sort, dedup, or strip any suffixes. Only persist the fetched lines.
  return await stageGeneratedFile(outPath, workPath, rawLines.join("\n") + "\n");
}

function markGenerated(generated: GeneratedFiles, filePath: string) {
  generated.add(path.resolve(filePath));
}

async function writeRulesFile(outDir: string, workDir: string, sectionName: string, rules: string[]) {
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(sectionName);
  const outPath = path.join(outDir, `${name}.list`);
  const workPath = path.join(workDir, `${name}.list`);

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

  if (sameRules) {
    await stageGeneratedFile(outPath, workPath, existing);
    return outPath;
  }

  const header = formatRulesHeader(name, updateTime, rules.length);
  return await stageGeneratedFile(outPath, workPath, header + "\n" + rules.join("\n") + "\n");
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

async function writeClashRulesFile(outDir: string, workDir: string, sectionName: string, rules: string[]) {
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(sectionName);
  const outPath = path.join(outDir, `${name}.yaml`);
  const workPath = path.join(workDir, `${name}.yaml`);

  // Compare-update semantics: only rewrite when payload differs.
  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingPayload = existing ? parseExistingClashPayload(existing) : [];
  const samePayload =
    existingPayload.length === rules.length &&
    existingPayload.every((v, i) => v === rules[i]);
  if (samePayload) {
    await stageGeneratedFile(outPath, workPath, existing);
    return outPath;
  }

  const header = formatRulesHeader(name, updateTime, rules.length);
  const body = rules.map((r) => `  - ${r}`).join("\n");
  return await stageGeneratedFile(outPath, workPath, header + "\n" + "payload:" + "\n" + body + "\n");
}

async function writeClashNamedTextFile(outDir: string, workDir: string, fileStem: string, rules: string[]) {
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(fileStem);
  const outPath = path.join(outDir, `${name}.txt`);
  const workPath = path.join(workDir, `${name}.txt`);

  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingRules = stripUpdateHeader(existing)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith("#"));

  const sameRules =
    existingRules.length === rules.length &&
    existingRules.every((v, i) => v === rules[i]);
  if (sameRules) {
    await stageGeneratedFile(outPath, workPath, existing);
    return outPath;
  }

  const header = formatRulesHeader(name, updateTime, rules.length);
  return await stageGeneratedFile(outPath, workPath, header + "\n" + rules.join("\n") + "\n");
}

function ipcidrTextLineForViewing(line: string): string {
  if (/^IP-CIDR6?,/u.test(line)) return line;
  return `${line.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${line}`;
}

async function writeClashMrsProviderFiles({
  outDir,
  workDir,
  fileStem,
  behavior,
  rules,
  mihomoPath,
}: {
  outDir: string;
  workDir: string;
  fileStem: string;
  behavior: "domain" | "ipcidr";
  rules: string[];
  mihomoPath: string;
}) {
  await mkdir(outDir, { recursive: true });
  await mkdir(workDir, { recursive: true });

  const name = toSafeFileStem(fileStem);
  const sourcePath = path.join(workDir, `${name}.${behavior}.txt`);
  const mrsPath = path.join(outDir, `${name}.mrs`);
  const tmpMrsPath = path.join(workDir, `${name}.mrs`);
  await writeFile(sourcePath, rules.join("\n") + "\n");

  try {
    await execFileAsync(mihomoPath, ["convert-ruleset", behavior, "text", sourcePath, tmpMrsPath], {
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join("\n").trim();
    throw new Error(`Mihomo convert-ruleset failed for ${name}: ${detail}`);
  }

  const nextMrs = await readFile(tmpMrsPath);
  await stageGeneratedFile(mrsPath, tmpMrsPath, nextMrs);

  const visibleRules = behavior === "ipcidr" ? rules.map(ipcidrTextLineForViewing) : rules;
  const txtPath = await writeClashNamedTextFile(outDir, workDir, name, visibleRules);
  return { mrsPath, txtPath };
}

async function writeClashNamedYamlFile(outDir: string, workDir: string, fileStem: string, rules: string[]) {
  const updateTime = formatUpdateTimeShanghai(new Date());
  const name = toSafeFileStem(fileStem);
  const outPath = path.join(outDir, `${name}.yaml`);
  const workPath = path.join(workDir, `${name}.yaml`);

  const existing = await readFile(outPath, "utf8").catch(() => "");
  const existingPayload = existing ? parseExistingClashPayload(existing) : [];
  const samePayload =
    existingPayload.length === rules.length &&
    existingPayload.every((v, i) => v === rules[i]);
  if (samePayload) {
    await stageGeneratedFile(outPath, workPath, existing);
    return outPath;
  }

  const header = formatRulesHeader(name, updateTime, rules.length);
  const body = rules.map((r) => `  - ${r}`).join("\n");
  return await stageGeneratedFile(outPath, workPath, header + "\n" + "payload:" + "\n" + body + "\n");
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRecursively(p)));
    else if (entry.isFile()) files.push(p);
  }
  return files;
}

async function pruneEmptyDirs(dir: string, root: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) await pruneEmptyDirs(path.join(dir, entry.name), root);
  }
  if (path.resolve(dir) === path.resolve(root)) return;
  const remaining = await readdir(dir).catch(() => []);
  if (remaining.length === 0) await rm(dir, { recursive: true, force: true });
}

async function pruneStaleGeneratedFiles(roots: string[], generated: GeneratedFiles) {
  for (const root of roots) {
    const files = await listFilesRecursively(root);
    for (const file of files) {
      if (generated.has(path.resolve(file))) continue;
      await rm(file, { force: true });
    }
    await pruneEmptyDirs(root, root);
  }
}

function addNoResolveForIpRules(lines: string[]): string[] {
  // Only apply to clients that support it (Clash/Loon/Shadowrocket).
  // QX explicitly strips it in transformQxLine.
  return lines.map((line) => {
    if (line.startsWith("IP-CIDR,") || line.startsWith("IP-CIDR6,")) {
      if (/,no-resolve$/i.test(line)) return line;
      return `${line},no-resolve`;
    }
    return line;
  });
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
  const rulesWorkRoot = path.join(repoRoot, ".rules-work", opts.outRulesRoot);
  const loonWorkDir = path.join(rulesWorkRoot, "Loon");
  const shadowWorkDir = path.join(rulesWorkRoot, "Shadowrocket");
  const qxWorkDir = path.join(rulesWorkRoot, "QuantumultX");
  const clashWorkDir = path.join(rulesWorkRoot, "Clash");
  const sourceWorkDir = path.join(rulesWorkRoot, "source");
  const generated: GeneratedFiles = new Set();

  if (opts.clean) {
    await rm(loonDir, { recursive: true, force: true });
    await rm(shadowDir, { recursive: true, force: true });
    await rm(qxDir, { recursive: true, force: true });
    await rm(clashDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  }
  await rm(rulesWorkRoot, { recursive: true, force: true });

  for (const section of sections) {
    const contents = await Promise.all(section.urls.map((u) => fetchText(u)));

    // Per-author source files under Rules/source/<Group>/<Group>@<Author>.list
    await Promise.all(
      section.urls.map(async (url, idx) => {
        const text = contents[idx] ?? "";
        const lines = splitRuleLines(text);
        markGenerated(generated, await writeSourceFile(sourceDir, sourceWorkDir, section.name, url, lines));
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

    markGenerated(generated, await writeRulesFile(loonDir, loonWorkDir, section.name, addNoResolveForIpRules(loonSorted)));
    markGenerated(generated, await writeRulesFile(shadowDir, shadowWorkDir, section.name, addNoResolveForIpRules(shadowSorted)));
    markGenerated(generated, await writeRulesFile(qxDir, qxWorkDir, section.name, qxSorted));

    // Main branch keeps only the combined classical provider. Split MRS/TXT providers
    // are produced by build-release into .release/Clash.
    const clashParts = buildRulesetPartsForClash(merged);
    markGenerated(generated, await writeClashRulesFile(clashDir, clashWorkDir, section.name, clashParts.combined));
  }

  await pruneStaleGeneratedFiles([loonDir, shadowDir, qxDir, clashDir, sourceDir], generated);
}

await main();
