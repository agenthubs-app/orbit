import type {
  RelationshipStage,
  SourceReferenceDTO,
} from "../../../shared/domain/source-types";
import {
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

// A matching account alias is consistency metadata, never an independent grant.
// Followup tasks/connections require the persisted row owner to match the actor.
export const RELATIONSHIP_LIFECYCLE_FACTS_CTES = `
with actor_tasks as materialized (
  select r.*
  from orbit_records r
  where r.workspace_id = $1
    and r.collection_name = 'tasks'
    and r.lifecycle_state <> 'deleted'
    and r.user_id = $2
    and (r.payload -> 'accountId' is null or r.payload -> 'accountId' = 'null'::jsonb or r.payload -> 'accountId' = to_jsonb($2::text))
),
actor_connections as materialized (
  select r.*
  from orbit_records r
  where r.workspace_id = $1
    and r.collection_name = 'connections'
    and r.lifecycle_state <> 'deleted'
    and r.user_id = $2
    and (r.payload -> 'accountId' is null or r.payload -> 'accountId' = 'null'::jsonb or r.payload -> 'accountId' = to_jsonb($2::text))
),
referenced_connection_ids as materialized (
  select distinct r.payload -> 'connectionId' as connection_id
  from actor_tasks r
  where jsonb_typeof(r.payload -> 'connectionId') = 'string'
),
selected_connections as materialized (
  select c.*
  from actor_connections c
  where jsonb_typeof(c.payload -> 'id') = 'string'
    and coalesce((c.payload -> 'id' in (
      select referenced.connection_id
      from referenced_connection_ids referenced
    )), false)
),
task_contact_ids as materialized (
  select distinct r.payload -> 'contactId' as contact_id
  from actor_tasks r
  where jsonb_typeof(r.payload -> 'contactId') = 'string'
),
selected_connection_contact_ids as materialized (
  select distinct r.payload -> 'contactId' as contact_id
  from selected_connections r
  where jsonb_typeof(r.payload -> 'contactId') = 'string'
),
needed_contact_ids as materialized (
  select contact_id from task_contact_ids
  union
  select contact_id from selected_connection_contact_ids
),
actor_connection_contact_ids as materialized (
  select distinct c.payload -> 'contactId' as contact_id
  from actor_connections c
  where jsonb_typeof(c.payload -> 'contactId') = 'string'
),
selected_contacts as materialized (
  select
    c.*,
    coalesce(c.user_id = $2, false) as contact_actor_owned,
    coalesce((c.payload -> 'id' in (
      select authorized.contact_id
      from actor_connection_contact_ids authorized
    )), false) as connection_authorized
  from orbit_records c
  where c.workspace_id = $1
    and c.collection_name = 'contacts'
    and c.lifecycle_state <> 'deleted'
    and jsonb_typeof(c.payload -> 'id') = 'string'
    and coalesce((c.payload -> 'id' in (
      select needed.contact_id
      from needed_contact_ids needed
    )), false)
    and (
      coalesce(c.user_id = $2, false)
      or coalesce((c.payload -> 'id' in (
        select authorized.contact_id
        from actor_connection_contact_ids authorized
      )), false)
    )
),
task_projection as (
  select
    jsonb_build_object(
      'kind', 'task',
      'metadata', jsonb_build_object(
        'workspaceId', r.workspace_id,
        'collectionName', r.collection_name,
        'recordId', r.record_id,
        'userId', r.user_id,
        'lifecycleState', r.lifecycle_state,
        'occurredAt', to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'createdAt', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'authorization', jsonb_build_object(
        'actorOwned', (
          coalesce(r.user_id = $2, false)
          and (r.payload -> 'accountId' is null or r.payload -> 'accountId' = 'null'::jsonb or r.payload -> 'accountId' = to_jsonb($2::text))
        ),
        'connectionAuthorized', false
      ),
      'id', r.payload -> 'id',
      'title', r.payload -> 'title',
      'status', r.payload -> 'status',
      'contactId', r.payload -> 'contactId',
      'connectionId', r.payload -> 'connectionId',
      'dueAt', r.payload -> 'dueAt',
      'source', jsonb_build_object(
        'type', r.payload -> 'source' -> 'type',
        'id', r.payload -> 'source' -> 'id',
        'label', r.payload -> 'source' -> 'label'
      ),
      'evidenceIds', r.payload -> 'evidenceIds',
      'createdAt', r.payload -> 'createdAt',
      'updatedAt', r.payload -> 'updatedAt'
    ) as value,
    coalesce(r.occurred_at, r.updated_at) as sort_occurred_at,
    r.updated_at as sort_updated_at,
    r.record_id as sort_record_id
  from actor_tasks r
),
connection_projection as (
  select
    jsonb_build_object(
      'kind', 'connection',
      'metadata', jsonb_build_object(
        'workspaceId', r.workspace_id,
        'collectionName', r.collection_name,
        'recordId', r.record_id,
        'userId', r.user_id,
        'lifecycleState', r.lifecycle_state,
        'occurredAt', to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'createdAt', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'authorization', jsonb_build_object(
        'actorOwned', (
          coalesce(r.user_id = $2, false)
          and (r.payload -> 'accountId' is null or r.payload -> 'accountId' = 'null'::jsonb or r.payload -> 'accountId' = to_jsonb($2::text))
        ),
        'connectionAuthorized', false
      ),
      'id', r.payload -> 'id',
      'accountId', r.payload -> 'accountId',
      'contactId', r.payload -> 'contactId',
      'stage', r.payload -> 'stage',
      'summary', r.payload -> 'summary',
      'source', jsonb_build_object(
        'type', r.payload -> 'source' -> 'type',
        'id', r.payload -> 'source' -> 'id',
        'label', r.payload -> 'source' -> 'label'
      ),
      'evidenceIds', r.payload -> 'evidenceIds',
      'createdAt', r.payload -> 'createdAt',
      'updatedAt', r.payload -> 'updatedAt'
    ) as value,
    coalesce(r.occurred_at, r.updated_at) as sort_occurred_at,
    r.updated_at as sort_updated_at,
    r.record_id as sort_record_id
  from selected_connections r
),
contact_projection as (
  select
    jsonb_build_object(
      'kind', 'contact',
      'metadata', jsonb_build_object(
        'workspaceId', r.workspace_id,
        'collectionName', r.collection_name,
        'recordId', r.record_id,
        'userId', r.user_id,
        'lifecycleState', r.lifecycle_state,
        'occurredAt', to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'createdAt', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'authorization', jsonb_build_object(
        'actorOwned', r.contact_actor_owned,
        'connectionAuthorized', r.connection_authorized
      ),
      'id', r.payload -> 'id',
      'displayName', r.payload -> 'displayName',
      'organization', r.payload -> 'organization',
      'stage', r.payload -> 'stage',
      'source', jsonb_build_object(
        'type', r.payload -> 'source' -> 'type',
        'id', r.payload -> 'source' -> 'id',
        'label', r.payload -> 'source' -> 'label'
      ),
      'evidenceIds', r.payload -> 'evidenceIds',
      'createdAt', r.payload -> 'createdAt',
      'updatedAt', r.payload -> 'updatedAt'
    ) as value,
    coalesce(r.occurred_at, r.updated_at) as sort_occurred_at,
    r.updated_at as sort_updated_at,
    r.record_id as sort_record_id
  from selected_contacts r
)
`;

export const RELATIONSHIP_LIFECYCLE_FACTS_SQL = `${RELATIONSHIP_LIFECYCLE_FACTS_CTES}
select jsonb_build_object(
  'version', 1,
  'workspaceId', $1,
  'actorId', $2,
  'tasks', coalesce((
    select jsonb_agg(value order by sort_occurred_at desc nulls last, sort_updated_at desc, sort_record_id)
    from task_projection
  ), '[]'::jsonb),
  'connections', coalesce((
    select jsonb_agg(value order by sort_occurred_at desc nulls last, sort_updated_at desc, sort_record_id)
    from connection_projection
  ), '[]'::jsonb),
  'contacts', coalesce((
    select jsonb_agg(value order by sort_occurred_at desc nulls last, sort_updated_at desc, sort_record_id)
    from contact_projection
  ), '[]'::jsonb)
) as envelope
`;

export interface RelationshipLifecycleFactsMetadata {
  collectionName: "tasks" | "connections" | "contacts";
  createdAt: string;
  lifecycleState: "active" | "archived";
  occurredAt: string | null;
  recordId: string;
  updatedAt: string;
  userId: string | null;
  workspaceId: string;
}

export interface RelationshipLifecycleFactsAuthorization {
  actorOwned: boolean;
  connectionAuthorized: boolean;
}

export interface RelationshipLifecycleFactsTask {
  authorization: RelationshipLifecycleFactsAuthorization;
  connectionId?: string;
  contactId?: string;
  createdAt: string;
  dueAt?: string;
  evidenceIds: readonly [string, ...string[]];
  id: string;
  kind: "task";
  metadata: RelationshipLifecycleFactsMetadata;
  source: SourceReferenceDTO;
  status: "open" | "scheduled" | "completed" | "dismissed";
  title: string;
  updatedAt: string;
}

export interface RelationshipLifecycleFactsConnection {
  accountId: string;
  authorization: RelationshipLifecycleFactsAuthorization;
  contactId: string;
  createdAt: string;
  evidenceIds: readonly [string, ...string[]];
  id: string;
  kind: "connection";
  metadata: RelationshipLifecycleFactsMetadata;
  source: SourceReferenceDTO;
  stage: RelationshipStage;
  summary: string;
  updatedAt: string;
}

export interface RelationshipLifecycleFactsContact {
  authorization: RelationshipLifecycleFactsAuthorization;
  createdAt: string;
  displayName: string;
  evidenceIds: readonly [string, ...string[]];
  id: string;
  kind: "contact";
  metadata: RelationshipLifecycleFactsMetadata;
  organization?: string;
  source: SourceReferenceDTO;
  stage: RelationshipStage;
  updatedAt: string;
}

export interface RelationshipLifecycleFacts {
  contacts: readonly RelationshipLifecycleFactsContact[];
  connections: readonly RelationshipLifecycleFactsConnection[];
  tasks: readonly RelationshipLifecycleFactsTask[];
}

export interface RelationshipLifecycleFactsReader {
  readonly sourceLabel: string;
  readRelationshipLifecycleFacts: (
    actorId: string,
  ) => Promise<RelationshipLifecycleFacts>;
}

export interface RelationshipLifecycleFactsReaderOptions {
  client: LiveRecordSqlClient;
  sourceLabel?: string;
  workspaceId: string;
}

export interface ConfiguredRelationshipLifecycleFactsReaderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

const ENVELOPE_KEYS = [
  "version",
  "workspaceId",
  "actorId",
  "tasks",
  "connections",
  "contacts",
] as const;
const METADATA_KEYS = [
  "workspaceId",
  "collectionName",
  "recordId",
  "userId",
  "lifecycleState",
  "occurredAt",
  "createdAt",
  "updatedAt",
] as const;
const AUTHORIZATION_KEYS = ["actorOwned", "connectionAuthorized"] as const;
const TASK_KEYS = [
  "kind",
  "metadata",
  "authorization",
  "id",
  "title",
  "status",
  "contactId",
  "connectionId",
  "dueAt",
  "source",
  "evidenceIds",
  "createdAt",
  "updatedAt",
] as const;
const CONNECTION_KEYS = [
  "kind",
  "metadata",
  "authorization",
  "id",
  "accountId",
  "contactId",
  "stage",
  "summary",
  "source",
  "evidenceIds",
  "createdAt",
  "updatedAt",
] as const;
const CONTACT_KEYS = [
  "kind",
  "metadata",
  "authorization",
  "id",
  "displayName",
  "organization",
  "stage",
  "source",
  "evidenceIds",
  "createdAt",
  "updatedAt",
] as const;
const SOURCE_KEYS = ["type", "id", "label"] as const;
const SOURCE_REQUIRED_KEYS = ["type", "id"] as const;
const NORMALIZED_FACTS_KEYS = ["tasks", "connections", "contacts"] as const;
const NORMALIZED_TASK_KEYS = [
  "kind",
  "metadata",
  "authorization",
  "id",
  "title",
  "status",
  "source",
  "evidenceIds",
  "createdAt",
  "updatedAt",
] as const;
const NORMALIZED_TASK_OPTIONAL_KEYS = ["contactId", "connectionId", "dueAt"] as const;
const NORMALIZED_CONNECTION_KEYS = CONNECTION_KEYS;
const NORMALIZED_CONTACT_KEYS = [
  "kind",
  "metadata",
  "authorization",
  "id",
  "displayName",
  "stage",
  "source",
  "evidenceIds",
  "createdAt",
  "updatedAt",
] as const;
const NORMALIZED_CONTACT_OPTIONAL_KEYS = ["organization"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys<const TKeys extends readonly string[]>(
  value: Record<string, unknown>,
  keys: TKeys,
  optionalKeys: readonly string[] = [],
): boolean {
  const allowed = new Set([...keys, ...optionalKeys]);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasAllKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function sourceReference(value: unknown, requireLabel = false): SourceReferenceDTO | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, SOURCE_KEYS) ||
    !hasAllKeys(value, requireLabel ? SOURCE_KEYS : SOURCE_REQUIRED_KEYS)
  ) {
    throw new Error("Relationship lifecycle source JSON shape is invalid.");
  }
  if (!isSourceType(value.type) || !nonEmptyString(value.id)) return null;
  const source: SourceReferenceDTO = {
    type: value.type,
    id: value.id,
  };
  const label = optionalString(value.label);
  return label === undefined ? source : { ...source, label };
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => nonEmptyString(item));
  return ids.length > 0 ? [ids[0]!, ...ids.slice(1)] : null;
}

