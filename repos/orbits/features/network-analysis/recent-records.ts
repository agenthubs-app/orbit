/**
 * W0048a（review P3）：快照输入的「每人最近 ≤2 条关系记录」窄读取。
 *
 * 只读选中的联系人（≤200），每个来源在 SQL 里按联系人取最近 2 条（row_number），再交给 W0046 的
 * `buildRelationshipTimeline` 组装出同一套条目 id（RelationshipTimelineItem.id，即依据 recordIds）。
 * 归属口径与 W0047 批量时间线相同；只取组装所需的字段，不读正文。只读，0 写入。
 */
import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import {
  buildRelationshipTimeline,
  MEMO_NOTE_ID_PREFIX,
  type TimelineEncounterRow,
  type TimelineNoteRow,
  type TimelinePlanLogRow,
  type TimelineScheduleRow,
  type TimelineTaskRow,
} from "../relationship-timeline/build";

export interface RecentRecordsSqlExecutor {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

type Row = Record<string, unknown>;

const PER_CONTACT = 2;

/**
 * $1 workspace，$2 actor，$3 联系人 id 数组，$4 now（日程只取已发生的）。
 * W0051：每人条数与查询标签可配（洞察每人取 5 条，标签 `contact-insights:input:recent`）；快照仍是 2 条、原标签。
 */
function recentRecordsSql(perContact: number, label: string) {
  const PER_CONTACT = perContact;
  return {
  memos: `/* ${label}:memos */
    select contact_id, note_id, created_at, occurred_at from (
      select r.payload->>'contactId' as contact_id, n->>'noteId' as note_id, n->>'createdAt' as created_at, n->>'occurredAt' as occurred_at,
        row_number() over (partition by r.payload->>'contactId' order by coalesce(n->>'occurredAt', n->>'createdAt') desc nulls last, n->>'noteId') as rn
      from orbit_records r
      cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
      where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
        and r.lifecycle_state <> 'deleted' and r.payload->>'contactId' = any($3::text[]) and n->>'noteId' like '${MEMO_NOTE_ID_PREFIX}%'
    ) ranked where rn <= ${PER_CONTACT}`,
  encounters: `/* ${label}:encounters */
    select record_id, contact_id, observed_at from (
      select record_id, payload->>'contactId' as contact_id, payload->>'observedAt' as observed_at,
        row_number() over (partition by payload->>'contactId' order by payload->>'observedAt' desc nulls last, record_id) as rn
      from orbit_records
      where workspace_id = $1 and collection_name = 'human_encounters' and user_id = $2 and payload->>'actorId' = $2
        and lifecycle_state <> 'deleted' and payload->>'contactId' = any($3::text[])
    ) ranked where rn <= ${PER_CONTACT}`,
  notes: `/* ${label}:notes */
    select id, contact_id, created_at from (
      select payload->'note'->>'id' as id, cid as contact_id, payload->'note'->>'createdAt' as created_at,
        row_number() over (partition by cid order by payload->'note'->>'createdAt' desc nulls last, record_id) as rn
      from orbit_records
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(payload->'note'->'contactIds') = 'array' then payload->'note'->'contactIds' else '[]'::jsonb end) as cid
      where workspace_id = $1 and collection_name = 'notes' and user_id = $2 and lifecycle_state <> 'deleted'
        and payload->'note'->>'ownerUserId' = $2 and payload->'note'->>'accountId' = $2 and cid = any($3::text[])
    ) ranked where rn <= ${PER_CONTACT}`,
  planLog: `/* ${label}:plan-log */
    select id, event, kind, contact_id, created_at from (
      select id, event, kind, cid as contact_id, created_at,
        row_number() over (partition by cid order by created_at desc, id) as rn
      from plan_log cross join lateral unnest(linked_contact_ids) as cid
      where workspace_id = $1 and actor_id = $2 and cid = any($3::text[])
    ) ranked where rn <= ${PER_CONTACT}`,
  schedule: `/* ${label}:schedule */
    select record_id, kind, starts_at, state, contact_id from (
      select record_id, payload->>'kind' as kind, payload->>'startsAt' as starts_at, payload->>'state' as state, cid as contact_id,
        row_number() over (partition by cid order by payload->>'startsAt' desc, record_id) as rn
      from orbit_records
      cross join lateral (
        select jsonb_array_elements_text(case when jsonb_typeof(payload->'contactIds') = 'array' then payload->'contactIds' else '[]'::jsonb end) as cid
        union select payload->>'contactId' where payload->>'contactId' is not null
      ) ids
      where workspace_id = $1 and collection_name = 'personal_schedule_items' and user_id = $2 and lifecycle_state <> 'deleted'
        and coalesce(payload->>'state', '') <> 'cancelled' and payload->>'kind' in ('meeting', 'event', 'personal')
        and payload->>'startsAt' ~ '^\\d{4}-\\d{2}-\\d{2}T' and (payload->>'startsAt')::timestamptz <= $4::timestamptz
        and cid = any($3::text[])
    ) ranked where rn <= ${PER_CONTACT}`,
  tasks: `/* ${label}:tasks */
    select record_id, contact_id, updated_at from (
      select record_id, payload->>'contactId' as contact_id, payload->>'updatedAt' as updated_at,
        row_number() over (partition by payload->>'contactId' order by payload->>'updatedAt' desc nulls last, record_id) as rn
      from orbit_records
      where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and lifecycle_state <> 'deleted'
        and payload->>'actorId' = $2 and payload ? 'connectionId' and payload->>'status' = 'completed' and payload->>'contactId' = any($3::text[])
    ) ranked where rn <= ${PER_CONTACT}`,
  } as const;
}

export const SNAPSHOT_RECENT_RECORDS_SQL = recentRecordsSql(PER_CONTACT, "network-snapshot:input:recent");
const RECENT_RECORDS_SQL_BY_SIZE = new Map<number, ReturnType<typeof recentRecordsSql>>([[PER_CONTACT, SNAPSHOT_RECENT_RECORDS_SQL]]);
/** W0051：洞察输入每人最近 5 条。 */
export const CONTACT_INSIGHT_RECENT_RECORDS_PER_CONTACT = 5;
RECENT_RECORDS_SQL_BY_SIZE.set(CONTACT_INSIGHT_RECENT_RECORDS_PER_CONTACT, recentRecordsSql(CONTACT_INSIGHT_RECENT_RECORDS_PER_CONTACT, "contact-insights:input:recent"));

function text(value: unknown): string {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : "";
}

function bucket<T>(rows: readonly Row[], map: (row: Row) => T): Map<string, T[]> {
  const by = new Map<string, T[]>();
  for (const row of rows) {
    const contactId = text(row.contact_id);
    if (!contactId) continue;
    by.set(contactId, [...(by.get(contactId) ?? []), map(row)]);
  }
  return by;
}

/** 选中联系人各自最近 ≤2 条（W0051 洞察：≤5 条）非「建立联系」记录（occurredAt 降序）。 */
export async function readRecentRecordsForContacts(
  sql: RecentRecordsSqlExecutor,
  workspaceId: string,
  input: { actorId: string; contacts: readonly { id: string; createdAt: string }[]; now: Date; perContact?: number },
): Promise<Map<string, RelationshipTimelineItem[]>> {
  const perContact = input.perContact ?? PER_CONTACT;
  const SQL = RECENT_RECORDS_SQL_BY_SIZE.get(perContact);
  if (!SQL) throw new Error("Unsupported recent-records size.");
  const ids = [...new Set(input.contacts.map((contact) => contact.id))];
  const result = new Map<string, RelationshipTimelineItem[]>();
  if (!ids.length) return result;
  const params = [workspaceId, input.actorId, ids];
  const [memos, encounters, notes, planLog, schedule, tasks] = await Promise.all([
    sql.query<Row>(SQL.memos, params),
    sql.query<Row>(SQL.encounters, params),
    sql.query<Row>(SQL.notes, params),
    sql.query<Row>(SQL.planLog, params),
    sql.query<Row>(SQL.schedule, [...params, input.now.toISOString()]),
    sql.query<Row>(SQL.tasks, params),
  ]);
  const memoBy = bucket(memos.rows, (row) => ({ body: "", createdAt: text(row.created_at), noteId: text(row.note_id), occurredAt: text(row.occurred_at) || null }));
  const encounterBy = bucket(encounters.rows, (row): TimelineEncounterRow => ({ contactId: text(row.contact_id), encounterId: text(row.record_id), observedAt: text(row.observed_at) }));
  const noteBy = bucket(notes.rows, (row): TimelineNoteRow => ({ body: "", contactIds: [text(row.contact_id)], createdAt: text(row.created_at), id: text(row.id), title: "" }));
  const planBy = bucket(planLog.rows, (row): TimelinePlanLogRow => ({ body: "", createdAt: text(row.created_at), event: text(row.event), id: text(row.id), kind: text(row.kind), linkedContactIds: [text(row.contact_id)] }));
  const scheduleBy = bucket(schedule.rows, (row): TimelineScheduleRow => ({ contactId: text(row.contact_id), contactIds: [text(row.contact_id)], id: text(row.record_id), kind: text(row.kind) as TimelineScheduleRow["kind"], startsAt: text(row.starts_at), state: text(row.state), title: "" }));
  const taskBy = bucket(tasks.rows, (row): TimelineTaskRow => ({ contactId: text(row.contact_id), status: "completed", taskId: text(row.record_id), title: "", updatedAt: text(row.updated_at) }));
  for (const contact of input.contacts) {
    const contactId = contact.id;
    const items = buildRelationshipTimeline({
      contacts: [{ createdAt: contact.createdAt, id: contactId, sourceType: null }],
      detailStates: memoBy.has(contactId) ? [{ actorId: input.actorId, contactId, notes: memoBy.get(contactId)! }] : [],
      encounters: encounterBy.get(contactId) ?? [],
      notes: noteBy.get(contactId) ?? [],
      planLog: planBy.get(contactId) ?? [],
      schedule: scheduleBy.get(contactId) ?? [],
      tasks: taskBy.get(contactId) ?? [],
    }, contactId).items
      .filter((item) => item.source !== "capture")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, perContact);
    result.set(contactId, items);
  }
  return result;
}
