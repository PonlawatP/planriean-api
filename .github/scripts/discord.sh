#!/usr/bin/env bash
# discord.sh — Discord webhook helper for GitHub Actions CI/CD pipelines (2-stage: build/push, deploy).
#
# Usage:
#   discord.sh init <webhook> <title>
#     Post initial progress embed. Writes discord_message_id to GITHUB_OUTPUT.
#
#   discord.sh patch <webhook> <msg_id> <color> <title> <field1> <field2>
#     Update existing embed with two field values.
#
#   discord.sh done <webhook> <msg_id> <title> <result1> <result2>
#     Patch the progress message into the final summary. Green if all "success", red otherwise.
#
# Environment (auto-detected in GitHub Actions):
#   GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_REF_NAME, GITHUB_SHA

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/discord_workflow_embed.py"
RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
BRANCH="${GITHUB_REF_NAME}"
SHA7="${GITHUB_SHA:0:7}"

action="${1:?Usage: discord.sh init|patch|done WEBHOOK [args…]}"
webhook="${2:?missing webhook}"

case "$action" in
  init)
    title="${3:?missing title}"
    python3 "$PYTHON_SCRIPT" post "$webhook" <<ENDJSON
{
  "content": "New Action Started",
  "allowed_mentions": {"parse": ["everyone"]},
  "embeds": [{
    "title": "${title}",
    "description": "Live status · [\`${BRANCH}\`](${RUN_URL}) · \`${SHA7}\`",
    "color": 3447003,
    "url": "${RUN_URL}",
    "fields": [
      {"name": "1 · Build / push", "value": "⏳ Running…", "inline": false},
      {"name": "2 · Deploy", "value": "⏸ Pending", "inline": false}
    ]
  }]
}
ENDJSON
    ;;

  patch)
    msg_id="${3:?missing message id}"
    color="${4:?missing color}"
    title="${5:?missing title}"
    f1="${6:?missing field1}"
    f2="${7:?missing field2}"
    python3 "$PYTHON_SCRIPT" patch "$webhook" "$msg_id" <<ENDJSON
{
  "content": "",
  "allowed_mentions": {"parse": ["everyone"]},
  "embeds": [{
    "title": "${title}",
    "description": "Live status · [\`${BRANCH}\`](${RUN_URL}) · \`${SHA7}\`",
    "color": ${color},
    "url": "${RUN_URL}",
    "fields": [
      {"name": "1 · Build / push", "value": "${f1}", "inline": false},
      {"name": "2 · Deploy", "value": "${f2}", "inline": false}
    ]
  }]
}
ENDJSON
    ;;

  done)
    msg_id="${3:?missing message id}"
    title="${4:?missing title}"
    r1="${5:?missing result1}"
    r2="${6:?missing result2}"
    if [ "$r1" = "success" ] && [ "$r2" = "success" ]; then
      final_title="${title} ✅"
      desc="All stages succeeded ·"
      color=3066993
      v1="✅"; v2="✅"
    else
      final_title="${title} ❌"
      desc="One or more stages failed ·"
      color=15158332
      v1="\`${r1}\`"; v2="\`${r2}\`"
    fi
    python3 "$PYTHON_SCRIPT" patch "$webhook" "$msg_id" <<ENDJSON
{
  "content": "",
  "allowed_mentions": {"parse": ["everyone"]},
  "embeds": [{
    "title": "${final_title}",
    "description": "${desc} [\`${BRANCH}\`](${RUN_URL}) · \`${SHA7}\`",
    "color": ${color},
    "url": "${RUN_URL}",
    "fields": [
      {"name": "Build / push", "value": "${v1}", "inline": true},
      {"name": "Deploy", "value": "${v2}", "inline": true}
    ]
  }]
}
ENDJSON
    ;;

  *)
    echo "Unknown action: $action (use init|patch|done)" >&2
    exit 2
    ;;
esac
