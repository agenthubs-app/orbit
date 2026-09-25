import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TaskPageContract } from "../../shared/contract/task-page";
import { taskCardSchema, taskPageSchema } from "../../shared/api-schema/task-page";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";

export interface TaskPageQuery {
  status: "open" | "completed";
  scope?: "all" | "relationship";
  query?: string;
  limit?: number;
  cursor?: string | null;
}

const whitespace = "\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";
const nonblank = (v: string) => `(jsonb_typeof(${v})='string' and btrim(${v} #>> '{}',U&'${whitespace}')<>'')`;
const optional = (v: string, key: string) => `(not (${v} ? '${key}') or ${nonblank(`${v}->'${key}'`)})`;
// Match the existing task decoder's Date.parse-compatible ISO syntax. In
// particular February 31 normalizes in JS, while 24:01 and leap seconds fail.
const isoPattern = "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?|24:00:00([.]0{1,3})?)(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";
const instant = (v: string) => `(jsonb_typeof(${v})='string' and (${v} #>> '{}') ~ '${isoPattern}')`;
const localDate = (v: string) => `(case when jsonb_typeof(${v})='string' and (${v} #>> '{}') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  then substring(${v} #>> '{}' from 1 for 4)::int >= 100
    and substring(${v} #>> '{}' from 9 for 2)::int <= extract(day from (make_date(greatest(1,substring(${v} #>> '{}' from 1 for 4)::int),substring(${v} #>> '{}' from 6 for 2)::int,1) + interval '1 month - 1 day'))
  else false end)`;
const enums = (v: string, values: string[]) => `(jsonb_typeof(${v})='string' and (${v} #>> '{}') in (${values.map(value => `'${value}'`).join(",")}))`;

