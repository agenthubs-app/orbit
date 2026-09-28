import { NextResponse } from "next/server";

import type {
  GuideState,
  GuideStatePatch,
  GuideStateService,
} from "../../../../features/guide/guide-state";
import { resolveGuideStateService } from "../../../../features/guide/service-factory";
import { isGuideStartStep } from "../../../../features/guide/start-steps";
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

export interface GuideStateRouteDependencies {
  /** 身份只在服务端解析；请求体、查询参数、客户端头一律不作为身份来源。 */
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<GuideStateService>;
}

const PATCHABLE_FIELDS = new Set(["bannerCollapsed", "currentStep", "step1Skipped"]);

/**
 * PATCH 只接受客户端可写的三个字段的任意非空子集：
 *   - `bannerCollapsed`：boolean；
 *   - `step1Skipped`：只能是 true（跳过不可撤销）；
 *   - `currentStep`：整数 1–4。
 * 多出任何字段（包括 `grandfathered`、`completedAt`、`version`、身份字段）、空对象、类型或取值
 * 不对都是 400，整个请求不写。
 */
function parsePatch(body: unknown): GuideStatePatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !PATCHABLE_FIELDS.has(key))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only bannerCollapsed, step1Skipped and currentStep can be changed.",
    );
  }
  const input = body as Record<string, unknown>;
  const patch: GuideStatePatch = {};
  if ("bannerCollapsed" in input) {
    if (typeof input.bannerCollapsed !== "boolean") {
      throw new AppError("VALIDATION_ERROR", "bannerCollapsed must be a boolean.");
    }
    patch.bannerCollapsed = input.bannerCollapsed;
  }
  if ("step1Skipped" in input) {
    if (input.step1Skipped !== true) {
      throw new AppError("VALIDATION_ERROR", "step1Skipped can only be set to true.");
    }
    patch.step1Skipped = true;
  }
  if ("currentStep" in input) {
    if (!isGuideStartStep(input.currentStep)) {
      throw new AppError("VALIDATION_ERROR", "currentStep must be an integer from 1 to 4.");
    }
    patch.currentStep = input.currentStep;
  }
  return patch;
}

/**
 * GET/PATCH /api/guide/state：本人的引导记录（W0004，W0006 扩展）。
 * GET 返回 `{ bannerCollapsed, completedAt, currentStep, grandfathered, step1Skipped, version }`；
 * PATCH 只能改 `bannerCollapsed`／`step1Skipped`／`currentStep`，只写当前登录者自己的记录。
 * `grandfathered`、`completedAt` 只由服务端判定写入，接口不接受。
 * `currentStep` 只校验取值（1–4）：指向锁定步骤的记录由页面按进度忽略（`resolveStartView`），
 * 不会让用户越过顺序。
 */
export function createGuideStateRouteHandlers(
  dependencies: GuideStateRouteDependencies = {},
): {
  GET: () => Promise<Response>;
  PATCH: (request: Request) => Promise<Response>;
} {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor =
    dependencies.serviceForActor ?? ((actorId: string) => resolveGuideStateService({ actorId }));

  async function run(
    operation: (service: GuideStateService) => Promise<GuideState>,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    try {
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);

      const resolution = serviceForActor(actor.id);
      if (resolution.success === false) {
        const appError = new AppError("SERVICE_UNAVAILABLE", resolution.error.message);
        return NextResponse.json(
          failure(appError, {
            capabilityId: resolution.error.capabilityId,
            reason: resolution.error.code,
            requestedMode: resolution.error.requestedMode,
          }),
          { headers, status: getHttpStatusForAppErrorCode(appError.code) },
        );
      }
      return NextResponse.json(success(await operation(resolution.service)), {
        headers,
        status: 200,
      });
    } catch (error) {
      const appError = toAppError(error);
      return NextResponse.json(failure(appError), {
        headers,
        status: getHttpStatusForAppErrorCode(appError.code),
      });
    }
  }

  return {
    GET: () => run((service) => service.get()),
    PATCH: async (request) => {
      let patch: GuideStatePatch | null = null;
      let invalid: unknown = null;
      try {
        patch = parsePatch(
          await request.json().catch(() => {
            throw new AppError("VALIDATION_ERROR", "Request body must be JSON.");
          }),
        );
      } catch (error) {
        invalid = error;
      }
      // 先认证再报校验错误：未登录的人拿到的永远是 401，不泄露接口形状。
      return run(async (service) => {
        if (!patch) throw invalid;
        return service.update(patch);
      });
    },
  };
}
