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
import { aiSessionDeleteSchema, aiSessionOrganizationMutationSchema } from "../../../../../../shared/api-schema/ai-sessions";
import { createOrbitAgentChatOrganizationStore } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-group-provider";
import {
  OrbitAgentChatOrganizationError,
  type OrbitAgentChatOrganizationStore,
} from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import {
  OrbitAgentChatSessionCursorError,
  OrbitAgentChatSessionRevisionConflictError,
  type OrbitAgentChatSessionProvider,
} from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import {
  AI_SESSION_MESSAGE_PAGE_DEFAULT_LIMIT,
  AI_SESSION_MESSAGE_PAGE_MAX_LIMIT,
} from "../../../../../../shared/api-schema/ai-session-page";
import type { OrbitAgentChatRequestStore } from "../../../../../../features/orbit-ai/reliable-send-service";
import { createOrbitAgentChatRequestStore } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { createOrbitAgentChatSessionArtifactReader, type OrbitAgentChatSessionArtifactReader } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader";
import { createOrbitAgentChatSessionProvider } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";
import type { AgentResultDocument } from "../../../../../../shared/contract/agent-v1";
import { readAgentV1RequestDocument } from "../../../../../../features/agent-v1/entry/http";
import { configuredRecordAccess } from "../../../../../../features/agent-v1/domains/configured";
import { withholdRevokedAnswers, withholdRevokedDocument, type VisibleRefs } from "../../../../../../features/agent-v1/rollout/history-access";

