import { NextResponse } from "next/server";

import {
  EventAnalyticsReadModelError,
} from "../../../../../features/events/event-analytics/read-model";
import {
  toEventAnalyticsAttendeeResponse,
  toEventAnalyticsOrganizerResponse,
} from "../../../../../features/events/event-analytics/response";
import { createConfiguredEventAnalyticsReadModel } from "../../../../../features/events/event-analytics/runtime";
import type { EventAnalyticsReadModel } from "../../../../../features/events/event-analytics/contract";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import {
  withEventCapabilityAccess,
  type EventCapabilityAccessDependencies,
} from "../event-capability-access";
import {
  withRegisteredEventAccess,
  type RegisteredEventAccessDependencies,
} from "../registered-event-access";

interface EventAnalyticsRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventAnalyticsHandlerDependencies {
  aggregateAccess?: EventCapabilityAccessDependencies;
  attendeeAccess?: RegisteredEventAccessDependencies;
  createReadModel?: () => EventAnalyticsReadModel | null;
}

function readModelFor(
  dependencies: EventAnalyticsHandlerDependencies,
): EventAnalyticsReadModel {
  const readModel = (
    dependencies.createReadModel ?? createConfiguredEventAnalyticsReadModel
  )();
  if (!readModel) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Event analytics storage is not configured.",
    );
  }
  return readModel;
}

function analyticsError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (
    error instanceof EventAnalyticsReadModelError &&
    error.code === "EVENT_ANALYTICS_ACTIVE_REGISTRATION_REQUIRED"
  ) {
    return new AppError(
      "FORBIDDEN",
      "An active registration is required for this attendee report.",
      { cause: error },
    );
  }
  if (error instanceof EventAnalyticsReadModelError) {
    return new AppError("VALIDATION_ERROR", "The analytics scope is invalid.", {
      cause: error,
    });
  }
  return new AppError("INTERNAL_ERROR", "The analytics read failed.", {
    cause: error,
  });
}

function analyticsErrorResponse(
  error: unknown,
  mode: Parameters<typeof runtimeBoundaryHeaders>[0],
  privacy: "aggregate-only" | "self-evidence-only",
): Response {
  const appError = analyticsError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      privacy,
      service: "event-analytics-read-model",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

export function createEventAnalyticsAggregateGetHandler(
  dependencies: EventAnalyticsHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "analytics.read_aggregate",
    async function getEventAnalyticsAggregate(
      _request: Request,
      _context: EventAnalyticsRouteContext,
      access,
    ): Promise<Response> {
      try {
        const aggregate = await readModelFor(dependencies).readOrganizerAggregate({
          eventId: access.eventId,
        });
        return NextResponse.json(success(toEventAnalyticsOrganizerResponse(aggregate)), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return analyticsErrorResponse(error, access.mode, "aggregate-only");
      }
    },
    dependencies.aggregateAccess,
  );
}

export function createEventAnalyticsAttendeeGetHandler(
  dependencies: EventAnalyticsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(
    async function getAttendeeEventAnalytics(
      _request: Request,
      _context: EventAnalyticsRouteContext,
      access,
    ): Promise<Response> {
      try {
        const report = await readModelFor(dependencies).readAttendeeReport({
          actorId: access.actor.id,
          eventId: access.eventId,
        });
        return NextResponse.json(success(toEventAnalyticsAttendeeResponse(report)), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return analyticsErrorResponse(error, access.mode, "self-evidence-only");
      }
    },
    dependencies.attendeeAccess,
  );
}
