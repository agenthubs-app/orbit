#!/usr/bin/env bash
# W0016 验收 server：与 3000 端口的 dev server 同一目录，独立构建目录 `.next-verify`，端口 3001。
#
# 用法（从任意目录，包括仓库根的 `.claude/launch.json` 的 `orbits-verify` 配置）：
#   bash repos/orbits/scripts/verify-server.sh
#
# 只在启动命令里注入验收需要的几项（不写任何文件）；其余变量照常由 Next 从 `.env.local` 读取。
# 数据库连接串不在这里复制：启动前断言 `.env.local` 的 ORBIT_EVENT_DATABASE_URL 指向本机开发库，
# 再用 ORBIT_EXPECTED_DATABASE_HOST / ORBIT_EXPECTED_WORKSPACE_ID 把 server 钉在本机库与本机
# workspace 上（`shared/storage/live-database-config.ts` 的围栏：不符即拒绝连接）。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

VERIFY_PORT="${ORBIT_VERIFY_PORT:-3001}"
EXPECTED_DATABASE_NAME="orbit_newui_events_20260922"
EXPECTED_WORKSPACE_ID="workspace:orbit-small-staging-20260917"

# 断言本机库：只输出结论，不输出连接串。
node --import tsx scripts/seed-verify-accounts.ts --assert-only

exec env \
  ORBIT_NEXT_DIST_DIR=".next-verify" \
  ORBIT_DATABASE_TARGET="" \
  ORBIT_EXPECTED_DATABASE_HOST="localhost" \
  ORBIT_EXPECTED_WORKSPACE_ID="${EXPECTED_WORKSPACE_ID}" \
  ORBIT_WORKSPACE_ID="${EXPECTED_WORKSPACE_ID}" \
  ORBIT_FEATURE_MODE="live" \
  ORBIT_MODULE_MODE="live" \
  ORBIT_GUIDE_DEMO="on" \
  ORBIT_GUIDE_DEMO_SINCE="2026-09-01" \
  AUTH_TRUST_HOST="true" \
  ORBIT_VERIFY_EXPECTED_DATABASE_NAME="${EXPECTED_DATABASE_NAME}" \
  npx next dev --webpack --port "${VERIFY_PORT}"
