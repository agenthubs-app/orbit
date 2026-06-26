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

function readInput(request: Request): NetworkDistributionAnalyticsInput {
  const searchParams = new URL(request.url).searchParams;

  return {
    scenario: searchParams.get("scenario"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const distributionService = createNetworkDistributionAnalyticsService();
  const result = distributionService.getNetworkGaps(readInput(request));

  if (result.success === false) {
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
