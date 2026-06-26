import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import {
  eventValueRecommendationFailureContext,
  eventValueRecommendationFailureToAppError,
} from "../../../../../../features/recommendations/event-value-contract";
import { createEventValueRecommendationService } from "../../../../../../features/recommendations/service-factory";

export const dynamic = "force-dynamic";

interface EventValueAcceptRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  context: EventValueAcceptRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const eventValueService = createEventValueRecommendationService();
  const result = eventValueService.acceptRecommendedEvent({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = eventValueRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventValueRecommendationFailureContext(result, mode)),
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
