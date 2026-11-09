# 归档：rules 自动生成与整体构建流程

> **归档时间**：2026-11-09（Asia/Shanghai）
> **基准版本**：本地 `HEAD = df22b57e`，`origin/main = 3192f763`（`Auto Update 2026-11-09 09:24:32`）
> **归档原因**：计划移除 `rules/` 自动生成体系及配套自动化，删除前把内容、代码与说明完整留档。
> **当前状态**：`rules/` 下只保留 `custom/`；规则产物、构建脚本、workflow、命令入口与说明文件全部移入本目录，**自动构建已停止**。
> **重要**：本次移动使用 `git mv`，改动只存在于 **git 索引（已 staged）**，尚未提交。恢复或彻底删除都由仓库所有者决定。

---

## 1. 这份归档是什么

原来这套东西是一个 **Bun 脚本 + GitHub Actions** 驱动的规则聚合器：按 `rule_source.txt` 拉取上游规则，归一化去重后生成 `.list` 与 `.mrs` 两套产物，自动提交回 `main`，再由 `config/*.yaml` 通过 GitHub raw URL 消费。

本目录保存的是**完整可恢复的原件**，不是摘要：

| 内容 | 位置 |
| --- | --- |
| 规则自动生成部分（`rule_source.txt`、上游缓存、release 产物、变更日志、规则说明） | `archive/rules/` |
| 整体构建部分（`build.mjs`、8 个 lib 模块、通知与日志脚本、说明） | `archive/build_scripts/` |
| 自动化 workflow | `archive/workflows/` |
| 命令入口 | `archive/package.json` |
| **详细逻辑备份（788 行，含逐段注释、行号证据、已知坑与备份命令）** | `archive/rules-automation-logic-backup.md` |
| 本文件（流程说明、归档清单、恢复步骤） | `archive/README.md` |

> `archive/rules-automation-logic-backup.md` 中所有路径均为**归档前的原始仓库路径**；恢复时按那些路径放回即可。
> 规则数据本体也在归档里（例如 `archive/rules/release/advertising.list` 约 21 万行、所有 `.mrs` 二进制），不需要另外再抓一份。

---

## 2. 归档目录结构

```text
archive/
├── README.md                          # 本文件：流程说明 + 恢复步骤
├── rules-automation-logic-backup.md   # 详细逻辑备份（含注释）
├── package.json                       # 原仓库根目录的 bun script 入口
├── build_scripts/                     # 原 /build_scripts（12 个文件）
│   ├── build.mjs                      #   构建入口
│   ├── lib/                           #   8 个模块：config / subscriptions / rules /
│   │                                  #   artifacts / mihomo / links / notifications
│   ├── record-rule-changes.mjs        #   生成 update-log
│   ├── notify-artifact-changes.mjs    #   Telegram 变更通知（当前未接入 CI）
│   ├── artifacts-manifest.json        #   2026-06-16 的遗留快照，当前无脚本引用
│   └── TELEGRAM.md                    #   通知配置说明
├── workflows/                         # 原 /.github/workflows（2 个文件）
│   ├── Build.yml                      #   定时构建 + 自动提交
│   └── ClearCommits.yml               #   清空 main 历史（高危）
└── rules/                             # 原 /rules 下除 custom 之外的全部内容
    ├── rule_source.txt                #   唯一权威输入清单（71 行，17 个分组）
    ├── README.md                      #   自动生成的规则使用说明
    ├── source/                        #   上游下载缓存（被 git 跟踪）
    ├── release/                       #   最终产物：*.list / mrs/{domain,ip}/*.mrs / manifest
    └── update-log/                    #   按月归档的自动更新日志
```

**留在原位的部分**（未归档、未改动）：

```text
rules/custom/          # 5 个手工维护的自用补充集，按要求保留
config/                # 8 个 tracked yaml + flag-nodes.js + README.md
gallery/  script/      # 图标与 Loon 插件，与规则生成无关
README.md  .gitignore  # 仓库根文件
```

