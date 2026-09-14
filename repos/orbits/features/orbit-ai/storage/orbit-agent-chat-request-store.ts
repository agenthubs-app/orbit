import { createHash } from "node:crypto";

import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
} from "../../../shared/storage/transactional-postgres";
import {
  ReliableSendError,
  createMemoryOrbitAgentChatRequestStore,
  type OrbitAgentChatRequestStore,
  type ReliableSendRequestRecord,
} from "../reliable-send-service";

const REQUEST_COLLECTION = "orbit_agent_chat_requests";
const SESSION_REVISION_COLLECTION = "orbit_agent_chat_session_revisions";
const mockStores = new Map<string, OrbitAgentChatRequestStore>();
const liveStores = new Map<string, OrbitAgentChatRequestStore>();

function requestRecordId(actorId: string, requestId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([actorId, requestId]))
    .digest("hex");
}

function sessionRevisionRecordId(actorId: string, sessionId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([actorId, sessionId]))
    .digest("hex");
}

export function createTransactionalOrbitAgentChatRequestStore(input: {
  actorId: string;
  client: TransactionalPostgresClient;
  now?: () => string;
  workspaceId: string;
}): OrbitAgentChatRequestStore {
  const actorId = input.actorId.trim();
  const now = input.now ?? (() => new Date().toISOString());

  async function runLocked<T>(
    lockKind: "request" | "session",
    lockId: string,
    operation: (
      store: LiveRecordStoreLike<Record<string, unknown>>,
    ) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await input.client.transaction(async (transaction) => {
          await transaction.query(
            "select pg_advisory_xact_lock(hashtextextended($1, 0))",
            [JSON.stringify(["orbit-agent", lockKind, input.workspaceId, actorId, lockId])],
          );
          return operation(
            createPostgresLiveRecordStore<Record<string, unknown>>({
              client: transaction,
            }),
          );
        });
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : null;
        if ((code === "40001" || code === "40P01") && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Orbit Agent request transaction retry exhausted");
  }

  async function read<TResult>(requestId: string) {
    const store = createPostgresLiveRecordStore<Record<string, unknown>>({
      client: input.client,
    });
    const record = await store.getRecord({
      collectionName: REQUEST_COLLECTION,
      includeDeleted: true,
      recordId: requestRecordId(actorId, requestId),
      workspaceId: input.workspaceId,
    });
    if (!record || record.userId !== actorId) return null;
    return record.payload as unknown as ReliableSendRequestRecord<TResult>;
  }

  async function write<TResult>(
    requestId: string,
    fingerprint: string,
    state: ReliableSendRequestRecord<TResult>["state"],
    result?: TResult,
    assistantMessage?: { id: string; text: string },
  ) {
    await runLocked("request", requestId, async (store) => {
      const recordId = requestRecordId(actorId, requestId);
      const existing = await store.getRecord({
        collectionName: REQUEST_COLLECTION,
        includeDeleted: true,
        recordId,
        workspaceId: input.workspaceId,
      });
      if (existing && existing.payload.fingerprint !== fingerprint) {
        throw new ReliableSendError("REQUEST_ID_REUSED");
      }
      const at = now();
      await store.upsertRecord({
        collectionName: REQUEST_COLLECTION,
        createdAt: existing?.createdAt ?? at,
        evidenceIds: [],
        lifecycleState: "active",
        payload: {
          assistantMessage,
          fingerprint,
          requestId,
          result,
          sessionId: existing?.payload.sessionId,
          state,
        },
        recordId,
        searchText: "",
        sourceId: `orbit-agent-request:${recordId}`,
        sourceType: "manual",
        updatedAt: at,
        userId: actorId,
        workspaceId: input.workspaceId,
      });
    });
  }

  return {
    complete: (requestId, fingerprint, result) =>
      write(requestId, fingerprint, "completed", result),
    get: read,
    markFailedBeforeExecution: (requestId, fingerprint) =>
      write(requestId, fingerprint, "failed_before_execution"),
    markOutcomeUnknown: (requestId, fingerprint, recovery) =>
      write(
        requestId,
        fingerprint,
        "outcome_unknown",
        recovery?.result,
        recovery?.assistantMessage,
      ),
    claimSessionRevision: (sessionId, expectedMessageRevision, requestId) =>
      runLocked("session", sessionId, async (store) => {
        const recordId = sessionRevisionRecordId(actorId, sessionId);
        const existing = await store.getRecord({
          collectionName: SESSION_REVISION_COLLECTION,
          includeDeleted: true,
          recordId,
          workspaceId: input.workspaceId,
        });
        const claimedRevision =
          typeof existing?.payload.claimedRevision === "number"
            ? existing.payload.claimedRevision
            : null;
        const existingRequestId =
          typeof existing?.payload.requestId === "string"
            ? existing.payload.requestId
            : null;
        if (
          claimedRevision !== null &&
          existingRequestId !== requestId &&
          expectedMessageRevision < claimedRevision
        ) {
          throw new ReliableSendError("SESSION_REVISION_CONFLICT");
        }
        const at = now();
        await store.upsertRecord({
          collectionName: SESSION_REVISION_COLLECTION,
          createdAt: existing?.createdAt ?? at,
          evidenceIds: [],
          lifecycleState: "active",
          payload: {
            claimedRevision: expectedMessageRevision + 1,
            requestId,
            sessionId,
          },
          recordId,
          searchText: "",
          sourceId: `orbit-agent-session-revision:${recordId}`,
          sourceType: "manual",
          updatedAt: at,
          userId: actorId,
          workspaceId: input.workspaceId,
        });
      }),
    reserve: (requestId, fingerprint, sessionId) =>
      runLocked("request", requestId, async (store) => {
        const recordId = requestRecordId(actorId, requestId);
        const existing = await store.getRecord({
          collectionName: REQUEST_COLLECTION,
          includeDeleted: true,
          recordId,
          workspaceId: input.workspaceId,
        });
        if (existing) {
          if (
            existing.userId !== actorId ||
            existing.payload.fingerprint !== fingerprint
          ) {
            throw new ReliableSendError("REQUEST_ID_REUSED");
          }
          if (existing.payload.state !== "failed_before_execution") {
            return "existing" as const;
          }
          const at = now();
          await store.upsertRecord({
            ...existing,
            payload: { ...existing.payload, state: "pending" },
            updatedAt: at,
          });
          return "started" as const;
        }
        const at = now();
        await store.upsertRecord({
          collectionName: REQUEST_COLLECTION,
          createdAt: at,
          evidenceIds: [],
          lifecycleState: "active",
          payload: { fingerprint, requestId, sessionId, state: "pending" },
          recordId,
          searchText: "",
          sourceId: `orbit-agent-request:${recordId}`,
          sourceType: "manual",
          updatedAt: at,
          userId: actorId,
          workspaceId: input.workspaceId,
        });
        return "started" as const;
      }),
  };
}

export function createOrbitAgentChatRequestStore(
  mode: FeatureMode,
  actorId: string,
): OrbitAgentChatRequestStore | null {
  const key = `${mode}\u0000${actorId.trim() || "mock:anonymous"}`;
  if (mode === "mock" || mode === "hybrid") {
    const existing = mockStores.get(key);
    if (existing) return existing;
    const created = createMemoryOrbitAgentChatRequestStore();
    mockStores.set(key, created);
    return created;
  }
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const existing = liveStores.get(key);
  if (existing) return existing;
  const created = createTransactionalOrbitAgentChatRequestStore({
    actorId,
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });
  liveStores.set(key, created);
  return created;
}
