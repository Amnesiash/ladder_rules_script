#!/usr/bin/env bun
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildRelease } from "./lib/artifacts.mjs";
import { syncSourceCache } from "./lib/subscriptions.mjs";

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
      "  bun run build_scripts/build.mjs [options]",
      "",
      "Options:",
      "  --out, -o      Output root (default: rules).",
      "                 Generates rules/mihomo/*.yaml, rules/quantumultx/*.list, rules/loon/*.list",
      "  --source       Source cache directory (default: rules/source).",
      "  --repo         GitHub repo name (owner/repo).",
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
  // 同步清理 source 缓存（删除 rule_source.txt 中不再引用的缓存文件）
  const sourceRoot = path.resolve(projectRoot, args.source ?? "rules/source");
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

  // 三套客户端产物直接落在 rules/ 下的 mihomo/ quantumultx/ loon/ 三个一级目录
  const outputRoot = path.resolve(projectRoot, args.out ?? "rules");

  const result = await buildRelease({
    projectRoot,
    sourceRoot,
    outputRoot,
    repository,
  });

  const counts = {};
  for (const artifact of result.artifacts) {
    counts[artifact.kind] = (counts[artifact.kind] ?? 0) + 1;
  }
  console.log(`Generated ${result.artifacts.length} artifacts in ${result.outputRoot}`);
  for (const [kind, count] of Object.entries(counts)) {
    console.log(`  ${kind}: ${count}`);
  }

  // README 文档本次不维护（产物目录结构已调整），构建不再自动覆盖 rules/README.md
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
