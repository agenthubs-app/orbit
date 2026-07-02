import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDashboardAggregateProvider } from "../live-service";

export interface LiveDashboardGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  events: readonly EventDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  tasks: readonly TaskDTO[];
}

export const DASHBOARD_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  events: "events",
  evidence: "evidence",
  tasks: "tasks",
} as const;

export interface StorageDashboardAggregateProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageDashboardAggregateProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageDashboardAggregateProvider {
  key: string;
  provider: LiveDashboardAggregateProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageDashboardAggregateProvider | null =
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
  | EventDTO["source"]
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

export function createStorageDashboardAggregateProvider({
  source,
  sourceLabel = "Dashboard shared live storage",
  store,
  workspaceId,
}: StorageDashboardAggregateProviderOptions): LiveDashboardAggregateProvider {
  return {
    source: source ?? `live-record-store:dashboard:${workspaceId}`,
    sourceLabel,
    async readDashboardGraph(): Promise<LiveDashboardGraph> {
      const [
        contactRecords,
        connectionRecords,
        eventRecords,
        taskRecords,
        evidenceRecords,
      ] = await Promise.all([
        store.listRecords({
          workspaceId,
          collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.contacts,
        }),
        store.listRecords({
          workspaceId,
          collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.connections,
        }),
        store.listRecords({
          workspaceId,
          collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.events,
        }),
        store.listRecords({
          workspaceId,
          collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.tasks,
        }),
        store.listRecords({
          workspaceId,
          collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.evidence,
        }),
      ]);

      return {
        connections: connectionRecords
          .map(connectionFromRecord)
          .filter((connection): connection is ConnectionDTO => connection !== null),
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        events: eventRecords
          .map(eventFromRecord)
          .filter((event): event is EventDTO => event !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...contactRecords,
          ...connectionRecords,
          ...eventRecords,
          ...taskRecords,
          ...evidenceRecords,
        ]),
        tasks: taskRecords
          .map(taskFromRecord)
          .filter((task): task is TaskDTO => task !== null),
      };
    },
  };
}

export function createConfiguredStorageDashboardAggregateProvider({
  env,
  sourceLabel = "Dashboard Postgres live storage",
}: ConfiguredStorageDashboardAggregateProviderOptions = {}): LiveDashboardAggregateProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined && sourceLabel === "Dashboard Postgres live storage";
  const cacheKey = `${config.connectionString}\u0000${config.workspaceId}`;

  if (canUseDefaultCache && cachedDefaultProvider?.key === cacheKey) {
    return cachedDefaultProvider.provider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageDashboardAggregateProvider({
    source: `postgres-live-record-store:dashboard:${config.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: config.workspaceId,
  });

  if (canUseDefaultCache) {
    cachedDefaultProvider = {
      key: cacheKey,
      provider,
    };
  }

  return provider;
}
