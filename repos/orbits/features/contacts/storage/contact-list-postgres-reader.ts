import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { contactCardPageSchema, contactCardSummarySchema } from "../../../shared/api-schema/contact-card-page";
import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../../../shared/contract/contact-card-page";

import {
  CONTACT_SOURCE_FILTERS,
  CONTACT_STATUS_FILTERS,
  CONTACT_VALUE_FILTERS,
  type ContactsListSearchFilterInput,
} from "../contract";
import type { ContactsFacetCounts } from "../contact-graph-query";
import {
  CONTACT_ACTOR_AUTHORIZATION_SQL,
} from "./contact-read-authorization";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { LiveRecord } from "../../../shared/storage/live-record-store";

const CONTACT_COLLECTION = "contacts";
const CONNECTION_COLLECTION = "connections";

const SOURCE_TYPES_SQL = [
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
  "chat_summary",
  "agent_action",
  "system",
].map((value) => `'${value}'`).join(", ");

const RELATIONSHIP_STAGES_SQL = [
  "captured",
  "reviewing",
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
].map((value) => `'${value}'`).join(", ");

const CONNECTION_STAGES_SQL = [
  "needs_follow_up",
  "active",
  "nurture",
  "archived",
].map((value) => `'${value}'`).join(", ");

const VALUE_TYPES_SQL = [
  "strategic_fit",
  "commercial_opportunity",
  "knowledge_exchange",
  "referral_path",
  "community_context",
].map((value) => `'${value}'`).join(", ");

const CONTACT_PAYLOAD_FIELDS_SQL = [
  "id", "version", "displayName", "organization", "role", "location",
  "profileSnippet", "primaryIndustryId", "secondaryIndustryId", "nextAction",
  "stage", "lifecycleInitialization", "source", "evidenceIds", "createdAt", "updatedAt",
].map((value) => `'${value}'`).join(", ");
const CONNECTION_PAYLOAD_FIELDS_SQL = [
  "id", "version", "lifecycleInitialization", "accountId", "contactId", "stage",
  "valueTypes", "summary", "source", "evidenceIds", "createdAt", "updatedAt",
].map((value) => `'${value}'`).join(", ");
const DETAIL_STATE_PAYLOAD_FIELDS_SQL = ["actorId", "contactId", "tags", "status", "updatedAt"]
  .map((value) => `'${value}'`).join(", ");
const EVIDENCE_PAYLOAD_FIELDS_SQL = ["id", "sourceType", "sourceId", "summary", "occurredAt", "confidence", "createdBy"]
  .map((value) => `'${value}'`).join(", ");
const ECMASCRIPT_TRIM_CHARS_SQL = [
  "chr(9)", "chr(10)", "chr(11)", "chr(12)", "chr(13)", "' '",
  "chr(160)", "chr(5760)", "chr(8192)", "chr(8193)", "chr(8194)",
  "chr(8195)", "chr(8196)", "chr(8197)", "chr(8198)", "chr(8199)",
  "chr(8200)", "chr(8201)", "chr(8202)", "chr(8232)", "chr(8233)",
  "chr(8239)", "chr(8287)", "chr(12288)", "chr(65279)",
].join(" || ");

const CONTACT_SEARCH_MATCHER_POLICY_VERSION = "ecmascript-lower-substring-v1";

