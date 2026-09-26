import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
  DASHBOARD_SHORT_LIST_LIMIT,
  type DashboardAggregateProvenance,
  type DashboardAggregateScenario,
  type DashboardAggregateSummaryResult,
  type DashboardAggregateState,
  type DashboardRecentActivity,
} from "../contract";
import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import {
  RELATIONSHIP_STAGE_VALUES,
  RELATIONSHIP_VALUE_TYPES,
  SOURCE_TYPES,
} from "../../../shared/domain/source-types";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { LiveDashboardGraph } from "./dashboard-live-record-provider";

const dashboardSummaryCollections = [
  "connections",
  "contacts",
  "contact_detail_states",
  "events",
  "evidence",
  "tasks",
] as const;

// PostgreSQL btrim() is narrower than ECMAScript String.prototype.trim().
// This expression is only used to decide whether a string is empty; values
// returned to the summary remain the original JSON strings.
// JS sorts activity strings with String.prototype.localeCompare (ICU). The ICU
// root collation orders printable ASCII exactly like it (checked against Node
// for timestamp-shaped and random ASCII strings), so any ASCII timestamp format
// can be ordered in SQL; strings with other characters fall back to the graph.
export const ACTIVITY_ORDER_COLLATION = '"und-x-icu"';
export const activityOrderSafeSql = "bool_and(activity_at !~ '[^ -~]')";

export const javascriptTrimCharacters =
  "E'\\t\\n\\f\\r ' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)";

export function jsonStringNonEmpty(
  jsonExpression: string,
  textExpression: string,
): string {
  return `jsonb_typeof(${jsonExpression}) = 'string' and length(translate(${textExpression}, ${javascriptTrimCharacters}, '')) > 0`;
}

export function payloadStringNonEmpty(field: string): string {
  return jsonStringNonEmpty(
    `payload -> '${field}'`,
    `payload ->> '${field}'`,
  );
}

export function sourceStringNonEmpty(field: string): string {
  return jsonStringNonEmpty(
    `payload -> 'source' -> '${field}'`,
    `payload -> 'source' ->> '${field}'`,
  );
}

export const evidenceArrayExpression = `case when jsonb_typeof(payload -> 'evidenceIds') = 'array' then payload -> 'evidenceIds' else '[]'::jsonb end`;
export const valueTypesArrayExpression = `case when jsonb_typeof(payload -> 'valueTypes') = 'array' then payload -> 'valueTypes' else '[]'::jsonb end`;

export function evidenceLateralSql(alias = "recordEvidence"): string {
  return `
    cross join lateral (
      select coalesce(
        jsonb_agg(evidence_value.value #>> '{}' order by evidence_value.ordinal)
          filter (
            where jsonb_typeof(evidence_value.value) = 'string'
              and length(translate(evidence_value.value #>> '{}', ${javascriptTrimCharacters}, '')) > 0
          ),
        '[]'::jsonb
      ) as evidence_ids
      from jsonb_array_elements(${evidenceArrayExpression}) with ordinality
        as evidence_value(value, ordinal)
    ) as ${alias}`;
}

