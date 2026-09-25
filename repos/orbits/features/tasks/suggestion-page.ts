import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TaskSuggestionPageContract } from "../../shared/contract/task-suggestion-page";
import { taskSuggestionCardSchema, taskSuggestionPageSchema } from "../../shared/api-schema/task-suggestion-page";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";

export type { TaskSuggestionPageContract, TaskSuggestionCardContract } from "../../shared/contract/task-suggestion-page";
export interface TaskSuggestionPageQuery { scope?: "all" | "relationship"; limit?: number; cursor?: string | null }

// Validate in PG without downloading evidence or source references. Read-only
// previews do not carry complete suggestions or imply confirmation permission.
const whitespace="\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF";
const nonblank=(value:string)=>`(jsonb_typeof(${value})='string' and btrim(${value} #>> '{}',U&'${whitespace}')<>'')`;
const text = (field: string) => nonblank(`s->'${field}'`);
const timestamp = (field: string) => `(jsonb_typeof(s->'${field}')='string' and (s->>'${field}') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
  and pg_input_is_valid(s->>'${field}','timestamp with time zone'))`;
const stringArray=(field:string)=>`(case when jsonb_typeof(s->'${field}')='array' then not exists(select 1 from jsonb_array_elements(s->'${field}') e where not coalesce(${nonblank("e")},false)) else false end)`;
const SQL = `with owned as materialized (
  select record_id,payload->'suggestion' as s from orbit_records
  where workspace_id=$1 and collection_name='taskSuggestions' and user_id=$2 and lifecycle_state<>'deleted'
    and payload->'version'='1'::jsonb and jsonb_typeof(payload->'suggestion')='object'
    and payload->'suggestion'->'accountId'=to_jsonb($2::text)
    and payload->'suggestion'->'ownerUserId'=to_jsonb($2::text)
    and payload->'suggestion'->'id'=to_jsonb(record_id)
), visible as materialized (
  select *, (s->>'confidence')::numeric as confidence from owned
  where ${text("id")} and ${text("title")} and ${text("reason")}
    and jsonb_typeof(s->'category')='string' and s->>'category' in ('relationship','meeting','event','work','personal','other')
    and ${timestamp("createdAt")} and ${timestamp("updatedAt")}
    and ${text("deduplicationKey")} and ${stringArray("evidenceIds")}
    and ${["relatedContactId","relatedEventId","relatedMeetingId","relatedConversationId","sourceNoteId","acceptedTaskId"].map(field=>`(not (s ? '${field}') or ${text(field)})`).join(" and ")}
    and (not (s ? 'relatedContactIds') or (case when ${stringArray("relatedContactIds")} then
      (select count(*)=count(distinct e) from jsonb_array_elements(s->'relatedContactIds') e)
      and (not (s ? 'relatedContactId') or (s->'relatedContactIds') @> jsonb_build_array(s->'relatedContactId')) else false end))
    and (s ? 'sourceNoteId')=(s ? 'sourceNoteVersion')
    and (not (s ? 'sourceNoteVersion') or case when jsonb_typeof(s->'sourceNoteVersion')='number' then
      (s->>'sourceNoteVersion')::numeric>=1 and trunc((s->>'sourceNoteVersion')::numeric)=(s->>'sourceNoteVersion')::numeric else false end)
    and (not (s ? 'suggestedDueAt') or ${timestamp("suggestedDueAt")})
    and (not (s ? 'nextVisibleAt') or ${timestamp("nextVisibleAt")})
    and (not (s ? 'suggestedPlannedDate') or case when jsonb_typeof(s->'suggestedPlannedDate')='string' and (s->>'suggestedPlannedDate') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      substring(s->>'suggestedPlannedDate' from 1 for 4)::int>=100 and substring(s->>'suggestedPlannedDate' from 9 for 2)::int<=extract(day from
        (make_date(greatest(1,substring(s->>'suggestedPlannedDate' from 1 for 4)::int),substring(s->>'suggestedPlannedDate' from 6 for 2)::int,1)+interval '1 month - 1 day')) else false end)
    and case when jsonb_typeof(s->'confidence')='number' then (s->>'confidence')::numeric between 0 and 1 else false end
    and (s->'status'='"pending"'::jsonb or (s->'status'='"snoozed"'::jsonb and case when ${timestamp("nextVisibleAt")} then (s->>'nextVisibleAt')::timestamptz<=$3::timestamptz else false end))
    and (not (s ? 'expiresAt') or case when ${timestamp("expiresAt")} then (s->>'expiresAt')::timestamptz>$3::timestamptz else false end)
    and ($4='all' or s->'category'='"relationship"'::jsonb or ${text("relatedContactId")})
), page as (
  select * from visible where $5::numeric is null or confidence<$5
    or (confidence=$5 and ((s->>'createdAt') collate "C">$6 collate "C" or (s->>'createdAt'=$6 and record_id collate "C">$7 collate "C")))
  order by confidence desc,(s->>'createdAt') collate "C",record_id collate "C" limit $8
)
select case when exists(select 1 from visible where octet_length(record_id)>2048) then jsonb_build_object('ok',false)
  else jsonb_build_object('ok',true,'total',(select count(*) from visible),'items',coalesce((select jsonb_agg(
    jsonb_build_object('id',record_id,'titlePreview',left(s->>'title',240),'reasonPreview',left(s->>'reason',320),
      'category',s->>'category','updatedAt',s->>'updatedAt',
      'position',jsonb_build_object('confidence',confidence,'createdAt',s->>'createdAt','id',record_id))
    order by confidence desc,(s->>'createdAt') collate "C",record_id collate "C") from page),'[]'::jsonb)) end as result`;

