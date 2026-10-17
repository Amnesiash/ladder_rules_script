// Mihomo 覆写脚本
// 日期：2026-10-18
// 配置作者：https://github.com/Amnesiash
// 数据与 config/Override.json 一致，均由 config/Override.yaml 编译而来

const main = (config) => {
  config["proxy-groups"] = [
    {
      name: "手动选择",
      type: "select",
      "include-all": true,
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/vpnlogo/Meta.png",
    },
    {
      name: "代理加速",
      type: "select",
      proxies: ["自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择", "DIRECT"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Global.png",
    },
    {
      name: "AI",
      type: "select",
      proxies: ["自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择", "DIRECT"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/color/OpenAI.png",
    },
    {
      name: "Telegram",
      type: "select",
      proxies: ["自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择", "DIRECT"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Telegram.png",
    },
    {
      name: "微软服务",
      type: "select",
      proxies: ["DIRECT", "自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Microsoft.png",
    },
    {
      name: "国际流媒体",
      type: "select",
      proxies: ["自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择", "DIRECT"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Streaming.png",
    },
    {
      name: "漏网之鱼",
      type: "select",
      proxies: ["DIRECT", "自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择"],
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Final.png",
    },
    {
      name: "自动选择",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Auto.png",
    },
    {
      name: "香港",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      filter: "(?i)港|hk|hongkong|hong kong",
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/HK.png",
    },
    {
      name: "台湾",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      filter: "(?i)台|tw|taiwan",
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/TW.png",
    },
    {
      name: "日本",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      filter: "(?i)日|jp|japan",
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/JP.png",
    },
    {
      name: "新加坡",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      filter: "(?i)新|sg|singapore",
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/SG.png",
    },
    {
      name: "美国",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      interval: 900,
      lazy: true,
      url: "http://www.gstatic.com/generate_204",
      hidden: false,
      filter: "(?i)美|us|unitedstates|united states",
      icon: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/US.png",
    },
  ];

  if (!config["rule-providers"]) {
    config["rule-providers"] = {};
  }
  config["rule-providers"] = Object.assign(config["rule-providers"], {
    Direct: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Direct.list",
      path: "./ruleset/Direct.list",
    },
    Private: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Private.list",
      path: "./ruleset/Private.list",
    },
    AI: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/AI.list",
      path: "./ruleset/AI.list",
    },
    Telegram: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/Telegram.list",
      path: "./ruleset/Extra/Telegram.list",
    },
    Microsoft: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/Microsoft.list",
      path: "./ruleset/Extra/Microsoft.list",
    },
    Streaming: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Streaming.list",
      path: "./ruleset/Streaming.list",
    },
    SteamCN: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/SteamCN.list",
      path: "./ruleset/Extra/SteamCN.list",
    },
    Proxy: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Proxy.list",
      path: "./ruleset/Proxy.list",
    },
    China: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/China.list",
      path: "./ruleset/China.list",
    },
  });

  config["rules"] = [
    "RULE-SET, Private, DIRECT",
    "RULE-SET, Direct, DIRECT",
    "RULE-SET, Microsoft, 微软服务",
    "RULE-SET, AI, AI",
    "RULE-SET, Telegram, Telegram",
    "RULE-SET, Streaming, 国际流媒体",
    "RULE-SET, SteamCN, DIRECT",
    "RULE-SET, Proxy, 代理加速",
    "RULE-SET, China, DIRECT",
    "GEOIP, CN, DIRECT",
    "MATCH, 漏网之鱼",
  ];

  return config;
}

export { main };
export default main;
