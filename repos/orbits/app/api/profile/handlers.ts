import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createProfileService } from "../../../features/profile/service-factory";
import type {
  ManualProfileUpdateInput,
  ProfileScenario,
} from "../../../features/profile/contract";
import {
  profileFailureContext,
  profileFailureToAppError,
} from "../../../features/profile/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

// profile route 是当前用户资料的读写入口。
// route 只处理 scenario 和 JSON body；资料完整性、默认值和失败语义由 profile service 负责。
function getScenario(request: Request): ProfileScenario | undefined {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // 只接受 profile contract 支持的三种场景，避免任意 query 影响服务分支。
  if (scenario === "empty" || scenario === "pending" || scenario === "complete") {
    return scenario;
  }

  return undefined;
}

async function readProfileUpdateInput(
  request: Request,
): Promise<ManualProfileUpdateInput> {
  // PUT 允许空 body 或非法 JSON 回落为空对象，由 service 返回明确校验结果。
  try {
    const body = (await request.json()) as ManualProfileUpdateInput;

    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export interface ProfileRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
}

export function createProfileRouteHandlers(
  dependencies: ProfileRouteDependencies = {},
) {
  const resolveActor =
    dependencies.resolveActor ?? resolveAuthenticatedApiActor;

  return {
    async GET(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const profileService = createProfileService();
      const result = await profileService.getProfile({
        actorId: actor.id,
        scenario: getScenario(request),
      });

      if (result.success === false) {
        const appError = profileFailureToAppError(result);

        return NextResponse.json(
          failure(appError, profileFailureContext(result, mode)),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: getHttpStatusForAppErrorCode(appError.code),
          },
        );
      }

      return NextResponse.json(success(result.data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    },
    async PUT(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const profileService = createProfileService();
      const result = await profileService.updateProfile(
        await readProfileUpdateInput(request),
        { actorId: actor.id },
      );

      if (result.success === false) {
        const appError = profileFailureToAppError(result);

        return NextResponse.json(
          failure(appError, profileFailureContext(result, mode)),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: getHttpStatusForAppErrorCode(appError.code),
          },
        );
      }

      return NextResponse.json(success(result.data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    },
  };
}
