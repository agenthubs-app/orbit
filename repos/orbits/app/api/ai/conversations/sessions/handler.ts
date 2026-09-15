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
            sessions: [],
            items: [],
            nextCursor: null,
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
        const version = url.searchParams.get("v");
        const explicitV2 = version === "2";
        const requestedLimit = Number(url.searchParams.get("limit"));
        const limit = Math.max(
          1,
          Math.min(
            Number.isSafeInteger(requestedLimit) && requestedLimit > 0
              ? requestedLimit
              : explicitV2
                ? 20
                : 12,
            50,
          ),
        );
        const rawSessions = await provider.listSessions({ limit: 10_000 });
        const organizations = organizationStore
          ? await organizationStore.listSessionOrganizations(
              rawSessions.map((session) => session.id),
            )
          : new Map();
        const query = url.searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
        const groupId = url.searchParams.get("groupId");
        const pinned = url.searchParams.get("pinned");
        const sessions = rawSessions
          .map((session) => {
            const organization = organizations.get(session.id) ?? {
              customTitle: session.customTitle ?? null,
              groupId: null,
              pinned: session.pinned === true,
              revision: 0,
            };
            return {
              ...session,
              customTitle: organization.customTitle ?? undefined,
              organization,
              pinned: organization.pinned,
            };
          })
          .filter((session) => {
            if (
              groupId &&
              (groupId === "ungrouped"
                ? session.organization.groupId !== null
                : session.organization.groupId !== groupId)
            ) {
              return false;
            }
            if (pinned === "true" && !session.organization.pinned) return false;
            if (pinned === "false" && session.organization.pinned) return false;
            if (!query) return true;
            return [
              session.id,
              session.title,
              session.organization.customTitle,
              ...session.messages.map((message) => message.text),
            ]
              .filter((value): value is string => typeof value === "string")
              .join(" ")
              .toLocaleLowerCase()
              .includes(query);
          })
          .sort(
            (left, right) =>
              Number(right.organization.pinned) - Number(left.organization.pinned) ||
              right.createdAt.localeCompare(left.createdAt) ||
              left.id.localeCompare(right.id),
          );
        const cursor = url.searchParams.get("cursor");
        let start = 0;
        if (cursor) {
          try {
            const cursorId = Buffer.from(cursor, "base64url").toString("utf8");
            const cursorIndex = sessions.findIndex((session) => session.id === cursorId);
            start = cursorIndex >= 0 ? cursorIndex + 1 : sessions.length;
          } catch {
            start = sessions.length;
          }
        }
        const items = sessions.slice(start, start + limit);
        const nextCursor =
          start + limit < sessions.length && items.length > 0
            ? Buffer.from(items[items.length - 1].id).toString("base64url")
            : null;

        return NextResponse.json(
          success({
            sessions: explicitV2 ? items : sessions.slice(0, limit),
            items,
            nextCursor,
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
