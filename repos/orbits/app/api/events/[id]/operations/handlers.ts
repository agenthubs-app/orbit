import { NextResponse } from "next/server";

import {
  EventOperationsError,
  type EventOperationsConfiguration,
  type EventOperationsTable,
} from "../../../../../features/events/event-operations/contract";
import { createConfiguredEventOperationsService } from "../../../../../features/events/event-operations/runtime";
import type { EventOperationsService } from "../../../../../features/events/event-operations/service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import type { OwnedEventAccessDependencies } from "../owned-event-access";
import {
  withRegisteredEventAccess,
  type RegisteredEventAccessDependencies,
} from "../registered-event-access";
import {
  isEventCapabilityAccessError,
  withEventCapabilityAccess,
  type EventCapabilityAccessDependencies,
} from "../event-capability-access";
import { toAttendeeOperationsResponse } from "./attendee-response";

interface EventOperationsRouteContext {
  params: Promise<{ id: string }>;
}

interface EventOperationsGenerationRouteContext {
  params: Promise<{ generationId: string; id: string }>;
}

interface EventOperationsContactRequestRouteContext {
  params: Promise<{ id: string; requestId: string }>;
}

export interface EventOperationsHandlerDependencies {
  createAccessService?: EventCapabilityAccessDependencies["createAccessService"];
  resolveActor?: EventCapabilityAccessDependencies["resolveActor"];
  createService?: () => EventOperationsService | null;
  ownedAccess?: OwnedEventAccessDependencies;
  registeredAccess?: RegisteredEventAccessDependencies;
}

function serviceFor(
  dependencies: EventOperationsHandlerDependencies,
): EventOperationsService {
  const service = (
    dependencies.createService ?? createConfiguredEventOperationsService
  )();
  if (!service) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Event operations storage is not configured.",
    );
  }
  return service;
}

function toAppError(error: unknown): AppError {
  if (!(error instanceof EventOperationsError)) {
    return error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "The event operation failed.", {
          cause: error,
        });
  }
  if (error.code === "EVENT_OPERATIONS_FORBIDDEN") {
    return new AppError("FORBIDDEN", error.message, { cause: error });
  }
  if (
    error.code === "EVENT_OPERATIONS_GENERATION_NOT_FOUND" ||
    error.code === "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND"
  ) {
    return new AppError("NOT_FOUND", error.message, { cause: error });
  }
  if (
    error.code === "EVENT_OPERATIONS_CONFIGURATION_INVALID"
  ) {
    return new AppError("VALIDATION_ERROR", error.message, { cause: error });
  }
  if (
    error.code === "EVENT_OPERATIONS_RESULTS_LOCKED" ||
    error.code === "EVENT_OPERATIONS_CHECK_IN_CLOSED" ||
    error.code === "EVENT_OPERATIONS_GENERATION_NOT_READY" ||
    error.code === "EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED" ||
    error.code === "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID"
  ) {
    return new AppError("CONFLICT", error.message, { cause: error });
  }
  if (
    error.code === "EVENT_OPERATIONS_AI_UNAVAILABLE" ||
    error.code === "EVENT_OPERATIONS_AI_TIMEOUT" ||
    error.code === "EVENT_OPERATIONS_AI_JSON_INVALID" ||
    error.code === "EVENT_OPERATIONS_AI_SCHEMA_INVALID" ||
    error.code === "EVENT_OPERATIONS_SHARD_FAILED" ||
    error.code === "EVENT_OPERATIONS_CONTACT_WRITE_FAILED" ||
    error.code === "EVENT_OPERATIONS_NOT_CONFIGURED"
  ) {
    return new AppError("SERVICE_UNAVAILABLE", error.message, { cause: error });
  }
  return new AppError("CONFLICT", error.message, { cause: error });
}

function errorResponse(error: unknown, mode: Parameters<typeof runtimeBoundaryHeaders>[0]) {
  const appError = toAppError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      eventOperationsCode:
        error instanceof EventOperationsError ? error.code : appError.code,
      privacy: "actor-and-event-scoped",
      service: "event-operations",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
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

function requiredText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("VALIDATION_ERROR", `${key} is required.`);
  }
  return value.trim();
}

function requiredPositiveInteger(
  body: Record<string, unknown>,
  key: string,
): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AppError("VALIDATION_ERROR", `${key} must be a positive integer.`);
  }
  return value;
}

function expectedRevision(
  body: Record<string, unknown>,
  options: { allowNull: boolean },
): number | null {
  const value = body.expectedRevision;
  if (options.allowNull && value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      options.allowNull
        ? "expectedRevision must be a positive integer or null."
        : "expectedRevision must be a positive integer.",
    );
  }
  return value;
}

export function createEventOperationsGetHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(async function getEventOperations(
    _request: Request,
    _context: EventOperationsRouteContext,
    access,
  ) {
    try {
      const workspace = await serviceFor(dependencies).attendeeWorkspace({
        actorId: access.actor.id,
        eventId: access.eventId,
      });
      return NextResponse.json(success(toAttendeeOperationsResponse(workspace)), {
        headers: runtimeBoundaryHeaders(access.mode),
      });
    } catch (error) {
      return errorResponse(error, access.mode);
    }
  }, dependencies.registeredAccess);
}

