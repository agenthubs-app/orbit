import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { DashboardAggregateSummaryInput } from "../../../../features/dashboard/contract";
import { createDashboardAggregateService } from "../../../../features/dashboard/service-factory";
import {
  dashboardAggregateFailureContext,
  dashboardAggregateFailureToAppError,
} from "../../../../features/dashboard/service";

export const dynamic = "force-dynamic";

// Dashboard summary 是首页聚合数据入口。
// route 只读取 scenario 并调用 dashboard aggregate service，不在 HTTP 层计算指标。
function readInput(request: Request): DashboardAggregateSummaryInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // feature mode 决定 mock/live/hybrid，同时通过 header 暴露给调试和测试。
  const mode = resolveFeatureMode();
  const dashboardService = createDashboardAggregateService();
  const result = await dashboardService.getDashboardSummary(readInput(request));

  if (result.success === false) {
    // 聚合服务失败统一映射为 AppError，避免 dashboard 页面依赖内部错误码。
    const appError = dashboardAggregateFailureToAppError(result);

    return NextResponse.json(
      failure(appError, dashboardAggregateFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  // summary payload 已经是页面需要的 shape，route 只包一层标准 success envelope。
  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
