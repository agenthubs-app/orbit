/**
 * W0047（review P2-6）：详情「依据」按信号回指时间线条目。
 *
 * 详情时间线只读最近 20 条，而强度信号按贡献挑选，可能是更早的事件。这里按信号的 timelineItemId
 * （至多 12 个）一条语句读回对应的来源行，用 W0046 的 buildRelationshipTimeline 生成同一 id、同一双语标题的条目。
 * 只读、本人隔离（与时间线读取器同一归属口径）；读失败返回空数组（依据退回来源名）。
 */
import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import {
  buildRelationshipTimeline,
  MEMO_NOTE_ID_PREFIX,
  type RelationshipTimelineSources,
} from "../relationship-timeline/build";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import type { RelationshipStrengthSqlExecutor } from "./timelines";

export const RELATIONSHIP_SIGNAL_ITEM_LIMIT = 12;
const TITLE_CHARS = 200;

type Row = { source: string; row: Record<string, unknown> | string };

const OWNED_CONTACT_SQL = `user_id = $2
  and (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->>'accountId' = $2)`;

/** 一条语句：七种来源各一个按 id 过滤的分支（UNION ALL），只取生成条目需要的字段。 */
export const RELATIONSHIP_SIGNAL_ITEMS_SQL = `/* relationship-strength:signal-items */
  select 'capture' as source, jsonb_build_object('id', record_id,
      'createdAt', coalesce(payload->>'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'sourceType', payload->'source'->>'type', 'metEventId', payload->>'metEventId', 'metEventTitle', left(payload->>'metEventTitle', ${TITLE_CHARS})) as row
    from orbit_records
    where workspace_id = $1 and collection_name = 'contacts' and record_id = $3 and lifecycle_state <> 'deleted' and deleted_at is null and ${OWNED_CONTACT_SQL}
      and 'capture:' || $3 = any($4::text[])
  union all
  select 'memo', jsonb_build_object('noteId', n->>'noteId', 'createdAt', n->>'createdAt', 'occurredAt', n->>'occurredAt', 'eventId', n->>'eventId')
    from orbit_records r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
    where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
      and r.payload->>'contactId' = $3 and r.lifecycle_state <> 'deleted'
      and n->>'noteId' like '${MEMO_NOTE_ID_PREFIX}%' and 'memo:' || (n->>'noteId') = any($4::text[])
  union all
  select 'encounter', jsonb_build_object('encounterId', record_id, 'observedAt', payload->>'observedAt', 'eventId', payload->>'eventId')
    from orbit_records
    where workspace_id = $1 and collection_name = 'human_encounters' and user_id = $2 and payload->>'actorId' = $2
      and payload->>'contactId' = $3 and lifecycle_state <> 'deleted' and 'encounter:' || record_id = any($4::text[])
  union all
  select 'note', jsonb_build_object('id', payload->'note'->>'id', 'title', left(coalesce(payload->'note'->>'title', ''), ${TITLE_CHARS}),
      'body', left(payload->'note'->>'body', ${TITLE_CHARS}), 'createdAt', payload->'note'->>'createdAt', 'eventIds', payload->'note'->'eventIds')
    from orbit_records
    where workspace_id = $1 and collection_name = 'notes' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->'note'->>'ownerUserId' = $2 and payload->'note'->>'accountId' = $2
      and jsonb_typeof(payload->'note'->'contactIds') = 'array' and payload->'note'->'contactIds' ? $3
      and 'note:' || (payload->'note'->>'id') = any($4::text[])
  union all
  select 'plan', jsonb_build_object('id', id, 'event', event, 'kind', kind, 'body', left(body, ${TITLE_CHARS}), 'linkedEventId', linked_event_id,
      'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    from plan_log
    where workspace_id = $1 and actor_id = $2 and linked_contact_ids @> array[$3::text] and 'plan:' || id = any($4::text[])
  union all
  select 'schedule', jsonb_build_object('id', record_id, 'kind', payload->>'kind', 'title', left(payload->>'title', ${TITLE_CHARS}),
      'startsAt', payload->>'startsAt', 'state', payload->>'state', 'eventId', payload->>'eventId')
    from orbit_records
    where workspace_id = $1 and collection_name = 'personal_schedule_items' and user_id = $2 and lifecycle_state <> 'deleted'
      and ((jsonb_typeof(payload->'contactIds') = 'array' and payload->'contactIds' ? $3) or payload->>'contactId' = $3)
      and 'schedule:' || record_id = any($4::text[])
  union all
  select 'followup_done', jsonb_build_object('taskId', record_id, 'status', payload->>'status', 'title', left(payload->>'title', ${TITLE_CHARS}),
      'updatedAt', payload->>'updatedAt')
    from orbit_records
    where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and lifecycle_state <> 'deleted'
      and payload->>'actorId' = $2 and payload->>'contactId' = $3 and 'followup_done:' || record_id = any($4::text[])`;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** 按信号 id 读回时间线条目（至多 12 个 id，一条语句）；没有 id 时 0 条语句。 */
