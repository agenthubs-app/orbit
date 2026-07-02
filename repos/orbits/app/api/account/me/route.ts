import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  accountSessionFailureContext,
  accountSessionFailureToAppError,
} from "../../../../features/account/service";
import { createAccountSessionService } from "../../../../features/account/service-factory";
import type { AccountSessionScenario } from "../../../../features/account/contract";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

// /api/account/me 是“当前会话”的 HTTP 入口。
// route 只负责把 query scenario 规范化，再委托 account session service；
// 真实/模拟模式、错误码和 envelope 都由共享层统一处理。
function getScenario(request: Request): AccountSessionScenario | undefined {
  const scenario = new URL(request.url).searchParams.get("scenario");

  // scenario 只接受 contract 支持的固定值，避免任意 URL 参数影响服务分支。
  if (
    scenario === "demo-sign-in" ||
    scenario === "signed-out" ||
    scenario === "pending" ||
    scenario === "require-account"
  ) {
    return scenario;
  }

  return undefined;
}

export async function GET(request: Request): Promise<Response> {
  // mode 会写入 runtime boundary header，方便前端和测试知道当前走 mock/live/hybrid。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const accountService = createAccountSessionService(mode);
  const result = await accountService.getCurrentSession({
    scenario: getScenario(request),
  });

  if (result.success === false) {
    // feature failure 先转成 AppError，再按统一 envelope 输出给调用方。
    const appError = accountSessionFailureToAppError(result);

    return NextResponse.json(
      failure(appError, accountSessionFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // 成功响应保持最薄的一层包装：业务数据来自 service，route 不再二次加工。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
