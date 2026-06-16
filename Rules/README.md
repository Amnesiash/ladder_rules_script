# 规则

本目录自动生成规则文件仓库，包含各类代理软件使用的规则集。

---

## 更新

- 规则文件自动更新
- 更新时间：2026-06-16 09:03

---

## 规则集

| 文件名 | 包含内容 | 用途 |
| --- | --- | --- |
| [`Private.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Private.list) | 私有网络 | 内网设备管理、路由器配置、本地服务访问 |
| [`Direct.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Direct.list) | 直连域名列表 | 国内可直连的常用服务，避免不必要的代理 |
| [`WeChat.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/WeChat.list) | 微信服务 | 微信相关服务、API 与访问优化 |
| [`SteamCN.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/SteamCN.list) | Steam国内直连 | Steam 国内可直连访问内容 |
| [`AI.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/AI.list) | AI 服务 | ChatGPT、Claude、Gemini 等主流 AI 服务 |
| [`Apple.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Apple.list) | 苹果服务 | 苹果全球服务、iCloud、App Store 国际区 |
| [`Telegram.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Telegram.list) | Telegram | Telegram 官方及第三方客户端、API 服务 |
| [`StreamingHMT.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/StreamingHMT.list) | 港澳台流媒体 | 哔哩哔哩、爱奇艺等港澳台流媒体 |
| [`Streaming.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Streaming.list) | 流媒体 | Netflix、Disney+、HBO 等国际流媒体 |
| [`Proxy.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Proxy.list) | 代理服务列表 | 国外代理、VPN、科学上网服务 |
| [`China.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/China.list) | 中国网站列表 | 国内网站、服务，确保直连访问 |

## 使用示例

### Clash 使用示例

```yaml
c: &RuleSet_c {type: http, behavior: classical, format: text, interval: 86400}

rule-providers:
  # 规则集
  Private: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Private.list}
  Direct: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Direct.list}
  WeChat: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/WeChat.list}
  SteamCN: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/SteamCN.list}
  AI: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/AI.list}
  Apple: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Apple.list}
  Telegram: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Telegram.list}
  StreamingHMT: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/StreamingHMT.list}
  Streaming: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Streaming.list}
  Proxy: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Proxy.list}
  China: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/China.list}

rules:
  # 订阅规则
  - RULE-SET,Private,DIRECT
  - RULE-SET,Direct,DIRECT
  - RULE-SET,WeChat,DIRECT
  - RULE-SET,SteamCN,DIRECT
  - RULE-SET,AI,AI
  - RULE-SET,Apple,苹果服务
  - RULE-SET,Telegram,Telegram
  - RULE-SET,StreamingHMT,哔哩哔哩
  - RULE-SET,Streaming,国际媒体
  - RULE-SET,Proxy,全球加速
  - RULE-SET,China,DIRECT
  - GEOIP,CN,DIRECT

  # 兜底规则
  - MATCH,漏网之鱼
```

### QX 使用示例

```ini
[general]
# 资源解析器，可用于自定义各类远程资源的转换，如节点，规则 filter，重写 rewrite 等，url 地址可远程，可task_local本地/iCloud(Quantumult X/Scripts目录)
resource_parser_url=https://raw.githubusercontent.com/KOP-XIAO/QuantumultX/master/Scripts/resource-parser.js

[filter_remote]
https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true
```

