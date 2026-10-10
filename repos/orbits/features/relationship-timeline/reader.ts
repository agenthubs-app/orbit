/**
 * W0046：关系时间线读取器（只读、0 写入、全部按本人隔离、每来源读取有上限）。
 *
 * - 单人：`readRelationshipTimelineForContact`（详情弹窗，默认 20 条）。
 * - 跨联系人最近动态：`readRecentRelationshipTimelineForActor`（W0052 概览「最近动态」，limit ≤ 50）。
 *
 * 七个来源各一条带 LIMIT 的语句，只取时间线要的字段（正文截到 200 字）；任一来源失败时其余照常，
 * 失败来源列入 `unavailableSources`。不读站内私信（relationship_conversations／messages）与 event_ops 表。
 */
import type {
  RelationshipTimelineItem,
  RelationshipTimelineResult,
  RelationshipTimelineSource,
} from "../../shared/contract/relationship-timeline";
import {
  createConfiguredEventOperationsPostgresRuntime,
  type EventOperationsSqlExecutor,
} from "../events/event-operations/storage/postgres-client";
import {
  buildRelationshipTimeline,
  mergeRelationshipTimelineItems,
  MEMO_NOTE_ID_PREFIX,
  RELATIONSHIP_TIMELINE_SOURCES,
  type RelationshipTimelineSources,
  type TimelineContactRow,
  type TimelineDetailStateRow,
  type TimelineEncounterRow,
  type TimelineNoteRow,
  type TimelinePlanLogRow,
  type TimelineScheduleRow,
  type TimelineTaskRow,
} from "./build";

/** 每来源读取上限（W46-5）。 */
export const TIMELINE_PER_SOURCE_LIMIT = 50;
export const TIMELINE_DETAIL_DEFAULT_LIMIT = 20;
/**
 * 跨联系人最近动态里，一条记录（笔记／计划记录／日程）最多展开的关联联系人数。对标 HubSpot 活动的关联展示：
 * 一条活动关联的人很多时只展示前若干位。SQL 里就截断，传输与内存都有固定上限。
 */
export const TIMELINE_CONTACTS_PER_RECORD = 20;
/** 最近动态的归属校验一次最多查的联系人数（固定上限，不随数据量变化）：7 来源 × 50 条里的去重 id 远小于它。 */
export const TIMELINE_RECENT_OWNERSHIP_LIMIT = 200;
const EXCERPT_SQL_CHARS = 200;

export interface RelationshipTimelineRuntime {
  client: EventOperationsSqlExecutor;
  workspaceId: string;
}

export interface RelationshipTimelineReaderDeps {
  /** 缺省用配置的 Postgres；为 null（未配置）时所有来源读不到。 */
  runtime?: RelationshipTimelineRuntime | null;
}

type Row = Record<string, unknown>;

