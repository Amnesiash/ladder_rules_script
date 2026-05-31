#!/usr/bin/env bash
# Telegram 通知脚本 - 检测 Rules 变更并发送通知
# 用法: telegram-notify.sh <repo_dir>
# 依赖环境变量: TG_BOT_TOKEN, TG_CHAT_ID

set -euo pipefail

TG_BOT_TOKEN="${TG_BOT_TOKEN:-}"
TG_CHAT_ID="${TG_CHAT_ID:-}"
REPO_NAME="${GITHUB_REPOSITORY:-unknown/repo}"
TREE_URL="https://github.com/${REPO_NAME}/blob/main"

if [[ -z "$TG_BOT_TOKEN" || -z "$TG_CHAT_ID" ]]; then
  echo "Telegram secrets not configured, skipping."
  exit 0
fi

REPO_DIR="${1:-.}"
cd "$REPO_DIR"

# 检测 Rules 变更
CHANGED_FILES=$(git diff HEAD~1 HEAD --name-only -- Rules/)
if [[ -z "$CHANGED_FILES" ]]; then
  echo "No rule changes detected, skipping."
  exit 0
fi

# 临时文件存储消息体（避免 curl -d 对 +、* 等字符的转义问题）
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# 按客户端收集
CLASH_DATA=""
LOON_DATA=""
QX_DATA=""
SR_DATA=""
ADDED=0
MODIFIED=0
DELETED=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  status=$(git diff HEAD~1 HEAD --diff-filter=ADM --name-status -- "$file" | awk '{print $1}')
  bname=$(basename "$file")

  stats=""
  if [[ "$status" == "A" ]]; then
    lines=$(git show HEAD:"$file" 2>/dev/null | wc -l | tr -d ' ')
    stats="(+${lines})"
    ADDED=$((ADDED + 1))
  elif [[ "$status" == "M" ]]; then
    added=$(git diff HEAD~1 HEAD --unified=0 -- "$file" 2>/dev/null | grep '^+' | grep -v '^+++' | wc -l)
    deleted=$(git diff HEAD~1 HEAD --unified=0 -- "$file" 2>/dev/null | grep '^-' | grep -v '^---' | wc -l)
    stats="(+${added}/-${deleted})"
    MODIFIED=$((MODIFIED + 1))
  elif [[ "$status" == "D" ]]; then
    DELETED=$((DELETED + 1))
  fi

  entry="${bname}|${status}|${stats}"
  case "$file" in
    Rules/Clash/*)       CLASH_DATA="${CLASH_DATA}${entry}"$'\n' ;;
    Rules/Loon/*)        LOON_DATA="${LOON_DATA}${entry}"$'\n' ;;
    Rules/QuantumultX/*) QX_DATA="${QX_DATA}${entry}"$'\n' ;;
    Rules/Shadowrocket/*) SR_DATA="${SR_DATA}${entry}"$'\n' ;;
  esac
done <<< "$CHANGED_FILES"

# 构建消息到临时文件
printf '*📢 rule provider 产物变化*\n\n' >> "$TMPFILE"
printf '━━━━━━━━━━━━━━━━━━\n' >> "$TMPFILE"
printf '🟢 新增 **%s** / 🟡 更新 **%s** / 🔴 删除 **%s**\n' "$ADDED" "$MODIFIED" "$DELETED" >> "$TMPFILE"
printf '━━━━━━━━━━━━━━━━━━\n' >> "$TMPFILE"

# 客户端列表
build_section() {
  local client="$1"
  local path="$2"
  local data="$3"
  [[ -z "$data" ]] && return
  printf '\n*%s*\n' "$client" >> "$TMPFILE"
  while IFS='|' read -r filename status stats; do
    [[ -z "$filename" ]] && continue
    local emoji=""
    [[ "$status" == "A" ]] && emoji="🟢"
    [[ "$status" == "M" ]] && emoji="🟡"
    [[ "$status" == "D" ]] && emoji="🔴"
    if [[ "$status" == "D" ]]; then
      printf '%s %s\n' "$emoji" "$filename" >> "$TMPFILE"
    else
      printf '%s [%s](%s/Rules/%s/%s) %s\n' "$emoji" "$filename" "$TREE_URL" "$path" "$filename" "$stats" >> "$TMPFILE"
    fi
  done <<< "$data"
}

build_section "Clash" "Clash" "$CLASH_DATA"
build_section "Loon" "Loon" "$LOON_DATA"
build_section "QuantumultX" "QuantumultX" "$QX_DATA"
build_section "Shadowrocket" "Shadowrocket" "$SR_DATA"

# 发送（用 --data-urlencode text@file 避免特殊字符转义）
response=$(curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TG_CHAT_ID}" \
  -d "parse_mode=Markdown" \
  --data-urlencode "text@${TMPFILE}" \
  -d "disable_web_page_preview=true" 2>&1)

if echo "$response" | grep -q '"ok":false'; then
  echo "Telegram send failed: $response"
  exit 1
else
  echo "Telegram notification sent successfully."
fi
