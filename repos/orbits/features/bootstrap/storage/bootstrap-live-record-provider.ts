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
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

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
  readBootstrapGraphForAccount?: (
    accountId: string,
  ) => LiveAppBootstrapProviderResult<LiveAppBootstrapGraph>;
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
  sqlClient?: LiveRecordSqlClient;
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
  accountId?: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    limit: "unbounded",
    workspaceId,
    collectionName,
    userId: accountId,
  });
}

interface ProjectedBootstrapRow {
  collection_name: string;
  record_id: string;
  evidence_ids: readonly string[] | null;
  occurred_at: Date | string | null;
  lifecycle_state: string;
  created_at: Date | string;
  updated_at: Date | string;
  payload: Record<string, unknown> | string | null;
}

interface BootstrapRecordCollections {
  accounts: readonly LiveRecord<Record<string, unknown>>[];
  actions: readonly LiveRecord<Record<string, unknown>>[];
  connections: readonly LiveRecord<Record<string, unknown>>[];
  contacts: readonly LiveRecord<Record<string, unknown>>[];
  events: readonly LiveRecord<Record<string, unknown>>[];
  evidence: readonly LiveRecord<Record<string, unknown>>[];
  notifications: readonly LiveRecord<Record<string, unknown>>[];
  permissions: readonly LiveRecord<Record<string, unknown>>[];
  profiles: readonly LiveRecord<Record<string, unknown>>[];
  tasks: readonly LiveRecord<Record<string, unknown>>[];
}

const bootstrapProjectionCollections = Object.values(
  APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS,
);

const bootstrapProjectionSql = `
  select
    collection_name,
    record_id,
    evidence_ids,
    occurred_at,
    lifecycle_state,
    created_at,
    updated_at,
    case collection_name
      when 'accounts' then jsonb_build_object(
        'id', payload -> 'id',
        'name', payload -> 'name',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'profiles' then jsonb_build_object(
        'id', payload -> 'id',
        'accountId', payload -> 'accountId',
        'displayName', payload -> 'displayName',
        'role', payload -> 'role',
        'timezone', payload -> 'timezone',
        'headline', payload -> 'headline',
        'homeMarket', payload -> 'homeMarket',
        'preferredFollowUpWindow', payload -> 'preferredFollowUpWindow',
        'relationshipGoal', payload -> 'relationshipGoal',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'contacts' then jsonb_build_object(
        'id', payload -> 'id',
        'personId', payload -> 'personId',
        'displayName', payload -> 'displayName',
        'organization', payload -> 'organization',
        'role', payload -> 'role',
        'location', payload -> 'location',
        'primaryEmail', payload -> 'primaryEmail',
        'primaryPhone', payload -> 'primaryPhone',
        'profileSnippet', payload -> 'profileSnippet',
        'stage', payload -> 'stage',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'connections' then jsonb_build_object(
        'id', payload -> 'id',
        'accountId', payload -> 'accountId',
        'contactId', payload -> 'contactId',
        'stage', payload -> 'stage',
        'valueTypes', payload -> 'valueTypes',
        'summary', payload -> 'summary',
        'relationshipStrength', payload -> 'relationshipStrength',
        'trustLevel', payload -> 'trustLevel',
        'businessRelevanceScore', payload -> 'businessRelevanceScore',
        'sharedTopics', payload -> 'sharedTopics',
        'suggestedActions', payload -> 'suggestedActions',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'events' then jsonb_build_object(
        'id', payload -> 'id',
        'name', payload -> 'name',
        'location', payload -> 'location',
        'startsAt', payload -> 'startsAt',
        'endsAt', payload -> 'endsAt',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds'
      )
      when 'tasks' then jsonb_build_object(
        'id', payload -> 'id',
        'title', payload -> 'title',
        'status', payload -> 'status',
        'contactId', payload -> 'contactId',
        'connectionId', payload -> 'connectionId',
        'dueAt', payload -> 'dueAt',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'agentActions' then jsonb_build_object(
        'id', payload -> 'id',
        'type', payload -> 'type',
        'status', payload -> 'status',
        'confirmationRequired', payload -> 'confirmationRequired',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds',
        'createdAt', payload -> 'createdAt',
        'updatedAt', payload -> 'updatedAt'
      )
      when 'permissions' then jsonb_build_object(
        'id', payload -> 'id',
        'capability', payload -> 'capability',
        'state', payload -> 'state',
        'updatedAt', payload -> 'updatedAt',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds'
      )
      when 'notifications' then jsonb_build_object(
        'id', payload -> 'id',
        'channel', payload -> 'channel',
        'title', payload -> 'title',
        'body', payload -> 'body',
        'status', payload -> 'status',
        'scheduledFor', payload -> 'scheduledFor',
        'source', payload -> 'source',
        'evidenceIds', payload -> 'evidenceIds',
        'createdAt', payload -> 'createdAt'
      )
      when 'evidence' then jsonb_build_object('id', payload -> 'id')
    end as payload
  from orbit_records
  where workspace_id = $1
    and collection_name = any(__COLLECTIONS__::text[])
    and lifecycle_state <> 'deleted'
    __OWNER_FILTER__
  order by collection_name, coalesce(occurred_at, updated_at) desc, updated_at desc
`;

