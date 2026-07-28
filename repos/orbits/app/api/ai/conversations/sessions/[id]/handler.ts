import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import type { OrbitAgentChatSessionProvider } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createOrbitAgentChatSessionProvider } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

export interface OrbitAgentChatSessionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export interface OrbitAgentChatSessionHandlerDependencies {
  providerForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatSessionProvider | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function responseForError(
  mode: FeatureMode,
  error: unknown,
  status?: number,
): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          "INTERNAL_ERROR",
          "Unable to read Orbit Agent chat session.",
          { cause: error },
        );

  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(mode),
    status: status ?? getHttpStatusForAppErrorCode(appError.code),
  });
}

export function createOrbitAgentChatSessionHandlers(
  dependencies: OrbitAgentChatSessionHandlerDependencies = {},
) {
  const resolveActor =
    dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const providerForActor =
    dependencies.providerForActor ?? createOrbitAgentChatSessionProvider;

  async function providerForRequest(mode: FeatureMode) {
    const actor = await resolveActor();

    return actor
      ? { actor, provider: providerForActor(mode, actor.id) }
      : null;
  }

  return {
    async DELETE(
      _request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);

      const { id } = await context.params;
      if (!resolved.provider) {
        return NextResponse.json(
          success({
            deleted: false,
            storage: { configured: false, persisted: false },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }

      try {
        const deleted = await resolved.provider.deleteSession(id);

        return NextResponse.json(
          success({
            deleted,
            storage: {
              configured: true,
              persisted: true,
              source: resolved.provider.source,
            },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      } catch (error) {
        return responseForError(mode, error);
      }
    },

    async GET(
      _request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);

      const { id } = await context.params;
      if (!resolved.provider) {
        return NextResponse.json(
          success({
            session: null,
            storage: { configured: false, persisted: false },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }

      try {
        const session = await resolved.provider.getSession(id);

        if (!session) {
          return responseForError(
            mode,
            new AppError(
              "NOT_FOUND",
              "Orbit Agent chat session was not found.",
            ),
          );
        }

        return NextResponse.json(
          success({
            session,
            storage: {
              configured: true,
              persisted: true,
              source: resolved.provider.source,
            },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      } catch (error) {
        return responseForError(mode, error);
      }
    },
  };
}
