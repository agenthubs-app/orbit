/**
 * 重新分析与到期回顾（RW-12 / Q28 修正、Q35A，Sprint W0012）。
 *
 * 四种触发只产生「要不要重新分析」的提示，不自动重做（`reanalysisTriggers`，纯函数）：
 * - `goal_changed`：资料里的目标原文和生成这份计划时的目标快照不一样了；
 * - `phase_done_early`：某个已经开始、但还没到最后一周的阶段，行动已经全部完成；
 * - `deferred_actions`：延后 ≥ 2 周（逾期周数或手动延后次数取大）的未完成行动累计 3 条；
 * - `period_ended`：计划已过最后一周。
 *
 * 额度：重新分析每个东京自然月 1 次（`REANALYSIS_MONTHLY_LIMIT`）。计数不另建表：一次重新分析生成的
 * 新版本，其 `plan_created` 记录的幂等键是 `reanalysis:<YYYY-MM>`，`plan_log (workspace, actor,
 * idempotency_key)` 的唯一约束让一个月最多一条（服务层按人串行的事务先查，唯一约束兜底）。
 * 周期到期后「制定下一份计划」走 `next_plan`，不写这个键、不占额度（服务层会核实计划确实已到期）。
 *
 * 生成：按 D3 仍用 W0008 的 mock 生成器（`createPlanFollowUpService`），与第一份计划同一套输入裁剪、
 * 生成、保存前校验；保存走 `createVersionWithOutcome(..., { origin })`，一个事务里归档旧版、写新版并
 * 带入已完成的内容，任一步失败都不留下半份新版本。
 */
import type { PlanHorizon, PlanItem, PlanReferenceValidator, PlanService, PlanSnapshot, PlanVersionOrigin } from "./contract";
import { generatePlanDraft, type PlanGenerator, type PlanGeneratorInput, type PlanLocale } from "./generator";
import { selectPlanContacts } from "./input-selector";
import type { PlanInputSource } from "./input-source";
import { validateGeneratedPlan } from "./validate";
import { planTokyoDate, planWeekState, planWeeksOverdue } from "./week";

export const REANALYSIS_MONTHLY_LIMIT = 1;
/** 延后 ≥ 2 周的行动累计到这个数就提示。 */
export const REANALYSIS_DEFERRED_THRESHOLD = 3;
export const REANALYSIS_DEFERRED_WEEKS = 2;

export const REANALYSIS_TRIGGERS = ["goal_changed", "phase_done_early", "deferred_actions", "period_ended"] as const;
export type ReanalysisTrigger = (typeof REANALYSIS_TRIGGERS)[number];

/** 东京自然月 YYYY-MM。 */
export function tokyoMonthKey(at: Date): string {
  return planTokyoDate(at).slice(0, 7);
}

/** 这个月的重新分析额度记在 `plan_log` 的这个幂等键上。 */
export function reanalysisQuotaKey(month: string): string {
  return `reanalysis:${month}`;
}

function normalizeGoal(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** 延后 ≥ 2 周的未完成行动（逾期周数与手动延后次数取大）。 */
export function deferredActionCount(items: readonly PlanItem[], currentWeek: number): number {
  return items.filter(
    (item) =>
      item.kind === "action" &&
      item.status !== "done" &&
      Math.max(item.deferralCount, planWeeksOverdue(item, currentWeek)) >= REANALYSIS_DEFERRED_WEEKS,
  ).length;
}

export function reanalysisTriggers(input: {
  snapshot: Pick<PlanSnapshot, "plan" | "items">;
  /** 资料里现在的目标原文；读不到时传 null（不据此提示）。 */
  currentGoal: string | null;
  now: Date;
}): ReanalysisTrigger[] {
  const { plan, items } = input.snapshot;
  const week = planWeekState(plan, input.now);
  const triggers: ReanalysisTrigger[] = [];
  if (input.currentGoal !== null && normalizeGoal(input.currentGoal) && normalizeGoal(input.currentGoal) !== normalizeGoal(plan.goalSnapshot)) {
    triggers.push("goal_changed");
  }
  const doneEarly = plan.phases.some((phase) => {
    if (phase.startWeek > week.currentWeek || phase.endWeek <= week.currentWeek) return false;
    const actions = items.filter((item) => item.kind === "action" && item.phaseKey === phase.key);
    return actions.length > 0 && actions.every((item) => item.status === "done");
  });
  if (doneEarly) triggers.push("phase_done_early");
  if (deferredActionCount(items, week.currentWeek) >= REANALYSIS_DEFERRED_THRESHOLD) triggers.push("deferred_actions");
  if (week.ended) triggers.push("period_ended");
  return triggers;
}

/** 计划期间新增的联系人（按「在哪场活动认识」分组），由页面在计划到期时读一次。 */
export interface PlanPeriodContacts {
  total: number;
  byEvent: Array<{ eventId: string; title: string | null; count: number }>;
}

export interface PlanReview {
  actionsDone: number;
  actionsTotal: number;
  /** 计划期间新认识（新增）的联系人数；读不到时退回计划里关联过的联系人数。 */
  newPeople: number;
  established: number;
  /** 在哪些活动认识：活动名 + 人数（人数多的在前）。 */
  events: Array<{ eventId: string; title: string; count: number }>;
}

/** 到期回顾（纯函数）：完成行动、新认识人数、在哪些活动认识。 */
export function buildPlanReview(snapshot: Pick<PlanSnapshot, "items">, contacts: PlanPeriodContacts | null): PlanReview {
  const actions = snapshot.items.filter((item) => item.kind === "action");
  const linked = new Set<string>();
  const established = new Set<string>();
  for (const item of snapshot.items) {
    for (const link of item.contactLinks) {
      linked.add(link.contactId);
      if (link.state === "established") established.add(link.contactId);
    }
  }
  const eventTitles = new Map(
    snapshot.items.filter((item) => item.kind === "event" && item.linkedEventId).map((item) => [item.linkedEventId!, item.title]),
  );
  const events = (contacts?.byEvent ?? [])
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ count: entry.count, eventId: entry.eventId, title: eventTitles.get(entry.eventId) ?? entry.title ?? entry.eventId }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  // 读不到联系人时，已参加的计划活动仍列出（人数未知记 0 不显示人数）。
  if (!contacts) {
    for (const item of snapshot.items) {
      if (item.kind === "event" && item.status === "attended" && item.linkedEventId) {
        events.push({ count: 0, eventId: item.linkedEventId, title: item.title });
      }
    }
  }
  return {
    actionsDone: actions.filter((item) => item.status === "done").length,
    actionsTotal: actions.length,
    established: established.size,
    events,
    newPeople: contacts ? contacts.total : linked.size,
  };
}

