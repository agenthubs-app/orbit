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
  OrbitAgentChatSessionWriteError,
  normalizeOrbitAgentChatSessionSnapshot,
  type OrbitAgentChatSessionProvider,
} from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createOrbitAgentChatSessionProvider } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import { createOrbitAgentChatOrganizationStore } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-group-provider";
import type { OrbitAgentChatOrganizationStore } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import {
  AiSessionReferenceAuthorizationError,
  authorizeAiSessionContactReferences,
} from "../../../../../features/orbit-ai/ai-session-reference-authorization";
import { createContactDetailTagStatusService } from "../../../../../features/contacts/service-factory";
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
  organizationStoreForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatOrganizationStore | null;
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
  const organizationStoreForActor =
    dependencies.organizationStoreForActor ?? createOrbitAgentChatOrganizationStore;

  return {
    async GET(
      request = new Request("https://orbit.local/api/ai/conversations/sessions"),
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);

      const provider = providerForActor(mode, actor.id);
      const organizationStore = organizationStoreForActor(mode, actor.id);
      if (!provider) {
        return NextResponse.json(
          success({
            items: [],
            nextCursor: null,
            hasMore: false,
            storage: { configured: false, persisted: false },
          }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      }

      try {
        const url = new URL(request.url);
        const params = url.searchParams;
        const allowed = new Set(["limit", "cursor", "q", "groupId", "pinned"]);
        if ([...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1)) {
          throw new AppError("VALIDATION_ERROR", "Invalid AI session page query.");
        }
        const limit = params.has("limit") ? Number(params.get("limit")) : 20;
        const rawPinned = params.get("pinned");
        const cursor = params.get("cursor");
        const q = params.get("q") ?? "";
        const groupId = params.get("groupId");
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || q.length > 240
          || (groupId !== null && groupId.length > 160)
          || (rawPinned !== null && rawPinned !== "true" && rawPinned !== "false")
          || (params.has("cursor") && (!cursor || cursor.length > 8000))) {
          throw new AppError("VALIDATION_ERROR", "Invalid AI session page query.");
        }
        const page = await provider.listSessionSummariesPage({
          cursor,
          groupId,
          limit,
          pinned: rawPinned === null ? null : rawPinned === "true",
          q,
        }, organizationStore
          ? (sessionIds) => organizationStore.listSessionOrganizations(sessionIds)
          : undefined);

        return NextResponse.json(
          success({ ...page, storage: { ...page.storage, source: provider.source } }),
          {
            headers: runtimeBoundaryHeaders(mode),
            status: 200,
          },
        );
      } catch (error) {
        if (error instanceof Error && ["SESSION_PAGE_INPUT_INVALID", "SESSION_PAGE_CURSOR_INVALID"].includes(error.message)) {
          return responseForError(mode, new AppError("VALIDATION_ERROR", "Reload the first AI session page."));
        }
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
        return responseForError(
          mode,
          new AppError(
            "SERVICE_UNAVAILABLE",
            "Orbit Agent chat history storage is not configured.",
          ),
        );
      }

      try {
        const references = session.messages.flatMap((message) => message.references ?? []);
        if (references.some((reference) => reference.type === "contact")) {
          await authorizeAiSessionContactReferences({
            actorId: actor.id,
            references,
            service: createContactDetailTagStatusService(),
          });
        }
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
        if (error instanceof AiSessionReferenceAuthorizationError) {
          return responseForError(
            mode,
            new AppError(
              error.code === "REFERENCE_NOT_ACCESSIBLE" ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
              error.message,
            ),
            error.code === "REFERENCE_NOT_ACCESSIBLE" ? 403 : 503,
          );
        }
        if (error instanceof OrbitAgentChatSessionWriteError) {
          return responseForError(
            mode,
            new AppError("CONFLICT", error.message),
            error.code === "SESSION_DELETED" ? 410 : 409,
          );
        }
        return responseForError(
          mode,
          error,
        );
      }
    },
  };
}
