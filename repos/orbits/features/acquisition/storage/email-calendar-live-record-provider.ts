import type {
  ContactDTO,
  ConversationDTO,
  MessageDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveEmailCalendarSignalGraph {
  contacts: readonly ContactDTO[];
  conversations: readonly ConversationDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  messages: readonly MessageDTO[];
}

export type LiveEmailCalendarSignalProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveEmailCalendarSignalProvider {
  source: string;
  sourceLabel: string;
  readEmailCalendarSignalGraph: () => LiveEmailCalendarSignalProviderResult<LiveEmailCalendarSignalGraph>;
}

export const EMAIL_CALENDAR_LIVE_RECORD_COLLECTIONS = {
  contacts: "contacts",
  conversations: "conversations",
  evidence: "evidence",
  messages: "messages",
} as const;

export interface StorageEmailCalendarSignalProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageEmailCalendarSignalProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

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
): ContactDTO["source"] | ConversationDTO["source"] | MessageDTO["source"] | null {
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

function conversationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConversationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
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
    participantContactIds: stringArray(payload.participantContactIds),
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

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
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
    workspaceId,
    collectionName,
  });
}

export function createStorageEmailCalendarSignalProvider({
  source,
  sourceLabel = "Email calendar signal shared live storage",
  store,
  workspaceId,
}: StorageEmailCalendarSignalProviderOptions): LiveEmailCalendarSignalProvider {
  return {
    source: source ?? `live-record-store:email-calendar-signals:${workspaceId}`,
    sourceLabel,
    async readEmailCalendarSignalGraph(): Promise<LiveEmailCalendarSignalGraph> {
      const [contactRecords, conversationRecords, evidenceRecords, messageRecords] =
        await Promise.all([
          listCollection(store, workspaceId, EMAIL_CALENDAR_LIVE_RECORD_COLLECTIONS.contacts),
          listCollection(store, workspaceId, EMAIL_CALENDAR_LIVE_RECORD_COLLECTIONS.conversations),
          listCollection(store, workspaceId, EMAIL_CALENDAR_LIVE_RECORD_COLLECTIONS.evidence),
          listCollection(store, workspaceId, EMAIL_CALENDAR_LIVE_RECORD_COLLECTIONS.messages),
        ]);

      return {
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        conversations: conversationRecords
          .map(conversationFromRecord)
          .filter(
            (conversation): conversation is ConversationDTO =>
              conversation !== null,
          ),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO =>
              evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...contactRecords,
          ...conversationRecords,
          ...evidenceRecords,
          ...messageRecords,
        ]),
        messages: messageRecords
          .map(messageFromRecord)
          .filter((message): message is MessageDTO => message !== null),
      };
    },
  };
}

export function createConfiguredStorageEmailCalendarSignalProvider({
  env,
  sourceLabel = "Email calendar signal Postgres live storage",
}: ConfiguredStorageEmailCalendarSignalProviderOptions = {}): LiveEmailCalendarSignalProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageEmailCalendarSignalProvider({
    source: `postgres-live-record-store:email-calendar-signals:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
