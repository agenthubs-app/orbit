import { NextResponse } from "next/server";

import {
  EventExperienceError,
  type EventExperienceConfiguration,
  type EventExperienceService,
} from "../../../../../features/events/experience/contract";
import {
  previewEventExperienceConfiguration,
} from "../../../../../features/events/experience/service";
import { createConfiguredEventExperienceService } from "../../../../../features/events/experience/runtime";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import { eventPilotDecision } from "../../../../../shared/config/event-pilot-gate";
import {
  isEventCapabilityAccessError,
  withEventCapabilityAccess,
  type EventCapabilityAccessDependencies,
} from "../event-capability-access";

interface EventExperienceRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventExperienceHandlerDependencies
  extends EventCapabilityAccessDependencies {
  createService?: () => EventExperienceService | null;
  pilotEnabled?: (eventId: string) => boolean;
}

function requirePilot(
  dependencies: EventExperienceHandlerDependencies,
  eventId: string,
): void {
  const enabled = dependencies.pilotEnabled
    ? dependencies.pilotEnabled(eventId)
    : eventPilotDecision({ capability: "experience", eventId }).enabled;
  if (!enabled) {
    throw new AppError(
      "FORBIDDEN",
      "Event experience is not enabled for this event.",
    );
  }
}

function serviceFor(
  dependencies: EventExperienceHandlerDependencies,
): EventExperienceService {
  const service = (
    dependencies.createService ?? createConfiguredEventExperienceService
  )();
  if (!service) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Event experience storage is not configured.",
    );
  }
  return service;
}

function errorResponse(error: unknown, mode: Parameters<typeof runtimeBoundaryHeaders>[0]): Response {
  const appError = toAppError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      eventExperienceCode:
        error instanceof EventExperienceError ? error.code : appError.code,
      privacy: "actor-and-event-scoped",
      service: "event-experience",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!(error instanceof EventExperienceError)) {
    return new AppError("INTERNAL_ERROR", "The event experience operation failed.", {
      cause: error,
    });
  }
  switch (error.code) {
    case "EVENT_EXPERIENCE_EVENT_ID_REQUIRED":
    case "EVENT_EXPERIENCE_INVALID":
      return new AppError("VALIDATION_ERROR", error.message, { cause: error });
    case "EVENT_EXPERIENCE_NOT_FOUND":
      return new AppError("NOT_FOUND", error.message, { cause: error });
    case "EVENT_EXPERIENCE_VERSION_CONFLICT":
    case "EVENT_EXPERIENCE_FROZEN":
    case "EVENT_EXPERIENCE_PUBLISH_REQUIRED":
      return new AppError("CONFLICT", error.message, { cause: error });
    case "EVENT_EXPERIENCE_STORAGE_UNAVAILABLE":
      return new AppError("SERVICE_UNAVAILABLE", error.message, { cause: error });
    default:
      return new AppError("INTERNAL_ERROR", "The event experience operation failed.", {
        cause: error,
      });
  }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "The request body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function configurationFromBody(body: Record<string, unknown>): EventExperienceConfiguration {
  if (!Object.hasOwn(body, "configuration")) {
    throw new AppError("VALIDATION_ERROR", "configuration is required.");
  }
  return body.configuration as EventExperienceConfiguration;
}

function expectedRevisionFromBody(
  body: Record<string, unknown>,
  options: { allowNull: boolean },
): number | null {
  const value = body.expectedRevision;
  if (options.allowNull && (value === null || value === undefined)) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      options.allowNull
        ? "expectedRevision must be a non-negative integer or null."
        : "expectedRevision must be a non-negative integer.",
    );
  }
  return value;
}

export function createEventExperienceGetHandler(
  dependencies: EventExperienceHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "experience.configure",
    async (_request, _context, access) => {
      try {
        requirePilot(dependencies, access.eventId);
        const snapshot = await serviceFor(dependencies).get(access.eventId);
        return NextResponse.json(success(snapshot), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        if (isEventCapabilityAccessError(error)) throw error;
        return errorResponse(error, access.mode);
      }
    },
    {
      createAccessService: dependencies.createAccessService,
      resolveActor: dependencies.resolveActor,
    },
  );
}

export function createEventExperienceDraftPutHandler(
  dependencies: EventExperienceHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "experience.configure",
    async (request, _context, access) => {
      try {
        requirePilot(dependencies, access.eventId);
        const body = await jsonBody(request);
        const snapshot = await serviceFor(dependencies).saveDraft({
          actorId: access.actor.id,
          configuration: configurationFromBody(body),
          eventId: access.eventId,
          expectedRevision: expectedRevisionFromBody(body, { allowNull: true }),
        });
        return NextResponse.json(success(snapshot), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        if (isEventCapabilityAccessError(error)) throw error;
        return errorResponse(error, access.mode);
      }
    },
    {
      createAccessService: dependencies.createAccessService,
      resolveActor: dependencies.resolveActor,
    },
  );
}

export function createEventExperiencePublishPostHandler(
  dependencies: EventExperienceHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "experience.publish",
    async (request, _context, access) => {
      try {
        requirePilot(dependencies, access.eventId);
        const body = await jsonBody(request);
        const expectedRevision = expectedRevisionFromBody(body, {
          allowNull: false,
        });
        if (expectedRevision === null) {
          throw new AppError("VALIDATION_ERROR", "expectedRevision is required.");
        }
        const snapshot = await serviceFor(dependencies).publish({
          actorId: access.actor.id,
          eventId: access.eventId,
          expectedRevision,
        });
        return NextResponse.json(success(snapshot), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        if (isEventCapabilityAccessError(error)) throw error;
        return errorResponse(error, access.mode);
      }
    },
    {
      createAccessService: dependencies.createAccessService,
      resolveActor: dependencies.resolveActor,
    },
  );
}

export function createEventExperiencePreviewPostHandler(
  dependencies: EventExperienceHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "experience.configure",
    async (request, _context, access) => {
      try {
        requirePilot(dependencies, access.eventId);
        const body = await jsonBody(request);
        const version = previewEventExperienceConfiguration(
          configurationFromBody(body),
        );
        return NextResponse.json(success({ version }), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        if (isEventCapabilityAccessError(error)) throw error;
        return errorResponse(error, access.mode);
      }
    },
    {
      createAccessService: dependencies.createAccessService,
      resolveActor: dependencies.resolveActor,
    },
  );
}
