import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../shared/compute/event-score";
import { toEventScoreFacts } from "../../shared/compute/event-score-input";
import { livePlanEventFacts, PLAN_LIVE_EVENT_FACTS_READY, PLAN_LIVE_EVENT_LIMIT, type LivePlanEventSources } from "../../features/plans/v2/event-facts";
import { eventChance, eventsFor, resolveTypedEvents, type OverviewInput, type PlanEventFact } from "../../features/plans/v2/overview";
import { judgeEvent } from "../../features/events/assessment/judge";
import type { PlanV2TypeItem } from "../../features/plans/v2/types";

// R26 plan-event-facts-live.test（PLANNER「测试」）：新签名带 actor；我的活动优先不被截断；有界读取；外部私有活动只来自本人的来源；
// 概要 / 类型详情 / 今日のチャンス与评估页同一分数；常量为 false 时回到空（两态）。

const NOW = new Date("2026-10-07T03:00:00.000Z");
const fact = (eventId: string, startsAt = "2026-10-20T10:00:00.000Z"): PlanEventFact => ({ eventId, facts: { attendeeSource: "none", exchangeCorner: null, expected: {}, fee: null, firstDegree: null, matching: null, nameTags: null, networkingMinutes: null, secondDegree: null, timeslot: "daytime", travelMinutes: null }, startsAt, title: eventId, venue: null });

test("常量已打开；ready: false 时不读任何东西", async () => {
  assert.equal(PLAN_LIVE_EVENT_FACTS_READY, true);
  let opened = 0;
  const off = await livePlanEventFacts({ ready: false, sources: async () => { opened += 1; return null; }, window: () => { opened += 1; return null; } })();
  assert.deepEqual(off, []);
  assert.equal(opened, 0);
});

test("合并顺序：我的外部评估 → 我的活动 → 公开补足；总数 ≤20；窗口 ≤60 天；我的活动不被公开活动挤掉", async () => {
  const windows: Array<{ from: string; until: string }> = [];
  const published = Array.from({ length: 40 }, (_, i) => ({ eventId: `pub-${i}`, startsAt: `2026-10-${String(8 + (i % 20)).padStart(2, "0")}T10:00:00.000Z`, title: `P${i}` }));
  published.push({ eventId: "mine-late", startsAt: "2026-11-30T10:00:00.000Z", title: "Mine late" });
  const sources: LivePlanEventSources = {
    myEventIds: async () => ["mine-late"],
    myExternal: async (window) => { windows.push(window); return [fact("assessment:evas_1"), fact("assessment:evas_2")]; },
    orbitFacts: async (events) => events.map((event) => fact(event.eventId, event.startsAt)),
  };
  const result = await livePlanEventFacts({
    now: () => NOW,
    ready: true,
    sources: async () => sources,
    window: () => ({ listPublishedStartingBetween: async (from: string, to: string) => { windows.push({ from, until: to }); return published; } }),
  })();
  assert.equal(result.length, PLAN_LIVE_EVENT_LIMIT);
  assert.deepEqual(result.slice(0, 3).map((item) => item.eventId), ["assessment:evas_1", "assessment:evas_2", "mine-late"]);
  for (const window of windows) assert.ok(Date.parse(window.until) - Date.parse(window.from) <= 60 * 86_400_000 + 1000, "bounded window");
});

const types: PlanV2TypeItem[] = [
  { allocation: 30, contactLinks: [], createdAt: "", id: "item-vc", personType: { key: "vc_partner" } as never, planId: "plan-1", primaryIndustryId: null, roleSituation: "VC のパートナー", secondaryIndustryId: null, shortLabel: "VC", skippedAt: null, slot: "vc_partner", sortKey: 1, targetCount: 3, updatedAt: "" },
  { allocation: 15, contactLinks: [], createdAt: "", id: "item-cvc", personType: { key: "cvc" } as never, planId: "plan-1", primaryIndustryId: null, roleSituation: "CVC", secondaryIndustryId: null, shortLabel: "CVC", skippedAt: null, slot: "cvc", sortKey: 2, targetCount: 3, updatedAt: "" },
];

test("三处同分：评估页（judge）与概要 / 类型详情（eventsFor + resolveTypedEvents）对同一外部活动给同一分数；今日のチャンス推这场", () => {
  const facts = { exhibitorCount: 4, price: "¥3,000", speakers: [{ name: "A", org: "青葉ベンチャーズ", role: "パートナー" }, { name: "B", org: "Z Capital", role: "Partner" }], startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" };
  const planFact: PlanEventFact = {
    assessmentId: "evas_1",
    eventId: "assessment:evas_1",
    facts: toEventScoreFacts(facts, { attendeeSource: "none", expected: {}, firstDegree: 0, secondDegree: null, travelMinutes: null }),
    startsAt: facts.startsAt,
    title: facts.title,
    typing: { exhibitorCount: 4, speakers: facts.speakers, text: facts.title },
    venue: facts.venue,
  };
  const input = {
    awards: [], candidates: [], contacts: new Map(), events: resolveTypedEvents([planFact], types), language: "ja", log: [],
    plan: { id: "plan-1" } as never, platform: "web", types,
  } as unknown as OverviewInput;
  const overview = eventsFor(input, null)[0]!;
  const typeView = eventsFor(input, types[0]!)[0]!;
  const judged = judgeEvent({
    context: { contacts: [], goalKeywords: [], goalLabel: "シリーズA", homeArea: null, language: "ja", planId: "plan-1", preferences: DEFAULT_EVENT_SCORE_PREFERENCES, types: types.map((type) => ({ allocation: type.allocation, emoji: "💼", key: type.personType.key, metCount: 0, shortLabel: type.shortLabel, skipped: false, targetCount: type.targetCount })) },
    facts,
  });
  assert.equal(overview.score.total, judged.total);
  assert.equal(typeView.score.total, judged.total);
  assert.equal(overview.assessmentHref, "/app/events/assessments/evas_1");
  assert.equal(overview.emoji, "🥂");
  assert.match(overview.fitLabel ?? "", /VC 約2名/);
  const chance = eventChance(input, NOW.toISOString());
  assert.equal(chance?.kind, "event");
  assert.equal(chance?.eventId, "assessment:evas_1");
  assert.match(chance?.label ?? "", /^今夜の CFO Night Tokyo vol\.18 に VC が 2人来ます。1人と話せば \+10。$/);
  assert.equal(chance?.actionLabel, "会う準備をする");
  assert.equal(chance?.progressLabel, "VC · 0 / 3人");
});
