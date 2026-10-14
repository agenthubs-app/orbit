/**
 * 像素门禁用：把 mock 的活动评估 / 参加予定换成「设计稿示例 fixture」（`features/events/design-fixtures`）。
 * - `route.dev.ts`：只在非生产当路由，生产构建不收录（fixture 不进生产包）。
 * - 运行时闸：NODE_ENV=production 或契约 8 不是 mock 时一律 404。
 * - `POST { name }` 切换（`name: null` 回到演示世界）；`GET` 列出名字。
 */
import { NextResponse } from "next/server";

import { DESIGN_FIXTURE_NOW, EVENT_DESIGN_FIXTURES } from "../../../../features/events/design-fixtures";
import { setDesignFixtureNow } from "../../../../features/events/dev-clock";
import { overrideMyEventsMock } from "../../../../features/events/mine/configured";
import { redesignMock } from "../../../../features/redesign-contracts/mock-service";
import { redesignContractMode } from "../../../../features/redesign-contracts/route";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Orbit-Runtime-Boundary": "developer-local" } as const;
const available = () => process.env.NODE_ENV !== "production" && redesignContractMode("event-assessment") === "mock";
const notFound = () => NextResponse.json({ error: "not_found" }, { headers: HEADERS, status: 404 });

export async function GET() {
  if (!available()) return notFound();
  return NextResponse.json({ names: Object.keys(EVENT_DESIGN_FIXTURES).sort() }, { headers: HEADERS });
}

export async function POST(request: Request) {
  if (!available()) return notFound();
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (body?.name === null) {
    redesignMock.overrideAssessments(null);
    overrideMyEventsMock(null);
    setDesignFixtureNow(null);
    return NextResponse.json({ name: null }, { headers: HEADERS });
  }
  const name = typeof body?.name === "string" ? body.name : "";
  const fixture = EVENT_DESIGN_FIXTURES[name];
  if (!fixture) return NextResponse.json({ error: "unknown_fixture", names: Object.keys(EVENT_DESIGN_FIXTURES).sort() }, { headers: HEADERS, status: 400 });
  setDesignFixtureNow(DESIGN_FIXTURE_NOW);
  const data = fixture(new Date(DESIGN_FIXTURE_NOW));
  redesignMock.overrideAssessments(data.assessments);
  overrideMyEventsMock(data.mine);
  return NextResponse.json({ name }, { headers: HEADERS });
}
