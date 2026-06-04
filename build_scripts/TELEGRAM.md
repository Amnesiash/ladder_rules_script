# Telegram 通知说明

这份文档合并了原来的配置指南和样式说明，内容以当前实现为准。

## 1. 用途

Telegram 通知用于在规则产物发生变化时提醒你，触发点是 `artifacts-manifest.json` 的差异，而不是 Git 提交本身。

相关实现：

- [build_scripts/lib/notifications.mjs](/Users/admin/Documents/AI_Project/ladder_rules_script/build_scripts/lib/notifications.mjs)
- [build_scripts/build.mjs](/Users/admin/Documents/AI_Project/ladder_rules_script/build_scripts/build.mjs)
- [build_scripts/notify-artifact-changes.mjs](/Users/admin/Documents/AI_Project/ladder_rules_script/build_scripts/notify-artifact-changes.mjs)

## 2. 配置步骤

### 2.1 创建 Bot

1. 在 Telegram 搜索 `@BotFather`
2. 发送 `/newbot`
3. 按提示创建 bot
4. 记录 Bot Token

### 2.2 获取 Chat ID

#### 群组

1. 把 bot 拉进目标群组
2. 在群里发一条消息
3. 打开：

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

4. 从返回 JSON 中找到 `chat.id`

#### 私聊

1. 在 Telegram 搜索你的 bot
2. 发送 `/start`
3. 再访问 `getUpdates`
4. 从返回 JSON 中找到 `chat.id`

## 3. 环境变量

构建或发送通知时需要：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

GitHub Actions 里通常放在 Secrets 中：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## 4. 触发方式

### 4.1 构建流程内触发

`bun run build:release:clean` 会在构建后读取前后两个 manifest，然后调用 Telegram 发送逻辑。

### 4.2 独立脚本触发

可以单独运行：

```bash
bun run build_scripts/notify-artifact-changes.mjs --dry-run
```

常用参数：

- `--current <path>`: 指定当前 manifest
- `--previous-manifest <path>`: 指定旧 manifest
- `--previous-release-dir <path>`: 从旧 release 目录推导 baseline
- `--previous-ref <git-ref>`: 从 Git 引用读取 baseline
- `--release-branch <branch>`: 生成 GitHub 链接时使用的分支名
- `--dry-run` / `--no-send`: 只打印不发送
- `--out <path>`: 把消息写到文件
- `--message-file <path>`: 直接发送自定义消息

## 5. 实际消息格式

当前消息使用 Telegram HTML 格式，样式如下：

```text
📦 rule provider 产物变化
owner/repo
新增 x / 减少 y / 更新 z

新增
- Clash/AI.txt (+12)
- Clash/Proxy.txt (+8)

更新
- Shadowrocket/China.list (+3/-1)

减少
- Loon/Old.list (-5)
```

实际发送时：

- 标题固定为 `📦 rule provider 产物变化`
- 仓库名会以 `<code>owner/repo</code>` 形式展示
- 条目按 `新增 / 更新 / 减少` 分组，条目内容使用 `文件夹/文件.txt` 形式，并附带规则增删摘要
- 规则增删摘要统计的是规则行数，不是文件数量
- 每个条目会链接到 GitHub 对应 `blob` 页面
- 消息超过 Telegram 长度限制时会自动截断

## 6. 变更判定规则

通知只看 manifest 的 `relativePath` 和 `sha256`：

- 新路径出现 -> 新增
- 旧路径消失 -> 减少
- 路径相同但 `sha256` 变化 -> 更新

所以如果文件只是改名，通常会被算作“删除 + 新增”。

## 7. 当前实现里的注意点

- 当前通知实现只处理 `domain-mrs`、`ipcidr-mrs`、`classical-yaml`、`remaining-yaml`、`loon`、`shadowrocket`
- `QuantumultX` 产物已经不在当前通知统计里
- 如果没有可用的 baseline，脚本会跳过发送

## 8. 常见问题

### 没收到通知

- 检查 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID`
- 确认上一次 release baseline 存在
- 看 GitHub Actions 或本地日志里是否提示 `No previous release baseline found`

### 消息没有链接

- 确认传入了 `repository`
- 确认 `releaseBranch` 是正确的，比如 `release`

### 想先看消息长什么样

直接使用 dry run：

```bash
bun run build_scripts/notify-artifact-changes.mjs --dry-run
```