function validMetadataInstant(value: unknown, label: string): string {
  if (!nonEmptyString(value)) throw new Error(`${label} is invalid.`);
  const instant = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? Date.parse(value)
    : Number.NaN;
  if (!Number.isFinite(instant)) throw new Error(`${label} is invalid.`);
  return value;
}

function metadataFromRow(
  value: unknown,
  expectedWorkspaceId: string,
  collectionName: RelationshipLifecycleFactsMetadata["collectionName"],
): RelationshipLifecycleFactsMetadata {
  if (!isRecord(value) || !hasOnlyKeys(value, METADATA_KEYS) || !hasAllKeys(value, METADATA_KEYS)) {
    throw new Error("Relationship lifecycle metadata JSON shape is invalid.");
  }
  if (!nonEmptyString(value.workspaceId) || value.workspaceId !== expectedWorkspaceId || value.collectionName !== collectionName) {
    throw new Error("Relationship lifecycle metadata scope is invalid.");
  }
  if (!nonEmptyString(value.recordId)) throw new Error("Relationship lifecycle record id is invalid.");
  const userIdValue = value.userId;
  if (userIdValue !== null && typeof userIdValue !== "string") {
    throw new Error("Relationship lifecycle user id is invalid.");
  }
  const userId = userIdValue as string | null;
  if (value.lifecycleState !== "active" && value.lifecycleState !== "archived") {
    throw new Error("Relationship lifecycle state is invalid.");
  }
  const occurredAt = value.occurredAt === null
    ? null
    : validMetadataInstant(value.occurredAt, "Relationship lifecycle occurredAt");
  return {
    workspaceId: value.workspaceId,
    collectionName,
    recordId: value.recordId,
    userId,
    lifecycleState: value.lifecycleState,
    occurredAt,
    createdAt: validMetadataInstant(value.createdAt, "Relationship lifecycle createdAt"),
    updatedAt: validMetadataInstant(value.updatedAt, "Relationship lifecycle updatedAt"),
  };
}

