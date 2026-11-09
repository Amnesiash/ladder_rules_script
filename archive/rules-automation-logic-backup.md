# rules 及其自动化流程 · 逻辑备份（含注释）

> **文档性质**：这是一份**逻辑备份**，记录「规则是怎么生成、怎么发布、怎么被消费」的全部机制与约定，供删除 `rules/` 及自动化流程之前审阅、留档、日后重建使用。
> **不包含**：规则数据本体（最长单文件 `rules/release/advertising.list` 约 21 万行）、`.mrs` 二进制产物、`rules/update-log/` 的历史正文——本 md 只讲逻辑。这些数据已随归档移入 `archive/rules/release/` 等目录；仓库级备份命令另见第 9 节。
> **基准版本**：本地 `HEAD = df22b57e`，`origin/main = 3192f763`（`Auto Update 2026-11-09 09:24:32`）。文中所有行号均以此版本为准。
> **生成时间**：2026-11-09（Asia/Shanghai）。
> **本次操作**：撰写本文档时仅新建此文件，未修改、删除、重命名仓库内任何既有文件。
> **归档状态（2026-11-09 补记）**：本文件已移入 `archive/`。文中所有 `rules/...`、`build_scripts/...`、`.github/workflows/...` 路径均指**归档前的原始仓库位置**，恢复时按这些路径放回；归档结构、停用影响与恢复步骤见 `archive/README.md`。

---

## 0. 一分钟速览

这是一套 **Bun 脚本 + GitHub Actions** 驱动的规则聚合器：

1. 以 [`rules/rule_source.txt`] 为唯一权威输入清单，列出各规则分组要抓取的上游 URL；
2. 每天定时（或手工 / 或该文件被 push 时）由 `Build.yml` 触发 `build_scripts/build.mjs`；
3. 脚本下载上游规则 → 缓存到 `rules/source/` → 归一化、去重、排序 → 生成两套产物：Clash/Mihomo 文本规则 `rules/release/*.list` 与 Mihomo 二进制规则集 `rules/release/mrs/{domain,ip}/*.mrs`，并写 `artifacts-manifest.json`；
4. 同一次 workflow 里生成 `rules/update-log/YYYY-MM.md` 变更记录，然后 `git add rules/` → `commit "Auto Update <时间>"` → `push --force-with-lease` 回 `main`；
5. `config/*.yaml` 里的 `rule-providers` 通过 GitHub raw URL 直接引用 `rules/release/` 产物，客户端按 `interval: 86400` 每天拉取。

**核心事实速查**

| 项 | 值 | 来源 |
| --- | --- | --- |
| 运行时 | Bun 1.3.13（CI 由 `oven-sh/setup-bun@v2` 安装） | `.github/workflows/Build.yml:29-32` |
| 构建入口 | `bun run build_scripts/build.mjs --clean` | `package.json:6` |
| 输入清单 | `rules/rule_source.txt`（17 个分组，71 行） | 本文 3.2 节 |
| 输出目录 | `rules/release/` | `build_scripts/build.mjs:102` |
| 定时触发 | `cron: "0 6 * * *"`（UTC，即北京时间 14:00） | `.github/workflows/Build.yml:5-6` |
| 提交范围 | 只 `git add rules/` | `.github/workflows/Build.yml:51` |
| 自动通知 | **已关闭**，仅保留手动脚本 | `build_scripts/TELEGRAM.md:5` |
| 产物清单 | `rules/release/artifacts-manifest.json`（含 sha256） | `build_scripts/lib/artifacts.mjs:105-117` |
| 客户端刷新 | `interval: 86400`（24 小时） | `config/*.yaml` 的 `rule-providers` 锚点 |

---

## 1. 全景数据流

```text
                         ┌─────────────────────────────┐
                         │  rules/rule_source.txt      │  唯一权威输入清单
                         │  rules/custom/*.list        │  自用补充集（通过自引用 raw URL 参与构建）
                         └──────────────┬──────────────┘
                                        │ 解析段标题 / URL
                                        ▼
   上游 GitHub raw ──────►  subscriptions.mjs 下载 + 回退（fetch → curl）
   kelee.one 等             │
                            ▼ 落盘缓存
                  rules/source/<段名>/<文件名>@<作者>.<ext>   ← 被 git 跟踪
                            │
                            ▼
                  rules.mjs 归一化（别名 / 松散域名 / CIDR / 去重 / 排序）
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   rules/release/*.list        mihomo convert-ruleset
   （classical，含头部统计）    ▼
                     rules/release/mrs/domain/*.mrs
                     rules/release/mrs/ip/*.mrs
              └─────────────┬─────────────┘
                            ▼
        rules/release/artifacts-manifest.json（每产物 sha256）
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
  rules/README.md    update-log/YYYY-MM.md   git add rules/ + commit + push
  （links.mjs 渲染）  （record-rule-changes.mjs）      │
                                                      ▼
                                     config/*.yaml 的 rule-providers
                                     通过 raw URL 消费（客户端每日拉取）
```

---

## 2. 目录与文件职责

| 路径 | 角色 | 是否自动生成 | 说明 |
| --- | --- | --- | --- |
| `rules/rule_source.txt` | **手工输入** | 否 | 唯一权威清单；增删规则分组改这里 |
| `rules/custom/` | **手工输入** | 否 | 5 个自用补充集；通过自引用 raw URL 被拉入构建 |
| `rules/source/` | 下载缓存 | 是（自动落盘） | 上游快照，被 git 跟踪；命名 `<文件名>@<组织>.<ext>` |
| `rules/release/` | **最终产物** | 是 | `.list`、`.mrs`、`artifacts-manifest.json`；客户端直接引用 |
| `rules/update-log/` | 变更日志 | 是 | 按月归档，只记录 `rules/release/` 的变化 |
| `rules/README.md` | 使用文档 | 是 | 由 `links.mjs` 渲染，含规则集表格与 Clash/Mihomo/QX 示例 |
| `build_scripts/` | 构建与通知代码 | 否 | 12 个文件，见第 4.3 节 |
| `.github/workflows/` | 自动化 | 否 | `Build.yml`（构建发布）、`ClearCommits.yml`（清史） |
| `config/` | 客户端配置 | 否 | 8 个 yaml 订阅 `rules/release/` 产物；**删库后全部失效** |
| `package.json` | 命令入口 | 否 | 9 个 bun script |
| `gallery/`、`script/` | 图标与 Loon 插件 | 否 | 与规则生成无关，共 2130 个 tracked 文件 |

> 仓库共 2266 个 tracked 文件，其中 `gallery/` 占 2116 个（图标图片），与本次逻辑无关。

---

## 3. 输入层

### 3.1 `rule_source.txt` 语法（带注释）

配置文件由 `build_scripts/lib/config.mjs:27-77` 的 `parseSourceFile()` 解析，语法约定如下：

