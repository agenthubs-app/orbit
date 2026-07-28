import { NextResponse } from "next/server";

import type { AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";
import type { EventRecord } from "../../../../features/events/event-crud-and-import/contract";
import { loadEventForRegistration } from "../../../../features/events/registration/event-loader";
import { eventRegistrationRuntimeService } from "../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../features/events/registration/service";
import {
  failure,
  runtimeBoundaryHeaders,
} from "../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";

interface RegisteredEventRouteContext<TParams extends { id: string }> {
  params: Promise<TParams>;
}

export interface RegisteredEventAccess {
  actor: AuthenticatedApiActor;
  event: EventRecord;
  eventId: string;
  mode: FeatureMode;
}

export interface RegisteredEventAccessDependencies {
  getRegistration?: EventRegistrationService["get"];
  loadEvent?: typeof loadEventForRegistration;
  resolveActor?: ResolveAuthenticatedApiActor;
}

type RegisteredEventHandler<TParams extends { id: string }> = (
  request: Request,
  context: RegisteredEventRouteContext<TParams>,
  access: RegisteredEventAccess,
) => Promise<Response>;

function accessFailure(
  mode: FeatureMode,
  error: AppError,
  privacy: string,
): Response {
  return NextResponse.json(
    failure(error, {
      boundary: "runtime",
      mode,
      privacy,
      provenance:
        "The request was rejected before any event-scoped workflow or write ran.",
      service: "registered-event-access",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: error.code === "NOT_FOUND" ? 404 : 403,
    },
  );
}

/**
 * Authorizes attendee capabilities exposed by the public Event Detail page.
 *
 * Unlike owner-only event administration routes, these capabilities require
 * an authenticated actor, an accessible event, and an active registration for
 * that exact event.
 */
export function withRegisteredEventAccess<TParams extends { id: string }>(
  handler: RegisteredEventHandler<TParams>,
  dependencies: RegisteredEventAccessDependencies = {},
): (
  request: Request,
  context: RegisteredEventRouteContext<TParams>,
) => Promise<Response> {
  return async function registeredEventHandler(
    request,
    context,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const params = await context.params;
    const requestedEventId = params.id.trim();
    const event = await (
      dependencies.loadEvent ?? loadEventForRegistration
    )(requestedEventId, actor.id);

    if (!event) {
      return accessFailure(
        mode,
        new AppError("NOT_FOUND", "The event could not be found."),
        "event-not-found",
      );
    }

    const registration = await (
      dependencies.getRegistration ??
      eventRegistrationRuntimeService.get.bind(eventRegistrationRuntimeService)
    )({
      eventId: event.id,
      userId: actor.id,
    });

    if (registration?.status !== "rsvped") {
      return accessFailure(
        mode,
        new AppError(
          "FORBIDDEN",
          "An active registration is required for this event capability.",
        ),
        "active-event-registration-required",
      );
    }

    return handler(request, context, {
      actor,
      event,
      eventId: event.id,
      mode,
    });
  };
}
