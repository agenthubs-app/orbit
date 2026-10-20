import assert from "node:assert/strict";
import { test } from "node:test";
import type { TodoPageContract } from "../src/api/contract/todo-page";
import type { MyEventsResponse } from "../src/api/contract/events-mine";
import type { PlanV2SummaryResponse } from "../src/api/contract/plan-v2";

const now = new Date("2026-10-20T08:00:00.000Z");
const todo: TodoPageContract = {
  date: "2026-10-20", timeZone: "Asia/Tokyo", asOf: now.toISOString(),
  counts: { decisions: 1, nextMoves: 2, followups: 1, overdue: 0 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [{ key: "q1", source: "completion_question", sourceId: "q1", titlePreview: "資料を送りますか", createdAt: now.toISOString(), actions: ["open"] }], next: {} },
  nextMoves: { items: [
    { key: "m1", source: "agent_signal", sourceId: "m1", titlePreview: "高橋さんへお礼", createdAt: now.toISOString(), draftAvailable: false },
    { key: "m2", source: "plan_today_chance", sourceId: "m2", titlePreview: "VC と話す", createdAt: now.toISOString(), draftAvailable: false },
  ], next: {} },
  followups: { items: [], next: {} }, sources: { agent_signal: "ok", completion_question: "ok" },
};

test("R10 sources project bounded widget rows without credentials, Gmail or copied rules", async () => {
  const module = await import("../src/widgets/project-home").catch(() => null);
  const cards = module?.projectHomeWidgetCards({
    actorId: "actor-a", now, todo,
    schedule: { scheduleItems: [{ title: "10:00 伊藤さんと面談", startsAt: "2026-10-20T01:00:00.000Z", state: "upcoming" }] },
    networkSummary: { total: 286, addedThisMonth: 24 },
    networkPage: { items: [
      { id: "c1", displayName: "高橋 花子" }, { id: "c2", displayName: "伊藤 直子" },
      { id: "c3", displayName: "鈴木 太郎" }, { id: "c4", displayName: "社外 秘密" },
    ] },
    secretary: { actorId: "actor-a", hasMore: true, items: [
      { kind: "mail_summary", notification: { actorId: "actor-a", title: "Gmail 本文", target: { status: "available", href: "/inbox" }, sources: [{ sourceKind: "mail_summary" }] } },
      { kind: "event_deadline", notification: { actorId: "actor-a", title: "早割は明後日まで", reason: "参加予定 · まだ申し込んでいません", target: { status: "available", href: "/events/e1" }, sources: [{ sourceKind: "event_deadline" }] } },
      { kind: "event_pick", notification: { actorId: "actor-a", title: "おすすめのイベント", target: { status: "available", href: "/events/e2" }, sources: [{ sourceKind: "event_pick" }] } },
    ] },
    plan: { current: { planId: "p1", goal: "シリーズA 資金調達", goalKind: "fundraising",
      score: { total: 128, talked: 118, skipped: 10, overflow: 0, remainingToFull: 0, todayDelta: -10,
        segments: [{ key: "vc", shortLabel: "VC", emoji: "💼", allocation: 30, earned: 20, overflow: 0, skipped: false }] },
      todayChance: { label: "VC と話す", points: 10, href: "/task?seg=plan" } }, goals: [] } satisfies PlanV2SummaryResponse,
    events: { range: "upcoming", upcomingCount: 2, asOf: now.toISOString(), items: [
      { eventId: "wait", title: "審査待ち", startsAt: "2026-10-21T01:00:00Z", emoji: "🎟️", status: "pending_review", href: "/events/wait" },
      { eventId: "registered", title: "CFO Night", startsAt: "2026-10-22T01:00:00Z", emoji: "🎟️", status: "registered", meetCount: 6, href: "/events/registered" },
    ] } satisfies MyEventsResponse,
  });
  assert.equal(cards?.today.status, "ready");
  assert.deepEqual(cards?.today.status === "ready" ? cards.today.display.rows.map(row => row.title) : [],
    ["高橋さんへお礼", "VC と話す", "資料を送りますか"]);
  assert.equal(cards?.today.status === "ready" ? cards.today.display.count : null, 4);
  assert.deepEqual(cards?.network.status === "ready" ? cards.network.display.people.map(person => person.name) : [],
    ["高橋 花子", "伊藤 直子", "鈴木 太郎"]);
  assert.deepEqual(cards?.secretary.status === "ready" ? cards.secretary.display.items.map(item => item.title) : [],
    ["早割は明後日まで", "おすすめのイベント"]);
  assert.equal(cards?.secretary.status === "ready" ? cards.secretary.display.items[0]?.reason : null,
    "参加予定 · まだ申し込んでいません");
  assert.equal(cards?.secretary.status === "ready" ? cards.secretary.display.hasMore : null, true);
  assert.equal(cards?.plan.status === "ready" ? cards.plan.display.total : null, 128);
  assert.equal(cards?.plan.status === "ready" ? cards.plan.display.todayDelta : null, -10);
  assert.equal(cards?.event.status === "ready" ? cards.event.display.title : null, "CFO Night");
  assert.doesNotMatch(JSON.stringify(cards), /actor-a|Gmail|cookie|token|社外 秘密/u);
});

test("one source failure degrades only its widget and an account mismatch hides secretary", async () => {
  const module = await import("../src/widgets/project-home").catch(() => null);
  const cards = module?.projectHomeWidgetCards({
    actorId: "actor-b", now, todo, schedule: { scheduleItems: [] },
    secretary: { actorId: "actor-a", items: [] },
  });
  assert.equal(cards?.today.status, "ready");
  assert.deepEqual(cards?.network, { status: "unavailable" });
  assert.deepEqual(cards?.secretary, { status: "unavailable" });
  assert.deepEqual(cards?.plan, { status: "unavailable" });
  assert.deepEqual(cards?.event, { status: "unavailable" });
});