```text
# 整行注释：以 # 开头，直接跳过
[段名]                      段标题，方括号必填；段名即产物名（最终转小写）
[Extra/Apple]               支持 / 多级路径 → 产物落在 rules/release/extra/apple.list
[Proxy+]!skip mrs           段标题行尾可挂指令；当前只支持 !skip mrs
https://...                 段内的 URL 行，一行一个，全部属于上方最近的段
{kelee}https://...          {作者} 前缀：覆盖缓存文件名里的作者标识
```

**注释与约束（逐条）**

1. `#` 开头的整行才是注释；**URL 行尾不能加注释**，否则整行（含注释）会被当成 URL。`config.mjs:47,71`
2. 段标题行尾指令用正则 `^\[(.+?)\]\s*(!.*)$` 匹配；只认 `!skip mrs`（大小写不敏感、允许多个空格），其他指令会打 warning 后忽略。`config.mjs:27-37`
3. 指令必须写在**段标题行尾**；单独占一行的 `!...` 会被忽略并 warning。`config.mjs:66-69`
4. 空段（无 URL）或空段名会被过滤掉。`config.mjs:74`
5. `!skip mrs` 的含义：**该段完全不生成 `.mrs` 产物，但 `.list` 照常生成**。`config.mjs:23-25`、`artifacts.mjs:233-237`
6. `{作者}` 前缀只影响缓存文件命名，不改变 URL 本身。`subscriptions.mjs:231-236`
7. 段的第一个 URL 决定 `format`（由 `inferFormatFromUrl()` 推断），整段多个 URL 的内容会被拼接后统一处理。`subscriptions.mjs:193-207`

### 3.2 原文与逐段注释

以下为 `rules/rule_source.txt` 原文（71 行，可直接复制重建）：

```text
# HTTP 链接可在前面加 {作者}，例如 {blackmatrix7}https://...，用于固定 source 缓存文件名中的作者标识
# 下面是实际订阅清单（可按需增删）
# 标题挂 !skip mrs 整段跳过 MRS

[Advertising]
https://raw.githubusercontent.com/Cats-Team/AdRules/main/adrules.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Reject/Advertising.list
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list

[China]
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Direct.list

[Direct]
https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/custom/AddDirect.list
https://raw.githubusercontent.com/666OS/rules/release/mihomo/Direct.txt
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Direct+.list

[Proxy+]!skip mrs
https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/custom/AddProxy.list

[Proxy]
https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/custom/AddProxy.list
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Proxy.list

[Streaming]
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Streaming/!CN.list

[AI]
https://raw.githubusercontent.com/666OS/rules/release/mihomo/AI.txt
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/AI.list
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/AI.list
{kelee}https://kelee.one/Tool/Clash/Rule/AI.yaml

[Private]
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list
https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt
https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/lancidr.txt

[Extra/Microsoft]
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/refs/heads/master/Clash/Microsoft.list

[Extra/SteamCN]
https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/SteamCN/SteamCN.yaml
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list

[Extra/WeChat]
https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/WeChat/WeChat.list
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Wechat.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/WeChat.list

[StreamingHMT]
https://raw.githubusercontent.com/ddgksf2013/Filter/master/StreamingSE.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Streaming/CN.list

[Extra/Apple]
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Apple.list

[Extra/Telegram]
https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.list
https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Telegram.list
https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Telegram.list
https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/telegramcidr.txt

[Extra/TikTok]
https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/TikTok/TikTok.list

[Extra/OneDrive]
{blackmatrix7}https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OneDrive/OneDrive.list
```

**逐段映射与注释**

| 段名 | URL 数 | 产物 | 缓存目录 | 备注 |
| --- | --- | --- | --- | --- |
| `Advertising` | 3 | `advertising.list` + domain/ip `.mrs` | `rules/source/Advertising/` | 含 Cats-Team AdRules，单文件约 21 万行 |
| `China` | 2 | `china.list` + `.mrs` | `rules/source/China/` | 第二个上游已由 `Proxy.list` 改为 `Direct.list`（commit `6f134c07`），用于移除 GitHub 误入 |
| `Direct` | 4 | `direct.list` | `rules/source/Direct/` | 第 1 条为**自引用** `rules/custom/AddDirect.list` |
| `Proxy+` | 1 | `proxy+.list`（仅文本） | `rules/source/Proxy+/` | `!skip mrs`：MRS domain 会丢 `DOMAIN-KEYWORD`，故只保留 classical |
| `Proxy` | 3 | `proxy.list` + `.mrs` | `rules/source/Proxy/` | 第 1 条同样自引用 `AddProxy.list` |
| `Streaming` | 1 | `streaming.list` + `.mrs` | `rules/source/Streaming/` | 上游文件名含 `!CN`，缓存名保留 `!` |
| `AI` | 4 | `ai.list` + `.mrs` | `rules/source/AI/` | 含 `{kelee}` 前缀 → 缓存为 `AI@kelee.yaml` |
| `Private` | 3 | `private.list` + `.mrs` | `rules/source/Private/` | 含内网 CIDR |
| `Extra/Microsoft` | 1 | `extra/microsoft.list` | `rules/source/Extra/Microsoft/` | 多级段名 → `extra/` 子目录 |
| `Extra/SteamCN` | 2 | `extra/steamcn.list` | `rules/source/Extra/SteamCN/` | 含 `.yaml` 上游 |
| `Extra/WeChat` | 3 | `extra/wechat.list` | `rules/source/Extra/WeChat/` | 上游大小写不一致（`Wechat` / `WeChat`） |
| `StreamingHMT` | 2 | `streaminghmt.list` | `rules/source/StreamingHMT/` | 港澳台流媒体 |
| `Extra/Apple` | 1 | `extra/apple.list` | `rules/source/Extra/Apple/` | |
| `Extra/Telegram` | 4 | `extra/telegram.list` | `rules/source/Extra/Telegram/` | 含 `telegramcidr` IP 源 |
| `Extra/TikTok` | 1 | `extra/tiktok.list` | `rules/source/Extra/TikTok/` | |
| `Extra/OneDrive` | 1 | `extra/onedrive.list` | `rules/source/Extra/OneDrive/` | `{blackmatrix7}` 前缀固定作者名 |

> 段名到产物的大小写规则：解析与处理阶段保留 `rule_source.txt` 原始大小写，**只在最终生成 release 产物时把目录层级与文件名转为小写**（`rules/README.md:5`、`artifacts.mjs:293`）。

### 3.3 `rules/source/` 缓存