const valueTypesLateralSql = `
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

const dashboardSummarySql = `
/* dashboard summary read model: no entity payload is returned */
with scoped_records as (
  select collection_name, record_id, occurred_at, updated_at, payload
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and (collection_name <> 'contacts' or
      (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($2::text)))
    and collection_name = any($3::text[])
    and lifecycle_state <> 'deleted'
),
valid_contacts as (
  select
    payload ->> 'id' as id,
    payload ->> 'displayName' as display_name,
    payload ->> 'stage' as stage,
    payload ->> 'createdAt' as created_at,
    case when ${sourceStringNonEmpty("label")}
      then payload -> 'source' ->> 'label' end as source_label,
    recordEvidence.evidence_ids,
    coalesce(occurred_at, updated_at) as sort_occurred_at,
    updated_at as sort_updated_at,
    record_id as sort_record_id
  from scoped_records
  ${evidenceLateralSql()}
  where collection_name = 'contacts'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("displayName")}
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    and jsonb_typeof(payload -> 'stage') = 'string'
    and payload ->> 'stage' = any($5::text[])
    and jsonb_typeof(payload -> 'source') = 'object'
    and ${sourceStringNonEmpty("type")}
    and payload -> 'source' ->> 'type' = any($4::text[])
    and ${sourceStringNonEmpty("id")}
    and jsonb_array_length(recordEvidence.evidence_ids) > 0
),
valid_connections as (
  select
    case
      when jsonb_typeof(payload -> 'businessRelevanceScore') = 'number'
        then (payload ->> 'businessRelevanceScore')::double precision
      when jsonb_typeof(payload -> 'relationshipStrength') = 'number'
        then (payload ->> 'relationshipStrength')::double precision
      else least(95::double precision, 60 + jsonb_array_length(legal_value_types.value_types) * 10)
    end as priority_raw,
    recordEvidence.evidence_ids,
    coalesce(occurred_at, updated_at) as sort_occurred_at,
    updated_at as sort_updated_at,
    record_id as sort_record_id
  from scoped_records
  ${evidenceLateralSql()}
  ${valueTypesLateralSql}
  where collection_name = 'connections'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("accountId")}
    and ${payloadStringNonEmpty("contactId")}
    and ${payloadStringNonEmpty("summary")}
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    and jsonb_typeof(payload -> 'stage') = 'string'
    and payload ->> 'stage' = any($5::text[])
    and jsonb_typeof(payload -> 'source') = 'object'
    and ${sourceStringNonEmpty("type")}
    and payload -> 'source' ->> 'type' = any($4::text[])
    and ${sourceStringNonEmpty("id")}
    and jsonb_array_length(recordEvidence.evidence_ids) > 0
),
valid_events as (
  select
    recordEvidence.evidence_ids,
    coalesce(occurred_at, updated_at) as sort_occurred_at,
    updated_at as sort_updated_at,
    record_id as sort_record_id
  from scoped_records
  ${evidenceLateralSql()}
  where collection_name = 'events'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("name")}
    and ${payloadStringNonEmpty("startsAt")}
    and jsonb_typeof(payload -> 'source') = 'object'
    and ${sourceStringNonEmpty("type")}
    and payload -> 'source' ->> 'type' = any($4::text[])
    and ${sourceStringNonEmpty("id")}
    and jsonb_array_length(recordEvidence.evidence_ids) > 0
),
valid_tasks as (
  select
    payload ->> 'id' as id,
    payload ->> 'title' as title,
    payload ->> 'status' as status,
    payload ->> 'updatedAt' as updated_at_text,
    case when ${sourceStringNonEmpty("label")}
      then payload -> 'source' ->> 'label' end as source_label,
    recordEvidence.evidence_ids,
    coalesce(occurred_at, updated_at) as sort_occurred_at,
    updated_at as sort_updated_at,
    record_id as sort_record_id
  from scoped_records
  ${evidenceLateralSql()}
  where collection_name = 'tasks'
    and ${payloadStringNonEmpty("id")}
    and ${payloadStringNonEmpty("title")}
    and jsonb_typeof(payload -> 'status') = 'string'
    and payload ->> 'status' in ('open', 'scheduled', 'completed', 'dismissed')
    and ${payloadStringNonEmpty("createdAt")}
    and ${payloadStringNonEmpty("updatedAt")}
    and jsonb_typeof(payload -> 'source') = 'object'
    and ${sourceStringNonEmpty("type")}
    and payload -> 'source' ->> 'type' = any($4::text[])
    and ${sourceStringNonEmpty("id")}
    and jsonb_array_length(recordEvidence.evidence_ids) > 0
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
    sort_occurred_at as record_sort_occurred_at,
    sort_updated_at as record_sort_updated_at,
    sort_record_id as record_sort_record_id
  from valid_contacts
  union all
  select
    'activity:dashboard:task:' || id as activity_id,
    'followup_due' as activity_type,
    title as activity_label,
    updated_at_text as activity_at,
    coalesce(source_label, 'Live task source') as activity_source_label,
    evidence_ids,
    1 as activity_group_rank,
    sort_occurred_at as record_sort_occurred_at,
    sort_updated_at as record_sort_updated_at,
    sort_record_id as record_sort_record_id
  from valid_tasks
),
recent_activity as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'activityId', activity_id,
        'type', activity_type,
        'label', activity_label,
        'occurredAt', activity_at,
        'sourceLabel', activity_source_label,
        'evidenceIds', evidence_ids
      ) order by activity_at collate ${ACTIVITY_ORDER_COLLATION} desc, activity_group_rank asc,
        record_sort_occurred_at desc, record_sort_updated_at desc, record_sort_record_id
    ),
    '[]'::jsonb
  ) as activities
  from (
    select
      activity_id,
      activity_type,
      activity_label,
      activity_at,
      activity_source_label,
      evidence_ids,
      activity_group_rank,
      record_sort_occurred_at,
      record_sort_updated_at,
      record_sort_record_id
    from recent_activity_candidates
    order by activity_at collate ${ACTIVITY_ORDER_COLLATION} desc, activity_group_rank asc,
      record_sort_occurred_at desc, record_sort_updated_at desc, record_sort_record_id
    limit 3
  ) as limited_activity
),
activity_order_safety as (
  select coalesce(
    ${activityOrderSafeSql},
    true
  ) as is_safe
  from recent_activity_candidates
)
select
  (select coalesce(max(updated_at), to_timestamp(0)) from scoped_records) as generated_at,
  (select count(*)::int from valid_contacts) as contacts_count,
  ${evidenceAggregateSql("valid_contacts")} as contacts_evidence_ids,
  ${distinctEvidenceAggregateSql("valid_contacts")} as contacts_distinct_evidence_ids,
  ${distinctEvidenceAggregateSql("valid_connections")} as connections_distinct_evidence_ids,
  ${distinctEvidenceAggregateSql("valid_events")} as events_distinct_evidence_ids,
  ${distinctEvidenceAggregateSql("valid_tasks")} as tasks_distinct_evidence_ids,
  -- For the non-negative score range used here, Math.round(score) >= 70 iff score >= 69.5.
  (select count(*)::int from valid_connections where priority_raw >= 69.5) as high_value_count,
  ${evidenceAggregateSql("valid_connections", "priority_raw >= 69.5")} as high_value_evidence_ids,
  (select count(*)::int from valid_tasks where status in ('open', 'scheduled')) as pending_followup_count,
  ${evidenceAggregateSql("valid_tasks", "status in ('open', 'scheduled')")} as pending_followup_evidence_ids,
  (select count(*)::int from valid_contacts where stage = 'nurture') as dormant_contact_count,
  ${evidenceAggregateSql("valid_contacts", "stage = 'nurture'")} as dormant_contact_evidence_ids,
  (select activities from recent_activity) as recent_activity,
  (select is_safe from activity_order_safety) as activity_order_safe