export async function readRelationshipSignalItems(
  sql: RelationshipStrengthSqlExecutor,
  workspaceId: string,
  input: { actorId: string; contactId: string; timelineItemIds: readonly string[] },
): Promise<RelationshipTimelineItem[]> {
  const ids = [...new Set(input.timelineItemIds)].slice(0, RELATIONSHIP_SIGNAL_ITEM_LIMIT);
  if (ids.length === 0 || !input.actorId.trim() || !input.contactId.trim()) return [];
  const result = await sql.query<Row>(RELATIONSHIP_SIGNAL_ITEMS_SQL, [workspaceId, input.actorId, input.contactId, ids]);
  const sources: Required<Omit<RelationshipTimelineSources, "unavailableSources">> = {
    contacts: [], detailStates: [], encounters: [], notes: [], planLog: [], schedule: [], tasks: [],
  };
  const memoNotes: { noteId: string; body: string; createdAt: string; occurredAt: string | null; eventId: string | null }[] = [];
  for (const entry of result.rows) {
    const row = (typeof entry.row === "string" ? JSON.parse(entry.row) : entry.row) as Record<string, unknown>;
    switch (entry.source) {
      case "capture":
        (sources.contacts as unknown[]).push({ id: text(row.id), createdAt: text(row.createdAt), sourceType: nullable(row.sourceType), metEventId: nullable(row.metEventId), metEventTitle: nullable(row.metEventTitle) });
        break;
      case "memo":
        memoNotes.push({ noteId: text(row.noteId), body: "", createdAt: text(row.createdAt), occurredAt: nullable(row.occurredAt), eventId: nullable(row.eventId) });
        break;
      case "encounter":
        (sources.encounters as unknown[]).push({ encounterId: text(row.encounterId), contactId: input.contactId, observedAt: text(row.observedAt), eventId: nullable(row.eventId) });
        break;
      case "note":
        (sources.notes as unknown[]).push({ id: text(row.id), contactIds: [input.contactId], title: text(row.title) || (text(row.body).split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ""), body: "", createdAt: text(row.createdAt), eventIds: Array.isArray(row.eventIds) ? row.eventIds.filter((id): id is string => typeof id === "string") : [] });
        break;
      case "plan":
        (sources.planLog as unknown[]).push({ id: text(row.id), event: text(row.event), kind: text(row.kind), body: "", linkedContactIds: [input.contactId], linkedEventId: nullable(row.linkedEventId), createdAt: text(row.createdAt) });
        break;
      case "schedule": {
        const kind = text(row.kind);
        if (kind === "meeting" || kind === "event" || kind === "personal") {
          (sources.schedule as unknown[]).push({ id: text(row.id), kind, title: text(row.title), startsAt: text(row.startsAt), state: text(row.state), contactIds: [input.contactId], eventId: nullable(row.eventId) });
        }
        break;
      }
      case "followup_done":
        (sources.tasks as unknown[]).push({ taskId: text(row.taskId), contactId: input.contactId, status: text(row.status), title: text(row.title), updatedAt: text(row.updatedAt) });
        break;
    }
  }
  if (memoNotes.length > 0) (sources.detailStates as unknown[]).push({ actorId: input.actorId, contactId: input.contactId, notes: memoNotes });
  const wanted = new Set(ids);
  return buildRelationshipTimeline(sources, input.contactId).items.filter((item) => wanted.has(item.id));
}

/** 详情页用：配置的数据库；未配置或读失败返回空数组（依据退回来源名），只写结构化日志。 */
export async function readConfiguredRelationshipSignalItems(input: { actorId: string; contactId: string; timelineItemIds: readonly string[] }): Promise<RelationshipTimelineItem[]> {
  if (input.timelineItemIds.length === 0) return [];
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return [];
  try {
    return await readRelationshipSignalItems(runtime.client, runtime.workspaceId, input);
  } catch (error) {
    console.error(JSON.stringify({ event: "relationship_signal_items_failed", actorId: input.actorId, error: error instanceof Error ? error.name : "unknown" }));
    return [];
  }
}
