import { NextResponse } from "next/server";

import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../../_shared/authenticated-actor";
import {
  EventCapabilityDeniedError,
  requireEventCapability,
} from "../../../../../../../features/events/event-access/guard";
import { EventAccessCommandError } from "../../../../../../../features/events/event-access/repository";
import type { EventAccessService } from "../../../../../../../features/events/event-access/service";
import {
  EventAccessRepositoryError,
  type EventAccessRepositoryErrorCode,
} from "../../../../../../../features/events/event-access/storage/postgres-repository";
import { createConfiguredEventAccessService } from "../../../../../../../features/events/event-access/runtime";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../../shared/errors/app-error";

type EventAccessRouteMethod = "GET" | "PUT" | "DELETE";

interface EventAccessRouteParams {
  id: string;
  subjectActorId: string;
}

export interface EventAccessRouteContext {
  params: Promise<EventAccessRouteParams>;
}

export interface EventAccessAssignmentRouteDependencies {
  createService?: () => EventAccessService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

const PUT_BODY_KEYS = ["expectedRevision", "reason", "role"] as const;
const DELETE_BODY_KEYS = ["expectedRevision", "reason"] as const;

function validationError(): AppError {
  return new AppError("VALIDATION_ERROR", "Request is invalid.");
}

async function readExactJsonBody(
  request: Request,
  expectedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw validationError();
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw validationError();
  }
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw validationError();
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => keys.includes(key))
  ) {
    throw validationError();
  }
  return input as Record<string, unknown>;
}

function repositoryErrorToAppError(
  code: EventAccessRepositoryErrorCode,
  cause: EventAccessRepositoryError,
): AppError {
  switch (code) {
    case "EVENT_ACCESS_NOT_READY":
    case "EVENT_ACCESS_REPOSITORY_FAILED":
      return new AppError(
        "SERVICE_UNAVAILABLE",
        "Event access is temporarily unavailable.",
        { cause },
      );
    case "EVENT_ACCESS_NOT_FOUND":
      return new AppError("NOT_FOUND", "Event was not found.", { cause });
    case "EVENT_ACCESS_FORBIDDEN":
      return new AppError("FORBIDDEN", "Event access is denied.", { cause });
    case "EVENT_ACCESS_CONFLICT":
      return new AppError(
        "CONFLICT",
        "Event access changed. Refresh and try again.",
        { cause },
      );
  }
}

function eventAccessErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof EventAccessCommandError) return validationError();
  if (error instanceof EventCapabilityDeniedError) {
    return new AppError("FORBIDDEN", "Event access is denied.", {
      cause: error,
    });
  }
  if (error instanceof EventAccessRepositoryError) {
    return repositoryErrorToAppError(error.code, error);
  }
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred.", {
    cause: error,
  });
}

export function createEventAccessAssignmentHandler(
  dependencies: EventAccessAssignmentRouteDependencies = {},
) {
  return async function eventAccessAssignmentHandler(
    request: Request,
    context: EventAccessRouteContext,
    method: EventAccessRouteMethod,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const service = (
        dependencies.createService ?? createConfiguredEventAccessService
      )();
      if (!service) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Event access is temporarily unavailable.",
        );
      }
      const params = await context.params;
      await requireEventCapability({
        actorId: actor.id,
        capability: "roles.manage",
        eventId: params.id,
        service,
      });

      if (method === "GET") {
        const data = await service.get({
          eventId: params.id,
          subjectActorId: params.subjectActorId,
        });
        return NextResponse.json(success(data), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      }

      const body = await readExactJsonBody(
        request,
        method === "PUT" ? PUT_BODY_KEYS : DELETE_BODY_KEYS,
      );
      const command = {
        ...body,
        actingActorId: actor.id,
        eventId: params.id,
        subjectActorId: params.subjectActorId,
      };
      const data =
        method === "PUT"
          ? await service.grant(command)
          : await service.revoke(command);
      return NextResponse.json(success(data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      const appError = eventAccessErrorToAppError(error);
      return NextResponse.json(failure(appError), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      });
    }
  };
}
