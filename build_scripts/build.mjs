#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildRelease } from "./lib/artifacts.mjs";
import { backupSourceTxtEntries, syncSourceCache } from "./lib/subscriptions.mjs";
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

async function readPreviousMainFile(relativePath, cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["show", `origin/main:${relativePath}`], {
      cwd,
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function main() {
  // 备份 source.txt
  await backupSourceTxtEntries({
    projectRoot,
    sourceRoot: path.resolve(projectRoot, args.source ?? "Rules/source"),
  });

  // 同步清理 source 缓存（删除 rule_source.txt 中不再引用的缓存文件）
  const sourceRoot = path.resolve(projectRoot, args.source ?? "Rules/source");
  const syncResult = await syncSourceCache({ projectRoot, sourceRoot });
  if (syncResult.removed.length > 0) {
    console.log(`已清理 ${syncResult.removed.length} 个过期缓存文件/目录`);
    for (const item of syncResult.removed) {
      console.log(`  - [${item.type}] ${path.relative(projectRoot, item.path)}`);
    }
  }
  if (syncResult.errors.length > 0) {
    console.warn(`清理过程中出现 ${syncResult.errors.length} 个错误:`);
    for (const err of syncResult.errors) {
      console.warn(`  - ${path.relative(projectRoot, err.path)}: ${err.error}`);
    }
  }

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
    previousReleaseDir: path.resolve(projectRoot, "build_scripts"),
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
    sourceRoot,
    outputRoot: path.resolve(projectRoot, args.out ?? "Rules"),
    repository,
  });

  console.log(`Generated ${result.artifacts.length} rule files in ${result.outputRoot}`);

  // 生成 Rules/README.md，汇总分流文件、版本链接和来源
  const currentManifest = await loadPreviousManifest({
    previousReleaseDir: path.resolve(projectRoot, "build_scripts"),
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

  // 收集各规则文件的最近更新时间（从 header 的 # UPDATE: 行读取）
  const updateTimes = {};
  for (const artifact of result.artifacts) {
    if (artifact.kind !== "clash") continue;
    try {
      const content = await fs.readFile(artifact.filePath, "utf8");
      const match = content.match(/^# UPDATE:\s*(.+)$/m);
      if (match) updateTimes[artifact.name] = match[1].trim();
    } catch {
      // ignore
    }
  }

  const rulesReadmePath = path.join(projectRoot, "Rules", "README.md");
  const newReadme = renderRulesReadme({
    sourceConfigs: result.sourceConfigs,
    artifacts: result.artifacts,
    repository,
    updateTimes,
  });

  await fs.mkdir(path.dirname(rulesReadmePath), { recursive: true });

  // 内容未变化时复用上次 main 分支的文件，避免不必要的提交
  const previousReadme = await readPreviousMainFile("Rules/README.md", projectRoot);
  if (previousReadme !== null && previousReadme === `${newReadme}\n`) {
    await fs.writeFile(rulesReadmePath, previousReadme);
  } else {
    await fs.writeFile(rulesReadmePath, `${newReadme}\n`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