`;

// Sprint 0101: evidence lists are short lists — the first $7 entries in graph
// order (occurred/updated desc, record id, evidence ordinal).
function evidenceAggregateSql(
  relation: string,
  condition?: string,
): string {
  return `coalesce((
    select jsonb_agg(evidence_id order by sort_occurred_at desc, sort_updated_at desc, sort_record_id, ordinal)
    from (
      select evidence_value.value #>> '{}' as evidence_id, source.sort_occurred_at,
        source.sort_updated_at, source.sort_record_id, evidence_value.ordinal
      from ${relation} as source
      cross join lateral jsonb_array_elements(source.evidence_ids) with ordinality
        as evidence_value(value, ordinal)
      ${condition ? `where ${condition}` : ""}
      order by source.sort_occurred_at desc, source.sort_updated_at desc, source.sort_record_id, evidence_value.ordinal
      limit $7
    ) as first_evidence
  ), '[]'::jsonb)`;
}

/** First $7 distinct evidence ids of a relation, by first occurrence in graph order. */
function distinctEvidenceAggregateSql(relation: string): string {
  return `coalesce((
    select jsonb_agg(evidence_id order by first_rank)
    from (
      select evidence_id, min(entry_rank) as first_rank
      from (
        select evidence_value.value #>> '{}' as evidence_id,
          row_number() over (order by source.sort_occurred_at desc, source.sort_updated_at desc,
            source.sort_record_id, evidence_value.ordinal) as entry_rank
        from ${relation} as source
        cross join lateral jsonb_array_elements(source.evidence_ids) with ordinality
          as evidence_value(value, ordinal)
      ) as entries
      group by evidence_id
      order by first_rank
      limit $7
    ) as first_distinct
  ), '[]'::jsonb)`;
}

interface DashboardSummarySqlRow {
  generated_at: Date | string | null;
  contacts_count: number | string;
  contacts_evidence_ids: unknown;
  contacts_distinct_evidence_ids: unknown;
  connections_distinct_evidence_ids: unknown;
  events_distinct_evidence_ids: unknown;
  tasks_distinct_evidence_ids: unknown;
  high_value_count: number | string;
  high_value_evidence_ids: unknown;
  pending_followup_count: number | string;
  pending_followup_evidence_ids: unknown;
  dormant_contact_count: number | string;
  dormant_contact_evidence_ids: unknown;
  recent_activity: unknown;
  activity_order_safe: boolean;
}

interface SummaryParts {
  generatedAt: string;
  contactsCount: number;
  contactsEvidenceIds: readonly string[];
  /** Per collection, evidence ids in first-occurrence order (may be longer than the limit). */
  distinctEvidenceIds: {
    contacts: readonly string[];
    connections: readonly string[];
    events: readonly string[];
    tasks: readonly string[];
  };
  highValueCount: number;
  highValueEvidenceIds: readonly string[];
  pendingFollowupCount: number;
  pendingFollowupEvidenceIds: readonly string[];
  dormantContactCount: number;
  dormantContactEvidenceIds: readonly string[];
  recentActivity: readonly DashboardRecentActivity[];
}

function jsonArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function jsonStrings(value: unknown): readonly string[] {
  return jsonArray(value).filter((item): item is string => typeof item === "string");
}

function countValue(value: number | string | null | undefined): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function timestampValue(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toISOString()
      : new Date(0).toISOString();
  }
  return new Date(0).toISOString();
}

function activityValues(value: unknown): readonly DashboardRecentActivity[] {
  return jsonArray(value).flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const activity = item as Record<string, unknown>;
    if (
      typeof activity.activityId !== "string" ||
      typeof activity.type !== "string" ||
      typeof activity.label !== "string" ||
      typeof activity.occurredAt !== "string" ||
      typeof activity.sourceLabel !== "string"
    ) {
      return [];
    }
    return [{
      activityId: activity.activityId,
      type: activity.type as DashboardRecentActivity["type"],
      label: activity.label,
      occurredAt: activity.occurredAt,
      sourceLabel: activity.sourceLabel,
      evidenceIds: jsonStrings(activity.evidenceIds),
    }];
  });
}

function summaryProvenance(
  source: string,
  sourceLabel: string,
  evidenceIds: readonly string[],
  collectedAt: string,
  generationMethod: "live-store-query" | "rule-based-summary",
): DashboardAggregateProvenance {
  return {
    source,
    sourceLabel,
    evidenceIds,
    collectedAt,
    privacy: "live-dashboard-aggregate",
    generationMethod,
    liveAnalyticsQueryExecuted: false,
    productionAggregateReadExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function deduplicatedEvidence(parts: SummaryParts): readonly string[] {
  const evidenceIds = [
    ...parts.distinctEvidenceIds.contacts,
    ...parts.distinctEvidenceIds.connections,
    ...parts.distinctEvidenceIds.events,
    ...parts.distinctEvidenceIds.tasks,
  ];
  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)].slice(0, DASHBOARD_SHORT_LIST_LIMIT)
    : ["evidence:dashboard-live-store-empty"];
}

function summaryFromParts(
  parts: SummaryParts,
  source: string,
  sourceLabel: string,
  scenario: DashboardAggregateScenario,
): DashboardAggregateSummaryResult {
  const liveEvidenceIds = deduplicatedEvidence(parts);
  const liveProvenance = summaryProvenance(
    source,
    `${sourceLabel} summary`,
    liveEvidenceIds,
    parts.generatedAt,
    "live-store-query",
  );

  if (scenario === "failure") {
    const definition = DASHBOARD_AGGREGATE_ERROR_DEFINITIONS.DASHBOARD_AGGREGATE_LIVE_FAILED;
    const provenance = summaryProvenance(
      source,
      "Live dashboard controlled failure",
      liveEvidenceIds,
      parts.generatedAt,
      "live-store-query",
    );
    return {
      success: false,
      error: {
        ...definition,
        state: "failure",
        provenance,
        evidenceIds: provenance.evidenceIds,
      },
    };
  }

  if (scenario === "empty" || scenario === "pending") {
    const state: DashboardAggregateState = scenario;
    const emptyEvidenceIds = ["evidence:dashboard-live-store-empty"];
    const provenance = summaryProvenance(
      source,
      `${sourceLabel} summary`,
      emptyEvidenceIds,
      parts.generatedAt,
      "rule-based-summary",
    );
    return {
      success: true,
      data: {
        state,
        metrics: [
          { id: "relationship-assets", label: "Relationship assets", value: 0, evidenceIds: emptyEvidenceIds },
          { id: "new-contacts", label: "New contacts", value: 0, evidenceIds: [] },
          { id: "high-value", label: "High-value relationships", value: 0, evidenceIds: [] },
          { id: "pending-followups", label: "Pending followups", value: 0, evidenceIds: [] },
          { id: "dormant-contacts", label: "Dormant contacts", value: 0, evidenceIds: [] },
        ],
        recentActivity: [],
        summary:
          state === "pending"
            ? "The live dashboard aggregate is waiting for relationship record review."
            : "The live dashboard aggregate returned no relationship rows.",
        provenance,
        nextAction: "Use the source-backed live dashboard aggregate for agent workflow testing.",
      },
    };
  }

  const state: DashboardAggregateState = parts.contactsCount > 0 ? "success" : "empty";
  return {
    success: true,
    data: {
      state,
      metrics: [
        {
          id: "relationship-assets",
          label: "Relationship assets",
          value: parts.contactsCount,
          evidenceIds: liveProvenance.evidenceIds,
        },
        {
          id: "new-contacts",
          label: "New contacts",
          value: parts.contactsCount,
          evidenceIds: parts.contactsEvidenceIds.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
        },
        {
          id: "high-value",
          label: "High-value relationships",
          value: parts.highValueCount,
          evidenceIds: parts.highValueEvidenceIds.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
        },
        {
          id: "pending-followups",
          label: "Pending followups",
          value: parts.pendingFollowupCount,
          evidenceIds: parts.pendingFollowupEvidenceIds.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
        },
        {
          id: "dormant-contacts",
          label: "Dormant contacts",
          value: parts.dormantContactCount,
          evidenceIds: parts.dormantContactEvidenceIds.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
        },
      ],
      recentActivity: parts.recentActivity.slice(0, 3),
      summary:
        state === "success"
          ? "Rule-based summary of the live dashboard aggregate."
          : "Live dashboard aggregate was computed from shared remote relationship records.",
      provenance: summaryProvenance(
        source,
        `${sourceLabel} summary`,
        liveEvidenceIds,
        parts.generatedAt,
        "rule-based-summary",
      ),
      nextAction: "Use the source-backed live dashboard aggregate for agent workflow testing.",
    },
  };
}

function partsFromSqlRow(row: DashboardSummarySqlRow): SummaryParts {
  return {
    generatedAt: timestampValue(row.generated_at),
    contactsCount: countValue(row.contacts_count),
    contactsEvidenceIds: jsonStrings(row.contacts_evidence_ids),
    distinctEvidenceIds: {
      contacts: jsonStrings(row.contacts_distinct_evidence_ids),
      connections: jsonStrings(row.connections_distinct_evidence_ids),
      events: jsonStrings(row.events_distinct_evidence_ids),
      tasks: jsonStrings(row.tasks_distinct_evidence_ids),
    },
    highValueCount: countValue(row.high_value_count),
    highValueEvidenceIds: jsonStrings(row.high_value_evidence_ids),
    pendingFollowupCount: countValue(row.pending_followup_count),
    pendingFollowupEvidenceIds: jsonStrings(row.pending_followup_evidence_ids),
    dormantContactCount: countValue(row.dormant_contact_count),
    dormantContactEvidenceIds: jsonStrings(row.dormant_contact_evidence_ids),
    recentActivity: activityValues(row.recent_activity),
  };
}

function graphPriority(connection: ConnectionDTO): number {
  return Math.round(
    connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      Math.min(95, 60 + connection.valueTypes.length * 10),
  );
}

function graphActivity(graph: LiveDashboardGraph): readonly DashboardRecentActivity[] {
  const contacts = graph.contacts.map((contact: ContactDTO) => ({
    activityId: `activity:dashboard:contact:${contact.id}`,
    type: "new_contact" as const,
    label: `${contact.displayName} added to the live relationship database`,
    occurredAt: contact.createdAt,
    sourceLabel: contact.source.label ?? "Live contact source",
    evidenceIds: contact.evidenceIds,
  }));
  const tasks = graph.tasks.map((task: TaskDTO) => ({
    activityId: `activity:dashboard:task:${task.id}`,
    type: "followup_due" as const,
    label: task.title,
    occurredAt: task.updatedAt,
    sourceLabel: task.source.label ?? "Live task source",
    evidenceIds: task.evidenceIds,
  }));
  return [...contacts, ...tasks].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}

export function buildDashboardSummaryFromGraph(
  graph: LiveDashboardGraph,
  source: string,
  sourceLabel: string,
  scenario: DashboardAggregateScenario = "success",
): DashboardAggregateSummaryResult {
  const highValue = graph.connections.filter(
    (connection) => graphPriority(connection) >= 70,
  );
  const pending = graph.tasks.filter(
    (task) => task.status === "open" || task.status === "scheduled",
  );
  const dormant = graph.contacts.filter((contact) => contact.stage === "nurture");
  return summaryFromParts(
    {
      generatedAt: graph.generatedAt,
      contactsCount: graph.contacts.length,
      contactsEvidenceIds: graph.contacts.flatMap((contact) => contact.evidenceIds),
      distinctEvidenceIds: {
        contacts: graph.contacts.flatMap((contact) => contact.evidenceIds),
        connections: graph.connections.flatMap((connection) => connection.evidenceIds),
        events: graph.events.flatMap((event) => event.evidenceIds),
        tasks: graph.tasks.flatMap((task) => task.evidenceIds),
      },
      highValueCount: highValue.length,
      highValueEvidenceIds: highValue.flatMap((connection) => connection.evidenceIds),
      pendingFollowupCount: pending.length,
      pendingFollowupEvidenceIds: pending.flatMap((task) => task.evidenceIds),
      dormantContactCount: dormant.length,
      dormantContactEvidenceIds: dormant.flatMap((contact) => contact.evidenceIds),
      recentActivity: graphActivity(graph),
    },
    source,
    sourceLabel,
    scenario,
  );
}

export interface DashboardSummaryPostgresReaderOptions {
  client: LiveRecordSqlClient;
  source: string;
  sourceLabel: string;
  workspaceId: string;
}

export interface DashboardSummaryPostgresReader {
  readForAccount: (
    accountId: string,
    scenario?: DashboardAggregateScenario,
  ) => Promise<DashboardAggregateSummaryResult>;
}

/**
 * A database without ICU collations (SQLSTATE 42704 for "und-x-icu") cannot
 * order activity strings like JS; keep answers correct via the graph read and
 * say so in the log instead of failing the dashboard.
 */
export async function queryWithActivityCollation<TResult>(
  run: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: unknown })?.code === "42704") {
      console.warn(JSON.stringify({ event: "dashboard_activity_collation_missing", collation: ACTIVITY_ORDER_COLLATION }));
      throw new DashboardSummaryRequiresGraphFallback();
    }
    throw error;
  }
}

export class DashboardSummaryRequiresGraphFallback extends Error {
  constructor() {
    super("Dashboard summary activity strings require the full graph ordering fallback");
    this.name = "DashboardSummaryRequiresGraphFallback";
  }
}

export function createDashboardSummaryPostgresReader({
  client,
  source,
  sourceLabel,
  workspaceId,
}: DashboardSummaryPostgresReaderOptions): DashboardSummaryPostgresReader {
  return {
    async readForAccount(accountId, scenario = "success") {
      const result = await queryWithActivityCollation(() => client.query<DashboardSummarySqlRow>(
        dashboardSummarySql,
        [
          workspaceId,
          accountId,
          [...dashboardSummaryCollections],
          [...SOURCE_TYPES],
          [...RELATIONSHIP_STAGE_VALUES],
          [...RELATIONSHIP_VALUE_TYPES],
          DASHBOARD_SHORT_LIST_LIMIT,
        ],
      ));
      const row = result.rows[0];
      if (!row) {
        throw new Error("Dashboard summary read model returned no row");
      }
      if (row.activity_order_safe === false) {
        throw new DashboardSummaryRequiresGraphFallback();
      }
      return summaryFromParts(
        partsFromSqlRow(row),
        source,
        sourceLabel,
        scenario,
      );
    },
  };
}