- 命名算法：`deriveCacheFileNameFromUrl()` 取 URL 末段文件名（去扩展名）+ `@` + 路径第一段（组织名）+ 原扩展名；`{作者}` 前缀优先。`subscriptions.mjs:238-263`
- 例：`.../Cats-Team/AdRules/main/adrules.list` → `adrules@Cats-Team.list`；`.../RuleGo/.../Direct+.list` → `Direct+@ConnersHua.list`
- 只过滤 Windows 非法字符，**保留 `!`、`+`**。`subscriptions.mjs:255-259`
- **下载工具在 `subscriptions.mjs`，写盘在 `artifacts.mjs`**：`fetchWithFallback()`（`subscriptions.mjs:152`）先试原 URL，再对 `raw.githubusercontent.com` / `github.com` 依次追加 4 个镜像前缀（`mirror.ghproxy.com`、`gh.api.99988866.xyz`、`ghfast.top`、`gh-proxy.com`）；`subscriptions.mjs:75-86` 每个候选先走 `fetch`，失败回退 `curl -L --silent --show-error --max-time 60`（默认 60 秒、maxBuffer 20MB）；`subscriptions.mjs:100-123` 还会依次换 5 个代理客户端 UA（Loon / Shadowrocket / Quantumult X / Surge Mac / clash.meta）绕 Cloudflare UA 白名单。`subscriptions.mjs:89-98`
- 真正落盘由 `artifacts.mjs:373-381` 的 `saveToCache()` 完成：写到 `rules/source/<pathName>/<缓存名>`；`file` / `inline` 类型条目不写缓存。`artifacts.mjs:325-366`
- 每次构建开始调用 `syncSourceCache()`，删除 `rule_source.txt` 已不再引用的缓存文件/目录。`build.mjs:76-90`、`subscriptions.mjs:269`
- 这些缓存**被 git 跟踪**，但 `update-log` 明确不记录它们的变化。`rules/update-log/README.md:3`

### 3.4 `rules/custom/` 自用补充集（重要坑）

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `AI.list` | 84 | AI 服务补充域名 |
| `AddProxy.list` | 37 | 未被代理匹配到的自用网址 |
| `AddDirect.list` | 6 | 直连修正 |
| `GeoIP_CN.list` | 4 | 国内 IP 段 |
| `UnBan.list` | 70 | 解封域名 |

> **坑**：这 5 个文件虽然就在仓库本地，构建时却**不是直接读本地文件**，而是通过 `rule_source.txt` 里指向本仓库 `main` 分支的 `raw.githubusercontent.com/.../rules/custom/*.list` URL 走网络拉取（`rule_source.txt:15,21,24`）。因此本地改了 `custom/`，必须先推到 `main`，下一次构建才会生效；离线构建也会因此缺料。
> 同理，`rules/source/Direct/AddDirect@Amnesiash.list`、`Proxy/AddProxy@Amnesiash.list`、`Proxy+/AddProxy@Amnesiash.list` 都是这些自引用 URL 的缓存副本。

---

## 4. 构建层

### 4.1 入口：`package.json`（带注释）

```json
{
  "name": "ladder_rules_script",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun run build_scripts/build.mjs --clean",
    "build:release": "bun run build_scripts/build.mjs --clean",
    "build:release:clean": "bun run build_scripts/build.mjs --clean",
    "build:release:prune": "bun run build_scripts/build.mjs --clean --prune",
    "build:release:noclean": "bun run build_scripts/build.mjs --no-clean",
    "generate:clients": "bun run build_scripts/build.mjs",
    "build:all": "bun run generate:clients && bun run build:release:clean",
    "notify:artifact-changes": "bun run build_scripts/notify-artifact-changes.mjs",
    "record:rule-changes": "bun run build_scripts/record-rule-changes.mjs"
  }
}
```

**注释**

1. `build` / `build:release` / `build:release:clean` 三条完全等价，CI 用的是 `build:release:clean`。`Build.yml:37`
2. `--clean` / `--no-clean` / `--prune` 会被 `parseArgs()` 解析进 options，但 **`main()` 与 `buildRelease()` 全程没有读取这三个开关**，属于历史遗留参数；在所有 `*.mjs` 里仅出现在 `build.mjs:36-38` 的帮助文本。`build.mjs:12-27,75-146`
3. 真正的「清理」由 `artifacts.mjs` 的 `cleanupOrphanedOutputFiles()` **无条件执行**：扫描 `rules/` 下所有 `.list` / `.mrs`，删除本次未生成的文件，跳过 `custom/` 与 `source/`。`artifacts.mjs:96-103,127-181`
4. `build.mjs` 的帮助文本也过时了：写的是 `build_scripts/build-release.mjs`、默认输出 `.release`、默认规则目录 `Rules`；实际入口是 `build.mjs`，默认输出 `rules/release`，源目录 `rules/source`。`build.mjs:29-45,77,102`
5. `build:all` 会连跑两次完整构建（先无参、再带 `--clean`），实际没有必要，属冗余入口。
6. `notify:artifact-changes` 与 `record:rule-changes` 是独立脚本；CI 只调用了后者。`Build.yml:39-40`

### 4.2 `build.mjs` 执行顺序（逐步注释）

| 步 | 动作 | 位置 |
| --- | --- | --- |
| 1 | `parseArgs()` 解析 `--key [value]`，支持 `--help` 打印帮助后退出 | `build.mjs:12-27,29-51` |
| 2 | `syncSourceCache({ projectRoot, sourceRoot })` 清理过期缓存，打印被删项 | `build.mjs:76-90` |
| 3 | 推断 `repository`：`--repo` > `GITHUB_REPOSITORY` > `git config remote.origin.url`（兼容 SSH/HTTPS）；取不到直接抛错 | `build.mjs:55-73,93-100` |
| 4 | `outputRoot = rules/release`，调用 `buildRelease({...})` 生成全部产物 | `build.mjs:102-110` |
| 5 | 遍历产物，从每个 `.list` 头部的 `# UPDATE:` 行提取日期，作为 README 的「日期」列 | `build.mjs:114-127` |
| 6 | `renderRulesReadme()` 生成 `rules/README.md` 新内容 | `build.mjs:129-135` |
| 7 | 复用基线：`readPreviousMainFile()` 用 `git show origin/main:<path>` 读旧版，用在两处——① `artifacts.mjs:392-400` 比对**规则体**，相同则连同旧 `# UPDATE:` 时间戳一起复用，避免仅时间变化导致 sha256 变动与误报通知；② `build.mjs:139-145` 比对 `rules/README.md`，相同则写回旧内容，避免无意义提交 | `subscriptions.mjs:322-332`、`artifacts.mjs:389-400`、`build.mjs:139-145` |
| 8 | 顶层 `catch` 打印 stack 并置 `process.exitCode = 1` | `build.mjs:148-151` |

> 第 7 步依赖本地存在 `origin/main` 引用，这也是 CI 里 `checkout` 要 `fetch-depth: 0` 的原因之一。`Build.yml:24-27`

### 4.3 `build_scripts/lib/` 模块职责

