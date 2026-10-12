/**
 * 像素门禁用：把 mock 仓储里的演示计划换成「设计稿示例 fixture」（见 `features/plans/v2/design-fixtures/README.md`）。
 *
 * - 文件名是 `route.dev.ts`：`next.config.js` 只在非生产把 `dev.ts` 当路由扩展名，生产构建不收录本接口，
 *   fixture 数据也就不会被打包（`tests/plans/plan-design-fixtures.test.ts` 守）。
 * - 再加两道运行时闸：NODE_ENV=production 或计划接口不是 mock（有库）时一律 404。
 * - `POST { name }` 切换（`name: null` 回到演示世界）；`GET` 列出可用名字。
 */
import { NextResponse } from "next/server";

import { redesignContractMode } from "../../../../features/redesign-contracts/route";
import { PLAN_DESIGN_EVENT_FACTS, PLAN_DESIGN_FIXTURES, PLAN_DESIGN_STEP_SUGGESTIONS } from "../../../../features/plans/v2/design-fixtures";
import { overridePlansV2MockSeed } from "../../../../features/plans/v2/service-factory";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Orbit-Runtime-Boundary": "developer-local" } as const;

function available(): boolean {
  return process.env.NODE_ENV !== "production" && redesignContractMode("plan-v2-summary") === "mock";
}

const notFound = () => NextResponse.json({ error: "not_found" }, { headers: HEADERS, status: 404 });

export async function GET() {
  if (!available()) return notFound();
  return NextResponse.json({ names: Object.keys(PLAN_DESIGN_FIXTURES).sort() }, { headers: HEADERS });
}

export async function POST(request: Request) {
  if (!available()) return notFound();
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = body?.name;
  if (name === null) {
    overridePlansV2MockSeed(null);
    return NextResponse.json({ name: null }, { headers: HEADERS });
  }
  if (typeof name !== "string" || !PLAN_DESIGN_FIXTURES[name]) {
    return NextResponse.json({ error: "unknown_fixture", names: Object.keys(PLAN_DESIGN_FIXTURES).sort() }, { headers: HEADERS, status: 400 });
  }
  overridePlansV2MockSeed(PLAN_DESIGN_FIXTURES[name]!(), PLAN_DESIGN_EVENT_FACTS[name]?.() ?? null, PLAN_DESIGN_STEP_SUGGESTIONS[name] ?? null);
  return NextResponse.json({ name }, { headers: HEADERS });
}