/* ------------------------------------------------------------------ */
/* 生成新版本（mock 生成器，D3）                                         */
/* ------------------------------------------------------------------ */

export interface PlanFollowUpRequest {
  origin: PlanVersionOrigin;
  /** 当前生效计划的 id（乐观并发：计划已被换掉时 409，不会覆盖别人刚生成的版本）。 */
  basePlanId: string;
  goal: { text: string; horizon: PlanHorizon | null; snapshot: string };
  idempotencyKey: string;
  locale: PlanLocale;
}

export interface PlanFollowUpResult {
  snapshot: PlanSnapshot;
  replayed: boolean;
}

export class PlanFollowUpError extends Error {
  readonly reason: "GOAL_REQUIRED" | "PLAN_GENERATION_FAILED";

  constructor(reason: "GOAL_REQUIRED" | "PLAN_GENERATION_FAILED", message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlanFollowUpError";
    this.reason = reason;
  }
}

export const PLAN_FOLLOW_UP_KEY_PREFIX: Record<PlanVersionOrigin, string> = {
  next_plan: "next-plan:",
  reanalysis: "reanalyze:",
};

export function createPlanFollowUpService(input: {
  actorId: string;
  plans: PlanService;
  references: PlanReferenceValidator;
  source: PlanInputSource;
  generator: PlanGenerator;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async create(request: PlanFollowUpRequest): Promise<PlanFollowUpResult> {
      const goalText = request.goal.text.trim();
      if (!goalText) throw new PlanFollowUpError("GOAL_REQUIRED", "Write a goal before asking for a new plan.");
      const at = now();
      const selectorGoal = goalText;
      const [read, events] = await Promise.all([
        input.source.listContacts(input.actorId, { goalText: selectorGoal, now: at }),
        input.source.listEvents(at),
      ]);
      const selection = selectPlanContacts({
        actorId: input.actorId,
        contacts: read.contacts,
        goalText: selectorGoal,
        now: at,
        total: read.total,
      });
      const generatorInput: PlanGeneratorInput = {
        actorId: input.actorId,
        contacts: selection.contacts,
        contactsTotal: selection.total,
        events,
        goal: { horizon: request.goal.horizon ?? "quarter", snapshot: request.goal.snapshot, text: goalText },
        locale: request.locale,
        question: request.locale === "zh" ? "根据我的目标和人脉信息，重新规划我的计划。" : "Re-plan based on my goal and my network.",
        startsOn: planTokyoDate(at),
        supplement: null,
      };
      let draft;
      try {
        draft = await generatePlanDraft(input.generator, generatorInput, { idempotencyKey: request.idempotencyKey });
      } catch (error) {
        throw new PlanFollowUpError("PLAN_GENERATION_FAILED", "The plan could not be generated. Nothing was saved; please try again.", {
          cause: error,
        });
      }
      await validateGeneratedPlan({ draft, generatorInput, references: input.references });
      const outcome = await input.plans.createVersionWithOutcome(
        {
          ...draft,
          analysis: { ...draft.analysis, origin: request.origin },
          basePlanId: request.basePlanId,
          creationKey: `${PLAN_FOLLOW_UP_KEY_PREFIX[request.origin]}${request.idempotencyKey}`,
          sourceSessionId: null,
        },
        { origin: request.origin },
      );
      return { replayed: !outcome.created, snapshot: outcome.snapshot };
    },
  };
}

export type PlanFollowUpService = ReturnType<typeof createPlanFollowUpService>;
