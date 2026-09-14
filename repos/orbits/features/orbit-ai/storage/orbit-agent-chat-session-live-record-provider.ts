import { createHash } from "node:crypto";

import { aiSessionOriginSchema } from "../../../shared/api-schema/ai-sessions";
import type { StoredAiSessionOriginContract } from "../../../shared/contract/ai-sessions";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export const ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS = {
  messages: "orbit_agent_chat_messages",
  sessions: "orbit_agent_chat_sessions",
} as const;

export type OrbitAgentChatSessionMessageRole = "assistant" | "user";

export interface OrbitAgentChatSessionMessage
  extends Record<string, unknown> {
  id?: string;
  role: OrbitAgentChatSessionMessageRole;
  text: string;
}

export class OrbitAgentChatSessionWriteError extends Error {
  constructor(
    readonly code:
      | "SESSION_DELETED"
      | "SESSION_ORIGIN_IMMUTABLE"
      | "SESSION_SNAPSHOT_STALE",
  ) {
    super(
      code === "SESSION_DELETED"
        ? "Deleted session cannot be restored by a late save"
        : code === "SESSION_ORIGIN_IMMUTABLE"
          ? "Session origin is immutable after the first saved message"
        : "Stale session snapshot cannot replace newer history",
    );
  }
}

export interface OrbitAgentChatSessionSnapshot {
  createdAt: string;
  customTitle?: string;
  id: string;
  messageRevision?: number;
  messages: readonly OrbitAgentChatSessionMessage[];
  organization?: {
    customTitle: string | null;
    groupId: string | null;
    pinned: boolean;
    revision: number;
  };
  origin?: StoredAiSessionOriginContract | undefined;
  panel?: Record<string, unknown> | null;
  pinned?: boolean;
  title: string;
  updatedAt: string;
}

export interface OrbitAgentChatSessionProvider {
  source: string;
  sourceLabel: string;
  deleteSession: (sessionId: string) => Promise<boolean>;
  getSession: (
    sessionId: string,
  ) => Promise<OrbitAgentChatSessionSnapshot | null>;
  listSessions: (options?: {
    limit?: number;
  }) => Promise<readonly OrbitAgentChatSessionSnapshot[]>;
  upsertSession: (
    session: OrbitAgentChatSessionSnapshot,
  ) => Promise<OrbitAgentChatSessionSnapshot>;
}

export interface StorageOrbitAgentChatSessionProviderOptions {
  actorId: string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageOrbitAgentChatSessionProviderOptions {
  actorId: string;
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

const MAX_MESSAGE_TEXT_LENGTH = 12000;
const MAX_SESSION_TITLE_LENGTH = 120;
const DEFAULT_SESSION_LIST_LIMIT = 12;
const cachedDefaultProviders = new Map<
  string,
  OrbitAgentChatSessionProvider
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function orbitAgentChatSessionActorWorkspaceId(
  workspaceId: string,
  actorId: string,
): string {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Orbit Agent chat sessions require an authenticated actor");
  }

  return `${workspaceId}:actor:${encodeURIComponent(normalizedActorId)}`;
}

function validTimestamp(value: string): string {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeMessage(
  value: unknown,
): OrbitAgentChatSessionMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.role !== "user" && value.role !== "assistant") {
    return null;
  }

  const text = cleanString(value.text, MAX_MESSAGE_TEXT_LENGTH);
  if (!text) {
    return null;
  }

  return {
    ...cloneJson(value),
    role: value.role,
    text,
  };
}

