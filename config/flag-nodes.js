// mihomo ≥ v1.19.31
//
// Mihomo 单脚本模式（profile → script → code）覆写脚本
// 作用：给所有代理节点统一加上「国旗 + 空格 + 节点名」
// 日期：2026-10-18
// 配置作者：https://github.com/Amnesiash
//
// 用法：把本文件全部内容粘贴到客户端的「脚本」里（只支持单脚本的软件同理），
//       不要引入任何外部文件，也不需要 import / export。
//
// 处理范围（一次覆盖，全部同步改名，策略组和规则不会指向失效节点）：
//   1. proxies[].name            节点名 → 国旗 + 空格 + 节点名
//   2. proxy-groups[].proxies[]  策略组里引用的节点名同步改名（组名不动）
//   3. rules[] 目标字段           规则里直接写节点名的同步改名（组名不动）
//
// 命名规则：
//   - 已带国旗的节点（如 "🇺🇸United States 01" / "🇭🇰 Hong Kong 03"）只补一个空格，不会重复加；
//   - 没有国旗但名字能识别出地区的（中文、英文、缩写、常见城市）按地区补国旗；
//   - 识别不出地区的（流量、到期时间等订阅信息节点）原样保留，不瞎猜；
//   - 脚本可重复执行，结果幂等（跑两遍不会变成 "🇭🇰 🇭🇰 ..."）。
//
// 参考写法：https://github.com/Repcz/Tool/blob/X/mihomo/Client/Override/Override.js

