# 网络代理工具设置
## 前言
自用的代理软件配置文件及分流规则。

## Profile文件说明
### Clash <a href="">

#### 1️⃣添加配置文件订阅连接：
**MASTER分支**

https://raw.githubusercontent.com/surfingcatt/surfingcat/main/Clash/clash_config.yml

**MASTER分支 GHProxy`免代理`**

https://ghproxy.com/https://raw.githubusercontent.com/surfingcatt/surfingcat/main/Clash/clash_config.yml


#### 2️⃣在CFW中配置预处理：

```yaml
parsers: # array
  - url: https://ghproxy.com/https://raw.githubusercontent.com/surfingcatt/surfingcat/main/Clash/clash_config.yml
    yaml:
      mix-proxy-providers:
        #多个订阅复制下方
        替换为你想要的订阅名称:
          type: http
          url: https://api.v1.mk/sub?target=clash&url=你的订阅链接&emoji=true&list=true&udp=true
          # 可以使用任意类型的链接替换上面文字，多个链接使用英文符号的竖杠|隔开一起写上即可；也可以将Clash订阅链接替换掉整个引号""内的链接
          interval: 3600
          filter: 线|x|专
          # 根据订阅内中的节点梳理关键字，排除无效节点，如“剩余流量：***”
          path: ./proxy/替换为你想要的订阅名称.yaml
          health-check:
            enable: true
            interval: 600
            url: http://www.gstatic.com/generate_204

      commands:
        - proxy-groups.0.use.0=替换为你想要的订阅名称
        #上方为将原使用文件替换
        - proxy-groups.0.use.1+第二个订阅名称
        #如果你有多个订阅将上方0=修改为1+第二个订阅名称，后面的以此类推
        #将.0.替换为.1.
        #0为设置手动选择分组，1为设置自动选择分组
        - proxy-groups.1.use.0=替换为你想要的订阅名称
        - proxy-groups.1.use.1+第二个订阅名称

```
