/**
 * R26 events-mine 的装配与路由逻辑。Owner: 甲 (R26).
 * - 模式跟契约 8 走（`redesignContractMode("event-assessment")`）：mock / hybrid → 演示世界（或设计稿示例 fixture）；live → PostgreSQL。
 * - 会いたい人：库内活动用 `orbit-event-facts` 的报名者构成 × 当前计划人物类型（剩余目标），只给 upcoming。
 */
import { NextResponse } from "next/server";

import { myEventsQueryObject, myEventsResponseSchema } from "../../../shared/api-schema/events-mine";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import type { MyEventsResponse } from "../../../shared/contract/events-mine";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { DEMO_EVENTS } from "../../../shared/mock/demo-world";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { redesignContractMode } from "../../redesign-contracts/route";
import { getConfiguredEventAssessmentRuntime } from "../assessment/configured";
import { createMyEventsService, createPostgresMyEventsReader, type MyEventSourceRow, type MyEventsReader } from "./service";

const holder = globalThis as typeof globalThis & { __orbitMyEventsMockRows?: MyEventSourceRow[] | null };

/** 设计稿示例 fixture（dev 路由）：替换 mock 的参加予定；`null` 回到演示世界。 */
export function overrideMyEventsMock(rows: MyEventSourceRow[] | null): void {
  holder.__orbitMyEventsMockRows = rows;
}

function demoRows(): MyEventSourceRow[] {
  if (holder.__orbitMyEventsMockRows) return holder.__orbitMyEventsMockRows;
  const status = (id: string): MyEventSourceRow["status"] => (id === "demo-event-cfo-night" ? "attended" : id === "demo-event-saas-summit" ? "registered" : "planned");
  return DEMO_EVENTS.map((event) => ({ endsAt: null, eventId: event.id, startsAt: event.startsAt, status: status(event.id), title: event.title, venue: event.venue }));
}

export function mockMyEventsReader(): MyEventsReader {
  return {
    rows: async () => demoRows(),
    meet: async (_actor, ids) => Object.fromEntries(ids.map((id) => [id, (holder.__orbitMyEventsMockRows?.find((row) => row.eventId === id) as (MyEventSourceRow & { meet?: { count: number; initials: string[] } }) | undefined)?.meet ?? { count: 3, initials: ["高", "鈴", "伊"] }])),
  };
}

function liveReader(): MyEventsReader | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const query = (sql: string, values?: readonly unknown[]) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  const base = createPostgresMyEventsReader({ query, workspaceId: runtime.workspaceId });
  return {
    rows: base.rows,
    async meet(actorId, eventIds) {
      const assessment = getConfiguredEventAssessmentRuntime();
      if (!assessment || eventIds.length === 0) return {};
      const context = await assessment.plan.context(actorId, "ja");
      const remaining = context.types.filter((type) => !type.skipped && type.targetCount > type.metCount);
      const out: Record<string, { count: number; initials: string[] }> = {};
      for (const eventId of eventIds.slice(0, 20)) {
        const facts = await assessment.orbitEvents.facts(actorId, eventId, context);
        if (!facts) continue;
        const count = remaining.reduce((sum, type) => sum + (facts.extras.expected[type.key] ?? 0), 0);
        out[eventId] = { count, initials: (facts.meetNames ?? []).map((name) => name.trim().charAt(0)).filter(Boolean).slice(0, 4) };
      }
      return out;
    },
  };
}

export function createMyEventsRoute(deps: { resolveActor?: ResolveAuthenticatedApiActor; reader?: () => MyEventsReader | null } = {}) {
  return async function GET(request: Request): Promise<Response> {
    const mode = redesignContractMode("event-assessment");
    const headers = { ...runtimeBoundaryHeaders(mode), "cache-control": "private, no-store" };
    const actor = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor && mode === "live") return NextResponse.json(failure(new AppError("UNAUTHORIZED", "Sign in to access this resource.")), { headers, status: 401 });
    const url = new URL(request.url);
    const parsed = myEventsQueryObject.safeParse({ limit: url.searchParams.get("limit") ?? undefined, range: url.searchParams.get("range") ?? undefined });
    if (!parsed.success) return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "Invalid query.")), { headers, status: 400 });
    const platform = (url.searchParams.get("platform") ?? request.headers.get("x-orbit-platform")) === "app" ? "app" : "web";
    const sample = !actor || actor.id === DEMO_ACTOR_ID || request.headers.get("x-orbit-sample") === "1";
    const reader = deps.reader ? deps.reader() : mode === "live" && !sample ? liveReader() : mockMyEventsReader();
    if (!reader) return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Events require a configured live database."), { reason: "EVENTS_MINE_UNCONFIGURED" }), { headers, status: getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE") });
    const data: MyEventsResponse = await createMyEventsService({ reader }).list(actor?.id ?? DEMO_ACTOR_ID, { limit: parsed.data.limit, platform, range: parsed.data.range });
    const checked = myEventsResponseSchema.safeParse(data);
    if (!checked.success) return NextResponse.json(failure(new AppError("INTERNAL_ERROR", "An unexpected error occurred.")), { headers, status: 500 });
    return NextResponse.json(success(mode === "live" && !sample ? checked.data : { ...checked.data, items: checked.data.items.map((item) => ({ ...item, sample: true as const })) }), { headers, status: 200 });
  };
}
