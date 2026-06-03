const DEFAULT_MAIN_BRANCH = "main";
const DEFAULT_RELEASE_BRANCH = "release";

export class LinkGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LinkGenerationError";
  }
}

export function resolveRepository(repository = process.env.GITHUB_REPOSITORY) {
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new LinkGenerationError("GitHub repository must be provided as owner/repo");
  }
  return repository;
}

export function githubBlobURL({ repository, branch, filePath }) {
  return `https://github.com/${resolveRepository(repository)}/blob/${branch}/${encodePath(filePath)}`;
}

export function githubRawURL({ repository, branch, filePath }) {
  return `https://raw.githubusercontent.com/${resolveRepository(repository)}/${branch}/${encodePath(filePath)}`;
}

function encodePath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

export function renderReleaseReadme({
  sourceConfig,
  artifacts,
  repository,
  mainBranch = DEFAULT_MAIN_BRANCH,
  releaseBranch = DEFAULT_RELEASE_BRANCH,
}) {
  const repo = resolveRepository(repository);
  const relevantArtifacts = artifacts.filter(
    (artifact) => artifact.sourceRelativeDir === sourceConfig.sourceRelativeDir,
  );

  const sections = [
    `# ${sourceConfig.sourceName}`,
    "",
    renderSourceConfigLinks({ sourceConfig, repository: repo, mainBranch }),
    "",
    "## 订阅列表",
    "",
    renderSourceTable({
      files: sourceConfig.files,
      repository: repo,
      mainBranch,
    }),
    "",
    "## Mihomo 用法（复制粘贴）",
    "",
    renderMihomoConfig({
      artifacts: relevantArtifacts,
      repository: repo,
      releaseBranch,
    }),
    "",
    "## 产物文件",
    "",
    renderArtifacts({
      artifacts: relevantArtifacts,
      repository: repo,
      releaseBranch,
    }),
    "",
  ];

  return sections.join("\n");
}

function renderSourceConfigLinks({ sourceConfig, repository, mainBranch }) {
  const configFiles = sourceConfig.configFiles?.length
    ? sourceConfig.configFiles
    : [{ fileName: "source.yaml", relativePath: `source/${sourceConfig.sourceRelativeDir}/source.yaml` }];
  const links = configFiles.map(
    (configFile) => `[${configFile.fileName}](${githubBlobURL({ repository, branch: mainBranch, filePath: configFile.relativePath })})`,
  );
  return `配置文件：${links.join("、")}`;
}

function renderSourceTable({ files, repository, mainBranch }) {
  if (!files?.length) return "_暂无订阅_";
  const rows = files.map((file) => {
    const name = file.name || file.slug;
    const blobUrl = file.url ? githubBlobURL({ repository, branch: mainBranch, filePath: file.url }) : null;
    return blobUrl ? `| ${name} | [链接](${blobUrl}) |` : `| ${name} | - |`;
  });
  return ["| 名称 | 链接 |", "| --- | --- |", ...rows].join("\n");
}

function renderMihomoConfig({ artifacts, repository, releaseBranch }) {
  const mrsArtifacts = artifacts.filter((a) => a.kind?.includes("mrs"));
  const yamlArtifacts = artifacts.filter((a) => a.kind?.includes("yaml"));

  if (!mrsArtifacts.length && !yamlArtifacts.length) return "_暂无可用产物_";

  const lines = ["```yaml", "rule-providers:"];

  for (const artifact of mrsArtifacts) {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    lines.push(`  ${artifact.slug}:`);
    lines.push(`    type: http`);
    lines.push(`    behavior: ${artifact.behavior || "domain"}`);
    lines.push(`    format: mrs`);
    lines.push(`    url: ${rawUrl}`);
    lines.push(`    interval: 86400`);
  }

  for (const artifact of yamlArtifacts) {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    lines.push(`  ${artifact.slug}:`);
    lines.push(`    type: http`);
    lines.push(`    behavior: classical`);
    lines.push(`    format: yaml`);
    lines.push(`    url: ${rawUrl}`);
    lines.push(`    interval: 86400`);
  }

  lines.push("```");
  return lines.join("\n");
}

function renderArtifacts({ artifacts, repository, releaseBranch }) {
  if (!artifacts.length) return "_暂无产物_";
  const rows = artifacts.map((artifact) => {
    const rawPath = artifact.relativePath || artifact.outputPath;
    const rawUrl = githubRawURL({ repository, branch: releaseBranch, filePath: rawPath });
    return `| ${artifact.label} | [下载](${rawUrl}) |`;
  });
  return ["| 名称 | 链接 |", "| --- | --- |", ...rows].join("\n");
}
