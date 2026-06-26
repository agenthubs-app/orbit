import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  eventAttendeeImportFailureContext,
  eventAttendeeImportFailureToAppError,
} from "../../../../../features/acquisition/event-attendee-contract";
import { createEventAttendeeImportService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

interface EventAttendeeRosterRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventAttendeeRosterRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const attendeeService = createEventAttendeeImportService();
  const result = attendeeService.listEventAttendees({
    eventId: id,
    relationshipStatusFilter: searchParams.get("relationshipStatusFilter"),
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = eventAttendeeImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventAttendeeImportFailureContext(result, mode)),
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