| 模块 | 行数 | 主要导出（行号） | 职责 |
| --- | --- | --- | --- |
| `config.mjs` | 301 | `parseSourceFile(39)`、`sanitizeName(13)`、`toSafePathStem(85)`、`discoverSourceDirs(122)`、`loadAllSources(141)`、`loadSourceConfig(151)` | 解析 `rule_source.txt`、名称/路径安全化；`rule_source.txt` 为空时回退扫描 `rules/source/**/source.yaml` / `source.json`（`config.mjs:107-151`）。校验常量：`VALID_TYPES` / `VALID_FORMATS` / `VALID_BEHAVIORS`（`config.mjs:239-241`） |
| `subscriptions.mjs` | 365 | `sourceConfigsFromSourceTxt(176)`、`parseAuthorMarkedUrl(231)`、`deriveCacheFileNameFromUrl(238)`、`syncSourceCache(269)`、`readPreviousMainFile(322)`、`formatUpdateTimeShanghai(337)`、`fetchWithFallback(152)` | 清单转 sourceConfig、下载与 UA/镜像回退工具、缓存命名与 GC、读取 `origin/main` 基线、上海时区格式化；**不含写盘代码**（落盘在 `artifacts.mjs:373-381`） |
| `rules.mjs` | 384 | `ruleTypeAliasTarget(105)`、`findUnsupportedRuleTypes(177)`、`normalizeRulesetLines(195)`、`sortAndDedupRulesetLines(211)`、`ensureNoResolveOnTargetIpRules(286)`、`buildSortedRulesetForClash(353)` | 规则文本归一化、别名转换、去重排序、`no-resolve` 处理、生成 classical 规则集 |
| `artifacts.mjs` | 529 | `buildRelease(34)`、`buildHeaderBlock(446)` | 主编排：拉取与落盘缓存 → 处理 → 写 `.list` / `.mrs` → 清理孤儿文件 → 写 manifest；MRS 编译命令也在本文件 |
| `mihomo.mjs` | 129 | `installMihomo(82)`、`fetchMihomoVersion(69)`、`coreBaseName(55)` | 按 release/alpha 通道查询版本、拼平台包名、下载 `.gz` 并解压缓存二进制，返回路径；**不负责 MRS 编译、自身不调用外部命令**（`mihomo.mjs:82-129`）。缓存到 `.tools/mihomo-cache/`（被 `.gitignore:4` 忽略） |
| `links.mjs` | 446 | `resolveRepository(11)`、`githubRawURL(22)`、`githubBlobURL(18)`、`renderRulesReadme(76)`、`renderReleaseReadme(30)` | 生成 raw/blob URL、渲染 `rules/README.md` 表格与示例；URL 经 `encodePath()` 逐段 `encodeURIComponent`（`links.mjs:26-28`），**不产出 jsdelivr 链接**；`renderReleaseReadme(30)` 全项目无调用点 |
| `notifications.mjs` | 390 | `loadManifestFile(14)`、`loadPreviousManifest(19)`、`loadManifestFromGitRef(46)`、`compareProviderArtifactChanges(161)`、`hasProviderArtifactChanges(193)`、`renderTelegramArtifactChangeMessage(207)`、`sendTelegramMessage(284)`、`makeArtifact(345)`、`writeArtifactManifest(362)` | 清单读写/比对、Telegram 消息渲染与发送；`makeArtifact` / `writeArtifactManifest` 被 `artifacts.mjs` 反过来复用 |

### 4.4 规则归一化规则（`rules.mjs`）

按顺序处理每个上游源，再合并：

1. **去注释 / 去行尾注释**：跳过 `#`、`;` 开头的行，并剥掉 `" //..."` 形式的行尾内容。`rules.mjs:3-12`
2. **逗号空格归一**：`,\s*` → `,`。`rules.mjs:14-16`
3. **YAML 头行剔除**：`payload:` / `rules:` / `rule-providers:` / `domain:` / `ipcidr:` 等单独成行的键。`rules.mjs:18-31`
4. **松散域名补全**：`+.example.com` → `DOMAIN-SUFFIX,example.com`；无逗号无空格的纯域名行 → `DOMAIN-SUFFIX,<域名>`。`rules.mjs:33-50`
5. **CIDR 前缀补全**：裸 IPv4/IPv6 CIDR 补 `IP-CIDR,` / `IP-CIDR6,`。`rules.mjs:52-70`
6. **类型别名转换**（上游混用 QX / Surge 写法，mihomo 不认会被静默丢弃）：`rules.mjs:95-107`

   | 上游写法 | 归一为 | 来源客户端 |
   | --- | --- | --- |
   | `HOST` | `DOMAIN` | Quantumult X |
   | `HOST-SUFFIX` | `DOMAIN-SUFFIX` | Quantumult X |
   | `HOST-KEYWORD` | `DOMAIN-KEYWORD` | Quantumult X |
   | `HOST-WILDCARD` | `DOMAIN-WILDCARD` | Quantumult X |
   | `IP6-CIDR` | `IP-CIDR6` | Quantumult X |
   | `DEST-PORT` | `DST-PORT` | Surge |

7. **排序 + 去重**：`sortAndDedupRulesetLines()` 按类型分桶后排序去重。`rules.mjs:211`
8. **生成 classical 产物**：`buildSortedRulesetForClash()` 产出带统计头部的 `.list`。`rules.mjs:353`

### 4.5 MRS 编译（`artifacts.mjs`）

1. 按规则类型拆分：domain 只收 `DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-WILDCARD`；ipcidr 只收 `IP-CIDR` / `IP-CIDR6` / `IP-SUFFIX`。`artifacts.mjs:255-272`
2. `DOMAIN-SUFFIX,x` 在 MRS 输入里改写为 `+.x`；`no-resolve` 参数被剥离。`artifacts.mjs:268,274-280`
3. 调用 `installMihomo()` 取二进制路径，执行 `mihomo convert-ruleset domain|ipcidr text <输入> <输出>`。**这条外部命令在 `artifacts.mjs:300`，不在 `mihomo.mjs`**；`mihomo.mjs` 只负责下载解压二进制。`artifacts.mjs:287-300`
4. 产物统一放 `mrs/domain/<stem>.mrs` 与 `mrs/ip/<stem>.mrs`，**不保留 `Extra/` 等层级**。`artifacts.mjs:292-294`
5. 某段转换失败会打 warning、删掉已生成的该段 MRS 并返回空数组，**不中断整体构建**。`artifacts.mjs:314-318`
6. `!skip mrs` 段在拆分前直接返回，只有 `.list`。`artifacts.mjs:233-237`

> 这解释了 `[Proxy+]!skip mrs` 的必要性：`selectMihomoMRSLines()` 的类型白名单不含 `DOMAIN-KEYWORD`，若生成 MRS 会静默丢规则。`config/override_whitelist.yaml:11` 的注释也写了「MRS domain 会丢 DOMAIN-KEYWORD」。

### 4.6 产物规格

**`.list` 头部示例**（`rules/release/proxy+.list:1-5`）：

```text
# NAME: Proxy+
# UPDATE: 2026-11-06 15:09
# TOTAL: 29
# DOMAIN-SUFFIX: 27
# DOMAIN-KEYWORD: 2
```

字段由 `buildHeaderBlock()` 生成：`NAME`、`UPDATE`（上海时间）、`TOTAL`、按规则类型分组的计数。`artifacts.mjs:446`；`build.mjs:114-127` 会回读 `# UPDATE:` 用于 README。