function createContactListSql(useVerifiedSearchCollation: boolean, output: "records" | "cards" | "summary" = "records", boundedCandidates = false): string {
  const needsSearchText = output === "records" || useVerifiedSearchCollation;
  const searchCollation = useVerifiedSearchCollation
    ? ' collate pg_catalog."und-x-icu"'
    : "";
  const runtimeFingerprintCte = useVerifiedSearchCollation
    ? `runtime_fingerprint as (
  select jsonb_build_object(
    'server_version_num', current_setting('server_version_num'),
    'server_encoding', current_setting('server_encoding'),
    'collation', c.collname,
    'collprovider', c.collprovider,
    'collisdeterministic', c.collisdeterministic,
    'catalog_collversion', c.collversion,
    'actual_collversion', pg_catalog.pg_collation_actual_version(c.oid),
    'matcher_policy_version', '${CONTACT_SEARCH_MATCHER_POLICY_VERSION}'
  ) as fingerprint
  from pg_catalog.pg_collation c
  where c.oid = 'pg_catalog."und-x-icu"'::pg_catalog.regcollation
    and c.collnamespace = (
      select n.oid from pg_catalog.pg_namespace n where n.nspname = 'pg_catalog'
    )
    and c.collname = 'und-x-icu'
)`
    : `runtime_fingerprint as (
  select null::jsonb as fingerprint
)`;

  return `
with base_contacts as materialized (
  select
    c.record_id,
    c.user_id,
    c.source_type,
    c.source_id,
    c.source_label,
    c.provider,
    c.provider_record_id,
    c.evidence_ids,
    c.target_type,
    c.target_id,
    c.occurred_at,
    c.lifecycle_state,
    c.search_text,
    c.created_at,
    c.updated_at as record_updated_at,
    c.deleted_at,
    c.payload,
    case
      when c.payload ? 'version' then
        case
          when jsonb_typeof(c.payload->'version') <> 'number' then 'Invalid contact lifecycle version'
          when (c.payload->>'version')::numeric <> trunc((c.payload->>'version')::numeric) then 'Invalid contact lifecycle version'
          when (c.payload->>'version')::numeric < 1 then 'Invalid contact lifecycle version'
          when (c.payload->>'version')::numeric > 9007199254740991 then 'Invalid contact lifecycle version'
          else null
        end
      else null
    end as contact_error_code
  from orbit_records c
  where c.workspace_id = $1
    and c.collection_name = $2
    and c.lifecycle_state <> 'deleted'
    and jsonb_typeof(c.payload->'id') = 'string'
    and nullif(btrim(c.payload->>'id', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and jsonb_typeof(c.payload->'displayName') = 'string'
    and nullif(btrim(c.payload->>'displayName', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and c.payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
    and jsonb_typeof(c.payload->'source') = 'object'
    and c.payload->'source'->>'type' in (${SOURCE_TYPES_SQL})
    and jsonb_typeof(c.payload->'source'->'type') = 'string'
    and jsonb_typeof(c.payload->'source'->'id') = 'string'
    and nullif(btrim(c.payload->'source'->>'id', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and jsonb_typeof(c.payload->'evidenceIds') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(c.payload->'evidenceIds') = 'array'
          then c.payload->'evidenceIds' else '[]'::jsonb end
      ) as evidence_item(value)
      where jsonb_typeof(evidence_item.value) = 'string'
        and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    )
    and jsonb_typeof(c.payload->'createdAt') = 'string'
    and jsonb_typeof(c.payload->'updatedAt') = 'string'
    and nullif(btrim(c.payload->>'createdAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(c.payload->>'updatedAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and ${CONTACT_ACTOR_AUTHORIZATION_SQL}
    ${boundedCandidates ? `and ($6::text[] is null or (
      case when c.payload->'source'->>'type' in (${CONTACT_SOURCE_FILTERS.map(value => `'${value}'`).join(", ")})
        then c.payload->'source'->>'type' else 'manual' end
    ) = any($6::text[]))
    and ($10::integer is null
      or coalesce(c.occurred_at, c.updated_at) < $11::timestamptz
      or (coalesce(c.occurred_at, c.updated_at) = $11::timestamptz and c.updated_at < $12::timestamptz)
      or (coalesce(c.occurred_at, c.updated_at) = $11::timestamptz and c.updated_at = $12::timestamptz and c.record_id > $13))
    order by coalesce(c.occurred_at, c.updated_at) desc, c.updated_at desc, c.record_id asc
    limit $14 + 1` : ""}
), actor_connections as materialized (
  select
    c.record_id,
    c.user_id,
    c.source_type,
    c.source_id,
    c.source_label,
    c.provider,
    c.provider_record_id,
    c.evidence_ids,
    c.target_type,
    c.target_id,
    c.occurred_at,
    c.lifecycle_state,
    c.search_text,
    c.created_at,
    c.updated_at as record_updated_at,
    c.deleted_at,
    c.payload
  from orbit_records c
  where c.workspace_id = $1
    and c.collection_name = '${CONNECTION_COLLECTION}'
    and c.lifecycle_state <> 'deleted'
    and (c.user_id = $4 or c.payload->>'accountId' = $4)
    ${boundedCandidates ? "and exists (select 1 from base_contacts page_contact where page_contact.payload->>'id' = c.payload->>'contactId')" : ""}
    and jsonb_typeof(c.payload->'id') = 'string'
    and jsonb_typeof(c.payload->'accountId') = 'string'
    and jsonb_typeof(c.payload->'contactId') = 'string'
    and nullif(btrim(c.payload->>'id', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(c.payload->>'accountId', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(c.payload->>'contactId', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and c.payload->>'stage' in (${RELATIONSHIP_STAGES_SQL})
    and jsonb_typeof(c.payload->'summary') = 'string'
    and jsonb_typeof(c.payload->'source'->'type') = 'string'
    and jsonb_typeof(c.payload->'source'->'id') = 'string'
    and nullif(btrim(c.payload->>'summary', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and jsonb_typeof(c.payload->'source') = 'object'
    and c.payload->'source'->>'type' in (${SOURCE_TYPES_SQL})
    and nullif(btrim(c.payload->'source'->>'id', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and jsonb_typeof(c.payload->'evidenceIds') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(c.payload->'evidenceIds') = 'array'
          then c.payload->'evidenceIds' else '[]'::jsonb end
      ) as evidence_item(value)
      where jsonb_typeof(evidence_item.value) = 'string'
        and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    )
    and jsonb_typeof(c.payload->'createdAt') = 'string'
    and jsonb_typeof(c.payload->'updatedAt') = 'string'
    and nullif(btrim(c.payload->>'createdAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(c.payload->>'updatedAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
), authorized_contact_ids as materialized (
  select coalesce(array_agg(distinct c.payload->>'id'), '{}'::text[]) as contact_ids
  from base_contacts c
), referenced_evidence_ids as materialized (
  select distinct evidence_item.value #>> '{}' as evidence_id
  from (
    select c.payload->'evidenceIds' as evidence_ids
    from base_contacts c
    union all
    select ac.payload->'evidenceIds' as evidence_ids
    from actor_connections ac
    cross join authorized_contact_ids allowed
    where ac.payload->>'contactId' = any(allowed.contact_ids)
  ) as evidence_sources
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(evidence_sources.evidence_ids) = 'array'
      then evidence_sources.evidence_ids else '[]'::jsonb end
  ) as evidence_item(value)
  where jsonb_typeof(evidence_item.value) = 'string'
    and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
), referenced_evidence_lookup as materialized (
  select coalesce(
    jsonb_object_agg(evidence_id, true),
    '{}'::jsonb
  ) as ids
  from referenced_evidence_ids
), mapped_connections as materialized (
  select
    c.record_id,
    c.occurred_at,
    c.record_updated_at,
    c.payload,
    c.payload->>'contactId' as contact_id,
    c.payload->>'summary' as relationship_context,
    c.payload->>'stage' as stage,
    c.payload->>'updatedAt' as dto_updated_at,
    c.payload->>'lifecycleInitialization' as lifecycle_initialization,
    case
      when jsonb_typeof(c.payload->'valueTypes') = 'array' then
        coalesce((
          select array_agg(value_item.value #>> '{}' order by value_item.ordinality)
          from jsonb_array_elements(
            case when jsonb_typeof(c.payload->'valueTypes') = 'array'
              then c.payload->'valueTypes' else '[]'::jsonb end
          ) with ordinality as value_item(value, ordinality)
          where jsonb_typeof(value_item.value) = 'string'
            and value_item.value #>> '{}' in (${VALUE_TYPES_SQL})
        ), '{}'::text[])
      else '{}'::text[]
    end as value_types
  from actor_connections c
), connection_validation as materialized (
  select
    contact_id,
    case
      when bool_or(
        case
          when payload ? 'version' then
            case
              when jsonb_typeof(payload->'version') <> 'number' then true
              when (payload->>'version')::numeric <> trunc((payload->>'version')::numeric) then true
              when (payload->>'version')::numeric < 1 then true
              when (payload->>'version')::numeric > 9007199254740991 then true
              else false
            end
          else false
        end
      ) then 'Invalid connection lifecycle version'
      when count(*) > 1 and bool_or(
        payload ? 'version' or lifecycle_initialization in ('pending', 'ready')
      ) then 'CONTACT_DETAIL_AMBIGUOUS_CONNECTION'
      else null
    end as error_code
  from mapped_connections
  group by contact_id
), connection_validation_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, error_code) filter (where error_code is not null),
    '{}'::jsonb
  ) as error_codes
  from connection_validation
), connection_search as materialized (
  select
    contact_id,
    string_agg(
      concat_ws(' ', relationship_context, array_to_string(value_types, ' ')),
      ' ' order by coalesce(occurred_at, record_updated_at) desc,
        record_updated_at desc, record_id asc
    ) as connection_search_text
  from mapped_connections
  group by contact_id
), connection_search_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, connection_search_text),
    '{}'::jsonb
  ) as texts
  from connection_search
), display_connections as materialized (
  select distinct on (contact_id)
    contact_id,
    relationship_context,
    value_types
  from mapped_connections
  order by
    contact_id,
    coalesce(occurred_at, record_updated_at) asc,
    record_updated_at asc,
    record_id desc
), display_connections_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, jsonb_build_object(
      'relationship_context', relationship_context,
      'value_types', to_jsonb(value_types)
    )),
    '{}'::jsonb
  ) as connections
  from display_connections
), canonical_connections as materialized (
  select distinct on (mapped_connections.contact_id)
    mapped_connections.contact_id,
    mapped_connections.stage,
    mapped_connections.dto_updated_at,
    mapped_connections.lifecycle_initialization
  from mapped_connections
  cross join connection_validation_lookup validation_lookup
  where (payload ? 'version' or lifecycle_initialization = 'ready')
    and (lifecycle_initialization is null or lifecycle_initialization <> 'pending')
    and stage in (${CONNECTION_STAGES_SQL})
    and validation_lookup.error_codes ->> mapped_connections.contact_id is null
  order by
    mapped_connections.contact_id,
    coalesce(occurred_at, record_updated_at) desc,
    record_updated_at desc,
    record_id asc
), canonical_connections_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, jsonb_build_object(
      'stage', stage,
      'dto_updated_at', dto_updated_at,
      'lifecycle_initialization', lifecycle_initialization
    )),
    '{}'::jsonb
  ) as connections
  from canonical_connections
), actor_detail_states as materialized (
  select
    d.record_id,
    d.user_id,
    d.source_type,
    d.source_id,
    d.source_label,
    d.provider,
    d.provider_record_id,
    d.evidence_ids,
    d.target_type,
    d.target_id,
    d.occurred_at,
    d.lifecycle_state,
    d.search_text,
    d.created_at,
    d.updated_at as record_updated_at,
    d.deleted_at,
    d.payload
  from orbit_records d
  where d.workspace_id = $1
    and d.collection_name = 'contact_detail_states'
    and d.lifecycle_state <> 'deleted'
    and d.user_id = $4
    and d.payload->>'actorId' = $4
    and jsonb_typeof(d.payload->'actorId') = 'string'
    and jsonb_typeof(d.payload->'contactId') = 'string'
    and jsonb_typeof(d.payload->'status') = 'string'
    and jsonb_typeof(d.payload->'updatedAt') = 'string'
    and nullif(btrim(d.payload->>'contactId', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(d.payload->>'status', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(d.payload->>'updatedAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
), display_detail_states as materialized (
  select distinct on (contact_id)
    contact_id,
    case
      when jsonb_typeof(payload->'tags') = 'array' then
        coalesce((
          select array_agg(tag_item.value #>> '{}' order by tag_item.ordinality)
          from jsonb_array_elements(
            case when jsonb_typeof(payload->'tags') = 'array'
              then payload->'tags' else '[]'::jsonb end
          ) with ordinality as tag_item(value, ordinality)
          where jsonb_typeof(tag_item.value) = 'string'
            and nullif(btrim(tag_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
        ), '{}'::text[])
      else '{}'::text[]
    end as tags
  from (
    select
      d.record_id,
      d.occurred_at,
      d.record_updated_at,
      d.payload,
      d.payload->>'contactId' as contact_id
    from actor_detail_states d
  ) states
  order by
    contact_id,
    coalesce(occurred_at, record_updated_at) asc,
    record_updated_at asc,
    record_id desc
), display_detail_states_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, to_jsonb(tags)),
    '{}'::jsonb
  ) as tags_by_contact
  from display_detail_states
), evidence_rows as materialized (
  select
    e.record_id,
    e.user_id,
    e.source_type,
    e.source_id,
    e.source_label,
    e.provider,
    e.provider_record_id,
    e.evidence_ids,
    e.target_type,
    e.target_id,
    e.occurred_at,
    e.lifecycle_state,
    e.search_text,
    e.created_at,
    e.updated_at,
    e.deleted_at,
    e.payload,
    e.payload->>'id' as evidence_id,
    e.payload->>'summary' as summary
  from orbit_records e
  cross join referenced_evidence_lookup refs
  where e.workspace_id = $1
    and e.collection_name = 'evidence'
    and e.lifecycle_state <> 'deleted'
    and jsonb_typeof(e.payload->'id') = 'string'
    and jsonb_typeof(e.payload->'sourceType') = 'string'
    and jsonb_typeof(e.payload->'sourceId') = 'string'
    and jsonb_typeof(e.payload->'summary') = 'string'
    and jsonb_typeof(e.payload->'occurredAt') = 'string'
    and jsonb_typeof(e.payload->'createdBy') = 'string'
    and nullif(btrim(e.payload->>'id', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and e.payload->>'sourceType' in (${SOURCE_TYPES_SQL})
    and nullif(btrim(e.payload->>'sourceId', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(e.payload->>'summary', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and nullif(btrim(e.payload->>'occurredAt', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and jsonb_typeof(e.payload->'confidence') = 'number'
    and nullif(btrim(e.payload->>'createdBy', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and (refs.ids ? (e.payload->>'id')) is true
), evidence_map_rows as (
  select distinct on (evidence_id) *
  from evidence_rows
  order by
    evidence_id,
    coalesce(occurred_at, updated_at) asc,
    updated_at asc,
    record_id desc
), evidence_text_lookup as materialized (
  select coalesce(
    jsonb_object_agg(evidence_id, summary),
    '{}'::jsonb
  ) as summaries
  from evidence_map_rows
), evidence_projection_by_id as materialized (
  select
    e.evidence_id,
    jsonb_agg(jsonb_build_object(
      'record', jsonb_build_object(
        'workspaceId', $1,
        'collectionName', 'evidence',
        'recordId', e.record_id,
        'userId', e.user_id,
        'sourceType', e.source_type,
        'sourceId', e.source_id,
        'sourceLabel', e.source_label,
        'provider', e.provider,
        'providerRecordId', e.provider_record_id,
        'evidenceIds', e.evidence_ids,
        'targetType', e.target_type,
        'targetId', e.target_id,
        'occurredAt', e.occurred_at,
        'lifecycleState', e.lifecycle_state,
        'searchText', '',
        'payload', (
          select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
          from jsonb_each(e.payload) field
          where field.key in (${EVIDENCE_PAYLOAD_FIELDS_SQL})
        ),
        'createdAt', e.created_at,
        'updatedAt', e.updated_at,
        'deletedAt', e.deleted_at
      ),
      'sort_occurred_at', coalesce(e.occurred_at, e.updated_at),
      'sort_updated_at', e.updated_at,
      'record_id', e.record_id
    ) order by coalesce(e.occurred_at, e.updated_at) desc,
      e.updated_at desc, e.record_id asc) as records
  from evidence_rows e
  group by e.evidence_id
), evidence_projection_lookup as materialized (
  select coalesce(
    jsonb_object_agg(evidence_id, records),
    '{}'::jsonb
  ) as records_by_id
  from evidence_projection_by_id
), contact_evidence_items as materialized (
  select
    c.record_id as contact_record_id,
    c.payload->>'id' as contact_id,
    evidence_item.value #>> '{}' as evidence_id,
    evidence_item.ordinality
  from base_contacts c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.payload->'evidenceIds') = 'array'
      then c.payload->'evidenceIds' else '[]'::jsonb end
  ) with ordinality as evidence_item(value, ordinality)
  where jsonb_typeof(evidence_item.value) = 'string'
    and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
), connection_evidence_items as materialized (
  select
    ac.payload->>'contactId' as contact_id,
    evidence_item.value #>> '{}' as evidence_id,
    evidence_item.ordinality
  from actor_connections ac
  cross join authorized_contact_ids allowed
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ac.payload->'evidenceIds') = 'array'
      then ac.payload->'evidenceIds' else '[]'::jsonb end
  ) with ordinality as evidence_item(value, ordinality)
  where jsonb_typeof(evidence_item.value) = 'string'
    and nullif(btrim(evidence_item.value #>> '{}', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
    and ac.payload->>'contactId' = any(allowed.contact_ids)
), projection_evidence_items as materialized (
  select contact_id, evidence_id, ordinality
  from contact_evidence_items
  union all
  select contact_id, evidence_id, ordinality
  from connection_evidence_items
), contact_evidence_text_items as materialized (
  select
    i.contact_record_id,
    i.ordinality,
    coalesce(
      lookup.summaries ->> i.evidence_id,
      'Local remote database contact evidence is present but has no summary.'
    ) as evidence_text
  from contact_evidence_items i
  cross join evidence_text_lookup lookup
), contact_evidence_text_lookup as materialized (
  select coalesce(
    jsonb_object_agg(grouped.contact_record_id, grouped.evidence_text),
    '{}'::jsonb
  ) as texts
  from (
    select
      contact_record_id,
      string_agg(evidence_text, ' ' order by ordinality) as evidence_text
    from contact_evidence_text_items
    group by contact_record_id
  ) grouped
), contact_view_base as materialized (
  select
    c.record_id,
    c.user_id,
    c.source_type as record_source_type,
    c.source_id as record_source_id,
    c.source_label as record_source_label,
    c.provider,
    c.provider_record_id,
    c.evidence_ids as record_evidence_ids,
    c.target_type,
    c.target_id,
    c.occurred_at,
    coalesce(c.occurred_at, c.record_updated_at) as sort_occurred_at,
    c.lifecycle_state,
    c.search_text,
    c.created_at,
    c.record_updated_at as sort_updated_at,
    c.deleted_at,
    c.payload,
    c.payload->>'id' as contact_id,
    c.payload->>'displayName' as display_name,
    case when jsonb_typeof(c.payload->'role') = 'string' then c.payload->>'role' else '' end as role,
    case when jsonb_typeof(c.payload->'organization') = 'string' then c.payload->>'organization' else '' end as organization,
    case when jsonb_typeof(c.payload->'location') = 'string' then c.payload->>'location' else '' end as location,
    case when jsonb_typeof(c.payload->'profileSnippet') = 'string' then c.payload->>'profileSnippet' else null end as profile_snippet_raw,
    c.payload->'nextAction' as next_action_value,
    case
      when jsonb_typeof(c.payload->'source'->'type') = 'string'
        and c.payload->'source'->>'type' in (${CONTACT_SOURCE_FILTERS.map((value) => `'${value}'`).join(", ")})
        then c.payload->'source'->>'type'
      else 'manual'
    end as source_type,
    case when jsonb_typeof(c.payload->'lifecycleInitialization') = 'string'
      then c.payload->>'lifecycleInitialization' else null end as contact_lifecycle_initialization,
    coalesce(
      case when c.payload->>'lifecycleInitialization' is distinct from 'pending'
        then canonical_lookup.connections -> (c.payload->>'id') ->> 'stage'
        else null
      end,
      c.payload->>'stage'
    ) as effective_stage,
    coalesce(
      case when c.payload->>'lifecycleInitialization' is distinct from 'pending'
        then canonical_lookup.connections -> (c.payload->>'id') ->> 'dto_updated_at'
        else null
      end,
      c.payload->>'updatedAt'
    ) as effective_updated_at,
    coalesce(
      display_lookup.connections -> (c.payload->>'id') ->> 'relationship_context',
      'Source-backed contact loaded from the local remote database.'
    ) as relationship_context,
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(display_lookup.connections -> (c.payload->>'id') -> 'value_types', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ) as value_types,
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(detail_lookup.tags_by_contact -> (c.payload->>'id'), '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ) as tags,
    ${needsSearchText ? "coalesce(et_lookup.texts ->> c.record_id, '')" : "''::text"} as evidence_text,
    c.contact_error_code,
    cv_lookup.error_codes ->> (c.payload->>'id') as connection_error_code,
    ${needsSearchText ? "coalesce(search_lookup.texts ->> (c.payload->>'id'), '')" : "''::text"} as connection_search_text
  from base_contacts c
  cross join connection_validation_lookup cv_lookup
  cross join display_connections_lookup display_lookup
  cross join canonical_connections_lookup canonical_lookup
  cross join display_detail_states_lookup detail_lookup
  ${needsSearchText ? "cross join contact_evidence_text_lookup et_lookup\n  cross join connection_search_lookup search_lookup" : ""}
), contact_dto as materialized (
  select
    v.*,
    case
      when nullif(btrim(v.profile_snippet_raw, ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null then v.profile_snippet_raw
      when nullif(btrim(v.role, ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null and nullif(btrim(v.organization, ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
        then v.role || ' at ' || v.organization || '.'
      else 'Source-backed contact from the local remote database.'
    end as profile_snippet,
    case
      when jsonb_typeof(v.next_action_value) = 'object'
        and jsonb_typeof(v.next_action_value->'text') = 'string'
        and nullif(btrim(v.next_action_value->>'text', ${ECMASCRIPT_TRIM_CHARS_SQL}), '') is not null
        then btrim(v.next_action_value->>'text', ${ECMASCRIPT_TRIM_CHARS_SQL})
      when v.effective_stage = 'needs_follow_up'
        then 'Review the next follow-up for ' || v.display_name || '.'
      else 'Review ' || v.display_name || ' with source evidence before agent use.'
    end as next_action,
    case v.effective_stage
      when 'captured' then 'needs_follow_up'
      when 'reviewing' then 'active'
      when 'active' then 'active'
      when 'needs_follow_up' then 'needs_follow_up'
      when 'nurture' then 'nurture'
      when 'archived' then 'archived'
      else 'active'
    end as status,
    row_number() over (
      order by v.sort_occurred_at desc, v.sort_updated_at desc, v.record_id asc
    ) as graph_order,
    row_number() over (
      order by v.sort_occurred_at desc, v.sort_updated_at desc, v.record_id asc
    ) as storage_order
  from contact_view_base v
), contact_search_view as (
  select
    d.*,
    lower(array_to_string(array[
      coalesce(d.display_name, ''),
      coalesce(d.role, ''),
      coalesce(d.organization, ''),
      coalesce(d.location, ''),
      coalesce(d.profile_snippet, ''),
      coalesce(d.relationship_context, ''),
      coalesce(d.next_action, ''),
      coalesce(array_to_string(d.tags, ' '), ''),
      coalesce(array_to_string(d.value_types, ' '), ''),
      coalesce(d.evidence_text, ''),
      case when d.contact_error_code is not null or d.connection_error_code is not null
        then d.connection_search_text else '' end
    ], ' ')${searchCollation}) as search_blob,
    case
      when $3 = '' then 0
      when lower(d.display_name${searchCollation}) like $15 escape '\\' then 0
      else 1
    end as sort_prefix_rank
  from contact_dto d
), filtered_contacts as (
  select *
  from contact_search_view c
  where ($16::boolean or $3 = '' or c.search_blob like '%' || $3 || '%' escape '\\')
    and ($16::boolean or $6::text[] is null or c.source_type = any($6::text[]))
    and ($16::boolean or $7::text[] is null or (c.contact_lifecycle_initialization is distinct from 'pending' and c.status = any($7::text[])))
    and ($16::boolean or cardinality($8::text[]) = 0 or c.tags @> $8::text[])
    and ($16::boolean or cardinality($9::text[]) = 0 or c.value_types @> $9::text[])
), page_rows as (
  select
    c.*,
    row_number() over (
      order by c.sort_prefix_rank asc, c.sort_occurred_at desc,
        c.sort_updated_at desc, c.record_id asc
    ) as page_position
  from filtered_contacts c
  where (
    $16::boolean
    or $10::integer is null
    or c.sort_prefix_rank > $10::integer
    or (c.sort_prefix_rank = $10::integer and c.sort_occurred_at < $11::timestamptz)
    or (c.sort_prefix_rank = $10::integer and c.sort_occurred_at = $11::timestamptz and c.sort_updated_at < $12::timestamptz)
    or (c.sort_prefix_rank = $10::integer and c.sort_occurred_at = $11::timestamptz and c.sort_updated_at = $12::timestamptz and c.record_id > $13)
  )
  order by
    c.sort_prefix_rank asc,
    c.sort_occurred_at desc,
    c.sort_updated_at desc,
    c.record_id asc
  limit case when $16::boolean then 2147483647 else $14 + 1 end
), matched_count as (
  select count(*)::integer as total
  from filtered_contacts
), page_contact_id_rows as materialized (
  select distinct contact_id
  from page_rows
  where $16::boolean or page_position <= $14
), page_contact_ids as materialized (
  select coalesce(array_agg(contact_id), '{}'::text[]) as contact_ids
  from page_contact_id_rows
), facet_tag_values as materialized (
  select
    c.record_id,
    c.graph_order,
    tag.value,
    min(tag.ordinality) as tag_order
  from contact_dto c
  cross join lateral unnest(c.tags) with ordinality tag(value, ordinality)
  group by c.record_id, c.graph_order, tag.value
), facet_tag_counts as materialized (
  select value, count(*)::integer as count
  from facet_tag_values
  group by value
), facet_tag_first_occurrences as materialized (
  select distinct on (value)
    value,
    graph_order as first_order,
    tag_order as first_tag_order
  from facet_tag_values
  order by value, graph_order, tag_order
), facet_tags as (
  select
    counts.value,
    counts.count,
    first_occurrence.first_order,
    first_occurrence.first_tag_order
  from facet_tag_counts counts
  join facet_tag_first_occurrences first_occurrence
    on first_occurrence.value = counts.value
), facet_sources as (
  select source_type, count(*)::integer as count
  from contact_dto c
  group by source_type
), facet_value_values as materialized (
  select distinct c.record_id, c.graph_order, value.value
  from contact_dto c
  cross join lateral unnest(c.value_types) value(value)
), facet_values as (
  select value, count(*)::integer as count
  from facet_value_values
  group by value
), facet_statuses as (
  select status, count(*)::integer as count
  from contact_dto
  where contact_lifecycle_initialization is distinct from 'pending'
  group by status
), facet_payload as (
  select
    coalesce((
      select jsonb_agg(jsonb_build_object('value', value, 'count', count) order by first_order, first_tag_order, value)
      from facet_tags
    ), '[]'::jsonb) as facet_tags,
    coalesce((
      select jsonb_object_agg(source_type, count)
      from facet_sources
    ), '{}'::jsonb) as facet_sources,
    coalesce((
      select jsonb_object_agg(value, count)
      from facet_values
    ), '{}'::jsonb) as facet_values,
    coalesce((
      select jsonb_object_agg(status, count)
      from facet_statuses
    ), '{}'::jsonb) as facet_statuses
), connection_projection_rows as materialized (
  select
    ac.payload->>'contactId' as contact_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'workspaceId', $1,
      'collectionName', '${CONNECTION_COLLECTION}',
      'recordId', ac.record_id,
      'userId', ac.user_id,
      'sourceType', ac.source_type,
      'sourceId', ac.source_id,
      'sourceLabel', ac.source_label,
      'provider', ac.provider,
      'providerRecordId', ac.provider_record_id,
      'evidenceIds', ac.evidence_ids,
      'targetType', ac.target_type,
      'targetId', ac.target_id,
      'occurredAt', ac.occurred_at,
      'lifecycleState', ac.lifecycle_state,
      'searchText', '',
      'payload', (
        select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
        from jsonb_each(ac.payload) field
        where field.key in (${CONNECTION_PAYLOAD_FIELDS_SQL})
      ),
      'createdAt', ac.created_at,
      'updatedAt', ac.record_updated_at,
      'deletedAt', ac.deleted_at
    ) order by coalesce(ac.occurred_at, ac.record_updated_at) desc,
      ac.record_updated_at desc, ac.record_id asc), '[]'::jsonb) as connection_records
  from actor_connections ac
  where ac.payload->>'contactId' = any(coalesce((select page_ids.contact_ids from page_contact_ids page_ids), '{}'::text[]))
  group by ac.payload->>'contactId'
), connection_projection_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, connection_records),
    '{}'::jsonb
  ) as records_by_contact
  from connection_projection_rows
), detail_projection_rows as materialized (
  select
    ds.payload->>'contactId' as contact_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'workspaceId', $1,
      'collectionName', 'contact_detail_states',
      'recordId', ds.record_id,
      'userId', ds.user_id,
      'sourceType', ds.source_type,
      'sourceId', ds.source_id,
      'sourceLabel', ds.source_label,
      'provider', ds.provider,
      'providerRecordId', ds.provider_record_id,
      'evidenceIds', ds.evidence_ids,
      'targetType', ds.target_type,
      'targetId', ds.target_id,
      'occurredAt', ds.occurred_at,
      'lifecycleState', ds.lifecycle_state,
      'searchText', '',
      'payload', (
        select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
        from jsonb_each(ds.payload) field
        where field.key in (${DETAIL_STATE_PAYLOAD_FIELDS_SQL})
      ),
      'createdAt', ds.created_at,
      'updatedAt', ds.record_updated_at,
      'deletedAt', ds.deleted_at
    ) order by coalesce(ds.occurred_at, ds.record_updated_at) desc,
      ds.record_updated_at desc, ds.record_id asc), '[]'::jsonb) as detail_state_records
  from actor_detail_states ds
  where ds.payload->>'contactId' = any(coalesce((select page_ids.contact_ids from page_contact_ids page_ids), '{}'::text[]))
  group by ds.payload->>'contactId'
), detail_projection_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, detail_state_records),
    '{}'::jsonb
  ) as records_by_contact
  from detail_projection_rows
), evidence_projection_candidates as materialized (
  select distinct on (i.contact_id, evidence_item.value->>'record_id')
    i.contact_id,
    evidence_item.value->'record' as evidence_record,
    evidence_item.value->>'sort_occurred_at' as sort_occurred_at,
    evidence_item.value->>'sort_updated_at' as sort_updated_at,
    evidence_item.value->>'record_id' as record_id
  from projection_evidence_items i
  cross join evidence_projection_lookup lookup
  cross join lateral jsonb_array_elements(
    coalesce(lookup.records_by_id -> i.evidence_id, '[]'::jsonb)
  ) with ordinality as evidence_item(value, ordinality)
  where i.contact_id = any(coalesce((select page_ids.contact_ids from page_contact_ids page_ids), '{}'::text[]))
  order by i.contact_id, evidence_item.value->>'record_id', evidence_item.ordinality
), evidence_projection_rows as materialized (
  select
    e.contact_id,
    coalesce(jsonb_agg(e.evidence_record order by e.sort_occurred_at::timestamptz desc,
      e.sort_updated_at::timestamptz desc, e.record_id asc), '[]'::jsonb) as evidence_records
  from evidence_projection_candidates e
  group by e.contact_id
), evidence_projection_by_contact_lookup as materialized (
  select coalesce(
    jsonb_object_agg(contact_id, evidence_records),
    '{}'::jsonb
  ) as records_by_contact
  from evidence_projection_rows
), projection_rows as materialized (
  select
    p.page_position,
    p.record_id,
    p.sort_prefix_rank,
    p.sort_occurred_at,
    p.sort_updated_at,
    p.storage_order,
    coalesce(p.contact_error_code, p.connection_error_code) as error_code,
    case
      when $11::timestamptz is null then true
      when p.sort_occurred_at < $11::timestamptz then true
      when p.sort_occurred_at = $11::timestamptz and p.sort_updated_at < $12::timestamptz then true
      when p.sort_occurred_at = $11::timestamptz and p.sort_updated_at = $12::timestamptz and p.record_id > $13 then true
      else false
    end as storage_after,
    jsonb_build_object(
      'workspaceId', $1,
      'collectionName', $2,
      'recordId', p.record_id,
      'userId', p.user_id,
      'sourceType', p.record_source_type,
      'sourceId', p.record_source_id,
      'sourceLabel', p.record_source_label,
      'provider', p.provider,
      'providerRecordId', p.provider_record_id,
      'evidenceIds', p.record_evidence_ids,
      'targetType', p.target_type,
      'targetId', p.target_id,
      'occurredAt', p.occurred_at,
      'lifecycleState', p.lifecycle_state,
      'searchText', '',
      'payload', (
        select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
        from jsonb_each(p.payload) field
        where field.key in (${CONTACT_PAYLOAD_FIELDS_SQL})
      ),
      'createdAt', p.created_at,
      'updatedAt', p.sort_updated_at,
      'deletedAt', p.deleted_at
    ) as contact_record,
    coalesce(connection_lookup.records_by_contact -> p.contact_id, '[]'::jsonb) as connection_records,
    coalesce(detail_lookup.records_by_contact -> p.contact_id, '[]'::jsonb) as detail_state_records,
    coalesce(evidence_lookup.records_by_contact -> p.contact_id, '[]'::jsonb) as evidence_records
  from page_rows p
  cross join connection_projection_lookup connection_lookup
  cross join detail_projection_lookup detail_lookup
  cross join evidence_projection_by_contact_lookup evidence_lookup
  where $16::boolean or p.page_position <= $14
), page_projections as materialized (
  select
    p.*,
    jsonb_build_object(
      'record_id', p.record_id,
      'sort_prefix_rank', p.sort_prefix_rank,
      'sort_occurred_at', p.sort_occurred_at,
      'sort_updated_at', p.sort_updated_at,
      'storage_order', p.storage_order,
      'error_code', p.error_code,
      'storage_after', p.storage_after,
      'contact_record', p.contact_record,
      'connection_records', p.connection_records,
      'detail_state_records', p.detail_state_records,
      'evidence_records', p.evidence_records
    ) as projection_payload
  from projection_rows p
), page_payload as (
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'record_id', p.record_id,
      'sort_prefix_rank', p.sort_prefix_rank,
      'sort_occurred_at', p.sort_occurred_at,
      'sort_updated_at', p.sort_updated_at,
      'error_code', p.error_code,
      'contact_record', p.contact_record,
      'connection_records', p.connection_records,
      'detail_state_records', p.detail_state_records,
      'evidence_records', p.evidence_records
    ) order by p.page_position), '[]'::jsonb) as page,
    exists (select 1 from page_rows p where p.page_position > $14) as has_more
  from page_projections p
), ${runtimeFingerprintCte}
${output === "cards" ? `select
  coalesce((select jsonb_agg(jsonb_build_object(
    'record_id', left(p.record_id, 512),
    'sort_prefix_rank', p.sort_prefix_rank,
    'sort_occurred_at', p.sort_occurred_at,
    'sort_updated_at', p.sort_updated_at,
    'error_code', coalesce(p.contact_error_code, p.connection_error_code,
      case when length(p.record_id) > 512 or length(p.contact_id) > 512 or length(p.effective_updated_at) > 64 then 'CONTACT_CARD_FIELD_INVALID' end),
    'card', jsonb_build_object(
      'id', left(p.contact_id, 512),
      'displayName', left(p.display_name, 128),
      'organization', left(p.organization, 128),
      'role', left(p.role, 128),
      'sourceType', p.source_type,
      'status', p.status,
      'pendingInitialization', p.contact_lifecycle_initialization is not distinct from 'pending',
      'nextActionPreview', left(p.next_action, 320),
      'valueTypes', (select coalesce(jsonb_agg(v.value order by v.first_position), '[]'::jsonb)
        from (select value, min(position) as first_position from unnest(p.value_types) with ordinality t(value, position) group by value) v),
      'updatedAt', left(p.effective_updated_at, 64)
    )
  ) order by p.page_position) from page_rows p where p.page_position <= $14), '[]'::jsonb) as page,
  exists(select 1 from page_rows p where p.page_position > $14) as has_more,
  r.fingerprint as runtime_fingerprint
from runtime_fingerprint r` : output === "summary" ? `select
  m.total,
  coalesce((select jsonb_object_agg(source_type, count) from facet_sources), '{}'::jsonb) as sources,
  coalesce((select jsonb_object_agg(status, count) from facet_statuses), '{}'::jsonb) as statuses,
  coalesce((select jsonb_object_agg(value, count) from facet_values), '{}'::jsonb) as values,
  coalesce((select jsonb_agg(jsonb_build_object('value', value, 'count', count) order by first_order, first_tag_order, value)
    from (select * from facet_tags order by first_order, first_tag_order, value limit 50) tags), '[]'::jsonb) as tags,
  exists(select 1 from facet_tags offset 50 limit 1) as has_more_tags,
  r.fingerprint as runtime_fingerprint
from matched_count m cross join runtime_fingerprint r` : `select
  'fast' as result_mode,
  m.total,
  f.facet_tags,
  f.facet_sources,
  f.facet_values,
  f.facet_statuses,
  p.page,
  p.has_more,
  null::jsonb as fallback_projection,
  r.fingerprint as runtime_fingerprint,
  null::bigint as fallback_order
from matched_count m
cross join facet_payload f
cross join page_payload p
cross join runtime_fingerprint r
where not $16::boolean
union all
select
  'fallback' as result_mode,
  null::integer as total,
  null::jsonb as facet_tags,
  null::jsonb as facet_sources,
  null::jsonb as facet_values,
  null::jsonb as facet_statuses,
  null::jsonb as page,
  false as has_more,
  p.projection_payload as fallback_projection,
  null::jsonb as runtime_fingerprint,
  p.storage_order as fallback_order
from page_projections p
where $16::boolean
order by result_mode, fallback_order nulls first`}
`;
}

