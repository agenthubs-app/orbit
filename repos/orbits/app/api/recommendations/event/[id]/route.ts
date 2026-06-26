import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createEventRecommendationService } from "../../../../../features/recommendations/service-factory";
import {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
} from "../../../../../features/recommendations/service";
import type { EventRecommendationInput } from "../../../../../features/recommendations/contract";

export const dynamic = "force-dynamic";

interface EventRecommendationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

export async function GET(
  request: Request,
  context: EventRecommendationRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const input: EventRecommendationInput = {
    eventId: id,
    limit: readLimit(searchParams),
    scenario: searchParams.get("scenario"),
  };
  const recommendationService = createEventRecommendationService();
  const result = recommendationService.listEventRecommendations(input);

  if (result.success === false) {
    const appError = eventRecommendationFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventRecommendationFailureContext(result, mode)),
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