**`rules/release/artifacts-manifest.json`**（455 行，示例见 `rules/release/artifacts-manifest.json:1-14`）：

```json
{
  "timestamp": "2026-11-09T01:24:31.720Z",
  "artifacts": [
    {
      "slug": "advertising",
      "name": "advertising",
      "sourceRelativeDir": "Advertising",
      "outputPath": "advertising.list",
      "relativePath": "advertising.list",
      "kind": "clash",
      "label": "advertising Rules",
      "behavior": "classical",
      "sha256": "7ec0936090800ee1fb5274dec4267eb562c74ba33235bfeb4b7b922d93b3a882"
    }
  ]
}
```

- `timestamp` 为 UTC ISO；`01:24:31Z` 即北京时间 `09:24:31`，与同一次 workflow 的 `Auto Update 2026-11-09 09:24:32` 提交吻合，可作为核对锚点。
- `kind` 取值：`clash`、`domain-mrs`、`ipcidr-mrs`、`manifest`（以及通知模块识别的 `classical-yaml` / `remaining-yaml`）。`notifications.mjs:9`
- `sha256` 用于变更检测；`relativePath` 是比对主键。`notifications.mjs:169-190`
- `build_scripts/artifacts-manifest.json` 是 **2026-06-16 的旧快照**（125 行、`outputPath` 为大写 `China.list` 等），当前没有任何脚本引用它，属于遗留文件；现行清单只写 `rules/release/artifacts-manifest.json`。`artifacts.mjs:105-108`

---

## 5. 自动化层

### 5.1 `.github/workflows/Build.yml`（原文 + 逐段注释）

```yaml
name: Build

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * *"
  push:
    branches:
      - main
    paths:
      - rules/rule_source.txt

concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true

jobs:
  Build:
    runs-on: ubuntu-latest
    env:
      TZ: Asia/Shanghai

    steps:
      - name: Checkout target repository
        uses: actions/checkout@v6.0.2
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13

      - name: Build release artifacts
        env:
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: bun run build:release:clean

      - name: Record automatic update
        run: bun run record:rule-changes

      - name: Commit Rules changes to main
        run: |
          if [ -z "$(git status --porcelain -- rules/)" ]; then
            echo "No rules/ changes to commit."
            exit 0
          fi

          git config --local user.email "${GITHUB_ACTOR}@users.noreply.github.com"
          git config --local user.name "${GITHUB_ACTOR}"
          git add rules/
          git commit -m "Auto Update $(date +'%Y-%m-%d %H:%M:%S')"
          git push --force-with-lease origin HEAD:main

      - name: Cleanup Workflow
        uses: Mattraks/delete-workflow-runs@v2.1.0
        with:
          retain_days: 0
          keep_minimum_runs: 2
```

**注释**

1. 三种触发：手工 `workflow_dispatch`；每天 UTC 06:00（`0 6 * * *`，即北京时间 14:00）；以及 `main` 上 `rules/rule_source.txt` 被 push 时。GitHub Actions 的 cron 按 UTC 解析，`TZ` 环境变量只影响 job 内命令（提交信息里 `date` 的输出、脚本的 `Intl` 格式化）。`Build.yml:3-12,20-21`
2. `concurrency` 以 `build-${{ github.ref }}` 分组并取消进行中的旧运行，避免并发构建互相覆盖。`Build.yml:13-15`
3. `fetch-depth: 0` 拉全历史，保证 `git show origin/main:...` 与 `--force-with-lease` 有足够引用。`Build.yml:27`
4. 构建步骤显式注入 `GITHUB_REPOSITORY`；否则 `build.mjs` 会退回读 `git remote.origin.url`。`Build.yml:34-37`、`build.mjs:93-100`
5. `record:rule-changes` 必须排在构建之后、提交之前：它靠「工作区相对 HEAD 的未提交差异」来生成日志。`Build.yml:39-40`
6. 提交步骤先判空，`rules/` 无变化就跳过；提交信息格式 `Auto Update YYYY-MM-DD HH:MM:SS`（受 `TZ` 影响为北京时间）。`Build.yml:42-53`
7. **只 `git add rules/`**：`build_scripts/`、`config/`、根 `README.md` 的改动不会被这个 workflow 提交。`rules/README.md` 在 `rules/` 内，会被带上去。`Build.yml:51`
8. `git push --force-with-lease origin HEAD:main` 带租约强推；若并发写入导致 `origin/main` 变化会失败（有 `concurrency` 兜底，但跨 workflow 的 push 仍可能撞）。`Build.yml:53`
9. 最后一步删除本 workflow 的历史运行记录，`retain_days: 0`、`keep_minimum_runs: 2`，只留最近 2 次。`Build.yml:55-59`
10. `Build.yml` **未声明 `permissions`**，使用仓库默认权限；而 `ClearCommits.yml` 显式声明了 `contents: write` / `actions: write`。

### 5.2 `record-rule-changes.mjs`（自动变更日志）

- 入口：`bun run record:rule-changes`，支持 `--dry-run`、`--log-file <路径>`、`--workflow <名称>`。`record-rule-changes.mjs:10-25,143-158`
- 只扫描 `git status --porcelain=v1 -z -- rules/release/`，与 `rules/update-log/README.md:3` 的范围约定一致。`record-rule-changes.mjs:54-62`
- 对**已存在**且扩展名为 `.list/.txt/.yaml/.yml` 的文件跑 `git diff --no-ext-diff --unified=0`，逐行提取 `+` / `-` 的规则行；过滤空行、注释行、`payload:` 等头行。`record-rule-changes.mjs:8,27-38,73-85`
- 新增文件只记路径，非文本文件只记「内容发生变化」。`record-rule-changes.mjs:119-136`
- 输出追加到 `rules/update-log/YYYY-MM.md`（月份按 `Asia/Shanghai` 计算），文件不存在时先写标题；每个小节含 `## 日期`、`### Workflow`、`### 更新时间`、`### 更新内容`、`### 变化文件及规则`、`### 运行结果`。`record-rule-changes.mjs:99-141,146-157,173-179`
- 无变化直接打印 `No generated rules changes to record.` 并退出，不写空日志。`record-rule-changes.mjs:162-165`

### 5.3 `notify-artifact-changes.mjs`（**当前未接入 CI**）

