import { NextResponse } from "next/server";

import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";
import { createConfiguredEventAccessDirectoryService } from "../../../../features/events/event-access/directory-runtime";
import type { EventAccessDirectoryService } from "../../../../features/events/event-access/directory-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";
import { eventAccessDirectoryErrorToAppError } from "../access-directory-error";

export interface EventCenterRouteDependencies {
  createService?: () => EventAccessDirectoryService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

/**
 * The operations center intentionally reads only event-scoped authority: Event
 * Core ownership and active event-role assignments. It never queries a
 * workspace-global role collection.
 */
export function createEventCenterGetHandler(
  dependencies: EventCenterRouteDependencies = {},
) {
  return async function eventCenterGetHandler(): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const service = (
        dependencies.createService ?? createConfiguredEventAccessDirectoryService
      )();
      if (!service) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Event access is temporarily unavailable.",
        );
      }
      const data = await service.listAccessibleEvents({ actorId: actor.id });
      return NextResponse.json(success(data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      const appError = eventAccessDirectoryErrorToAppError(error);
      return NextResponse.json(failure(appError), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      });
    }
  };
}
