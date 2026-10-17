#!/bin/bash
# run.sh <A|B|C> <out 子目录> <fixture|-> <only> [compare-redesign 额外参数…]
. "$(dirname "$0")/env.sh"
GROUP=$1; OUT=$2; FIXTURE=$3; ONLY=$4; shift 4
cd "$ORBITS_ROOT" || exit 1
curl -s -o /dev/null --max-time 240 "$PLAN_ORIGIN/app/tasks?tab=plan"
[ "$FIXTURE" != "-" ] && { plan_switch "$FIXTURE" || exit 1; }
node scripts/visual/compare-redesign.mjs --suite "scripts/visual/views/web-plan-$GROUP.json" --only "$ONLY" --app-origin "$PLAN_ORIGIN" --storage "$PLAN_STORAGE" \
  --out "$PLAN_OUT/$OUT" --workers "${PLAN_WORKERS:-1}" "$@" 2>&1 | grep -E "^(W-|N1).*(PASS|FAIL|ERR)" 
