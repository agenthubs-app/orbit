import { NextResponse } from "next/server";

import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";
import type { EventAccessCapability } from "../../../../features/events/event-access/contract";
import {
  EventCapabilityDeniedError,
  requireEventCapability,
} from "../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../features/events/event-access/runtime";
import { EventAccessRepositoryError } from "../../../../features/events/event-access/storage/postgres-repository";
import { failure, runtimeBoundaryHeaders } from "../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";

export interface EventCapabilityAccessDependencies {
  createAccessService?: typeof createConfiguredEventAccessService;
  resolveActor?: ResolveAuthenticatedApiActor;
}

export interface EventCapabilityAccessContext {
  actor: AuthenticatedApiActor;
  eventId: string;
  mode: FeatureMode;
}

type EventCapabilityHandler<TContext> = (
  request: Request,
  context: TContext,
  access: EventCapabilityAccessContext,
) => Promise<Response>;

function repositoryErrorToAppError(error: EventAccessRepositoryError): AppError {
  if (
    error.code === "EVENT_ACCESS_NOT_READY" ||
    error.code === "EVENT_ACCESS_REPOSITORY_FAILED"
  ) {
    return new AppError(
      "SERVICE_UNAVAILABLE",
      "Event access is temporarily unavailable.",
      { cause: error },
    );
  }
  if (error.code === "EVENT_ACCESS_NOT_FOUND") {
    return new AppError("NOT_FOUND", "Event was not found.", { cause: error });
  }
  if (error.code === "EVENT_ACCESS_FORBIDDEN") {
    return new AppError("FORBIDDEN", "Event access is denied.", {
      cause: error,
    });
  }
  return new AppError(
    "CONFLICT",
    "Event access changed. Refresh and try again.",
    { cause: error },
  );
}

function accessErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof EventCapabilityDeniedError) {
    return new AppError("FORBIDDEN", "Event access is denied.", {
      cause: error,
    });
  }
  if (error instanceof EventAccessRepositoryError) {
    return repositoryErrorToAppError(error);
  }
  return new AppError("INTERNAL_ERROR", "The event operation failed.", {
    cause: error,
  });
}

export function isEventCapabilityAccessError(error: unknown): boolean {
  return (
    error instanceof EventCapabilityDeniedError ||
    error instanceof EventAccessRepositoryError
  );
}

export function withEventCapabilityAccess<TContext extends {
  params: Promise<{ id: string }>;
}>(
  capability: EventAccessCapability,
  handler: EventCapabilityHandler<TContext>,
  dependencies: EventCapabilityAccessDependencies = {},
) {
  return async (request: Request, context: TContext): Promise<Response> => {
    const mode = resolveFeatureMode();
    try {
      const actor = await (
        dependencies.resolveActor ?? resolveAuthenticatedApiActor
      )();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const eventId = (await context.params).id.trim();
      const accessService = (
        dependencies.createAccessService ?? createConfiguredEventAccessService
      )();
      if (!accessService) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Event access is temporarily unavailable.",
        );
      }
      await requireEventCapability({
        actorId: actor.id,
        capability,
        eventId,
        service: accessService,
      });
      return await handler(request, context, { actor, eventId, mode });
    } catch (error) {
      const appError = accessErrorToAppError(error);
      return NextResponse.json(
        failure(appError, {
          boundary: "runtime",
          privacy: "actor-and-event-scoped",
          service: "event-capability-access",
        }),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }
  };
}
