import assert from "node:assert/strict";
import test from "node:test";

import { eventVerdict, scoreEvent, type EventScoreFacts, type EventScoreType } from "../../shared/compute/event-score";

// R24 SC-R24-06（b10 规范板「イベントスコアの基準」）：设计稿两例作为固定用例 + 递减 + 推定 + 阈值。
const plan = (metB = 0): EventScoreType[] => [
  { allocation: 20, key: "brand_pr", metCount: metB, skipped: false, targetCount: 2 },
  { allocation: 10, key: "missing_expert", metCount: 1, skipped: false, targetCount: 2 },
  { allocation: 15, key: "heavy_user", metCount: 3, skipped: false, targetCount: 3 },
  { allocation: 25, key: "first_payer", metCount: 0, skipped: true, targetCount: 5 },
];
const facts = (patch: Partial<EventScoreFacts>): EventScoreFacts => ({
  attendeeSource: "registrants", exchangeCorner: false, expected: {}, fee: 0, firstDegree: 0, matching: false, nameTags: false, networkingMinutes: 0, secondDegree: 0, timeslot: "evening", travelMinutes: 0, ...patch,
});
const studyGroup = facts({ attendeeSource: "registrants", expected: { brand_pr: 8 }, fee: 2000, firstDegree: 1, nameTags: true, networkingMinutes: 45, timeslot: "evening", travelMinutes: 30 });
const summit = facts({ attendeeSource: "speakers", expected: { brand_pr: 6 }, fee: 12000, firstDegree: 1, networkingMinutes: 30, secondDegree: 2, timeslot: "daytime", travelMinutes: 45 });
const byCriterion = (result: ReturnType<typeof scoreEvent>) => Object.fromEntries(result.items.map((item) => [item.criterion, item.score]));

test("design example 1: ブランドづくり勉強会 Tokyo #14 = 82 (36 / 12 / 17 / 7 / 10), recommended", () => {
  const result = scoreEvent({ facts: studyGroup, types: plan() });
  assert.deepEqual(byCriterion(result), { confidence: 12, connections: 7, fit: 36, format: 10, timeCost: 17 });
  assert.equal(result.total, 82);
  assert.equal(result.verdict, "recommend");
});

test("design example 2: D2C ブランド Summit 2026 = 61, conditional (fee over the setting)", () => {
  const result = scoreEvent({ facts: summit, types: plan() });
  assert.equal(result.total, 61);
  assert.equal(result.verdict, "conditional");
  assert.ok(byCriterion(result).timeCost! < 10);
});

test("meeting one more of the type lowers the same event: 82 → 76", () => {
  assert.equal(scoreEvent({ facts: studyGroup, types: plan(1) }).total, 76);
  assert.equal(scoreEvent({ facts: studyGroup, types: plan(2) }).items.find((item) => item.criterion === "fit")!.score, 0);
});

test("missing facts are marked 推定 and lower the confidence", () => {
  const result = scoreEvent({ facts: facts({ expected: { brand_pr: 8 }, fee: null, firstDegree: null, matching: null, nameTags: null, networkingMinutes: null, secondDegree: null, exchangeCorner: null, timeslot: null, travelMinutes: null }), types: plan() });
  assert.deepEqual(result.items.filter((item) => item.estimated).map((item) => item.criterion), ["timeCost", "connections", "format"]);
  assert.equal(byCriterion(result).confidence, 12 - 6);
  assert.ok(result.total < 82);
});

test("skipped and finished types do not count; thresholds 70 / 50", () => {
  assert.equal(scoreEvent({ facts: facts({ expected: { first_payer: 20, heavy_user: 9 } }), types: plan() }).items[0]!.score, 0);
  assert.equal(eventVerdict(70), "recommend");
  assert.equal(eventVerdict(69), "conditional");
  assert.equal(eventVerdict(50), "conditional");
  assert.equal(eventVerdict(49), "skip");
});
