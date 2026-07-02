import type {
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  LiveChatAppendMessageInput,
  LiveChatConversationGraph,
  LiveChatConversationMessageProvider,
} from "../live-service";

export const CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  conversations: "conversations",
  messages: "messages",
} as const;

export interface StorageChatConversationMessageProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageChatConversationMessageProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageChatConversationMessageProvider {
  key: string;
  provider: LiveChatConversationMessageProvider;
}

interface ConfiguredStorageChatRecordStore {
  connectionString: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

interface CachedConfiguredStorageChatRecordStore {
  key: string;
  configuredStore: ConfiguredStorageChatRecordStore;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageChatConversationMessageProvider
  | null = null;
let cachedDefaultRecordStore: CachedConfiguredStorageChatRecordStore | null =
  null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
):
  | ConnectionDTO["source"]
  | ContactDTO["source"]
  | ConversationDTO["source"]
  | MessageDTO["source"]
  | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    stage: payload.stage,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function connectionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConnectionDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);
  const valueTypes = stringArray(payload.valueTypes).filter(isRelationshipValueType);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.contactId) ||
    !isRelationshipStage(payload.stage) ||
    !nonEmptyString(payload.summary) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    contactId: payload.contactId,
    stage: payload.stage,
    valueTypes,
    summary: payload.summary,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
    trustLevel: isRelationshipTrustLevel(payload.trustLevel)
      ? payload.trustLevel
      : undefined,
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function conversationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConversationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);
  const participantContactIds = stringArray(payload.participantContactIds);

  if (
    !nonEmptyString(payload.id) ||
    participantContactIds.length === 0 ||
    !(
      payload.channel === "email" ||
      payload.channel === "calendar" ||
      payload.channel === "chat" ||
      payload.channel === "note"
    ) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    participantContactIds,
    channel: payload.channel,
    source,
    evidenceIds: ids,
    updatedAt: payload.updatedAt,
  };
}

function messageFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): MessageDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.conversationId) ||
    !(
      payload.direction === "inbound" ||
      payload.direction === "outbound" ||
      payload.direction === "internal_note"
    ) ||
    !nonEmptyString(payload.body) ||
    !nonEmptyString(payload.occurredAt) ||
    !nonEmptyString(payload.createdBy) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    conversationId: payload.conversationId,
    direction: payload.direction,
    body: payload.body,
    occurredAt: payload.occurredAt,
    createdBy: payload.createdBy,
    source,
    evidenceIds: ids,
  };
}

function latestTimestamp(records: readonly LiveRecord<Record<string, unknown>>[]): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    collectionName,
    workspaceId,
  });
}

