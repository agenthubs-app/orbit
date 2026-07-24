import { NextResponse } from "next/server";

import {
  authUserFailureContext,
  authUserFailureToAppError,
} from "../../../../features/auth/service";
import { resolveAuthUserService } from "../../../../features/auth/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

// /api/auth/register 创建邮箱密码账号。注册成功后由前端调 signIn("credentials")
// 建立会话;本 route 不签发任何 cookie。
export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const authService = resolveAuthUserService(mode);
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    email?: unknown;
    password?: unknown;
  };

  const result = await authService.registerUser({
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    displayName:
      typeof body.displayName === "string" ? body.displayName : undefined,
  });

  if (result.state !== "success") {
    const appError = authUserFailureToAppError(result);

    return NextResponse.json(
      failure(appError, authUserFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 201,
  });
}