const positionSchema = z.object({ confidence:z.number().min(0).max(1), createdAt:z.string().datetime({offset:true}), id:z.string().min(1).max(2048) }).strict();
export function createTaskSuggestionPageReader(input: { client:LiveRecordSqlClient; workspaceId:string; secret:string; now?:()=>string }) {
  return { async read(actorId:string, query:TaskSuggestionPageQuery = {}):Promise<TaskSuggestionPageContract> {
    const scope=query.scope??"all", limit=query.limit??20;
    if (!actorId.trim() || actorId.length>2048 || !["all","relationship"].includes(scope) || !Number.isSafeInteger(limit) || limit<1 || limit>30) throw Error("SUGGESTION_PAGE_INPUT_INVALID");
    if (Buffer.byteLength(input.secret)<32) throw Error("READ_CURSOR_SECRET_MISSING");
    const asOf=input.now?.()??new Date().toISOString();
    const identity=JSON.stringify(["suggestion-page:v1",input.workspaceId,actorId,scope]);
    const sign=(body:string)=>createHmac("sha256",input.secret).update(identity).update(body).digest();
    let position:z.infer<typeof positionSchema>|null=null;
    if (query.cursor) try {
      if(query.cursor.length>8000)throw Error();
      const [body,signature,...rest]=query.cursor.split(".");
      if(!body||!signature||rest.length)throw Error();
      const actual=Buffer.from(signature,"base64url"),expected=sign(body);
      if(actual.length!==expected.length||actual.toString("base64url")!==signature||!timingSafeEqual(actual,expected))throw Error();
      position=positionSchema.parse(JSON.parse(Buffer.from(body,"base64url").toString("utf8")));
    } catch { throw Error("SUGGESTION_PAGE_CURSOR_INVALID"); }
    const response=await input.client.query<{result:unknown}>(SQL,[input.workspaceId,actorId,asOf,scope,position?.confidence??null,position?.createdAt??null,position?.id??null,limit+1]);
    const result=z.object({ok:z.literal(true),total:z.number().int().nonnegative().safe(),items:z.array(taskSuggestionCardSchema.extend({position:positionSchema})).max(31)}).strict().parse(response.rows[0]?.result);
    const items=result.items.slice(0,limit),hasMore=result.items.length>limit,last=items.at(-1);
    const body=hasMore&&last?Buffer.from(JSON.stringify(last.position)).toString("base64url"):null;
    return taskSuggestionPageSchema.parse({actorId,scope,total:result.total,items:items.map(({position:_position,...card})=>card),hasMore,nextCursor:body?`${body}.${sign(body).toString("base64url")}`:null,asOf});
  }};
}

export function createConfiguredTaskSuggestionPageReader(expectedWorkspaceId?:string) {
  const configured=createConfiguredPostgresLiveRecordStore();
  if(!configured)return null;
  if(expectedWorkspaceId&&expectedWorkspaceId!==configured.workspaceId)throw Error("SUGGESTION_PAGE_STORAGE_UNAVAILABLE");
  const reader=createTaskSuggestionPageReader({client:configured.client,workspaceId:configured.workspaceId,secret:process.env.ORBIT_READ_CURSOR_SECRET??process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET??""});
  return {read(actorId:string,query:TaskSuggestionPageQuery){resolveSharedReadBudgetGate()?.assertAllowed({collectionName:"taskSuggestions"});return reader.read(actorId,query);}};
}