const CONTACT_LIST_SQL = createContactListSql(true);
const CONTACT_FALLBACK_SQL = createContactListSql(false);

const CONTACT_CARD_SQL = [createContactListSql(false, "cards"), createContactListSql(true, "cards")];
const CONTACT_CARD_HEAD_SQL = createContactListSql(false, "cards", true);
const CONTACT_SUMMARY_SQL = [createContactListSql(false, "summary"), createContactListSql(true, "summary")];

/** Narrow, fail-closed protocol. Unlike the legacy reader, never downloads a fallback graph. */
export function createPostgresContactCardReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  cursorSecret: string;
  now?: () => number;
}) {
  if (Buffer.byteLength(input.cursorSecret) < 32) throw new Error("CONTACT_CURSOR_SECRET_MISSING");
  const now = input.now ?? Date.now;
  const sign = (payload: string) => createHmac("sha256", input.cursorSecret)
    .update("contact-card-page:v1:").update(payload).digest();
  const seal = (position: ContactPageCursor, query: ContactsListSearchFilterInput, actorId: string) => {
    const payload = encodeCursor(position, query, actorId, input.workspaceId);
    return `${payload}.${sign(payload).toString("base64url")}`;
  };
  const unseal = (query: ContactsListSearchFilterInput, actorId: string) => {
    if (!query.cursor) return null;
    if (query.cursor.length > 4096) throw new Error("CONTACT_CURSOR_INVALID");
    const [payload, signature, ...extra] = query.cursor.split(".");
    if (!payload || !signature || extra.length) throw new Error("CONTACT_CURSOR_INVALID");
    const provided = Buffer.from(signature, "base64url");
    const expected = sign(payload);
    if (provided.toString("base64url") !== signature || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error("CONTACT_CURSOR_INVALID");
    }
    const position = decodeCursor(payload, query, actorId, input.workspaceId);
    if (!position) throw new Error("CONTACT_CURSOR_INVALID");
    return position;
  };
  const execute = async (raw: ContactsListSearchFilterInput, actorId: string, summary: boolean) => {
    const query = { ...raw, limit: raw.limit ?? 30 };
    if (!actorId.trim() || !supportsBoundedContactPage(query) || query.limit > 50 ||
      (query.query?.length ?? 0) > 256 || query.contextEventId || query.scenario) {
      throw new Error("CONTACT_PAGE_INPUT_INVALID");
    }
    const cursor = unseal(query, actorId);
    const search = escapeLikePattern(query.query?.trim().toLowerCase() ?? "");
    const verified = search.length > 0;
    if (verified && !(await verifiedContactSearchRuntime(input.client, now))) {
      throw new Error("CONTACT_SEARCH_RUNTIME_UNSUPPORTED");
    }
    const sources = selectedValues(query.sourceFilters);
    const statuses = selectedValues(query.statusFilters);
    const values = [input.workspaceId, CONTACT_COLLECTION, search, actorId, CONNECTION_COLLECTION,
      sources.length ? [...sources] : null, statuses.length ? [...statuses] : null,
      [...selectedValues(query.tagFilters)], [...selectedValues(query.valueFilters)],
      cursor?.prefixRank ?? null, cursor?.occurredAt ?? null, cursor?.updatedAt ?? null, cursor?.recordId ?? null,
      query.limit, search ? `${search}%` : "%", false];
    // No derived filters: select the authorized contact page before expanding
    // relationships. Applying this shortcut to status/tag/value search would
    // incorrectly filter only a partial candidate set.
    const head = !summary && !verified && !statuses.length && !selectedValues(query.tagFilters).length && !selectedValues(query.valueFilters).length;
    const result = await input.client.query<Record<string, unknown>>(
      head ? CONTACT_CARD_HEAD_SQL : (summary ? CONTACT_SUMMARY_SQL : CONTACT_CARD_SQL)[verified ? 1 : 0]!, values,
    );
    if (result.rows.length !== 1) throw new Error("CONTACT_PAGE_RESULT_INVALID");
    const row = result.rows[0]!;
    if (verified && !runtimeTupleMatches(row.runtime_fingerprint as ContactSearchRuntimeTuple)) {
      invalidateVerifiedContactSearchRuntime(input.client, now);
      throw new Error("CONTACT_SEARCH_RUNTIME_UNSUPPORTED");
    }
    return { row, query };
  };
  return {
    async page(query: ContactsListSearchFilterInput, actorId: string): Promise<ContactCardPageDTO> {
      const { row } = await execute(query, actorId, false);
      if (!Array.isArray(row.page)) throw new Error("CONTACT_PAGE_RESULT_INVALID");
      const projections = row.page as (ContactPageProjection & { card: unknown })[];
      for (const projection of projections) if (projection.error_code) throw new Error(String(projection.error_code));
      const last = projections.at(-1);
      const hasMore = row.has_more === true;
      let nextCursor: string | null = null;
      if (hasMore) {
        const occurredAt = timestampString(last?.sort_occurred_at);
        const updatedAt = timestampString(last?.sort_updated_at);
        if (!last || typeof last.record_id !== "string" || !occurredAt || !updatedAt ||
          ![0, 1].includes(Number(last.sort_prefix_rank))) throw new Error("CONTACT_PAGE_RESULT_INVALID");
        nextCursor = seal({ prefixRank: Number(last.sort_prefix_rank), occurredAt, updatedAt, recordId: last.record_id }, query, actorId);
      }
      const page = contactCardPageSchema.parse({ items: projections.map(p => p.card), nextCursor, hasMore, asOf: new Date(now()).toISOString() });
      return { ...page, nextCursor: page.nextCursor ?? null };
    },
    async summary(query: ContactsListSearchFilterInput, actorId: string): Promise<ContactCardSummaryDTO> {
      const { row } = await execute({ ...query, cursor: undefined }, actorId, true);
      return contactCardSummarySchema.parse({ total: Number(row.total), sources: row.sources,
        statuses: row.statuses, values: row.values, tags: row.tags, hasMoreTags: row.has_more_tags,
        asOf: new Date(now()).toISOString() });
    },
  };
}

