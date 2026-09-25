import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import { contactRecordOwnedByActor } from "../../contacts/storage/contact-read-authorization";
import {
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import { isIndustryIdCode } from "../../../shared/domain/industries";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDashboardAggregateProvider } from "../live-service";
import {
  buildDashboardSummaryFromGraph,
  createDashboardSummaryPostgresReader,
  DashboardSummaryRequiresGraphFallback,
} from "./dashboard-summary-postgres-reader";

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
  detailStates: "contact_detail_states",
  events: "events",
  evidence: "evidence",
  tasks: "tasks",
} as const;

export interface StorageDashboardAggregateProviderOptions {
  sqlClient?: LiveRecordSqlClient;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageDashboardAggregateProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface DashboardLiveReadScope {
  closed: boolean;
  graphReads: Map< object, Map<string, Promise<LiveDashboardGraph>>>;
}

const dashboardLiveReadScope = new AsyncLocalStorage<DashboardLiveReadScope>();

/**
 * Bind dashboard graph coalescing to one real request fan-out.  A provider
 * called without this scope deliberately does not reuse an in-flight read.
 */
export async function withDashboardLiveReadScope<TResult>(
  operation: () => TResult | Promise<TResult>,
): Promise<TResult> {
  const scope: DashboardLiveReadScope = {
    closed: false,
    graphReads: new Map(),
  };

  return dashboardLiveReadScope.run(scope, async () => {
    try {
      return await operation();
    } finally {
      scope.closed = true;
      scope.graphReads.clear();
    }
  });
}

function dashboardReadActorKey(accountId?: string): string {
  return accountId === undefined ? "\u0000unscoped" : `\u0001${accountId}`;
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
    primaryIndustryId: isIndustryIdCode(payload.primaryIndustryId)
      ? payload.primaryIndustryId
      : undefined,
    customTags: stringArray(payload.customTags),
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

interface ProjectedDashboardRow {
  collection_name: string;
  record_id: string;
  evidence_ids: readonly string[] | null;
  occurred_at: Date | string | null;
  lifecycle_state: string;
  created_at: Date | string;
  updated_at: Date | string;
  payload: Record<string, unknown> | string | null;
}

interface DashboardRecordCollections {
  connections: readonly LiveRecord<Record<string, unknown>>[];
  contacts: readonly LiveRecord<Record<string, unknown>>[];
  detailStates: readonly LiveRecord<Record<string, unknown>>[];
  events: readonly LiveRecord<Record<string, unknown>>[];
  evidence: readonly LiveRecord<Record<string, unknown>>[];
  tasks: readonly LiveRecord<Record<string, unknown>>[];
}

const dashboardProjectionCollections = Object.values(
  DASHBOARD_LIVE_RECORD_COLLECTIONS,
);

const dashboardProjectionSql = `
  select
    collection_name,
    record_id,
    evidence_ids,
    occurred_at,
    lifecycle_state,
    created_at,
    updated_at,
    case collection_name
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
        'primaryIndustryId', payload -> 'primaryIndustryId',
        'customTags', payload -> 'customTags',
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
      when 'evidence' then jsonb_build_object(
        'id', payload -> 'id',
        'sourceType', payload -> 'sourceType',
        'sourceId', payload -> 'sourceId',
        'summary', payload -> 'summary',
        'occurredAt', payload -> 'occurredAt',
        'confidence', payload -> 'confidence',
        'createdBy', payload -> 'createdBy'
      )
      when 'contact_detail_states' then jsonb_build_object(
        'contactId', payload -> 'contactId',
        'tags', payload -> 'tags'
      )
    end as payload
  from orbit_records
  where workspace_id = $1
    and collection_name = any(__COLLECTIONS__::text[])
    and lifecycle_state <> 'deleted'
    __OWNER_FILTER__
  order by collection_name, coalesce(occurred_at, updated_at) desc, updated_at desc
`;

function projectedDashboardRecord(
  row: ProjectedDashboardRow,
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

function timestampString(
  value: Date | string | null | undefined,
  fieldName: string,
): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`orbit_records.${fieldName} is required`);
}

async function readProjectedDashboardCollections(
  client: LiveRecordSqlClient,
  workspaceId: string,
  accountId?: string,
): Promise<DashboardRecordCollections> {
  const hasOwnerFilter = accountId !== undefined;
  const collectionParameter = hasOwnerFilter ? 3 : 2;
  const values = hasOwnerFilter
    ? [workspaceId, accountId, dashboardProjectionCollections]
    : [workspaceId, dashboardProjectionCollections];
  const result = await client.query<ProjectedDashboardRow>(
    dashboardProjectionSql
      .replace("__COLLECTIONS__", `$${collectionParameter}`)
      .replace("__OWNER_FILTER__", hasOwnerFilter ? `and user_id = $2
        and (collection_name <> 'contacts' or
          (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($2::text)))` : ""),
    values,
  );
  const collections = new Map<string, LiveRecord<Record<string, unknown>>[]>();

  for (const row of result.rows) {
    const records = collections.get(row.collection_name) ?? [];
    records.push(projectedDashboardRecord(row, workspaceId));
    collections.set(row.collection_name, records);
  }

  return {
    connections: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.connections) ?? [],
    contacts: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.contacts) ?? [],
    detailStates: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.detailStates) ?? [],
    events: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.events) ?? [],
    evidence: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.evidence) ?? [],
    tasks: collections.get(DASHBOARD_LIVE_RECORD_COLLECTIONS.tasks) ?? [],
  };
}

