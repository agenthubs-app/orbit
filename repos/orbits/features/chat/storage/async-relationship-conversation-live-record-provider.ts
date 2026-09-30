import { createHash, randomUUID } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export const ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS = {
  drafts: "relationshipConversationDrafts",
} as const;

export interface StoredAsyncRelationshipMessage {
  body: string;
  evidenceIds: readonly string[];
  messageId: string;
  occurredAt: string;
  senderName: string;
  senderRole: "contact" | "orbit_user";
  sourceContextLabel: string;
}

export interface StoredAsyncRelationshipThread {
  actorId: string;
  contactId: string;
  conversationId: string;
  evidenceIds: readonly string[];
  messages: readonly StoredAsyncRelationshipMessage[];
  organization: string;
  participantName: string;
  relationshipSummary: string;
  sourceContextLabels: readonly string[];
  subject: string;
  updatedAt: string;
}

export interface SaveAsyncRelationshipDraftInput {
  actorId: string;
  actorDisplayName: string;
  body: string;
  contactId: string;
  organization: string;
  participantName: string;
  requestId?: string;
  sourceLabel: string;
  stagedAt: string;
  subject: string;
}

export interface LiveAsyncRelationshipConversationProvider {
  readThreads: (
    actorId: string,
  ) =>
    | readonly StoredAsyncRelationshipThread[]
    | Promise<readonly StoredAsyncRelationshipThread[]>;
  saveDraftThread: (
    input: SaveAsyncRelationshipDraftInput,
  ) =>
    | StoredAsyncRelationshipThread
    | Promise<StoredAsyncRelationshipThread>;
  source: string;
  sourceLabel: string;
}

export interface StorageAsyncRelationshipConversationProviderOptions {
  createId?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageAsyncRelationshipConversationProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredProvider {
  key: string;
  provider: LiveAsyncRelationshipConversationProvider;
}

let cachedConfiguredProvider: CachedConfiguredProvider | null = null;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}

function recordBelongsToActor(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): boolean {
  return record.userId === actorId && text(record.payload.actorId) === actorId;
}

function stagedThreadFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): StoredAsyncRelationshipThread | null {
  const payload = record.payload;
  const actorId = text(payload.actorId);
  const conversationId = text(payload.conversationId);
  const contactId = text(payload.contactId);
  const participantName = text(payload.participantName);
  const subject = text(payload.subject);
  const body = text(payload.body);
  const stagedAt = text(payload.stagedAt);
  const evidenceIds = stringArray(payload.evidenceIds);

  if (
    !actorId ||
    !conversationId ||
    !contactId ||
    !participantName ||
    !subject ||
    !body ||
    !stagedAt
  ) {
    return null;
  }

  const sourceLabel =
    text(payload.sourceLabel) || "Saved relationship draft";

  return {
    actorId,
    contactId,
    conversationId,
    evidenceIds,
    messages: [
      {
        body,
        evidenceIds,
        messageId: text(payload.messageId) || `${conversationId}:message:1`,
        occurredAt: stagedAt,
        senderName: text(payload.actorDisplayName) || "我",
        senderRole: "orbit_user",
        sourceContextLabel: sourceLabel,
      },
    ],
    organization: text(payload.organization),
    participantName,
    relationshipSummary:
      text(payload.relationshipSummary) ||
      `已保存一封发给${participantName}的内部草稿，尚未外发。`,
    sourceContextLabels: [sourceLabel],
    subject,
    updatedAt: stagedAt,
  };
}

// Staged draft threads are the only threads this inbox lists. The retired
// legacy chat collections (`conversations`/`messages`) are never read; real
// person-to-person conversations live in relationship communication.
export const STAGED_DRAFT_THREAD_LIST_LIMIT = 100;

async function readThreads(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  actorId: string,
): Promise<readonly StoredAsyncRelationshipThread[]> {
  const draftRecords = await store.listRecords({
    collectionName: ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.drafts,
    limit: STAGED_DRAFT_THREAD_LIST_LIMIT,
    targetType: "conversation",
    userId: actorId,
    workspaceId,
  });

  return draftRecords
    .filter((record) => recordBelongsToActor(record, actorId))
    .map(stagedThreadFromRecord)
    .filter(
      (thread): thread is StoredAsyncRelationshipThread => thread !== null,
    )
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.conversationId.localeCompare(right.conversationId),
    );
}

