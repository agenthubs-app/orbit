/**
 * W0047：按 actor 批量读全部联系人的「完整、去重后」关系时间线（计分用）。
 *
 * 复用 W0046 的 `buildRelationshipTimeline`（同一套来源口径、归属口径与条目 id），区别只在：
 * - 每来源读该 actor 的全部行（硬上限 RELATIONSHIP_STRENGTH_SOURCE_ROW_LIMIT，触顶的来源记入 `truncatedSources`）；
 * - 只取计分要的字段（不读正文、标题），返回字节小；
 * - 日程额外读「未来的约见」（kind = meeting，至多一年内），计 5 分；
 * - memo 条目补上 `memo_extractions` 里已成功提取的 `eventTypes`。
 * 只读，0 写入；不读站内私信（relationship_conversations／messages）。
 */
import type { MemoEventType, RelationshipTimelineItem, RelationshipTimelineSource } from "../../shared/contract/relationship-timeline";
import {
  buildRelationshipTimeline,
  MEMO_NOTE_ID_PREFIX,
  type RelationshipTimelineSources,
  type TimelineContactRow,
  type TimelineDetailStateRow,
  type TimelineEncounterRow,
  type TimelineNoteRow,
  type TimelinePlanLogRow,
  type TimelineScheduleRow,
  type TimelineTaskRow,
} from "../relationship-timeline/build";

export interface RelationshipStrengthSqlExecutor {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

/** 每来源每 actor 的行数硬上限（远大于单人实际量；触顶时记录，不静默截断）。 */
export const RELATIONSHIP_STRENGTH_SOURCE_ROW_LIMIT = 5000;
/** 未来约见只看一年内。 */
export const RELATIONSHIP_STRENGTH_FUTURE_MEETING_DAYS = 365;

const MEMO_EVENT_TYPES: readonly MemoEventType[] = ["met", "collaborated", "introduced", "followed_up", "other"];

export interface ActorRelationshipTimelines {
  /** contactId → 该联系人完整时间线（occurredAt 降序；每人恰好 1 条 capture）。只含本人、未删除的联系人。 */
  timelines: Map<string, RelationshipTimelineItem[]>;
  /** 最早一位联系人的建立时间（UTC ISO）。 */
  earliestCaptureAt: string | null;
  /** 行数触顶的来源（结果可能少算）。 */
  truncatedSources: RelationshipTimelineSource[];
}

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : text(value);
}