function authorizationFromRow(value: unknown): RelationshipLifecycleFactsAuthorization {
  if (!isRecord(value) || !hasOnlyKeys(value, AUTHORIZATION_KEYS) || !hasAllKeys(value, AUTHORIZATION_KEYS)) {
    throw new Error("Relationship lifecycle authorization JSON shape is invalid.");
  }
  if (typeof value.actorOwned !== "boolean" || typeof value.connectionAuthorized !== "boolean") {
    throw new Error("Relationship lifecycle authorization proof is invalid.");
  }
  return {
    actorOwned: value.actorOwned,
    connectionAuthorized: value.connectionAuthorized,
  };
}

function commonRowValid(
  value: Record<string, unknown>,
  kind: "task" | "connection" | "contact",
  expectedWorkspaceId: string,
): {
  authorization: RelationshipLifecycleFactsAuthorization;
  metadata: RelationshipLifecycleFactsMetadata;
} {
  const metadata = metadataFromRow(value.metadata, expectedWorkspaceId, kind === "connection" ? "connections" : `${kind}s` as "tasks" | "contacts");
  const authorization = authorizationFromRow(value.authorization);
  if (kind !== "contact" && !authorization.actorOwned) {
    throw new Error("Relationship lifecycle actor authorization proof is invalid.");
  }
  if (kind === "contact" && !authorization.actorOwned && !authorization.connectionAuthorized) {
    throw new Error("Relationship lifecycle contact authorization proof is invalid.");
  }
  return { metadata, authorization };
}

function decodeTaskRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsTask | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, TASK_KEYS) ||
    !hasAllKeys(value, TASK_KEYS)
  ) {
    throw new Error("Relationship lifecycle task JSON shape is invalid.");
  }
  if (value.kind !== "task") throw new Error("Relationship lifecycle task kind is invalid.");
  const common = commonRowValid(value, "task", expectedWorkspaceId);
  const source = sourceReference(value.source, true);
  const ids = evidenceIds(value.evidenceIds);
  const status = value.status;
  const id = value.id;
  const title = value.title;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  if (
    !nonEmptyString(id) ||
    !nonEmptyString(title) ||
    (status !== "open" && status !== "scheduled" && status !== "completed" && status !== "dismissed") ||
    !source ||
    !ids ||
    !nonEmptyString(createdAt) ||
    !nonEmptyString(updatedAt)
  ) return null;
  return {
    kind: "task",
    ...common,
    id,
    title,
    status,
    ...(optionalString(value.contactId) ? { contactId: optionalString(value.contactId) } : {}),
    ...(optionalString(value.connectionId) ? { connectionId: optionalString(value.connectionId) } : {}),
    ...(optionalString(value.dueAt) ? { dueAt: optionalString(value.dueAt) } : {}),
    source,
    evidenceIds: ids,
    createdAt,
    updatedAt,
  };
}

function decodeConnectionRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsConnection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, CONNECTION_KEYS) ||
    !hasAllKeys(value, CONNECTION_KEYS)
  ) {
    throw new Error("Relationship lifecycle connection JSON shape is invalid.");
  }
  if (value.kind !== "connection") throw new Error("Relationship lifecycle connection kind is invalid.");
  const common = commonRowValid(value, "connection", expectedWorkspaceId);
  const source = sourceReference(value.source, true);
  const ids = evidenceIds(value.evidenceIds);
  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.accountId) ||
    !nonEmptyString(value.contactId) ||
    !isRelationshipStage(value.stage) ||
    !nonEmptyString(value.summary) ||
    !source ||
    !ids ||
    !nonEmptyString(value.createdAt) ||
    !nonEmptyString(value.updatedAt)
  ) return null;
  return {
    kind: "connection",
    ...common,
    id: value.id,
    accountId: value.accountId,
    contactId: value.contactId,
    stage: value.stage,
    summary: value.summary,
    source,
    evidenceIds: ids,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function decodeContactRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsContact | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, CONTACT_KEYS) ||
    !hasAllKeys(value, CONTACT_KEYS)
  ) {
    throw new Error("Relationship lifecycle contact JSON shape is invalid.");
  }
  if (value.kind !== "contact") throw new Error("Relationship lifecycle contact kind is invalid.");
  const common = commonRowValid(value, "contact", expectedWorkspaceId);
  const source = sourceReference(value.source, true);
  const ids = evidenceIds(value.evidenceIds);
  if (
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.displayName) ||
    !isRelationshipStage(value.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(value.createdAt) ||
    !nonEmptyString(value.updatedAt)
  ) return null;
  const organization = optionalString(value.organization);
  return {
    kind: "contact",
    ...common,
    id: value.id,
    displayName: value.displayName,
    ...(organization ? { organization } : {}),
    stage: value.stage,
    source,
    evidenceIds: ids,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizedRequiredString(value: unknown, label: string): string {
  if (!nonEmptyString(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizedOptionalString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  return normalizedRequiredString(value[key], label);
}

function normalizedSourceReference(value: unknown): SourceReferenceDTO {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, SOURCE_KEYS) ||
    !hasAllKeys(value, SOURCE_REQUIRED_KEYS) ||
    !isSourceType(value.type) ||
    !nonEmptyString(value.id)
  ) {
    throw new Error("Relationship lifecycle normalized source is invalid.");
  }
  const source: SourceReferenceDTO = { type: value.type, id: value.id };
  if (!Object.hasOwn(value, "label")) return source;
  const label = value.label;
  if (!nonEmptyString(label)) {
    throw new Error("Relationship lifecycle normalized source label is invalid.");
  }
  return { ...source, label };
}

function normalizedEvidenceIds(value: unknown): readonly [string, ...string[]] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !nonEmptyString(item))) {
    throw new Error("Relationship lifecycle normalized evidence ids are invalid.");
  }
  const ids = value as string[];
  return [ids[0]!, ...ids.slice(1)];
}

function validateNormalizedTaskRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsTask {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, NORMALIZED_TASK_KEYS, NORMALIZED_TASK_OPTIONAL_KEYS) ||
    !hasAllKeys(value, NORMALIZED_TASK_KEYS) ||
    value.kind !== "task"
  ) {
    throw new Error("Relationship lifecycle normalized task is invalid.");
  }
  const common = commonRowValid(value, "task", expectedWorkspaceId);
  const status = value.status;
  if (status !== "open" && status !== "scheduled" && status !== "completed" && status !== "dismissed") {
    throw new Error("Relationship lifecycle normalized task status is invalid.");
  }
  const contactId = normalizedOptionalString(value, "contactId", "Relationship lifecycle normalized task contactId");
  const connectionId = normalizedOptionalString(value, "connectionId", "Relationship lifecycle normalized task connectionId");
  const dueAt = normalizedOptionalString(value, "dueAt", "Relationship lifecycle normalized task dueAt");
  return {
    kind: "task",
    ...common,
    id: normalizedRequiredString(value.id, "Relationship lifecycle normalized task id"),
    title: normalizedRequiredString(value.title, "Relationship lifecycle normalized task title"),
    status,
    ...(contactId === undefined ? {} : { contactId }),
    ...(connectionId === undefined ? {} : { connectionId }),
    ...(dueAt === undefined ? {} : { dueAt }),
    source: normalizedSourceReference(value.source),
    evidenceIds: normalizedEvidenceIds(value.evidenceIds),
    createdAt: normalizedRequiredString(value.createdAt, "Relationship lifecycle normalized task createdAt"),
    updatedAt: normalizedRequiredString(value.updatedAt, "Relationship lifecycle normalized task updatedAt"),
  };
}

function validateNormalizedConnectionRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsConnection {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, NORMALIZED_CONNECTION_KEYS) ||
    !hasAllKeys(value, NORMALIZED_CONNECTION_KEYS) ||
    value.kind !== "connection"
  ) {
    throw new Error("Relationship lifecycle normalized connection is invalid.");
  }
  const common = commonRowValid(value, "connection", expectedWorkspaceId);
  const stage = value.stage;
  if (!isRelationshipStage(stage)) {
    throw new Error("Relationship lifecycle normalized connection stage is invalid.");
  }
  return {
    kind: "connection",
    ...common,
    id: normalizedRequiredString(value.id, "Relationship lifecycle normalized connection id"),
    accountId: normalizedRequiredString(value.accountId, "Relationship lifecycle normalized connection accountId"),
    contactId: normalizedRequiredString(value.contactId, "Relationship lifecycle normalized connection contactId"),
    stage,
    summary: normalizedRequiredString(value.summary, "Relationship lifecycle normalized connection summary"),
    source: normalizedSourceReference(value.source),
    evidenceIds: normalizedEvidenceIds(value.evidenceIds),
    createdAt: normalizedRequiredString(value.createdAt, "Relationship lifecycle normalized connection createdAt"),
    updatedAt: normalizedRequiredString(value.updatedAt, "Relationship lifecycle normalized connection updatedAt"),
  };
}

function validateNormalizedContactRow(
  value: unknown,
  expectedWorkspaceId: string,
): RelationshipLifecycleFactsContact {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, NORMALIZED_CONTACT_KEYS, NORMALIZED_CONTACT_OPTIONAL_KEYS) ||
    !hasAllKeys(value, NORMALIZED_CONTACT_KEYS) ||
    value.kind !== "contact"
  ) {
    throw new Error("Relationship lifecycle normalized contact is invalid.");
  }
  const common = commonRowValid(value, "contact", expectedWorkspaceId);
  const stage = value.stage;
  if (!isRelationshipStage(stage)) {
    throw new Error("Relationship lifecycle normalized contact stage is invalid.");
  }
  const organization = normalizedOptionalString(
    value,
    "organization",
    "Relationship lifecycle normalized contact organization",
  );
  return {
    kind: "contact",
    ...common,
    id: normalizedRequiredString(value.id, "Relationship lifecycle normalized contact id"),
    displayName: normalizedRequiredString(value.displayName, "Relationship lifecycle normalized contact displayName"),
    ...(organization === undefined ? {} : { organization }),
    stage,
    source: normalizedSourceReference(value.source),
    evidenceIds: normalizedEvidenceIds(value.evidenceIds),
    createdAt: normalizedRequiredString(value.createdAt, "Relationship lifecycle normalized contact createdAt"),
    updatedAt: normalizedRequiredString(value.updatedAt, "Relationship lifecycle normalized contact updatedAt"),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function duplicateFingerprint(value: {
  metadata: RelationshipLifecycleFactsMetadata;
  [key: string]: unknown;
}): string {
  return JSON.stringify(canonical({
    ...value,
    metadata: { ...value.metadata, recordId: "<domain-duplicate>" },
  }));
}

function resolveDomainDuplicates<T extends {
  id: string;
  metadata: RelationshipLifecycleFactsMetadata;
}>(
  values: readonly T[],
  kind: "task" | "connection" | "contact",
): readonly T[] {
  const byId = new Map<string, T[]>();
  for (const value of values) {
    const group = byId.get(value.id) ?? [];
    group.push(value);
    byId.set(value.id, group);
  }
  const result: T[] = [];
  for (const group of byId.values()) {
    const value = group[0]!;
    if (group.length === 1) {
      result.push(value);
      continue;
    }
    const fingerprints = new Set(group.map(duplicateFingerprint));
    if (fingerprints.size !== 1) {
      throw new Error(`Conflicting duplicate ${kind} domain identity: ${value.id}`);
    }
    if (kind === "task") {
      result.push(...group);
    } else {
      const stable = [...group].sort((left, right) => left.metadata.recordId.localeCompare(right.metadata.recordId))[0]!;
      result.push(stable);
    }
  }
  return result;
}

export function decodeRelationshipLifecycleFacts(
  value: unknown,
  expectedWorkspaceId: string,
  expectedActorId: string,
): RelationshipLifecycleFacts {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ENVELOPE_KEYS) ||
    !hasAllKeys(value, ENVELOPE_KEYS) ||
    value.version !== 1 ||
    value.workspaceId !== expectedWorkspaceId ||
    value.actorId !== expectedActorId ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.contacts)
  ) throw new Error("Relationship lifecycle facts envelope is invalid.");

  const tasks = value.tasks
    .map((item) => decodeTaskRow(item, expectedWorkspaceId))
    .filter((item): item is RelationshipLifecycleFactsTask => item !== null);
  const connections = value.connections
    .map((item) => decodeConnectionRow(item, expectedWorkspaceId))
    .filter((item): item is RelationshipLifecycleFactsConnection => item !== null);
  const contacts = value.contacts
    .map((item) => decodeContactRow(item, expectedWorkspaceId))
    .filter((item): item is RelationshipLifecycleFactsContact => item !== null);

  if ([...tasks, ...connections].some(item => item.metadata.userId !== expectedActorId)
    || connections.some(item => item.accountId !== expectedActorId)) {
    throw new Error("Relationship lifecycle owner scope is invalid.");
  }

  return {
    tasks: resolveDomainDuplicates(tasks, "task"),
    connections: resolveDomainDuplicates(connections, "connection"),
    contacts: resolveDomainDuplicates(contacts, "contact"),
  };
}

