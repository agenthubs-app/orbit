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

// distributions 是 Dashboard 中“网络分布”分析入口。
// route 只读取 scenario；分布维度、聚合逻辑和 provenance 由 dashboard service 负责。
function readInput(request: Request): NetworkDistributionAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  // 该接口是只读分析视图，返回标准 envelope 和 runtime boundary header。
  const mode = resolveFeatureMode();
  const distributionService = createNetworkDistributionAnalyticsService();
  const result = distributionService.getDistributions(readInput(request));

  if (result.success === false) {
    // analytics failure 映射为共享 AppError，保持 dashboard 子接口错误格式一致。
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