> `config/` 保留了，但其中 `rule-providers` 引用的 `rules/release/` 产物已移入归档，**所有规则 URL 现在会 404**。若这些配置还要继续用，必须按第 9 节恢复产物，或把配置里的 URL 指向别处。
> 另有 2 个未跟踪文件不在这次移动范围内：`config/override_whitelist_classical.yaml`、`config/override_whitelist.yaml.local-20261106.bak`。

---

## 3. 这套流程原本怎么跑

```text
rules/rule_source.txt（输入清单）
        │  解析段标题 / URL（config.mjs）
        ▼
上游 GitHub raw / kelee.one  ──下载（subscriptions.mjs，含镜像与 UA 回退）
        │  落盘缓存 rules/source/<段名>/<文件名>@<作者>.<ext>（artifacts.mjs）
        ▼
rules.mjs：去注释 → 类型别名 → 松散域名补全 → CIDR 前缀 → 去重排序 → no-resolve
        │
        ├──► rules/release/*.list              （classical，带 # NAME/# UPDATE/# TOTAL 头）
        └──► mihomo convert-ruleset ─────────► rules/release/mrs/domain/*.mrs
                                              rules/release/mrs/ip/*.mrs
        ▼
rules/release/artifacts-manifest.json（每产物 sha256）+ rules/README.md（links.mjs 渲染）
        ▼
record-rule-changes.mjs → rules/update-log/YYYY-MM.md
        ▼
Build.yml：git add rules/ → commit "Auto Update <时间>" → push --force-with-lease
        ▼
config/*.yaml 的 rule-providers 按 raw URL 每 86400 秒拉取
```

**触发条件**（`archive/workflows/Build.yml`）

| 方式 | 配置 | 说明 |
| --- | --- | --- |
| 定时 | `cron: "0 6 * * *"` | GitHub Actions 按 UTC 解析，即北京时间 14:00 |
| 手工 | `workflow_dispatch` | 可在 Actions 页手动触发 |
| 推送 | `push` 到 `main` 且改动含 `rules/rule_source.txt` | 改清单即触发一次重建 |

**本地构建命令**（归档前，在仓库根目录执行）

```bash
bun run build:release:clean     # CI 用的就是这个（等价 build / build:release）
bun run record:rule-changes     # 生成当月 update-log
bun run notify:artifact-changes # Telegram 通知（CI 未调用，仅手动）
```

运行时依赖 Bun 1.3.13、git、curl、mihomo 二进制（自动下载到 `.tools/mihomo-cache/`），以及环境变量 `GITHUB_REPOSITORY`（也可由 `git remote.origin.url` 推断）。`TZ=Asia/Shanghai` 影响提交信息与日志时间。

---

## 4. 输入层约定（带注释）

`archive/rules/rule_source.txt` 是唯一权威清单，语法由 `build_scripts/lib/config.mjs:27-77` 解析：

```text
# 整行注释（URL 行尾不能加注释，否则会被当成 URL 的一部分）
[段名]                      方括号必填；段名即产物名，最终转小写
[Extra/Apple]               支持 / 多级路径 → release/extra/apple.list
[Proxy+]!skip mrs           段标题行尾可挂指令，目前只支持 !skip mrs
https://...                 段内一行一个 URL，全部属于上方最近的段
{作者}https://...           {作者} 前缀只固定缓存文件名里的作者标识，不改变 URL
```

**注释与坑**

1. `!skip mrs` 只让该段**不生成 `.mrs`**，`.list` 照常生成；指令必须写在段标题行尾，单独一行会被忽略并 warning。当前只有 `[Proxy+]` 使用，因为 MRS domain 白名单不含 `DOMAIN-KEYWORD`，生成即丢规则。
2. `rules/custom/` 的 5 个自用集**不是被本地读取**，而是通过 `rule_source.txt` 里指向本仓库 `main` 分支的 raw URL 走网络拉取。本地改了必须先推 `main`，下次构建才生效；离线构建会缺料。
3. 上游内容下载后缓存成 `rules/source/<段名>/<文件名>@<组织或作者>.<ext>`；每次构建开始会清理 `rule_source.txt` 不再引用的缓存。缓存被 git 跟踪，但 `update-log` 不记录它的变化。
4. 单个上游失败不中断整体构建，只打 warning 跳过；但该段旧产物可能被随后的孤儿文件清理删掉。