interface ContactPageQueryRow {
  result_mode?: unknown;
  total?: number | string | null;
  facet_tags?: unknown;
  facet_sources?: unknown;
  facet_values?: unknown;
  facet_statuses?: unknown;
  page?: unknown;
  has_more?: boolean | string | null;
  fallback_projection?: unknown;
  runtime_fingerprint?: unknown;
  fallback_order?: number | string | null;
}

interface ContactPageProjection {
  record_id?: unknown;
  sort_prefix_rank?: unknown;
  sort_occurred_at?: unknown;
  sort_updated_at?: unknown;
  storage_order?: unknown;
  error_code?: unknown;
  storage_after?: unknown;
  contact_record?: unknown;
  connection_records?: unknown;
  detail_state_records?: unknown;
  evidence_records?: unknown;
  projection_payload?: unknown;
}

interface ContactPageCursor {
  prefixRank: number;
  occurredAt: string;
  updatedAt: string;
  recordId: string;
}

interface DecodedCursor {
  scope: string;
  last: ContactPageCursor;
  version: 1;
}

interface ContactSearchRuntimeTuple {
  actual_collversion?: unknown;
  catalog_collversion?: unknown;
  collisdeterministic?: unknown;
  collation?: unknown;
  collprovider?: unknown;
  matcher_policy_version?: unknown;
  server_encoding?: unknown;
  server_version_num?: unknown;
}

