function main(config) {
  // 获取 proxy-providers 中所有的 provider 名称,做为 use 数组
  const useList = config["proxy-providers"] ? Object.keys(config["proxy-providers"]) : [];

  // 节点筛选正则锚点
  const filters = {
    HK: '^(?=.*((?i)🇭🇰|香港|\\b(HK|Hong)\\b))(?!.*((?i)回国|校园|游戏|🎮|\\b(GAME)\\b)).*$',
    TW: '^(?=.*((?i)🇹🇼|台湾|\\b(TW|Tai|Taiwan)\\b))(?!.*((?i)回国|校园|游戏|🎮|\\b(GAME)\\b)).*$',
    JP: '^(?=.*((?i)🇯🇵|日本|川日|东京|大阪|泉日|埼玉|\\b(JP|Japan)\\b))(?!.*((?i)回国|校园|游戏|🎮|\\b(GAME)\\b)).*$',
    SG: '^(?=.*((?i)🇸🇬|新加坡|狮|\\b(SG|Singapore)\\b))(?!.*((?i)回国|校园|游戏|🎮|\\b(GAME)\\b)).*$',
    US: '^(?=.*((?i)🇺🇸|美国|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|\\b(US|United States)\\b))(?!.*((?i)回国|校园|游戏|🎮|\\b(GAME)\\b)).*$'
  };

  // 策略组模板参数
  const strategyParams = {
    urlTest: {
      type: "url-test",
      url: "http://www.apple.com/library/test/success.html",
      interval: 300,
      tolerance: 20,
      lazy: true,
      timeout: 3000,
      "max-failed-times": 3,
      // hidden: true,
      "include-all": true,
      "exclude-filter": "到期|套餐",
    },
  };

  // 设置策略组
  config["proxy-groups"] = [
    { 
      name: "🚀 节点选择", 
      type: "select", 
      "include-all": true,
      "exclude-filter": "到期|套餐",
    },
    {
      name: "🌍 全球加速",
      type: "select",
      proxies: ["♻️ 自动选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇸🇬 狮城节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },
    {
      name: "🎨 FIGMA",
      type: "select",
      proxies: ["DIRECT", "♻️ 自动选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇸🇬 狮城节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },
    {
      name: "✨ AI",
      type: "select",
      proxies: ["🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },
    {
      name: "🎬 哔哩哔哩",
      type: "select",
      proxies: ["DIRECT", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🚀 节点选择"],
    },
    {
      name: "🎬 国际媒体",
      type: "select",
      proxies: ["♻️ 自动选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇸🇬 狮城节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },
    {
      name: "🍎 苹果服务",
      type: "select",
      proxies: ["DIRECT", "♻️ 自动选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇸🇬 狮城节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },
    {
      name: "🐟 漏网之鱼",
      type: "select",
      proxies: ["DIRECT", "♻️ 自动选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇸🇬 狮城节点", "🇺🇲 美国节点", "🚀 节点选择"],
    },

    // 自动测速优选策略组
    {
      name: "♻️ 自动选择",
      ...strategyParams.urlTest,
    },
    {
      name: "🇭🇰 香港节点",
      ...strategyParams.urlTest,
      filter: filters.HK,
    },
    {
      name: "🇨🇳 台湾节点",
      ...strategyParams.urlTest,
      filter: filters.TW,
    },
    {
      name: "🇯🇵 日本节点",
      ...strategyParams.urlTest,
      filter: filters.JP,
    },
    {
      name: "🇸🇬 狮城节点",
      ...strategyParams.urlTest,
      filter: filters.SG,
    },
    {
      name: "🇺🇲 美国节点",
      ...strategyParams.urlTest,
      filter: filters.US,
    },
  ];

  // 规则提供者
  config["rule-providers"] = {
    "直连修正": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/Direct.yaml",
      path: "./ruleset/Direct.yaml",
    },
    "微信": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/WeChat.yaml",
      path: "./ruleset/WeChat.yaml",
    },
    "SteamCN": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/SteamCN/SteamCN.yaml",
      path: "./ruleset/SteamCN.yaml",
    },
    "广告拦截": {
      type: "http",
      behavior: "domain",
      interval: 3600,
      url: "https://adrules.top/adrules_domainset.txt",
      path: "./ruleset/adrules.txt",
      format: "text",
    },
    "Lan": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/Lan.yaml",
      path: "./ruleset/Lan.yaml",
    },
    "AI": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/AI.yaml",
      path: "./ruleset/AI.yaml",
    },
    "哔哩哔哩": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/BilibiliHMT.yaml",
      path: "./ruleset/BilibiliHMT.yaml",
    },
    "国际流媒体": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/GlobalMedia.yaml",
      path: "./ruleset/GlobalMedia.yaml",
    },
    "苹果服务": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/Apple.yaml",
      path: "./ruleset/Apple.yaml",
    },
    "代理列表": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/Proxy.yaml",
      path: "./ruleset/Proxy.yaml",
    },
    "国内网站": {
      type: "http",
      behavior: "classical",
      interval: 3600,
      url: "https://ghfast.top/https://raw.githubusercontent.com/Amnesiash/ladder_rules_script/main/Clash/Rules/China.yaml",
      path: "./ruleset/China.yaml",
    },
  };

  // 配置规则集
  config.rules = [
    "DOMAIN-SUFFIX,board.zash.run.place,DIRECT",
    "DOMAIN-SUFFIX,ghfast.top,DIRECT",
    "DOMAIN-SUFFIX,figma.com,🎨 FIGMA",
    "RULE-SET,直连修正,DIRECT",
    "RULE-SET,SteamCN,DIRECT",
    "RULE-SET,AI,✨ AI",
    "RULE-SET,苹果服务,🍎 苹果服务",
    "RULE-SET,哔哩哔哩,🎬 哔哩哔哩",
    "RULE-SET,国际流媒体,🎬 国际媒体",
    "RULE-SET,代理列表,🌍 全球加速",
    "RULE-SET,国内网站,DIRECT",
    "RULE-SET,Lan,DIRECT",
    "GEOIP,CN,DIRECT",
    "MATCH,🐟 漏网之鱼",
  ];

  return config;
}