interface Scope {
  actorId: string;
  /** 只读这位联系人；不传 = 本人全部联系人（最近动态）。 */
  contactId?: string;
  now: Date;
  limit: number;
  /**
   * 每个来源 SQL 至多读几条。详情（单人）保持 TIMELINE_PER_SOURCE_LIMIT（合并后的「共 N 条」口径不变）；
   * 跨联系人最近 N 条（W0052 review P3）只需每来源前 N 条：全局 top N 不可能需要某一来源超过 N 条。
   */
  perSourceLimit: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

function stringList(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function detailRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

// 与 features/contacts/storage/contact-read-authorization.ts 同一归属口径：行属于本人且 payload.accountId 为空或本人。
const OWNED_CONTACT_SQL = `user_id = $2
  and (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->>'accountId' = $2)`;

async function readContacts(sql: EventOperationsSqlExecutor, workspaceId: string, actorId: string, ids: readonly string[] | null, limit: number): Promise<TimelineContactRow[]> {
  const result = await sql.query<Row>(`select record_id, coalesce(payload->>'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as created_at,
      payload->'source'->>'type' as source_type, payload->>'metEventId' as met_event_id, left(payload->>'metEventTitle', ${EXCERPT_SQL_CHARS}) as met_event_title
    from orbit_records
    where workspace_id = $1 and collection_name = 'contacts' and lifecycle_state <> 'deleted' and deleted_at is null
      and ${OWNED_CONTACT_SQL}
      ${ids ? "and record_id = any($3::text[])" : ""}
    order by created_at desc, record_id
    limit ${ids ? "$4" : "$3"}`, ids ? [workspaceId, actorId, ids, limit] : [workspaceId, actorId, limit]);
  return result.rows.map((row) => ({
    id: text(row.record_id),
    createdAt: text(row.created_at),
    sourceType: nullableText(row.source_type),
    metEventId: nullableText(row.met_event_id),
    metEventTitle: nullableText(row.met_event_title),
  }));
}

async function readMemos(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelineDetailStateRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, `${MEMO_NOTE_ID_PREFIX}%`, scope.perSourceLimit];
  if (scope.contactId) values.push(detailRecordId(scope.actorId, scope.contactId));
  const result = await sql.query<Row>(`select r.payload->>'contactId' as contact_id, n->>'noteId' as note_id, left(n->>'body', ${EXCERPT_SQL_CHARS}) as body,
      n->>'createdAt' as created_at, n->>'occurredAt' as occurred_at, n->>'eventId' as event_id
    from orbit_records r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
    where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
      and r.lifecycle_state <> 'deleted' and n->>'noteId' like $3
      ${scope.contactId ? "and r.record_id = $5" : ""}
    order by coalesce(n->>'occurredAt', n->>'createdAt') desc, n->>'noteId'
    limit $4`, values);
  const byContact = new Map<string, TimelineDetailStateRow>();
  for (const row of result.rows) {
    const contactId = text(row.contact_id);
    const state = byContact.get(contactId) ?? { actorId: scope.actorId, contactId, notes: [] };
    (state.notes as TimelineDetailStateRow["notes"][number][]).push({
      noteId: text(row.note_id),
      body: text(row.body),
      createdAt: text(row.created_at),
      occurredAt: nullableText(row.occurred_at),
      eventId: nullableText(row.event_id),
    });
    byContact.set(contactId, state);
  }
  return [...byContact.values()];
}

async function readEncounters(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelineEncounterRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, scope.perSourceLimit];
  if (scope.contactId) values.push(scope.contactId);
  const result = await sql.query<Row>(`select record_id, payload->>'contactId' as contact_id, payload->>'observedAt' as observed_at,
      payload->>'eventId' as event_id, left(payload->>'noteText', ${EXCERPT_SQL_CHARS}) as note_text
    from orbit_records
    where workspace_id = $1 and collection_name = 'human_encounters' and user_id = $2 and payload->>'actorId' = $2
      and lifecycle_state <> 'deleted'
      ${scope.contactId ? "and target_id = $4 and payload->>'contactId' = $4" : ""}
    order by payload->>'observedAt' desc, record_id
    limit $3`, values);
  return result.rows.map((row) => ({
    encounterId: text(row.record_id),
    contactId: text(row.contact_id),
    observedAt: text(row.observed_at),
    eventId: nullableText(row.event_id),
    noteText: nullableText(row.note_text),
  }));
}

async function readNotes(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelineNoteRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, scope.perSourceLimit];
  if (scope.contactId) values.push(scope.contactId);
  // 单人：行已按该联系人过滤，只回传它本身；最近动态：关联 id 在 SQL 里截到前 TIMELINE_CONTACTS_PER_RECORD 个。
  const contactIdsSql = scope.contactId
    ? "jsonb_build_array($4::text)"
    : `jsonb_path_query_array(payload->'note'->'contactIds', '$[0 to ${TIMELINE_CONTACTS_PER_RECORD - 1}]')`;
  const result = await sql.query<Row>(`select payload->'note'->>'id' as id, ${contactIdsSql} as contact_ids,
      left(coalesce(payload->'note'->>'title', ''), ${EXCERPT_SQL_CHARS}) as title, left(payload->'note'->>'body', ${EXCERPT_SQL_CHARS}) as body,
      payload->'note'->>'createdAt' as created_at, payload->'note'->'eventIds' as event_ids
    from orbit_records
    where workspace_id = $1 and collection_name = 'notes' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->'note'->>'ownerUserId' = $2 and payload->'note'->>'accountId' = $2
      and jsonb_typeof(payload->'note'->'contactIds') = 'array'
      ${scope.contactId ? "and payload->'note'->'contactIds' ? $4" : "and jsonb_array_length(payload->'note'->'contactIds') > 0"}
    order by payload->'note'->>'createdAt' desc, record_id
    limit $3`, values);
  return result.rows.map((row) => ({
    id: text(row.id),
    contactIds: stringList(row.contact_ids),
    title: text(row.title) || (text(row.body).split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ""),
    body: text(row.body),
    createdAt: text(row.created_at),
    eventIds: stringList(row.event_ids),
  }));
}

