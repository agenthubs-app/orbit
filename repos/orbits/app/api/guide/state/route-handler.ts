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

const PATCHABLE_FIELDS = new Set(["bannerCollapsed", "currentStep"]);

/**
 * PATCH 只接受客户端可写的两个字段的任意非空子集：
 *   - `bannerCollapsed`：boolean；
 *   - `currentStep`：整数 1–3（W0035 删去「活动」一步，4 也是 400）。
 * W0054（W54-1）：第 1 步不能再跳过，`step1Skipped`（任何取值）与其他多出的字段一样是 400；
 * 存量记录里的 `step1Skipped = true` 只在 GET 里只读返回。
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
      "Only bannerCollapsed and currentStep can be changed.",
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
  if ("currentStep" in input) {
    if (!isGuideStartStep(input.currentStep)) {
      throw new AppError("VALIDATION_ERROR", "currentStep must be an integer from 1 to 3.");
    }
    patch.currentStep = input.currentStep;
  }
  return patch;
}

/**
 * GET/PATCH /api/guide/state：本人的引导记录（W0004，W0006 扩展）。
 * GET 返回 `{ bannerCollapsed, completedAt, currentStep, grandfathered, step1Skipped, version }`；
 * PATCH 只能改 `bannerCollapsed`／`currentStep`，只写当前登录者自己的记录（W0054 起不接受 `step1Skipped`）。
 * `grandfathered`、`completedAt` 只由服务端判定写入，接口不接受。
 * `currentStep` 只校验取值（1–3）：指向锁定步骤的记录由页面按进度忽略（`resolveStartView`），
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
