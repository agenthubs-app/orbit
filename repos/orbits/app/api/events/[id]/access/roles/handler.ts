import { NextResponse } from "next/server";

import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";
import { createConfiguredEventAccessDirectoryService } from "../../../../../../features/events/event-access/directory-runtime";
import type { EventAccessDirectoryService } from "../../../../../../features/events/event-access/directory-service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import { eventAccessDirectoryErrorToAppError } from "../../../access-directory-error";

export interface EventAccessRoleMembersRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventAccessRoleMembersRouteDependencies {
  createService?: () => EventAccessDirectoryService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

/** Lists current roles only for the Event Core owner of this exact event. */
export function createEventAccessRoleMembersGetHandler(
  dependencies: EventAccessRoleMembersRouteDependencies = {},
) {
  return async function eventAccessRoleMembersGetHandler(
    _request: Request,
    context: EventAccessRoleMembersRouteContext,
  ): Promise<Response> {
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
      const params = await context.params;
      const data = await service.listEventRoleMembers({
        actingActorId: actor.id,
        eventId: params.id,
      });
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
