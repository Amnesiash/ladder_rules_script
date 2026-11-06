#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基于自用版 QuantumultX 配置（iCloud iPhone-JiUXrVZ5.conf）生成模板。

做法：保留自用版原有注释，仅按 key 替换/新增配置项的值。
  general 段 -> 逐行替换值，network_check_url 为新增项
  dns 段     -> 启用 no-system，替换指定域名列表，段末追加 circumvent 两行
  rewrite_remote -> img-url 按 URL 特征替换为墨鱼版
  filter_remote  -> update-interval 统一 172800
  其余段落     -> 原样搬运（含 mitm 的 passphrase 与 p12）

值来源：
  network_check_url / fallback_udp_policy / circumvent-ipv4-answer
  / circumvent-ipv6-answer / DNS 指定域名(dl.google 等)   -> Orz-3
  geo_location_checker(disabled) / excluded_routes
  / udp_drop_list / DNS 指定域名(icloud 等)              -> 墨鱼
"""

import re

SRC = "/Users/admin/Library/Mobile Documents/iCloud~com~crossutility~quantumult-x/Documents/Profiles/iPhone-JiUXrVZ5.conf"
ORZ = "/Users/admin/Downloads/Orz-QuantumultX.conf"
OUT = "/Users/admin/Documents/ladder_rules_script/QuantumultX-Template.conf"

HEADER = """# QuantumultX 配置 
# Author：Amnesiash 
# Updatetime：2026/10/30"""

# [general] 段的取值替换（按 key 匹配，未列出的 key 保持自用版原值）
GENERAL_OVERRIDES = {
    "network_check_url": "http://www.apple.com/library/test/success.html",
    "geo_location_checker": "disabled",
    "excluded_routes": "239.255.255.250/32, 24.105.30.129/32, 185.60.112.157/32, 185.60.112.158/32, 182.162.132.1/32",
    "fallback_udp_policy": "reject",
    "udp_drop_list": "443, STUN, QUIC",
}

# DNS 指定域名列表（墨鱼 + Orz-3 合并，不含墨鱼原有的 alias）
DNS_SPECIFIC = [
    "server=/*.icloud.com/119.29.29.29",
    "server=/*.icloud.com.cn/119.29.29.29",
    "server=/*.tencent.com/119.29.29.29",
    "server=/*.weixin.com/119.29.29.29",
    "server=/dl.google.com/119.29.29.29",
    "server=/dl.l.google.com/119.29.29.29",
    "server=/update.googleapis.com/119.29.29.29",
    "server=/*.dl.playstation.net/119.29.29.29",
]

# rewrite_remote 的 img-url 映射（按 URL 特征子串匹配，取墨鱼版图标）
IMG_MAP = {
    "StartUpAds.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/Advertising.png",
    "CaiYunAds.conf": "https://github.com/ddgksf2013/Icon/raw/master/qx/caiyuntianqi.png",
    "zhihu.ads.js": "https://github.com/ddgksf2013/Icon/raw/master/qx/zhihu.png",
    "YoutubeAds.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/YouTube.png",
    "WeiboAds.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/Weibo.png",
    "NeteaseAds.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/Netease_Music.png",
    "Html/General.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/Google.png",
    "Q-Search.conf": "https://github.com/ddgksf2013/Icon/raw/master/qx/search.png",
    "XiaoHongShuAds.conf": "https://github.com/ddgksf2013/Icon/raw/master/qx/xiaohongshu.png",
    "bdpan.ads.js": "https://github.com/ddgksf2013/Icon/raw/master/qx/baiduwangpan.png",
    "UnblockURLinWeChat.conf": "https://github.com/Koolson/Qure/raw/master/IconSet/mini/WeChat.png",
}


def read_lines(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read().splitlines()


def split_sections(lines):
    """按 [section] 切分，返回 [(section_name, [lines...]), ...]，section 行保留在块内。"""
    sections = []
    current_name = None
    current = []
    for line in lines:
        m = re.match(r"^\[([A-Za-z_]+)\]\s*$", line.strip())
        if m:
            if current_name is not None:
                sections.append((current_name, current))
            current_name = m.group(1)
            current = [line]
        elif current_name is not None:
            current.append(line)
    if current_name is not None:
        sections.append((current_name, current))
    return sections


def get_orz_dns_lines():
    """从 Orz-3 配置提取 circumvent-ipv4-answer / circumvent-ipv6-answer 两行原值。"""
    out = {}
    for line in read_lines(ORZ):
        s = line.strip()
        if s.startswith("circumvent-ipv4-answer"):
            out["v4"] = line
        elif s.startswith("circumvent-ipv6-answer"):
            out["v6"] = line
    return out


def key_of(line):
    s = line.strip()
    if s.startswith(";") or s.startswith("#") or "=" not in s:
        return None
    return s.split("=", 1)[0].strip()


def rebuild_general(lines):
    """保留自用版原有注释，按 key 替换值；network_check_url 为新增项，单独成块。"""
    out = []
    has_network_check = any(key_of(l) == "network_check_url" for l in lines)
    for line in lines:
        key = key_of(line)
        if key in GENERAL_OVERRIDES:
            out.append(key + "=" + GENERAL_OVERRIDES[key])
        else:
            out.append(line)
    if not has_network_check:
        for i, line in enumerate(out):
            if key_of(line) == "server_check_timeout":
                j = i + 1
                while j < len(out) and out[j].strip() == "":
                    j += 1
                out.insert(j, "network_check_url=" + GENERAL_OVERRIDES["network_check_url"])
                out.insert(j + 1, "")
                break
    return out


def rebuild_dns(lines, orz):
    """保留自用版原有注释；启用 no-system；替换指定域名列表；段末追加 circumvent。"""
    out = []
    in_specific = False
    for line in lines:
        s = line.strip()
        if s.startswith("# 指定dns服务器"):
            in_specific = True
            out.append(line)
            out.extend(DNS_SPECIFIC)
            continue
        if in_specific:
            continue
        if s == ";no-system":
            out.append("no-system")
            continue
        out.append(line)
    out.append(orz["v4"].strip())
    out.append(orz["v6"].strip())
    return out


def process_rewrite_remote(lines):
    """替换 img-url 为墨鱼版；update-interval 保持自用版原值。"""
    result = []
    for line in lines:
        if line.strip().startswith("http"):
            for key, icon in IMG_MAP.items():
                if key in line:
                    line = re.sub(r"img-url=[^,]+", "img-url=" + icon, line)
                    break
        result.append(line)
    return result


def remove_update_interval(lines):
    """移除所有远程订阅/重写条目的 update-interval 属性（含前置逗号，避免残留空位）。"""
    out = []
    for line in lines:
        if line.strip().startswith("http"):
            line = re.sub(r",\s*update-interval=\d+", "", line)
        out.append(line)
    return out


def main():
    orz = get_orz_dns_lines()
    sections = split_sections(read_lines(SRC))

    out_lines = [HEADER]
    for name, lines in sections:
        if out_lines and out_lines[-1].strip() != "":
            out_lines.append("")
        if name == "general":
            out_lines.extend(rebuild_general(lines))
        elif name == "dns":
            out_lines.extend(rebuild_dns(lines, orz))
        elif name == "rewrite_remote":
            out_lines.extend(process_rewrite_remote(lines))
        else:
            out_lines.extend(lines)

    out_lines = remove_update_interval(out_lines)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines) + "\n")

    print("written:", OUT)
    text = "\n".join(out_lines)
    print("remaining update-interval:", text.count("update-interval"))
    print("p12 preserved:", "p12=MII" in text)


if __name__ == "__main__":
    main()