---

## 5. 构建层模块与产物

| 模块 | 职责 |
| --- | --- |
| `lib/config.mjs` | 解析 `rule_source.txt`、名称/路径安全化；清单为空时回退扫描 `rules/source/**/source.yaml` |
| `lib/subscriptions.mjs` | 下载与镜像/UA 回退工具、缓存命名与清理、读 `origin/main` 基线、上海时间格式化（**不含写盘**） |
| `lib/rules.mjs` | 规则行归一化：别名转换、松散域名、CIDR 前缀、`no-resolve`、去重排序 |
| `lib/artifacts.mjs` | 主编排：下载落盘、写 `.list` / `.mrs`、清理孤儿文件、写 manifest；MRS 编译命令也在这里 |
| `lib/mihomo.mjs` | 只下载解压 mihomo 二进制，**不负责编译** |
| `lib/links.mjs` | 渲染 `rules/README.md` 与 raw/blob URL |
| `lib/notifications.mjs` | manifest 读写/比对、Telegram 发送；其中 `makeArtifact` / `writeArtifactManifest` 被 `artifacts.mjs` 复用 |

**产物规格**

- `.list`：头部含 `# NAME`、`# UPDATE`（Asia/Shanghai）、`# TOTAL` 及各规则类型计数；正文为 classical 规则。
- `.mrs`：`mrs/domain/*.mrs` 与 `mrs/ip/*.mrs` 两类，由 `mihomo convert-ruleset` 从筛选后的规则行编译；`Extra/` 等多级目录在 MRS 里被拍平，只取末段文件名。
- `artifacts-manifest.json`：`timestamp` + `artifacts[]`，每项含 `slug` / `relativePath` / `kind` / `behavior` / `sha256`。变更检测以 `relativePath` 为键比较 `sha256`。

---

## 6. 自动化层

**`archive/workflows/Build.yml` 逐步**

1. `checkout`（`fetch-depth: 0`，为了 `git show origin/main:...` 与 `--force-with-lease`）
2. 安装 Bun 1.3.13
3. `bun run build:release:clean`（显式注入 `GITHUB_REPOSITORY`）
4. `bun run record:rule-changes`
5. 若 `rules/` 有变化：`git add rules/` → `commit "Auto Update <北京时间>"` → `git push --force-with-lease origin HEAD:main`
6. 删除本 workflow 的旧运行记录（保留最近 2 次）

> 只 `git add rules/`，所以 `build_scripts/`、`config/`、根 `README.md` 的改动不会被这个 workflow 提交。

**`archive/workflows/ClearCommits.yml`（高危）**

手工触发且必须输入 `CLEAR_MAIN`、操作者必须是 `Amnesiash`，随后 `checkout --orphan` → 删 `main` → 重建根提交 → `git push -f -u origin main`，**抹掉全部提交历史**。执行前务必另存 `git bundle`。

**通知链路已停用**

