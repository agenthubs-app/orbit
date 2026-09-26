import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export interface ProfileActorPostgresReadRecord {
  collectionName: string;
  createdAt: string;
  evidenceIds: readonly string[];
  lifecycleState: string;
  occurredAt: string | null;
  payload: unknown;
  recordId: string;
  updatedAt: string;
  userId: string | null;
  workspaceId: string;
}

export interface ProfileActorPostgresReadGraph {
  accounts: readonly ProfileActorPostgresReadRecord[];
  profiles: readonly ProfileActorPostgresReadRecord[];
}

type ProfileActorPostgresReaderRow = {
  collection_name: string;
  created_at: Date | string;
  evidence_ids?: readonly string[] | null;
  lifecycle_state: string;
  occurred_at?: Date | string | null;
  payload: unknown;
  record_id: string;
  updated_at: Date | string;
  user_id?: string | null;
  workspace_id: string;
};

const ACCOUNT_PAYLOAD_FIELDS = ["id", "name", "createdAt", "updatedAt"] as const;
const PROFILE_PAYLOAD_FIELDS = [
  "id",
  "accountId",
  "displayName",
  "displayNameConfirmed",
  "birthDate",
  "role",
  "timezone",
  "headline",
  "handles",
  "homeMarket",
  "organization",
  "preferredFollowUpWindow",
  "preferredIntroChannels",
  "preferredLanguage",
  "relationshipGoal",
  "targetRelationshipTypes",
  "spokenLanguages",
  "publicProfile",
  "createdAt",
  "updatedAt",
] as const;

function timestampToString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredTimestamp(value: Date | string | null | undefined, fieldName: string): string {
  const timestamp = timestampToString(value);
  if (!timestamp) throw new Error(`orbit_records.${fieldName} is required`);
  return timestamp;
}

function payloadFromRow(payload: unknown): unknown {
  // Keep the same boundary behavior as the existing Postgres record adapter.
  // pg normally decodes json/jsonb values before this function sees them; a
  // string row is therefore treated as the adapter's JSON text path.
  return typeof payload === "string"
    ? JSON.parse(payload)
    : JSON.parse(JSON.stringify(payload));
}

function readRecord(row: ProfileActorPostgresReaderRow): ProfileActorPostgresReadRecord {
  return {
    collectionName: row.collection_name,
    createdAt: requiredTimestamp(row.created_at, "created_at"),
    evidenceIds: row.evidence_ids ? [...row.evidence_ids] : [],
    lifecycleState:
      row.lifecycle_state === "archived" || row.lifecycle_state === "deleted"
        ? row.lifecycle_state
        : "active",
    occurredAt: timestampToString(row.occurred_at),
    payload: payloadFromRow(row.payload),
    recordId: row.record_id,
    updatedAt: requiredTimestamp(row.updated_at, "updated_at"),
    userId: row.user_id ?? null,
    workspaceId: row.workspace_id,
  };
}

function projectedPayload(fieldsParameter: number): string {
  return `(case when jsonb_typeof(payload) = 'object' then coalesce(
    (select jsonb_object_agg(field.key, field.value)
      from jsonb_each(payload) field
      where field.key = any($${fieldsParameter}::text[])),
    '{}'::jsonb
  ) else payload end) as payload`;
}

function actorReadQuery(input: {
  collection: "accounts" | "profiles";
  fieldsParameter: number;
}): string {
  const identity = input.collection === "accounts"
    ? "(user_id = $2 or payload->'id' = to_jsonb($2::text))"
    : "payload->'accountId' = to_jsonb($2::text) and (user_id is null or user_id = $2)";

  return `
    select
      workspace_id,
      collection_name,
      record_id,
      user_id,
      evidence_ids,
      occurred_at,
      lifecycle_state,
      created_at,
      updated_at,
      ${projectedPayload(input.fieldsParameter)}
    from orbit_records
    where workspace_id = $1
      and collection_name = '${input.collection}'
      and lifecycle_state <> 'deleted'
      and ${identity}
    order by coalesce(occurred_at, updated_at) desc, updated_at desc
  `;
}

export function createProfileActorPostgresReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): (actorId: string) => Promise<ProfileActorPostgresReadGraph> {
  return async (actorId) => {
    if (!actorId.trim()) throw new Error("Profile actor is required");

    const [accounts, profiles] = await Promise.all([
      input.client.query<ProfileActorPostgresReaderRow>(
        actorReadQuery({ collection: "accounts", fieldsParameter: 3 }),
        [input.workspaceId, actorId, [...ACCOUNT_PAYLOAD_FIELDS]],
      ),
      input.client.query<ProfileActorPostgresReaderRow>(
        actorReadQuery({ collection: "profiles", fieldsParameter: 3 }),
        [input.workspaceId, actorId, [...PROFILE_PAYLOAD_FIELDS]],
      ),
    ]);

    return {
      accounts: accounts.rows.map(readRecord),
      profiles: profiles.rows.map(readRecord),
    };
  };
}
