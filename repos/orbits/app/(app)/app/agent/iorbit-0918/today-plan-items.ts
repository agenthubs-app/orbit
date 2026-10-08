/**
 * W0036（RH-02）：首页「今日要事」吸收本周计划行动与补人脉提示的纯函数。不 import React，
 * 不读时钟（`now` 由调用方给）、不碰存储（只给出 key）。
 *
 * - 名额（W36-1）：「最多 3 条」只约束新加的计划行动与补人脉；原有来源 n 条时计划行动最多
 *   `min(2, 3 − n)` 条，补人脉只在还有空位时出现。原有来源的顺序与「还有 N 件」不变。
 * - 挑选：本周行动（`planWeekActions`）按「拖期在前（`planWeeksOverdue > 0`），组内按建议周次、
 *   sortKey」排序后取名额内的前几条，**再**去掉「今天先不做」的（W36-3：不补位、不轮换）。
 *   「已顺延 N 周」取 `planWeeksOverdue`，与本周推进、计划页同一来源；不用 `deferralCount`。
 * - 跳转：联系人 → 活动 → 计划页对应行（`#plan-action-<id>`，计划页本周列表的行带这个 id）。
 */
import { PLAN_MATCH_ACTION_SOURCE, type PlanViewItem, type PlanViewSnapshot } from "../../../../../features/plans/contract";
import { planWeekActions, planWeekState, type PlanWeekAction } from "../../../../../features/plans/week";

/** 今日要事默认露出的条数（1 条主稿 + 2 条短讯）。 */
export const TODAY_VISIBLE_SLOTS = 3;
/** 计划行动最多占几条。 */
export const TODAY_PLAN_ACTION_LIMIT = 2;
/** 已确认联系人少于这个数才提示补人脉。 */
export const NETWORK_NUDGE_THRESHOLD = 10;
/** 「7 天内不再提示」：按东京日计，关掉当天算第 1 天，第 8 天再出现。 */
export const NETWORK_NUDGE_QUIET_DAYS = 7;
export const TODAY_SKIP_KEY_PREFIX = "orbit.today.skip.v1:";
export const NETWORK_NUDGE_KEY_PREFIX = "orbit.today.networkNudge.v1:";
/** 补人脉按钮的去处：名片上传区的正式入口（全站只挂一份名片状态机，首页不嵌上传组件）。 */
export const NETWORK_NUDGE_HREF = "/app/contacts/new?method=scan";

export function todayPlanSlots(baseCount: number): number {
  return Math.min(TODAY_PLAN_ACTION_LIMIT, Math.max(0, TODAY_VISIBLE_SLOTS - baseCount));
}

/** 拖期优先：拖期的在前、越久越前；组内按建议周次、sortKey。 */
function compareTodayPlanActions(a: PlanWeekAction, b: PlanWeekAction): number {
  const aOverdue = a.weeksOverdue > 0 ? 0 : 1;
  const bOverdue = b.weeksOverdue > 0 ? 0 : 1;
  return (
    aOverdue - bOverdue ||
    (a.item.suggestedWeek ?? 0) - (b.item.suggestedWeek ?? 0) ||
    a.item.sortKey - b.item.sortKey
  );
}

export interface TodayPlanPhase {
  phaseNo: number;
  phaseTitle: string;
}

/** 条目所在阶段；`phaseKey` 为空或找不到时退回当前阶段；计划没有阶段时为 null。 */
export function todayPlanPhase(
  snapshot: PlanViewSnapshot,
  item: Pick<PlanViewItem, "phaseKey">,
  now: Date,
): TodayPlanPhase | null {
  const { phases } = snapshot.plan;
  if (phases.length === 0) return null;
  const own = item.phaseKey ? phases.findIndex((phase) => phase.key === item.phaseKey) : -1;
  const index = own >= 0 ? own : planWeekState(snapshot.plan, now).phaseIndex;
  const phase = phases[index];
  return phase ? { phaseNo: index + 1, phaseTitle: phase.title } : null;
}

/** 计划当前阶段（补人脉文案用，W36-4）。 */
export function currentPlanPhase(snapshot: PlanViewSnapshot, now: Date): TodayPlanPhase | null {
  return todayPlanPhase(snapshot, { phaseKey: null }, now);
}

export function todayPlanActionHref(
  item: Pick<PlanViewItem, "id" | "linkedContactIds" | "linkedEventId" | "meta">,
): string {
  const matchContact =
    item.meta?.source === PLAN_MATCH_ACTION_SOURCE && typeof item.meta.contactId === "string"
      ? item.meta.contactId
      : null;
  const contactId = item.linkedContactIds[0] ?? matchContact;
  if (contactId) return `/app/contacts/${encodeURIComponent(contactId)}`;
  if (item.linkedEventId) return `/app/events/${encodeURIComponent(item.linkedEventId)}`;
  return `/app/agent/plan#plan-action-${encodeURIComponent(item.id)}`;
}

