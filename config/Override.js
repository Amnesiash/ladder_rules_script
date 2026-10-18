// mihomo ≥ v1.19.31
//
// Mihomo 覆写脚本
// 日期：2026-10-18
// 配置作者：https://github.com/Amnesiash
// 数据来源：config/Override.yaml
// 参考写法：https://github.com/Repcz/Tool/blob/X/mihomo/Client/Override/Override.js

// 规则集通用配置
const ruleProviderCommon = {
  type: "http",
  format: "text",
  interval: 86400,
};

// 策略组通用配置
const groupBaseOption = {
  interval: 900,
  tolerance: 0,
  lazy: true,
  url: "http://www.gstatic.com/generate_204",
};

// 地区分组筛选项
const regionFilters = {
  hk: "(?i)港|hk|hongkong|hong kong",
  tw: "(?i)台|tw|taiwan",
  jp: "(?i)日|jp|japan",
  sg: "(?i)新|sg|singapore",
  us: "(?i)美|us|unitedstates|united states",
};

// 应用策略层可选节点
const appGroupProxies = ["自动选择", "香港", "台湾", "日本", "新加坡", "美国", "手动选择", "DIRECT"];

// 图标
const icons = {
  meta: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/vpnlogo/Meta.png",
  global: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Global.png",
  openai: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/color/OpenAI.png",
  telegram: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Telegram.png",
  microsoft: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Microsoft.png",
  streaming: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Streaming.png",
  final: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Final.png",
  auto: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/Auto.png",
  hk: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/HK.png",
  tw: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/TW.png",
  jp: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/JP.png",
  sg: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/SG.png",
  us: "https://github.com/Amnesiash/ladder_rules_script/raw/main/gallery/Orz-3/Color/US.png",
};

// 程序入口
function main(config) {
  const proxyCount = config?.proxies?.length ?? 0;
  const proxyProviderCount =
    typeof config?.["proxy-providers"] === "object" ? Object.keys(config["proxy-providers"]).length : 0;
  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error("配置文件中未找到任何代理");
  }

  // 覆盖策略组
  config["proxy-groups"] = [
    // 应用策略层 - 手动选择，支持多场景应用优化
    {
      ...groupBaseOption,
      name: "手动选择",
      type: "select",
      "include-all": true,
      icon: icons.meta,
    },
    {
      ...groupBaseOption,
      name: "代理加速",
      type: "select",
      proxies: appGroupProxies,
      icon: icons.global,
    },
    {
      ...groupBaseOption,
      name: "AI",
      type: "select",
      proxies: appGroupProxies,
      icon: icons.openai,
    },
    {
      ...groupBaseOption,
      name: "Telegram",
      type: "select",
      proxies: appGroupProxies,
      icon: icons.telegram,
    },
    {
      ...groupBaseOption,
      name: "微软服务",
      type: "select",
      proxies: ["DIRECT", ...appGroupProxies.filter((item) => item !== "DIRECT")],
      icon: icons.microsoft,
    },
    {
      ...groupBaseOption,
      name: "国际流媒体",
      type: "select",
      proxies: appGroupProxies,
      icon: icons.streaming,
    },
    {
      ...groupBaseOption,
      name: "漏网之鱼",
      type: "select",
      proxies: ["DIRECT", ...appGroupProxies.filter((item) => item !== "DIRECT")],
      icon: icons.final,
    },

    // 地理策略层 - 自动测速节点选择
    {
      ...groupBaseOption,
      name: "自动选择",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      hidden: false,
      icon: icons.auto,
    },
    {
      ...groupBaseOption,
      name: "香港",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      filter: regionFilters.hk,
      hidden: false,
      icon: icons.hk,
    },
    {
      ...groupBaseOption,
      name: "台湾",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      filter: regionFilters.tw,
      hidden: false,
      icon: icons.tw,
    },
    {
      ...groupBaseOption,
      name: "日本",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      filter: regionFilters.jp,
      hidden: false,
      icon: icons.jp,
    },
    {
      ...groupBaseOption,
      name: "新加坡",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      filter: regionFilters.sg,
      hidden: false,
      icon: icons.sg,
    },
    {
      ...groupBaseOption,
      name: "美国",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct",
      filter: regionFilters.us,
      hidden: false,
      icon: icons.us,
    },
  ];

  // 覆盖规则集
  config["rule-providers"] = {
    Direct: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Direct.list",
      path: "./ruleset/Direct.list",
    },
    Private: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Private.list",
      path: "./ruleset/Private.list",
    },
    AI: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/AI.list",
      path: "./ruleset/AI.list",
    },
    Telegram: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/Telegram.list",
      path: "./ruleset/Extra/Telegram.list",
    },
    Microsoft: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/Microsoft.list",
      path: "./ruleset/Extra/Microsoft.list",
    },
    Streaming: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Streaming.list",
      path: "./ruleset/Streaming.list",
    },
    SteamCN: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Extra/SteamCN.list",
      path: "./ruleset/Extra/SteamCN.list",
    },
    Proxy: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/Proxy.list",
      path: "./ruleset/Proxy.list",
    },
    China: {
      ...ruleProviderCommon,
      behavior: "classical",
      url: "https://github.com/Amnesiash/ladder_rules_script/raw/main/rules/release/China.list",
      path: "./ruleset/China.list",
    },
  };

  // 覆盖规则
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

  // 返回修改后的配置
  return config;
}

export { main };
export default main;
