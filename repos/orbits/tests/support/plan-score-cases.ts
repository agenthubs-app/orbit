/**
 * R22（DESIGN §4.4）计分规则的表驱动用例。服务端 `tests/domain/plan-score.test.ts` 和 App
 * `tests/plan-score-compute.test.ts` 用同一张表分别跑两端的 `shared/compute` 副本，证明两端口径一致。
 */
import type { PlanAwardBasis, PlanAwardPart } from "../../shared/contract/plan-v2";

export interface AwardCaseRecord {
  part: PlanAwardPart;
  basis: PlanAwardBasis;
  points: number;
}

export interface NextAwardCase {
  name: string;
  allocation: number;
  targetCount: number;
  awards: AwardCaseRecord[];
  skipped: boolean;
  anonymous: boolean;
  expected: { part: PlanAwardPart | "none"; points: number; reason?: string };
}

const base = (points: number): AwardCaseRecord => ({ basis: "talked", part: "base", points });

export const NEXT_AWARD_CASES: NextAwardCase[] = [
  { allocation: 20, anonymous: false, awards: [], expected: { part: "base", points: 4 }, name: "single unit = allocation ÷ target (20 ÷ 5 = 4)", skipped: false, targetCount: 5 },
  { allocation: 15, anonymous: false, awards: [], expected: { part: "base", points: 7 }, name: "the first of two gets the floor (15 ÷ 2 → 7)", skipped: false, targetCount: 2 },
  { allocation: 15, anonymous: false, awards: [base(7)], expected: { part: "base", points: 8 }, name: "the last one takes the remainder (15 ÷ 2 → 7 + 8)", skipped: false, targetCount: 2 },
  { allocation: 15, anonymous: false, awards: [base(7), base(8)], expected: { part: "overflow", points: 3 }, name: "over target: half of the unit, floored (15 ÷ 2 ÷ 2 → 3)", skipped: false, targetCount: 2 },
  { allocation: 20, anonymous: false, awards: [base(4), base(4), base(4), base(4), base(4), { basis: "talked", part: "overflow", points: 2 }], expected: { part: "overflow", points: 2 }, name: "overflow has no cap (20 ÷ 5 ÷ 2 → 2, again)", skipped: false, targetCount: 5 },
  { allocation: 30, anonymous: true, awards: [base(10)], expected: { part: "base", points: 10 }, name: "an anonymous report counts toward the target", skipped: false, targetCount: 3 },
  { allocation: 30, anonymous: true, awards: [base(10), base(10), base(10)], expected: { part: "none", points: 0, reason: "anonymous_over_target" }, name: "an anonymous report stops at the target (no overflow)", skipped: false, targetCount: 3 },
  { allocation: 10, anonymous: false, awards: [], expected: { part: "none", points: 0, reason: "skipped" }, name: "a skipped type takes no more points", skipped: true, targetCount: 1 },
  { allocation: 25, anonymous: false, awards: [base(5), base(5)], expected: { part: "base", points: 5 }, name: "after re-allocation the rest is split over the remaining slots (25 − 10 over 3 → 5)", skipped: false, targetCount: 5 },
  { allocation: 20, anonymous: false, awards: [base(5), base(5)], expected: { part: "base", points: 3 }, name: "lowered allocation: only the points not yet earned are re-split (20 − 10 over 3 → 3)", skipped: false, targetCount: 5 },
  { allocation: 10, anonymous: false, awards: [{ basis: "skip", part: "base", points: 10 }], expected: { part: "base", points: 10 }, name: "a skip record is not a person (it does not use a slot)", skipped: false, targetCount: 1 },
  { allocation: 10, anonymous: false, awards: [], expected: { part: "base", points: 5 }, name: "events: one attendance = one unit (10 ÷ 2)", skipped: false, targetCount: 2 },
];

export interface UnitPointsCase {
  allocation: number;
  targetCount: number;
  expected: number[];
}

export const UNIT_POINTS_CASES: UnitPointsCase[] = [
  { allocation: 15, expected: [7, 8], targetCount: 2 },
  { allocation: 20, expected: [4, 4, 4, 4, 4], targetCount: 5 },
  { allocation: 25, expected: [8, 8, 9], targetCount: 3 },
  { allocation: 10, expected: [10], targetCount: 1 },
];
