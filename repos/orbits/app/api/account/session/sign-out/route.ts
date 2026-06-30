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

// /api/account/session/sign-out 是账号退出入口。
// route 只读取演示 scenario 并调用 account session service；
// 会话状态、require-account 校验和失败语义都由 feature contract 维护。
export function POST(request: Request): Response {
  // mode 会写入 runtime boundary header，帮助前端判断当前是 mock/live/hybrid。
  const mode = resolveFeatureMode();
  const accountService = createAccountSessionService();
  const scenario = new URL(request.url).searchParams.get("scenario");
  // require-account scenario 用于演示“未登录访问受保护资源”的失败路径。
  const result =
    scenario === "require-account"
      ? accountService.requireAccount("signed-out")
      : accountService.signOut();

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

  // 成功退出不在 route 里清理额外资源；payload 完全来自 session service。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
