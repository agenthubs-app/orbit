import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import type { DashboardAggregateInput } from "../../../features/dashboard/contract";
import { createDashboardAggregateService } from "../../../features/dashboard/service-factory";
import {
  dashboardAggregateFailureContext,
  dashboardAggregateFailureToAppError,
} from "../../../features/dashboard/service";

// Dashboard aggregate route 提供首页/仪表盘汇总数据。
// 指标聚合由 dashboard service 完成；route 只传递 scenario 和展示数量限制。
export const dynamic = "force-dynamic";

function readActivityLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("activityLimit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

function readInput(request: Request): DashboardAggregateInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    activityLimit: readActivityLimit(searchParams),
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // activityLimit 仅限制 mock payload 展示数量，不改变底层 fixture。
  const mode = resolveFeatureMode();
  const dashboardService = createDashboardAggregateService();
  const result = dashboardService.getDashboardAggregate(readInput(request));

  if (result.success === false) {
    const appError = dashboardAggregateFailureToAppError(result);

    return NextResponse.json(
      failure(appError, dashboardAggregateFailureContext(result, mode)),
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
