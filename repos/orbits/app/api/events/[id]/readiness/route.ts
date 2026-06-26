import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventGoalReadinessFailureContext,
  eventGoalReadinessFailureToAppError,
} from "../../../../../features/events/goal-contract";
import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface EventReadinessRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventReadinessRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const goalService = createEventGoalAndReadinessService();
  const result = goalService.getReadiness({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = eventGoalReadinessFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventGoalReadinessFailureContext(result, mode)),
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