export function validateRelationshipLifecycleFacts(
  value: unknown,
): RelationshipLifecycleFacts {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, NORMALIZED_FACTS_KEYS) ||
    !hasAllKeys(value, NORMALIZED_FACTS_KEYS) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.contacts)
  ) {
    throw new Error("Relationship lifecycle facts result is invalid.");
  }
  const rows = [...value.tasks, ...value.connections, ...value.contacts];
  const workspaceIds = rows
    .filter(isRecord)
    .map((row) => isRecord(row.metadata) ? row.metadata.workspaceId : null)
    .filter((workspace): workspace is string => nonEmptyString(workspace));
  const expectedWorkspaceId = workspaceIds[0] ?? "";
  if (workspaceIds.some((workspace) => workspace !== expectedWorkspaceId)) {
    throw new Error("Relationship lifecycle facts result has mixed workspace identities.");
  }
  return {
    tasks: resolveDomainDuplicates(
      value.tasks.map((item) => validateNormalizedTaskRow(item, expectedWorkspaceId)),
      "task",
    ),
    connections: resolveDomainDuplicates(
      value.connections.map((item) => validateNormalizedConnectionRow(item, expectedWorkspaceId)),
      "connection",
    ),
    contacts: resolveDomainDuplicates(
      value.contacts.map((item) => validateNormalizedContactRow(item, expectedWorkspaceId)),
      "contact",
    ),
  };
}

export function createRelationshipLifecycleFactsReader({
  client,
  sourceLabel = "Relationship lifecycle facts",
  workspaceId,
}: RelationshipLifecycleFactsReaderOptions): RelationshipLifecycleFactsReader {
  return {
    sourceLabel,
    async readRelationshipLifecycleFacts(actorId: string): Promise<RelationshipLifecycleFacts> {
      if (!nonEmptyString(actorId)) throw new Error("An actor is required for relationship lifecycle facts.");
      const result = await client.query<{ envelope: unknown }>(
        RELATIONSHIP_LIFECYCLE_FACTS_SQL,
        [workspaceId, actorId],
      );
      if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
        throw new Error("Relationship lifecycle facts query returned an invalid envelope.");
      }
      const row = result.rows[0];
      if (!isRecord(row) || !Object.hasOwn(row, "envelope")) {
        throw new Error("Relationship lifecycle facts query returned an invalid row.");
      }
      return decodeRelationshipLifecycleFacts(row.envelope, workspaceId, actorId);
    },
  };
}

export function createConfiguredRelationshipLifecycleFactsReader({
  env,
  sourceLabel = "Relationship lifecycle facts from Postgres live storage",
}: ConfiguredRelationshipLifecycleFactsReaderOptions = {}): RelationshipLifecycleFactsReader | null {
  const configured = createConfiguredPostgresLiveRecordStore({ env });
  if (!configured) return null;
  return createRelationshipLifecycleFactsReader({
    client: configured.client,
    sourceLabel,
    workspaceId: configured.workspaceId,
  });
}
