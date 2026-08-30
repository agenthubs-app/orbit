import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  networkDistributionAnalyticsFailureContext,
  networkDistributionAnalyticsFailureToAppError,
} from "../../../../../../features/dashboard/distribution-contract";
import {
  createActorScopedNetworkDistributionAnalyticsService,
  createNetworkDistributionAnalyticsService,
} from "../../../../../../features/dashboard/service-factory";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

interface StructureDetailRouteContext {
  params: Promise<{
    bucketId: string;
    dimension: string;
  }>;
}

export async function GET(
  request: Request,
  context: StructureDetailRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const actor = mode === "mock" ? null : await resolveAuthenticatedApiActor();
  if (mode !== "mock" && !actor) {
    return authenticatedApiActorRequiredResponse(mode);
  }
  const { bucketId, dimension } = await context.params;
  const service =
    mode === "live" && actor
      ? createActorScopedNetworkDistributionAnalyticsService(actor.id)
      : createNetworkDistributionAnalyticsService(mode);
  const result = await service.getStructureDetail({
    bucketId: decodeURIComponent(bucketId),
    dimension: decodeURIComponent(dimension),
    scenario: new URL(request.url).searchParams.get("scenario"),
  });

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
