import { z } from "zod";
import { todoFollowupItemObject } from "../../shared/api-schema/todo-page";
import { OPEN_LIFECYCLE_TASK_STATUSES, OPEN_PLAIN_TASK_STATUSES } from "../../shared/compute/follow-up-task";
import type { TodoFollowupItem } from "../../shared/contract/todo-page";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { LIFECYCLE_TASK_CLASSIFIED_CTES } from "../followups/storage/lifecycle-task-pages";
import { taskRecordsValidityCte, taskTimestampSql } from "../tasks/task-page";
import type { TodoSourceReader } from "./service";

const whitespace = "\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";
const nonblank = (value: string) => `(jsonb_typeof(${value})='string' and btrim(${value} #>> '{}',U&'${whitespace}')<>'')`;
const openStatuses = (values: readonly string[]) => values.map(value => `'${value}'`).join(",");
const deleted = (value: string) => `(${nonblank(`${value}->'deletedAt'`)} or ${value}->'deleted'='true'::jsonb or ${value}->>'lifecycleState'='deleted')`;
const plain = `with ${taskRecordsValidityCte()}, eligible as materialized (
  select v.record_id as id,v.t,v.activities,
    case when t ? 'dueAt' then ${taskTimestampSql("t->>'dueAt'")}
      when t ? 'plannedDate' then ((t->>'plannedDate')::date+time '23:59:59.999') at time zone $4 end as due_at,
    t->>'createdAt' as created_at, t->>'relatedContactId' as contact_id
  from valid v
  where t->>'status' in (${openStatuses(OPEN_PLAIN_TASK_STATUSES)})
    and (t->>'category'='relationship' or ${nonblank("t->'relatedContactId'")})
    and not coalesce(${deleted("t")},false) and v.deleted_at is null
)`;
const lifecycle = `${LIFECYCLE_TASK_CLASSIFIED_CTES}, eligible as materialized (
  select distinct on (c.id) c.id,c.task as t,'[]'::jsonb as activities,
    case when pg_input_is_valid(task->>'dueAt','timestamp with time zone') then (task->>'dueAt')::timestamptz end as due_at,
    case when pg_input_is_valid(task->>'createdAt','timestamp with time zone') then task->>'createdAt' else task->'metadata'->>'createdAt' end as created_at,
    coalesce(task->>'contactId',contact->>'id') as contact_id
  from classified c join actor_tasks r on r.record_id=c.record_id
  where task->>'status' in (${openStatuses(OPEN_LIFECYCLE_TASK_STATUSES)}) and (task ? 'contactId' or task ? 'connectionId')
    and not coalesce(${deleted("r.payload")},false) and r.deleted_at is null
  order by c.id,c.record_id collate "C"
)`;

function sql(source: "task" | "relationship_task") {
  return `${source === "task" ? plain : lifecycle}, ordered as materialized (
    select *,coalesce(to_char(due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'9999-12-31T23:59:59.999Z') as sort_due,
      coalesce((due_at at time zone $4)::date<$3::date,false) as overdue from eligible
  ), page as (
    select * from ordered where $5::text is null or (sort_due collate "C",id collate "C")>($5 collate "C",$6 collate "C")
    order by sort_due collate "C",id collate "C" limit $7
  ) select jsonb_build_object('ok',${source === "task" ? "true" : "(select ok from integrity)"},'total',(select count(*) from ordered),'overdue',(select count(*) from ordered where overdue),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('position',jsonb_build_object('due',sort_due,'id',id),'item',jsonb_strip_nulls(jsonb_build_object(
      'key','${source}:'||id,'source','${source}','sourceId',id,'taskId',id,'titlePreview',left(t->>'title',240),'createdAt',created_at,
      'kind','${source === "task" ? "task" : "lifecycle"}','status',t->>'status','dueAt',case when due_at is not null then sort_due end,'overdue',overdue,
      'contactId',contact_id,'contactNamePreview',(select left(c.payload->>'displayName',120) from orbit_records c where c.workspace_id=$1 and c.collection_name='contacts'
        and c.record_id=contact_id and c.user_id=$2 and c.lifecycle_state<>'deleted' and c.deleted_at is null
        and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($2::text))),
      'deferralCount',${source === "task" ? `(select count(*) from jsonb_array_elements(activities) a where a->>'actorType'='user' and a->>'type' in ('updated','rescheduled') and (a->'changes' ? 'previousPlannedDate' or a->'changes' ? 'previousDueAt'))` : "null"}
    ))) order by sort_due collate "C",id collate "C") from page),'[]'::jsonb)) as result`;
}

const position = z.object({ due: z.string().min(1).max(40), id: z.string().min(1).max(2048) }).strict();
const count = z.number().int().nonnegative().safe();
const output = z.object({ ok: z.boolean(), total: count, overdue: count, entries: z.array(z.object({ position, item: todoFollowupItemObject })).max(51) });

export function createTodoFollowupReaders(input: { client: LiveRecordSqlClient; workspaceId: string; assertAllowed: (collection: string) => void }): { task: TodoSourceReader; relationship_task: TodoSourceReader } {
  const reader = (source: "task" | "relationship_task"): TodoSourceReader => async query => {
    input.assertAllowed("tasks"); input.assertAllowed("contacts");
    if (source === "relationship_task") input.assertAllowed("connections");
    const after = query.cursor ? position.parse(JSON.parse(query.cursor)) : null;
    const reply = await input.client.query<{ result: unknown }>(sql(source), [input.workspaceId, query.actorId, query.date, query.timeZone, after?.due ?? null, after?.id ?? null, query.limit + 1]);
    const result = output.parse(reply.rows[0]?.result);
    if (!result.ok) throw Error("TODO_FOLLOWUP_INTEGRITY");
    return { total: result.total, overdue: result.overdue, hasMore: result.entries.length > query.limit,
      entries: result.entries.slice(0, query.limit).map(entry => ({ item: entry.item as TodoFollowupItem, cursor: JSON.stringify(entry.position) })) };
  };
  return { task: reader("task"), relationship_task: reader("relationship_task") };
}