interface RuntimeProbeCacheEntry {
  inFlight?: Promise<boolean>;
  retryAt: number;
  verified: boolean;
}

const APPROVED_CONTACT_SEARCH_RUNTIME = {
  actual_collversion: "153.136",
  catalog_collversion: "153.136",
  collisdeterministic: true,
  collation: "und-x-icu",
  collprovider: "i",
  matcher_policy_version: CONTACT_SEARCH_MATCHER_POLICY_VERSION,
  node: "25.6.0",
  server_encoding: "UTF8",
  server_version_num: "160012",
  unicode: "17.0",
  icu: "78.2",
} as const;

const CONTACT_SEARCH_RUNTIME_PROBE_SQL = `
select
  current_setting('server_version_num') as server_version_num,
  current_setting('server_encoding') as server_encoding,
  c.collname as collation,
  c.collprovider,
  c.collisdeterministic,
  c.collversion as catalog_collversion,
  pg_catalog.pg_collation_actual_version(c.oid) as actual_collversion,
  $1::text as matcher_policy_version
from pg_catalog.pg_collation c
where c.oid = 'pg_catalog."und-x-icu"'::pg_catalog.regcollation
  and c.collnamespace = (
    select n.oid from pg_catalog.pg_namespace n where n.nspname = 'pg_catalog'
  )
  and c.collname = 'und-x-icu'
`;