`build_scripts/TELEGRAM.md:5` 明确写着自动构建流程已关闭 Telegram 通知；`Build.yml` 里确实没有通知步骤，只剩 `notify-artifact-changes.mjs` 手动入口（需要 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`）。

---

## 7. 归档后的影响面

| 对象 | 影响 |
| --- | --- |
| `rules/release/`（已归档） | `config/*.yaml` 的 `rule-providers` 全部 404，客户端规则失效 |
| `rules/rule_source.txt`（已归档） | 构建无权威输入；`Build.yml` 的 push 触发条件也失效 |
| `.github/workflows/`（已归档） | 不再自动构建、不再自动提交；仓库变成静态快照 |
| `package.json`（已归档） | 所有 `bun run` 脚本入口消失 |
| `rules/custom/`（保留） | 5 个自用集还在，但自引用 raw URL 仍指向仓库 `main` 分支的 `rules/custom/`，单独留着不会自动生效 |
| `gallery/` `script/`（保留） | 与本次归档无关，不受影响 |

---

## 8. 已知坑（精简版，完整 16 条见详细文档第 8 节）

1. `--clean` / `--no-clean` / `--prune` 被解析但**从未被读取**，是空开关；真正的清理由 `cleanupOrphanedOutputFiles()` 每次无条件执行，会删除 `rules/` 下不在当次生成列表里的 `.list` / `.mrs`（只跳过 `custom/` 与 `source/`）。
2. `build.mjs --help` 的入口名、默认输出目录、默认规则目录全部过时，与代码不一致。
3. `rules/custom/` 走自引用 raw URL，本地改动不推不生效。
4. `!skip mrs` 只支持一条指令且必须写在段标题行尾；写错只 warning。
5. `proxy+` 的 `+` 在 URL 里必须写成 `%2B`；README 里由 `encodeURIComponent` 自动转义，配置 yaml 里是手工写的。
6. Telegram 通知虽停用，但 `notifications.mjs` 被构建复用，**不能当「通知模块」单独删**。
7. `build_scripts/artifacts-manifest.json` 是 2026-06-16 的遗留快照，当前无脚本引用；现行清单只写 `rules/release/artifacts-manifest.json`。
8. `ClearCommits.yml` 会 `push -f` 抹掉全部历史。
9. 上游失败时下载层会自动尝试 4 个第三方 GitHub 镜像与 5 个客户端 UA，网络行为不完全可控。
10. 规则体未变时 `artifacts.mjs` 会连旧 `# UPDATE:` 时间戳一起复用，README 的「日期」列不是当天构建时间。

---

## 9. 如何恢复

若要把这套流程放回仓库运行，按下面顺序操作。路径均相对仓库根目录。

```bash
# 1) 把归档内容放回原位（用 git mv 保持历史连续）
git mv archive/rules/rule_source.txt  rules/rule_source.txt
git mv archive/rules/README.md       rules/README.md
git mv archive/rules/source          rules/source
git mv archive/rules/release         rules/release
git mv archive/rules/update-log      rules/update-log
git mv archive/build_scripts         build_scripts
mkdir -p .github
git mv archive/workflows             .github/workflows
git mv archive/package.json          package.json

# 2) 确认 config/*.yaml 的 URL 指向恢复后的 rules/release/
#    （归档期间这些 URL 全是 404，恢复后自动重新可用）

# 3) 本地试构建（需要网络；会重写 rules/release/ 并访问多个上游）
GITHUB_REPOSITORY=Amnesiash/ladder_rules_script bun run build:release:clean

# 4) 确认无误后提交，并把 .github/workflows/Build.yml 重新启用
```

**恢复前检查**

- 本地要有 `origin/main` 引用（`readPreviousMainFile()` 用 `git show origin/main:<path>` 复用旧文件），CI 里靠 `fetch-depth: 0` 保证。
- `GITHUB_REPOSITORY` 或 `git remote.origin.url` 至少要有一个能推断出 `owner/repo`。
- 需要 Bun 1.3.13、可访问 `raw.githubusercontent.com`（或其镜像）、`kelee.one`、mihomo releases。
- 若归档改动已经提交，上面的反向 `git mv` 同样有效，只是会生成新的提交。

---

## 10. 其他备注

- **详细文档**：`archive/rules-automation-logic-backup.md`，含 `rule_source.txt` 逐段映射、workflow 逐行注释、模块导出函数行号、完整文件清单、数据备份命令（`git tag` / `git archive` / `git bundle`）。
- **本次归档未提交**：所有 `git mv` 只 staged，随时可用 `git reset` 撤销，或由仓库所有者决定提交/彻底删除。
- **未跟踪文件**：`config/override_whitelist_classical.yaml` 与 `config/override_whitelist.yaml.local-20261106.bak` 不受 git 跟踪，`git archive` / clone 不会带走，需单独复制。
- **源码静态核对**：归档说明中的构建行为结论来自逐文件静态阅读与 `git diff` 字节级比对，**未实际执行过完整构建**（会重写产物并联网）。