async function readPlanLog(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelinePlanLogRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, scope.perSourceLimit];
  if (scope.contactId) values.push([scope.contactId]);
  const linkedSql = scope.contactId ? "$4::text[]" : `linked_contact_ids[1:${TIMELINE_CONTACTS_PER_RECORD}]`;
  const result = await sql.query<Row>(`select id, event, kind, left(body, ${EXCERPT_SQL_CHARS}) as body, ${linkedSql} as linked_contact_ids, linked_event_id, created_at
    from plan_log
    where workspace_id = $1 and actor_id = $2
      /* R24：被撤销（score_reversed 对冲）的计分不算互动 */ and not exists (select 1 from plan_log rev where rev.workspace_id = plan_log.workspace_id and rev.actor_id = plan_log.actor_id and rev.event = 'score_reversed' and rev.payload->>'awardLogId' = plan_log.id)
      ${scope.contactId ? "and linked_contact_ids @> $4::text[]" : "and cardinality(linked_contact_ids) > 0"}
    order by created_at desc, id
    limit $3`, values);
  return result.rows.map((row) => ({
    id: text(row.id),
    event: text(row.event),
    kind: text(row.kind),
    body: text(row.body),
    linkedContactIds: stringList(row.linked_contact_ids),
    linkedEventId: nullableText(row.linked_event_id),
    createdAt: iso(row.created_at),
  }));
}

async function readSchedule(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelineScheduleRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, scope.perSourceLimit, scope.now.toISOString()];
  if (scope.contactId) values.push(scope.contactId);
  // 只列已开始的日程（「互动」是已发生的事）；startsAt 不是 ISO 的脏数据不进时间线。
  const result = await sql.query<Row>(`select record_id, payload->>'kind' as kind, left(payload->>'title', ${EXCERPT_SQL_CHARS}) as title,
      payload->>'startsAt' as starts_at, payload->>'state' as state,
      ${scope.contactId
        ? "jsonb_build_array($5::text)"
        : `case when jsonb_typeof(payload->'contactIds') = 'array' then jsonb_path_query_array(payload->'contactIds', '$[0 to ${TIMELINE_CONTACTS_PER_RECORD - 1}]') else '[]'::jsonb end`} as contact_ids,
      payload->>'contactId' as contact_id, payload->>'eventId' as event_id
    from orbit_records
    where workspace_id = $1 and collection_name = 'personal_schedule_items' and user_id = $2 and lifecycle_state <> 'deleted'
      and coalesce(payload->>'state', '') <> 'cancelled'
      and payload->>'startsAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
      and (payload->>'startsAt')::timestamptz <= $4::timestamptz
      ${scope.contactId
        ? "and ((jsonb_typeof(payload->'contactIds') = 'array' and payload->'contactIds' ? $5) or payload->>'contactId' = $5)"
        : "and ((jsonb_typeof(payload->'contactIds') = 'array' and jsonb_array_length(payload->'contactIds') > 0) or payload->>'contactId' is not null)"}
    order by (payload->>'startsAt')::timestamptz desc, record_id
    limit $3`, values);
  return result.rows.flatMap((row): TimelineScheduleRow[] => {
    const kind = text(row.kind);
    if (kind !== "meeting" && kind !== "event" && kind !== "personal") return [];
    return [{
      id: text(row.record_id),
      kind,
      title: text(row.title),
      startsAt: text(row.starts_at),
      state: text(row.state),
      contactIds: stringList(row.contact_ids),
      contactId: nullableText(row.contact_id),
      eventId: nullableText(row.event_id),
    }];
  });
}

async function readTasks(sql: EventOperationsSqlExecutor, workspaceId: string, scope: Scope): Promise<TimelineTaskRow[]> {
  const values: unknown[] = [workspaceId, scope.actorId, scope.perSourceLimit];
  if (scope.contactId) values.push(scope.contactId);
  const result = await sql.query<Row>(`select record_id, payload->>'contactId' as contact_id, payload->>'status' as status,
      left(payload->>'title', ${EXCERPT_SQL_CHARS}) as title, payload->>'updatedAt' as updated_at
    from orbit_records
    where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->>'actorId' = $2 and payload ? 'connectionId' and payload->>'status' = 'completed'
      ${scope.contactId ? "and payload->>'contactId' = $4" : "and payload->>'contactId' is not null"}
    order by payload->>'updatedAt' desc, record_id
    limit $3`, values);
  return result.rows.map((row) => ({
    taskId: text(row.record_id),
    contactId: text(row.contact_id),
    status: text(row.status),
    title: text(row.title),
    updatedAt: text(row.updated_at),
  }));
}