// This is a read model, not a shortened TaskRecordPayload. Audit histories and
// note bodies are validated/searched inside PG and never sent with list cards.
// Count and page selection share the same statement snapshot and authorization.
const SQL = `with owned as materialized (
  select record_id,payload->'task' as t,payload->'activities' as activities from orbit_records
  where workspace_id=$1 and collection_name='tasks' and user_id=$2 and lifecycle_state<>'deleted'
    and payload->'version'='1'::jsonb and jsonb_typeof(payload->'task')='object' and jsonb_typeof(payload->'activities')='array'
    and payload->'task'->'accountId'=to_jsonb($2::text) and payload->'task'->'ownerUserId'=to_jsonb($2::text)
    and payload->'task'->'id'=to_jsonb(record_id)
), valid as materialized (
  select *, case when $3='completed' then t->>'updatedAt' else coalesce(t->>'dueAt',t->>'plannedDate','9999') end as sort_key
  from owned where ${nonblank("t->'id'")} and ${nonblank("t->'title'")}
    and ${enums("t->'status'", ["open", "completed", "cancelled"])}
    and ${enums("t->'category'", ["relationship", "meeting", "event", "work", "personal", "other"])}
    and ${enums("t->'priority'", ["normal", "high"])} and ${enums("t->'source'", ["manual", "ai_confirmed", "contact", "event", "inbox"])}
    and ${["notes", "location", "relatedContactId", "relatedEventId", "relatedMeetingId", "relatedConversationId", "suggestionId", "sourceNoteId"].map(key => optional("t", key)).join(" and ")}
    and (not (t ? 'plannedDate') or ${localDate("t->'plannedDate'")})
    and (not (t ? 'dueAt') or ${instant("t->'dueAt'")})
    and ${instant("t->'createdAt'")} and ${instant("t->'updatedAt'")}
    and (t ? 'sourceNoteId')=(t ? 'sourceNoteVersion')
    and (not (t ? 'sourceNoteVersion') or case when jsonb_typeof(t->'sourceNoteVersion')='number'
      then (t->>'sourceNoteVersion')::numeric>=1 and trunc((t->>'sourceNoteVersion')::numeric)=(t->>'sourceNoteVersion')::numeric else false end)
    and case when t->>'status'='completed' then ${instant("t->'completedAt'")} and ${nonblank("t->'completedBy'")}
      and ${enums("t->'completionSource'", ["user", "agent_confirmed", "notification_action"])}
      else not (t ?| array['completedAt','completedBy','completionSource']) end
    and not exists (
      select 1 from (
        select a,lag(a->>'occurredAt') over(order by ordinal) as previous_at,count(*) over(partition by a->'id') as copies
        from jsonb_array_elements(activities) with ordinality entries(a,ordinal)
      ) history where not coalesce(
        jsonb_typeof(a)='object' and jsonb_typeof(a->'taskSnapshot')='object' and ${nonblank("a->'id'")}
        and a->'accountId'=to_jsonb($2::text) and a->'ownerUserId'=to_jsonb($2::text) and a->'taskId'=t->'id'
        and ${enums("a->'type'", ["created", "updated", "rescheduled", "completed", "reopened", "cancelled", "deleted"])}
        and ${enums("a->'actorType'", ["user", "agent", "system", "notification_action"])} and ${optional("a", "actorId")}
        and ${instant("a->'occurredAt'")} and ${nonblank("a->'taskSnapshot'->'title'")}
        and ${enums("a->'taskSnapshot'->'category'", ["relationship", "meeting", "event", "work", "personal", "other"])}
        and ${optional("a->'taskSnapshot'", "relatedContactId")} and ${optional("a->'taskSnapshot'", "relatedEventId")}
        and (not (a ? 'changes') or jsonb_typeof(a->'changes')='object') and copies=1
        and (previous_at is null or (a->>'occurredAt') collate "C">=previous_at collate "C"),false)
    )
), filtered as materialized (
  select * from valid where ($4='all' or t->>'category'='relationship' or ${nonblank("t->'relatedContactId'")})
    and ($5='' or strpos(lower((t->>'title') || ' ' || coalesce(t->>'notes','') collate pg_catalog."und-x-icu"),lower($5 collate pg_catalog."und-x-icu"))>0)
), page as (
  select * from filtered where t->>'status'=$3 and ($6::text is null
    or case when $3='completed' then sort_key collate "C"<$6 collate "C" else sort_key collate "C">$6 collate "C" end
    or (sort_key=$6 and ((t->>'updatedAt') collate "C"<$7 collate "C" or (t->>'updatedAt'=$7 and record_id collate "C">$8 collate "C"))))
  order by case when $3='completed' then sort_key end collate "C" desc,case when $3<>'completed' then sort_key end collate "C",(t->>'updatedAt') collate "C" desc,record_id collate "C" limit $9
), cards as (
  select p.*, jsonb_build_object('id',record_id,'titlePreview',left(t->>'title',240),'locationPreview',left(t->>'location',120),
    'status',t->>'status','category',t->>'category','priority',t->>'priority','plannedDate',t->>'plannedDate','dueAt',t->>'dueAt','updatedAt',t->>'updatedAt',
    'relatedContact',(select jsonb_build_object('id',c.record_id,'namePreview',left(c.payload->>'displayName',120),'organizationPreview',left(coalesce(c.payload->>'organization',''),120))
      from orbit_records c where c.workspace_id=$1 and c.collection_name='contacts' and c.record_id=t->>'relatedContactId' and c.user_id=$2 and c.lifecycle_state<>'deleted'
        and (c.payload->'accountId' is null or c.payload->'accountId'='null'::jsonb or c.payload->'accountId'=to_jsonb($2::text))
        and c.payload->'id'=to_jsonb(c.record_id) and ${nonblank("c.payload->'displayName'")}),
    'position',jsonb_build_object('sort',sort_key,'updated',t->>'updatedAt','id',record_id)) as card from page p
)
select case when exists(select 1 from filtered where octet_length(record_id)>2048 or octet_length(coalesce(t->>'relatedContactId',''))>2048)
  then jsonb_build_object('ok',false)
  else jsonb_build_object('ok',true,
  'counts',jsonb_build_object('open',(select count(*) from filtered where t->>'status'='open'),'completed',(select count(*) from filtered where t->>'status'='completed')),
  'items',coalesce((select jsonb_agg(card order by case when $3='completed' then sort_key end collate "C" desc,case when $3<>'completed' then sort_key end collate "C",(t->>'updatedAt') collate "C" desc,record_id collate "C") from cards),'[]'::jsonb)) end as result`;