- `TELEGRAM.md:5` 明确写着：「自动构建流程已关闭 Telegram 通知。下文的独立脚本仍可在需要时手动运行。」`Build.yml` 里确实没有对应步骤。
- 逻辑：读 `rules/release/artifacts-manifest.json` 作为当前基线，用 `loadPreviousManifest()` 取 `origin/main` 上的旧清单（也支持 `--previous-manifest` / `--previous-release-dir`），按 `relativePath` 比对得到 `added` / `removed` / `updated`。`notify-artifact-changes.mjs:47-62`、`notifications.mjs:161-195`
- 只有 `hasProviderArtifactChanges()` 为真才继续；渲染 Telegram HTML 消息（单条上限 4096 字符、每类最多 25 项）。`notifications.mjs:10,207-218`
- 需要 `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_CHAT_ID`；缺任一则打印跳过、不报错。`notify-artifact-changes.mjs:93-97,104-108`
- 支持 `--message-file`（直接发一段文本）、`--out`（把消息写文件）、`--dry-run` / `--no-send`（只打印）、`--repo`、`--release-branch`、`--previous-ref`。`notify-artifact-changes.mjs:34-45,73-91`
- `TELEGRAM.md:70,147` 给出的手动验证命令是 `bun run build_scripts/notify-artifact-changes.mjs --dry-run`。

### 5.4 `.github/workflows/ClearCommits.yml`（高危，与「删库」直接相关）

```yaml
on:
  workflow_dispatch:
    inputs:
      confirm:
        description: Type CLEAR_MAIN to rewrite main history
        required: true
        default: ""
permissions:
  contents: write
  actions: write
```

**注释**

1. 只能手工触发，且必须填 `CLEAR_MAIN`；操作者必须是 `Amnesiash`，否则 `exit 1`。`ClearCommits.yml:4-9,26-37`
2. 校验通过后执行 `git checkout --orphan clearhistory` → `git branch -D main` → `git checkout --orphan main` → `git add .` → `git commit -m "Reset history"` → `git push -f -u origin main`。`ClearCommits.yml:38-45`
3. **效果**：`main` 的全部提交历史被抹掉，只剩一个 `Reset history` 根提交；工作树内容保留，但历史、tag 关联、blame 全丢，且是 `push -f`。
4. 收尾同样删除 workflow 运行记录，`keep_minimum_runs: 0`，连运行痕迹也不留。`ClearCommits.yml:47-51`
5. 若主人的「删库」计划包含清史，请务必先把仓库完整 clone / archive 到别处，此操作在远端不可逆。

### 5.5 触发与时序小结

| 时刻 | 事件 |
| --- | --- |
| 每天 UTC 06:00 / 手工 / `rule_source.txt` 被 push | `Build.yml` 启动 |
| Step 3 | `build:release:clean` 重建 `rules/release/`、写 manifest、更新 `rules/README.md` |
| Step 4 | `record:rule-changes` 依据工作区差异追加当月日志 |
| Step 5 | `git add rules/` + `Auto Update <北京时间>` + `--force-with-lease` 推送 |
| Step 6 | 清理本 workflow 旧运行记录（保留 2 条） |
| 客户端侧 | `config/*.yaml` 的 `rule-providers` 每 86400 秒拉一次 raw URL |

---

## 6. 消费层：`config/` 如何引用产物

8 个 tracked yaml（另有 1 个未跟踪文件，见 6.3）按两套范式 × 两种格式分为四象限：

| 配置 | 范式 | 引用格式 | 代表性 URL |
| --- | --- | --- | --- |
| `mihomo_mix.yaml` / `override_mix.yaml` | 黑名单（mix） | `.mrs` | `.../rules/release/mrs/domain/china.mrs` |
| `mihomo_mix_classical.yaml` / `override_mix_classical.yaml` | 黑名单（mix） | `.list` | `.../rules/release/china.list` |
| `mihomo_whitelist.yaml` / `override_whitelist.yaml` | 白名单 | `.mrs` + `proxy%2B.list` | `.../rules/release/mrs/domain/china.mrs` |
| `mihomo_whitelist_classical.yaml` | 白名单 | `.list` | `.../rules/release/china.list` |
| `mihomo_whitelist_magicrule.yaml` | 白名单 | classical（magicrule） | `.../rules/release/proxy+.list` |

**URL 模板**（`config/*.yaml` 里实际只有前两种写法，均指向 `main` 分支）：

```text
https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/<产物>
https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/<产物>
```

第三种 `https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/rules/release/<产物>` 只出现在 `config/README.md:36-48` 的**用户手工替换建议**里：构建脚本 `links.mjs` 不生成 jsdelivr 链接，配置 yaml 里也没有使用它。别把它当成自动生成逻辑。

**锚点定义**（`config/mihomo_whitelist.yaml:29-31` 等）：

```yaml
c: &r1 {type: http, behavior: classical, format: text, interval: 86400}
d: &r2 {type: http, behavior: domain, format: mrs, interval: 86400}
i: &r3 {type: http, behavior: ipcidr, format: mrs, interval: 86400}
```

**注释**

1. `proxy+` 含 `+`，在 URL 里必须转义为 `%2B`（`proxy%2B.list`），否则 `+` 会被解析成空格。README 里的转义由 `links.mjs:26-28` 的 `encodePath()` 逐段 `encodeURIComponent` 产生（`rules/README.md:18` 实证）；而 `links.mjs:248` 的 Mihomo 示例与 `links.mjs:214` 的 QX 示例是硬编码字符串，不走编码函数。配置 yaml 里的 `proxy%2B.list` 是手工维护的，非脚本产物。`config/mihomo_whitelist.yaml:199`
2. whitelist 范式的路由顺序是：私网/直连 → AI / Telegram 专项 → `proxy+` 兜底 → 境内白名单 → `MATCH, FallBack`，与 mix 范式（黑名单）相反。`config/mihomo_whitelist.yaml:217-238`
3. 白名单配置引用 `FallBack` 策略组、`include-all` 节点选择；地区自动策略组的 `filter` 正则含国旗 emoji 与地区词（`config/mihomo_whitelist.yaml:168`），与 `config/flag-nodes.js`（给节点名统一加「国旗 + 空格 + 节点名」的覆写脚本，`flag-nodes.js:1-20`）在命名上相互呼应。该脚本不参与规则生成。
4. **删掉 `rules/release/` 后，以上所有 URL 立即 404**，8 个 yaml 全部失效；若不打算保留 `config/`，需要一并从客户端配置里移除规则引用。
5. `config/override_whitelist_classical.yaml` 是**未跟踪文件**（本地手工创建，远程没有），以及 `config/override_whitelist.yaml.local-20261106.bak`（上一轮拉取时留下的旧草稿备份）——两者都不在 `git ls-files` 里，`git archive` / clone 不会带走，需要单独复制。

---

## 7. 依赖、环境变量与外部服务

