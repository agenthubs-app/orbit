import { NextResponse } from "next/server";

import type { PlanVersionOrigin, ReanalysisQuota } from "../../../../../features/plans/contract";
import { resolvePlanGenerator } from "../../../../../features/plans/generator-service-factory";
import { createConfiguredPlanInputSource } from "../../../../../features/plans/input-source";
import { getConfiguredPlanMatchingRuntime } from "../../../../../features/plans/matching-runtime";
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
 */
export interface PlanReanalyzeRouteDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
  serviceForActor?: (
    actorId: string,
  ) => ServiceResolution<{ followUp: PlanFollowUpService; quota: () => Promise<ReanalysisQuota> }>;
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

export function resolveDefaultPlanFollowUpService(
  actorId: string,
): ServiceResolution<{ followUp: PlanFollowUpService; quota: () => Promise<ReanalysisQuota> }> {
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
      quota: () => plans.service.reanalysisQuota(),
    },
    success: true,
  };
}

export function createPlanReanalyzeRouteHandlers(dependencies: PlanReanalyzeRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readGoal = dependencies.readGoal ?? readProfileGoal;
  const serviceForActor = dependencies.serviceForActor ?? resolveDefaultPlanFollowUpService;

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
      let services: { followUp: PlanFollowUpService; quota: () => Promise<ReanalysisQuota> };
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
        if (body.origin !== undefined && body.origin !== "reanalysis" && body.origin !== "next_plan") {
          throw new AppError("VALIDATION_ERROR", 'origin must be "reanalysis" or "next_plan".');
        }
        const origin: PlanVersionOrigin = body.origin === "next_plan" ? "next_plan" : "reanalysis";
        const rawGoal = ((await readGoal(actorId)) ?? "").trim();
        const parsed = parseRelationshipGoal(rawGoal);
        const result = await services.followUp.create({
          basePlanId: body.basePlanId.trim(),
          goal: { horizon: parsed.horizon || null, snapshot: rawGoal, text: parsed.text },
          idempotencyKey: body.idempotencyKey,
          locale: body.locale === "en" ? "en" : "zh",
          origin,
        });
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