// ---------------------------------- 地区词库 ---------------------------------
// 顺序即匹配优先级：先命中先返回；地区内部别名不区分大小写。
// 纯英特别名会做「单词边界」校验，避免 singapore 里的 in 被认成印度。
const FLAG_REGIONS = [
  { flag: "🇭🇰", aliases: ["香港", "九龙", "新界", "港", "hong kong", "hongkong", "hk", "hkg"] },
  { flag: "🇹🇼", aliases: ["台湾", "台灣", "台北", "新北", "高雄", "台中", "taiwan", "tpe", "tw"] },
  { flag: "🇯🇵", aliases: ["日本", "东京", "大阪", "埼玉", "日", "japan", "tokyo", "osaka", "jp", "nrt"] },
  { flag: "🇸🇬", aliases: ["新加坡", "狮城", "singapore", "sgp", "sg"] },
  { flag: "🇺🇸", aliases: ["美国", "美國", "洛杉矶", "圣何塞", "硅谷", "西雅图", "纽约", "达拉斯", "芝加哥", "美", "united states", "united states of america", "los angeles", "san jose", "seattle", "new york", "usa", "us"] },
  { flag: "🇰🇷", aliases: ["韩国", "韓國", "首尔", "韩", "korea", "seoul", "kr"] },
  { flag: "🇬🇧", aliases: ["英国", "伦敦", "曼彻斯特", "英", "united kingdom", "london", "england", "uk", "gb"] },
  { flag: "🇩🇪", aliases: ["德国", "德國", "法兰克福", "德", "germany", "frankfurt", "de"] },
  { flag: "🇳🇱", aliases: ["荷兰", "荷蘭", "阿姆斯特丹", "荷", "netherlands", "holland", "amsterdam", "nl"] },
  { flag: "🇨🇦", aliases: ["加拿大", "多伦多", "温哥华", "canada", "toronto", "vancouver", "ca"] },
  { flag: "🇦🇺", aliases: ["澳大利亚", "澳洲", "悉尼", "墨尔本", "australia", "sydney", "melbourne", "au"] },
  { flag: "🇷🇺", aliases: ["俄罗斯", "俄羅斯", "莫斯科", "俄", "russia", "moscow", "ru"] },
  { flag: "🇫🇷", aliases: ["法国", "法國", "巴黎", "法", "france", "paris", "fr"] },
  { flag: "🇮🇳", aliases: ["印度", "孟买", "india", "mumbai", "in"] },
  { flag: "🇹🇷", aliases: ["土耳其", "伊斯坦布尔", "turkey", "istanbul", "tr"] },
  { flag: "🇧🇷", aliases: ["巴西", "圣保罗", "brazil", "saopaulo", "br"] },
  { flag: "🇲🇾", aliases: ["马来西亚", "马来", "吉隆坡", "malaysia", "kuala lumpur", "my"] },
  { flag: "🇹🇭", aliases: ["泰国", "泰國", "曼谷", "thailand", "bangkok", "th"] },
  { flag: "🇻🇳", aliases: ["越南", "胡志明", "vietnam", "vn"] },
  { flag: "🇵🇭", aliases: ["菲律宾", "马尼拉", "philippines", "manila", "ph"] },
  { flag: "🇮🇩", aliases: ["印度尼西亚", "印尼", "雅加达", "indonesia", "jakarta", "id"] },
  { flag: "🇦🇪", aliases: ["阿联酋", "迪拜", "uae", "dubai", "ae"] },
  { flag: "🇮🇹", aliases: ["意大利", "米兰", "italy", "milan", "it"] },
  { flag: "🇪🇸", aliases: ["西班牙", "spain", "es"] },
  { flag: "🇸🇪", aliases: ["瑞典", "sweden", "se"] },
  { flag: "🇨🇭", aliases: ["瑞士", "switzerland", "ch"] },
  { flag: "🇵🇱", aliases: ["波兰", "poland", "pl"] },
  { flag: "🇫🇮", aliases: ["芬兰", "finland", "fi"] },
  { flag: "🇳🇴", aliases: ["挪威", "norway", "no"] },
  { flag: "🇩🇰", aliases: ["丹麦", "denmark", "dk"] },
  { flag: "🇮🇪", aliases: ["爱尔兰", "ireland", "ie"] },
  { flag: "🇦🇹", aliases: ["奥地利", "austria", "at"] },
  { flag: "🇧🇪", aliases: ["比利时", "belgium", "be"] },
  { flag: "🇨🇿", aliases: ["捷克", "czech", "cz"] },
  { flag: "🇭🇺", aliases: ["匈牙利", "hungary", "hu"] },
  { flag: "🇷🇴", aliases: ["罗马尼亚", "romania", "ro"] },
  { flag: "🇺🇦", aliases: ["乌克兰", "ukraine", "ua"] },
  { flag: "🇰🇿", aliases: ["哈萨克斯坦", "kazakhstan", "kz"] },
  { flag: "🇲🇽", aliases: ["墨西哥", "mexico", "mx"] },
  { flag: "🇦🇷", aliases: ["阿根廷", "argentina", "ar"] },
  { flag: "🇨🇱", aliases: ["智利", "chile", "cl"] },
  { flag: "🇳🇿", aliases: ["新西兰", "new zealand", "nz"] },
  { flag: "🇿🇦", aliases: ["南非", "south africa", "za"] },
  { flag: "🇪🇬", aliases: ["埃及", "egypt", "eg"] },
  { flag: "🇮🇱", aliases: ["以色列", "israel", "il"] },
  { flag: "🇸🇦", aliases: ["沙特", "saudi", "sa"] },
  { flag: "🇶🇦", aliases: ["卡塔尔", "qatar", "qa"] },
  { flag: "🇵🇰", aliases: ["巴基斯坦", "pakistan", "pk"] },
  { flag: "🇧🇩", aliases: ["孟加拉", "bangladesh", "bd"] },
  { flag: "🇱🇰", aliases: ["斯里兰卡", "sri lanka", "lk"] },
  { flag: "🇲🇲", aliases: ["缅甸", "myanmar", "mm"] },
  { flag: "🇰🇭", aliases: ["柬埔寨", "cambodia", "kh"] },
  { flag: "🇱🇦", aliases: ["老挝", "laos", "la"] },
  { flag: "🇲🇳", aliases: ["蒙古", "mongolia", "mn"] },
  { flag: "🇲🇴", aliases: ["澳门", "澳門", "macau", "macao", "mo"] },
];

