# shellcheck shell=bash
# 公共变量（被同目录脚本 source）。
PLAN_ORIGIN=${PLAN_ORIGIN:-http://localhost:3203}
PLAN_STORAGE=${PLAN_STORAGE:-$HOME/orbit-sprint-evidence/redesign/.auth/qa@orbit.test.json}
PLAN_OUT=${PLAN_OUT:-$HOME/orbit-sprint-evidence/redesign/pixel-audit/run-02/plan-rework}
ORBITS_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." && pwd)
case "$PLAN_ORIGIN" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "PLAN_ORIGIN must be a local origin" >&2; exit 2 ;; esac
plan_cookie() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print('; '.join(c['name']+'='+c['value'] for c in d['cookies'] if c['domain'].lstrip('.') in ('localhost','127.0.0.1')))" "$PLAN_STORAGE"; }
plan_switch() { for _ in 1 2 3; do node "$ORBITS_ROOT/features/plans/v2/design-fixtures/switch.mjs" --origin "$PLAN_ORIGIN" --storage "$PLAN_STORAGE" --name "$1" >/dev/null 2>&1 && { echo "fixture $1"; return 0; }; sleep 5; done; echo "fixture $1 FAILED" >&2; return 1; }
