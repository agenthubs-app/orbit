import { NextResponse } from "next/server";

import { aiSessionGroupCreateSchema } from "../../../../../shared/api-schema/ai-sessions";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode, type FeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { createOrbitAgentChatOrganizationStore } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-group-provider";
import {
  OrbitAgentChatOrganizationError,
  type OrbitAgentChatOrganizationStore,
} from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

export interface OrbitAgentChatGroupsHandlerDependencies {
  organizationStoreForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatOrganizationStore | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function errorResponse(mode: FeatureMode, error: unknown): Response {
  const appError =
    error instanceof AppError
      ? error
      : error instanceof OrbitAgentChatOrganizationError
        ? new AppError(
            error.code === "VALIDATION_ERROR" ? "VALIDATION_ERROR" : "CONFLICT",
            error.message,
          )
        : new AppError("INTERNAL_ERROR", "Unable to manage Orbit Agent chat groups.", {
            cause: error,
          });
  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(appError.code),
  });
}

export function createOrbitAgentChatGroupsHandlers(
  dependencies: OrbitAgentChatGroupsHandlerDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const storeForActor =
    dependencies.organizationStoreForActor ?? createOrbitAgentChatOrganizationStore;
  return {
    async GET(_request?: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      const store = storeForActor(mode, actor.id);
      if (!store) {
        return errorResponse(
          mode,
          new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat organization storage is not configured."),
        );
      }
      try {
        return NextResponse.json(success({ groups: await store.listGroups() }), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      } catch (error) {
        return errorResponse(mode, error);
      }
    },

    async POST(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      const store = storeForActor(mode, actor.id);
      if (!store) {
        return errorResponse(
          mode,
          new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat organization storage is not configured."),
        );
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        body = null;
      }
      const parsed = aiSessionGroupCreateSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(mode, new AppError("VALIDATION_ERROR", "A valid group is required."));
      }
      try {
        const group = await store.createGroup(parsed.data);
        return NextResponse.json(success({ group }), {
          headers: runtimeBoundaryHeaders(mode),
          status: 201,
        });
      } catch (error) {
        return errorResponse(mode, error);
      }
    },
  };
}
