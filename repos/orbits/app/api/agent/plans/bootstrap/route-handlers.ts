import { after, NextResponse } from "next/server";

import {
  createPlanBootstrapService,
  PlanBootstrapError,
  PLAN_BOOTSTRAP_SUPPLEMENT_LIMIT,
  type PlanBootstrapService,
} from "../../../../../features/plans/bootstrap";
import {
  isMeteredPlanGenerator,
  PlanGenerationInProgressError,
  PlanGenerationLimitError,
  PlanGenerationUnavailableError,
} from "../../../../../features/plans/generator";
import { resolvePlanGenerator } from "../../../../../features/plans/generator-service-factory";
import { resolvePlanV2Service } from "../../../../../features/plans/v2/service-factory";
import { enqueuePlanSourceMatchAfterSave } from "../../../../../features/plans/matching-runtime";
import { createConfiguredPlanInputSource } from "../../../../../features/plans/input-source";
import {
  PLANS_CAPABILITY_ID,
  resolvePlanReferenceValidator,
  resolvePlanService,
} from "../../../../../features/plans/service-factory";
import { PlanServiceError } from "../../../../../features/plans/service";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../shared/errors/app-error";
import {
  createNotImplementedFailure,
  resolveModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";
import { parseRelationshipGoal } from "../../../../(app)/app/profile/goal-editor/goal-editor-model";
import { readDemoModeViewForActor } from "../../../../(app)/app/_demo/demo-guide-view";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

/**
 * `POST /api/agent/plans/bootstrap`：固定问题 → 生成并保存第一份计划（W0008，RW-08）。
 *
 * 请求体 `{ idempotencyKey, supplement?, locale? }`：
 * - `idempotencyKey` 必填（1–100 位字母数字与 `:_-`）。同一个键重复提交只保存一份，
 *   第二次直接返回已保存的计划（200，`replayed: true`）；首次保存 201。
 * - `supplement` 选填的一句补充（≤ 60 字）；`locale` 决定生成文案的语言（缺省 zh）。
 * - 目标**不从请求体读**：服务端读本人资料里的 relationshipGoal（与第 3 步显示的是同一句）。
 *
 * 响应 `{ planId, version, replayed }`。错误都是统一 envelope：
 * 未登录 401；没写目标 400 `GOAL_REQUIRED`；已有计划 409 `PLAN_ALREADY_EXISTS`（context.planId）；
 * 生成失败 503 `PLAN_GENERATION_FAILED`（什么都没保存，可重试）；引用了不存在／别人的联系人或活动 404；
 * 生成器 / 存储未配置 503。
 *
 * W0048b：`ORBIT_PLAN_GENERATOR=ai` 时由 DeepSeek 两阶段生成（一次生成 = 用户主动池 1 次操作）；用户池当日用满
 * 429 `USER_DAILY_LIMIT`（context.retryOn，0 次调用）；示例模式 403 `DEMO_MODE`（不预留、不调用生成器）。
 * 生成在请求内同步完成（maxDuration 300，见 route.ts）；断线后服务端仍保存，同一幂等键重放取回结果。
 */
export interface PlanBootstrapRouteDependencies {
  /** W0050：计划版本保存成功后（已提交）为这份计划入队 'plan' 匹配任务并在响应之外执行；失败只记日志。 */
  afterPlanSaved?: (actorId: string, planId: string) => Promise<void>;
  /** 身份只在服务端解析；请求体、查询参数、客户端头一律不作为身份来源。 */
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<PlanBootstrapService & { metered?: boolean }>;
  /** 示例模式（只在按操作计次的生成器时判定）。 */
  isDemo?: (actor: AuthenticatedApiActor) => Promise<boolean>;
  /** R22：本人已有生效中的 v2 计划时，不再生成旧式计划（在调生成器、花 AI 之前就拒绝）。 */
  hasActiveV2Plan?: (actorId: string) => Promise<boolean>;
}

async function defaultHasActiveV2Plan(actorId: string): Promise<boolean> {
  const resolution = resolvePlanV2Service({ actorId });
  // mock 下的 v2 是演示世界的示例计划，不算本人的计划；数据库层另有 V2_PLAN_ACTIVE 兜底。
  if (resolution.success === false || resolution.mode !== "live") return false;
  return resolution.service.hasActivePlan();
}

/**
 * W0055：新用户在引导第 3 步「让 iOrbit 做你的第一份计划」时本来就处在示例模式（引导要等计划生成后才完成），
 * 原判定「示例模式一律 403」让 AI 生成器下的新用户永远做不出第一份计划。只有引导前两步（名片、目标）都完成、
 * 下一步正是「计划」时放行；其余示例模式照旧 403、不预留、不调用生成器。
 */
export function planBootstrapBlockedByDemo(view: { nextStep: string | null } | null): boolean {
  return view !== null && view.nextStep !== "plan";
}

async function defaultIsDemo(actor: AuthenticatedApiActor): Promise<boolean> {
  return planBootstrapBlockedByDemo(await readDemoModeViewForActor({ actorId: actor.id, userId: actor.userId ?? null }));
}

const KEY_PATTERN = /^[A-Za-z0-9:_-]{1,100}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readProfileGoal(actorId: string): Promise<string | null> {
  const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
  if (result.success === false) throw new AppError("SERVICE_UNAVAILABLE", "Your profile could not be read.");
  return result.data.profile?.relationshipGoal ?? null;
}

/** 默认依赖：计划存储、同一后端的引用校验、生成器、真实数据来源，任一缺失都 fail closed。 */
export function resolveDefaultPlanBootstrapService(actorId: string): ServiceResolution<PlanBootstrapService & { metered: boolean }> {
  const plans = resolvePlanService({ actorId });
  if (plans.success === false) return plans;
  const references = resolvePlanReferenceValidator({ actorId });
  if (references.success === false) return references;
  const generator = resolvePlanGenerator();
  if (generator.success === false) return generator;
  const source = createConfiguredPlanInputSource();
  if (!source) return createNotImplementedFailure(PLANS_CAPABILITY_ID, plans.mode, [plans.mode]);
  return {
    mode: plans.mode,
    service: Object.assign(
      createPlanBootstrapService({
        actorId,
        generator: generator.service,
        plans: plans.service,
        references: references.service,
        source,
      }),
      { metered: isMeteredPlanGenerator(generator.service) },
    ),
    success: true,
  };
}

export function createPlanBootstrapRouteHandlers(dependencies: PlanBootstrapRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readGoal = dependencies.readGoal ?? readProfileGoal;
  const serviceForActor = dependencies.serviceForActor ?? resolveDefaultPlanBootstrapService;
  const isDemo = dependencies.isDemo ?? defaultIsDemo;
  const hasActiveV2Plan = dependencies.hasActiveV2Plan ?? defaultHasActiveV2Plan;
  const afterPlanSaved =
    dependencies.afterPlanSaved ?? ((actorId: string, planId: string) => enqueuePlanSourceMatchAfterSave({ actorId, planId }, { after }));

  return {
    async POST(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const headers = runtimeBoundaryHeaders(mode);
      const fail = (appError: AppError, context?: Record<string, string>) =>
        NextResponse.json(failure(appError, context), {
          headers,
          status: getHttpStatusForAppErrorCode(appError.code),
        });

      let actorId: string;
      let service: PlanBootstrapService & { metered?: boolean };
      try {
        const actor = await resolveActor();
        if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
        actorId = actor.id;
        const resolution = serviceForActor(actorId);
        if (resolution.success === false) {
          return fail(new AppError("SERVICE_UNAVAILABLE", resolution.error.message), {
            capabilityId: resolution.error.capabilityId,
            reason: resolution.error.code,
            requestedMode: resolution.error.requestedMode,
          });
        }
        service = resolution.service;
        // 示例模式不预留配额、不调用生成器（mock 生成器免费，沿用改前行为）。
        if (service.metered && (await isDemo(actor))) {
          return NextResponse.json(failure(new AppError("FORBIDDEN", "The example plan cannot be generated."), { reason: "DEMO_MODE" }), {
            headers,
            status: 403,
          });
        }
        if (await hasActiveV2Plan(actorId)) {
          return NextResponse.json(failure(new AppError("CONFLICT", "A new-style plan is active; old-style plans can no longer be created."), { href: "/app/tasks?tab=plan", reason: "V2_PLAN_ACTIVE" }), {
            headers,
            status: 409,
          });
        }
      } catch (error) {
        return fail(
          error instanceof AppError
            ? error
            : new AppError("SERVICE_UNAVAILABLE", "Plan generation is temporarily unavailable.", { cause: error }),
        );
      }

      try {
        const body = await request.json().catch(() => {
          throw new AppError("VALIDATION_ERROR", "Request body must be JSON.");
        });
        if (!isPlainObject(body)) throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
        if (typeof body.idempotencyKey !== "string" || !KEY_PATTERN.test(body.idempotencyKey)) {
          throw new AppError("VALIDATION_ERROR", "idempotencyKey is required.");
        }
        if (body.supplement !== undefined && body.supplement !== null && typeof body.supplement !== "string") {
          throw new AppError("VALIDATION_ERROR", "supplement must be a string.");
        }
        const supplement = typeof body.supplement === "string" ? body.supplement.trim() : "";
        if (supplement.length > PLAN_BOOTSTRAP_SUPPLEMENT_LIMIT) throw new AppError("VALIDATION_ERROR", "supplement is too long.");

        const rawGoal = ((await readGoal(actorId)) ?? "").trim();
        const parsed = parseRelationshipGoal(rawGoal);
        const result = await service.bootstrap({
          goal: { horizon: parsed.horizon || null, snapshot: rawGoal, text: parsed.text },
          idempotencyKey: body.idempotencyKey,
          locale: body.locale === "en" ? "en" : "zh",
          supplement: supplement || null,
        });
        await afterPlanSaved(actorId, result.snapshot.plan.id).catch(() => undefined);
        return NextResponse.json(
          success({ planId: result.snapshot.plan.id, replayed: result.replayed, version: result.snapshot.plan.version }),
          { headers, status: result.replayed ? 200 : 201 },
        );
      } catch (error) {
        if (error instanceof PlanGenerationLimitError) {
          return NextResponse.json(
            failure(new AppError("CONFLICT", error.message), { reason: "USER_DAILY_LIMIT", ...(error.retryOn ? { retryOn: error.retryOn } : {}) }),
            { headers, status: 429 },
          );
        }
        if (error instanceof PlanGenerationInProgressError) {
          return fail(new AppError("CONFLICT", error.message), { reason: "GENERATION_IN_PROGRESS" });
        }
        if (error instanceof PlanGenerationUnavailableError) {
          return fail(new AppError("SERVICE_UNAVAILABLE", error.message), { reason: "AI_UNAVAILABLE" });
        }
        if (error instanceof PlanBootstrapError) {
          return fail(error, error.planId ? { planId: error.planId, reason: error.reason } : { reason: error.reason });
        }
        return fail(toAppError(error), error instanceof PlanServiceError ? { reason: error.reason } : undefined);
      }
    },
  };
}
