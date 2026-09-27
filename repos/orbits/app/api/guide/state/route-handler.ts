import { NextResponse } from "next/server";

import type { GuideState, GuideStateService } from "../../../../features/guide/guide-state";
import { resolveGuideStateService } from "../../../../features/guide/service-factory";
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

/** PATCH 只接受 `{ bannerCollapsed: boolean }`，多一个字段、少一个字段、类型不对都是 400。 */
function parsePatch(body: unknown): { bannerCollapsed: boolean } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "bannerCollapsed") {
    throw new AppError("VALIDATION_ERROR", "Only bannerCollapsed can be changed.");
  }
  const value = (body as { bannerCollapsed: unknown }).bannerCollapsed;
  if (typeof value !== "boolean") {
    throw new AppError("VALIDATION_ERROR", "bannerCollapsed must be a boolean.");
  }
  return { bannerCollapsed: value };
}

/**
 * GET/PATCH /api/guide/state：本人的引导记录（W0004）。
 * GET 返回 `{ grandfathered, bannerCollapsed, version }`；PATCH 只能改 `bannerCollapsed`，
 * 只写当前登录者自己的记录。`grandfathered` 只由服务端首次判定写入，接口不接受。
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
      let patch: { bannerCollapsed: boolean } | null = null;
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
        return service.setBannerCollapsed(patch.bannerCollapsed);
      });
    },
  };
}
