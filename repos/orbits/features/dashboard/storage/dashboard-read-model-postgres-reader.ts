import {
  DASHBOARD_SHORT_LIST_LIMIT,
  type DashboardAggregateSourceReference,
  type DashboardRecentActivity,
} from "../contract";
import {
  dashboardDueLabel,
  dashboardValueType,
} from "../aggregate-projection";
import type {
  DashboardAggregateReadModel,
  DashboardContactRoleCount,
} from "../live-service";
import type { NetworkDistributionReadModel } from "./network-distribution-live-record-provider";
import type { RelationshipTierAssignment } from "../../../shared/compute/dashboard-distribution-contract";
import type { ConnectionDTO, TaskDTO } from "../../../shared/domain/contracts";
import { INDUSTRY_IDS } from "../../../shared/domain/industries";
import {
  RELATIONSHIP_STAGE_VALUES,
  RELATIONSHIP_VALUE_TYPES,
  SOURCE_TYPES,
} from "../../../shared/domain/source-types";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import {
  ACTIVITY_ORDER_COLLATION,
  activityOrderSafeSql,
  DashboardSummaryRequiresGraphFallback,
  evidenceLateralSql,
  javascriptTrimCharacters,
  jsonStringNonEmpty,
  payloadStringNonEmpty,
  queryWithActivityCollation,
  sourceStringNonEmpty,
  valueTypesArrayExpression,
} from "./dashboard-summary-postgres-reader";

// Sprint 0101 (dashboard D1): totals, short lists and distributions are
// computed in PostgreSQL and only the results leave the database. The record
// predicates repeat the full-graph mappers in dashboard-live-record-provider.ts
// exactly (same as the B3 summary reader); list order is the graph order
// `coalesce(occurred_at, updated_at) desc, updated_at desc, record_id`.
// tests/services/dashboard-sql-read-model-postgres.test.ts compares every
// number and list with the JS graph implementation.

const collections = [
  "connections",
  "contacts",
  "contact_detail_states",
  "events",
  "evidence",
  "tasks",
] as const;

const graphOrder = "coalesce(occurred_at, updated_at) desc, updated_at desc, record_id";

function jsTrimmed(field: string): string {
  return `case when ${payloadStringNonEmpty(field)} then btrim(payload ->> '${field}', ${javascriptTrimCharacters}) end`;
}

function rawIfNonEmpty(field: string): string {
  return `case when ${payloadStringNonEmpty(field)} then payload ->> '${field}' end`;
}

/**
 * W0049：结构标签新维度的原始 key，与 shared/compute/dashboard-graph.ts 的 structureFields 一一对应
 * （非空判断用同一 ECMAScript trim；值本身不 trim）。
 * - 职级：`publicProfile.seniorityLevel` 原值（六档 → 四组在 compute 里用 seniorityGroup 派生）；
 * - 地区：`region.countryCode` 为两位大写字母时 `<CC>|<city 原值或空串>`；
 * - 二级行业：`secondaryIndustryId` 原值（是否属于该一级由 compute 的 sanitizeIndustryPair 判定）。
 */
const seniorityKeySql = `case when ${jsonStringNonEmpty("payload -> 'publicProfile' -> 'seniorityLevel'", "payload -> 'publicProfile' ->> 'seniorityLevel'")}
      then payload -> 'publicProfile' ->> 'seniorityLevel' end`;
const regionKeySql = `case when jsonb_typeof(payload -> 'region') = 'object'
      and jsonb_typeof(payload -> 'region' -> 'countryCode') = 'string'
      and (payload -> 'region' ->> 'countryCode') ~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{2}$'
      then (payload -> 'region' ->> 'countryCode') || '|' || coalesce(case when ${jsonStringNonEmpty("payload -> 'region' -> 'city'", "payload -> 'region' ->> 'city'")}
        then payload -> 'region' ->> 'city' end, '') end`;

const scopedRecordsSql = `
scoped_records as (
  select collection_name, record_id, occurred_at, updated_at, payload
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and (collection_name <> 'contacts' or
      (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($2::text)))
    and collection_name = any($3::text[])
    and lifecycle_state <> 'deleted'
)`;

