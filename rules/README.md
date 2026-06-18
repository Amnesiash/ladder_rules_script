# 规则

本目录自动生成规则文件仓库，包含各类代理软件使用的规则集合。

---

## 常用规则集

| 文件名 | 包含内容 | 用途 | 最近更新 |
| --- | --- | --- | --- |
| [`Private.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Private.list) | 私有网络 | 内网设备管理、路由器配置、本地服务访问 | 2026-06-18 10:14 |
| [`Direct.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Direct.list) | 直连域名列表 | 国内可直连的常用服务，避免不必要的代理 | 2026-06-18 10:14 |
| [`AI.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/AI.list) | AI 服务 | ChatGPT、Claude、Gemini 等主要 AI 服务 | 2026-06-18 10:14 |
| [`StreamingHMT.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/StreamingHMT.list) | 港澳台流媒体 | 哔哩哔哩、爱奇艺等港澳台流媒体 | 2026-06-18 10:14 |
| [`Streaming.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Streaming.list) | 国际流媒体 | Netflix、Disney+、HBO 等国际流媒体 | 2026-06-18 10:14 |
| [`Proxy.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Proxy.list) | 代理服务列表 | 国外代理、VPN、科学上网服务 | 2026-06-18 10:14 |
| [`China.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/China.list) | 中国网站列表 | 国内网站、服务，确保直连访问 | 2026-06-19 00:31 |
| [`Advertising.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Advertising.list) | 规则集合 | 按需分流与策略匹配 | 2026-06-19 00:31 |

## 其他规则集

| Other | &nbsp; | &nbsp; | &nbsp; | &nbsp; |
| --- | --- | --- | --- | --- |
| [Apple.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/Apple.list)<br>2026-06-18 10:14 | [OneDrive.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/OneDrive.list)<br>2026-06-18 11:11 | [SteamCN.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/SteamCN.list)<br>2026-06-18 10:14 | [Telegram.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/Telegram.list)<br>2026-06-18 10:14 | [TikTok.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/TikTok.list)<br>2026-06-18 11:11 |
| [WeChat.list](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/WeChat.list)<br>2026-06-18 10:14 | &nbsp; | &nbsp; | &nbsp; | &nbsp; |

## 使用示例

### Clash 使用示例

```yaml
c: &RuleSet_c {type: http, behavior: classical, format: text, interval: 86400}

rule-providers:
  # 规则集
  Private: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Private.list}
  Direct: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Direct.list}
  AI: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/AI.list}
  StreamingHMT: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/StreamingHMT.list}
  Streaming: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Streaming.list}
  Proxy: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Proxy.list}
  China: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/China.list}
  Advertising: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Advertising.list}
  Extra_Apple: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/Apple.list}
  Extra_OneDrive: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/OneDrive.list}
  Extra_SteamCN: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/SteamCN.list}
  Extra_Telegram: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/Telegram.list}
  Extra_TikTok: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/TikTok.list}
  Extra_WeChat: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/Extra/WeChat.list}

rules:
  # 订阅规则
  - RULE-SET,Private,DIRECT
  - RULE-SET,Direct,DIRECT
  - RULE-SET,AI,AI
  - RULE-SET,StreamingHMT,哔哩哔哩
  - RULE-SET,Streaming,国际媒体
  - RULE-SET,Proxy,全球加速
  - RULE-SET,China,DIRECT
  - RULE-SET,Advertising,DIRECT
  - RULE-SET,Extra_Apple,DIRECT
  - RULE-SET,Extra_OneDrive,DIRECT
  - RULE-SET,Extra_SteamCN,DIRECT
  - RULE-SET,Extra_Telegram,DIRECT
  - RULE-SET,Extra_TikTok,DIRECT
  - RULE-SET,Extra_WeChat,DIRECT
  - GEOIP,CN,DIRECT

  # 兜底规则
  - MATCH,漏网之鱼
```

### QX 使用示例

```ini
[general]
# 资源解析器，自定义各类远程资源的转换，如节点，规则 filter，重写 rewrite 等，url 地址可远程，可task_local本地/iCloud(Quantumult X/Scripts目录)
resource_parser_url=https://raw.githubusercontent.com/KOP-XIAO/QuantumultX/master/Scripts/resource-parser.js

[filter_remote]
https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true
```

