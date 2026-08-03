import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import { eventRegistrationRuntimeService } from "../../../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../../../features/events/registration/service";

interface EventRegistrationCancelRouteContext {
  params: Promise<{ id: string }>;
}

export function createEventRegistrationCancelRouteHandler(input: {
  registrationService?: EventRegistrationService;
  resolveActor: () => Promise<{ id: string } | null>;
}) {
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
  return async function POST(
    _request: Request,
    context: EventRegistrationCancelRouteContext,
  ): Promise<Response> {
    const actor = await input.resolveActor();
    if (!actor?.id) {
      return NextResponse.json(
        failure(new AppError("UNAUTHORIZED", "Sign in is required.")),
        { status: 401 },
      );
    }

    const mode = resolveFeatureMode();
    const { id } = await context.params;
    const registration = await registrationService.cancel({
      eventId: id,
      userId: actor.id,
    });
    if (!registration) {
      return NextResponse.json(
        failure(
          new AppError(
            "NOT_FOUND",
            "No event registration exists to cancel.",
          ),
        ),
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
  };
}