const sourcePredicates = `
    and jsonb_typeof(payload -> 'source') = 'object'
    and ${sourceStringNonEmpty("type")}
    and payload -> 'source' ->> 'type' = any($4::text[])
    and ${sourceStringNonEmpty("id")}
    and jsonb_array_length(recordEvidence.evidence_ids) > 0`;

const contactPredicates = `
  where collection_name = 'contacts'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("displayName")}
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    and jsonb_typeof(payload -> 'stage') = 'string'
    and payload ->> 'stage' = any($5::text[])
    ${sourcePredicates}`;

const connectionPredicates = `
  where collection_name = 'connections'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("accountId")}
    and ${payloadStringNonEmpty("contactId")}
    and ${payloadStringNonEmpty("summary")}
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    and jsonb_typeof(payload -> 'stage') = 'string'
    and payload ->> 'stage' = any($5::text[])
    ${sourcePredicates}`;

const legalValueTypesLateralSql = `
    cross join lateral (
      select coalesce(
        jsonb_agg(value_type.value #>> '{}' order by value_type.ordinal)
          filter (
            where jsonb_typeof(value_type.value) = 'string'
              and value_type.value #>> '{}' = any($6::text[])
          ),
        '[]'::jsonb
      ) as value_types
      from jsonb_array_elements(${valueTypesArrayExpression}) with ordinality
        as value_type(value, ordinal)
    ) as legal_value_types`;

/** First `$limit` distinct evidence ids of a relation, in (part, graph_pos, ordinal) order. */
function firstDistinctEvidenceSql(parts: readonly string[], limitParameter: string): string {
  const rows = parts
    .map((relation, index) => `
      select ${index + 1}::bigint as part, source.graph_pos, evidence_value.ordinal, evidence_value.value #>> '{}' as evidence_id
      from ${relation} as source
      cross join lateral jsonb_array_elements(source.evidence_ids) with ordinality as evidence_value(value, ordinal)`)
    .join("\n      union all");
  return `coalesce((
    select jsonb_agg(evidence_id order by position)
    from (
      select evidence_id, min(array[part, graph_pos, ordinal]) as position
      from (${rows}) as evidence_rows
      group by evidence_id
      order by position
      limit ${limitParameter}
    ) as first_evidence
  ), '[]'::jsonb)`;
}

