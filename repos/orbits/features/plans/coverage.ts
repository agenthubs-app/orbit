/**
 * W0050（RN-08）：计划人脉需求的规则覆盖度与机会标签用的只读计划投影。纯函数：不读时钟（`now` 由调用方给）、
 * 不碰存储、不调模型。W0052 驾驶舱复用 `planNeedCoverage`。
 *
 * 口径（W50-1，D44 定稿）：每条需求的目标人数 t = `criteria.targetCount`（1–5 的整数，W0048b 写入；缺省或非法按 1），
 * 已有 a = `contactLinks.length`（linked 与 established 都是用户确认过的关联）；还缺 = max(0, t − a)；
 * 总覆盖度 = Σ min(a, t) ÷ Σ t，取整百分比（超额不抵其他需求）；没有需求时为 null。快照内容不参与任何数字。
 *
 * 计划只经 `PlanService.getCurrent()`（只读事务）读取后交给 `toOpportunityPlanView`；本文件不 import 计划服务，
 * 也不触发「进入新阶段」（R-6）。
 */
import type { NetworkNeedCriteria, PlanContactLink, PlanItem, PlanPhase, PlanSnapshot } from "./contract";
import { planWeekActions, planWeekState } from "./week";

export const PLAN_NEED_TARGET_DEFAULT = 1;
export const PLAN_NEED_TARGET_MAX = 5;

export interface PlanNeedCoverageInput {
  id: string;
  criteria: Pick<NetworkNeedCriteria, "targetCount"> | null;
  contactLinks: readonly Pick<PlanContactLink, "contactId">[];
}

export interface PlanNeedCoverageRow {
  needId: string;
  have: number;
  target: number;
  missing: number;
}

export interface PlanNeedCoverage {
  /** Σmin(a, t) ÷ Σt 的取整百分比；没有需求时为 null。 */
  percent: number | null;
  needs: PlanNeedCoverageRow[];
}

/** 目标人数：1–5 的整数才算数，其余（缺省、0、小数、超过 5）一律按 1。 */
export function planNeedTarget(criteria: Pick<NetworkNeedCriteria, "targetCount"> | null | undefined): number {
  const value = criteria?.targetCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= PLAN_NEED_TARGET_MAX ? value : PLAN_NEED_TARGET_DEFAULT;
}

export function planNeedCoverage(needs: readonly PlanNeedCoverageInput[]): PlanNeedCoverage {
  let covered = 0;
  let total = 0;
  const rows = needs.map((need) => {
    const target = planNeedTarget(need.criteria);
    const have = new Set(need.contactLinks.map((link) => link.contactId)).size;
    covered += Math.min(have, target);
    total += target;
    return { have, missing: Math.max(0, target - have), needId: need.id, target };
  });
  return { needs: rows, percent: total > 0 ? Math.round((covered / total) * 100) : null };
}

export interface OpportunityPlanNeed extends PlanNeedCoverageRow {
  title: string;
  phaseKey: string | null;
  phaseTitle: string | null;
  criteria: NetworkNeedCriteria | null;
  linkedContactIds: string[];
}

export interface OpportunityPlanView {
  planId: string;
  goal: string;
  percent: number | null;
  needs: OpportunityPlanNeed[];
  /** 计划点名的活动（`event` 条目）：按阶段，保持计划原顺序。 */
  eventItems: { phaseKey: string | null; eventId: string }[];
  /** 本周（含拖期）未完成的行动，排序同计划页。 */
  weekActions: { id: string; title: string; weeksOverdue: number }[];
  /** 任一人脉需求上已确认关联的联系人（待唤醒「与目标相关」用）。 */
  linkedContactIds: string[];
}

type ProjectableSnapshot = {
  plan: Pick<PlanSnapshot["plan"], "id" | "goalSnapshot" | "startsOn"> & { phases: readonly Pick<PlanPhase, "key" | "title" | "startWeek" | "endWeek">[] };
  items: readonly (Pick<PlanItem, "id" | "kind" | "title" | "phaseKey" | "status" | "criteria" | "contactLinks" | "linkedEventId" | "suggestedWeek" | "sortKey"> & Partial<PlanItem>)[];
};

/** `getCurrent()` 的结果 → 机会标签需要的字段（只读投影，不写、不生成）。 */
export function toOpportunityPlanView(snapshot: ProjectableSnapshot, now: Date): OpportunityPlanView {
  const phaseTitles = new Map(snapshot.plan.phases.map((phase) => [phase.key, phase.title]));
  const needItems = snapshot.items.filter((item) => item.kind === "network_need");
  const coverage = planNeedCoverage(needItems.map((item) => ({ contactLinks: item.contactLinks ?? [], criteria: item.criteria, id: item.id })));
  const rows = new Map(coverage.needs.map((row) => [row.needId, row]));
  const needs = needItems.map((item) => ({
    ...rows.get(item.id)!,
    criteria: item.criteria,
    linkedContactIds: [...new Set((item.contactLinks ?? []).map((link) => link.contactId))],
    phaseKey: item.phaseKey,
    phaseTitle: item.phaseKey ? phaseTitles.get(item.phaseKey) ?? null : null,
    title: item.title,
  }));
  const { currentWeek } = planWeekState(snapshot.plan, now);
  // planWeekActions 只用 kind／suggestedWeek／status／sortKey 等字段；PlanItem 是 PlanViewItem 的超集。
  const weekActions = planWeekActions(snapshot.items as never, currentWeek).map(({ item, weeksOverdue }) => ({
    id: (item as PlanItem).id,
    title: (item as PlanItem).title,
    weeksOverdue,
  }));
  return {
    eventItems: snapshot.items
      .filter((item) => item.kind === "event" && typeof item.linkedEventId === "string" && item.linkedEventId)
      .map((item) => ({ eventId: item.linkedEventId as string, phaseKey: item.phaseKey })),
    goal: snapshot.plan.goalSnapshot,
    linkedContactIds: [...new Set(needs.flatMap((need) => need.linkedContactIds))],
    needs,
    percent: coverage.percent,
    planId: snapshot.plan.id,
    weekActions,
  };
}