function stringList(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

// 与 W0046 reader／contact-read-authorization 同一归属口径。
const OWNED_CONTACT_SQL = `user_id = $2
  and (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->>'accountId' = $2)`;
const LIMIT = RELATIONSHIP_STRENGTH_SOURCE_ROW_LIMIT;

export const RELATIONSHIP_STRENGTH_TIMELINE_SQL = {
  contacts: `/* relationship-strength:timeline:contacts */
    select record_id, coalesce(payload->>'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as created_at,
      payload->'source'->>'type' as source_type
    from orbit_records
    where workspace_id = $1 and collection_name = 'contacts' and lifecycle_state <> 'deleted' and deleted_at is null and ${OWNED_CONTACT_SQL}
    order by record_id limit ${LIMIT}`,
  memos: `/* relationship-strength:timeline:memos */
    select r.payload->>'contactId' as contact_id, n->>'noteId' as note_id, n->>'createdAt' as created_at, n->>'occurredAt' as occurred_at
    from orbit_records r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
    where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
      and r.lifecycle_state <> 'deleted' and n->>'noteId' like '${MEMO_NOTE_ID_PREFIX}%'
    order by n->>'noteId' limit ${LIMIT}`,
  encounters: `/* relationship-strength:timeline:encounters */
    select record_id, payload->>'contactId' as contact_id, payload->>'observedAt' as observed_at
    from orbit_records
    where workspace_id = $1 and collection_name = 'human_encounters' and user_id = $2 and payload->>'actorId' = $2 and lifecycle_state <> 'deleted'
    order by record_id limit ${LIMIT}`,
  notes: `/* relationship-strength:timeline:notes */
    select payload->'note'->>'id' as id, payload->'note'->'contactIds' as contact_ids, payload->'note'->>'createdAt' as created_at
    from orbit_records
    where workspace_id = $1 and collection_name = 'notes' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->'note'->>'ownerUserId' = $2 and payload->'note'->>'accountId' = $2
      and jsonb_typeof(payload->'note'->'contactIds') = 'array' and jsonb_array_length(payload->'note'->'contactIds') > 0
    order by record_id limit ${LIMIT}`,
  planLog: `/* relationship-strength:timeline:plan-log */
    select id, event, kind, linked_contact_ids, created_at
    from plan_log
    where workspace_id = $1 and actor_id = $2 and cardinality(linked_contact_ids) > 0 and not exists (select 1 from plan_log rev where rev.workspace_id = plan_log.workspace_id and rev.actor_id = plan_log.actor_id and rev.event = 'score_reversed' and rev.payload->>'awardLogId' = plan_log.id) /* R24：被撤销的计分不算互动 */
    order by id limit ${LIMIT}`,
  schedule: `/* relationship-strength:timeline:schedule */
    select record_id, payload->>'kind' as kind, payload->>'startsAt' as starts_at, payload->>'state' as state,
      case when jsonb_typeof(payload->'contactIds') = 'array' then payload->'contactIds' else '[]'::jsonb end as contact_ids,
      payload->>'contactId' as contact_id
    from orbit_records
    where workspace_id = $1 and collection_name = 'personal_schedule_items' and user_id = $2 and lifecycle_state <> 'deleted'
      and coalesce(payload->>'state', '') <> 'cancelled'
      and payload->>'startsAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
      and ((payload->>'startsAt')::timestamptz <= $3::timestamptz
        or (payload->>'kind' = 'meeting' and (payload->>'startsAt')::timestamptz <= $3::timestamptz + interval '${RELATIONSHIP_STRENGTH_FUTURE_MEETING_DAYS} days'))
      and ((jsonb_typeof(payload->'contactIds') = 'array' and jsonb_array_length(payload->'contactIds') > 0) or payload->>'contactId' is not null)
    order by record_id limit ${LIMIT}`,
  tasks: `/* relationship-strength:timeline:tasks */
    select record_id, payload->>'contactId' as contact_id, payload->>'updatedAt' as updated_at
    from orbit_records
    where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->>'actorId' = $2 and payload ? 'connectionId' and payload->>'status' = 'completed' and payload->>'contactId' is not null
    order by record_id limit ${LIMIT}`,
  memoExtractions: `/* relationship-strength:timeline:memo-extractions */
    select payload->>'noteId' as note_id, payload->'output'->'eventTypes' as event_types, payload->>'updatedAt' as updated_at
    from orbit_records
    where workspace_id = $1 and collection_name = 'memo_extractions' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->>'actorId' = $2 and payload->>'status' = 'succeeded'
      and jsonb_typeof(payload->'output'->'eventTypes') = 'array'
    order by record_id limit ${LIMIT}`,
} as const;

function pushTo<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export async function readRelationshipTimelinesForActor(
  sql: RelationshipStrengthSqlExecutor,
  workspaceId: string,
  input: { actorId: string; now: Date },
): Promise<ActorRelationshipTimelines> {
  const params = [workspaceId, input.actorId];
  // 任一来源失败整体失败（不写残缺的强度）；调用方保留旧缓存。
  const [contacts, memos, encounters, notes, planLog, schedule, tasks, extractions] = await Promise.all([
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.contacts, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.memos, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.encounters, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.notes, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.planLog, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.schedule, [...params, input.now.toISOString()]),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.tasks, params),
    sql.query<Row>(RELATIONSHIP_STRENGTH_TIMELINE_SQL.memoExtractions, params),
  ]);
  const truncatedSources: RelationshipTimelineSource[] = [];
  const check = (source: RelationshipTimelineSource, rows: readonly unknown[]) => {
    if (rows.length >= LIMIT && !truncatedSources.includes(source)) truncatedSources.push(source);
  };
  check("capture", contacts.rows);
  check("memo", memos.rows);
  check("memo", extractions.rows);
  check("encounter", encounters.rows);
  check("note", notes.rows);
  check("plan", planLog.rows);
  check("schedule", schedule.rows);
  check("followup_done", tasks.rows);

  const contactRows: TimelineContactRow[] = contacts.rows.map((row) => ({
    id: text(row.record_id),
    createdAt: text(row.created_at),
    sourceType: nullableText(row.source_type),
  }));
  const owned = new Set(contactRows.map((row) => row.id));

  // 按联系人分桶，每人只用自己的行调用 buildRelationshipTimeline（避免 人数 × 行数）。
  const memoBy = new Map<string, TimelineDetailStateRow["notes"][number][]>();
  for (const row of memos.rows) {
    const contactId = text(row.contact_id);
    if (!owned.has(contactId)) continue;
    pushTo(memoBy, contactId, { noteId: text(row.note_id), body: "", createdAt: text(row.created_at), occurredAt: nullableText(row.occurred_at) });
  }
  const encounterBy = new Map<string, TimelineEncounterRow[]>();
  for (const row of encounters.rows) {
    const contactId = text(row.contact_id);
    if (owned.has(contactId)) pushTo(encounterBy, contactId, { encounterId: text(row.record_id), contactId, observedAt: text(row.observed_at) });
  }
  const noteBy = new Map<string, TimelineNoteRow[]>();
  for (const row of notes.rows) {
    const contactIds = stringList(row.contact_ids);
    const note: TimelineNoteRow = { id: text(row.id), contactIds, title: "", body: "", createdAt: text(row.created_at) };
    for (const contactId of new Set(contactIds)) if (owned.has(contactId)) pushTo(noteBy, contactId, note);
  }
  const planBy = new Map<string, TimelinePlanLogRow[]>();
  for (const row of planLog.rows) {
    const linkedContactIds = stringList(row.linked_contact_ids);
    const entry: TimelinePlanLogRow = { id: text(row.id), event: text(row.event), kind: text(row.kind), body: "", linkedContactIds, createdAt: iso(row.created_at) };
    for (const contactId of new Set(linkedContactIds)) if (owned.has(contactId)) pushTo(planBy, contactId, entry);
  }
  const scheduleBy = new Map<string, TimelineScheduleRow[]>();
  for (const row of schedule.rows) {
    const kind = text(row.kind);
    if (kind !== "meeting" && kind !== "event" && kind !== "personal") continue;
    const contactIds = stringList(row.contact_ids);
    const contactId = nullableText(row.contact_id);
    const entry: TimelineScheduleRow = { id: text(row.record_id), kind, title: "", startsAt: text(row.starts_at), state: text(row.state), contactIds, contactId };
    for (const id of new Set([...contactIds, ...(contactId ? [contactId] : [])])) if (owned.has(id)) pushTo(scheduleBy, id, entry);
  }
  const taskBy = new Map<string, TimelineTaskRow[]>();
  for (const row of tasks.rows) {
    const contactId = text(row.contact_id);
    if (owned.has(contactId)) pushTo(taskBy, contactId, { taskId: text(row.record_id), contactId, status: "completed", title: "", updatedAt: text(row.updated_at) });
  }
  // 同一条 memo 可能有多条成功提取（正文改过）：取 updatedAt 最新的一条。
  const memoEventTypes = new Map<string, { at: string; types: MemoEventType[] }>();
  for (const row of extractions.rows) {
    const noteId = text(row.note_id);
    if (!noteId) continue;
    const at = text(row.updated_at);
    const types = stringList(row.event_types).filter((value): value is MemoEventType => (MEMO_EVENT_TYPES as readonly string[]).includes(value));
    const existing = memoEventTypes.get(noteId);
    if (!existing || existing.at < at) memoEventTypes.set(noteId, { at, types });
  }

  const timelines = new Map<string, RelationshipTimelineItem[]>();
  let earliestMs = Infinity;
  let earliestCaptureAt: string | null = null;
  for (const contact of contactRows) {
    const contactId = contact.id;
    const sources: RelationshipTimelineSources = {
      contacts: [contact],
      detailStates: memoBy.has(contactId) ? [{ actorId: input.actorId, contactId, notes: memoBy.get(contactId)! }] : [],
      encounters: encounterBy.get(contactId) ?? [],
      notes: noteBy.get(contactId) ?? [],
      planLog: planBy.get(contactId) ?? [],
      schedule: scheduleBy.get(contactId) ?? [],
      tasks: taskBy.get(contactId) ?? [],
    };
    const items = buildRelationshipTimeline(sources, contactId).items.map((item) => {
      if (item.source !== "memo" || !item.ref.subId) return item;
      const extracted = memoEventTypes.get(item.ref.subId);
      return extracted && extracted.types.length > 0
        ? { ...item, detail: { ...(item.detail ?? {}), memoEventTypes: extracted.types } }
        : item;
    });
    timelines.set(contactId, items);
    const capture = items.find((item) => item.source === "capture");
    const captureMs = capture ? Date.parse(capture.occurredAt) : NaN;
    if (capture && Number.isFinite(captureMs) && captureMs < earliestMs) {
      earliestMs = captureMs;
      earliestCaptureAt = capture.occurredAt;
    }
  }
  return { timelines, earliestCaptureAt, truncatedSources };
}
