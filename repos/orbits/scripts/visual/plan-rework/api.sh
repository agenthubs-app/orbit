#!/bin/bash
# api.sh METHOD path [json] —— 以 qa 身份调 mock 服务器的 /api/agent/plans<path>
. "$(dirname "$0")/env.sh"
COOKIE=$(plan_cookie)
if [ -n "$3" ]; then curl -s -X "$1" -H "cookie: $COOKIE" -H 'content-type: application/json' -H 'x-orbit-lang: ja' -d "$3" "$PLAN_ORIGIN/api/agent/plans$2"
else curl -s -X "$1" -H "cookie: $COOKIE" -H 'x-orbit-lang: ja' "$PLAN_ORIGIN/api/agent/plans$2"; fi
