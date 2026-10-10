/**
 * R22 计划 v2.2 的计分（DESIGN §4，两端共用）。
 *
 * 分数 = 计分记录之和：每次加分时用 `nextAward` 算好分值写进 `plan_log`（`score_awarded`），
 * 撤销写一条对冲（`score_reversed`），概要读时用 `summarizePlanScore` 求和。
 * 这样「見直し / 手動編集只重分まだの点，已得分不变」天然成立。
 *
 * 口径（设计定稿）：满分 100 = 各人物类型配点 + イベント枠配点；不封顶（直到達成）；
 * 同一人同一类型一次（由调用方的幂等键保证）；单价 = 配点 ÷ 人数取整，余数给最后 1 人；
 * 超过目标人数每人加「配点 ÷ 人数 ÷ 2 向下取整」；无名字的自报只算到目标人数；
 * 跳过记满额（扣掉已得部分），跳过期间不再加分；没有成果加分。
 *
 * 纯函数：不读时钟，「现在」由调用方传入（东京自然日由 `tokyoCalendarDaysUntil` 判定）。
 */
import type { PlanAwardBasis, PlanAwardPart, PlanScoreSegment, PlanScoreView } from "../contract/plan-v2";
import { parseStrictTokyoInstant, tokyoCalendarDaysUntil } from "./tokyo-calendar-days";

/** イベント枠在构成条与计分记录里的键。 */
export const PLAN_EVENT_SEGMENT_KEY = "event";
/** 满分（构成条的刻度）。 */
export const PLAN_FULL_SCORE = 100;

/** 一条未被对冲的计分记录（`plan_log` 的 `score_awarded`）。 */
export interface PlanScoreAward {
  id: string;
  /** 人物类型的 key，或 `PLAN_EVENT_SEGMENT_KEY`。 */
  typeKey: string;
  part: PlanAwardPart;
  basis: PlanAwardBasis;
  points: number;
  anonymous: boolean;
  /** ISO 时间。 */
  at: string;
}

export interface PlanScoreSlot {
  key: string;
  shortLabel: string;
  emoji: string;
  /** 5 的倍数。 */
  allocation: number;
  /** 目标人数（イベント = 次数）。 */
  targetCount: number;
  skipped: boolean;
}

export type PlanNextAward =
  | { part: PlanAwardPart; points: number }
  | { part: "none"; points: 0; reason: "skipped" | "anonymous_over_target" };

/** 一个类型（或イベント枠）里已计入的 base 记录：人数与分数。 */
export function earnedBase(awards: readonly Pick<PlanScoreAward, "part" | "basis" | "points">[]): { count: number; points: number } {
  let count = 0;
  let points = 0;
  for (const award of awards) {
    if (award.part !== "base" || award.basis === "skip") continue;
    count += 1;
    points += award.points;
  }
  return { count, points };
}

/** 超额时每人的分值：配点 ÷ 人数 ÷ 2 向下取整。 */
export function overflowPoints(allocation: number, targetCount: number): number {
  if (targetCount <= 0) return 0;
  return Math.floor(allocation / targetCount / 2);
}

/**
 * 下一次加分的分值（两端共用：App / Web 用它做「+10」预告，服务端用它落账）。
 * `awards` = 这个类型里未被对冲的记录。
 */
export function nextAward(input: {
  allocation: number;
  targetCount: number;
  awards: readonly Pick<PlanScoreAward, "part" | "basis" | "points">[];
  skipped: boolean;
  anonymous: boolean;
}): PlanNextAward {
  if (input.skipped) return { part: "none", points: 0, reason: "skipped" };
  const base = earnedBase(input.awards);
  if (base.count < input.targetCount) {
    const remainingSlots = input.targetCount - base.count;
    const remainingAllocation = Math.max(0, input.allocation - base.points);
    const points = remainingSlots === 1 ? remainingAllocation : Math.floor(remainingAllocation / remainingSlots);
    return { part: "base", points };
  }
  if (input.anonymous) return { part: "none", points: 0, reason: "anonymous_over_target" };
  return { part: "overflow", points: overflowPoints(input.allocation, input.targetCount) };
}

/** 跳过时记的分：配点减去已得的 base 分（不小于 0）。 */
export function skipAwardPoints(allocation: number, awards: readonly Pick<PlanScoreAward, "part" | "basis" | "points">[]): number {
  return Math.max(0, allocation - earnedBase(awards).points);
}

/**
 * 概要、首页组件、小组件用的汇总。`awards` 只放未被对冲的记录；
 * `achievedAt` 之后的记录不计（达成后分数定格）。
 */
export function summarizePlanScore(input: {
  slots: readonly PlanScoreSlot[];
  awards: readonly PlanScoreAward[];
  achievedAt: string | null;
  now: string;
}): PlanScoreView {
  const counted = input.awards.filter((award) => !input.achievedAt || isAtOrBefore(award.at, input.achievedAt));
  let talked = 0;
  let skipped = 0;
  let overflow = 0;
  let baseTotal = 0;
  let todayDelta = 0;
  const segments: PlanScoreSegment[] = input.slots.map((slot) => {
    const mine = counted.filter((award) => award.typeKey === slot.key);
    let earned = 0;
    let slotOverflow = 0;
    for (const award of mine) {
      if (award.part === "overflow") slotOverflow += award.points;
      else earned += award.points;
      if (award.basis === "skip") skipped += award.points;
      else talked += award.points;
      if (tokyoCalendarDaysUntil(award.at, input.now) === 0) todayDelta += award.points;
    }
    overflow += slotOverflow;
    baseTotal += earned;
    return {
      allocation: slot.allocation,
      earned,
      emoji: slot.emoji,
      key: slot.key,
      overflow: slotOverflow,
      shortLabel: slot.shortLabel,
      skipped: slot.skipped,
    };
  });
  return {
    overflow,
    remainingToFull: Math.max(0, PLAN_FULL_SCORE - baseTotal),
    segments,
    skipped,
    talked,
    todayDelta: input.achievedAt ? 0 : todayDelta,
    total: talked + skipped,
  };
}

function isAtOrBefore(at: string, limit: string): boolean {
  const time = parseStrictTokyoInstant(at);
  const bound = parseStrictTokyoInstant(limit);
  return time !== null && bound !== null && time <= bound;
}
