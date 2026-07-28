import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  createActorScopedPermissionStateService,
  createPermissionStateService,
} from "../../../features/permissions/service-factory";
import {
  permissionStateFailureContext,
  permissionStateFailureToAppError,
} from "../../../features/permissions/service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

export function createPermissionsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor =
    resolveAuthenticatedApiActor,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = mode === "mock" ? null : await resolveActor();

    if (mode !== "mock" && !actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const permissionService =
      mode === "live" && actor
        ? createActorScopedPermissionStateService(actor.id)
        : createPermissionStateService(mode);
    const scenario = new URL(request.url).searchParams.get("scenario");
    const result = await permissionService.listPermissionStates({ scenario });

    if (result.success === false) {
      const appError = permissionStateFailureToAppError(result);

      return NextResponse.json(
        failure(appError, permissionStateFailureContext(result, mode)),
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
  };
}
