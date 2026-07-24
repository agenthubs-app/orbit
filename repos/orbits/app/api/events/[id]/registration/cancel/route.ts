import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import {
  CURRENT_EVENT_REGISTRATION_USER_ID,
  eventRegistrationRuntimeService,
} from "../../../../../../features/events/registration/runtime";

export const dynamic = "force-dynamic";

interface EventRegistrationCancelRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: Request,
  context: EventRegistrationCancelRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const registration = await eventRegistrationRuntimeService.cancel({
    eventId: id,
    userId: CURRENT_EVENT_REGISTRATION_USER_ID,
  });

  if (!registration) {
    return NextResponse.json(
      failure(new AppError("NOT_FOUND", "No event registration exists to cancel.")),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 404,
      },
    );
  }

  return NextResponse.json(success(registration), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}

