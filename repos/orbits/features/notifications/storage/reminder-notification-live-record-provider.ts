import type {
  ConnectionDTO,
  ContactDTO,
  NotificationDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  LiveReminderNotificationGraph,
  LiveReminderScheduleNotificationProvider,
} from "../live-service";

export const REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  evidence: "evidence",
  notifications: "notifications",
  tasks: "tasks",
} as const;

export interface StorageReminderScheduleNotificationProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageReminderScheduleNotificationProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageReminderScheduleNotificationProvider {
  key: string;
  provider: LiveReminderScheduleNotificationProvider;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageReminderScheduleNotificationProvider
  | null = null;

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
  | NotificationDTO["source"]
  | TaskDTO["source"]
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

function notificationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): NotificationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(
      payload.channel === "in_app" ||
      payload.channel === "email" ||
      payload.channel === "calendar" ||
      payload.channel === "system"
    ) ||
    !nonEmptyString(payload.title) ||
    !nonEmptyString(payload.body) ||
    !(
      payload.status === "pending" ||
      payload.status === "sent" ||
      payload.status === "failed" ||
      payload.status === "dismissed"
    ) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    channel: payload.channel,
    title: payload.title,
    body: payload.body,
    status: payload.status,
    scheduledFor: optionalString(payload.scheduledFor),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
  };
}

function taskFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): TaskDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.title) ||
    !(
      payload.status === "open" ||
      payload.status === "scheduled" ||
      payload.status === "completed" ||
      payload.status === "dismissed"
    ) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    title: payload.title,
    status: payload.status,
    contactId: optionalString(payload.contactId),
    connectionId: optionalString(payload.connectionId),
    dueAt: optionalString(payload.dueAt),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
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
): Promise<LiveReminderNotificationGraph> {
  const [
    notificationRecords,
    taskRecords,
    contactRecords,
    connectionRecords,
    evidenceRecords,
  ] = await Promise.all([
    listCollection(
      store,
      workspaceId,
      REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS.notifications,
    ),
    listCollection(
      store,
      workspaceId,
      REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS.tasks,
    ),
    listCollection(
      store,
      workspaceId,
      REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS.contacts,
    ),
    listCollection(
      store,
      workspaceId,
      REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS.connections,
    ),
    listCollection(
      store,
      workspaceId,
      REMINDER_NOTIFICATION_LIVE_RECORD_COLLECTIONS.evidence,
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
    evidence: evidenceRecords.flatMap((record) => {
      const evidence = evidenceFromRecord(record);

      return evidence ? [evidence] : [];
    }),
    generatedAt: latestTimestamp([
      ...notificationRecords,
      ...taskRecords,
      ...contactRecords,
      ...connectionRecords,
      ...evidenceRecords,
    ]),
    notifications: notificationRecords.flatMap((record) => {
      const notification = notificationFromRecord(record);

      return notification ? [notification] : [];
    }),
    tasks: taskRecords.flatMap((record) => {
      const task = taskFromRecord(record);

      return task ? [task] : [];
    }),
  };
}

export function createStorageReminderScheduleNotificationProvider({
  source,
  sourceLabel = "Reminder notification shared live storage",
  store,
  workspaceId,
}: StorageReminderScheduleNotificationProviderOptions): LiveReminderScheduleNotificationProvider {
  return {
    source:
      source ?? `live-record-store:reminder-schedule-notification:${workspaceId}`,
    sourceLabel,
    readReminderNotificationGraph: () => readGraph(store, workspaceId),
  };
}

export function createConfiguredStorageReminderScheduleNotificationProvider({
  env,
  sourceLabel = "Reminder notification Postgres live storage",
}: ConfiguredStorageReminderScheduleNotificationProviderOptions = {}): LiveReminderScheduleNotificationProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const key = [
    config.connectionString,
    config.workspaceId,
    sourceLabel,
  ].join("\u0000");

  if (cachedDefaultProvider?.key === key) {
    return cachedDefaultProvider.provider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageReminderScheduleNotificationProvider({
    source: `postgres-live-record-store:reminder-schedule-notification:${config.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
