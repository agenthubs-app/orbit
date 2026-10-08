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
import type { PlanHorizon, PlanReferenceValidator, PlanService, PlanSnapshot, PlanVersionOrigin, PlanViewItem, PlanViewSnapshot } from "./contract";
import { isMeteredPlanGenerator, runPlanGeneration, type PlanGenerator, type PlanGeneratorInput, type PlanLocale } from "./generator";
import { selectPlanContacts } from "./input-selector";
import type { PlanInputSource } from "./input-source";
import type { PlanMatchRepository } from "./matching-repository";
import { MOCK_PLAN_GENERATOR_ID } from "./mock-generator";
import { validateGeneratedPlan } from "./validate";
import { PlanServiceError } from "./validators";
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
export function deferredActionCount(items: readonly PlanViewItem[], currentWeek: number): number {
  return items.filter(
    (item) =>
      item.kind === "action" &&
      item.status !== "done" &&
      Math.max(item.deferralCount, planWeeksOverdue(item, currentWeek)) >= REANALYSIS_DEFERRED_WEEKS,
  ).length;
}

export function reanalysisTriggers(input: {
  snapshot: Pick<PlanViewSnapshot, "plan" | "items">;
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
export function buildPlanReview(snapshot: Pick<PlanViewSnapshot, "items">, contacts: PlanPeriodContacts | null): PlanReview {
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
  ai_regenerate: "ai-regenerate:",
  next_plan: "next-plan:",
  reanalysis: "reanalyze:",
};

/**
 * 新版本的 creationKey。W0048b：`ai_regenerate` 按旧计划 id（每份老模板计划只生成一次，重复点击 replay），
 * 其余按这次点击的幂等键。
 */
export function planFollowUpCreationKey(request: Pick<PlanFollowUpRequest, "origin" | "basePlanId" | "idempotencyKey">): string {
  return request.origin === "ai_regenerate"
    ? `${PLAN_FOLLOW_UP_KEY_PREFIX.ai_regenerate}${request.basePlanId}`
    : `${PLAN_FOLLOW_UP_KEY_PREFIX[request.origin]}${request.idempotencyKey}`;
}

/** 这份生效计划就是这次请求（同一来历 + 同一幂等键，或同一份老计划的 AI 重新生成）已经保存的结果吗？ */
function isFollowUpReplay(active: PlanSnapshot | null, request: PlanFollowUpRequest): boolean {
  if (!active) return false;
  const analysis = active.plan.analysis as { origin?: unknown; request?: { idempotencyKey?: unknown } };
  if (analysis.origin !== request.origin) return false;
  if (request.origin === "ai_regenerate") return active.plan.previousPlanId === request.basePlanId;
  return analysis.request?.idempotencyKey === request.idempotencyKey;
}

/**
 * W0023：生效计划里人脉需求已关联的联系人 → 称呼。只读需求投影（一次）与这些联系人的称呼（一次批量），
 * 在新版本事务之外调用；没有已关联的人时不读联系人。读不到称呼的人不在结果里（行动标题用「TA」）。
 */
export function createLinkedContactNameReader(
  repository: Pick<PlanMatchRepository, "readActiveNeedViews" | "readContactViews">,
): (actorId: string) => Promise<Record<string, string>> {
  return async (actorId) => {
    const needs = await repository.readActiveNeedViews(actorId);
    const ids = [...new Set(needs.flatMap((need) => need.linkedContactIds))];
    if (ids.length === 0) return {};
    const names: Record<string, string> = {};
    for (const contact of await repository.readContactViews(actorId, ids)) {
      const name = contact.displayName.trim();
      if (name) names[contact.id] = name;
    }
    return names;
  };
}

export function createPlanFollowUpService(input: {
  actorId: string;
  plans: PlanService;
  references: PlanReferenceValidator;
  source: PlanInputSource;
  generator: PlanGenerator;
  /** W0023：新版本里「约 TA」标题用的称呼（事务外读一次）；缺省或读失败时标题用「约 TA」。 */
  readLinkedContactNames?: (actorId: string) => Promise<Readonly<Record<string, string>>>;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async create(request: PlanFollowUpRequest): Promise<PlanFollowUpResult> {
      const goalText = request.goal.text.trim();
      if (!goalText) throw new PlanFollowUpError("GOAL_REQUIRED", "Write a goal before asking for a new plan.");
      // W0048b：按操作计次的生成器在预留之前先认出重放（0 次调用、不再计次）；mock 仍由 creationKey 在保存事务里认出。
      if (isMeteredPlanGenerator(input.generator)) {
        const active = await input.plans.getCurrent();
        if (isFollowUpReplay(active, request)) return { replayed: true, snapshot: active! };
        // ai_regenerate 的条件在预留之前核一次（保存事务里再核一次）：不满足不花一次调用。
        if (request.origin === "ai_regenerate" && (!active || active.plan.id !== request.basePlanId || active.plan.analysis.generator !== MOCK_PLAN_GENERATOR_ID)) {
          throw new PlanServiceError("INVALID_INPUT", "Only the active template-generated plan can be regenerated with AI.");
        }
      } else if (request.origin === "ai_regenerate") {
        throw new PlanServiceError("INVALID_INPUT", "AI regeneration needs the AI plan generator.");
      }
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
      const creationKey = planFollowUpCreationKey(request);
      return runPlanGeneration({
        generator: input.generator,
        idempotencyKey: request.idempotencyKey,
        input: generatorInput,
        // review P2-2：ai_regenerate 以固定的 `ai-regenerate:<旧计划 id>` 做 single-flight（不同点击键并发也只有一条 HTTP 链）；
        // 失败后再点按尝试序号重新认领（`#2`、`#3`…），点击键只用于请求自身的重放。
        ledgerKey: creationKey,
        retryAfterFailure: request.origin === "ai_regenerate",
        now: at,
        save: async (draft, planId) => {
          // 称呼只影响行动标题：读失败不挡住新计划，退回「约 TA」。
          let contactNames: Readonly<Record<string, string>> | undefined;
          if (input.readLinkedContactNames) {
            try {
              contactNames = await input.readLinkedContactNames(input.actorId);
            } catch (error) {
              console.warn("[plans] linked contact names unavailable; next-plan actions use 约 TA", error);
            }
          }
          const outcome = await input.plans.createVersionWithOutcome(
            {
              ...draft,
              analysis: { ...draft.analysis, origin: request.origin },
              basePlanId: request.basePlanId,
              creationKey,
              sourceSessionId: null,
            },
            { contactNames, origin: request.origin, ...(planId ? { planId } : {}) },
          );
          return { replayed: !outcome.created, snapshot: outcome.snapshot };
        },
        validate: (draft) => validateGeneratedPlan({ draft, generatorInput, references: input.references }),
        wrapGenerationError: (error) =>
          new PlanFollowUpError("PLAN_GENERATION_FAILED", "The plan could not be generated. Nothing was saved; please try again.", {
            cause: error,
          }),
      });
    },
  };
}

export type PlanFollowUpService = ReturnType<typeof createPlanFollowUpService>;
