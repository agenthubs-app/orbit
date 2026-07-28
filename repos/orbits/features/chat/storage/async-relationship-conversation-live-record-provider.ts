import { randomUUID } from "node:crypto";

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
  connections: "connections",
  contacts: "contacts",
  conversations: "conversations",
  drafts: "relationshipConversationDrafts",
  messages: "messages",
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
  return (
    record.userId === actorId ||
    text(record.payload.actorId) === actorId ||
    text(record.payload.accountId) === actorId ||
    text(record.payload.userId) === actorId
  );
}

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({ collectionName, workspaceId });
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

async function readThreads(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  actorId: string,
): Promise<readonly StoredAsyncRelationshipThread[]> {
  const [
    connectionRecords,
    contactRecords,
    conversationRecords,
    draftRecords,
    messageRecords,
  ] = await Promise.all([
    listCollection(
      store,
      workspaceId,
      ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.connections,
    ),
    listCollection(
      store,
      workspaceId,
      ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.contacts,
    ),
    listCollection(
      store,
      workspaceId,
      ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.conversations,
    ),
    listCollection(
      store,
      workspaceId,
      ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.drafts,
    ),
    listCollection(
      store,
      workspaceId,
      ASYNC_RELATIONSHIP_CONVERSATION_COLLECTIONS.messages,
    ),
  ]);

  const actorConnections = connectionRecords.filter((record) =>
    recordBelongsToActor(record, actorId),
  );
  const allowedContactIds = new Set(
    actorConnections.map((record) => text(record.payload.contactId)).filter(Boolean),
  );
  const contactById = new Map(
    contactRecords
      .filter((record) => allowedContactIds.has(text(record.payload.id)))
      .map((record) => [text(record.payload.id), record.payload]),
  );
  const connectionByContactId = new Map(
    actorConnections.map((record) => [
      text(record.payload.contactId),
      record.payload,
    ]),
  );
  const stagedThreads = draftRecords
    .filter((record) => recordBelongsToActor(record, actorId))
    .map(stagedThreadFromRecord)
    .filter(
      (thread): thread is StoredAsyncRelationshipThread => thread !== null,
    );
  const stagedIds = new Set(
    stagedThreads.map((thread) => thread.conversationId),
  );
  const authorizedConversations = conversationRecords.filter((record) => {
    if (recordBelongsToActor(record, actorId)) {
      return true;
    }

    return stringArray(record.payload.participantContactIds).some((contactId) =>
      allowedContactIds.has(contactId),
    );
  });
  const authorizedConversationIds = new Set(
    authorizedConversations.map((record) => text(record.payload.id)).filter(Boolean),
  );
  const messagesByConversationId = new Map<
    string,
    LiveRecord<Record<string, unknown>>[]
  >();

  for (const record of messageRecords) {
    const conversationId = text(record.payload.conversationId);

    if (!authorizedConversationIds.has(conversationId)) {
      continue;
    }

    const records = messagesByConversationId.get(conversationId) ?? [];
    records.push(record);
    messagesByConversationId.set(conversationId, records);
  }

  const storedThreads = authorizedConversations.flatMap((record) => {
    const payload = record.payload;
    const conversationId = text(payload.id);

    if (!conversationId || stagedIds.has(conversationId)) {
      return [];
    }

    const contactId =
      stringArray(payload.participantContactIds).find((id) =>
        allowedContactIds.has(id),
      ) ?? text(payload.contactId);
    const contact = contactById.get(contactId);

    if (!contactId || !contact) {
      return [];
    }

    const participantName = text(contact.displayName) || contactId;
    const connection = connectionByContactId.get(contactId);
    const records = [...(messagesByConversationId.get(conversationId) ?? [])]
      .sort(
        (left, right) =>
          text(left.payload.occurredAt).localeCompare(
            text(right.payload.occurredAt),
          ) || left.recordId.localeCompare(right.recordId),
      );
    const messages = records.flatMap((messageRecord) => {
      const messagePayload = messageRecord.payload;
      const body = text(messagePayload.body);
      const occurredAt = text(messagePayload.occurredAt);

      if (!body || !occurredAt) {
        return [];
      }

      const inbound = text(messagePayload.direction) === "inbound";

      return [
        {
          body,
          evidenceIds: stringArray(messagePayload.evidenceIds),
          messageId: text(messagePayload.id) || messageRecord.recordId,
          occurredAt,
          senderName: inbound
            ? participantName
            : text(messagePayload.createdBy) || "我",
          senderRole: inbound ? ("contact" as const) : ("orbit_user" as const),
          sourceContextLabel:
            text(messageRecord.sourceLabel) ||
            text(payload.sourceLabel) ||
            "关系对话记录",
        },
      ];
    });

    if (messages.length === 0) {
      return [];
    }

    const latest = messages[messages.length - 1];
    const relationshipSummary =
      text(connection?.summary) ||
      text(contact.profileSnippet) ||
      `与${participantName}的关系对话。`;
    const sourceLabel =
      text(record.sourceLabel) ||
      text(payload.sourceLabel) ||
      "关系对话记录";

    return [
      {
        actorId,
        contactId,
        conversationId,
        evidenceIds: [
          ...new Set([
            ...stringArray(payload.evidenceIds),
            ...messages.flatMap((message) => message.evidenceIds),
          ]),
        ],
        messages,
        organization: text(contact.organization),
        participantName,
        relationshipSummary,
        sourceContextLabels: [sourceLabel],
        subject:
          text(payload.subject) || `与${participantName}的关系跟进`,
        updatedAt: latest?.occurredAt || text(payload.updatedAt),
      },
    ];
  });

  return [...stagedThreads, ...storedThreads].sort(
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
  const conversationId = `relationship-draft:${createId()}`;
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
