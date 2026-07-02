import type {
  AccountDTO,
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  NotificationDTO,
  PermissionStateDTO,
  TaskDTO,
  UserProfileDTO,
} from "../../../shared/domain/contracts";
import {
  isPermissionState,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveAppBootstrapProfileRecord extends UserProfileDTO {
  headline?: string;
  homeMarket?: string;
  preferredFollowUpWindow?: string;
  relationshipGoal?: string;
}

export interface LiveAppBootstrapGraph {
  accounts: readonly AccountDTO[];
  actions: readonly AgentActionDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  events: readonly EventDTO[];
  evidenceIds: readonly string[];
  generatedAt: string;
  notifications: readonly NotificationDTO[];
  permissions: readonly PermissionStateDTO[];
  profiles: readonly LiveAppBootstrapProfileRecord[];
  tasks: readonly TaskDTO[];
}

export type LiveAppBootstrapProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveAppBootstrapProvider {
  source: string;
  sourceLabel: string;
  readBootstrapGraph: () => LiveAppBootstrapProviderResult<LiveAppBootstrapGraph>;
}

export const APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS = {
  accounts: "accounts",
  actions: "agentActions",
  connections: "connections",
  contacts: "contacts",
  events: "events",
  evidence: "evidence",
  notifications: "notifications",
  permissions: "permissions",
  profiles: "profiles",
  tasks: "tasks",
} as const;

export interface StorageAppBootstrapProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageAppBootstrapProviderOptions {
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
):
  | AgentActionDTO["source"]
  | ConnectionDTO["source"]
  | ContactDTO["source"]
  | EventDTO["source"]
  | NotificationDTO["source"]
  | PermissionStateDTO["source"]
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

function accountFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): AccountDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function profileFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveAppBootstrapProfileRecord | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    displayName: payload.displayName,
    role: optionalString(payload.role),
    timezone: optionalString(payload.timezone),
    headline: optionalString(payload.headline),
    homeMarket: optionalString(payload.homeMarket),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    relationshipGoal: optionalString(payload.relationshipGoal),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
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

function eventFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): EventDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.startsAt) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    location: optionalString(payload.location),
    startsAt: payload.startsAt,
    endsAt: optionalString(payload.endsAt),
    source,
    evidenceIds: ids,
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

function agentActionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): AgentActionDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(
      payload.type === "draft_message" ||
      payload.type === "schedule_reminder" ||
      payload.type === "prepare_intro" ||
      payload.type === "summarize_context"
    ) ||
    !(
      payload.status === "queued" ||
      payload.status === "awaiting_confirmation" ||
      payload.status === "approved" ||
      payload.status === "rejected" ||
      payload.status === "completed"
    ) ||
    typeof payload.confirmationRequired !== "boolean" ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    type: payload.type,
    status: payload.status,
    confirmationRequired: payload.confirmationRequired,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function permissionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): PermissionStateDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.capability) ||
    !isPermissionState(payload.state) ||
    !nonEmptyString(payload.updatedAt) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    capability: payload.capability,
    state: payload.state,
    updatedAt: payload.updatedAt,
    source,
    evidenceIds: ids,
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

function graphEvidenceIds(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly string[] {
  const ids = records.flatMap((record) => [
    ...(record.collectionName === APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.evidence &&
    nonEmptyString(record.payload.id)
      ? [record.payload.id]
      : []),
    ...record.evidenceIds,
  ]);

  return ids.length > 0
    ? [...new Set(ids)]
    : ["evidence:app-bootstrap-live-store-empty"];
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

export function createStorageAppBootstrapProvider({
  source,
  sourceLabel = "Bootstrap shared live storage",
  store,
  workspaceId,
}: StorageAppBootstrapProviderOptions): LiveAppBootstrapProvider {
  return {
    source: source ?? `live-record-store:app-bootstrap:${workspaceId}`,
    sourceLabel,
    async readBootstrapGraph(): Promise<LiveAppBootstrapGraph> {
      const [
        accountRecords,
        profileRecords,
        contactRecords,
        connectionRecords,
        eventRecords,
        taskRecords,
        actionRecords,
        permissionRecords,
        notificationRecords,
        evidenceRecords,
      ] = await Promise.all([
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.accounts),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.profiles),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.contacts),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.connections),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.events),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.tasks),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.actions),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.permissions),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.notifications),
        listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.evidence),
      ]);
      const records = [
        ...accountRecords,
        ...profileRecords,
        ...contactRecords,
        ...connectionRecords,
        ...eventRecords,
        ...taskRecords,
        ...actionRecords,
        ...permissionRecords,
        ...notificationRecords,
        ...evidenceRecords,
      ];

      return {
        accounts: accountRecords
          .map(accountFromRecord)
          .filter((account): account is AccountDTO => account !== null),
        actions: actionRecords
          .map(agentActionFromRecord)
          .filter((action): action is AgentActionDTO => action !== null),
        connections: connectionRecords
          .map(connectionFromRecord)
          .filter((connection): connection is ConnectionDTO => connection !== null),
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        events: eventRecords
          .map(eventFromRecord)
          .filter((event): event is EventDTO => event !== null),
        evidenceIds: graphEvidenceIds(records),
        generatedAt: latestTimestamp(records),
        notifications: notificationRecords
          .map(notificationFromRecord)
          .filter(
            (notification): notification is NotificationDTO =>
              notification !== null,
          ),
        permissions: permissionRecords
          .map(permissionFromRecord)
          .filter(
            (permission): permission is PermissionStateDTO =>
              permission !== null,
          ),
        profiles: profileRecords
          .map(profileFromRecord)
          .filter(
            (profile): profile is LiveAppBootstrapProfileRecord =>
              profile !== null,
          ),
        tasks: taskRecords
          .map(taskFromRecord)
          .filter((task): task is TaskDTO => task !== null),
      };
    },
  };
}

export function createConfiguredStorageAppBootstrapProvider({
  env,
  sourceLabel = "Bootstrap Postgres live storage",
}: ConfiguredStorageAppBootstrapProviderOptions = {}): LiveAppBootstrapProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageAppBootstrapProvider({
    source: `postgres-live-record-store:app-bootstrap:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
