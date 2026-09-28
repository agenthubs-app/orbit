import { NextResponse } from "next/server";

import type { PlanService } from "../../../../../features/plans/contract";
import type { PlanMatchingService } from "../../../../../features/plans/matching-service";
import { getConfiguredPlanMatchingRuntime } from "../../../../../features/plans/matching-runtime";
import { resolvePlanService } from "../../../../../features/plans/service-factory";
import { PlanServiceError } from "../../../../../features/plans/service";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../shared/errors/app-error";
import type { ServiceResolution } from "../../../../../shared/services/module-mode";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

/**
 * `/api/agent/plans/candidates/**`：人脉需求匹配（RW-11，Sprint W0010）。身份只在服务端解析，
 * 请求体里的任何 actor 字段都不作为身份来源；所有读写按当前登录者隔离。
 *
 * - `GET  /api/agent/plans/candidates[?batchId=]`  本人待确认的候选（可限定某一批）
 * - `POST /api/agent/plans/candidates`             `{ candidateId, decision: "accept"|"dismiss" }`
 *                                                  或手动关联 `{ action: "link", needItemId, contactId, idempotencyKey? }`
 * - `POST /api/agent/plans/candidates/run`         `{ batchId }`：审阅页在批次确认完成后触发，
 *                                                  按 (actor, batch) 领取并在请求内执行这一批的任务
 * - `POST /api/agent/plans/items/:itemId/interaction`  「约 TA」行动上的「记一次互动」
 * - `POST /api/agent/plans/items/:itemId/draft`        「起草邮件」：点击才生成，返回可编辑草稿，不保存、不发送
 *
 * 他人的批次、候选、需求、联系人一律 404（与不存在相同），不写库。
 */
export interface PlanCandidateRouteDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  /** null = 匹配服务不可用（非 live 模式或数据库未配置）→ 503。 */
  matchingService?: () => PlanMatchingService | null;
  serviceForActor?: (actorId: string) => ServiceResolution<PlanService>;
}

const ID_MAX = 200;

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => {
    throw new AppError("VALIDATION_ERROR", "Request body must be JSON.");
  });
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
  }
  return body as Record<string, unknown>;
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > ID_MAX) {
    throw new AppError("VALIDATION_ERROR", `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalId(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : requiredId(value, field);
}

type ItemContext = { params: Promise<{ itemId: string }> };

export function createPlanCandidateRouteHandlers(dependencies: PlanCandidateRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const matchingService = dependencies.matchingService ?? (() => getConfiguredPlanMatchingRuntime()?.service ?? null);
  const serviceForActor = dependencies.serviceForActor ?? ((actorId: string) => resolvePlanService({ actorId }));

  async function run(operation: (actorId: string) => Promise<unknown>): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const fail = (appError: AppError, context?: Record<string, string>) =>
      NextResponse.json(failure(appError, context), { headers, status: getHttpStatusForAppErrorCode(appError.code) });
    let actorId: string;
    try {
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
      actorId = actor.id;
    } catch (error) {
      return fail(
        error instanceof AppError
          ? error
          : new AppError("SERVICE_UNAVAILABLE", "The matching service is temporarily unavailable.", { cause: error }),
      );
    }
    try {
      return NextResponse.json(success(await operation(actorId)), { headers });
    } catch (error) {
      return fail(toAppError(error), error instanceof PlanServiceError ? { reason: error.reason } : undefined);
    }
  }

  function requireMatching(): PlanMatchingService {
    const service = matchingService();
    if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Network-need matching requires the live plan database.");
    return service;
  }

  return {
    GET: (request: Request) =>
      run(async (actorId) => {
        const batchId = optionalId(new URL(request.url).searchParams.get("batchId"), "batchId");
        return requireMatching().listPending({ actorId, batchId });
      }),

    POST: (request: Request) =>
      run(async (actorId) => {
        const body = await readJson(request);
        const service = requireMatching();
        if (body.action === "link") {
          return service.linkManually({
            actorId,
            contactId: requiredId(body.contactId, "contactId"),
            idempotencyKey: optionalId(body.idempotencyKey, "idempotencyKey"),
            needItemId: requiredId(body.needItemId, "needItemId"),
          });
        }
        if (body.decision !== "accept" && body.decision !== "dismiss") {
          throw new AppError("VALIDATION_ERROR", 'decision must be "accept" or "dismiss".');
        }
        return service.decide({ actorId, candidateId: requiredId(body.candidateId, "candidateId"), decision: body.decision });
      }),

    POST_RUN: (request: Request) =>
      run(async (actorId) => {
        const body = await readJson(request);
        const { run: outcome, view } = await requireMatching().runForBatch({
          actorId,
          batchId: requiredId(body.batchId, "batchId"),
        });
        const state = outcome.state;
        return {
          ...view,
          run:
            state === "ran"
              ? { aiState: outcome.outcome.aiState, state, status: outcome.outcome.status }
              : { state },
        };
      }),

    POST_DRAFT: (request: Request, context: ItemContext) =>
      run(async (actorId) => {
        const [{ itemId }, body] = await Promise.all([context.params, readJson(request)]);
        return {
          draft: await requireMatching().draftEmail({
            actionItemId: requiredId(itemId, "itemId"),
            actorId,
            language: body.language === "en" ? "en" : "zh",
          }),
        };
      }),

    POST_INTERACTION: (request: Request, context: ItemContext) =>
      run(async (actorId) => {
        const [{ itemId }, body] = await Promise.all([context.params, readJson(request)]);
        const resolution = serviceForActor(actorId);
        if (resolution.success === false) throw new AppError("SERVICE_UNAVAILABLE", resolution.error.message);
        return resolution.service.recordInteraction({
          actionItemId: itemId,
          idempotencyKey: optionalId(body.idempotencyKey, "idempotencyKey"),
        });
      }),
  };
}