const CONTACT_SEARCH_RUNTIME_NEGATIVE_BACKOFF_MS = 30_000;
const runtimeProbeCache = new WeakMap<object, Map<string, RuntimeProbeCacheEntry>>();

function runtimeProbeCacheKey(): string {
  return JSON.stringify({
    icu: process.versions.icu,
    matcherPolicy: CONTACT_SEARCH_MATCHER_POLICY_VERSION,
    node: process.versions.node,
    unicode: process.versions.unicode,
  });
}

function runtimeTupleMatches(
  tuple: ContactSearchRuntimeTuple | null | undefined,
): boolean {
  if (!tuple || typeof tuple !== "object" || Array.isArray(tuple)) return false;
  return tuple.actual_collversion === APPROVED_CONTACT_SEARCH_RUNTIME.actual_collversion &&
    tuple.catalog_collversion === APPROVED_CONTACT_SEARCH_RUNTIME.catalog_collversion &&
    tuple.collisdeterministic === APPROVED_CONTACT_SEARCH_RUNTIME.collisdeterministic &&
    tuple.collation === APPROVED_CONTACT_SEARCH_RUNTIME.collation &&
    tuple.collprovider === APPROVED_CONTACT_SEARCH_RUNTIME.collprovider &&
    tuple.matcher_policy_version === APPROVED_CONTACT_SEARCH_RUNTIME.matcher_policy_version &&
    tuple.server_encoding === APPROVED_CONTACT_SEARCH_RUNTIME.server_encoding &&
    tuple.server_version_num === APPROVED_CONTACT_SEARCH_RUNTIME.server_version_num &&
    process.versions.node === APPROVED_CONTACT_SEARCH_RUNTIME.node &&
    process.versions.icu === APPROVED_CONTACT_SEARCH_RUNTIME.icu &&
    process.versions.unicode === APPROVED_CONTACT_SEARCH_RUNTIME.unicode;
}

