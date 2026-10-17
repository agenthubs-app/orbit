import { z } from "zod";
import { todoDecisionItemObject, todoNextMoveItemObject } from "../../shared/api-schema/todo-page";
import type { TodoDecisionItem, TodoNextMoveItem } from "../../shared/contract/todo-page";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { TodoSourceReader } from "./service";

/** Count only this many previews when a source has no native total. One extra
 * SQL-side row detects truncation; full counts are reserved for follow-ups. */
export const TODO_SOURCE_COUNT_CAP = 100;
type Source = "agent_action" | "entity_draft" | "agent_signal";
const position = z.object({ score: z.number(), sort: z.string().min(1).max(80), id: z.string().min(1).max(2048) }).strict();
const recordSources = {
  agent_action: { collection: "agentActionsV2", scoped: true, value: "payload->'entity'", id: "actionId", title: "title", reason: "whyNow", filter: "v->>'status'='awaiting_confirmation'", actions: ["accept", "dismiss", "snooze", "open"] },
  entity_draft: { collection: "agent_entity_drafts", scoped: false, value: "payload", id: "draftId", title: "", reason: "", filter: "v->>'state'='pending_confirmation' and jsonb_typeof(v->'fields')='object' and jsonb_typeof(v->'conversationId')='string' and v->>'conversationId'<>''", actions: ["open"] },
  agent_signal: { collection: "agentSignals", scoped: true, value: "payload->'signal'", id: "signalId", title: "title", reason: "reason", filter: "v->>'status' in ('new','acknowledged','snoozed','dismissed')", actions: [] },
} as const;

function sql(source: Source) {
  const spec = recordSources[source];
  const title = source === "entity_draft" ? "coalesce(v->'fields'->>'title',v->'fields'->>'displayName',v->'fields'->>'name',v->'fields'->>'summary',v->>'kind')" : `v->>'${spec.title}'`;
  const extra = source === "agent_signal"
    ? "'draftAvailable',true,'taskId',case when v->>'targetType'='task' then v->>'targetId' end,'contactId',case when v->>'targetType'='contact' then v->>'targetId' end,'eventId',case when v->>'targetType'='event' then v->>'targetId' end"
    : `'actions','${JSON.stringify(spec.actions)}'::jsonb,'conversationId',${source === "entity_draft" ? "v->>'conversationId'" : "null"},'contactId',v->>'contactId','contactNamePreview',left(coalesce(v->>'contactName',v->>'displayName'),120)`;
  return `with request as (select $2::text as actor_id), owned as materialized (
    select record_id,created_at,updated_at,${spec.value} as v from orbit_records
    where workspace_id=$1 and collection_name='${spec.collection}' and lifecycle_state<>'deleted' and deleted_at is null ${spec.scoped ? "" : "and user_id=$2"}
  ), visible as materialized (
    select record_id as id,coalesce(v->>'lastMeaningfulChangeAt',v->>'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as sort,
      ${source === "agent_signal" ? "case when jsonb_typeof(v->'importance')='number' then (v->>'importance')::double precision else 0 end" : "0"} as score,
      jsonb_strip_nulls(jsonb_build_object('key','${source}:'||record_id,'source','${source}','sourceId',record_id,'titlePreview',left(${title},240),
        'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'reasonPreview',${spec.reason ? `left(v->>'${spec.reason}',320)` : "null"},${extra})) as item
    from owned where v->>'${spec.id}'=record_id and octet_length(record_id)<=2048 and ${title} is not null and ${title}<>'' and ${spec.filter}
  ), count_window as (select 1 from visible limit ${TODO_SOURCE_COUNT_CAP + 1}), page as (
    select * from visible where $3::text is null or (score,sort collate "C",id collate "C")<($4::double precision,$3 collate "C",$5 collate "C")
    order by score desc,sort collate "C" desc,id collate "C" desc limit $6
  ) select jsonb_build_object('count',(select count(*) from count_window),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('item',item,'position',jsonb_build_object('score',score,'sort',sort,'id',id))
      order by score desc,sort collate "C" desc,id collate "C" desc) from page),'[]'::jsonb)) as result`;
}

export function createTodoRecordReaders(input: { client: LiveRecordSqlClient; workspaceId: string; assertAllowed: (collection: string) => void }): Record<Source, TodoSourceReader> {
  const read = (source: Source): TodoSourceReader => async query => {
    const spec = recordSources[source];
    input.assertAllowed(spec.collection);
    const after = query.cursor ? position.parse(JSON.parse(query.cursor)) : null;
    const response = await input.client.query<{ result: unknown }>(sql(source), [spec.scoped ? `${input.workspaceId}:agent-actor:${query.actorId}` : input.workspaceId,
      query.actorId, after?.sort ?? null, after?.score ?? null, after?.id ?? null, query.limit + 1]);
    const item = source === "agent_signal" ? todoNextMoveItemObject : todoDecisionItemObject;
    const row = z.object({ count: z.number().int().nonnegative().max(TODO_SOURCE_COUNT_CAP + 1), entries: z.array(z.object({ item, position })).max(51) }).parse(response.rows[0]?.result);
    return { total: Math.min(row.count, TODO_SOURCE_COUNT_CAP), capped: row.count > TODO_SOURCE_COUNT_CAP, hasMore: row.entries.length > query.limit,
      entries: row.entries.slice(0, query.limit).map(entry => ({ item: entry.item as TodoDecisionItem | TodoNextMoveItem, cursor: JSON.stringify(entry.position) })) };
  };
  return { agent_action: read("agent_action"), entity_draft: read("entity_draft"), agent_signal: read("agent_signal") };
}
