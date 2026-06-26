import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  eventValueRecommendationFailureContext,
  eventValueRecommendationFailureToAppError,
  type EventValueRecommendationInput,
} from "../../../../features/recommendations/event-value-contract";
import { createEventValueRecommendationService } from "../../../../features/recommendations/service-factory";

export const dynamic = "force-dynamic";

function readLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  return Number.isFinite(parsedLimit) ? parsedLimit : null;
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const searchParams = new URL(request.url).searchParams;
  const input: EventValueRecommendationInput = {
    calendarFit: searchParams.get("calendarFit"),
    industryPreference: searchParams.get("industryPreference"),
    limit: readLimit(searchParams),
    location: searchParams.get("location"),
    profileGoal: searchParams.get("profileGoal"),
    scenario: searchParams.get("scenario"),
  };
  const eventValueService = createEventValueRecommendationService();
  const result = eventValueService.listRecommendedEvents(input);

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