| 类别 | 项 | 说明 |
| --- | --- | --- |
| 运行时 | Bun 1.3.13、Node 内建模块（`fs/promises`、`child_process`） | `package.json:4`、`Build.yml:29-32` |
| 外部命令 | `git`、`curl`（下载回退）、`mihomo` 二进制 | `subscriptions.mjs:111,324`、`artifacts.mjs:300` |
| 环境变量 | `GITHUB_REPOSITORY` | 构建步骤显式注入；决定 raw URL 的 owner/repo |
| 环境变量 | `TZ=Asia/Shanghai` | workflow 级，影响提交时间与日志时间 |
| 环境变量 | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` | 仅手动通知脚本使用，当前 CI 未配置 |
| 环境变量 | `GOAMD64` | `mihomo.mjs:58` 选择二进制架构，默认 `v1` |
| 权限 | `contents: write`、`actions: write` | 仅 `ClearCommits.yml` 显式声明 |
| 网络目标 | `raw.githubusercontent.com`（多上游）、`kelee.one`、`github.com/MetaCubeX/mihomo/releases`、`api.telegram.org` | 断网或上游改路径会导致对应段被跳过 |
| 下载回退 | 4 个 GitHub 镜像：`mirror.ghproxy.com`、`gh.api.99988866.xyz`、`ghfast.top`、`gh-proxy.com` | `subscriptions.mjs:80-83`；仅用于构建期 fetch，不写入产物或 README；当前可用性未联网验证 |
| 下载参数 | `curl -L --silent --show-error --max-time 60`，maxBuffer 20MB；另备 5 个客户端 UA 绕 Cloudflare 白名单 | `subscriptions.mjs:89-123` |
| 忽略项 | `.release/`、`.rules-work/`、`.tools/`、`.codegraph/` 等 AI 工具目录、`AGENTS.md`、`CLAUDE.md` | `.gitignore:1-20` |

> 单个上游条目失败不会中断整体构建：会打 `⚠️ 跳过 [段名]: 原因` 并继续，最后输出构建汇总。`artifacts.mjs:64-94`

---

## 8. 已知坑与风险清单

1. **自引用 raw URL**：`rules/custom/` 的改动必须先推 `main` 才生效；本地离线构建会缺料。见 3.4。
2. **帮助文本过时**：`build.mjs --help` 里的入口名、默认输出目录、默认规则目录都与实际不符。见 4.1。
3. **`--clean` / `--prune` / `--no-clean` 是空开关**：解析了但不生效；清理逻辑无条件执行。见 4.1。
4. **孤儿文件清理范围大**：`cleanupOrphanedOutputFiles()` 扫描整个 `rules/` 下所有 `.list` / `.mrs`，只跳过 `custom/` 与 `source/`；手工放进 `rules/release/` 的文件会在构建时被删。`artifacts.mjs:127-181`
5. **`!skip mrs` 只支持一个指令**，且必须写在段标题行尾；写错只 warning 不报错，容易静默生成多余 MRS。见 3.1。
6. **MRS 白名单会丢 `DOMAIN-KEYWORD`**，这是 `[Proxy+]` 跳过 MRS 的根本原因。见 4.5。
7. **`proxy+` 的 `+` 需要 URL 转义**为 `%2B`。见 6。
8. **Telegram 通知已停用**，但 `package.json` 仍留着 script、`notifications.mjs` 仍被 `artifacts.mjs` 复用（`makeArtifact` / `writeArtifactManifest`）；**删 `notifications.mjs` 会连带搞坏构建**，不能只按「通知模块」一刀切。
9. **`build_scripts/artifacts-manifest.json` 是 2026-06-16 的遗留快照**，当前无脚本引用；别误当成现行基线。
10. **`--force-with-lease` 强推**：`Build.yml` 会重写 `main` 指针；`ClearCommits.yml` 更是 `push -f` 抹历史。见 5.1 / 5.4。
11. **`advertising.list` 约 21 万行**，每次广告上游变动会让 `update-log` 单日新增上千行；`rules/update-log/2026-11.md` 已达 6603 行。
12. **`rules/source/` 缓存被 git 跟踪**，但 `update-log` 不记录其变化；上游内容变化只体现在 release 产物与 manifest 的 sha256 上。
13. **未跟踪文件不会被 git 备份**：`config/override_whitelist_classical.yaml`、`config/override_whitelist.yaml.local-20261106.bak`。
14. **`renderReleaseReadme()` 是死代码**：`links.mjs:30` 定义后全项目无调用点；真正产出 `rules/README.md` 的是 `renderRulesReadme()`（`links.mjs:76` → `build.mjs:130`）。
15. **下载会自动走第三方镜像**：上游失败时依次尝试 4 个公开代理与 5 个客户端 UA，网络行为不完全可控；这些镜像的可用性本次未验证。
16. **规则体复用会让时间戳「不变」**：`artifacts.mjs:392-400` 在规则内容未变时连旧 `# UPDATE:` 一起复用，所以 README 的「日期」列是产物内容最后变更日期，不是当天构建时间。

---

## 9. 删除影响面与恢复建议

### 9.1 删除后会发生什么

| 删除对象 | 直接后果 |
| --- | --- |
| `rules/release/` | 8 个 `config/*.yaml` 的 `rule-providers` 全部 404，客户端规则失效 |
| `rules/rule_source.txt` | 构建无输入；`Build.yml` 的 push 触发条件失效；`sourceConfigsFromSourceTxt()` 返回空后回退到 `loadAllSources()`（旧行为，结果不可控） |
| `rules/custom/` | 自引用 URL 404，构建时对应条目被跳过 |
| `build_scripts/` | `package.json` 全部 script 失效，`Build.yml` 直接失败 |
| `.github/workflows/Build.yml` | 不再自动更新、不再自动提交；仓库变成静态快照 |
| `.github/workflows/ClearCommits.yml` | 失去清史入口（通常正是删库时要一起删的） |
| `config/` | 客户端配置丢失，需从别处备份 |

### 9.2 建议的备份动作（本文件只做逻辑备份，数据另行打包）

```bash
# 1) 打一个带注释的 tag，作为删除前的可回溯锚点
git tag -a backup/before-rules-removal -m "rules 及自动化流程删除前快照"

# 2) 把 tracked 文件完整打包（含规则数据本体、MRS 二进制）
git archive --format=zip -o rules-backup.zip HEAD \
  rules build_scripts .github/workflows config \
  package.json README.md .gitignore

# 3) 未跟踪文件必须单独复制（git archive 不包含）；把 /path/to/backup/ 换成实际备份目录
cp config/override_whitelist_classical.yaml /path/to/backup/
cp config/override_whitelist.yaml.local-20261106.bak /path/to/backup/

# 4) 保存历史日志与提交历史（ClearCommits 会抹掉）
git bundle create rules-history.bundle --all
```

> 上面第 1、4 步在本地执行即可；若要远端留底，先 `git push origin backup/before-rules-removal`，并在执行 `ClearCommits.yml` 之前确认 bundle 已另存。

### 9.3 最小重建集

若日后要按本文件重建整套流程，最少需要：

```text
rules/rule_source.txt
rules/custom/                 (5 个自用集)
build_scripts/                (12 个文件，一个都不能少)
.github/workflows/Build.yml
package.json
.gitignore
config/                       (8 个 yaml + flag-nodes.js，若仍需客户端配置)
```

`rules/source/`、`rules/release/`、`rules/update-log/`、`rules/README.md` 都是可再生产物，首次运行 `bun run build:release:clean` 会生成；但注意 `build.mjs` 依赖 `origin/main` 引用（`readPreviousMainFile`）与网络可用。

