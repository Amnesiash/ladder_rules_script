#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildRelease } from "./lib/artifacts.mjs";
import { backupSourceTxtEntries } from "./lib/subscriptions.mjs";
import { loadPreviousManifest, compareProviderArtifactChanges, sendTelegramNotification } from "./lib/notifications.mjs";
import { renderRulesReadme } from "./lib/links.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      i += 1;
    }
  }
  return options;
}

function printHelpAndExit() {
  console.log(
    [
      "Usage:",
      "  bun run build_scripts/build-release.mjs [options]",
      "",
      "Options:",
      "  --clean        Remove output dir before build (default).",
      "  --no-clean     Do not remove output dir before build.",
      "  --prune        Delete README* and *.json under output dir.",
      "  --out, -o      Output directory (default: .release).",
      "  --rules, -r    Rules directory to package (default: Rules).",
      "  --repo         GitHub repo name (owner/repo).",
      "  --telegram-dry-run  Test Telegram notification without sending.",
      "  --help, -h     Show this help message.",
    ].join("\n"),
  );
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  printHelpAndExit();
}

const projectRoot = process.cwd();

function formatUpdateTimeShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")} ${map.get("hour")}:${map.get("minute")}`;
}

async function inferRepositoryFromGit(projectDir) {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
      cwd: projectDir,
      maxBuffer: 1024 * 1024,
    });
    const url = String(stdout ?? "").trim();
    if (!url) return undefined;

    const sshMatch = url.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u);
    if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u);
    if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  } catch {
    // ignore
  }
  return undefined;
}

async function main() {
  // 备份 source.txt
  await backupSourceTxtEntries({
    projectRoot,
    sourceRoot: path.resolve(projectRoot, args.source ?? "source"),
  });

  // 获取仓库信息
  const repository =
    args.repo ??
    process.env.GITHUB_REPOSITORY ??
    (await inferRepositoryFromGit(projectRoot));
  
  if (!repository) {
    throw new Error('缺少仓库信息：请设置环境变量 GITHUB_REPOSITORY，或使用参数 --repo "owner/repo"');
  }

  // 加载之前的 manifest（用于变更检测）
  let previousManifest = await loadPreviousManifest({
    previousReleaseDir: path.resolve(projectRoot, args.out ?? "Rules"),
  });
  if (!previousManifest) {
    previousManifest = await loadPreviousManifest({
      previousRef: "origin/main",
      cwd: projectRoot,
    });
  }

  // 执行构建
  const result = await buildRelease({
    projectRoot,
    sourceRoot: path.resolve(projectRoot, args.source ?? "source"),
    outputRoot: path.resolve(projectRoot, args.out ?? "Rules"),
    repository,
  });

  console.log(`Generated ${result.artifacts.length} rule files in ${result.outputRoot}`);

  // 生成 Rules/README.md，汇总分流文件、版本链接和来源
  const currentManifest = await loadPreviousManifest({
    previousReleaseDir: result.outputRoot,
  });

  let changes = null;
  if (currentManifest) {
    changes = compareProviderArtifactChanges(previousManifest, currentManifest);
    
    // Telegram 通知
    await sendTelegramNotification({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      changes,
      repository,
      dryRun: args["telegram-dry-run"] ?? false,
      previousRef: "origin/main",
      currentReleaseDir: result.outputRoot,
      cwd: projectRoot,
    });
  }

  const rulesReadmePath = path.join(projectRoot, "Rules", "README.md");
  const rulesReadme = renderRulesReadme({
    sourceConfigs: result.sourceConfigs,
    artifacts: result.artifacts,
    repository,
    updateTime: formatUpdateTimeShanghai(),
  });
  await fs.mkdir(path.dirname(rulesReadmePath), { recursive: true });
  await fs.writeFile(rulesReadmePath, `${rulesReadme}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
