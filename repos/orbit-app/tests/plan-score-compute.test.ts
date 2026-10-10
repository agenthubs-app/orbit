import assert from "node:assert/strict";
import test from "node:test";

import { unitPoints } from "../src/api/compute/plan-allocation";
import { nextAward, summarizePlanScore } from "../src/api/compute/plan-score";
// The case table lives with the server's tests; a test may read ../orbits (it never ships in the App bundle).
import { NEXT_AWARD_CASES, SUMMARY_CASES, SUMMARY_SLOTS, UNIT_POINTS_CASES } from "../../orbits/tests/support/plan-score-cases";

// 改版 R22 (SC-R22-03): the App runs the same scoring cases against its synced copy of
// shared/compute, so the 「+10」 preview on the phone and the points the server records agree.
for (const item of NEXT_AWARD_CASES) {
  test(`App copy — nextAward: ${item.name}`, () => {
    const result = nextAward({ allocation: item.allocation, anonymous: item.anonymous, awards: item.awards, skipped: item.skipped, targetCount: item.targetCount });
    assert.equal(result.part, item.expected.part);
    assert.equal(result.points, item.expected.points);
  });
}

test("App copy — unitPoints", () => {
  for (const item of UNIT_POINTS_CASES) assert.deepEqual(unitPoints(item.allocation, item.targetCount), item.expected);
});

for (const item of SUMMARY_CASES) {
  test(`App copy — summarizePlanScore: ${item.name}`, () => {
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
