#!/bin/bash
# sum.sh <out 子目录> <id 前缀…>：每张的 raw 与超阈带（>0.02）
. "$(dirname "$0")/env.sh"
DIR="$PLAN_OUT/$1"; shift
for id in "$@"; do for d in "$DIR/$id"-*/; do [ -f "$d/result.json" ] || continue
  python3 - "$d" <<'PY'
import json, os, sys
d = sys.argv[1]; r = json.load(open(os.path.join(d, "result.json")))
cells = json.load(open(os.path.join(d, "cells.json")))["cells"] if os.path.exists(os.path.join(d, "cells.json")) else []
print(os.path.basename(d.rstrip("/")), r.get("raw"), [(c["band"], round(c["mismatch"], 3)) for c in sorted(cells, key=lambda c: c["band"]) if c["mismatch"] > 0.02])
PY
done; done