// 订阅信息类节点（流量、到期时间等）不参与地区猜测，只归整空格
const FLAG_INFO_NAME = /剩余|到期|重置|官网|流量|套餐|订阅|距离|群组|官方/;

// 国旗 = 两个「区域指示符」连字。这里用代理对写法，不依赖 u 模式，兼容性最好
const FLAG_HEAD = /^\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/;

function flagSplit(name) {
  const match = FLAG_HEAD.exec(name);
  if (!match) return { flag: "", rest: name };
  const rest = name.slice(match[0].length).replace(/^[\s\u00a0\u200b]+/, "");
  return { flag: match[0], rest: rest };
}

function flagIsAscii(text) {
  return /^[\x00-\x7f]+$/.test(text);
}

function flagIsAsciiLetter(ch) {
  return ch !== "" && /[a-z]/.test(ch);
}

// 纯英特别名要求两侧不是字母（允许 "US01"/"JP01" 这类后缀数字），
// 同时避免 "singapore" 命中印度 "in"
function flagAliasHit(lower, alias) {
  if (!flagIsAscii(alias)) return lower.indexOf(alias) >= 0;
  let from = 0;
  for (;;) {
    const idx = lower.indexOf(alias, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after = lower[idx + alias.length] || "";
    if (!flagIsAsciiLetter(before) && !flagIsAsciiLetter(after)) return true;
    from = idx + 1;
  }
}

function flagGuess(name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < FLAG_REGIONS.length; i += 1) {
    const region = FLAG_REGIONS[i];
    for (let j = 0; j < region.aliases.length; j += 1) {
      if (flagAliasHit(lower, region.aliases[j])) return region.flag;
    }
  }
  return "";
}

// 核心：节点名 → "国旗 + 空格 + 节点名"
function flagName(rawName) {
  if (typeof rawName !== "string") return rawName;
  const name = rawName.trim();
  if (name === "") return rawName;
  const parsed = flagSplit(name);
  if (parsed.flag) return parsed.rest ? parsed.flag + " " + parsed.rest : parsed.flag;
  if (FLAG_INFO_NAME.test(name)) return name;
  const guessed = flagGuess(name);
  return guessed ? guessed + " " + name : name;
}

// 规则行目标字段改名（"DOMAIN,x,节点名" / "MATCH,节点名"），组名不动
function flagRenameRule(rule, rename, protect) {
  if (typeof rule !== "string") return rule;
  const parts = rule.split(",");
  for (let i = 1; i < parts.length; i += 1) {
    const key = parts[i].trim();
    if (key && rename[key] && !(protect && protect[key])) parts[i] = rename[key];
  }
  return parts.join(",");
}

// 程序入口：mihomo 单脚本模式约定入口为 main(config, profileName)
function main(config, profileName) {
  if (!config || typeof config !== "object") return config;

  // 1. 节点名 → 国旗 + 空格 + 节点名
  const rename = Object.create(null);
  const proxies = Array.isArray(config.proxies) ? config.proxies : [];
  for (let i = 0; i < proxies.length; i += 1) {
    const proxy = proxies[i];
    if (!proxy || typeof proxy.name !== "string") continue;
    const next = flagName(proxy.name);
    if (next !== proxy.name) {
      rename[proxy.name] = next;
      proxy.name = next;
    }
  }

  // 2. 策略组引用同步改名（组名本身保持原样）
  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const groupNames = Object.create(null);
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    if (group && typeof group.name === "string") groupNames[group.name] = true;
  }
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    if (!group || !Array.isArray(group.proxies)) continue;
    const list = [];
    for (let j = 0; j < group.proxies.length; j += 1) {
      const item = group.proxies[j];
      list.push(rename[item] && !groupNames[item] ? rename[item] : item);
    }
    group.proxies = list;
  }

  // 3. 规则里直接写的节点名同步改名
  if (Array.isArray(config.rules)) {
    const rules = [];
    for (let i = 0; i < config.rules.length; i += 1) {
      rules.push(flagRenameRule(config.rules[i], rename, groupNames));
    }
    config.rules = rules;
  }

  return config;
}
