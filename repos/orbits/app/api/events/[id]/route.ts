import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "../../../../features/events/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";

export const dynamic = "force-dynamic";

interface EventDetailRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: EventDetailRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const eventService = createEventCrudAndImportService();
  const result = eventService.getEvent({
    eventId: id,
    scenario: searchParams.get("scenario"),
  });

  if (result.success === false) {
    const appError = eventCrudImportFailureToAppError(result);

    return NextResponse.json(
      failure(appError, eventCrudImportFailureContext(result, mode)),
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
