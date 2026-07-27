import { NextResponse } from "next/server";

import type { AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";
import type { EventDetailPayload } from "../../../../features/events/event-crud-and-import/contract";
import {
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
  type EventCrudAndImportService,
} from "../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
} from "../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";

interface OwnedEventRouteContext<TParams extends { id: string }> {
  params: Promise<TParams>;
}

export interface OwnedEventAccess {
  actor: AuthenticatedApiActor;
  event: EventDetailPayload;
  eventId: string;
  mode: FeatureMode;
}

export interface OwnedEventAccessDependencies {
  createEventService?: (
    mode: FeatureMode,
  ) => Pick<EventCrudAndImportService, "getEvent">;
  resolveActor?: ResolveAuthenticatedApiActor;
}

type OwnedEventHandler<TParams extends { id: string }> = (
  request: Request,
  context: OwnedEventRouteContext<TParams>,
  access: OwnedEventAccess,
) => Promise<Response>;

/**
 * Enforces the same authenticated, actor-scoped event lookup used by Event
 * Detail before any child capability can read or mutate event-derived state.
 */
export function withOwnedEventAccess<TParams extends { id: string }>(
  handler: OwnedEventHandler<TParams>,
  dependencies: OwnedEventAccessDependencies = {},
): (
  request: Request,
  context: OwnedEventRouteContext<TParams>,
) => Promise<Response> {
  return async function ownedEventHandler(request, context): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const params = await context.params;
    const eventId = params.id.trim();
    const eventService = (
      dependencies.createEventService ??
      ((resolvedMode) => createEventCrudAndImportService(resolvedMode))
    )(mode);
    const eventResult = await eventService.getEvent({
      actorId: actor.id,
      eventId,
    });

    if (eventResult.success === false) {
      const appError = eventCrudImportFailureToAppError(eventResult);

      return NextResponse.json(
        failure(appError, eventCrudImportFailureContext(eventResult, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return handler(request, context, {
      actor,
      event: eventResult.data,
      eventId,
      mode,
    });
  };
}