export interface TodayPlanAction {
  id: string;
  title: string;
  detail: string | null;
  weeksOverdue: number;
  phase: TodayPlanPhase | null;
  href: string;
  /**
   * W0061（G-17）：恰好指向的那一位联系人——关联联系人只有一人，或没有关联但 `meta.contactId` 是一人；
   * 关联 0 人（且无 meta）或多人时为 null（不猜，不显示「TA 能帮你」）。
   */
  contactId: string | null;
  /** W0061：退化时「可能对应：计划需求『…』」——`meta.needItemId` 指的需求，否则关联着这位联系人的第一条需求。 */
  needTitle: string | null;
}

/** W0061：计划行动恰好指向的一位联系人（见 `TodayPlanAction.contactId`）。 */
export function todayPlanActionContactId(item: Pick<PlanViewItem, "linkedContactIds" | "meta">): string | null {
  if (item.linkedContactIds.length === 1) return item.linkedContactIds[0] ?? null;
  if (item.linkedContactIds.length > 1) return null;
  const metaContactId = (item.meta as { contactId?: unknown } | null | undefined)?.contactId;
  return typeof metaContactId === "string" && metaContactId ? metaContactId : null;
}

function todayPlanNeedTitle(snapshot: PlanViewSnapshot, item: Pick<PlanViewItem, "meta">, contactId: string | null): string | null {
  if (!contactId) return null;
  const needs = snapshot.items.filter((entry) => entry.kind === "network_need");
  const pointed = (item.meta as { needItemId?: unknown } | null | undefined)?.needItemId;
  const need =
    (typeof pointed === "string" ? needs.find((entry) => entry.id === pointed) : undefined) ??
    needs.find((entry) => entry.linkedContactIds.includes(contactId));
  return need?.title ?? null;
}

export function selectTodayPlanActions(
  snapshot: PlanViewSnapshot,
  now: Date,
  options: { baseCount: number; skippedIds: readonly string[] },
): TodayPlanAction[] {
  const slots = todayPlanSlots(options.baseCount);
  if (slots === 0) return [];
  const { currentWeek } = planWeekState(snapshot.plan, now);
  const skipped = new Set(options.skippedIds);
  return [...planWeekActions(snapshot.items, currentWeek)]
    .sort(compareTodayPlanActions)
    .slice(0, slots)
    .filter((entry) => !skipped.has(entry.item.id))
    .map((entry) => {
      const contactId = todayPlanActionContactId(entry.item);
      return {
        contactId,
        detail: entry.item.detail,
        href: todayPlanActionHref(entry.item),
        id: entry.item.id,
        needTitle: todayPlanNeedTitle(snapshot, entry.item, contactId),
        phase: todayPlanPhase(snapshot, entry.item, now),
        title: entry.item.title,
        weeksOverdue: entry.weeksOverdue,
      };
    });
}

export function todaySkipStorageKey(account: string, day: string): string {
  return `${TODAY_SKIP_KEY_PREFIX}${account}:${day}`;
}

export function networkNudgeStorageKey(account: string): string {
  return `${NETWORK_NUDGE_KEY_PREFIX}${account}`;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(day: string): number | null {
  const match = ISO_DAY.exec(day);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000 : null;
}

/** 关掉补人脉的那个东京日 → 今天是否仍在免打扰期内。 */
export function networkNudgeQuiet(dismissedDay: string | null, today: string): boolean {
  if (!dismissedDay) return false;
  const from = dayNumber(dismissedDay);
  const to = dayNumber(today);
  if (from === null || to === null) return false;
  const elapsed = to - from;
  return elapsed >= 0 && elapsed < NETWORK_NUDGE_QUIET_DAYS;
}

/**
 * 活动池的计划点名（与 `planEventReasons` 同一取法）：推荐中的活动条目，以及未完成且挂了活动的
 * 行动；按计划原顺序，去重。
 */
export function planPoolEventIds(snapshot: PlanViewSnapshot): string[] {
  const ids: string[] = [];
  for (const item of snapshot.items) {
    const named =
      (item.kind === "event" && item.status === "recommended") ||
      (item.kind === "action" && item.status !== "done");
    if (named && item.linkedEventId && !ids.includes(item.linkedEventId)) ids.push(item.linkedEventId);
  }
  return ids;
}