export function normalizeOrbitAgentChatSessionSnapshot(
  value: unknown,
): OrbitAgentChatSessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = cleanString(value.id, 160);
  const createdAt = nonEmptyString(value.createdAt)
    ? validTimestamp(value.createdAt)
    : "";
  const title = cleanString(value.title, MAX_SESSION_TITLE_LENGTH);
  const customTitle = cleanString(value.customTitle, MAX_SESSION_TITLE_LENGTH);
  const updatedAt = nonEmptyString(value.updatedAt)
    ? validTimestamp(value.updatedAt)
    : "";
  const messages = Array.isArray(value.messages)
    ? value.messages.flatMap((message) => {
        const normalized = normalizeMessage(message);

        return normalized ? [normalized] : [];
      })
    : [];
  const messageRevision =
    typeof value.messageRevision === "number" &&
    Number.isSafeInteger(value.messageRevision) &&
    value.messageRevision >= messages.length
      ? value.messageRevision
      : messages.length;
  const parsedOrigin = aiSessionOriginSchema.safeParse(value.origin);

  if (!id || !title || !updatedAt || messages.length === 0) {
    return null;
  }

  return {
    createdAt: createdAt || updatedAt,
    customTitle: customTitle || undefined,
    id,
    messageRevision,
    messages,
    origin: parsedOrigin.success ? cloneJson(parsedOrigin.data) : undefined,
    panel: isRecord(value.panel) ? cloneJson(value.panel) : null,
    pinned: value.pinned === true,
    title,
    updatedAt,
  };
}

function messageRecordId(
  sessionId: string,
  message: OrbitAgentChatSessionMessage,
  index: number,
): string {
  const identity = message.id?.trim() || `legacy-index:${index}`;
  const digest = createHash("sha256")
    .update(JSON.stringify([sessionId, identity]))
    .digest("hex");
  return `${safeIdPart(sessionId)}:${digest}`;
}

function sourceIdFor(kind: "message" | "session", id: string): string {
  return `source:orbit-agent-chat:${kind}:${id}`;
}

function evidenceIdFor(kind: "message" | "session", id: string): string {
  return `evidence:orbit-agent-chat:${kind}:${id}`;
}

function firstUserMessage(
  messages: readonly OrbitAgentChatSessionMessage[],
): string {
  return messages.find((message) => message.role === "user")?.text ?? "";
}

function lastMessagePreview(
  messages: readonly OrbitAgentChatSessionMessage[],
): string {
  return messages[messages.length - 1]?.text ?? "";
}

function searchTextForSession(
  session: OrbitAgentChatSessionSnapshot,
): string {
  return [
    session.id,
    session.title,
    session.customTitle,
    firstUserMessage(session.messages),
    lastMessagePreview(session.messages),
    ...session.messages.map((message) => message.text),
  ]
    .filter(nonEmptyString)
    .join(" ");
}