const aggregateSql = `
/* dashboard aggregate read model (0101): totals and short lists only */
with ${scopedRecordsSql},
valid_contacts as (
  select
    record_id,
    payload ->> 'id' as id,
    payload ->> 'displayName' as display_name,
    payload ->> 'stage' as stage,
    payload ->> 'createdAt' as created_at,
    coalesce(${rawIfNonEmpty("organization")}, '') as organization,
    payload -> 'source' ->> 'type' as source_type,
    payload -> 'source' ->> 'id' as source_id,
    case when ${sourceStringNonEmpty("label")} then payload -> 'source' ->> 'label' end as source_label,
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  ${contactPredicates}
),
contact_lookup as (
  select distinct on (id) id, display_name, organization
  from valid_contacts
  order by id, graph_pos desc
),
valid_connections as (
  select
    payload ->> 'id' as id,
    payload ->> 'contactId' as contact_id,
    payload ->> 'summary' as summary,
    case
      when jsonb_typeof(payload -> 'businessRelevanceScore') = 'number'
        then (payload ->> 'businessRelevanceScore')::double precision
      when jsonb_typeof(payload -> 'relationshipStrength') = 'number'
        then (payload ->> 'relationshipStrength')::double precision
      else least(95::double precision, 60 + jsonb_array_length(legal_value_types.value_types) * 10)
    end as priority_raw,
    legal_value_types.value_types,
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  ${legalValueTypesLateralSql}
  ${connectionPredicates}
),
valid_events as (
  select
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  where collection_name = 'events'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("name")}
    and ${payloadStringNonEmpty("startsAt")}
    ${sourcePredicates}
),
valid_tasks as (
  select
    payload ->> 'id' as id,
    payload ->> 'title' as title,
    payload ->> 'status' as status,
    ${rawIfNonEmpty("contactId")} as contact_id,
    ${rawIfNonEmpty("dueAt")} as due_at,
    payload ->> 'updatedAt' as updated_at_text,
    case when ${sourceStringNonEmpty("label")} then payload -> 'source' ->> 'label' end as source_label,
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  where collection_name = 'tasks'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("title")}
    and jsonb_typeof(payload -> 'status') = 'string'
    and payload ->> 'status' in ('open', 'scheduled', 'completed', 'dismissed')
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    ${sourcePredicates}
),
recent_activity_candidates as (
  select
    'activity:dashboard:contact:' || id as activity_id,
    'new_contact' as activity_type,
    display_name || ' added to the live relationship database' as activity_label,
    created_at as activity_at,
    coalesce(source_label, 'Live contact source') as activity_source_label,
    evidence_ids,
    0 as activity_group_rank,
    graph_pos
  from valid_contacts
  union all
  select
    'activity:dashboard:task:' || id,
    'followup_due',
    title,
    updated_at_text,
    coalesce(source_label, 'Live task source'),
    evidence_ids,
    1,
    graph_pos
  from valid_tasks
)
select
  (select coalesce(max(updated_at), to_timestamp(0)) from scoped_records) as generated_at,
  (select count(*)::int from valid_contacts) as contacts_count,
  (select count(*)::int from valid_connections) as connections_count,
  (select count(*)::int from valid_connections where jsonb_array_length(evidence_ids) > 0) as evidence_backed_count,
  (select count(*)::int from valid_events) as events_count,
  -- For the non-negative score range used here, Math.round(score) >= 70 iff score >= 69.5.
  (select count(*)::int from valid_connections where priority_raw >= 69.5) as high_value_count,
  (select count(*)::int from valid_tasks where status in ('open', 'scheduled')) as pending_count,
  (select count(*)::int from valid_contacts where stage = 'nurture') as dormant_count,
  ${firstDistinctEvidenceSql(["valid_contacts", "valid_connections", "valid_events", "valid_tasks"], "$8")} as provenance_evidence_ids,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'displayName', display_name, 'organization', organization,
      'sourceType', source_type, 'sourceId', source_id, 'sourceLabel', source_label,
      'evidenceIds', evidence_ids) order by graph_pos)
    from (select * from valid_contacts order by graph_pos limit $8) as limited
  ), '[]'::jsonb) as new_contacts,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'contactName', contact_name, 'organization', contact_organization,
      'valueTypes', value_types, 'priorityRaw', priority_raw, 'summary', summary,
      'evidenceIds', evidence_ids) order by graph_pos)
    from (
      select connection.*, lookup.display_name as contact_name, lookup.organization as contact_organization
      from valid_connections as connection
      left join contact_lookup as lookup on lookup.id = connection.contact_id
      where connection.priority_raw >= 69.5
      order by connection.graph_pos
      limit $8
    ) as limited
  ), '[]'::jsonb) as high_value,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'dueAt', due_at, 'contactName', contact_name,
      'evidenceIds', evidence_ids) order by graph_pos)
    from (
      select task.*, lookup.display_name as contact_name
      from valid_tasks as task
      left join contact_lookup as lookup on lookup.id = task.contact_id
      where task.status in ('open', 'scheduled')
      order by task.graph_pos
      limit $8
    ) as limited
  ), '[]'::jsonb) as pending,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'displayName', display_name, 'organization', organization,
      'evidenceIds', evidence_ids) order by graph_pos)
    from (select * from valid_contacts where stage = 'nurture' order by graph_pos limit $8) as limited
  ), '[]'::jsonb) as dormant,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'activityId', activity_id, 'type', activity_type, 'label', activity_label,
      'occurredAt', activity_at, 'sourceLabel', activity_source_label,
      'evidenceIds', evidence_ids) order by activity_at collate ${ACTIVITY_ORDER_COLLATION} desc, activity_group_rank, graph_pos)
    from (
      select * from recent_activity_candidates
      order by activity_at collate ${ACTIVITY_ORDER_COLLATION} desc, activity_group_rank, graph_pos
      limit $7
    ) as limited
  ), '[]'::jsonb) as recent_activity,
  (select coalesce(
    ${activityOrderSafeSql},
    true
  ) from recent_activity_candidates) as activity_order_safe
`;