---

## 附录 A：完整文件清单（基准 `df22b57e`）

```text
.github/workflows/Build.yml
.github/workflows/ClearCommits.yml
build_scripts/TELEGRAM.md
build_scripts/artifacts-manifest.json
build_scripts/build.mjs
build_scripts/lib/artifacts.mjs
build_scripts/lib/config.mjs
build_scripts/lib/links.mjs
build_scripts/lib/mihomo.mjs
build_scripts/lib/notifications.mjs
build_scripts/lib/rules.mjs
build_scripts/lib/subscriptions.mjs
build_scripts/notify-artifact-changes.mjs
build_scripts/record-rule-changes.mjs
config/README.md
config/flag-nodes.js
config/mihomo_mix.yaml
config/mihomo_mix_classical.yaml
config/mihomo_whitelist.yaml
config/mihomo_whitelist_classical.yaml
config/mihomo_whitelist_magicrule.yaml
config/override_mix.yaml
config/override_mix_classical.yaml
config/override_whitelist.yaml
rules/README.md
rules/custom/AI.list
rules/custom/AddDirect.list
rules/custom/AddProxy.list
rules/custom/GeoIP_CN.list
rules/custom/UnBan.list
rules/release/advertising.list
rules/release/ai.list
rules/release/artifacts-manifest.json
rules/release/china.list
rules/release/direct.list
rules/release/extra/apple.list
rules/release/extra/microsoft.list
rules/release/extra/onedrive.list
rules/release/extra/steamcn.list
rules/release/extra/telegram.list
rules/release/extra/tiktok.list
rules/release/extra/wechat.list
rules/release/mrs/domain/advertising.mrs
rules/release/mrs/domain/ai.mrs
rules/release/mrs/domain/apple.mrs
rules/release/mrs/domain/china.mrs
rules/release/mrs/domain/direct.mrs
rules/release/mrs/domain/microsoft.mrs
rules/release/mrs/domain/onedrive.mrs
rules/release/mrs/domain/private.mrs
rules/release/mrs/domain/proxy.mrs
rules/release/mrs/domain/steamcn.mrs
rules/release/mrs/domain/streaming.mrs
rules/release/mrs/domain/streaminghmt.mrs
rules/release/mrs/domain/telegram.mrs
rules/release/mrs/domain/tiktok.mrs
rules/release/mrs/domain/wechat.mrs
rules/release/mrs/ip/advertising.mrs
rules/release/mrs/ip/ai.mrs
rules/release/mrs/ip/apple.mrs
rules/release/mrs/ip/china.mrs
rules/release/mrs/ip/private.mrs
rules/release/mrs/ip/proxy.mrs
rules/release/mrs/ip/streaming.mrs
rules/release/mrs/ip/streaminghmt.mrs
rules/release/mrs/ip/telegram.mrs
rules/release/mrs/ip/wechat.mrs
rules/release/private.list
rules/release/proxy+.list
rules/release/proxy.list
rules/release/streaming.list
rules/release/streaminghmt.list
rules/rule_source.txt
rules/source/AI/AI@666OS.txt
rules/source/AI/AI@ACL4SSR.list
rules/source/AI/AI@ConnersHua.list
rules/source/AI/AI@kelee.yaml
rules/source/Advertising/Advertising@ConnersHua.list
rules/source/Advertising/BanAD@ACL4SSR.list
rules/source/Advertising/adrules@Cats-Team.list
rules/source/China/ChinaDomain@ACL4SSR.list
rules/source/China/Direct@ConnersHua.list
rules/source/Direct/AddDirect@Amnesiash.list
rules/source/Direct/Direct+@ConnersHua.list
rules/source/Direct/Direct@666OS.txt
rules/source/Direct/UnBan@ACL4SSR.list
rules/source/Extra/Apple/Apple@ACL4SSR.list
rules/source/Extra/Microsoft/Microsoft@ACL4SSR.list
rules/source/Extra/OneDrive/OneDrive@blackmatrix7.list
rules/source/Extra/SteamCN/SteamCN@ACL4SSR.list
rules/source/Extra/SteamCN/SteamCN@blackmatrix7.yaml
rules/source/Extra/Telegram/Telegram@ACL4SSR.list
rules/source/Extra/Telegram/Telegram@ConnersHua.list
rules/source/Extra/Telegram/Telegram@blackmatrix7.list
rules/source/Extra/Telegram/telegramcidr@Loyalsoldier.txt
rules/source/Extra/TikTok/TikTok@blackmatrix7.list
rules/source/Extra/WeChat/WeChat@ConnersHua.list
rules/source/Extra/WeChat/WeChat@blackmatrix7.list
rules/source/Extra/WeChat/Wechat@ACL4SSR.list
rules/source/Private/LocalAreaNetwork@ACL4SSR.list
rules/source/Private/lancidr@Loyalsoldier.txt
rules/source/Private/private@Loyalsoldier.txt
rules/source/Proxy+/AddProxy@Amnesiash.list
rules/source/Proxy/AddProxy@Amnesiash.list
rules/source/Proxy/Proxy@ConnersHua.list
rules/source/Proxy/ProxyLite@ACL4SSR.list
rules/source/Streaming/!CN@ConnersHua.list
rules/source/StreamingHMT/CN@ConnersHua.list
rules/source/StreamingHMT/StreamingSE@ddgksf2013.list
rules/update-log/2026-10.md
rules/update-log/2026-11.md
rules/update-log/README.md
.gitignore
README.md
package.json
```

未跟踪、需单独备份的文件：

```text
config/override_whitelist_classical.yaml
config/override_whitelist.yaml.local-20261106.bak
```

---

## 附录 B：核对记录

| 项 | 结果 |
| --- | --- |
| 基准提交 | `df22b57e`（本地 HEAD，删除 QuantumultX 模板的那笔提交）；`origin/main = 3192f763` |
| 工作区状态 | 已跟踪文件干净；仅 2 个未跟踪文件（见附录 A 末） |
| `rules/` tracked 文件数 | 88 |
| `build_scripts/` tracked 文件数 | 12 |
| `.github/workflows/` | 2 |
| `config/` tracked 文件数 | 10（含 `README.md`、`flag-nodes.js`） |
| 根目录 tracked 文件 | 3（`.gitignore`、`README.md`、`package.json`） |
| 核对方式 | `git ls-files` 导出清单、`read` 逐个读取关键文件、`grep` 交叉验证导出函数与行号；另有一路并行只读分析对 `config.mjs` / `links.mjs` / `subscriptions.mjs` / `mihomo.mjs` 逐行复核，修正了初稿 4 处表述（jsdelivr 来源、缓存落盘位置、MRS 编译归属、基线复用范围） |
| 未验证项 | 未实际执行 `bun run build:release:clean`（会重写 `rules/release/` 并访问网络），因此所有构建行为结论均来自源码静态阅读，未经运行验证 |
