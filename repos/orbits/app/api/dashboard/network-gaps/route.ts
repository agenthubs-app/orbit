import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import type { NetworkDistributionAnalyticsInput } from "../../../../features/dashboard/distribution-contract";
import {
  networkDistributionAnalyticsFailureContext,
  networkDistributionAnalyticsFailureToAppError,
} from "../../../../features/dashboard/distribution-contract";
import { createNetworkDistributionAnalyticsService } from "../../../../features/dashboard/service-factory";

export const dynamic = "force-dynamic";

// network-gaps 是 Dashboard 的网络缺口分析入口。
// route 只读取 scenario；缺口维度、建议和 provenance 由 distribution service 生成。
function readInput(request: Request): NetworkDistributionAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // 该接口是只读分析视图，不在 route 层重新计算或写入关系数据。
  const mode = resolveFeatureMode();
  const distributionService = createNetworkDistributionAnalyticsService();
  const result = await distributionService.getNetworkGaps(readInput(request));

  if (result.success === false) {
    // dashboard analytics 失败统一映射为共享 AppError。
    const appError = networkDistributionAnalyticsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, networkDistributionAnalyticsFailureContext(result, mode)),
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