function runtimeProbeState(client: LiveRecordSqlClient): RuntimeProbeCacheEntry {
  const clientKey = client as object;
  let byPolicy = runtimeProbeCache.get(clientKey);
  if (!byPolicy) {
    byPolicy = new Map();
    runtimeProbeCache.set(clientKey, byPolicy);
  }
  const key = runtimeProbeCacheKey();
  const existing = byPolicy.get(key);
  if (existing) return existing;
  const created = { retryAt: 0, verified: false } satisfies RuntimeProbeCacheEntry;
  byPolicy.set(key, created);
  return created;
}

async function verifiedContactSearchRuntime(
  client: LiveRecordSqlClient,
  now: () => number,
): Promise<boolean> {
  const state = runtimeProbeState(client);
  const currentTime = now();
  if (state.verified) return true;
  if (state.inFlight) return state.inFlight;
  if (state.retryAt > currentTime) return false;

  const probe = client
    .query<ContactSearchRuntimeTuple>(
      CONTACT_SEARCH_RUNTIME_PROBE_SQL,
      [CONTACT_SEARCH_MATCHER_POLICY_VERSION],
    )
    .then((result) => {
      const verified = result.rows.length === 1 && runtimeTupleMatches(result.rows[0]!);
      state.verified = verified;
      state.retryAt = verified
        ? 0
        : now() + CONTACT_SEARCH_RUNTIME_NEGATIVE_BACKOFF_MS;
      return verified;
    })
    .catch(() => {
      state.verified = false;
      state.retryAt = now() + CONTACT_SEARCH_RUNTIME_NEGATIVE_BACKOFF_MS;
      return false;
    });
  state.inFlight = probe;
  try {
    return await probe;
  } finally {
    if (state.inFlight === probe) state.inFlight = undefined;
  }
}

function invalidateVerifiedContactSearchRuntime(
  client: LiveRecordSqlClient,
  now: () => number,
): void {
  const state = runtimeProbeState(client);
  state.verified = false;
  state.retryAt = now() + CONTACT_SEARCH_RUNTIME_NEGATIVE_BACKOFF_MS;
}

function isContactSearchCompatibilitySqlError(error: unknown): boolean {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const code = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? "");
  if (!/collat|pg_collation_actual_version|und-x-icu/i.test(message)) return false;
  return code === "42704" || code === "42P21" || code === "42883" || code === "42501";
}

function selectedValues(values?: readonly string[] | null): readonly string[] {
  return values?.filter((value) => value.trim().length > 0) ?? [];
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function queryScope(
  input: ContactsListSearchFilterInput,
  actorId: string,
  workspaceId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      actorId,
      workspaceId,
      query: input.query?.trim().toLowerCase() ?? "",
      sourceFilters: selectedValues(input.sourceFilters),
      statusFilters: selectedValues(input.statusFilters),
      tagFilters: selectedValues(input.tagFilters),
      valueFilters: selectedValues(input.valueFilters),
      contextEventId: input.contextEventId?.trim() ?? "",
      sortVersion: "contact-list-keyset-v1",
    }))
    .digest("base64url");
}

function decodeCursor(
  cursor: string | null | undefined,
  input: ContactsListSearchFilterInput,
  actorId: string,
  workspaceId: string,
): ContactPageCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<DecodedCursor>;
    if (
      parsed.version !== 1 ||
      parsed.scope !== queryScope(input, actorId, workspaceId) ||
      !parsed.last ||
      typeof parsed.last !== "object" ||
      Array.isArray(parsed.last)
    ) {
      return null;
    }
    const last = parsed.last as Partial<ContactPageCursor>;
    const prefixRank = Number(last.prefixRank);
    const occurredAt = validCursorTimestamp(last.occurredAt);
    const updatedAt = validCursorTimestamp(last.updatedAt);
    if (
      !Number.isSafeInteger(prefixRank) ||
      prefixRank < 0 ||
      prefixRank > 1 ||
      !occurredAt ||
      !updatedAt ||
      typeof last.recordId !== "string" ||
      last.recordId.trim().length === 0
    ) {
      return null;
    }
    return {
      prefixRank,
      occurredAt,
      updatedAt,
      recordId: last.recordId,
    };
  } catch {
    return null;
  }
}

function encodeCursor(
  last: ContactPageCursor,
  input: ContactsListSearchFilterInput,
  actorId: string,
  workspaceId: string,
): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    scope: queryScope(input, actorId, workspaceId),
    last,
  }), "utf8").toString("base64url");
}

function timestampString(value: unknown): string | null {
  return validCursorTimestamp(value);
}

const CONTACT_LIST_CURSOR_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

function validCursorTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = CONTACT_LIST_CURSOR_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[8];
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 &&
    day >= 1 && day <= (daysInMonth ?? 0) &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59 &&
    year >= 1 &&
    offsetHour >= 0 && offsetHour <= 15 &&
    offsetMinute >= 0 && offsetMinute <= 59
    ? value
    : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseCountMap(value: unknown): Readonly<Record<string, number>> {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, count]) => {
      const numericCount = Number(count);
      return Number.isFinite(numericCount) ? [[key, numericCount]] : [];
    }),
  );
}

function parseTagCounts(value: unknown): ContactsFacetCounts["tags"] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = (item as { value?: unknown }).value;
    const count = Number((item as { count?: unknown }).count);
    return typeof value === "string" && Number.isFinite(count)
      ? [{ value, count }]
      : [];
  });
}

function facetCounts(row: ContactPageQueryRow): ContactsFacetCounts {
  return {
    tags: parseTagCounts(row.facet_tags),
    sources: parseCountMap(row.facet_sources),
    values: parseCountMap(row.facet_values),
    statuses: parseCountMap(row.facet_statuses),
  };
}

function pageProjections(value: unknown): readonly ContactPageProjection[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is ContactPageProjection => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function projectedRecords(value: unknown): readonly LiveRecord<Record<string, unknown>>[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is LiveRecord<Record<string, unknown>> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function uniqueRecords(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly LiveRecord<Record<string, unknown>>[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.recordId)) return false;
    seen.add(record.recordId);
    return true;
  });
}

function fallbackProjections(
  rows: readonly ContactPageQueryRow[],
): readonly ContactPageProjection[] {
  return rows.flatMap((row) => {
    const parsed = parseJson(row.fallback_projection);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? [parsed as ContactPageProjection]
      : [];
  });
}

function emptyFacetCounts(): ContactsFacetCounts {
  return {
    tags: [],
    sources: {},
    values: {},
    statuses: {},
  };
}