interface SourceReads {
  sources: RelationshipTimelineSources;
  unavailable: RelationshipTimelineSource[];
}

async function readSources(runtime: RelationshipTimelineRuntime, scope: Scope): Promise<SourceReads> {
  const { client: sql, workspaceId } = runtime;
  const tasks: [RelationshipTimelineSource, () => Promise<unknown>][] = [
    ["memo", () => readMemos(sql, workspaceId, scope)],
    ["encounter", () => readEncounters(sql, workspaceId, scope)],
    ["note", () => readNotes(sql, workspaceId, scope)],
    ["plan", () => readPlanLog(sql, workspaceId, scope)],
    ["schedule", () => readSchedule(sql, workspaceId, scope)],
    ["followup_done", () => readTasks(sql, workspaceId, scope)],
    ["capture", () => readContacts(sql, workspaceId, scope.actorId, scope.contactId ? [scope.contactId] : null, scope.contactId ? 1 : scope.limit)],
  ];
  const settled = await Promise.allSettled(tasks.map(([, run]) => Promise.resolve().then(run)));
  const sources: RelationshipTimelineSources = {};
  const unavailable: RelationshipTimelineSource[] = [];
  settled.forEach((outcome, index) => {
    const source = tasks[index][0];
    if (outcome.status === "rejected") {
      unavailable.push(source);
      return;
    }
    const value = outcome.value;
    switch (source) {
      case "memo": sources.detailStates = value as TimelineDetailStateRow[]; break;
      case "encounter": sources.encounters = value as TimelineEncounterRow[]; break;
      case "note": sources.notes = value as TimelineNoteRow[]; break;
      case "plan": sources.planLog = value as TimelinePlanLogRow[]; break;
      case "schedule": sources.schedule = value as TimelineScheduleRow[]; break;
      case "followup_done": sources.tasks = value as TimelineTaskRow[]; break;
      case "capture": sources.contacts = value as TimelineContactRow[]; break;
    }
  });
  sources.unavailableSources = unavailable;
  return { sources, unavailable };
}

function allUnavailable(): RelationshipTimelineResult {
  return { items: [], unavailableSources: [...RELATIONSHIP_TIMELINE_SOURCES], total: 0 };
}

function clampLimit(limit: number | undefined, fallback: number): number {
  const value = Number.isFinite(limit) ? Math.floor(limit as number) : fallback;
  return Math.max(1, Math.min(TIMELINE_PER_SOURCE_LIMIT, value));
}

function resolveRuntime(deps: RelationshipTimelineReaderDeps): RelationshipTimelineRuntime | null {
  if (deps.runtime !== undefined) return deps.runtime;
  return createConfiguredEventOperationsPostgresRuntime();
}

export async function readRelationshipTimelineForContact(
  input: { actorId: string; contactId: string; now: Date; limit?: number },
  deps: RelationshipTimelineReaderDeps = {},
): Promise<RelationshipTimelineResult> {
  const actorId = input.actorId.trim();
  const contactId = input.contactId.trim();
  if (!actorId || !contactId) return { items: [], unavailableSources: [], total: 0 };
  const runtime = resolveRuntime(deps);
  if (!runtime) return allUnavailable();
  const limit = clampLimit(input.limit, TIMELINE_DETAIL_DEFAULT_LIMIT);
  const { sources, unavailable } = await readSources(runtime, { actorId, contactId, now: input.now, limit, perSourceLimit: TIMELINE_PER_SOURCE_LIMIT });
  if (unavailable.length === RELATIONSHIP_TIMELINE_SOURCES.length) return allUnavailable();
  // 联系人读到了却不属于本人（或已删除）：整条时间线为空，不给出任何来源的条目。
  if (sources.contacts && !sources.contacts.some((contact) => contact.id === contactId)) {
    return { items: [], unavailableSources: [], total: 0 };
  }
  const built = buildRelationshipTimeline(sources, contactId);
  return { items: built.items.slice(0, limit), unavailableSources: built.unavailableSources, total: built.items.length };
}

