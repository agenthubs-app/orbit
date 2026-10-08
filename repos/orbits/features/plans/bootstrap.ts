/**
 * 第一份计划的一次性生成与保存（W0008，RW-08 的 `plan_bootstrap` 通道）。
 *
 * 为什么不走 `/api/ai/conversations`：固定问题的回答是一份要落库、可跟踪的结构化计划，
 * 不是一段对话回复；对话接口的共享契约（`ReliableAiSendInputContract`）也没有「意图」字段，
 * 不为此改两端契约。mock 生成不需要后台任务，所以一次请求内生成并保存；接真实 AI 时再引入
 * 持久化的生成任务。
 *
 * 一次 `bootstrap`：
 * 1. 已有生效计划：如果就是同一个幂等键生成的那份 → 直接返回（`replayed`），否则 409
 *    `PLAN_ALREADY_EXISTS`（带上那份计划的 id）——第一份计划不会被悄悄换成 v2；
 * 2. 读本人的已确认联系人与真实活动目录，按 200 位规则裁剪；
 * 3. 生成器出骨架 + 各阶段细节（任一阶段失败整份失败，什么都不保存）；
 * 4. `validate.ts` 校验结构与引用（编造的、别人的 id 都拒绝）；
 * 5. W0007 `createVersion({ basePlanId: null, creationKey })`：一个事务保存为生效的 v1。
 *    同一幂等键并发重复提交只保存一份（仓储按人串行 + creationKey 唯一）。
 */
import type { PlanHorizon, PlanReferenceValidator, PlanService, PlanSnapshot } from "./contract";
import {
  runPlanGeneration,
  type PlanGenerator,
  type PlanGeneratorInput,
  type PlanLocale,
  tokyoDate,
} from "./generator";
import { selectPlanContacts } from "./input-selector";
import type { PlanInputSource } from "./input-source";
import { validateGeneratedPlan } from "./validate";
import { AppError } from "../../shared/errors/app-error";
import { PlanServiceError } from "./validators";

export const PLAN_BOOTSTRAP_QUESTION = {
  en: "Based on my goal and my network, how should I achieve my goal?",
  zh: "根据我的目标和人脉信息，我该如何实现目标？",
} as const;

export const PLAN_BOOTSTRAP_SUPPLEMENT_LIMIT = 60;
export const PLAN_BOOTSTRAP_KEY_PREFIX = "bootstrap:";

export type PlanBootstrapErrorReason = "GOAL_REQUIRED" | "PLAN_ALREADY_EXISTS" | "PLAN_GENERATION_FAILED";

const BOOTSTRAP_ERROR_CODES = {
  GOAL_REQUIRED: "VALIDATION_ERROR",
  PLAN_ALREADY_EXISTS: "CONFLICT",
  PLAN_GENERATION_FAILED: "SERVICE_UNAVAILABLE",
} as const;

export class PlanBootstrapError extends AppError {
  readonly reason: PlanBootstrapErrorReason;
  readonly planId: string | null;

  constructor(reason: PlanBootstrapErrorReason, message: string, options: { cause?: unknown; planId?: string | null } = {}) {
    super(BOOTSTRAP_ERROR_CODES[reason], message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PlanBootstrapError";
    this.reason = reason;
    this.planId = options.planId ?? null;
  }
}

export interface PlanBootstrapRequest {
  /** 目标原文（资料里的 relationshipGoal）与解析出的期限；由路由从服务端资料读出，不信任请求体。 */
  goal: { text: string; horizon: PlanHorizon | null; snapshot: string };
  supplement: string | null;
  idempotencyKey: string;
  locale: PlanLocale;
}

export interface PlanBootstrapResult {
  snapshot: PlanSnapshot;
  /** true = 同一幂等键已经保存过，这次没有再生成。 */
  replayed: boolean;
}

export interface PlanBootstrapService {
  bootstrap(request: PlanBootstrapRequest): Promise<PlanBootstrapResult>;
}

function storedKey(snapshot: PlanSnapshot): string | null {
  const request = (snapshot.plan.analysis as { request?: { idempotencyKey?: unknown } }).request;
  return typeof request?.idempotencyKey === "string" ? request.idempotencyKey : null;
}

export function createPlanBootstrapService(input: {
  actorId: string;
  plans: PlanService;
  references: PlanReferenceValidator;
  source: PlanInputSource;
  generator: PlanGenerator;
  now?: () => Date;
}): PlanBootstrapService {
  const now = input.now ?? (() => new Date());
  return {
    async bootstrap(request) {
      const goalText = request.goal.text.trim();
      if (!goalText) throw new PlanBootstrapError("GOAL_REQUIRED", "Write a goal before asking for a plan.");
      const key = request.idempotencyKey;

      const active = await input.plans.getCurrent();
      if (active) {
        if (storedKey(active) === key) return { replayed: true, snapshot: active };
        throw new PlanBootstrapError("PLAN_ALREADY_EXISTS", "You already have a plan.", { planId: active.plan.id });
      }

      const at = now();
      const selectorGoal = `${goalText} ${request.supplement ?? ""}`;
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
        // 目标没写期限时按 3 个月内（目标编辑器的默认期限）。
        goal: { horizon: request.goal.horizon ?? "quarter", snapshot: request.goal.snapshot, text: goalText },
        locale: request.locale,
        question: PLAN_BOOTSTRAP_QUESTION[request.locale],
        startsOn: tokyoDate(at),
        supplement: request.supplement,
      };

      const creationKey = `${PLAN_BOOTSTRAP_KEY_PREFIX}${key}`;
      // W0048b：AI 生成器时，流水线预留用户主动池 1 次操作（幂等键 = creationKey）并唯一结算；mock 与改前相同。
      return runPlanGeneration({
        generator: input.generator,
        idempotencyKey: key,
        input: generatorInput,
        ledgerKey: creationKey,
        now: at,
        save: async (draft, planId) => {
          try {
            const outcome = await input.plans.createVersionWithOutcome(
              { ...draft, analysis: { ...draft.analysis }, basePlanId: null, creationKey, sourceSessionId: null },
              planId ? { planId } : undefined,
            );
            // 并发重复提交：后到的那份在事务里命中 creationKey，拿到先保存的那份（replayed）。
            return { replayed: !outcome.created, snapshot: outcome.snapshot };
          } catch (error) {
            // 并发：另一份请求（不同的键）先保存了 v1。
            if (error instanceof PlanServiceError && error.reason === "BASE_PLAN_MISMATCH") {
              const current = await input.plans.getCurrent();
              throw new PlanBootstrapError("PLAN_ALREADY_EXISTS", "You already have a plan.", { planId: current?.plan.id ?? null });
            }
            throw error;
          }
        },
        validate: (draft) => validateGeneratedPlan({ draft, generatorInput, references: input.references }),
        wrapGenerationError: (error) =>
          new PlanBootstrapError("PLAN_GENERATION_FAILED", "The plan could not be generated. Nothing was saved; please try again.", {
            cause: error,
          }),
      });
    },
  };
}