const position = z.object({ sort: z.string().min(1).max(40), updated: z.string().min(1).max(40), id: z.string().min(1).max(2048) }).strict();
export function createTaskPageReader(input: { client: LiveRecordSqlClient; workspaceId: string; secret: string; now?: () => string }) {
  return { async read(actorId: string, query: TaskPageQuery): Promise<TaskPageContract> {
    const limit = query.limit ?? 30, scope = query.scope ?? "all", search = (query.query ?? "").trim();
    if (!actorId.trim() || actorId.length > 2048 || !["open","completed"].includes(query.status) || !["all","relationship"].includes(scope)
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || search.length > 240) throw Error("TASK_PAGE_INPUT_INVALID");
    if (Buffer.byteLength(input.secret) < 32) throw Error("READ_CURSOR_SECRET_MISSING");
    const identity = JSON.stringify(["task-page:v1",input.workspaceId,actorId,query.status,scope,search]);
    const sign = (value: string) => createHmac("sha256",input.secret).update(identity).update(value).digest();
    let after: z.infer<typeof position> | null = null;
    if (query.cursor) try {
      if (query.cursor.length > 8000) throw Error();
      const [payload, signature, ...extra] = query.cursor.split(".");
      if (!payload || !signature || extra.length) throw Error();
      const actual = Buffer.from(signature,"base64url"), expected = sign(payload);
      if (actual.length !== expected.length || actual.toString("base64url") !== signature || !timingSafeEqual(actual,expected)) throw Error();
      after = position.parse(JSON.parse(Buffer.from(payload,"base64url").toString("utf8")));
    } catch { throw Error("TASK_PAGE_CURSOR_INVALID"); }
    const response = await input.client.query<{result: unknown}>(SQL,[input.workspaceId,actorId,query.status,scope,search,after?.sort ?? null,after?.updated ?? null,after?.id ?? null,limit+1]);
    const result = z.object({ ok: z.literal(true), counts: z.object({open:z.number().int().nonnegative().safe(),completed:z.number().int().nonnegative().safe()}).strict(),
      items:z.array(taskCardSchema.extend({position})).max(51) }).strict().parse(response.rows[0]?.result);
    const items = result.items.slice(0,limit), hasMore = result.items.length > limit, last = items.at(-1);
    const encoded = hasMore && last ? Buffer.from(JSON.stringify(last.position)).toString("base64url") : null;
    return taskPageSchema.parse({actorId,status:query.status,scope,query:search,items:items.map(({position:_position,...card})=>card),counts:result.counts,total:result.counts[query.status],hasMore,
      nextCursor:encoded ? `${encoded}.${sign(encoded).toString("base64url")}` : null,asOf:input.now?.() ?? new Date().toISOString()});
  }};
}

export function createConfiguredTaskPageReader(expectedWorkspaceId?: string) {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  if (expectedWorkspaceId && expectedWorkspaceId !== configured.workspaceId) throw Error("TASK_PAGE_STORAGE_UNAVAILABLE");
  const reader = createTaskPageReader({client:configured.client,workspaceId:configured.workspaceId,secret:process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ""});
  return {read(actorId:string,query:TaskPageQuery){resolveSharedReadBudgetGate()?.assertAllowed({collectionName:"tasks"});return reader.read(actorId,query);}};
}
