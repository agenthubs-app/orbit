import { NextResponse } from "next/server";

import {
  createPlanBootstrapService,
  PlanBootstrapError,
  PLAN_BOOTSTRAP_SUPPLEMENT_LIMIT,
  type PlanBootstrapService,
} from "../../../../../features/plans/bootstrap";
import { resolvePlanGenerator } from "../../../../../features/plans/generator-service-factory";
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
 */
export interface PlanBootstrapRouteDependencies {
  /** 身份只在服务端解析；请求体、查询参数、客户端头一律不作为身份来源。 */
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<PlanBootstrapService>;
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
export function resolveDefaultPlanBootstrapService(actorId: string): ServiceResolution<PlanBootstrapService> {
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
    service: createPlanBootstrapService({
      actorId,
      generator: generator.service,
      plans: plans.service,
      references: references.service,
      source,
    }),
    success: true,
  };
}

export function createPlanBootstrapRouteHandlers(dependencies: PlanBootstrapRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readGoal = dependencies.readGoal ?? readProfileGoal;
  const serviceForActor = dependencies.serviceForActor ?? resolveDefaultPlanBootstrapService;

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
      let service: PlanBootstrapService;
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
        return NextResponse.json(
          success({ planId: result.snapshot.plan.id, replayed: result.replayed, version: result.snapshot.plan.version }),
          { headers, status: result.replayed ? 200 : 201 },
        );
      } catch (error) {
        if (error instanceof PlanBootstrapError) {
          return fail(error, error.planId ? { planId: error.planId, reason: error.reason } : { reason: error.reason });
        }
        return fail(toAppError(error), error instanceof PlanServiceError ? { reason: error.reason } : undefined);
      }
    },
  };
}
