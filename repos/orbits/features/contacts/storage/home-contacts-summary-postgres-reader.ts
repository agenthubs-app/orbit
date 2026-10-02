import {
  createConfiguredPostgresLiveRecordStore,
  type LiveRecordCustomRead,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { HomeContactsSummary, HomeContactsSummaryReader } from "../home-contacts-summary";

// ECMAScript String.prototype.trim() whitespace and line terminators, so a
// `nonEmptyString` check in SQL matches the JavaScript one.
const JS_TRIM_CHARS_SQL = [
  "chr(9)", "chr(10)", "chr(11)", "chr(12)", "chr(13)", "' '",
  "chr(160)", "chr(5760)", "chr(8192)", "chr(8193)", "chr(8194)",
  "chr(8195)", "chr(8196)", "chr(8197)", "chr(8198)", "chr(8199)",
  "chr(8200)", "chr(8201)", "chr(8202)", "chr(8232)", "chr(8233)",
  "chr(8239)", "chr(8287)", "chr(12288)", "chr(65279)",
].join(" || ");
const SOURCE_TYPES_SQL = "'manual','business_card_ocr','qr_scan','event_import','external_contacts','email_signal','calendar_signal','referral','chat_summary','agent_action','system'";
const RELATIONSHIP_STAGES_SQL = "'captured','reviewing','active','needs_follow_up','nurture','archived'";
const CONNECTION_STAGES_SQL = "'needs_follow_up','active','nurture','archived'";

const nonEmptyString = (value: string) =>
  `(jsonb_typeof(${value}) = 'string' and nullif(btrim(${value} #>> '{}', ${JS_TRIM_CHARS_SQL}), '') is not null)`;

/**
 * `contactFromRecord` / `connectionFromRecord` throw unless `version` is absent
 * or `Number.isSafeInteger(version) && version >= 1` after JSON.parse. The
 * float8 cast reproduces JSON.parse rounding (e.g. 1.0000000000000001 → 1).
 */
const versionValid = (payload: string) => `(case
      when not ${payload} ? 'version' then true
      when jsonb_typeof(${payload}->'version') <> 'number' then false
      when (${payload}->>'version')::numeric not between 0.5 and 9007199254740992 then false
      else (${payload}->>'version')::numeric::float8 = trunc((${payload}->>'version')::numeric::float8)
        and (${payload}->>'version')::numeric::float8 between 1 and 9007199254740991
    end)`;

const sourceValid = (payload: string) => `(jsonb_typeof(${payload}->'source') = 'object'
      and jsonb_typeof(${payload}->'source'->'type') = 'string'
      and ${payload}->'source'->>'type' in (${SOURCE_TYPES_SQL})
      and ${nonEmptyString(`${payload}->'source'->'id'`)})`;

const evidenceIdsValid = (payload: string) => `(jsonb_typeof(${payload}->'evidenceIds') = 'array'
      and exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(${payload}->'evidenceIds') = 'array' then ${payload}->'evidenceIds' else '[]'::jsonb end) evidence_id(value)
        where ${nonEmptyString("evidence_id.value")}
      ))`;

const ownedByActor = (alias: string) => `${alias}.user_id = $2
      and (${alias}.payload->'accountId' is null or ${alias}.payload->'accountId' = 'null'::jsonb or ${alias}.payload->'accountId' = to_jsonb($2::text))`;

/**
 * W0041: the two numbers Home shows from the contacts page model —
 * `ledger.knownPeople` and the non-archived count — computed in one statement
 * over every contact the actor owns (no page window), with the page model's
 * failures reported as flags:
 *
 * - owned, non-deleted contacts (`contactRecordOwnedByActor`), each validated
 *   like `contactFromRecord`; any invalid `version` rejects;
 * - owned relationships whose `contactId` is the payload id of an owned contact
 *   (the scope reader's selection); any invalid `version` rejects;
 * - relationships that parse and point at a valid contact: more than one for a
 *   contact with any `version`/`lifecycleInitialization` is
 *   `CONTACT_DETAIL_AMBIGUOUS_CONNECTION`; exactly one with a `version` or
 *   `ready`, neither side pending and a connection stage overrides the stage;
 * - `jsonb_each` is evaluated on every payload the old list projection read,
 *   so a non-object payload raises the same database error.
 */
export const HOME_CONTACTS_SUMMARY_SQL = `with
owned_contacts as materialized (
  select c.payload, c.payload->>'id' as domain_id,
    (select count(*) from jsonb_each(c.payload)) as projected_fields
  from orbit_records c
  where c.workspace_id = $1 and c.collection_name = 'contacts'
    and c.lifecycle_state <> 'deleted'
    and ${ownedByActor("c")}
), contact_rows as materialized (
  select domain_id,
    ${versionValid("payload")} as version_ok,
    (${nonEmptyString("payload->'id'")}
      and ${nonEmptyString("payload->'displayName'")}
      and jsonb_typeof(payload->'stage') = 'string' and payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
      and ${sourceValid("payload")}
      and ${evidenceIdsValid("payload")}
      and ${nonEmptyString("payload->'createdAt'")}
      and ${nonEmptyString("payload->'updatedAt'")}) as valid,
    coalesce(jsonb_typeof(payload->'lifecycleInitialization') = 'string' and payload->>'lifecycleInitialization' = 'pending', false) as pending,
    payload->>'stage' as stage
  from owned_contacts
), connection_rows as materialized (
  select r.payload->>'contactId' as contact_id,
    ${versionValid("r.payload")} as version_ok,
    (${nonEmptyString("r.payload->'id'")}
      and ${nonEmptyString("r.payload->'accountId'")}
      and ${nonEmptyString("r.payload->'contactId'")}
      and jsonb_typeof(r.payload->'stage') = 'string' and r.payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
      and ${nonEmptyString("r.payload->'summary'")}
      and ${sourceValid("r.payload")}
      and ${evidenceIdsValid("r.payload")}
      and ${nonEmptyString("r.payload->'createdAt'")}
      and ${nonEmptyString("r.payload->'updatedAt'")}) as valid,
    r.payload ? 'version' as has_version,
    case when jsonb_typeof(r.payload->'lifecycleInitialization') = 'string'
      and r.payload->>'lifecycleInitialization' in ('pending', 'ready')
      then r.payload->>'lifecycleInitialization' end as lifecycle_initialization,
    r.payload->>'stage' as stage,
    (select count(*) from jsonb_each(r.payload)) as projected_fields
  from orbit_records r
  where r.workspace_id = $1 and r.collection_name = 'connections'
    and r.lifecycle_state <> 'deleted'
    and ${ownedByActor("r")}
    and r.payload->>'contactId' in (select domain_id from owned_contacts where domain_id <> '')
), valid_connections as materialized (
  select connection.* from connection_rows connection
  where connection.valid and connection.version_ok
    and exists (select 1 from contact_rows contact where contact.valid and contact.version_ok and contact.domain_id = connection.contact_id)
), connection_groups as materialized (
  select contact_id, count(*) as candidates,
    bool_or(has_version or lifecycle_initialization is not null) as lifecycle_marked,
    bool_or(has_version) as has_version,
    coalesce(bool_or(lifecycle_initialization = 'ready'), false) as ready,
    coalesce(bool_or(lifecycle_initialization = 'pending'), false) as pending,
    min(stage) as stage
  from valid_connections group by contact_id
), canonical_stages as materialized (
  select connection_group.contact_id, connection_group.stage
  from connection_groups connection_group
  where connection_group.candidates = 1
    and (connection_group.has_version or connection_group.ready)
    and not connection_group.pending
    and connection_group.stage in (${CONNECTION_STAGES_SQL})
    and not exists (select 1 from contact_rows contact where contact.valid and contact.domain_id = connection_group.contact_id and contact.pending)
)
select
  (select count(*) from contact_rows where not version_ok)::int as invalid_contact_versions,
  (select count(*) from connection_rows where not version_ok)::int as invalid_connection_versions,
  (select count(*) from connection_groups where candidates > 1 and lifecycle_marked)::int as ambiguous_contacts,
  (select count(*) from contact_rows where valid)::int as known_people,
  (select count(*) from contact_rows contact
    left join canonical_stages canonical on canonical.contact_id = contact.domain_id
    where contact.valid and coalesce(canonical.stage, contact.stage) <> 'archived')::int as in_progress,
  (coalesce((select sum(projected_fields) from owned_contacts), 0)
    + coalesce((select sum(projected_fields) from connection_rows), 0)) >= 0 as payloads_projectable`;

interface SummaryRow {
  ambiguous_contacts: number;
  in_progress: number;
  invalid_connection_versions: number;
  invalid_contact_versions: number;
  known_people: number;
  payloads_projectable: boolean;
}

function count(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Home contacts summary returned an invalid count.");
  }
  return parsed;
}

