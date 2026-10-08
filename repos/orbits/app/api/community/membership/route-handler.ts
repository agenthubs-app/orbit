import { NextResponse } from "next/server";

import type {
  CommunityMembership,
  CommunityMembershipService,
} from "../../../../features/community/contract";
import { resolveCommunityMembershipService } from "../../../../features/community/service-factory";
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

export interface CommunityMembershipRouteDependencies {
  /** 身份只在服务端解析；请求体、查询参数、客户端头一律不作为身份来源。 */
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  serviceForActor?: (actorId: string) => ServiceResolution<CommunityMembershipService>;
}

/**
 * GET/PUT /api/community/membership：本人的社群加入记录（RW-06）。
 * PUT = 「我已加入」，幂等；不接受任何请求体字段，只写当前登录者自己的记录。
 */
export function createCommunityMembershipRouteHandlers(
  dependencies: CommunityMembershipRouteDependencies = {},
): {
  GET: () => Promise<Response>;
  PUT: () => Promise<Response>;
} {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor =
    dependencies.serviceForActor ??
    ((actorId: string) => resolveCommunityMembershipService({ actorId }));

  async function run(
    operation: (service: CommunityMembershipService) => Promise<CommunityMembership>,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);

    const resolution = serviceForActor(actor.id);
    const headers = runtimeBoundaryHeaders(mode);
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

    try {
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
    PUT: () => run((service) => service.join()),
  };
}
