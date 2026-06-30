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

// permissions route 返回当前能力权限状态列表。
// route 只读取 scenario；权限默认值、可请求动作和状态解释由 permission service 负责。
export async function GET(request: Request): Promise<Response> {
  // GET 是只读权限视图，不发起授权流程。
  const mode = resolveFeatureMode();
  const permissionService = createPermissionStateService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = permissionService.listPermissionStates({ scenario });

  if (result.success === false) {
    // permission failure 统一映射成 AppError/envelope。
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
