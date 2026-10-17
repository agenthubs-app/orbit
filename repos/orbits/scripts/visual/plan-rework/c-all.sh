#!/bin/bash
# c-all.sh <步骤…>：C 组（見直し / 完了 / 目標 / 以前のプラン）整套。步骤：legacy r03 r05 r06 done goals modal mm mgoals medit mused edit used
DIR=$(dirname "$0"); . "$DIR/env.sh"
OUT=${C_OUT:-c}
warm() { curl -s -o /dev/null --max-time 240 -H "cookie: $(plan_cookie)" "$PLAN_ORIGIN$1"; }
run() { "$DIR/run.sh" C "$OUT" - "$1"; }
warm "/app/tasks?tab=plan"
for step in "$@"; do
  case $step in
    modal) plan_switch c-review && python3 "$DIR/setup.py" one >/dev/null && run W-R25-01 && plan_switch b12-270-achieve && run W-R25-07 ;;
    mm) plan_switch null && run W-R25-01M && plan_switch b12-270-achieve && run W-R25-07M ;;
    mgoals) plan_switch c-goals && run W-R25-09M ;;
    medit) plan_switch c-edit && run W-R25-10M ;;
    mused) plan_switch c-review && python3 "$DIR/setup.py" used >/dev/null && run W-R25-02M ;;
    edit) plan_switch c-edit && run W-R25-10 ;;
    used) plan_switch c-review && python3 "$DIR/setup.py" used >/dev/null && run W-R25-02 ;;
    legacy) plan_switch c-legacy && warm /app/plans/legacy/design-legacy-series-a && run W-R25-12,W-R25-13 ;;
    r03) plan_switch c-review && python3 "$DIR/setup.py" 03 >/dev/null && run W-R25-03 ;;
    r05) plan_switch c-review && python3 "$DIR/setup.py" 05 >/dev/null && run W-R25-05 ;;
    r06) plan_switch c-review && python3 "$DIR/setup.py" 06a >/dev/null && run W-R25-06a ;;
    done) plan_switch c-done && warm /app/plans/demo-plan-series-a/done && run W-R25-08 ;;
    goals) plan_switch c-goals && run W-R25-09 ;;
    *) echo "unknown step $step" >&2 ;;
  esac
done
plan_switch null
