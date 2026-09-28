/**
 * 计划的周次计算（RW-10，Sprint W0009）。纯函数，不读时钟、不碰存储。
 *
 * - 第 1 周从 `plans.starts_on`（东京日历日 YYYY-MM-DD）当天开始，每 7 天一周；
 *   不按自然周（周一）对齐——计划生成当天就是第 1 周的第 1 天。
 * - 「今天」一律按 Asia/Tokyo 取日历日，与 `starts_on` 的写法一致（W0008 `tokyoDate`）。
 * - 计划开始之前按第 1 周算；超过最后一周时 `currentWeek` 继续增长，界面用 `displayWeek`
 *   （夹到总周数）显示「第 n 周 / 共 N 周」，并据 `ended` 说明计划已到期。
 * - 本周行动 = 建议周次 ≤ 本周且未完成的行动；逾期的滚进本周，「已延后 N 周」的 N 由
 *   建议周次与本周的差推导，只用于显示（手动延后另有 `defer_action` / `deferralCount`）。
 *   已完成的行动一律不在本周列表里；刚打勾的那一行暂留到刷新，是界面的本地状态。
 *
 * 不复用跟进队列的到期时钟：那套逻辑以「最新记录 updatedAt」为参照，会把逾期夹成「今天」。
 */
import type { PlanItem, PlanPhase } from "./contract";

export const PLAN_TIME_ZONE = "Asia/Tokyo";

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 某一瞬间在东京的日历日 YYYY-MM-DD。 */
export function planTokyoDate(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: PLAN_TIME_ZONE,
    year: "numeric",
  }).formatToParts(at);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayNumber(isoDate: string): number {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error(`Invalid plan date: ${isoDate}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function isoFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 以 `startsOn` 为第 1 周时，`at` 落在第几周；计划开始之前按第 1 周。 */
export function planWeekAt(startsOn: string, at: Date): number {
  const days = dayNumber(planTokyoDate(at)) - dayNumber(startsOn);
  return days < 0 ? 1 : Math.floor(days / 7) + 1;
}

/** 第 `week` 周的首尾日（含），YYYY-MM-DD。 */
export function planWeekRange(startsOn: string, week: number): { start: string; end: string } {
  const first = dayNumber(startsOn) + (Math.max(1, week) - 1) * 7;
  return { end: isoFromDayNumber(first + 6), start: isoFromDayNumber(first) };
}

/** 计划的总周数 = 各阶段结束周的最大值（没有阶段时为 1）。 */
export function planTotalWeeks(phases: readonly Pick<PlanPhase, "endWeek">[]): number {
  return phases.reduce((max, phase) => Math.max(max, phase.endWeek), 1);
}

/** 某一周所在的阶段下标；落在阶段之间的空档时取之前最近的一段，超出最后一周取最后一段。 */
export function planPhaseIndexForWeek(
  phases: readonly Pick<PlanPhase, "startWeek" | "endWeek">[],
  week: number,
): number {
  if (phases.length === 0) return -1;
  let index = 0;
  phases.forEach((phase, position) => {
    if (phase.startWeek <= week) index = position;
  });
  return index;
}

export interface PlanWeekState {
  /** 真实周次（≥ 1，计划到期后继续增长）。 */
  currentWeek: number;
  /** 显示用：夹到总周数。 */
  displayWeek: number;
  totalWeeks: number;
  ended: boolean;
  /** 当前阶段下标（-1 = 计划没有阶段）。 */
  phaseIndex: number;
  /** 本周（显示周）的首尾日。 */
  range: { start: string; end: string };
  endsOn: string;
}

export function planWeekState(
  plan: { startsOn: string; phases: readonly Pick<PlanPhase, "startWeek" | "endWeek">[] },
  at: Date,
): PlanWeekState {
  const currentWeek = planWeekAt(plan.startsOn, at);
  const totalWeeks = planTotalWeeks(plan.phases);
  const displayWeek = Math.min(currentWeek, totalWeeks);
  return {
    currentWeek,
    displayWeek,
    ended: currentWeek > totalWeeks,
    endsOn: planWeekRange(plan.startsOn, totalWeeks).end,
    phaseIndex: planPhaseIndexForWeek(plan.phases, displayWeek),
    range: planWeekRange(plan.startsOn, displayWeek),
    totalWeeks,
  };
}

export interface PlanWeekAction {
  item: PlanItem;
  /** 逾期的周数（本周的为 0）：界面显示「已延后 N 周」。 */
  weeksOverdue: number;
}

/** 本周行动的顺序：本周的在前（按建议周次、sortKey），逾期的在后，逾期越久越靠后。 */
export function comparePlanWeekActions(a: PlanWeekAction, b: PlanWeekAction): number {
  return (
    a.weeksOverdue - b.weeksOverdue ||
    (a.item.suggestedWeek ?? 0) - (b.item.suggestedWeek ?? 0) ||
    a.item.sortKey - b.item.sortKey
  );
}

/** 一条行动在第 `currentWeek` 周看来逾期了几周（没有建议周次时为 0）。 */
export function planWeeksOverdue(item: Pick<PlanItem, "suggestedWeek">, currentWeek: number): number {
  return item.suggestedWeek === null ? 0 : Math.max(0, currentWeek - item.suggestedWeek);
}

/**
 * 本周行动：建议周次 ≤ 本周、且未完成的行动（已完成的一律不在这里）。
 * 刚在界面上打勾的行动要不要暂留，是界面自己的本地状态，不由这里决定。
 */
export function planWeekActions(items: readonly PlanItem[], currentWeek: number): PlanWeekAction[] {
  return items
    .filter(
      (item) =>
        item.kind === "action" &&
        item.suggestedWeek !== null &&
        item.suggestedWeek <= currentWeek &&
        item.status !== "done",
    )
    .map((item) => ({ item, weeksOverdue: planWeeksOverdue(item, currentWeek) }))
    .sort(comparePlanWeekActions);
}
