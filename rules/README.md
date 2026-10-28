# 规则

本目录自动生成规则文件仓库，包含各类代理软件使用的规则集合。

说明：规则生成过程按 rule_source.txt 原始内容读取、解析和处理；仅在最终生成 release 产物时将目录层级和文件名转换为小写。

---

## 常用规则集

| 文件名 | 包含内容 | 用途 | 日期 |
| --- | --- | --- | --- |
| [`private.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/private.list)<br>[`private.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/private.mrs)<br>[`private.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/private.mrs) | 私有网络 | 内网设备管理、路由器配置、本地服务访问 | 2026-10-26 |
| [`direct.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/direct.list)<br>[`direct.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/direct.mrs) | 直连域名列表 | 国内可直连的常用服务，避免不必要的代理 | 2026-10-26 |
| [`ai.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/ai.list)<br>[`ai.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/ai.mrs)<br>[`ai.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/ai.mrs) | AI 服务 | ChatGPT、Claude、Gemini 等主要 AI 服务 | 2026-10-26 |
| [`streaminghmt.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaminghmt.list)<br>[`streaminghmt.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/streaminghmt.mrs)<br>[`streaminghmt.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/streaminghmt.mrs) | 港澳台流媒体 | 哔哩哔哩、爱奇艺等港澳台流媒体 | 2026-10-26 |
| [`streaming.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/streaming.list)<br>[`streaming.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/streaming.mrs)<br>[`streaming.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/streaming.mrs) | 国际流媒体 | Netflix、Disney+、HBO 等国际流媒体 | 2026-10-26 |
| [`proxy.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/proxy.list)<br>[`proxy.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/proxy.mrs)<br>[`proxy.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/proxy.mrs) | 代理服务列表 | 国外代理、VPN、科学上网服务 | 2026-10-26 |
| [`china.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/china.list)<br>[`china.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/china.mrs)<br>[`china.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/china.mrs) | 中国网站列表 | 国内网站、服务，确保直连访问 | 2026-10-26 |
| [`advertising.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/advertising.list)<br>[`advertising.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/advertising.mrs)<br>[`advertising.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/advertising.mrs) | 规则集合 | 按需分流与策略匹配 | 2026-10-28 |

## 额外规则集

| Extra | &nbsp; | &nbsp; | &nbsp; | &nbsp; |
| --- | --- | --- | --- | --- |
| <strong><code>Apple</code></strong> | <strong><code>Microsoft</code></strong> | <strong><code>OneDrive</code></strong> | <strong><code>SteamCN</code></strong> | <strong><code>Telegram</code></strong> |
| [`apple.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/apple.list)<br>[`apple.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/apple.mrs)<br>[`apple.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/apple.mrs) | [`microsoft.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/microsoft.list)<br>[`microsoft.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/microsoft.mrs) | [`onedrive.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/onedrive.list)<br>[`onedrive.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/onedrive.mrs) | [`steamcn.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/steamcn.list)<br>[`steamcn.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/steamcn.mrs) | [`telegram.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/telegram.list)<br>[`telegram.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/telegram.mrs)<br>[`telegram.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/telegram.mrs) |
| <strong><code>TikTok</code></strong> | <strong><code>WeChat</code></strong> | &nbsp; | &nbsp; | &nbsp; |
| [`tiktok.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/tiktok.list)<br>[`tiktok.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/tiktok.mrs) | [`wechat.list`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/extra/wechat.list)<br>[`wechat.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/domain/wechat.mrs)<br>[`wechat.mrs`](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/rules/release/mrs/ip/wechat.mrs) | &nbsp; | &nbsp; | &nbsp; |

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
d: &r2 {type: http, behavior: domain, format: mrs, interval: 86400}
i: &r3 {type: http, behavior: ipcidr, format: mrs, interval: 86400}

rule-providers:
  advertising_domain:
    <<: *r2
    url: https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/mrs/domain/advertising.mrs
  advertising_ip:
    <<: *r3
    url: https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/mrs/ip/advertising.mrs
```

### QX 使用示例

```ini
[general]
# 资源解析器，自定义各类远程资源的转换，如节点，规则 filter，重写 rewrite 等，url 地址可远程，可task_local本地/iCloud(Quantumult X/Scripts目录)
resource_parser_url=https://raw.githubusercontent.com/KOP-XIAO/QuantumultX/master/Scripts/resource-parser.js

[filter_remote]
https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/direct.list, tag=直连修正, force-policy=direct, img-url=https://github.com/Koolson/Qure/raw/master/IconSet/mini/Direct.png, update-interval=172800, opt-parser=true, enabled=true
```