export function createEventOperationsCheckInPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(async function checkIn(
    _request: Request,
    _context: EventOperationsRouteContext,
    access,
  ) {
    try {
      const result = await serviceFor(dependencies).checkIn({
        actorId: access.actor.id,
        eventId: access.eventId,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 200,
      });
    } catch (error) {
      return errorResponse(error, access.mode);
    }
  }, dependencies.registeredAccess);
}

export function createEventOperationsContactRequestPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(async function createContactRequest(
    request: Request,
    _context: EventOperationsRouteContext,
    access,
  ) {
    try {
      const body = await jsonBody(request);
      const result = await serviceFor(dependencies).createContactRequest({
        actorId: access.actor.id,
        expectedRevision: expectedRevision(body, { allowNull: true }),
        eventId: access.eventId,
        targetParticipantId: requiredText(body, "targetParticipantId"),
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 201,
      });
    } catch (error) {
      return errorResponse(error, access.mode);
    }
  }, dependencies.registeredAccess);
}

export function createEventOperationsContactRequestResponsePostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(async function respondToContactRequest(
    request: Request,
    context: EventOperationsContactRequestRouteContext,
    access,
  ) {
    try {
      const body = await jsonBody(request);
      if (typeof body.accept !== "boolean") {
        throw new AppError("VALIDATION_ERROR", "accept must be a boolean.");
      }
      const params = await context.params;
      const result = await serviceFor(dependencies).respondToContactRequest({
        accept: body.accept,
        actorId: access.actor.id,
        expectedRevision: expectedRevision(body, { allowNull: false })!,
        eventId: access.eventId,
        requestId: params.requestId,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
      });
    } catch (error) {
      return errorResponse(error, access.mode);
    }
  }, dependencies.registeredAccess);
}

export function createEventOperationsContactRequestWithdrawPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withRegisteredEventAccess(async function withdrawContactRequest(
    request: Request,
    context: EventOperationsContactRequestRouteContext,
    access,
  ) {
    try {
      const body = await jsonBody(request);
      const params = await context.params;
      const result = await serviceFor(dependencies).withdrawContactRequest({
        actorId: access.actor.id,
        expectedRevision: expectedRevision(body, { allowNull: false })!,
        eventId: access.eventId,
        requestId: params.requestId,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
      });
    } catch (error) {
      return errorResponse(error, access.mode);
    }
  }, dependencies.registeredAccess);
}

export function createEventOperationsAdminGetHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "operations.read_sensitive",
    async function getAdminEventOperations(_request, _context, access) {
      try {
        const workspace = await serviceFor(dependencies).adminWorkspace({
          actorId: access.actor.id,
          eventId: access.eventId,
        });
        return NextResponse.json(success(workspace), {
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

export function createEventOperationsManualCheckInPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "check_in.roster.write",
    async function markParticipantArrived(
      request: Request,
      _context: EventOperationsRouteContext,
      access,
    ) {
      try {
        const body = await jsonBody(request);
        if (
          Object.keys(body).length !== 1 ||
          !Object.hasOwn(body, "participantId")
        ) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Manual check-in request must contain only participantId.",
          );
        }
        const result = await serviceFor(dependencies).checkInParticipant({
          actorId: access.actor.id,
          eventId: access.eventId,
          participantId: requiredText(body, "participantId"),
        });
        return NextResponse.json(success(result), {
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

export function createEventOperationsLimitedCheckInRosterGetHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "check_in.roster.read_limited",
    async function getLimitedCheckInRoster(_request, _context, access) {
      try {
        const roster = await serviceFor(
          dependencies,
        ).getLimitedCheckInRoster({
          actorId: access.actor.id,
          eventId: access.eventId,
        });
        return NextResponse.json(success(roster), {
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

export function createEventOperationsConfigurePutHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess(
    "operations.configure",
    async function configureEventOperations(
      request: Request,
      _context: EventOperationsRouteContext,
      access,
    ) {
      try {
        const body = await jsonBody(request);
        const configuration: Omit<
          EventOperationsConfiguration,
          "organizerActorId" | "updatedAt"
        > = {
          checkInOpensAt: requiredText(body, "checkInOpensAt"),
          eventEndsAt: requiredText(body, "eventEndsAt"),
          eventId: access.eventId,
          eventStartsAt: requiredText(body, "eventStartsAt"),
          maxAttemptsPerTask: requiredPositiveInteger(
            body,
            "maxAttemptsPerTask",
          ),
          profileEditDeadlineAt: requiredText(body, "profileEditDeadlineAt"),
          recommendationCount: requiredPositiveInteger(
            body,
            "recommendationCount",
          ),
          registrationCutoffAt: requiredText(body, "registrationCutoffAt"),
          resultsAvailableAt: requiredText(body, "resultsAvailableAt"),
          roundOneStartsAt: requiredText(body, "roundOneStartsAt"),
          roundTwoStartsAt: requiredText(body, "roundTwoStartsAt"),
          shardSize: requiredPositiveInteger(body, "shardSize"),
          tableSize: requiredPositiveInteger(body, "tableSize"),
        };
        const result = await serviceFor(dependencies).configure({
          actorId: access.actor.id,
          configuration,
        });
        return NextResponse.json(success(result), {
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

export function createEventOperationsGenerationStartPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess("generation.run", async function startGeneration(
    request: Request,
    _context: EventOperationsRouteContext,
    access,
  ) {
    try {
      const body = await jsonBody(request);
      const result = await serviceFor(dependencies).startGeneration({
        actorId: access.actor.id,
        eventId: access.eventId,
        idempotencyKey:
          typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 202,
      });
    } catch (error) {
      if (isEventCapabilityAccessError(error)) throw error;
      return errorResponse(error, access.mode);
    }
  }, {
    createAccessService: dependencies.createAccessService,
    resolveActor: dependencies.resolveActor,
  });
}

export function createEventOperationsGenerationRunPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess("generation.run", async function runGeneration(
    _request: Request,
    _context: EventOperationsGenerationRouteContext,
    access,
  ) {
    return errorResponse(
      new EventOperationsError(
        "EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED",
        "AI generations are executed only by the durable event-operations worker; poll generation progress instead.",
      ),
      access.mode,
    );
  }, {
    createAccessService: dependencies.createAccessService,
    resolveActor: dependencies.resolveActor,
  });
}

export function createEventOperationsGenerationRetryPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess("generation.run", async function retryGeneration(
    _request: Request,
    context: EventOperationsGenerationRouteContext,
    access,
  ) {
    try {
      const params = await context.params;
      const result = await serviceFor(dependencies).retryGeneration({
        actorId: access.actor.id,
        eventId: access.eventId,
        generationId: params.generationId,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
        status: 202,
      });
    } catch (error) {
      if (isEventCapabilityAccessError(error)) throw error;
      return errorResponse(error, access.mode);
    }
  }, {
    createAccessService: dependencies.createAccessService,
    resolveActor: dependencies.resolveActor,
  });
}

export function createEventOperationsGenerationPublishPostHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess("generation.publish", async function publishGeneration(
    _request: Request,
    context: EventOperationsGenerationRouteContext,
    access,
  ) {
    try {
      const params = await context.params;
      const result = await serviceFor(dependencies).publishGeneration({
        actorId: access.actor.id,
        eventId: access.eventId,
        generationId: params.generationId,
      });
      return NextResponse.json(success(result), {
        headers: runtimeBoundaryHeaders(access.mode),
      });
    } catch (error) {
      if (isEventCapabilityAccessError(error)) throw error;
      return errorResponse(error, access.mode);
    }
  }, {
    createAccessService: dependencies.createAccessService,
    resolveActor: dependencies.resolveActor,
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createEventOperationsExportGetHandler(
  dependencies: EventOperationsHandlerDependencies = {},
) {
  return withEventCapabilityAccess("attendees.export", async function exportEventOperations(
    _request: Request,
    _context: EventOperationsRouteContext,
    access,
  ) {
    try {
      const workspace = await serviceFor(dependencies).adminWorkspace({
        actorId: access.actor.id,
        eventId: access.eventId,
      });
      const checkIns = new Map(
        workspace.checkIns.map((checkIn) => [checkIn.participantId, checkIn]),
      );
      const published = workspace.publishedResult;
      const tableLookup = (round: readonly EventOperationsTable[]) =>
        new Map(
          round.flatMap((table) =>
            table.members.map((member) => [
              member.participantId,
              `${table.tableNumber}/${member.seat}`,
            ] as const),
          ),
        );
      const roundOne = tableLookup(published?.grouping.roundOne ?? []);
      const roundTwo = tableLookup(published?.grouping.roundTwo ?? []);
      const participants = published?.directory ?? workspace.participants;
      const rows = [
        [
          "generationId",
          "snapshotHash",
          "participantId",
          "displayName",
          "company",
          "industry",
          "profileCompleteness",
          "lateRegistration",
          "checkedInAt",
          "roundOneTableSeat",
          "roundTwoTableSeat",
        ],
        ...participants.map((participant) => [
          published?.generationId ?? "",
          published?.snapshotHash ?? "",
          participant.participantId,
          participant.displayName,
          participant.company,
          participant.industry,
          participant.profileCompleteness,
          participant.lateRegistration,
          checkIns.get(participant.participantId)?.checkedInAt ?? "",
          roundOne.get(participant.participantId) ?? "",
          roundTwo.get(participant.participantId) ?? "",
        ]),
      ];
      return new Response(
        rows.map((row) => row.map(csvCell).join(",")).join("\n"),
        {
          headers: {
            ...runtimeBoundaryHeaders(access.mode),
            "content-disposition": `attachment; filename="event-operations-${encodeURIComponent(access.eventId)}.csv"`,
            "content-type": "text/csv; charset=utf-8",
          },
        },
      );
    } catch (error) {
      if (isEventCapabilityAccessError(error)) throw error;
      return errorResponse(error, access.mode);
    }
  }, {
    createAccessService: dependencies.createAccessService,
    resolveActor: dependencies.resolveActor,
  });
}