export async function readRecentRelationshipTimelineForActor(
  input: { actorId: string; now: Date; limit: number },
  deps: RelationshipTimelineReaderDeps = {},
): Promise<RelationshipTimelineResult> {
  const actorId = input.actorId.trim();
  if (!actorId) return { items: [], unavailableSources: [], total: 0 };
  const runtime = resolveRuntime(deps);
  if (!runtime) return allUnavailable();
  const limit = clampLimit(input.limit, TIMELINE_DETAIL_DEFAULT_LIMIT);
  const { sources, unavailable } = await readSources(runtime, { actorId, now: input.now, limit, perSourceLimit: limit });
  if (unavailable.length === RELATIONSHIP_TIMELINE_SOURCES.length) return allUnavailable();

  const contactIds = new Set<string>();
  for (const state of sources.detailStates ?? []) contactIds.add(state.contactId);
  for (const row of sources.encounters ?? []) contactIds.add(row.contactId);
  for (const row of sources.notes ?? []) row.contactIds.forEach((id) => contactIds.add(id));
  for (const row of sources.planLog ?? []) row.linkedContactIds.forEach((id) => contactIds.add(id));
  for (const row of sources.schedule ?? []) {
    (row.contactIds ?? []).forEach((id) => contactIds.add(id));
    if (row.contactId) contactIds.add(row.contactId);
  }
  for (const row of sources.tasks ?? []) contactIds.add(row.contactId);
  for (const row of sources.contacts ?? []) contactIds.add(row.id);
  contactIds.delete("");

  // 只留仍属于本人、未删除的联系人的条目：一次固定上限的归属读取（每条记录至多展开 TIMELINE_CONTACTS_PER_RECORD 个 id，
  // 总数截到 TIMELINE_RECENT_OWNERSHIP_LIMIT）。
  let owned: Map<string, TimelineContactRow>;
  try {
    const ids = [...contactIds].slice(0, TIMELINE_RECENT_OWNERSHIP_LIMIT);
    const rows = ids.length ? await readContacts(runtime.client, runtime.workspaceId, actorId, ids, TIMELINE_RECENT_OWNERSHIP_LIMIT) : [];
    owned = new Map(rows.map((row) => [row.id, row]));
  } catch {
    return allUnavailable();
  }

  const items: RelationshipTimelineItem[] = [];
  for (const contactId of owned.keys()) {
    items.push(...buildRelationshipTimeline({ ...sources, contacts: sources.contacts?.filter((row) => row.id === contactId) }, contactId).items);
  }
  const merged = mergeRelationshipTimelineItems(items, Number.MAX_SAFE_INTEGER);
  return {
    items: merged.slice(0, limit),
    unavailableSources: RELATIONSHIP_TIMELINE_SOURCES.filter((source) => unavailable.includes(source)),
    total: merged.length,
  };
}

/** 「写 memo」关联活动推荐的读取窗口：近 30 天到明天，至多 20 条。 */
export const MEMO_EVENT_OPTION_DAYS = 30;
export const MEMO_EVENT_OPTION_LIMIT = 20;

/**
 * W0046：「写 memo」的关联活动推荐——本人个人日程里 kind = "event"（报名活动生成）、未取消、
 * 开始时间在近 30 天内的项。读失败返回空数组（弹窗只隐藏推荐）。
 */
export async function readMemoEventOptions(
  input: { actorId: string; now: Date },
  deps: RelationshipTimelineReaderDeps = {},
): Promise<{ eventId: string; title: string; startsAt: string }[]> {
  const actorId = input.actorId.trim();
  if (!actorId) return [];
  const runtime = resolveRuntime(deps);
  if (!runtime) return [];
  try {
    const from = new Date(input.now.getTime() - MEMO_EVENT_OPTION_DAYS * 86_400_000).toISOString();
    const to = new Date(input.now.getTime() + 86_400_000).toISOString();
    const result = await runtime.client.query<Row>(`select payload->>'eventId' as event_id, left(payload->>'title', ${EXCERPT_SQL_CHARS}) as title, payload->>'startsAt' as starts_at
      from orbit_records
      where workspace_id = $1 and collection_name = 'personal_schedule_items' and user_id = $2 and lifecycle_state <> 'deleted'
        and payload->>'kind' = 'event' and coalesce(payload->>'state', '') <> 'cancelled' and payload->>'eventId' is not null
        and payload->>'startsAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
        and (payload->>'startsAt')::timestamptz >= $3::timestamptz and (payload->>'startsAt')::timestamptz < $4::timestamptz
      order by (payload->>'startsAt')::timestamptz desc, record_id
      limit $5`, [runtime.workspaceId, actorId, from, to, MEMO_EVENT_OPTION_LIMIT]);
    return result.rows.flatMap((row) => {
      const eventId = text(row.event_id);
      const title = text(row.title);
      const startsAt = text(row.starts_at);
      return eventId && title && startsAt ? [{ eventId, title, startsAt }] : [];
    });
  } catch {
    return [];
  }
}