export function createStorageDashboardAggregateProvider({
  sqlClient,
  source,
  sourceLabel = "Dashboard shared live storage",
  store,
  workspaceId,
}: StorageDashboardAggregateProviderOptions): LiveDashboardAggregateProvider {
  const providerIdentity = {};
  const providerSource = source ?? `live-record-store:dashboard:${workspaceId}`;
  const summaryReader = sqlClient
    ? createDashboardSummaryPostgresReader({
        client: sqlClient,
        source: providerSource,
        sourceLabel,
        workspaceId,
      })
    : null;

  async function readGraph(accountId?: string): Promise<LiveDashboardGraph> {
    const scope = sqlClient ? dashboardLiveReadScope.getStore() : undefined;
    const providerReads = scope?.closed
      ? undefined
      : scope?.graphReads.get(providerIdentity);
    const actorKey = dashboardReadActorKey(accountId);
    const existing = providerReads?.get(actorKey);
    if (existing) return existing;

    const read = (async () => {
      const ownerQuery = accountId === undefined ? {} : { userId: accountId };
      const collections = sqlClient
        ? await readProjectedDashboardCollections(sqlClient, workspaceId, accountId)
        : await (async (): Promise<DashboardRecordCollections> => {
            const [
              contactRecords,
              connectionRecords,
              detailStateRecords,
              eventRecords,
              taskRecords,
              evidenceRecords,
            ] = await Promise.all([
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.contacts,
                ...ownerQuery,
              }),
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.connections,
                ...ownerQuery,
              }),
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.detailStates,
                ...ownerQuery,
              }),
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.events,
                ...ownerQuery,
              }),
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.tasks,
                ...ownerQuery,
              }),
              store.listRecords({
                limit: "unbounded",
                workspaceId,
                collectionName: DASHBOARD_LIVE_RECORD_COLLECTIONS.evidence,
                ...ownerQuery,
              }),
            ]);

            return {
              connections: connectionRecords,
              contacts: accountId === undefined ? contactRecords
                : contactRecords.filter(record => contactRecordOwnedByActor(record, accountId)),
              detailStates: detailStateRecords,
              events: eventRecords,
              evidence: evidenceRecords,
              tasks: taskRecords,
            };
          })();
      const {
        contacts: contactRecords,
        connections: connectionRecords,
        detailStates: detailStateRecords,
        events: eventRecords,
        tasks: taskRecords,
        evidence: evidenceRecords,
      } = collections;

    const customTagsByContactId = new Map<string, readonly string[]>();
    for (const record of detailStateRecords) {
      const contactId = optionalString(record.payload.contactId);
      if (contactId) customTagsByContactId.set(contactId, stringArray(record.payload.tags));
    }

      return {
      connections: connectionRecords
        .map(connectionFromRecord)
        .filter((connection): connection is ConnectionDTO => connection !== null),
      contacts: contactRecords
        .map(contactFromRecord)
        .filter((contact): contact is ContactDTO => contact !== null)
        .map((contact) => ({
          ...contact,
          customTags: customTagsByContactId.get(contact.id) ?? contact.customTags ?? [],
        })),
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
        ...detailStateRecords,
        ...eventRecords,
        ...taskRecords,
        ...evidenceRecords,
      ]),
      tasks: taskRecords
        .map(taskFromRecord)
        .filter((task): task is TaskDTO => task !== null),
      };
    })();

    if (!sqlClient) return read;

    if (!scope || scope.closed) return read;
    const scopedProviderReads = providerReads ?? new Map<string, Promise<LiveDashboardGraph>>();
    scope.graphReads.set(providerIdentity, scopedProviderReads);
    scopedProviderReads.set(actorKey, read);
    const cleanup = () => {
      if (scope.closed) return;
      if (scopedProviderReads.get(actorKey) === read) scopedProviderReads.delete(actorKey);
      if (scopedProviderReads.size === 0) scope.graphReads.delete(providerIdentity);
    };
    void read.then(cleanup, cleanup);
    return read;
  }

  const provider: LiveDashboardAggregateProvider = {
    source: providerSource,
    sourceLabel,
    readDashboardGraph() {
      return readGraph();
    },
    readDashboardGraphForAccount(accountId: string) {
      return readGraph(accountId);
    },
  };

  if (summaryReader) {
    provider.readDashboardSummaryForAccount = (accountId, scenario = "success") => {
      const scope = dashboardLiveReadScope.getStore();
      const providerReads = scope?.closed
        ? undefined
        : scope?.graphReads.get(providerIdentity);
      const existing = providerReads?.get(dashboardReadActorKey(accountId));
      if (existing) {
        return existing.then((graph) =>
          buildDashboardSummaryFromGraph(
            graph,
            providerSource,
            sourceLabel,
            scenario,
          ),
        );
      }
      return summaryReader.readForAccount(accountId, scenario).catch((error: unknown) => {
        if (!(error instanceof DashboardSummaryRequiresGraphFallback)) {
          throw error;
        }
        return readGraph(accountId).then((graph) =>
          buildDashboardSummaryFromGraph(
            graph,
            providerSource,
            sourceLabel,
            scenario,
          ),
        );
      });
    };
  }

  return provider;
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
    sqlClient: configuredStore.client,
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
