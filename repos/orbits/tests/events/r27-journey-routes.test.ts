/**
 * R27 路由层：mock 示例世界、未登录 / 登录边界、示例账号只读、live 未配置 503、会場未报名不读运营数据（SC-R27-08 零 403）、
 * 会後確定只认勾选行（SC-R27-09）、興味なし幂等（SC-R27-02）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventAfterResponseSchema } from "../../shared/api-schema/event-after";
import { eventDiscoverResponseSchema } from "../../shared/api-schema/event-discover";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";
import { eventPrepResponseSchema } from "../../shared/api-schema/event-prep";
import { eventSearchResponseSchema } from "../../shared/api-schema/event-search";
import { eventVenueResponseSchema } from "../../shared/api-schema/event-venue";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";
import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { createEventJourneyRoutes, resolveEventCode } from "../../features/events/journey/handlers";
import { setJourneyMockState } from "../../features/events/journey/mock";
import type { JourneyEvent, JourneyLivePorts } from "../../features/events/journey/ports";
import { createJourneyService } from "../../features/events/journey/service";

const actor = (id: string | null) => async () => (id ? ({ id } as never) : null);
const get = (path: string) => new Request(`http://localhost${path}`);
const post = (path: string, body: unknown, method = "POST") => new Request(`http://localhost${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

test("mock: 探す / 検索 / 詳細 / 会う準備 / 会場 / 会後 answer the sample world through the contract schemas", async () => {
  setJourneyMockState(null);
  const routes = createEventJourneyRoutes({ resolveActor: actor("actor:a"), resolveMode: () => "mock" });
  const discover = (await (await routes.discover(get("/api/events/discover"))).json()).data;
  eventDiscoverResponseSchema.parse(discover);
  assert.equal(discover.total, 28);
  assert.equal(discover.planFitTotal, 6);
  assert.equal(discover.sample, true);
  const search = (await (await routes.search(get("/api/events/search?q=CFO"))).json()).data;
  assert.equal(eventSearchResponseSchema.parse(search).events.length, 4);
  const overview = (await (await routes.overview(get(`/api/events/${JOURNEY_EVENT_ID}/overview`), params(JOURNEY_EVENT_ID))).json()).data;
  assert.equal(eventOverviewResponseSchema.parse(overview).attendeeCounts.all, 128);
  assert.equal(eventPrepResponseSchema.parse((await (await routes.prep(get("/x"), params(JOURNEY_EVENT_ID))).json()).data).people.length, 4);
  assert.equal(eventVenueResponseSchema.parse((await (await routes.venue(get("/x"), params(JOURNEY_EVENT_ID))).json()).data).state, "checked_in");
  const after = eventAfterResponseSchema.parse((await (await routes.after(get("/x"), params(JOURNEY_EVENT_ID))).json()).data);
  assert.deepEqual([after.met.count, after.score?.before, after.score?.after], [9, 46, 56]);
  // 变体切换（开发接口用同一函数）。
  setJourneyMockState({ after: "empty", discover: "empty", overview: "empty", venue: "not_registered" });
  assert.equal((await (await routes.discover(get("/api/events/discover"))).json()).data.popularityFallback, true);
  assert.equal((await (await routes.venue(get("/x"), params(JOURNEY_EVENT_ID))).json()).data.state, "not_registered");
  setJourneyMockState(null);
  assert.equal(await resolveEventCode("cfo18ngt", { resolveMode: () => "mock" }), JOURNEY_EVENT_ID);
});

test("signed out: 探す and 詳細 are readable without scores / community / plan; everything else needs sign-in", async () => {
  setJourneyMockState(null);
  const routes = createEventJourneyRoutes({ resolveActor: actor(null), resolveMode: () => "mock" });
  const discover = (await (await routes.discover(get("/api/events/discover"))).json()).data;
  assert.equal(discover.signedOut, true);
  assert.equal(discover.community.length + discover.planFit.length, 0);
  assert.equal(discover.all.some((row: { score?: number }) => typeof row.score === "number"), false);
  const overview = (await (await routes.overview(get("/x"), params(JOURNEY_EVENT_ID))).json()).data;
  assert.equal(overview.signedOut, true);
  assert.equal(overview.assessment, undefined);
  const live = createEventJourneyRoutes({ liveService: async () => null, resolveActor: actor(null), resolveMode: () => "live" });
  for (const call of [live.search(get("/api/events/search?q=CFO")), live.prep(get("/x"), params(JOURNEY_EVENT_ID)), live.venue(get("/x"), params(JOURNEY_EVENT_ID)), live.after(get("/x"), params(JOURNEY_EVENT_ID)), live.dismiss(post("/x", { idempotencyKey: "k", reason: "known" }), params(JOURNEY_EVENT_ID))]) {
    assert.equal((await call).status, 401);
  }
});

test("興味なし (mock): validates the reason, is idempotent, unknown event 404; it takes the event out of the recommendations", async () => {
  setJourneyMockState(null);
  const routes = createEventJourneyRoutes({ resolveActor: actor("actor:a"), resolveMode: () => "mock" });
  const dismiss = (id: string, body: unknown) => routes.dismiss(post(`/api/recommendations/events/${id}/dismiss`, body), params(id));
  assert.equal((await dismiss("demo-event-cvc-meetup-7", { idempotencyKey: "k", reason: "boring" })).status, 400);
  const first = await (await dismiss("demo-event-cvc-meetup-7", { idempotencyKey: "k", reason: "schedule" })).json();
  const again = await (await dismiss("demo-event-cvc-meetup-7", { idempotencyKey: "k", reason: "schedule" })).json();
  assert.equal(again.data.dismissedAt, first.data.dismissedAt);
  assert.equal((await dismiss("no-such-event", { idempotencyKey: "k2", reason: "known" })).status, 404);
  const discover = (await (await routes.discover(get("/api/events/discover"))).json()).data;
  assert.equal(discover.planFit.some((row: { eventId: string }) => row.eventId === "demo-event-cvc-meetup-7"), false);
  assert.equal(discover.all.some((row: { eventId: string }) => row.eventId === "demo-event-cvc-meetup-7"), true);
});

test("live: the sample account is read-only (403), an unconfigured database is 503", async () => {
  const sampleRoutes = createEventJourneyRoutes({ liveService: async () => null, resolveActor: actor(DEMO_ACTOR_ID), resolveMode: () => "live" });
  assert.equal((await sampleRoutes.dismiss(post("/x", { idempotencyKey: "k", reason: "known" }), params(JOURNEY_EVENT_ID))).status, 403);
  assert.equal((await sampleRoutes.confirmAfter(post("/x", { idempotencyKey: "k", items: [{ attendeeId: "a", followupDate: "2026-10-09" }] }), params(JOURNEY_EVENT_ID))).status, 403);
  assert.equal((await sampleRoutes.discover(get("/api/events/discover"))).status, 200, "the sample account still reads the sample world");
  const unconfigured = createEventJourneyRoutes({ liveService: async () => null, resolveActor: actor("actor:a"), resolveMode: () => "live" });
  assert.equal((await unconfigured.discover(get("/api/events/discover"))).status, 503);
});

function fakePorts(overrides: Partial<JourneyLivePorts> = {}): { ports: JourneyLivePorts; calls: string[] } {
  const calls: string[] = [];
  const event: JourneyEvent = { agenda: [], badges: [], capacity: 150, description: null, emoji: "🥂", endsAt: "2026-10-07T21:30:00+09:00", eventId: "ev1", organizerKey: "org_x", organizerName: "主催", priceYen: 5000, publicCode: null, registrationClosesAt: null, registrationCount: 3, review: false, startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night", venue: "渋谷" };
  const ports: JourneyLivePorts = {
    afterInputs: async () => { calls.push("afterInputs"); return { ai: null, confirmedAt: null, legacy: { messageDraft: "清水様 ありがとうございました", summary: "まとめ" }, meetings: 0, met: [{ attendeeId: "p1", contactId: "c1", name: "清水 玲奈", org: "Sorae", wanted: true, linkedTypeKey: "vc" }, { attendeeId: "p2", contactId: "c2", name: "森 拓也", org: "ブルーム", wanted: false }], plan: { before: 46, counted: new Set(), goal: "シリーズA", slots: [{ allocation: 30, earnedCount: 2, earnedPoints: 20, key: "vc", label: "VC パートナー", skipped: false, targetCount: 3 }] }, wantedTotal: 4 }; },
    catalogue: async () => [event],
    confirmAfter: async (_actor, _event, input) => { calls.push(`confirm:${input.items.map((item) => item.attendeeId).join(",")}`); return { confirmed: input.items.length, confirmedAt: "2026-10-07T13:00:00.000Z", contactsLinked: input.items.length, eventId: "ev1", scoreAfter: 56, tasksCreated: input.items.length }; },
    contacts: async () => [],
    event: async (id) => (id === "ev1" ? event : null),
    eventIdByCode: async () => null,
    judge: async () => ({ goal: null, hasPlan: false, results: {} }),
    myEvents: async () => [],
    organizerStats: async () => null,
    planTypesFor: async () => ({}),
    publicAttendees: async () => ({ attendees: [], total: 0 }),
    registered: async () => { calls.push("registered"); return false; },
    selfIntro: async () => null,
    upsertInbox: async () => true,
    venueWorkspace: async () => { calls.push("venueWorkspace"); return null; },
    ...overrides,
  };
  return { calls, ports };
}

function liveRoutes(ports: JourneyLivePorts) {
  const store = createMemoryActorRecordStore();
  const service = createJourneyService({ now: () => new Date("2026-10-07T13:00:00.000Z"), ports, records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) } });
  return createEventJourneyRoutes({ liveService: async () => service, resolveActor: actor("actor:a"), resolveMode: () => "live" });
}

test("live 会場: not registered → state not_registered and the operations workspace is never read", async () => {
  const { calls, ports } = fakePorts();
  const body = await (await liveRoutes(ports).venue(get("/x"), params("ev1"))).json();
  assert.equal(body.data.state, "not_registered");
  assert.deepEqual(calls, ["registered"]);
});

test("live 会後: rule fallback (no AI) — follow-up dates by business day, 🎯 = linked type, one thanks draft; confirm forwards only the checked rows", async () => {
  const { calls, ports } = fakePorts();
  const routes = liveRoutes(ports);
  const after = (await (await routes.after(get("/x"), params("ev1"))).json()).data;
  assert.equal(after.aiDraft, false);
  assert.equal(after.summary, "まとめ");
  assert.deepEqual(after.nextSteps.map((step: { followupDate: string }) => step.followupDate), ["2026-10-08", "2026-10-09"]);
  assert.deepEqual(after.nextSteps.map((step: { planType?: { key: string } | null }) => step.planType?.key ?? null), ["vc", null]);
  assert.equal(after.nextSteps.filter((step: { thanksDraft?: unknown }) => step.thanksDraft).length, 1);
  assert.deepEqual([after.score.before, after.score.after], [46, 56]);
  const confirmed = await routes.confirmAfter(post("/x", { idempotencyKey: "k", items: [{ attendeeId: "p1", followupDate: "2026-10-08", planTypeKey: "vc" }] }), params("ev1"));
  assert.equal(confirmed.status, 200);
  assert.ok(calls.includes("confirm:p1"));
  assert.equal((await routes.confirmAfter(post("/x", { idempotencyKey: "k", items: [] }), params("ev1"))).status, 400, "nothing checked → nothing to confirm");
});

test("会場メモ（自分だけ）: saved per attendee, read back on the venue, cleared with an empty text", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: actor("actor:memo"), resolveMode: () => "mock" });
  const params = { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) };
  const saved = await (await routes.venueMemo(post("/x", { attendeeId: "jp-shimizu", text: "11月にオフィスへ" }), params)).json();
  assert.deepEqual([saved.data.attendeeId, saved.data.memo], ["jp-shimizu", "11月にオフィスへ"]);
  const venue = await (await routes.venue(new Request("http://localhost/x"), params)).json();
  assert.equal(venue.data.attendees.find((item: { attendeeId: string }) => item.attendeeId === "jp-shimizu").memo, "11月にオフィスへ");
  const cleared = await (await routes.venueMemo(post("/x", { attendeeId: "jp-shimizu", text: "" }), params)).json();
  assert.equal(cleared.data.memo, null);
  assert.equal((await routes.venueMemo(post("/x", { attendeeId: "jp-shimizu", text: "x".repeat(201) }), params)).status, 400);
});
