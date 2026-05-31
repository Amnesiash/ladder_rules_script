# Telegram 通知样式

## 当前使用样式

```
*📢 rule provider 产物变化*

━━━━━━━━━━━━━━━━━━
🟢 新增 **2** / 🟡 更新 **3** / 🔴 删除 **1**
━━━━━━━━━━━━━━━━━━

*Clash*
🟡 [Proxy.yaml](https://github.com/用户名/仓库名/blob/main/Rules/Clash/Proxy.yaml) (+12/-3)
🟢 [AI.yaml](https://github.com/用户名/仓库名/blob/main/Rules/Clash/AI.yaml) (+5)
🔴 Old.yaml

*Loon*
🟡 [Proxy.list](https://github.com/用户名/仓库名/blob/main/Rules/Loon/Proxy.list) (+10/-2)
🔴 Old.list

*QuantumultX*
🟡 [Proxy.list](https://github.com/用户名/仓库名/blob/main/Rules/QuantumultX/Proxy.list) (+8/-1)

*Shadowrocket*
🟢 [New.list](https://github.com/用户名/仓库名/blob/main/Rules/Shadowrocket/New.list) (+15)
```

## 样式说明

### Emoji 标识
- 🟢 绿色：新增文件（显示总行数）
- 🟡 黄色：更新文件（显示 +增加/-删除 规则数）
- 🔴 红色：删除文件

### 分组
- Clash / Loon / QuantumultX / Shadowrocket

### 格式
- `emoji [文件名](链接) 统计数据`
- 删除文件：仅显示 `emoji 文件名`（无链接和统计）

### 客户端分类
- Clash
- Loon
- QuantumultX
- Shadowrocket

### 统计信息
- 新增文件：显示 `(+总行数)`
- 更新文件：显示 `(+增加行数/-删除行数)`
- 删除文件：显示 `-`

### 格式
- 使用 HTML 表格（Telegram 支持 HTML 解析）
- 文件名带超链接，点击可跳转到 GitHub 对应文件
- 分组标题不带 emoji
