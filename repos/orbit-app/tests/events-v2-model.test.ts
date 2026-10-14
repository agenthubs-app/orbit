import assert from "node:assert/strict";
import test from "node:test";

import { appCardLine, appEventWhen, meetCountOf, orderAssessed, relativeDay, ringColor, verdictKey } from "../src/screens/events/v2/events-model";
import type { EventAssessmentContract } from "../src/api/contract/event-assessment";

// R26 App イベント: date / chip / ring helpers match the boards (app.html #14 / #15).
const base = (id: string, total: number, extra: Partial<EventAssessmentContract> = {}): EventAssessmentContract => ({
  createdAt: "2026-10-07T00:00:00.000Z", facts: { price: "¥15,000", startsAt: "2026-10-16T10:00:00+09:00", title: id }, id, missingFields: [], rubricVersion: "event-score-v2", scoreBreakdown: [], sourceKind: "url", status: "ready", total, verdict: total >= 70 ? "recommend" : total >= 50 ? "conditional" : "skip", ...extra,
});

test("dates in Tokyo: 10月16日（金） / evening 10月7日（水）19:00", () => {
  assert.equal(appEventWhen("2026-10-16T10:00:00+09:00", "ja"), "10月16日（金）");
  assert.equal(appEventWhen("2026-10-07T19:00:00+09:00", "ja"), "10月7日（水）19:00");
  assert.equal(appCardLine(base("a", 82), "ja", "無料"), "10月16日（金） · ¥15,000");
  assert.equal(relativeDay("2026-10-07T19:00:00+09:00", new Date("2026-10-07T03:00:00.000Z")), "tonight");
});

test("ring colour, verdict key, 会いたい人 count, score order with 見送り last", () => {
  assert.equal(ringColor(82), "plum700");
  assert.equal(ringColor(68), "plum500");
  assert.equal(ringColor(41), "rose500");
  assert.equal(verdictKey("conditional"), "verdictConditional");
  assert.equal(meetCountOf(base("a", 82, { meetCandidates: [{ basis: "", count: 3, emoji: "💼", label: "VC", source: "speakers" }, { basis: "", count: 11, emoji: "🏭", label: "DX", source: "exhibitors" }, { basis: "", count: 2, emoji: "👋", label: "known", source: "known" }] })), 14);
  assert.deepEqual(orderAssessed([base("low", 41), base("skip", 90, { userDecision: "dismissed" }), base("high", 82)]).map((item) => item.id), ["high", "low", "skip"]);
});
