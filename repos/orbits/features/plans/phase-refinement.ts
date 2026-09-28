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
import { resolvePlanGenerator } from "./generator-service-factory";
import { planWeekState } from "./week";

export const PLAN_PHASE_REFINEMENT_SOURCE = "phase_refinement";

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

/** 服务默认的补细器：经生成器 factory 取（D3：只有 mock）；未配置时 fail closed（抛错，事务回滚，下次再试）。 */
export function defaultPhaseRefiner(): PhaseRefiner {
  return async (input) => {
    const resolution = resolvePlanGenerator();
    if (resolution.success === false) throw new Error(resolution.error.message);
    return createPhaseRefiner(resolution.service)(input);
  };
}

/* ------------------------------------------------------------------ */
/* `plan-phase` 维护任务                                                */
/* ------------------------------------------------------------------ */

export const PLAN_PHASE_TASK = "plan-phase";
/** 每次维护最多处理的 actor 数。 */
export const PLAN_PHASE_LIMIT = 50;

export interface PlanPhaseMaintenanceDeps {
  /** 生效计划的当前阶段（第 2 段起）还没有「进入新阶段」记录的 actor（有上限）。`today` 是东京日历日。 */
  listActorsEnteringPhase(input: { limit: number; today: string }): Promise<string[]>;
  planServiceFor: (actorId: string) => PlanService;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

export async function runPlanPhaseEntries(
  deps: PlanPhaseMaintenanceDeps,
  input: { limit: number; today: string; deadline?: number; now?: () => number },
): Promise<{ examined: number; entered: number; failed: number }> {
  const now = input.now ?? Date.now;
  const summary = { entered: 0, examined: 0, failed: 0 };
  const actors = await deps.listActorsEnteringPhase({ limit: input.limit, today: input.today });
  for (const actorId of actors.slice(0, input.limit)) {
    if (input.deadline !== undefined && now() >= input.deadline) break;
    summary.examined += 1;
    try {
      const result = await deps.planServiceFor(actorId).enterCurrentPhase();
      if (result.entered) summary.entered += 1;
    } catch {
      // 单个 actor 失败不挡住其他人，下次维护再试。
      summary.failed += 1;
    }
  }
  return summary;
}

export function createPlanPhaseMaintenanceTask(input: {
  resolve: () => PlanPhaseMaintenanceDeps | null;
  limit?: number;
  tokyoDate: (at: Date) => string;
}): MaintenanceTask {
  return {
    name: PLAN_PHASE_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      try {
        return await runPlanPhaseEntries(deps, {
          deadline,
          limit: input.limit ?? PLAN_PHASE_LIMIT,
          now: () => now().getTime(),
          today: input.tokyoDate(now()),
        });
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
