import { after, NextResponse } from "next/server";

import type { PlanVersionOrigin, ReanalysisQuota } from "../../../../../features/plans/contract";
import {
  isMeteredPlanGenerator,
  PlanGenerationInProgressError,
  PlanGenerationLimitError,
  PlanGenerationUnavailableError,
} from "../../../../../features/plans/generator";
import { resolvePlanGenerator } from "../../../../../features/plans/generator-service-factory";
import { createConfiguredPlanInputSource } from "../../../../../features/plans/input-source";
import { enqueuePlanSourceMatchAfterSave, getConfiguredPlanMatchingRuntime } from "../../../../../features/plans/matching-runtime";
import {
  createLinkedContactNameReader,
  createPlanFollowUpService,
  PlanFollowUpError,
  type PlanFollowUpService,
} from "../../../../../features/plans/reanalysis";
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
 * `POST /api/agent/plans/reanalyze`：重新分析，或周期到期后制定下一份计划（W0012，RW-12）。
 *
 * 请求体 `{ basePlanId, idempotencyKey, origin?, locale? }`：
 * - `origin`：`"reanalysis"`（缺省，每个东京自然月 1 次）或 `"next_plan"`（到期回顾后的下一份，不占额度，
 *   计划未到期时 409 `PLAN_NOT_ENDED`）；
 * - `basePlanId` 必须是当前生效计划（乐观并发，否则 409 `BASE_PLAN_MISMATCH`）；
 * - `idempotencyKey` 同一个键重复提交只生成一份（第二次 200 `replayed: true`）。
 * - 目标**不从请求体读**：服务端读本人资料里的 relationshipGoal。
 *
 * 生成仍用 mock 生成器（D3）。保存在一个事务里：归档旧版、写新版、带入已完成的内容、（重新分析时）
 * 记下本月额度；任一步失败什么都不留下。本月额度用完 409 `REANALYSIS_QUOTA_EXHAUSTED`。
 * 响应 `{ planId, version, replayed, quota }`。
 *
 * W0048b：
 * - `origin: "ai_regenerate"`：生效计划是老模板计划（`analysis.generator = "mock-template-v1"`）且 provider 是 `ai`
 *   时用 AI 重新生成；不写 `reanalysis:<月>` 键、不占月额度；每份老计划只生成一次（creationKey
 *   `ai-regenerate:<旧计划 id>`，重复点击 replay）。provider 不是 `ai` 或生效计划不是模板计划 400。
 * - provider 为 `ai` 时一次生成 = 用户主动池 1 次操作：当日用满 429 `USER_DAILY_LIMIT`（0 次调用）；
 *   示例模式 403 `DEMO_MODE`。生成在请求内同步完成（maxDuration 300）。
 */
export interface PlanReanalyzeRouteDependencies {
  /** W0050：计划版本保存成功后（已提交）为这份计划入队 'plan' 匹配任务并在响应之外执行；失败只记日志。 */
  afterPlanSaved?: (actorId: string, planId: string) => Promise<void>;
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<PlanFollowUpServices>;
  isDemo?: (actor: AuthenticatedApiActor) => Promise<boolean>;
  /**
   * W0051（W51-1）：每月重新分析保存成功后把目标哈希不同的洞察统一标待更新（0 次 AI）；失败只记日志。
   * W0057（D59）：同时为已确认但没有洞察行的联系人补 pending 行（分页补完）。replayed 时同样执行（幂等），补上原请求失败的情况。
   */
  markInsightsGoalDirty?: (actorId: string, goal: string) => Promise<void>;
  /** W0057：在响应之外排任务（缺省 `after`）；不可用时只标待更新，交给维护任务。 */
  scheduleAfter?: (task: () => Promise<void>) => void;
  /** W0057：即时生成执行器（每次最多 5 批 = 100 人，余下交心跳）。 */
  generateInsightsNow?: (input: { actorId: string; contactIds?: readonly string[] }) => Promise<unknown>;
}

async function defaultMarkInsightsGoalDirty(actorId: string, goal: string): Promise<void> {
  const { prepareContactInsightsAfterReanalysisBestEffort } = await import("../../../../../features/contacts/insights/mark");
  await prepareContactInsightsAfterReanalysisBestEffort({ actorId, goal });
}

async function defaultGenerateInsightsNow(input: { actorId: string; contactIds?: readonly string[] }): Promise<unknown> {
  const { runConfiguredInstantInsightGeneration } = await import("../../../../../features/contacts/insights/instant");
  return runConfiguredInstantInsightGeneration(input);
}

export interface PlanFollowUpServices {
  followUp: PlanFollowUpService;
  quota: () => Promise<ReanalysisQuota>;
  /** W0048b：生成器按操作计次（provider `ai`）——只有这时 `ai_regenerate` 可用。 */
  metered?: boolean;
}

