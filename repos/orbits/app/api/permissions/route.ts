import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createPermissionStateService } from "../../../features/permissions/service-factory";
import {
  permissionStateFailureContext,
  permissionStateFailureToAppError,
} from "../../../features/permissions/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const permissionService = createPermissionStateService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = permissionService.listPermissionStates({ scenario });

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
}