function timestampString(
  value: Date | string | null | undefined,
  fieldName: string,
): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`orbit_records.${fieldName} is required`);
}

function projectedBootstrapRecord(
  row: ProjectedBootstrapRow,
  workspaceId: string,
): LiveRecord<Record<string, unknown>> {
  const payload =
    typeof row.payload === "string"
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : row.payload && typeof row.payload === "object"
        ? row.payload
        : {};

  return {
    workspaceId,
    collectionName: row.collection_name,
    recordId: row.record_id,
    sourceType: "system",
    sourceId: row.record_id,
    evidenceIds: row.evidence_ids ? [...row.evidence_ids] : [],
    occurredAt: row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : row.occurred_at ?? null,
    createdAt: timestampString(row.created_at, "created_at"),
    updatedAt: timestampString(row.updated_at, "updated_at"),
    lifecycleState:
      row.lifecycle_state === "archived" ? "archived" : "active",
    payload,
  };
}

async function readProjectedBootstrapCollections(
  client: LiveRecordSqlClient,
  workspaceId: string,
  accountId?: string,
): Promise<BootstrapRecordCollections> {
  const hasOwnerFilter = accountId !== undefined;
  const collectionParameter = hasOwnerFilter ? 3 : 2;
  const values = hasOwnerFilter
    ? [workspaceId, accountId, bootstrapProjectionCollections]
    : [workspaceId, bootstrapProjectionCollections];
  const result = await client.query<ProjectedBootstrapRow>(
    bootstrapProjectionSql
      .replace("__COLLECTIONS__", `$${collectionParameter}`)
      .replace("__OWNER_FILTER__", hasOwnerFilter ? "and user_id = $2" : ""),
    values,
  );
  const collections = new Map<string, LiveRecord<Record<string, unknown>>[]>();

  for (const row of result.rows) {
    const records = collections.get(row.collection_name) ?? [];
    records.push(projectedBootstrapRecord(row, workspaceId));
    collections.set(row.collection_name, records);
  }

  return {
    accounts: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.accounts) ?? [],
    actions: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.actions) ?? [],
    connections: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.connections) ?? [],
    contacts: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.contacts) ?? [],
    events: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.events) ?? [],
    evidence: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.evidence) ?? [],
    notifications: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.notifications) ?? [],
    permissions: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.permissions) ?? [],
    profiles: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.profiles) ?? [],
    tasks: collections.get(APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.tasks) ?? [],
  };
}

export function createStorageAppBootstrapProvider({
  sqlClient,
  source,
  sourceLabel = "Bootstrap shared live storage",
  store,
  workspaceId,
}: StorageAppBootstrapProviderOptions): LiveAppBootstrapProvider {
  const inFlightReads = new Map<
    string | undefined,
    Promise<LiveAppBootstrapGraph>
  >();

  async function readGraph(accountId?: string): Promise<LiveAppBootstrapGraph> {
    if (sqlClient) {
      const existing = inFlightReads.get(accountId);
      if (existing) return existing;
    }

    const read = (async () => {
      const collections = sqlClient
        ? await readProjectedBootstrapCollections(sqlClient, workspaceId, accountId)
        : await (async (): Promise<BootstrapRecordCollections> => {
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
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.accounts, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.profiles, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.contacts, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.connections, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.events, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.tasks, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.actions, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.permissions, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.notifications, accountId),
              listCollection(store, workspaceId, APP_BOOTSTRAP_LIVE_RECORD_COLLECTIONS.evidence, accountId),
            ]);

            return {
              accounts: accountRecords,
              actions: actionRecords,
              connections: connectionRecords,
              contacts: contactRecords,
              events: eventRecords,
              evidence: evidenceRecords,
              notifications: notificationRecords,
              permissions: permissionRecords,
              profiles: profileRecords,
              tasks: taskRecords,
            };
          })();
      const {
        accounts: accountRecords,
        profiles: profileRecords,
        contacts: contactRecords,
        connections: connectionRecords,
        events: eventRecords,
        tasks: taskRecords,
        actions: actionRecords,
        permissions: permissionRecords,
        notifications: notificationRecords,
        evidence: evidenceRecords,
      } = collections;
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
    })();

    if (!sqlClient) return read;

    inFlightReads.set(accountId, read);
    const cleanup = () => {
      if (inFlightReads.get(accountId) === read) inFlightReads.delete(accountId);
    };
    void read.then(cleanup, cleanup);
    return read;
  }

  return {
    source: source ?? `live-record-store:app-bootstrap:${workspaceId}`,
    sourceLabel,
    readBootstrapGraph: () => readGraph(),
    readBootstrapGraphForAccount: (accountId) => readGraph(accountId),
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
    sqlClient: configuredStore.client,
    source: `postgres-live-record-store:app-bootstrap:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
