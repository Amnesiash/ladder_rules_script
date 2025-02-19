# Rules Configuration (自用)| Amnesiash.

<p align="center">
  <a href="https://github.com/Amnesiash/ladder_rules_script/tree/main/Rules">

  **仓库内容来源于网络中 如有侵权或未标明出处请预留issue**
</p>

## 目录
- [1️⃣ 使用指南](#1️⃣使用指南)
  - [配置要求](#)
  - [安装步骤](#)
  - [推荐排序](#)
- [2️⃣ 常见问题](#2️⃣常见问题)
- [3️⃣ 关于去广告](#3️⃣关于去广告)
- [4️⃣ 许可与说明](#8️⃣许可与说明)
-----

# **1️⃣使用指南**
### 1.配置要求
 - 列表内规则适用于 Clash/Loon/Quantumult X
 - 请将规则添加至 **分流** 列表中
 - 请使用规则的 **raw 链接**

### 2.安装步骤

1. 选择你想要使用的规则
2. 获取 RAW 链接
```
例如：
  
  https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Proxy.yaml 
  此为浏览器地址栏中获取到的链接

```
3.使用 **镜像加速域名** 替换 RAW链接,以避免更新配置时出错的相关问题


```markdown
使用 GitHub Proxy CDN 链接

  e.g: https://ghfast.top/RAW链接
  
  例如文件: https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Proxy.yaml
  
  替换后链接为
  
  https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Proxy.yaml
```
或
```markdown
使用 JsDeliver CDN 链接

  e.g: https://cdn.jsdelivr.net/gh/Amnesiash/ladder_rules_script@main/Rules/Clash/Proxy.yaml
  
  例如文件: https://github.com/Amnesiash/ladder_rules_script/main/Rules/Clash/Proxy.yaml
  
  替换后链接为
  
  https://cdn.jsdelivr.net/gh/Amnesiash/ladder_rules_script@main/Rules/Clash/Proxy.yaml
```


### 3.推荐排序

> 推荐使用的规则排序如下
```markdown
1. Direct+ - 代理修正（修正被广告拦截或被代理的正常网址）
2. Adrules - 广告拦截（可不加）
3. Streaming!CN - 国际流媒体
4. StreamingCN - 国内流媒体（可不加）
5. Proxy - 国际网站/应用
6. Apple - Apple 服务（可不加）
7. Direct - 国内网站/应用
8. LAN - 局域网
```

**说明**

- 如若**不需要**观看哔哩哔哩、爱奇艺面向港澳台的限定内容可不加「StreamingCN」。
- 如若**不需要**代理 Apple 服务可不加「Apple」，若加入必须在「Proxy」和「Direct」之间。
- 如需细化流媒体如「Youtube」需要加在「Streaming!CN」之前。
- 如需应用类的如「Telegram、Google、PayPal」需要加在「Proxy」之前。

一般情况下默认引入上述 8 个（如不需要 Adrules、StreamingCN 和 Apple 可减至 5 个）即可，那么为什么还有更多的如「Youtube、Netflix、Spotify、Mail」？

1. 对于一些「进阶玩家」来说其拥有专用于观看流媒体的线路，比如观看限定区域的 Netflix、Hulu、HBO 等，所以引入相关 .list 建立一个策略组设置相应服务区节点线路。但对于普通用户来说，那些「Youtube、Hulu」来说都是集成在「ForeignMedia」中**不需要**额外引入。
2. 对于一些「机场」来说为了避免有恶意用户利用节点线路滥发垃圾邮件，所以对服务器相关邮件端口进行了屏蔽，这时候可以引入「Mail」指定一个可收发邮件对节点。
3. 对于一些「进阶玩家」来说其拥有高速的新加坡节点线路，为了提升 Telegram 使用体验所以会引入「Telegram」指定一些节点。

综上所述、以此类推，独立的  一般都集成在了默认的 5 条文件中，如果你没有进阶的定制化需求是**不 需 要**引入那么多的，根据需求使用才是 Ruleset/Filter 的灵活用法，规则不是越多越好。

# **2️⃣常见问题**

> 0.Final 有什么作用？该怎样使用？

⚠️ 注意：在日常使用之中，我们推荐使用 [Final，Proxy] 模式，除非有着特殊需求。

换种方式而言，就是除了配置文件中选定规则以外的所有请求，都通过代理访问。

- GeoIP 规则已经可以解决绝大多数的境内网站直连。
- 而剩下未能被匹配的规则使用 Final 就好。

> 1.遇到连接公共场所 Wi-Fi 时验证页面无法显示？

请暂时关闭待验证成功后再开启，或者如校园网运营商客户端的可将相关域名或 IP 地址手动加入至 【分流】中。

> 2.打开「淘宝」等阿里系应用时遇到「访问被拒绝」、「请检查是否使用了代理」等提示

部分「阿里云」节点会导致此问题，请尝试使用其他节点。

> 3.关于 Speedtest 想直连/代理？

规则对于 Speedtest 不是绝对的直连也不是绝对的代理，对于国内测速点是直连，对于国外测速点是代理。

默认打开 Speedtest 会自动选择适用于代理服务器节点的国外测速节点，若要进行国内网速测试手动修改「测速点」搜索你所在城市或省会的拼音然后选择运营商即可。


# **3️⃣关于去广告**

#### ⚠️ 为什么列表中没有 广告拦截 规则？

已经有很多成熟的广告拦截规则，推荐自己寻找
首推 [**Adrules**](https://adrules.top/)

#### 为什么某一些应用仍然有广告

**1.规则不是万能的**

不是所有广告都能简单的依靠规则阻止。

# **4️⃣许可与说明**

- 本项目的所有代码除另有说明外，均基于MIT License发布。

- 此处的文字仅用于说明，条款以LICENSE文件中的内容为准。

- 请在遵守当地相关法律法规的前提下使用本项目，我们不为使用此项目内容出现问题负任何责任。
