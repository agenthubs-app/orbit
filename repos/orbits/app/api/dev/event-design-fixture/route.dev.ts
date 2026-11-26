/**
 * 像素门禁用：把 mock 的活动评估 / 参加予定换成「设计稿示例 fixture」（`features/events/design-fixtures`）。
 * - `route.dev.ts`：只在非生产当路由，生产构建不收录（fixture 不进生产包）。
 * - 运行时闸：NODE_ENV=production 或契约 8 不是 mock 时一律 404。
 * - `POST { name }` 切换（`name: null` 回到演示世界）；`GET` 列出名字。
 * - R17：`POST { host: { center?: "empty"|"few"|"many"|"inactive", overview?: "pre_open"|"live", setup?: "few"|"many", kiosk?: "before"|"live"|"offline", organizer?: "empty"|"few"|"many" } }` 切换主催示例变体，`host: null` 恢复默认（features/events/host/mock.ts）。
 * - R27：`POST { journey: { discover?, overview?, after?: "empty" | "few" | "many", venue?: 会場 state, registration?: "none" | "registered" | "pending_review" } }` 切换参加者整条路的示例变体，
 *   `journey: null` 恢复默认（features/events/journey/mock.ts）。
 * - 2026-11-20：`name: "venue-record"` 另外装上一场已结束的示例活动（`design-event-venue-record`：会場の記録 / 参加者の詳細 /
 *   详情 venueRecord / 会後 met.people），换别的名字或 `name: null` 时卸下。
 */
import { NextResponse } from "next/server";

import { DESIGN_FIXTURE_NOW, EVENT_DESIGN_FIXTURES } from "../../../../features/events/design-fixtures";
import { setDesignFixtureNow } from "../../../../features/events/dev-clock";
import { VENUE_RECORD_EVENT_ID, venueRecordService } from "../../../../features/events/design-fixtures/venue-record";
import { setJourneyMockRecord } from "../../../../features/events/journey/mock";
import { overrideMyEventsMock } from "../../../../features/events/mine/configured";
import { overrideRedesignMockAssessments, setHostMockState, setJourneyMockState, type JourneyMockState } from "../../../../features/redesign-contracts/service-factory";
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
  const body = (await request.json().catch(() => null)) as { name?: unknown; journey?: unknown; host?: unknown } | null;
  if (body && "host" in body) {
    if (redesignContractMode("host-operations") !== "mock") return notFound();
    const raw = body.host as Record<string, unknown> | null;
    const allowed: Record<string, readonly string[]> = { center: ["empty", "few", "many", "inactive"], kiosk: ["before", "live", "offline"], organizer: ["empty", "few", "many"], overview: ["pre_open", "live"], report: ["normal", "suppressed"], setup: ["few", "many"] };
    const patch: Record<string, string> = {};
    for (const [key, values] of Object.entries(allowed)) if (raw && typeof raw[key] === "string" && values.includes(raw[key] as string)) patch[key] = raw[key] as string;
    const state = setHostMockState(raw === null ? null : patch);
    setDesignFixtureNow(raw === null ? null : DESIGN_FIXTURE_NOW);
    return NextResponse.json({ host: state }, { headers: HEADERS });
  }
  if (body && "journey" in body) {
    if (redesignContractMode("event-recommendation-feedback") !== "mock") return notFound();
    const VARIANTS = ["empty", "few", "many"];
    const STATES = ["not_registered", "before_check_in", "checked_in", "ended"];
    const raw = body.journey as Record<string, unknown> | null;
    const patch: Partial<JourneyMockState> = {};
    for (const key of ["discover", "overview", "after"] as const) if (raw && typeof raw[key] === "string" && VARIANTS.includes(raw[key] as string)) patch[key] = raw[key] as JourneyMockState[typeof key];
    if (raw && typeof raw.venue === "string" && STATES.includes(raw.venue)) patch.venue = raw.venue as JourneyMockState["venue"];
    // 报名状态不随上一次切换残留：没给就回到未报名。
    patch.registration = raw && typeof raw.registration === "string" && ["registered", "pending_review"].includes(raw.registration) ? raw.registration as JourneyMockState["registration"] : "none";
    const state = setJourneyMockState(raw === null ? null : patch);
    setDesignFixtureNow(raw === null ? null : DESIGN_FIXTURE_NOW);
    return NextResponse.json({ journey: state }, { headers: HEADERS });
  }
  if (body?.name === null) {
    setJourneyMockRecord(null);
    await overrideRedesignMockAssessments(null);
    overrideMyEventsMock(null);
    setDesignFixtureNow(null);
    return NextResponse.json({ name: null }, { headers: HEADERS });
  }
  const name = typeof body?.name === "string" ? body.name : "";
  const fixture = EVENT_DESIGN_FIXTURES[name];
  if (!fixture) return NextResponse.json({ error: "unknown_fixture", names: Object.keys(EVENT_DESIGN_FIXTURES).sort() }, { headers: HEADERS, status: 400 });
  setDesignFixtureNow(DESIGN_FIXTURE_NOW);
  const data = fixture(new Date(DESIGN_FIXTURE_NOW));
  await overrideRedesignMockAssessments(data.assessments);
  overrideMyEventsMock(data.mine);
  setJourneyMockRecord(name === "venue-record" ? { eventId: VENUE_RECORD_EVENT_ID, service: venueRecordService() } : null);
  return NextResponse.json({ name }, { headers: HEADERS });
}