const roleCountsSql = `
/* contact role counts (0101): trimmed roles and counts, no contact payloads */
with ${scopedRecordsSql},
valid_contacts as (
  select ${jsTrimmed("role")} as role
  from scoped_records
  ${evidenceLateralSql()}
  ${contactPredicates}
)
select role, count(*)::int as count
from valid_contacts
where role is not null
group by role
order by role
`;

const distributionSql = `
/* network distribution read model (0101): grouped counts and short lists only */
with ${scopedRecordsSql},
valid_contacts as (
  select
    payload ->> 'id' as id,
    case when jsonb_typeof(payload -> 'primaryIndustryId') = 'string'
      and payload ->> 'primaryIndustryId' = any($7::text[])
      then payload ->> 'primaryIndustryId' end as industry_key,
    ${jsTrimmed("location")} as location_key,
    ${jsTrimmed("role")} as role_key,
    ${jsTrimmed("organization")} as organization_key,
    ${rawIfNonEmpty("role")} as role_raw,
    ${rawIfNonEmpty("organization")} as organization_raw,
    ${seniorityKeySql} as seniority_key,
    ${regionKeySql} as region_key,
    ${rawIfNonEmpty("secondaryIndustryId")} as secondary_key,
    case when payload -> 'source' ->> 'type' in
      ('manual', 'event_import', 'email_signal', 'calendar_signal', 'chat_summary', 'referral')
      then payload -> 'source' ->> 'type' else 'system' end as source_type,
    payload -> 'source' ->> 'id' as source_id,
    case when ${sourceStringNonEmpty("label")} then payload -> 'source' ->> 'label' end as source_label,
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  ${contactPredicates}
),
valid_connections as (
  select
    payload ->> 'id' as id,
    payload ->> 'contactId' as contact_id,
    case
      when jsonb_typeof(payload -> 'relationshipStrength') = 'number'
        then (payload ->> 'relationshipStrength')::double precision
      when jsonb_typeof(payload -> 'businessRelevanceScore') = 'number'
        then (payload ->> 'businessRelevanceScore')::double precision
      else 0::double precision
    end as strength_score,
    legal_value_types.value_types,
    recordEvidence.evidence_ids,
    row_number() over (order by ${graphOrder}) as graph_pos
  from scoped_records
  ${evidenceLateralSql()}
  ${legalValueTypesLateralSql}
  ${connectionPredicates}
),
connection_strengths as (
  select *, case when strength_score >= 70 then 'strong' when strength_score >= 45 then 'warm' else 'weak' end as strength
  from valid_connections
),
connection_by_contact as (
  select distinct on (contact_id) contact_id, strength
  from connection_strengths
  order by contact_id, graph_pos desc
),
contact_lookup as (
  select distinct on (id) id, role_raw, organization_raw
  from valid_contacts
  order by id, graph_pos desc
),
contact_dimensions as (
  select contact.*,
    coalesce(link.strength, 'weak') as strength_key,
    link.contact_id is null as strength_missing
  from valid_contacts as contact
  left join connection_by_contact as link on link.contact_id = contact.id
),
dimension_rows as (
  select 'industry' as dimension, industry_key as key, graph_pos, evidence_ids, industry_key is null as missing from contact_dimensions
  union all select 'location', location_key, graph_pos, evidence_ids, location_key is null from contact_dimensions
  union all select 'role', role_key, graph_pos, evidence_ids, role_key is null from contact_dimensions
  union all select 'relationship', strength_key, graph_pos, evidence_ids, strength_missing from contact_dimensions
  /* W0049: new dimensions; their groups carry no evidence (excluded from dimension_evidence). */
  union all select 'seniority', seniority_key, graph_pos, evidence_ids, seniority_key is null from contact_dimensions
  union all select 'region', region_key, graph_pos, evidence_ids, region_key is null from contact_dimensions
  union all select 'industry_secondary', industry_key || '|' || coalesce(secondary_key, ''), graph_pos, evidence_ids, secondary_key is null
    from contact_dimensions where industry_key is not null
),
dimension_evidence as (
  select dimension, key, evidence_value.value #>> '{}' as evidence_id,
    min(array[dimension_rows.graph_pos, evidence_value.ordinal]) as position
  from dimension_rows
  cross join lateral jsonb_array_elements(dimension_rows.evidence_ids) with ordinality as evidence_value(value, ordinal)
  where dimension in ('industry', 'location', 'role', 'relationship')
  group by dimension, key, evidence_value.value #>> '{}'
),
ranked_dimension_evidence as (
  select *, row_number() over (partition by dimension, key order by position) as rank
  from dimension_evidence
),
industry_organizations as (
  select industry_key as key, organization_key as organization, count(*)::int as count
  from contact_dimensions
  where organization_key is not null
  group by industry_key, organization_key
),
ranked_industry_organizations as (
  select *, dense_rank() over (partition by key order by count desc) as rank
  from industry_organizations
),
industry_sources as (
  select industry_key as key, source_type, source_id,
    min(graph_pos) as first_position,
    (array_agg(source_label order by graph_pos desc))[1] as label
  from contact_dimensions
  group by industry_key, source_type, source_id
),
ranked_industry_sources as (
  select *, row_number() over (partition by key order by first_position) as rank
  from industry_sources
),
value_type_members as (
  select connection.id, connection.graph_pos, connection.evidence_ids, member.value_type
  from connection_strengths as connection
  left join contact_lookup as lookup on lookup.id = connection.contact_id
  cross join lateral (values
    ('commercial_opportunity', connection.value_types ? 'commercial_opportunity'),
    ('strategic_fit', connection.value_types ? 'strategic_fit'),
    ('referral_path', connection.value_types ? 'referral_path'),
    ('investor_access',
      -- JS /investor|capital|投资|资本/i without the u flag folds ASCII letters only.
      translate(coalesce(lookup.role_raw, '') || ' ' || coalesce(lookup.organization_raw, ''),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') ~ '(investor|capital|投资|资本)')
  ) as member(value_type, is_member)
  where member.is_member
),
/* W0047: tier groups from the relationship_strengths read model (built only from the relationship timeline;
   never feeds strength_score). One row per valid contact that has a cache row; dormant first. */
relationship_tier_members as (
  select distinct on (contact.id) contact.id, contact.graph_pos,
    case when (strength.payload ->> 'dormant')::boolean then 'dormant' else strength.payload ->> 'tier' end as tier_group
  from valid_contacts as contact
  join orbit_records as strength
    on strength.workspace_id = $1
    and strength.collection_name = 'relationship_strengths'
    and strength.record_id = 'relationship-strength:' || $2 || ':' || contact.id
    and strength.user_id = $2
    and strength.lifecycle_state <> 'deleted'
  order by contact.id, contact.graph_pos
)
select
  (select coalesce(max(updated_at), to_timestamp(0)) from scoped_records) as generated_at,
  (select count(*)::int from valid_contacts) as contacts_count,
  (select count(*)::int from valid_connections) as connections_count,
  coalesce((
    select jsonb_agg(jsonb_build_object('dimension', dimension, 'key', key, 'count', count,
      'firstPosition', first_position, 'firstMissing', first_missing))
    from (
      select dimension, key, count(*)::int as count, min(graph_pos) as first_position,
        (array_agg(missing order by graph_pos))[1] as first_missing
      from dimension_rows
      group by dimension, key
    ) as groups
  ), '[]'::jsonb) as structure_groups,
  coalesce((
    select jsonb_agg(jsonb_build_object('dimension', dimension, 'key', key,
      'evidenceId', evidence_id, 'position', position))
    from ranked_dimension_evidence where rank <= $8
  ), '[]'::jsonb) as structure_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'organization', organization, 'count', count))
    from ranked_industry_organizations where rank <= 3
  ), '[]'::jsonb) as industry_organizations,
  coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'type', source_type, 'id', source_id,
      'label', label) order by key, first_position)
    from ranked_industry_sources where rank <= 3
  ), '[]'::jsonb) as industry_sources,
  coalesce((
    select jsonb_agg(jsonb_build_object('valueType', value_type, 'count', count,
      'exampleConnectionIds', example_ids, 'evidenceIds', evidence_ids))
    from (
      select member.value_type, count(*)::int as count,
        (array_agg(member.id order by member.graph_pos))[1:3] as example_ids,
        coalesce((
          select jsonb_agg(evidence_id order by position)
          from (
            select evidence_value.value #>> '{}' as evidence_id,
              min(array[inner_member.graph_pos, evidence_value.ordinal]) as position
            from value_type_members as inner_member
            cross join lateral jsonb_array_elements(inner_member.evidence_ids) with ordinality as evidence_value(value, ordinal)
            where inner_member.value_type = member.value_type
            group by evidence_value.value #>> '{}'
            order by position
            limit $8
          ) as first_evidence
        ), '[]'::jsonb) as evidence_ids
      from value_type_members as member
      group by member.value_type
    ) as value_types
  ), '[]'::jsonb) as value_types,
  coalesce((
    select jsonb_agg(jsonb_build_object('strength', strength, 'count', count, 'evidenceIds', evidence_ids))
    from (
      select outer_connection.strength, count(*)::int as count,
        coalesce((
          select jsonb_agg(evidence_id order by position)
          from (
            select evidence_value.value #>> '{}' as evidence_id,
              min(array[inner_connection.graph_pos, evidence_value.ordinal]) as position
            from connection_strengths as inner_connection
            cross join lateral jsonb_array_elements(inner_connection.evidence_ids) with ordinality as evidence_value(value, ordinal)
            where inner_connection.strength = outer_connection.strength
            group by evidence_value.value #>> '{}'
            order by position
            limit $8
          ) as first_evidence
        ), '[]'::jsonb) as evidence_ids
      from connection_strengths as outer_connection
      group by outer_connection.strength
    ) as strengths
  ), '[]'::jsonb) as strengths,
  coalesce((
    select jsonb_agg(jsonb_build_object('tier', tier_group, 'count', count, 'contactIds', contact_ids) order by tier_group)
    from (
      select tier_group, count(*)::int as count, to_jsonb((array_agg(id order by graph_pos))[1:$8]) as contact_ids
      from relationship_tier_members
      where tier_group in ('new', 'active', 'core', 'dormant')
      group by tier_group
    ) as tiers
  ), '[]'::jsonb) as relationship_tiers,
  ${firstDistinctEvidenceSql(["valid_contacts", "valid_connections"], "$8")} as provenance_evidence_ids
`;

