import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { fetchWithFallback } from "./subscriptions.mjs";

export const releaseDownloadBaseURL = "https://github.com/MetaCubeX/mihomo/releases/download/";
export const releaseVersionURL = "https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt";
export const alphaDownloadBaseURL = "https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/";
export const alphaVersionURL = "https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/version.txt";
export const defaultMihomoChannel = "release";

const channelConfigs = {
  release: {
    label: "release",
    cacheName: "mihomo-release",
    versionURL: releaseVersionURL,
    packageURL: ({ version, packageName }) => `${releaseDownloadBaseURL}${version}/${packageName}`,
  },
  alpha: {
    label: "Alpha",
    cacheName: "mihomo-alpha",
    versionURL: alphaVersionURL,
    packageURL: ({ packageName }) => `${alphaDownloadBaseURL}${packageName}`,
  },
};

export class MihomoDownloadError extends Error {
  constructor(message) {
    super(message);
    this.name = "MihomoDownloadError";
  }
}

export function normalizeMihomoChannel(channel = defaultMihomoChannel) {
  const normalized = String(channel).trim().toLowerCase();
  if (normalized in channelConfigs) return normalized;
  throw new MihomoDownloadError("mihomo channel must be one of release, alpha");
}

export function platformToGoos(platform = process.platform) {
  return platform === "win32" ? "windows" : platform;
}

export function archToGoarch(arch = process.arch) {
  switch (arch) {
    case "x64": return "amd64";
    case "ia32": return "386";
    default: return arch;
  }
}

export function coreBaseName({
  platform = process.platform,
  arch = process.arch,
  goamd64 = process.env.GOAMD64 || "v1",
} = {}) {
  const goos = platformToGoos(platform);
  const goarch = archToGoarch(arch);
  switch (goarch) {
    case "arm64": return goos === "android" ? `mihomo-${goos}-${goarch}-v8` : `mihomo-${goos}-${goarch}`;
    case "amd64": return `mihomo-${goos}-${goarch}-${goamd64}`;
    default: return `mihomo-${goos}-${goarch}`;
  }
}

export async function fetchMihomoVersion(channel = "release", fetchImpl = fetch) {
  const config = channelConfigs[channel] || channelConfigs.release;
  const res = await fetchWithFallback(config.versionURL, {
    headers: { "user-agent": "ladder_rules_script-build" },
  }, fetchImpl);
  const version = (await res.text()).trim();
  if (!version) throw new MihomoDownloadError("Mihomo version response was empty");
  if (!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/u.test(version)) {
    throw new MihomoDownloadError(`Unexpected Mihomo version: ${version.slice(0, 80)}`);
  }
  return version;
}

export async function installMihomo({
  cacheRoot,
  channel = "release",
  fetchImpl = fetch,
}) {
  normalizeMihomoChannel(channel);
  const config = channelConfigs[channel];

  const version = await fetchMihomoVersion(channel, fetchImpl).catch(async () => {
    const cached = (await fs.readdir(cacheRoot).catch(() => []))
      .filter((name) => /^v\d+\.\d+\.\d+/u.test(name))
      .sort()
      .at(-1);
    if (!cached) throw new MihomoDownloadError("Unable to resolve Mihomo version and no cached binary found");
    return cached;
  });

  const baseName = coreBaseName();
  const cacheDir = path.join(cacheRoot, config.cacheName, version);
  const binaryPath = path.join(cacheDir, baseName);

  try {
    await fs.access(binaryPath);
    return binaryPath;
  } catch {
    // Download below
  }

  const packageName = `${baseName}-${version}.gz`;
  const packagePath = path.join(cacheDir, packageName);
  const packageUrl = config.packageURL({ version, packageName });

  await fs.mkdir(path.dirname(packagePath), { recursive: true });
  const res = await fetchWithFallback(packageUrl, {
    headers: { "user-agent": "ladder_rules_script-build" },
  }, fetchImpl);
  if (!res.body) throw new MihomoDownloadError(`Mihomo package response had no body`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(packagePath, { mode: 0o755 }));

  await pipeline(
    createReadStream(packagePath),
    zlib.createGunzip(),
    createWriteStream(binaryPath, { mode: 0o755 })
  );

  await fs.chmod(binaryPath, 0o755);
  return binaryPath;
}
