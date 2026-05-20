| 脚本名 | 脚本路径 | 脚本功能 |
| --- | --- | --- |
| build-release.ts | `build_scripts/build-release.ts` | 生成 `.release/{Clash,Loon,QuantumultX,Shadowrocket}/` 产物（默认清理旧 `.release/`；并排除 `Rules/Custom`） |
| generate-rules.ts | `build_scripts/generate-rules.ts` | 读取 `Rules/rule_source.txt`，拉取订阅并按 Build.yml 的排序/去重逻辑生成 `Rules/{Loon,Shadowrocket,QuantumultX}/*.list` |
| sync-clash-from-rule-release.ts | `build_scripts/sync-clash-from-rule-release.ts` | 从隔壁 `rule` 项目 `release` 分支的 `.release/` 同步 Clash 规则目录到 `Rules/Clash/`（跳过 `README*`） |
| fetch.ts | `build_scripts/lib/fetch.ts` | `fetch` 拉取订阅（带 GitHub raw 代理候选兜底） |
| ruleset-sort-common.ts | `build_scripts/lib/ruleset-sort-common.ts` | 规则清理 + CIDR 前缀修正 + 排序/去重公共逻辑 |
| ruleset-sort-loon.ts | `build_scripts/lib/ruleset-sort-loon.ts` | Loon/Shadowrocket 用的分桶排序规则定义（DOMAIN/DOMAIN-SUFFIX/…） |
| ruleset-sort-shadowrocket.ts | `build_scripts/lib/ruleset-sort-shadowrocket.ts` | Shadowrocket 用的分桶排序规则定义（DOMAIN/DOMAIN-SUFFIX/…） |
| ruleset-sort-quantumultx.ts | `build_scripts/lib/ruleset-sort-quantumultx.ts` | QuantumultX 用的分桶排序规则定义（排序在转换为 HOST 之前完成） |
| source-path.ts | `build_scripts/lib/source-path.ts` | 解析 `Rules/rule_source.txt` 路径（仅支持新路径） |
| source.ts | `build_scripts/lib/source.ts` | 解析 `rule_source.txt` 的分组与 URL 列表（`[Group]` + urls） |
| text.ts | `build_scripts/lib/text.ts` | 规则文本行归一化与拆行（去 BOM、去引号、去行尾注释等） |
| time.ts | `build_scripts/lib/time.ts` | 输出 `Asia/Shanghai` 时区的 `YYYY-MM-DD HH:mm:ss` |