export function createPostgresHomeContactsSummaryReader(input: {
  client: LiveRecordSqlClient;
  /** Configured stores pass `customRead` so the read-budget gate and in-flight sharing apply. */
  read?: LiveRecordCustomRead;
  workspaceId: string;
}): HomeContactsSummaryReader {
  return async (actorId) => {
    const query = async (): Promise<SummaryRow> => {
      const result = await input.client.query<SummaryRow>(HOME_CONTACTS_SUMMARY_SQL, [input.workspaceId, actorId]);
      if (result.rows.length !== 1) throw new Error("Home contacts summary returned no row.");
      return result.rows[0]!;
    };
    const row = input.read
      ? await input.read({
          collectionName: "contacts",
          key: `homeContactsSummary\u0000${input.workspaceId}\u0000${actorId}`,
          read: query,
        })
      : await query();
    // The page model's own failure order: contacts parse first, then relationships, then the graph.
    if (count(row.invalid_contact_versions) > 0) throw new Error("Invalid contact lifecycle version");
    if (count(row.invalid_connection_versions) > 0) throw new Error("Invalid connection lifecycle version");
    if (count(row.ambiguous_contacts) > 0) throw new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
    if (row.payloads_projectable !== true) throw new Error("Home contacts summary returned an invalid row.");
    const summary: HomeContactsSummary = {
      inProgress: count(row.in_progress),
      knownPeople: count(row.known_people),
    };
    return summary;
  };
}

export function createConfiguredHomeContactsSummaryReader(): HomeContactsSummaryReader | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  return createPostgresHomeContactsSummaryReader({
    client: configured.client,
    read: configured.customRead,
    workspaceId: configured.workspaceId,
  });
}