async function saveDraftThread(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  createId: () => string,
  input: SaveAsyncRelationshipDraftInput,
): Promise<StoredAsyncRelationshipThread> {
  const requestId = text(input.requestId);
  const conversationId = requestId
    ? `relationship-draft:${createHash("sha256")
        .update(`${input.actorId}\u0000${requestId}`)
        .digest("hex")
        .slice(0, 32)}`
    : `relationship-draft:${createId()}`;
  const existing = await store.getRecord({
    collectionName: ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.drafts,
    recordId: conversationId,
    workspaceId,
  });

  if (existing) {
    const stored = stagedThreadFromRecord(existing);
    if (stored && stored.actorId === input.actorId) {
      return stored;
    }
    throw new Error("Existing relationship draft failed ownership validation.");
  }

  const messageId = `${conversationId}:message:1`;
  const evidenceId = `evidence:${conversationId}`;
  const payload = {
    actorDisplayName: input.actorDisplayName,
    actorId: input.actorId,
    body: input.body,
    contactId: input.contactId,
    conversationId,
    evidenceIds: [evidenceId],
    messageId,
    organization: input.organization,
    participantName: input.participantName,
    requestId: requestId || null,
    relationshipSummary: `已保存一封发给${input.participantName}的内部草稿，尚未外发。`,
    sourceLabel: input.sourceLabel,
    stagedAt: input.stagedAt,
    subject: input.subject,
  };
  const record: LiveRecord<Record<string, unknown>> = {
    collectionName: ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.drafts,
    createdAt: input.stagedAt,
    evidenceIds: [evidenceId],
    lifecycleState: "active",
    occurredAt: input.stagedAt,
    payload,
    provider: "orbit-internal-draft-store",
    providerRecordId: conversationId,
    recordId: conversationId,
    searchText: [
      input.participantName,
      input.organization,
      input.subject,
      input.body,
    ].join(" "),
    sourceId: `source:${conversationId}`,
    sourceLabel: input.sourceLabel,
    sourceType: "manual",
    targetId: conversationId,
    targetType: "conversation",
    updatedAt: input.stagedAt,
    userId: input.actorId,
    workspaceId,
  };

  await store.upsertRecord(record);

  const stored = stagedThreadFromRecord(record);

  if (!stored) {
    throw new Error("Saved relationship draft failed validation.");
  }

  return stored;
}

export function createStorageAsyncRelationshipConversationProvider({
  createId = randomUUID,
  source,
  sourceLabel = "Actor-scoped relationship conversation storage",
  store,
  workspaceId,
}: StorageAsyncRelationshipConversationProviderOptions): LiveAsyncRelationshipConversationProvider {
  return {
    readThreads: (actorId) => readThreads(store, workspaceId, actorId),
    saveDraftThread: (input) =>
      saveDraftThread(store, workspaceId, createId, input),
    source:
      source ??
      `live-record-store:async-relationship-conversation:${workspaceId}`,
    sourceLabel,
  };
}

export function createConfiguredStorageAsyncRelationshipConversationProvider({
  env,
  sourceLabel = "Relationship conversation Postgres live storage",
}: ConfiguredStorageAsyncRelationshipConversationProviderOptions = {}): LiveAsyncRelationshipConversationProvider | null {
  const databaseConfig = resolveLiveDatabaseConnectionConfig(env);

  if (!databaseConfig) {
    return null;
  }

  const configured = createConfiguredPostgresLiveRecordStore({ env });

  if (!configured) {
    return null;
  }

  const key = [
    databaseConfig.connectionString,
    configured.workspaceId,
    sourceLabel,
  ].join("\u0000");

  if (cachedConfiguredProvider?.key === key) {
    return cachedConfiguredProvider.provider;
  }

  const provider = createStorageAsyncRelationshipConversationProvider({
    source: `postgres-live-record-store:async-relationship-conversation:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });

  cachedConfiguredProvider = { key, provider };

  return provider;
}
