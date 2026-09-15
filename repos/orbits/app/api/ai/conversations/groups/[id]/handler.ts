import { NextResponse } from "next/server";

import {
  aiSessionGroupDeleteSchema,
  aiSessionGroupMutationSchema,
} from "../../../../../../shared/api-schema/ai-sessions";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../../shared/api/envelope";
import { resolveFeatureMode, type FeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../../../shared/errors/app-error";
import { createOrbitAgentChatOrganizationStore } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-group-provider";
import {
  OrbitAgentChatOrganizationError,
  type OrbitAgentChatOrganizationStore,
} from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

export interface OrbitAgentChatGroupRouteContext {
  params: Promise<{ id: string }>;
}

export interface OrbitAgentChatGroupHandlerDependencies {
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
            error.code === "GROUP_NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "VALIDATION_ERROR"
                ? "VALIDATION_ERROR"
                : "CONFLICT",
            error.message,
          )
        : new AppError("INTERNAL_ERROR", "Unable to manage Orbit Agent chat group.", {
            cause: error,
          });
  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(appError.code),
  });
}

async function bodyFor(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createOrbitAgentChatGroupHandlers(
  dependencies: OrbitAgentChatGroupHandlerDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const storeForActor =
    dependencies.organizationStoreForActor ?? createOrbitAgentChatOrganizationStore;

  async function resolveStore(mode: FeatureMode) {
    const actor = await resolveActor();
    return actor ? storeForActor(mode, actor.id) : undefined;
  }

  return {
    async DELETE(request: Request, context: OrbitAgentChatGroupRouteContext): Promise<Response> {
      const mode = resolveFeatureMode();
      const store = await resolveStore(mode);
      if (store === undefined) return authenticatedApiActorRequiredResponse(mode);
      if (!store) {
        return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat organization storage is not configured."));
      }
      const parsed = aiSessionGroupDeleteSchema.safeParse(await bodyFor(request));
      if (!parsed.success) {
        return errorResponse(mode, new AppError("VALIDATION_ERROR", "A valid group deletion is required."));
      }
      try {
        const { id } = await context.params;
        return NextResponse.json(success(await store.deleteGroup(id, parsed.data)), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      } catch (error) {
        return errorResponse(mode, error);
      }
    },

    async PATCH(request: Request, context: OrbitAgentChatGroupRouteContext): Promise<Response> {
      const mode = resolveFeatureMode();
      const store = await resolveStore(mode);
      if (store === undefined) return authenticatedApiActorRequiredResponse(mode);
      if (!store) {
        return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat organization storage is not configured."));
      }
      const parsed = aiSessionGroupMutationSchema.safeParse(await bodyFor(request));
      if (!parsed.success) {
        return errorResponse(mode, new AppError("VALIDATION_ERROR", "A valid group update is required."));
      }
      try {
        const { id } = await context.params;
        return NextResponse.json(success({ group: await store.mutateGroup(id, parsed.data) }), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      } catch (error) {
        return errorResponse(mode, error);
      }
    },
  };
}
