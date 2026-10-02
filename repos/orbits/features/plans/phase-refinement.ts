/**
 * 进入新阶段（RW-12，Sprint W0012）：「进入新阶段」的自动进展记录，以及一年期计划进入后面的
 * 季度段时补充该阶段的周级行动（不占重新分析额度）。
 *
 * 生产者（两处，都走同一个幂等的 `PlanService.enterCurrentPhase()`）：
 * - 惰性：读取当前计划时（`GET /api/agent/plans/current`、「我的计划」页）按东京周次判定；
 * - 兜底：每日维护任务 `plan-phase`（有上限），不依赖用户打开页面。
 *
 * 判定：当前周所在的阶段（`planWeekState().phaseIndex`）是第 2 段及以后 → 进入了这一段。
 * 只记「当前」这一段：长时间没打开、跨过的中间阶段不补记（也不补细，已经过去的周没有意义）。
 * 每份计划的每个阶段只一条记录：幂等键 `phase-entered:<planId>:<phaseKey>`，服务层按人串行的事务里
 * 先查后写，`plan_log` 的唯一约束兜底；补充的行动与记录在同一事务里写入，所以「只补一次」。
 *
 * 补细（D3：仍用 W0008 的 mock 生成器）：以 `detailed: true` 重新请求这一段的细节，只取带周次的行动。
 * 同一阶段里已有同名、还没有周次的行动（第一次生成时的季度级条目）只补上周次，不重复插入。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { Plan, PlanItem, PlanPhase, PlanService } from "./contract";
import { PLAN_LIMITS } from "./contract";
import type { PlanGenerator, PlanLocale } from "./generator";
import type { PlanDailyBatch, PlanDailyGate } from "./maintenance-daily-gate";
import { createMockPlanGenerator, MOCK_PLAN_GENERATOR_ID } from "./mock-generator";
import { planWeekState } from "./week";

export const PLAN_PHASE_REFINEMENT_SOURCE = "phase_refinement";

/** W0048b：AI（DeepSeek 两阶段）生成的计划写在 `analysis.generator` 里的 id。 */
export const AI_PLAN_GENERATOR_ID = "deepseek-plan-v1";
/** D46②：AI 生成时只细化前 2 个阶段；其余由 `plan-phase` 维护任务在前一阶段成为当前时补细。 */
export const PLAN_AI_DETAILED_PHASES = 2;
/** W0048b：维护任务补细写入的条目 `meta.source`。 */
export const PLAN_AI_REFINE_SOURCE = "plan_refine";

/** 补细的幂等键（plan_log），每份计划每个阶段一条。 */
export function planRefineKey(planId: string, phaseIndex: number): string {
  return `plan-refine:${planId}:${phaseIndex}`;
}

/**
 * 待补细的阶段（纯函数）：AI 计划、未到期，当前阶段与下一阶段里 `analysis.phases[i].detailed === false` 的。
 * 还早于「前一阶段成为当前」的阶段不补；已经过去的阶段不补。是否已补细由调用方按幂等键再过滤。
 */
export function phaseRefinementCandidates(plan: Pick<Plan, "analysis" | "phases" | "startsOn">, now: Date): number[] {
  if (plan.analysis.generator !== AI_PLAN_GENERATOR_ID) return [];
  const week = planWeekState(plan, now);
  if (week.ended) return [];
  const analysisPhases = Array.isArray(plan.analysis.phases) ? (plan.analysis.phases as Array<{ detailed?: unknown }>) : [];
  const current = Math.max(0, week.phaseIndex);
  return [current, current + 1].filter(
    (index) => index < plan.phases.length && analysisPhases[index]?.detailed === false,
  );
}

export function phaseEnteredKey(planId: string, phaseKey: string): string {
  return `phase-entered:${planId}:${phaseKey}`;
}

/**
 * 当前周进入的新阶段（第 2 段及以后）；还在第 1 段、计划没有阶段、或计划已过最后一周时为 null——
 * 到期后是「回顾 → 下一份计划」，不再记「进入新阶段」也不补细（否则会改动回顾的计数）。
 */
export function phaseToEnter(plan: Pick<Plan, "startsOn" | "phases">, now: Date): { index: number; phase: PlanPhase } | null {
  const week = planWeekState(plan, now);
  if (week.ended) return null;
  const index = week.phaseIndex;
  if (index <= 0) return null;
  const phase = plan.phases[index];
  return phase ? { index, phase } : null;
}

/** 只有一年期的季度段在进入时补细；一个月／三个月的计划本来就细到周，只记日志。 */
export function phaseNeedsRefinement(plan: Pick<Plan, "horizon">, phase: Pick<PlanPhase, "granularity">): boolean {
  return plan.horizon === "year" && phase.granularity === "quarter";
}