export interface OrbitAgentChatSessionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export interface OrbitAgentChatSessionHandlerDependencies {
  artifactReaderForActor?: (mode: FeatureMode, actorId: string) => OrbitAgentChatSessionArtifactReader | null;
  providerForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatSessionProvider | null;
  organizationStoreForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatOrganizationStore | null;
  requestStoreForActor?: (
    mode: FeatureMode,
    actorId: string,
  ) => OrbitAgentChatRequestStore | null;
  /** agent-design AG01: the protocol-3 result document; null while ORBIT_AGENT_V1_MODE is off. */
  agentRequestReader?: (input: { mode: FeatureMode; actorId: string; requestId: string; sessionId: string }) => Promise<AgentResultDocument | null>;
  /** agent-design AG18-1: which typed record refs this account may read now (null: not checked, e.g. without a database). */
  visibleRefsForActor?: (actorId: string) => VisibleRefs | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function configuredVisibleRefs(actorId: string): VisibleRefs | null {
  const access = configuredRecordAccess();
  return access ? (refs) => access.visible(actorId, refs) : null;
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
  const organizationStoreForActor =
    dependencies.organizationStoreForActor ?? createOrbitAgentChatOrganizationStore;
  const requestStoreForActor =
    dependencies.requestStoreForActor ?? createOrbitAgentChatRequestStore;
  const artifactReaderForActor = dependencies.artifactReaderForActor ?? createOrbitAgentChatSessionArtifactReader;
  const agentRequestReader = dependencies.agentRequestReader ?? readAgentV1RequestDocument;
  const visibleRefsForActor = dependencies.visibleRefsForActor ?? configuredVisibleRefs;

  async function providerForRequest(mode: FeatureMode) {
    const actor = await resolveActor();

    return actor
      ? { actor, provider: providerForActor(mode, actor.id) }
      : null;
  }

  return {
    async DELETE(
      request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);

      const { id } = await context.params;
      if (!resolved.provider) {
        return responseForError(
          mode,
          new AppError(
            "SERVICE_UNAVAILABLE",
            "Orbit Agent chat history storage is not configured.",
          ),
        );
      }

      let body: unknown;
      try { body = await request.json(); } catch { body = null; }
      const parsed = aiSessionDeleteSchema.safeParse(body);
      if (!parsed.success) return responseForError(mode, new AppError("VALIDATION_ERROR", "A valid session revision is required for deletion."));
      const organizationStore = organizationStoreForActor(mode, resolved.actor.id);
      if (!organizationStore) return responseForError(mode, new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat organization storage is not configured."));

      try {
        const organization = await organizationStore.getSessionOrganization(id);
        if (organization.revision !== parsed.data.expectedRevision) {
          return responseForError(mode, new AppError("CONFLICT", "AI session changed before deletion."));
        }
        const deletion = await resolved.provider.deleteSessionWithUndo(id, parsed.data.expectedRevision);

        return NextResponse.json(
          success({
            ...deletion,
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
        if (error instanceof OrbitAgentChatSessionRevisionConflictError) {
          return responseForError(mode, new AppError("CONFLICT", error.message));
        }
        return responseForError(mode, error);
      }
    },

    async RESTORE(
      request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);
      if (!resolved.provider) return responseForError(mode, new AppError("SERVICE_UNAVAILABLE", "Orbit Agent chat history storage is not configured."));
      let body: unknown;
      try { body = await request.json(); } catch { body = null; }
      const undoToken = body && typeof body === "object" && "undoToken" in body ? body.undoToken : null;
      if (typeof undoToken !== "string" || !undoToken || undoToken.length > 200) {
        return responseForError(mode, new AppError("VALIDATION_ERROR", "A valid undo token is required."));
      }
      const { id } = await context.params;
      try {
        const restored = await resolved.provider.restoreDeletedSession(id, undoToken);
        if (!restored) return responseForError(mode, new AppError("CONFLICT", "This deletion can no longer be undone."));
        return NextResponse.json(success({ restored: true }), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      } catch (error) {
        return responseForError(mode, error);
      }
    },

    async GET(
      request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);

      const { id } = await context.params;
      // agent-design AG01 (GET conversation/request): the result document of a protocol-3
      // request, read the same way by every client. Only its owner gets it.
      const agentRequestId = new URL(request.url).searchParams.get("requestId")?.trim();
      const readDocument = agentRequestId
        ? await agentRequestReader({ actorId: resolved.actor.id, mode, requestId: agentRequestId, sessionId: id }).catch(() => null)
        : null;
      // AG18-1 (设计稿 §7 旧回答与撤权): checked online at every read; an answer from a record gone or withdrawn is not returned.
      const visible = visibleRefsForActor(resolved.actor.id);
      const agentRequest = readDocument && visible ? await withholdRevokedDocument(readDocument, visible).catch(() => readDocument) : readDocument;
      if (!resolved.provider) {
        return NextResponse.json(
          success({
            ...(agentRequest ? { agentRequest } : {}),
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
        // Sprint 0112: one page of messages (latest first; `cursor` goes back),
        // and cards only for the turns on that page.
        const params = new URL(request.url).searchParams;
        const rawLimit = params.get("limit");
        const limit = rawLimit === null ? AI_SESSION_MESSAGE_PAGE_DEFAULT_LIMIT : Number(rawLimit);
        const cursor = params.get("cursor");
        if (!/^\d+$/.test(rawLimit ?? String(limit)) || !Number.isSafeInteger(limit) || limit < 1 || limit > AI_SESSION_MESSAGE_PAGE_MAX_LIMIT
          || (cursor !== null && (!cursor || cursor.length > 8000))) {
          return responseForError(mode, new AppError("VALIDATION_ERROR", "Invalid AI session message page query."));
        }
        let sessionPage: Awaited<ReturnType<OrbitAgentChatSessionProvider["getSessionPage"]>>;
        try {
          sessionPage = await resolved.provider.getSessionPage(id, { cursor, limit });
        } catch (error) {
          if (error instanceof OrbitAgentChatSessionCursorError) {
            return responseForError(mode, new AppError("VALIDATION_ERROR", "Reload the latest messages of this AI session."));
          }
          throw error;
        }
        const storedSession = sessionPage?.session;

        if (!sessionPage || !storedSession) {
          // A protocol-3 request still queued has no session messages yet; its document is readable.
          if (agentRequest) {
            return NextResponse.json(
              success({ agentRequest, session: null, storage: { configured: true, persisted: true, source: resolved.provider.source } }),
              { headers: runtimeBoundaryHeaders(mode), status: 200 },
            );
          }
          return responseForError(
            mode,
            new AppError(
              "NOT_FOUND",
              "Orbit Agent chat session was not found.",
            ),
          );
        }
        const organizationStore = organizationStoreForActor(
          mode,
          resolved.actor.id,
        );
        const organization = organizationStore
          ? await organizationStore.getSessionOrganization(id)
          : {
              customTitle: storedSession.customTitle ?? null,
              groupId: null,
              pinned: storedSession.pinned === true,
              revision: 0,
            };
        const organized = {
          ...storedSession,
          customTitle: organization.customTitle ?? undefined,
          organization,
          pinned: organization.pinned,
        };
        const checked = visible ? await withholdRevokedAnswers(organized, visible).catch(() => null) : { session: organized, withheld: 0 };
        // The check could not be made: the messages are not returned as if they were still readable.
        if (!checked) return responseForError(mode, new AppError("SERVICE_UNAVAILABLE", "Access to this conversation's records could not be checked."));
        const session = checked.session;

        const requestId = new URL(request.url).searchParams.get("requestId")?.trim();
        const artifactReader = artifactReaderForActor(mode, resolved.actor.id);
        // A failed recovery must not erase the already authorized text history.
        const artifactRecovery = artifactReader
          ? await artifactReader.read(session, { precedingMessage: sessionPage.precedingMessage }).catch(() => ({ turns: [], truncated: false, unavailable: true }))
          : { turns: [], truncated: false };
        const requestRecord = requestId && !agentRequest
          ? await requestStoreForActor(mode, resolved.actor.id)?.get(requestId)
          : null;
        const reliableSend =
          requestId && requestRecord?.sessionId === id
            ? {
                protocolVersion: 2,
                replayed: true,
                requestId,
                result: requestRecord.result,
                sessionId: id,
                state: requestRecord.state,
              }
            : undefined;

        return NextResponse.json(
          success({
            ...(agentRequest ? { agentRequest } : {}),
            ...(reliableSend ? { reliableSend } : {}),
            artifactRecovery,
            page: sessionPage.page,
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

    async PATCH(
      request: Request,
      context: OrbitAgentChatSessionRouteContext,
    ): Promise<Response> {
      const mode = resolveFeatureMode();
      const resolved = await providerForRequest(mode);
      if (!resolved) return authenticatedApiActorRequiredResponse(mode);
      if (!resolved.provider) {
        return responseForError(
          mode,
          new AppError(
            "SERVICE_UNAVAILABLE",
            "Orbit Agent chat history storage is not configured.",
          ),
        );
      }
      const organizationStore = organizationStoreForActor(
        mode,
        resolved.actor.id,
      );
      if (!organizationStore) {
        return responseForError(
          mode,
          new AppError(
            "SERVICE_UNAVAILABLE",
            "Orbit Agent chat organization storage is not configured.",
          ),
        );
      }
      const { id } = await context.params;
      const session = await resolved.provider.getSession(id);
      if (!session) {
        return responseForError(
          mode,
          new AppError("NOT_FOUND", "Orbit Agent chat session was not found."),
        );
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        body = null;
      }
      const parsed = aiSessionOrganizationMutationSchema.safeParse(body);
      if (!parsed.success) {
        return responseForError(
          mode,
          new AppError("VALIDATION_ERROR", "A valid organization patch is required."),
        );
      }
      try {
        const organization = await organizationStore.mutateSessionOrganization(
          id,
          parsed.data,
        );
        return NextResponse.json(
          success({
            session: {
              ...session,
              customTitle: organization.customTitle ?? undefined,
              organization,
              pinned: organization.pinned,
            },
            storage: {
              configured: true,
              persisted: true,
              source: resolved.provider.source,
            },
          }),
          { headers: runtimeBoundaryHeaders(mode), status: 200 },
        );
      } catch (error) {
        if (error instanceof OrbitAgentChatOrganizationError) {
          const code =
            error.code === "GROUP_NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "VALIDATION_ERROR"
                ? "VALIDATION_ERROR"
                : error.code === "PIN_LIMIT"
                  ? "PIN_LIMIT"
                : "CONFLICT";
          return responseForError(mode, new AppError(code, error.message));
        }
        return responseForError(mode, error);
      }
    },
  };
}
