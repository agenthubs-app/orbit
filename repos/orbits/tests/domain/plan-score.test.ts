import assert from "node:assert/strict";
import test from "node:test";

import { nextAward, PLAN_EVENT_SEGMENT_KEY, skipAwardPoints, summarizePlanScore, type PlanScoreAward, type PlanScoreSlot } from "../../shared/compute/plan-score";
import { unitPoints } from "../../shared/compute/plan-allocation";
import { NEXT_AWARD_CASES, SUMMARY_CASES, SUMMARY_SLOTS, UNIT_POINTS_CASES } from "../support/plan-score-cases";

// R22 SC-R22-03（DESIGN §4.4）：计分口径，表驱动。同一张表在 App 侧对同步副本再跑一遍。
for (const item of NEXT_AWARD_CASES) {
  test(`nextAward: ${item.name}`, () => {
    const result = nextAward({ allocation: item.allocation, anonymous: item.anonymous, awards: item.awards, skipped: item.skipped, targetCount: item.targetCount });
    assert.equal(result.part, item.expected.part);
    assert.equal(result.points, item.expected.points);
    if (item.expected.reason) assert.equal("reason" in result ? result.reason : undefined, item.expected.reason);
  });
}

test("unitPoints: the last person takes the remainder and the sum is the allocation", () => {
  for (const item of UNIT_POINTS_CASES) {
    assert.deepEqual(unitPoints(item.allocation, item.targetCount), item.expected);
    assert.equal(unitPoints(item.allocation, item.targetCount).reduce((sum, value) => sum + value, 0), item.allocation);
  }
});

test("a skip records the full allocation minus what was already earned", () => {
  assert.equal(skipAwardPoints(10, []), 10);
  assert.equal(skipAwardPoints(30, [{ basis: "talked", part: "base", points: 10 }]), 20);
  assert.equal(skipAwardPoints(30, [{ basis: "talked", part: "base", points: 10 }, { basis: "talked", part: "overflow", points: 5 }]), 20);
});

const slots: PlanScoreSlot[] = [
  { allocation: 30, emoji: "🏦", key: "vc", shortLabel: "VC", skipped: false, targetCount: 3 },
  { allocation: 10, emoji: "⚖️", key: "lawyer", shortLabel: "弁護士", skipped: true, targetCount: 1 },
  { allocation: 50, emoji: "🧗", key: "founder", shortLabel: "起業家", skipped: false, targetCount: 5 },
  { allocation: 10, emoji: "🎟️", key: PLAN_EVENT_SEGMENT_KEY, shortLabel: "イベント", skipped: false, targetCount: 2 },
];
const award = (id: string, typeKey: string, part: "base" | "overflow", points: number, at: string, basis: PlanScoreAward["basis"] = "talked"): PlanScoreAward =>
  ({ anonymous: false, at, basis, id, part, points, typeKey });

test("summarizePlanScore: talked + skipped, overflow beyond 100, today's delta on the Tokyo day", () => {
  const score = summarizePlanScore({
    achievedAt: null,
    awards: [
      award("a1", "vc", "base", 10, "2026-10-06T10:00:00+09:00"),
      award("a2", "vc", "base", 10, "2026-10-07T00:30:00+09:00"),
      award("a3", "lawyer", "base", 10, "2026-10-01T09:00:00+09:00", "skip"),
      award("a4", "vc", "base", 10, "2026-10-06T23:59:00+09:00"),
      award("a5", "vc", "overflow", 5, "2026-10-07T11:00:00+09:00"),
      award("a6", PLAN_EVENT_SEGMENT_KEY, "base", 5, "2026-10-06T14:59:00Z"),
    ],
    now: "2026-10-07T12:00:00+09:00",
    slots,
  });
  assert.equal(score.total, 50);
  assert.equal(score.talked, 40);
  assert.equal(score.skipped, 10);
  assert.equal(score.overflow, 5);
  assert.equal(score.remainingToFull, 55);
  // 00:30 JST (10/07) and 11:00 JST count; 14:59Z on 10/06 is 23:59 JST on 10/06 and does not.
  assert.equal(score.todayDelta, 15);
  assert.deepEqual(score.segments.map((segment) => [segment.key, segment.earned, segment.overflow, segment.skipped]), [
    ["vc", 30, 5, false], ["lawyer", 10, 0, true], ["founder", 0, 0, false], [PLAN_EVENT_SEGMENT_KEY, 5, 0, false],
  ]);
});

test("summarizePlanScore: no cap above 100", () => {
  const awards = [
    ...Array.from({ length: 3 }, (_, index) => award(`v${index}`, "vc", "base", 10, "2026-10-01T10:00:00+09:00")),
    award("l", "lawyer", "base", 10, "2026-10-01T10:00:00+09:00", "skip"),
    ...Array.from({ length: 5 }, (_, index) => award(`f${index}`, "founder", "base", 10, "2026-10-01T10:00:00+09:00")),
    ...Array.from({ length: 2 }, (_, index) => award(`e${index}`, PLAN_EVENT_SEGMENT_KEY, "base", 5, "2026-10-01T10:00:00+09:00")),
    ...Array.from({ length: 4 }, (_, index) => award(`o${index}`, "founder", "overflow", 5, "2026-10-02T10:00:00+09:00")),
  ];
  const score = summarizePlanScore({ achievedAt: null, awards, now: "2026-10-07T12:00:00+09:00", slots });
  assert.equal(score.total, 120);
  assert.equal(score.remainingToFull, 0);
});

test("summarizePlanScore: after the goal is achieved the score is frozen", () => {
  const awards = [award("a1", "vc", "base", 10, "2026-10-01T10:00:00+09:00"), award("a2", "vc", "base", 10, "2026-10-07T10:00:00+09:00")];
  const score = summarizePlanScore({ achievedAt: "2026-10-05T00:00:00+09:00", awards, now: "2026-10-07T12:00:00+09:00", slots });
  assert.equal(score.total, 10);
  assert.equal(score.todayDelta, 0);
});

for (const item of SUMMARY_CASES) {
  test(`summarizePlanScore: ${item.name}`, () => {
    const score = summarizePlanScore({
      achievedAt: item.achievedAt,
      awards: item.awards.map((award, index) => ({ ...award, anonymous: false, id: `a${index}` })),
      now: item.now,
      reversals: item.reversals,
      slots: SUMMARY_SLOTS,
    });
    assert.deepEqual({ remainingToFull: score.remainingToFull, todayDelta: score.todayDelta, total: score.total }, item.expected);
  });
}