export interface PhaseRefinement {
  /** 新插入的周级行动。 */
  inserts: Array<{ title: string; detail: string | null; suggestedWeek: number }>;
  /** 已有同名、还没有周次的行动补上周次。 */
  weekUpdates: Array<{ itemId: string; suggestedWeek: number }>;
}

export type PhaseRefiner = (input: { plan: Plan; items: readonly PlanItem[]; phase: PlanPhase }) => Promise<PhaseRefinement>;

/** 纯函数：生成器给出的这一段的行动 → 与现有条目对齐后的补充方案。 */
export function planPhaseRefinement(
  generated: ReadonlyArray<{ kind: string; title: string; detail?: string | null; suggestedWeek?: number | null }>,
  items: readonly PlanItem[],
  phase: Pick<PlanPhase, "key" | "startWeek" | "endWeek">,
): PhaseRefinement {
  const inserts: PhaseRefinement["inserts"] = [];
  const weekUpdates: PhaseRefinement["weekUpdates"] = [];
  const claimed = new Set<string>();
  const sameTitle = (a: string, b: string) => a.trim() === b.trim();
  for (const entry of generated) {
    if (entry.kind !== "action" || typeof entry.suggestedWeek !== "number") continue;
    const week = Math.min(PLAN_LIMITS.maxWeek, Math.max(phase.startWeek, Math.min(entry.suggestedWeek, phase.endWeek)));
    const existing = items.find(
      (item) =>
        item.kind === "action" &&
        item.phaseKey === phase.key &&
        !claimed.has(item.id) &&
        sameTitle(item.title, entry.title),
    );
    if (existing) {
      claimed.add(existing.id);
      // 已有周次的同名行动保持不动（用户可能已经手动延后过）。
      if (existing.suggestedWeek === null) weekUpdates.push({ itemId: existing.id, suggestedWeek: week });
      continue;
    }
    inserts.push({ detail: entry.detail ?? null, suggestedWeek: week, title: entry.title.slice(0, PLAN_LIMITS.titleLength) });
  }
  return { inserts, weekUpdates };
}

function planLocale(plan: Plan): PlanLocale {
  return plan.analysis.locale === "en" ? "en" : "zh";
}

/** 用计划生成器（现在是 mock）补细一段。计划的阶段不是生成器的模板阶段时（手工建的计划）不补。 */
export function createPhaseRefiner(generator: PlanGenerator): PhaseRefiner {
  return async ({ plan, items, phase }) => {
    let detail;
    try {
      detail = await generator.phaseDetail(
        {
          actorId: "phase-refinement",
          contacts: [],
          contactsTotal: 0,
          events: [],
          goal: { horizon: plan.horizon, snapshot: plan.goalSnapshot, text: plan.goalSnapshot },
          locale: planLocale(plan),
          question: "",
          startsOn: plan.startsOn,
          supplement: null,
        },
        { ...phase, detailed: true, summary: phase.summary ?? "" },
      );
    } catch (error) {
      if (error instanceof Error && /^Unknown phase /.test(error.message)) return { inserts: [], weekUpdates: [] };
      throw error;
    }
    return planPhaseRefinement(detail.items, items, phase);
  };
}

/**
 * 服务默认的补细器（读取路径与 `enterCurrentPhase` 共用）。W0048b（W48-10）：只给 mock 模板计划用 mock 生成器补细，
 * 与 provider 无关；其他计划（AI 生成、手工建的）在这里**不调用任何生成器**，只记「进入新阶段」——
 * AI 计划的骨架阶段只在 `plan-phase` 维护任务里补细（事务外、计入后台池）。打开页面永远 0 次模型调用。
 */
export function defaultPhaseRefiner(generator: PlanGenerator = createMockPlanGenerator()): PhaseRefiner {
  const refine = createPhaseRefiner(generator);
  return async (input) => {
    if (input.plan.analysis.generator !== MOCK_PLAN_GENERATOR_ID) return { inserts: [], weekUpdates: [] };
    return refine(input);
  };
}

/* ------------------------------------------------------------------ */
/* `plan-phase` 维护任务                                                */
/* ------------------------------------------------------------------ */

export const PLAN_PHASE_TASK = "plan-phase";
/** 每次维护最多处理的 actor 数。 */
export const PLAN_PHASE_LIMIT = 50;

export interface PlanPhaseMaintenanceDeps {
  /** 生效计划的当前阶段（第 2 段起）还没有「进入新阶段」记录的 actor（按 actor 排序，有上限）。`today` 是东京日历日。 */
  listActorsEnteringPhase(input: { limit: number; today: string; afterActorId?: string | null }): Promise<string[]>;
  planServiceFor: (actorId: string) => PlanService;
  /** W0048b（D46②）：AI 计划骨架阶段的补细；不配置（未切 AI 或无账本）时不做。 */
  refinement?: PlanPhaseRefinementDeps;
}

/** 一位 actor 一轮补细的结果：每个阶段 1 次后台池操作；后台池满时 0 次调用、顺延到 `retryOn`（次日 00:00 东京）。 */
export interface PlanPhaseRefineOutcome {
  refined: number;
  deferred: number;
  failed: number;
  retryOn?: string;
}

