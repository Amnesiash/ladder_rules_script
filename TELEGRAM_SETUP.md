# Telegram 机器人通知配置指南

## 1. 创建 Telegram Bot

1. 在 Telegram 中搜索 `@BotFather`
2. 发送 `/newbot` 命令
3. 按照提示设置 bot 名称
4. 获取 Bot Token（格式类似：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`）

## 2. 获取 Chat ID

### 方法一：使用群组
1. 将 Bot 添加到目标群组
2. 发送一条消息到群组
3. 访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. 在返回的 JSON 中找到 `"chat":{"id":-xxxxxxxxxx}`
5. 群组 ID 通常是负数

### 方法二：使用私聊
1. 在 Telegram 中搜索你的 Bot
2. 发送 `/start` 命令
3. 访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. 在返回的 JSON 中找到 `"chat":{"id":123456789}`

## 3. 配置 GitHub Secrets

1. 打开你的 GitHub 仓库
2. 进入 `Settings` > `Secrets and variables` > `Actions`
3. 点击 `New repository secret`
4. 添加以下两个 secrets：

| Secret 名称 | 值 |
|------------|-----|
| `TELEGRAM_BOT_TOKEN` | 你的 Bot Token |
| `TELEGRAM_CHAT_ID` | 你的 Chat ID |

## 4. 测试通知

1. 手动触发 `Build` workflow
2. 确保 Rules 目录有变化
3. 检查 Telegram 是否收到通知消息

## 5. 通知内容示例

```
🔔 规则库更新通知

📝 更新内容: Auto Update 2026-05-31 12:05:00
🕐 更新时间: 2026-05-31 12:10:30

📦 变更文件:
```
Rules/Clash/Proxy.yaml
Rules/Loon/Proxy.list
```

🔗 查看提交: https://github.com/用户名/仓库名/commit/abc123
```

## 6. 故障排查

### 问题：没有收到通知
- 检查 Secrets 是否正确配置
- 确认 Rules 目录确实有变化
- 查看 GitHub Actions 日志中的错误信息

### 问题：Bot 无法发送消息
- 确认 Bot 已被添加到目标群组
- 确认 Chat ID 正确（群组 ID 需要负号）
- 测试 Bot Token 是否有效：访问 `https://api.telegram.org/bot<TOKEN>/getMe`