async function readGraph(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
): Promise<LiveChatConversationGraph> {
  const [conversationRecords, messageRecords, contactRecords, connectionRecords] =
    await Promise.all([
      listCollection(
        store,
        workspaceId,
        CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.conversations,
      ),
      listCollection(
        store,
        workspaceId,
        CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.messages,
      ),
      listCollection(
        store,
        workspaceId,
        CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.contacts,
      ),
      listCollection(
        store,
        workspaceId,
        CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.connections,
      ),
    ]);

  return {
    connections: connectionRecords.flatMap((record) => {
      const connection = connectionFromRecord(record);

      return connection ? [connection] : [];
    }),
    contacts: contactRecords.flatMap((record) => {
      const contact = contactFromRecord(record);

      return contact ? [contact] : [];
    }),
    conversations: conversationRecords.flatMap((record) => {
      const conversation = conversationFromRecord(record);

      return conversation ? [conversation] : [];
    }),
    generatedAt: latestTimestamp([
      ...conversationRecords,
      ...messageRecords,
      ...contactRecords,
      ...connectionRecords,
    ]),
    messages: messageRecords.flatMap((record) => {
      const message = messageFromRecord(record);

      return message ? [message] : [];
    }),
    profileId: "live-chat-conversation-service",
  };
}

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function nextMessageId(
  conversationId: string,
  messages: readonly MessageDTO[],
): string {
  const existing = new Set(messages.map((message) => message.id));
  const count = messages.filter(
    (message) => message.conversationId === conversationId,
  ).length;
  const prefix = `message_live_${safeIdPart(conversationId)}`;

  for (let offset = 1; offset < 10000; offset += 1) {
    const candidate = `${prefix}_${String(count + offset).padStart(4, "0")}`;

    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${prefix}_${Date.now()}`;
}

function messagePayload(input: {
  body: string;
  conversationId: string;
  evidenceIds: readonly [string, ...string[]];
  messageId: string;
  sentAt: string;
}): MessageDTO {
  return {
    id: input.messageId,
    conversationId: input.conversationId,
    direction: "outbound",
    body: input.body,
    occurredAt: input.sentAt,
    createdBy: "live-chat-conversation-service",
    source: {
      type: "system",
      id: `source:chat:live-send:${input.messageId}`,
      label: "Live chat conversation storage send",
    },
    evidenceIds: input.evidenceIds,
  };
}

function searchTextForMessage(message: MessageDTO): string {
  return [
    message.id,
    message.conversationId,
    message.direction,
    message.body,
    message.source.label,
    ...message.evidenceIds,
  ]
    .filter(nonEmptyString)
    .join(" ");
}

async function appendMessage(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  input: LiveChatAppendMessageInput,
): Promise<LiveChatConversationGraph> {
  const graph = await readGraph(store, workspaceId);
  const messageId = nextMessageId(input.conversationId, graph.messages);
  const ids =
    input.evidenceIds.length > 0
      ? ([input.evidenceIds[0], ...input.evidenceIds.slice(1)] as readonly [
          string,
          ...string[],
        ])
      : (["evidence:chat-live-send"] as const);
  const payload = messagePayload({
    body: input.body,
    conversationId: input.conversationId,
    evidenceIds: ids,
    messageId,
    sentAt: input.sentAt,
  });

  await store.upsertRecord({
    workspaceId,
    collectionName: CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.messages,
    recordId: messageId,
    sourceType: payload.source.type,
    sourceId: payload.source.id,
    sourceLabel: payload.source.label,
    provider: "orbit-live-chat-conversation-message",
    providerRecordId: messageId,
    evidenceIds: payload.evidenceIds,
    targetType: "message",
    targetId: messageId,
    occurredAt: payload.occurredAt,
    createdAt: payload.occurredAt,
    updatedAt: payload.occurredAt,
    lifecycleState: "active",
    searchText: searchTextForMessage(payload),
    payload: payload as unknown as Record<string, unknown>,
  });

  const conversationRecord = await store.getRecord({
    workspaceId,
    collectionName: CHAT_CONVERSATION_LIVE_RECORD_COLLECTIONS.conversations,
    recordId: input.conversationId,
  });

  if (conversationRecord) {
    await store.upsertRecord({
      ...conversationRecord,
      updatedAt: input.sentAt,
      payload: {
        ...conversationRecord.payload,
        updatedAt: input.sentAt,
      },
    });
  }

  return readGraph(store, workspaceId);
}

export function createStorageChatConversationMessageProvider({
  source,
  sourceLabel = "Chat conversation shared live storage",
  store,
  workspaceId,
}: StorageChatConversationMessageProviderOptions): LiveChatConversationMessageProvider {
  return {
    source: source ?? `live-record-store:chat-conversation-message:${workspaceId}`,
    sourceLabel,
    appendMessage: (input) => appendMessage(store, workspaceId, input),
    readChatGraph: () => readGraph(store, workspaceId),
  };
}

export function createConfiguredStorageChatRecordStore({
  env,
}: {
  env?: LiveDatabaseEnv;
} = {}): ConfiguredStorageChatRecordStore | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const key = [config.connectionString, config.workspaceId].join("\u0000");

  if (cachedDefaultRecordStore?.key === key) {
    return cachedDefaultRecordStore.configuredStore;
  }

  const configured = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configured) {
    return null;
  }

  const configuredStore: ConfiguredStorageChatRecordStore = {
    connectionString: config.connectionString,
    store: configured.store,
    workspaceId: configured.workspaceId,
  };

  cachedDefaultRecordStore = { key, configuredStore };

  return configuredStore;
}

export function createConfiguredStorageChatConversationMessageProvider({
  env,
  sourceLabel = "Chat conversation Postgres live storage",
}: ConfiguredStorageChatConversationMessageProviderOptions = {}): LiveChatConversationMessageProvider | null {
  const configuredStore = createConfiguredStorageChatRecordStore({ env });

  if (!configuredStore) {
    return null;
  }

  const key = [
    configuredStore.connectionString,
    configuredStore.workspaceId,
    sourceLabel,
  ].join("\u0000");

  if (cachedDefaultProvider?.key === key) {
    return cachedDefaultProvider.provider;
  }

  const provider = createStorageChatConversationMessageProvider({
    source: `postgres-live-record-store:chat-conversation-message:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