function parseFallbackContactRecordPage(
  rows: readonly ContactPageQueryRow[],
  query: ContactsListSearchFilterInput,
  actorId: string,
  workspaceId: string,
): ContactRecordPage {
  const projections = fallbackProjections(rows);
  const sortKeys = projections.map((projection) => {
    const recordId = typeof projection.record_id === "string"
      ? projection.record_id
      : "";
    const occurredAt = validCursorTimestamp(projection.sort_occurred_at);
    const updatedAt = validCursorTimestamp(projection.sort_updated_at);
    const storageOrder = Number(projection.storage_order);
    if (
      recordId.trim().length === 0 ||
      !occurredAt ||
      !updatedAt ||
      !Number.isSafeInteger(storageOrder) ||
      storageOrder < 1
    ) {
      throw new Error("CONTACT_SEARCH_FALLBACK_PROJECTION_INVALID");
    }
    return {
      occurredAt,
      recordId,
      storageOrder,
      updatedAt,
      ...(typeof projection.storage_after === "boolean"
        ? { storageAfter: projection.storage_after }
        : {}),
    };
  });

  return {
    mode: "fallback",
    connectionRecords: projections.flatMap((projection) =>
      projectedRecords(projection.connection_records),
    ),
    contactRecords: projections.flatMap((projection) =>
      projectedRecords(
        projection.contact_record === undefined
          ? []
          : [projection.contact_record],
      ),
    ),
    detailStateRecords: projections.flatMap((projection) =>
      projectedRecords(projection.detail_state_records),
    ),
    evidenceRecords: uniqueRecords(projections.flatMap((projection) =>
      projectedRecords(projection.evidence_records),
    )),
    facetCounts: emptyFacetCounts(),
    recordIds: sortKeys.map((sortKey) => sortKey.recordId),
    sortKeys,
    cursorScope: queryScope(query, actorId, workspaceId),
    total: sortKeys.length,
  };
}

function supportsBoundedContactPage(input: ContactsListSearchFilterInput): boolean {
  return input.limit !== undefined &&
    input.limit !== null &&
    Number.isSafeInteger(input.limit) &&
    input.limit >= 1 &&
    selectedValues(input.sourceFilters).every((value) => CONTACT_SOURCE_FILTERS.some((item) => item === value)) &&
    selectedValues(input.statusFilters).every((value) => CONTACT_STATUS_FILTERS.some((item) => item === value)) &&
    selectedValues(input.valueFilters).every((value) => CONTACT_VALUE_FILTERS.some((item) => item === value)) &&
    selectedValues(input.tagFilters).length <= 20 &&
    selectedValues(input.tagFilters).every((value) => Array.from(value).length <= 32);
}

export interface ContactRecordPage {
  mode?: "fast" | "fallback";
  connectionRecords: readonly LiveRecord<Record<string, unknown>>[];
  contactRecords: readonly LiveRecord<Record<string, unknown>>[];
  detailStateRecords: readonly LiveRecord<Record<string, unknown>>[];
  evidenceRecords: readonly LiveRecord<Record<string, unknown>>[];
  facetCounts: ContactsFacetCounts;
  nextCursor?: string;
  recordIds: readonly string[];
  sortKeys?: readonly ContactListSortKey[];
  cursorScope?: string;
  total: number;
}

export interface ContactListSortKey {
  occurredAt: string;
  recordId: string;
  storageOrder: number;
  updatedAt: string;
  storageAfter?: boolean;
}

export type ContactRecordPageReader = (
  input: ContactsListSearchFilterInput,
  actorId: string,
) => Promise<ContactRecordPage | null>;

export function createPostgresContactListPageReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  now?: () => number;
}): ContactRecordPageReader {
  const now = input.now ?? (() => Date.now());

  return async (query, actorId) => {
    if (!actorId.trim() || !supportsBoundedContactPage(query)) return null;

    const limit = Math.min(50, Math.max(1, Math.floor(query.limit!)));
    const search = escapeLikePattern(query.query?.trim().toLowerCase() ?? "");
    const cursor = decodeCursor(query.cursor, query, actorId, input.workspaceId);
    const hasNonEmptyQuery = search.length > 0;
    const useFallback = hasNonEmptyQuery
      ? !(await verifiedContactSearchRuntime(input.client, now))
      : false;
    const sourceFilters = selectedValues(query.sourceFilters);
    const statusFilters = selectedValues(query.statusFilters);
    const tagFilters = selectedValues(query.tagFilters);
    const valueFilters = selectedValues(query.valueFilters);
    const values: readonly unknown[] = [
      input.workspaceId,
      CONTACT_COLLECTION,
      search,
      actorId,
      CONNECTION_COLLECTION,
      sourceFilters.length > 0 ? [...sourceFilters] : null,
      statusFilters.length > 0 ? [...statusFilters] : null,
      [...tagFilters],
      [...valueFilters],
      cursor?.prefixRank ?? null,
      cursor?.occurredAt ?? null,
      cursor?.updatedAt ?? null,
      cursor?.recordId ?? null,
      limit,
      search.length > 0 ? `${search}%` : "%",
      useFallback,
    ];

    const useVerifiedSearchCollation = hasNonEmptyQuery && !useFallback;
    let result: { rows: readonly ContactPageQueryRow[] };
    try {
      result = await input.client.query<ContactPageQueryRow>(
        useVerifiedSearchCollation ? CONTACT_LIST_SQL : CONTACT_FALLBACK_SQL,
        values,
      );
    } catch (error) {
      if (!useVerifiedSearchCollation || !isContactSearchCompatibilitySqlError(error)) {
        throw error;
      }
      invalidateVerifiedContactSearchRuntime(input.client, now);
      const fallbackResult = await input.client.query<ContactPageQueryRow>(
        CONTACT_FALLBACK_SQL,
        [...values.slice(0, -1), true],
      );
      return parseFallbackContactRecordPage(
        fallbackResult.rows,
        query,
        actorId,
        input.workspaceId,
      );
    }
    if (useVerifiedSearchCollation && !runtimeTupleMatches(parseJson(result.rows[0]?.runtime_fingerprint) as ContactSearchRuntimeTuple)) {
      invalidateVerifiedContactSearchRuntime(input.client, now);
      const fallbackResult = await input.client.query<ContactPageQueryRow>(
        CONTACT_FALLBACK_SQL,
        [...values.slice(0, -1), true],
      );
      return parseFallbackContactRecordPage(
        fallbackResult.rows,
        query,
        actorId,
        input.workspaceId,
      );
    }
    if (useFallback) {
      return parseFallbackContactRecordPage(
        result.rows,
        query,
        actorId,
        input.workspaceId,
      );
    }
    const firstRow = result.rows[0];
    const returnedRows = pageProjections(firstRow?.page);
    const errorCode = returnedRows
      .map((row) => row.error_code)
      .find((value): value is string => typeof value === "string" && value.length > 0);
    if (errorCode) throw new Error(errorCode);
    const total = Number(firstRow?.total ?? 0);
    const lastRow = returnedRows.at(-1);
    const occurredAt = timestampString(lastRow?.sort_occurred_at);
    const updatedAt = timestampString(lastRow?.sort_updated_at);
    const last = lastRow &&
      typeof lastRow.record_id === "string" &&
      Number.isSafeInteger(Number(lastRow.sort_prefix_rank)) &&
      Number(lastRow.sort_prefix_rank) >= 0 &&
      Number(lastRow.sort_prefix_rank) <= 1 &&
      occurredAt &&
      updatedAt
      ? {
          prefixRank: Number(lastRow.sort_prefix_rank),
          occurredAt,
          updatedAt,
          recordId: lastRow.record_id,
        }
      : null;

    return {
      connectionRecords: returnedRows.flatMap((row) => projectedRecords(row.connection_records)),
      contactRecords: returnedRows.flatMap((row) => projectedRecords(row.contact_record ? [row.contact_record] : [])),
      detailStateRecords: returnedRows.flatMap((row) => projectedRecords(row.detail_state_records)),
      evidenceRecords: uniqueRecords(returnedRows.flatMap((row) => projectedRecords(row.evidence_records))),
      facetCounts: facetCounts(firstRow ?? {}),
      recordIds: returnedRows.flatMap((row) => typeof row.record_id === "string" ? [row.record_id] : []),
      total: Number.isFinite(total) ? total : 0,
      ...(firstRow?.has_more === true && last
        ? { nextCursor: encodeCursor(last, query, actorId, input.workspaceId) }
        : {}),
    };
  };
}
