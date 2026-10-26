# 规则

本目录自动生成规则文件仓库，包含各类代理软件使用的规则集合。

说明：规则生成过程按 rule_source.txt 原始内容读取、解析和处理；仅在最终生成 release 产物时将目录层级和文件名转换为小写。

---

## 常用规则集

| 文件名 | 包含内容 | 用途 | 日期 |
| --- | --- | --- | --- |
| [`private.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/private.list)<br>[`private_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/private_domain.mrs)<br>[`private_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/private_ip.mrs) | 私有网络 | 内网设备管理、路由器配置、本地服务访问 | 2026-10-26 |
| [`direct.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/direct.list)<br>[`direct_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/direct_domain.mrs) | 直连域名列表 | 国内可直连的常用服务，避免不必要的代理 | 2026-10-26 |
| [`ai.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/ai.list)<br>[`ai_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/ai_domain.mrs)<br>[`ai_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/ai_ip.mrs) | AI 服务 | ChatGPT、Claude、Gemini 等主要 AI 服务 | 2026-10-26 |
| [`streaminghmt.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaminghmt.list)<br>[`streaminghmt_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaminghmt_domain.mrs)<br>[`streaminghmt_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaminghmt_ip.mrs) | 港澳台流媒体 | 哔哩哔哩、爱奇艺等港澳台流媒体 | 2026-10-26 |
| [`streaming.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaming.list)<br>[`streaming_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaming_domain.mrs)<br>[`streaming_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaming_ip.mrs) | 国际流媒体 | Netflix、Disney+、HBO 等国际流媒体 | 2026-10-26 |
| [`proxy.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/proxy.list)<br>[`proxy_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/proxy_domain.mrs)<br>[`proxy_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/proxy_ip.mrs) | 代理服务列表 | 国外代理、VPN、科学上网服务 | 2026-10-26 |
| [`china.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/china.list)<br>[`china_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/china_domain.mrs)<br>[`china_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/china_ip.mrs) | 中国网站列表 | 国内网站、服务，确保直连访问 | 2026-10-26 |
| [`advertising.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising.list)<br>[`advertising_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising_domain.mrs)<br>[`advertising_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising_ip.mrs) | 规则集合 | 按需分流与策略匹配 | 2026-10-26 |

## 额外规则集

| Extra | &nbsp; | &nbsp; | &nbsp; | &nbsp; |
| --- | --- | --- | --- | --- |
| <strong><code>Apple</code></strong> | <strong><code>Microsoft</code></strong> | <strong><code>OneDrive</code></strong> | <strong><code>SteamCN</code></strong> | <strong><code>Telegram</code></strong> |
| [`apple.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/apple.list)<br>[`apple_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/apple_domain.mrs)<br>[`apple_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/apple_ip.mrs) | [`microsoft.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/microsoft.list)<br>[`microsoft_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/microsoft_domain.mrs) | [`onedrive.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/onedrive.list)<br>[`onedrive_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/onedrive_domain.mrs) | [`steamcn.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/steamcn.list)<br>[`steamcn_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/steamcn_domain.mrs) | [`telegram.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/telegram.list)<br>[`telegram_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/telegram_domain.mrs)<br>[`telegram_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/telegram_ip.mrs) |
| <strong><code>TikTok</code></strong> | <strong><code>WeChat</code></strong> | &nbsp; | &nbsp; | &nbsp; |
| [`tiktok.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/tiktok.list)<br>[`tiktok_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/tiktok_domain.mrs) | [`wechat.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/wechat.list)<br>[`wechat_domain.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/wechat_domain.mrs)<br>[`wechat_ip.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/wechat_ip.mrs) | &nbsp; | &nbsp; | &nbsp; |

## 使用示例

### Clash 使用示例

```yaml
c: &RuleSet_c {type: http, behavior: classical, format: text, interval: 86400}

rule-providers:
  # 规则集
  Private: {<<: *RuleSet_c, url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/private.list}

rules:
  # 订阅规则
  - RULE-SET,Private,DIRECT
  - GEOIP,CN,DIRECT

  # 兜底规则
  - MATCH,漏网之鱼
```

### Mihomo 使用示例

```yaml
rule-providers:
  advertising_domain:
    type: http
    behavior: domain
    format: mrs
    url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising_domain.mrs
    interval: 86400
  advertising_ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising_ip.mrs
    interval: 86400
```

### QX 使用示例

```ini
[general]
# 资源解析器，自定义各类远程资源的转换，如节点，规则 filter，重写 rewrite 等，url 地址可远程，可task_local本地/iCloud(Quantumult X/Scripts目录)
resource_parser_url=https://raw.githubusercontent.com/KOP-XIAO/QuantumultX/master/Scripts/resource-parser.js

[filter_remote]
https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true
```

