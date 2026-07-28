import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  accountSessionFailureContext,
  accountSessionFailureToAppError,
} from "../../../../../features/account/service";
import { createAccountSessionService } from "../../../../../features/account/service-factory";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

function sessionCookieNames(request: Request): string[] {
  const names = new Set([
    "authjs.session-token",
    "__Secure-authjs.session-token",
  ]);
  const cookieHeader = request.headers.get("cookie") ?? "";

  for (const pair of cookieHeader.split(";")) {
    const name = pair.slice(0, pair.indexOf("=")).trim();

    if (
      /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/u.test(name)
    ) {
      names.add(name);
    }
  }

  return [...names];
}

// /api/account/session/sign-out 是账号退出入口。
// route 调用 account session service，并让所有 Auth.js 会话 Cookie 立即过期。
export async function POST(request: Request): Promise<Response> {
  // mode 会写入 runtime boundary header，帮助前端判断当前是 mock/live/hybrid。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const accountService = createAccountSessionService(mode);
  const scenario = new URL(request.url).searchParams.get("scenario");
  // require-account scenario 用于演示“未登录访问受保护资源”的失败路径。
  const result =
    scenario === "require-account"
      ? await accountService.requireAccount("signed-out")
      : await accountService.signOut();

  if (result.success === false) {
    // AccountSessionFailure 在这里统一转换成 AppError/envelope。
    const appError = accountSessionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, accountSessionFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  const response = NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });

  for (const name of sessionCookieNames(request)) {
    response.cookies.set({
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      name,
      path: "/",
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
      value: "",
    });
  }

  return response;
}
