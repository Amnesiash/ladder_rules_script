#!/usr/bin/env bun
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RULE_FILE_EXTENSIONS = new Set([".list", ".txt", ".yaml", ".yml"]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function isRuleFile(filePath) {
  return RULE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isRuleLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) return false;
  if (/^(payload|rules|rule-providers|rule_providers|domain|ipcidr|ip-cidr|process-name|process_name):$/u.test(trimmed)) {
    return false;
  }
  return true;
}

function parseStatusEntry(entry) {
  const status = entry.slice(0, 2);
  const rawPath = entry.slice(3);
  const filePath = rawPath.includes(" -> ")
    ? rawPath.slice(rawPath.lastIndexOf(" -> ") + 4)
    : rawPath;
  return { status, filePath };
}

async function runGit(projectRoot, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function collectChanges(projectRoot) {
  const statusOutput = await runGit(projectRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--",
    "rules/release/",
  ]);
  const entries = statusOutput.split("\0").filter(Boolean).map(parseStatusEntry);
  const changes = [];

  for (const entry of entries) {
    const change = {
      ...entry,
      addedFile: entry.status === "??" || entry.status.includes("A"),
      addedRules: [],
      removedRules: [],
    };

    if (!change.addedFile && isRuleFile(change.filePath)) {
      const diff = await runGit(projectRoot, [
        "diff",
        "--no-ext-diff",
        "--unified=0",
        "--",
        change.filePath,
      ]);
      for (const line of diff.split("\n")) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+") && isRuleLine(line.slice(1))) change.addedRules.push(line.slice(1));
        if (line.startsWith("-") && isRuleLine(line.slice(1))) change.removedRules.push(line.slice(1));
      }
    }

    changes.push(change);
  }

  return changes;
}

function renderRuleList(title, rules) {
  if (rules.length === 0) return "";
  return `${title}\n\n${rules.map((rule) => `- \`${rule.replaceAll("`", "\\`")}\``).join("\n")}\n\n`;
}

function renderEntry({ changes, workflow, updatedAt }) {
  const addedFiles = changes.filter((change) => change.addedFile);
  const changedFiles = changes.filter((change) => !change.addedFile);
  const lines = [
    `## ${updatedAt.slice(0, 10)}`,
    "",
    "### Workflow",
    "",
    `- \`${workflow}\`（GitHub Actions 自动运行）`,
    "",
    "### 更新时间",
    "",
    updatedAt,
    "",
    "### 更新内容",
    "",
    "- 自动拉取规则源并重新生成规则发布产物。",
    "",
  ];

  if (addedFiles.length > 0) {
    lines.push("### 新增文件或目录", "", ...addedFiles.map((change) => `- \`${change.filePath}\``), "");
  }

  if (changedFiles.length > 0) {
    lines.push("### 变化文件及规则", "");
    for (const change of changedFiles) {
      lines.push(`#### ${change.filePath}`, "");
      if (isRuleFile(change.filePath)) {
        lines.push(`- 新增 ${change.addedRules.length} 条规则`, `- 删除 ${change.removedRules.length} 条规则`, "");
        const addedRules = renderRuleList("新增规则：", change.addedRules);
        const removedRules = renderRuleList("删除规则：", change.removedRules);
        if (addedRules) lines.push(addedRules.trimEnd(), "");
        if (removedRules) lines.push(removedRules.trimEnd(), "");
      } else {
        lines.push("- 文件内容发生变化，未提取规则明细。", "");
      }
    }
  }

  lines.push("### 运行结果", "", "- 构建成功，更新记录已写入本月文件。", "");
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = process.cwd();
const now = new Date();
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(now);
const updatedAt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(now).replace(",", "");
const logFile = path.resolve(projectRoot, args["log-file"] ?? `rules/update-log/${month}.md`);
const workflow = args.workflow ?? ".github/workflows/Build.yml";

try {
  const changes = await collectChanges(projectRoot);
  if (changes.length === 0) {
    console.log("No generated rules changes to record.");
    process.exit(0);
  }

  const entry = renderEntry({ changes, workflow, updatedAt });
  if (args["dry-run"]) {
    process.stdout.write(entry);
    process.exit(0);
  }

  await fs.mkdir(path.dirname(logFile), { recursive: true });
  try {
    await fs.access(logFile);
  } catch {
    await fs.writeFile(logFile, `# ${month} Workflow 自动更新记录\n\n`, "utf8");
  }
  await fs.appendFile(logFile, entry, "utf8");
  console.log(`Automatic update record written to ${path.relative(projectRoot, logFile)}.`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