function sessionRecord(input: {
  createdAt: string;
  session: OrbitAgentChatSessionSnapshot;
  sourceLabel: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const { session } = input;

  return {
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
    createdAt: input.createdAt,
    evidenceIds: [evidenceIdFor("session", session.id)],
    lifecycleState: "active",
    occurredAt: session.updatedAt,
    payload: {
      firstUserMessage: firstUserMessage(session.messages),
      createdAt: session.createdAt,
      customTitle: session.customTitle ?? null,
      id: session.id,
      lastMessagePreview: lastMessagePreview(session.messages),
      messageCount: session.messages.length,
      messageRevision: session.messageRevision ?? session.messages.length,
      origin: session.origin ?? null,
      panel: session.panel ?? null,
      pinned: session.pinned === true,
      title: session.title,
      updatedAt: session.updatedAt,
    },
    provider: "orbit-agent-chat-session",
    providerRecordId: session.id,
    recordId: session.id,
    searchText: searchTextForSession(session),
    sourceId: sourceIdFor("session", session.id),
    sourceLabel: input.sourceLabel,
    sourceType: "system",
    targetId: session.id,
    targetType: "conversation",
    updatedAt: session.updatedAt,
    workspaceId: input.workspaceId,
  };
}

function messageRecord(input: {
  createdAt: string;
  index: number;
  message: OrbitAgentChatSessionMessage;
  session: OrbitAgentChatSessionSnapshot;
  sourceLabel: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const recordId = messageRecordId(input.session.id, input.message, input.index);

  return {
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
    createdAt: input.createdAt,
    evidenceIds: [evidenceIdFor("message", recordId)],
    lifecycleState: "active",
    occurredAt: input.session.updatedAt,
    payload: {
      ...input.message,
      index: input.index,
      sessionId: input.session.id,
    },
    provider: "orbit-agent-chat-message",
    providerRecordId: recordId,
    recordId,
    searchText: [
      input.session.id,
      input.message.role,
      input.message.text,
    ].join(" "),
    sourceId: sourceIdFor("message", recordId),
    sourceLabel: input.sourceLabel,
    sourceType: "system",
    targetId: input.session.id,
    targetType: "conversation",
    updatedAt: input.session.updatedAt,
    workspaceId: input.workspaceId,
  };
}

function messageFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): OrbitAgentChatSessionMessage | null {
  const { index: _index, sessionId: _sessionId, ...message } = record.payload;

  return normalizeMessage(message);
}

function messageIndex(record: LiveRecord<Record<string, unknown>>): number {
  return typeof record.payload.index === "number"
    ? record.payload.index
    : Number.MAX_SAFE_INTEGER;
}

async function readMessages(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  sessionId: string,
): Promise<readonly OrbitAgentChatSessionMessage[]> {
  const records = await store.listRecords({
    collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
    targetId: sessionId,
    targetType: "conversation",
    workspaceId,
  });

  return [...records]
    .sort((left, right) => messageIndex(left) - messageIndex(right))
    .flatMap((record) => {
      const message = messageFromRecord(record);

      return message ? [message] : [];
    });
}

async function sessionFromRecord(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  record: LiveRecord<Record<string, unknown>>,
): Promise<OrbitAgentChatSessionSnapshot | null> {
  const payload = record.payload;
  const createdAt = nonEmptyString(payload.createdAt)
    ? validTimestamp(payload.createdAt)
    : record.createdAt;
  const id = nonEmptyString(payload.id) ? payload.id : record.recordId;
  const title = cleanString(payload.title, MAX_SESSION_TITLE_LENGTH);
  const customTitle = cleanString(
    payload.customTitle,
    MAX_SESSION_TITLE_LENGTH,
  );
  const updatedAt = nonEmptyString(payload.updatedAt)
    ? validTimestamp(payload.updatedAt)
    : record.updatedAt;
  const messages = await readMessages(store, workspaceId, id);

  const normalized = normalizeOrbitAgentChatSessionSnapshot({
    createdAt,
    customTitle,
    id,
    messageRevision: payload.messageRevision,
    messages,
    origin: payload.origin,
    panel: isRecord(payload.panel) ? payload.panel : null,
    pinned: payload.pinned === true,
    title,
    updatedAt,
  });
  return normalized
    ? {
        ...normalized,
        origin:
          normalized.origin ??
          {
            entryClient: "unknown",
            entryPointId: "legacy.unknown",
            firstSentText: null,
            firstUserMessageId: null,
            initialGroupId: null,
            kind: "legacy_unknown",
            recordedAt: null,
            references: [],
            schemaVersion: 1,
            template: null,
          },
      }
    : null;
}

export function createStorageOrbitAgentChatSessionProvider({
  actorId,
  source,
  sourceLabel = "Orbit Agent chat session live storage",
  store,
  workspaceId,
}: StorageOrbitAgentChatSessionProviderOptions): OrbitAgentChatSessionProvider {
  const actorWorkspaceId = orbitAgentChatSessionActorWorkspaceId(
    workspaceId,
    actorId,
  );

  return {
    source:
      source ??
      `live-record-store:orbit-agent-chat-session:${actorWorkspaceId}`,
    sourceLabel,

    async deleteSession(sessionId) {
      const deletedAt = new Date().toISOString();
      const activeSession = await store.getRecord({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        includeDeleted: true,
        recordId: sessionId,
        workspaceId: actorWorkspaceId,
      });
      const deletedSession = activeSession?.lifecycleState === "active"
        ? await store.deleteRecord({
            collectionName:
              ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
            deletedAt,
            recordId: sessionId,
            workspaceId: actorWorkspaceId,
          })
        : null;
      const messages = await store.listRecords({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
        includeDeleted: true,
        targetId: sessionId,
        targetType: "conversation",
        workspaceId: actorWorkspaceId,
      });

      await Promise.all(
        messages
          .filter((message) => message.lifecycleState !== "deleted")
          .map((message) =>
            store.deleteRecord({
              collectionName:
                ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
              deletedAt,
              recordId: message.recordId,
              workspaceId: actorWorkspaceId,
            }),
        ),
      );

      return Boolean(activeSession ?? deletedSession);
    },

    async getSession(sessionId) {
      const record = await store.getRecord({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        recordId: sessionId,
        workspaceId: actorWorkspaceId,
      });

      return record
        ? sessionFromRecord(store, actorWorkspaceId, record)
        : null;
    },

    async listSessions(options = {}) {
      const limit = Math.max(
        1,
        Math.min(options.limit ?? DEFAULT_SESSION_LIST_LIMIT, 10_000),
      );
      const records = await store.listRecords({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        workspaceId: actorWorkspaceId,
      });
      const sessions = await Promise.all(
        [...records]
          .sort(
            (left, right) =>
              Number(right.payload.pinned === true) -
                Number(left.payload.pinned === true) ||
              right.createdAt.localeCompare(left.createdAt),
          )
          .slice(0, limit)
          .map((record) =>
            sessionFromRecord(store, actorWorkspaceId, record),
          ),
      );

      return sessions.flatMap((session) => (session ? [session] : []));
    },

    async upsertSession(sessionInput) {
      let session = normalizeOrbitAgentChatSessionSnapshot(sessionInput);

      if (!session) {
        throw new Error("Invalid Orbit Agent chat session snapshot");
      }

      const existingSession = await store.getRecord({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        includeDeleted: true,
        recordId: session.id,
        workspaceId: actorWorkspaceId,
      });
      if (existingSession?.lifecycleState === "deleted") {
        throw new OrbitAgentChatSessionWriteError("SESSION_DELETED");
      }
      const existingSnapshot = existingSession
        ? await sessionFromRecord(store, actorWorkspaceId, existingSession)
        : null;
      if (
        existingSnapshot?.origin &&
        session.origin &&
        JSON.stringify(existingSnapshot.origin) !== JSON.stringify(session.origin)
      ) {
        throw new OrbitAgentChatSessionWriteError("SESSION_ORIGIN_IMMUTABLE");
      }
      if (existingSnapshot?.origin) {
        session = { ...session, origin: existingSnapshot.origin };
      }
      if (
        existingSnapshot &&
        (session.updatedAt < existingSnapshot.updatedAt ||
          session.messages.length < existingSnapshot.messages.length)
      ) {
        throw new OrbitAgentChatSessionWriteError("SESSION_SNAPSHOT_STALE");
      }
      const createdAt = existingSession?.createdAt ?? session.createdAt;
      await store.upsertRecord(
        sessionRecord({
          createdAt,
          session,
          sourceLabel,
          workspaceId: actorWorkspaceId,
        }),
      );

      await Promise.all(
        session.messages.map((message, index) => {
          return store.upsertRecord(
            messageRecord({
              createdAt,
              index,
              message,
              session,
              sourceLabel,
              workspaceId: actorWorkspaceId,
            }),
          );
        }),
      );

      const restoredRecord = await store.getRecord({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        recordId: session.id,
        workspaceId: actorWorkspaceId,
      });
      const restored = restoredRecord
        ? await sessionFromRecord(store, actorWorkspaceId, restoredRecord)
        : null;

      if (!restored) {
        throw new Error("Orbit Agent chat session upsert did not restore");
      }

      return restored;
    },
  };
}

export function createConfiguredStorageOrbitAgentChatSessionProvider({
  actorId,
  env,
  sourceLabel = "Orbit Agent chat session Postgres live storage",
}: ConfiguredStorageOrbitAgentChatSessionProviderOptions): OrbitAgentChatSessionProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const key = [
    config.connectionString,
    config.workspaceId,
    actorId.trim(),
    sourceLabel,
  ].join("\u0000");

  const cachedProvider = cachedDefaultProviders.get(key);
  if (cachedProvider) {
    return cachedProvider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId,
    source: `postgres-live-record-store:orbit-agent-chat-session:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProviders.set(key, provider);

  return provider;
}
