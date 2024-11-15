## 规则列表

| 文件 | 名称 | 默认分流 | 解释 | 来源 |
| --- | --- | --- | --- |--- |
| [Direct+.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Direct+.list) | 直连修正 | 直连 | 不应该被拦截或代理的网站|[@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list) [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Direct+.list) [@Amnesiash](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Customized/ManualDirect.list) |
| [Reject.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Reject.list) | 广告拦截 | 阻止 | 中国地区屏蔽广告列表 | [@Cats-Team](https://adrules.top/adrules_domainset.txt) |
| [AI.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/AI.list) | AIGC | 代理 | 指定地区可用的AIGC | [@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list) [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/AI.list) [@Amnesiash](https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Customized/AIGC.list) |
| [Apple.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Apple.list) | 苹果服务 | 直连 | 苹果公司的所有域名 | [@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Apple.list) [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Apple/Apple.list) |
| [StreamingCN.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/StreamingCN.list) | 港台番剧 | 直连 | 国内包含海外渠道的流媒体。BiliBili、爱奇艺等 | [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Streaming/CN.list) |
| [Streaming!CN.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Streaming!CN.list) | 国外媒体 | 代理 | 国外流媒体列表。Youtube、Netflix等 | [@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list) [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Extra/Streaming/!CN.list) |
| [Proxy.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Proxy.list) | 代理列表 | 代理 | GFW全量列表 |[@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyGFWlist.list) [@ConnersHua](https://raw.githubusercontent.com/ConnersHua/RuleGo/master/Surge/Ruleset/Proxy.list) |
| [LAN.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/LAN.list) | 局域网 | 直连 | 本地地址和路由器直连域名啥的 |[@ACL4SSR](https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list)  |
| [Direct.list](https://github.com/Amnesiash/ladder_rules_script/raw/main/Rules/Clash/Direct.list) | 直连列表 | 直连 | 国内常见域名、直连CDN等。（建议直接使用[精简geoip](https://raw.githubusercontent.com/Masaiki/GeoIP2-CN/release/Country.mmdb)，速度更快、效率更高） | |