async function defaultIsDemo(actor: AuthenticatedApiActor): Promise<boolean> {
  return (await readDemoModeViewForActor({ actorId: actor.id, userId: actor.userId ?? null })) !== null;
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

export function resolveDefaultPlanFollowUpService(actorId: string): ServiceResolution<PlanFollowUpServices> {
  const plans = resolvePlanService({ actorId });
  if (plans.success === false) return plans;
  const references = resolvePlanReferenceValidator({ actorId });
  if (references.success === false) return references;
  const generator = resolvePlanGenerator();
  if (generator.success === false) return generator;
  const source = createConfiguredPlanInputSource();
  if (!source) return createNotImplementedFailure(PLANS_CAPABILITY_ID, plans.mode, [plans.mode]);
  // W0023：新版本里「约 TA」的称呼（live 才有匹配表；否则标题用「约 TA」）。
  const matching = getConfiguredPlanMatchingRuntime();
  return {
    mode: plans.mode,
    service: {
      followUp: createPlanFollowUpService({
        actorId,
        generator: generator.service,
        plans: plans.service,
        readLinkedContactNames: matching ? createLinkedContactNameReader(matching.repository) : undefined,
        references: references.service,
        source,
      }),
      metered: isMeteredPlanGenerator(generator.service),
      quota: () => plans.service.reanalysisQuota(),
    },
    success: true,
  };
}

export function createPlanReanalyzeRouteHandlers(dependencies: PlanReanalyzeRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readGoal = dependencies.readGoal ?? readProfileGoal;
  const serviceForActor = dependencies.serviceForActor ?? resolveDefaultPlanFollowUpService;
  const isDemo = dependencies.isDemo ?? defaultIsDemo;
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
      let services: PlanFollowUpServices;
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
        services = resolution.service;
        if (services.metered && (await isDemo(actor))) {
          return NextResponse.json(failure(new AppError("FORBIDDEN", "The example plan cannot be regenerated."), { reason: "DEMO_MODE" }), {
            headers,
            status: 403,
          });
        }
      } catch (error) {
        return fail(
          error instanceof AppError
            ? error
            : new AppError("SERVICE_UNAVAILABLE", "Re-analysis is temporarily unavailable.", { cause: error }),
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
        if (typeof body.basePlanId !== "string" || !body.basePlanId.trim() || body.basePlanId.length > 200) {
          throw new AppError("VALIDATION_ERROR", "basePlanId is required.");
        }
        if (body.origin !== undefined && body.origin !== "reanalysis" && body.origin !== "next_plan" && body.origin !== "ai_regenerate") {
          throw new AppError("VALIDATION_ERROR", 'origin must be "reanalysis", "next_plan" or "ai_regenerate".');
        }
        const origin: PlanVersionOrigin =
          body.origin === "next_plan" ? "next_plan" : body.origin === "ai_regenerate" ? "ai_regenerate" : "reanalysis";
        if (origin === "ai_regenerate" && !services.metered) {
          return fail(new AppError("VALIDATION_ERROR", "AI regeneration is not available."), { reason: "AI_REGENERATE_UNAVAILABLE" });
        }
        const rawGoal = ((await readGoal(actorId)) ?? "").trim();
        const parsed = parseRelationshipGoal(rawGoal);
        const result = await services.followUp.create({
          basePlanId: body.basePlanId.trim(),
          goal: { horizon: parsed.horizon || null, snapshot: rawGoal, text: parsed.text },
          idempotencyKey: body.idempotencyKey,
          locale: body.locale === "en" ? "en" : "zh",
          origin,
        });
        await afterPlanSaved(actorId, result.snapshot.plan.id).catch(() => undefined);
        // W0057（D59）：补行 + 目标标记 + 即时生成；replayed 时同样执行（三步都幂等），补上原请求尽力而为失败的情况。
        await (dependencies.markInsightsGoalDirty ?? defaultMarkInsightsGoalDirty)(actorId, rawGoal).catch(() => undefined);
        const { scheduleInstantInsightGeneration } = await import("../../../../../features/contacts/insights/mark");
        scheduleInstantInsightGeneration(
          dependencies.scheduleAfter ?? ((task) => after(task)),
          dependencies.generateInsightsNow ?? defaultGenerateInsightsNow,
          { actorId },
        );
        return NextResponse.json(
          success({
            planId: result.snapshot.plan.id,
            quota: await services.quota(),
            replayed: result.replayed,
            version: result.snapshot.plan.version,
          }),
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
        if (error instanceof PlanFollowUpError) {
          return fail(
            new AppError(error.reason === "GOAL_REQUIRED" ? "VALIDATION_ERROR" : "SERVICE_UNAVAILABLE", error.message, {
              cause: error,
            }),
            { reason: error.reason },
          );
        }
        return fail(toAppError(error), error instanceof PlanServiceError ? { reason: error.reason } : undefined);
      }
    },
  };
}
