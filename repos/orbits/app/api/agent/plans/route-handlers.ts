import { NextResponse } from "next/server";

import type {
  AddManualLogInput,
  CreatePlanVersionInput,
  PlanItemChange,
  PlanService,
} from "../../../../features/plans/contract";
import { resolvePlanService } from "../../../../features/plans/service-factory";
import { PlanServiceError } from "../../../../features/plans/service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
  toAppError,
} from "../../../../shared/errors/app-error";
import type { ServiceResolution } from "../../../../shared/services/module-mode";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export interface PlanRouteDependencies {
  /** 身份只在服务端解析；请求体、查询参数、客户端头一律不作为身份来源。 */
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<PlanService>;
}

type ItemContext = { params: Promise<{ itemId: string }> };

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new AppError("VALIDATION_ERROR", "Request body must be JSON.");
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 请求体在服务层做完整运行时校验（`features/plans/validators.ts`），这里的类型断言只为接线。
 *
 * `/api/agent/plans/**`：本人的结构化计划（RW-09）。
 *
 * - `GET  /api/agent/plans/current`          → `{ plan, items, log } | null`
 * - `POST /api/agent/plans`                  → 新版本（旧版归档，已完成内容带入），201
 * - `PATCH /api/agent/plans/items/:itemId`   → 单个条目变化 `{ change, idempotencyKey? }`
 * - `POST /api/agent/plans/log`              → 手动进展记录，201
 *
 * 只读写当前登录者自己的计划：他人的条目一律 404；非法转移 409、坏输入 400，都不写库。
 */
export function createPlanRouteHandlers(dependencies: PlanRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor =
    dependencies.serviceForActor ?? ((actorId: string) => resolvePlanService({ actorId }));

  async function run(
    operation: (service: PlanService) => Promise<unknown>,
    successStatus = 200,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const fail = (appError: AppError, context?: Record<string, string>) =>
      NextResponse.json(failure(appError, context), {
        headers,
        status: getHttpStatusForAppErrorCode(appError.code),
      });

    // 身份解析与服务解析也在统一错误边界内：依赖故障返回 503 envelope，而不是框架默认的错误页。
    let service: PlanService;
    try {
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
      const resolution = serviceForActor(actor.id);
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
          : new AppError("SERVICE_UNAVAILABLE", "The plan service is temporarily unavailable.", { cause: error }),
      );
    }

    try {
      return NextResponse.json(success(await operation(service)), {
        headers,
        status: successStatus,
      });
    } catch (error) {
      return fail(toAppError(error), error instanceof PlanServiceError ? { reason: error.reason } : undefined);
    }
  }

  return {
    GET_CURRENT: () => run((service) => service.getCurrent()),

    POST_VERSION: (request: Request) =>
      run(async (service) => service.createVersion((await readJson(request)) as CreatePlanVersionInput), 201),

    PATCH_ITEM: (request: Request, context: ItemContext) =>
      run(async (service) => {
        const [{ itemId }, body] = await Promise.all([context.params, readJson(request)]);
        if (!isPlainObject(body)) throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
        return service.updateItem({
          change: body.change as PlanItemChange,
          idempotencyKey: body.idempotencyKey as string | null | undefined,
          itemId,
        });
      }),

    POST_LOG: (request: Request) =>
      run(async (service) => service.addManualLog((await readJson(request)) as AddManualLogInput), 201),
  };
}