/** W0047: the actor's tier rows, projected (no signals); bounded like the read model it reads. */
const relationshipTiersSql = `
/* relationship-strength:tiers-for-graph */
select payload ->> 'contactId' as contact_id, payload ->> 'tier' as tier, (payload ->> 'dormant')::boolean as dormant
from orbit_records
where workspace_id = $1
  and collection_name = 'relationship_strengths'
  and user_id = $2
  and lifecycle_state <> 'deleted'
order by record_id collate "C"
limit 5000
`;

function jsonArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

function strings(value: unknown): readonly string[] {
  return jsonArray(value).filter((item): item is string => typeof item === "string");
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return jsonArray(value).filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Dashboard read model returned a non-string field");
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Dashboard read model returned a non-numeric count");
  return parsed;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

const aggregateSourceTypes = new Set<DashboardAggregateSourceReference["type"]>([
  "manual",
  "event_import",
  "email_signal",
  "calendar_signal",
  "chat_summary",
  "system",
]);

function aggregateModelFromRow(row: Record<string, unknown>): DashboardAggregateReadModel {
  const generatedAt = timestamp(row.generated_at);
  const provenanceEvidenceIds = strings(row.provenance_evidence_ids);
  return {
    generatedAt,
    relationshipAssetTotals: {
      contacts: count(row.contacts_count),
      connections: count(row.connections_count),
      evidenceBackedRelationships: count(row.evidence_backed_count),
      eventsRepresented: count(row.events_count),
    },
    newContactsCount: count(row.contacts_count),
    highValueCount: count(row.high_value_count),
    pendingFollowupCount: count(row.pending_count),
    dormantContactCount: count(row.dormant_count),
    provenanceEvidenceIds: provenanceEvidenceIds.length > 0
      ? provenanceEvidenceIds
      : ["evidence:dashboard-live-store-empty"],
    newContacts: records(row.new_contacts).map((item) => {
      const sourceType = text(item.sourceType) as DashboardAggregateSourceReference["type"];
      const label = optionalText(item.sourceLabel) ?? "Live dashboard contact source";
      return {
        contactId: text(item.id),
        name: text(item.displayName),
        organization: text(item.organization),
        sourceLabel: label,
        source: {
          type: aggregateSourceTypes.has(sourceType) ? sourceType : "system",
          id: text(item.sourceId),
          label,
          providerRecordId: text(item.sourceId),
          generatedBy: "live-store-query" as const,
        },
        evidenceIds: strings(item.evidenceIds),
      };
    }),
    highValueRelationships: records(row.high_value).map((item) => {
      const priorityScore = Math.round(count(item.priorityRaw));
      return {
        connectionId: text(item.id),
        contactName: optionalText(item.contactName) ?? "Live relationship contact",
        organization: optionalText(item.organization) ?? "",
        valueType: dashboardValueType({ valueTypes: strings(item.valueTypes) } as ConnectionDTO),
        priorityScore,
        reason: text(item.summary),
        evidenceIds: strings(item.evidenceIds),
      };
    }),
    pendingFollowups: records(row.pending).map((item) => ({
      taskId: text(item.id),
      contactName: optionalText(item.contactName) ?? "Live relationship contact",
      dueLabel: dashboardDueLabel({ dueAt: optionalText(item.dueAt) } as TaskDTO, generatedAt),
      recommendedAction: text(item.title),
      evidenceIds: strings(item.evidenceIds),
    })),
    dormantContacts: records(row.dormant).map((item) => ({
      contactId: text(item.id),
      contactName: text(item.displayName),
      organization: text(item.organization),
      lastTouchpointDays: 30,
      suggestedAction:
        "Review live relationship evidence before restarting this relationship.",
      evidenceIds: strings(item.evidenceIds),
    })),
    recentActivity: records(row.recent_activity).map((item) => ({
      activityId: text(item.activityId),
      type: text(item.type) as DashboardRecentActivity["type"],
      label: text(item.label),
      occurredAt: text(item.occurredAt),
      sourceLabel: text(item.sourceLabel),
      evidenceIds: strings(item.evidenceIds),
    })),
  };
}

function positions(value: unknown): readonly number[] {
  return jsonArray(value).map(count);
}

function distributionModelFromRow(row: Record<string, unknown>): NetworkDistributionReadModel {
  return {
    generatedAt: timestamp(row.generated_at),
    contactsCount: count(row.contacts_count),
    connectionsCount: count(row.connections_count),
    structureGroups: records(row.structure_groups).map((item) => ({
      dimension: text(item.dimension) as NetworkDistributionReadModel["structureGroups"][number]["dimension"],
      key: optionalText(item.key) ?? null,
      count: count(item.count),
      firstPosition: count(item.firstPosition),
      firstMissing: item.firstMissing === true,
    })),
    structureEvidence: records(row.structure_evidence).map((item) => ({
      dimension: text(item.dimension) as NetworkDistributionReadModel["structureEvidence"][number]["dimension"],
      key: optionalText(item.key) ?? null,
      evidenceId: text(item.evidenceId),
      position: positions(item.position),
    })),
    industryOrganizations: records(row.industry_organizations).map((item) => ({
      key: optionalText(item.key) ?? null,
      organization: text(item.organization),
      count: count(item.count),
    })),
    industrySources: records(row.industry_sources).map((item) => ({
      key: optionalText(item.key) ?? null,
      type: text(item.type),
      id: text(item.id),
      label: optionalText(item.label) ?? null,
    })),
    valueTypes: records(row.value_types).map((item) => ({
      valueType: text(item.valueType),
      count: count(item.count),
      exampleConnectionIds: strings(item.exampleConnectionIds),
      evidenceIds: strings(item.evidenceIds),
    })),
    strengths: records(row.strengths).map((item) => ({
      strength: text(item.strength),
      count: count(item.count),
      evidenceIds: strings(item.evidenceIds),
    })),
    relationshipTiers: records(row.relationship_tiers).map((item) => ({
      tier: text(item.tier),
      count: count(item.count),
      contactIds: strings(item.contactIds),
    })),
    provenanceEvidenceIds: strings(row.provenance_evidence_ids),
  };
}

export interface DashboardReadModelPostgresReader {
  readAggregateForAccount: (
    accountId: string,
    input: { activityLimit: number },
  ) => Promise<DashboardAggregateReadModel>;
  readContactRoleCountsForAccount: (
    accountId: string,
  ) => Promise<readonly DashboardContactRoleCount[]>;
  readDistributionForAccount: (
    accountId: string,
  ) => Promise<NetworkDistributionReadModel>;
  /** W0047: every relationship_strengths row of the actor projected to its tier (graph-path input). */
  readRelationshipTiersForAccount: (
    accountId: string,
  ) => Promise<readonly RelationshipTierAssignment[]>;
}

export function createDashboardReadModelPostgresReader({
  client,
  workspaceId,
}: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): DashboardReadModelPostgresReader {
  const base = (accountId: string) => [
    workspaceId,
    accountId,
    [...collections],
    [...SOURCE_TYPES],
    [...RELATIONSHIP_STAGE_VALUES],
    [...RELATIONSHIP_VALUE_TYPES],
  ];

  return {
    async readAggregateForAccount(accountId, { activityLimit }) {
      const result = await queryWithActivityCollation(() => client.query<Record<string, unknown>>(aggregateSql, [
        ...base(accountId),
        Math.max(0, Math.min(activityLimit, DASHBOARD_SHORT_LIST_LIMIT)),
        DASHBOARD_SHORT_LIST_LIMIT,
      ]));
      const row = result.rows[0];
      if (!row) throw new Error("Dashboard aggregate read model returned no row");
      // Activity order is only reproducible in SQL for canonical ISO strings;
      // otherwise the caller falls back to the full-graph JS ordering.
      if (row.activity_order_safe === false) throw new DashboardSummaryRequiresGraphFallback();
      return aggregateModelFromRow(row);
    },
    async readContactRoleCountsForAccount(accountId) {
      const result = await client.query<{ role: string; count: number | string }>(
        roleCountsSql,
        base(accountId).slice(0, 5),
      );
      return result.rows.map((row) => ({ role: row.role, count: count(row.count) }));
    },
    async readDistributionForAccount(accountId) {
      const result = await client.query<Record<string, unknown>>(distributionSql, [
        ...base(accountId),
        [...INDUSTRY_IDS],
        DASHBOARD_SHORT_LIST_LIMIT,
      ]);
      const row = result.rows[0];
      if (!row) throw new Error("Network distribution read model returned no row");
      return distributionModelFromRow(row);
    },
    async readRelationshipTiersForAccount(accountId) {
      const result = await client.query<{ contact_id: string; tier: string; dormant: boolean | null }>(
        relationshipTiersSql,
        [workspaceId, accountId],
      );
      return result.rows.flatMap((row) =>
        row.tier === "new" || row.tier === "active" || row.tier === "core"
          ? [{ contactId: row.contact_id, tier: row.tier, dormant: row.dormant === true }]
          : []);
    },
  };
}
