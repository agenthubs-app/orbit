import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import {
  normalizeOrbitAgentChatSessionSnapshot,
  type OrbitAgentChatSessionProvider,
} from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createOrbitAgentChatSessionProvider } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

type JsonRecord = Record<string, unknown>;

export interface OrbitAgentChatSessionsHandlerDependencies {
  providerForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatSessionProvider | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
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
          "Unable to persist Orbit Agent chat sessions.",
          { cause: error },
        );

  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(mode),
    status: status ?? getHttpStatusForAppErrorCode(appError.code),
  });
}

export function createOrbitAgentChatSessionsHandlers(
  dependencies: OrbitAgentChatSessionsHandlerDependencies = {},
) {
  const resolveActor =
    dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const providerForActor =
    dependencies.providerForActor ?? createOrbitAgentChatSessionProvider;

  return {
    async GET(): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const provider = providerForActor(mode, actor.id);
      if (!provider) {
        return NextResponse.json(
          success({
            sessions: [],
            storage: { configured: false, persisted: false },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }

      try {
        const sessions = await provider.listSessions();

        return NextResponse.json(
          success({
            sessions,
            storage: {
              configured: true,
              persisted: true,
              source: provider.source,
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

    async POST(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const body = await readJsonBody(request);
      const session = normalizeOrbitAgentChatSessionSnapshot(
        isRecord(body.session) ? body.session : body,
      );

      if (!session) {
        return responseForError(
          mode,
          new AppError(
            "VALIDATION_ERROR",
            "A valid Orbit Agent chat session is required.",
          ),
        );
      }

      const provider = providerForActor(mode, actor.id);
      if (!provider) {
        return NextResponse.json(
          success({
            session,
            storage: { configured: false, persisted: false },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }

      try {
        const savedSession = await provider.upsertSession(session);

        return NextResponse.json(
          success({
            session: savedSession,
            storage: {
              configured: true,
              persisted: true,
              source: provider.source,
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