export interface PlanPhaseRefinementDeps {
  /** 生效 AI 计划里「前一阶段已开始」且还没补细的骨架阶段所属的 actor（按 actor 排序，有上限）。 */
  listActorsNeedingRefinement(input: { limit: number; today: string; afterActorId?: string | null }): Promise<string[]>;
  refineActor(actorId: string): Promise<PlanPhaseRefineOutcome>;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

/** examined／entered／failed；W0048b 配置了补细时另有 refined／refineDeferred／refineFailed（补细、后台池满顺延、失败的阶段数）。 */
export type PlanPhaseSummary = Record<string, number> & { examined: number; entered: number; failed: number };

/**
 * 一批：从 `afterActorId` 之后取最多 `limit` 位。`hasMore` = 取满了上限或到截止时间停下（同一东京日续批），
 * `cursor` 是本批最后处理的 actor。
 */
export async function runPlanPhaseEntriesBatch(
  deps: PlanPhaseMaintenanceDeps,
  input: { limit: number; today: string; afterActorId?: string | null; deadline?: number; now?: () => number },
): Promise<PlanDailyBatch & { summary: PlanPhaseSummary }> {
  const now = input.now ?? Date.now;
  const summary: PlanPhaseSummary = { entered: 0, examined: 0, failed: 0 };
  const actors = (
    await deps.listActorsEnteringPhase({ afterActorId: input.afterActorId ?? null, limit: input.limit, today: input.today })
  ).slice(0, input.limit);
  let cursor = input.afterActorId ?? null;
  let stopped = false;
  for (const actorId of actors) {
    if (input.deadline !== undefined && now() >= input.deadline) {
      stopped = true;
      break;
    }
    summary.examined += 1;
    cursor = actorId;
    try {
      const result = await deps.planServiceFor(actorId).enterCurrentPhase();
      if (result.entered) summary.entered += 1;
    } catch {
      // 单个 actor 失败不挡住其他人，下次扫描再试。
      summary.failed += 1;
    }
  }
  // W0048b：AI 计划骨架阶段补细（事务外调用、每阶段 1 次后台池操作）。候选由 SQL 先筛（已补细的不出现），
  // 超过上限的留到下一轮（每个东京日一轮，与「顺延次日」同一节奏）。
  if (deps.refinement && !stopped) {
    summary.refined = 0;
    summary.refineDeferred = 0;
    summary.refineFailed = 0;
    const refineActors = (await deps.refinement.listActorsNeedingRefinement({ limit: input.limit, today: input.today })).slice(0, input.limit);
    for (const actorId of refineActors) {
      if (input.deadline !== undefined && now() >= input.deadline) break;
      try {
        const outcome = await deps.refinement.refineActor(actorId);
        summary.refined = (summary.refined ?? 0) + outcome.refined;
        summary.refineDeferred = (summary.refineDeferred ?? 0) + outcome.deferred;
        summary.refineFailed = (summary.refineFailed ?? 0) + outcome.failed;
      } catch {
        summary.refineFailed = (summary.refineFailed ?? 0) + 1;
      }
    }
  }
  return { cursor, hasMore: stopped || actors.length >= input.limit, summary };
}

export async function runPlanPhaseEntries(
  deps: PlanPhaseMaintenanceDeps,
  input: { limit: number; today: string; deadline?: number; now?: () => number },
): Promise<PlanPhaseSummary> {
  return (await runPlanPhaseEntriesBatch(deps, input)).summary;
}

/**
 * `gate` 存在时（生产装配）每个东京自然日最多真正执行一次、到上限时同一天续批（见 `maintenance-daily-gate.ts`）；
 * 不传时每次调用都执行一批（测试与本地直接调用）。
 */
export function createPlanPhaseMaintenanceTask(input: {
  resolve: () => PlanPhaseMaintenanceDeps | null;
  limit?: number;
  tokyoDate: (at: Date) => string;
  gate?: PlanDailyGate;
}): MaintenanceTask {
  return {
    name: PLAN_PHASE_TASK,
    async run(context) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const execute = async (cursor: string | null): Promise<PlanDailyBatch | { skipped: string }> => {
        try {
          return await runPlanPhaseEntriesBatch(deps, {
            afterActorId: cursor,
            deadline: context.deadline,
            limit: input.limit ?? PLAN_PHASE_LIMIT,
            now: () => context.now().getTime(),
            today: input.tokyoDate(context.now()),
          });
        } catch (error) {
          if (isUndefinedTable(error)) return { skipped: "schema_missing" };
          throw error;
        }
      };
      if (input.gate) return input.gate.run(PLAN_PHASE_TASK, context, execute);
      const outcome = await execute(null);
      return "skipped" in outcome ? outcome : outcome.summary;
    },
  };
}
