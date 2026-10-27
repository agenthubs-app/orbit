import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {RelationshipTaskPageDTO} from '../../../shared/contract/relationship-lifecycle';
import {relationshipTaskPageSchema,relationshipTaskPageItemSchema} from '../../../shared/api-schema/relationship-lifecycle';
import type {LiveRecordSqlClient} from '../../../shared/storage/postgres-live-record-store';
import {createConfiguredPostgresLiveRecordStore} from '../../../shared/storage/configured-live-record-store';
import {LIFECYCLE_TASK_CLASSIFIED_CTES,LIFECYCLE_SORT_RUNTIME_CTE,lifecycleSortRuntimeEntryFor} from '../../followups/storage/lifecycle-task-pages';
import {currentNodeSortRuntime,type NodeSortRuntimeInput} from '../../../shared/storage/sort-runtime';
import {resolveSharedReadBudgetGate} from '../../sync/read-budget-gate';

const position=z.object({due:z.string().min(1).max(2048),id:z.string().min(1).max(2048),record:z.string().min(1).max(2048)}).strict();
export interface RelationshipTaskPageQuery {mode:'open'|'completed';limit?:number;cursor?:string|null}
// The page is ordered and cut entirely in SQL. With a verified und-x-icu runtime it uses the reviewed ICU order;
// on any other runtime it falls back to byte order ("C"), which is identical on every PostgreSQL version — the keys
// are ISO due times and ASCII task ids, so the order users see is the same and paging stays exact.
const pageSql=(collation:string)=>`${LIFECYCLE_TASK_CLASSIFIED_CTES}, eligible as materialized (
  select *,coalesce(task->>'dueAt','9999') as list_due from classified
  where issue is null and connection is not null
    and case when $3='open' then task->>'status' in ('open','scheduled') else task->>'status' in ('completed','dismissed') end
), page as (
  select * from eligible where $4::text is null or
    (list_due collate ${collation},id collate ${collation},record_id collate "C")>
    ($4 collate ${collation},$5 collate ${collation},$6 collate "C")
  order by list_due collate ${collation},id collate ${collation},record_id collate "C" limit $7
), ${LIFECYCLE_SORT_RUNTIME_CTE}
select jsonb_build_object('ok',integrity.ok,'runtime',(select to_jsonb(runtime) from runtime),
  'total',(select count(*) from eligible),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'itemKey',record_id,'taskId',id,'connectionId',task->>'connectionId','contactId',contact->>'id',
    'titlePreview',left(task->>'title',240),'contactNamePreview',contact->>'displayName',
    'status',task->>'status','dueAt',task->>'dueAt','position',jsonb_build_object('due',list_due,'id',id,'record',record_id)
  ) order by list_due collate ${collation},id collate ${collation},record_id collate "C") from page),'[]'::jsonb)) as result from integrity`;
const ICU_SQL=pageSql('pg_catalog."und-x-icu"'),BYTE_SQL=pageSql('"C"');

type PageOrder='icu'|'byte';
// What each database turned out to support, so a fallback runtime pays the ICU attempt once, not on every read.
const learnedOrder=new WeakMap<LiveRecordSqlClient,PageOrder>();
const itemsSchema=z.object({ok:z.literal(true),runtime:z.unknown(),total:z.number().int().nonnegative().safe(),items:z.array(relationshipTaskPageItemSchema.extend({position})).max(51)}).strict();

export function createRelationshipTaskPageReader(input:{client:LiveRecordSqlClient;workspaceId:string;secret:string;now?:()=>string;nodeRuntime?:()=>NodeSortRuntimeInput}) {
  return {async read(actorId:string,query:RelationshipTaskPageQuery):Promise<RelationshipTaskPageDTO> {
    const limit=query.limit??30;
    if(!actorId.trim()||!['open','completed'].includes(query.mode)||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('RELATIONSHIP_TASK_PAGE_INPUT_INVALID');
    if(Buffer.byteLength(input.secret)<32)throw Error('READ_CURSOR_SECRET_MISSING');
    // A cursor carries the order it was cut in (its signing scope), so ICU and byte positions never mix.
    const scope=(order:PageOrder)=>JSON.stringify([order==='icu'?'relationship-task-page:v1':'relationship-task-page:v1:byte',input.workspaceId,actorId,query.mode]);
    const sign=(order:PageOrder,payload:string)=>createHmac('sha256',input.secret).update(scope(order)).update(payload).digest();
    let before:{order:PageOrder;at:z.infer<typeof position>}|null=null;
    if(query.cursor)try {
      if(query.cursor.length>18000)throw Error();
      const [payload,signature,...extra]=query.cursor.split('.');if(!payload||!signature||extra.length)throw Error();
      const provided=Buffer.from(signature,'base64url');if(provided.toString('base64url')!==signature)throw Error();
      const order=(['icu','byte'] as const).find(candidate=>{const expected=sign(candidate,payload);return provided.length===expected.length&&timingSafeEqual(provided,expected);});
      if(!order)throw Error();
      before={order,at:position.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')))};
    }catch{throw Error('RELATIONSHIP_TASK_CURSOR_INVALID');}
    const run=async(order:PageOrder)=>itemsSchema.parse((await input.client.query<{result:unknown}>(order==='icu'?ICU_SQL:BYTE_SQL,
      [input.workspaceId,actorId,query.mode,before?.at.due??null,before?.at.id??null,before?.at.record??null,limit+1])).rows[0]?.result);
    // The order is learned from the database runtime (never from a cursor): ICU when the pair is verified, else bytes.
    const learned=learnedOrder.get(input.client);
    let order:PageOrder=learned??'icu';
    let row=await run(order);
    if(!learned){
      const verified=Boolean(lifecycleSortRuntimeEntryFor((input.nodeRuntime??currentNodeSortRuntime)(),row.runtime));
      if(!verified)console.warn(JSON.stringify({event:'relationship_task_page_byte_order',reason:'sort_runtime_unverified',runtime:row.runtime}));
      learnedOrder.set(input.client,verified?'icu':'byte');
      if(!verified){order='byte';row=await run(order);}
    }
    if(before&&before.order!==order)throw Error('RELATIONSHIP_TASK_CURSOR_INVALID');
    const selected=row.items.slice(0,limit),hasMore=row.items.length>limit,last=selected.at(-1);
    const encoded=hasMore&&last?Buffer.from(JSON.stringify(last.position)).toString('base64url'):null;
    return relationshipTaskPageSchema.parse({actorId,mode:query.mode,items:selected.map(({position:_position,...item})=>item),total:row.total,hasMore,
      nextCursor:encoded?`${encoded}.${sign(order,encoded).toString('base64url')}`:null,asOf:input.now?.()??new Date().toISOString()});
  }};
}

export function createConfiguredRelationshipTaskPageReader(expectedWorkspaceId?:string) {
  const configured=createConfiguredPostgresLiveRecordStore();if(!configured)return null;
  if(expectedWorkspaceId&&expectedWorkspaceId!==configured.workspaceId)throw Error('RELATIONSHIP_TASK_STORAGE_UNAVAILABLE');
  const reader=createRelationshipTaskPageReader({client:configured.client,workspaceId:configured.workspaceId,
    secret:process.env.ORBIT_READ_CURSOR_SECRET??process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET??''});
  return {read(actorId:string,query:RelationshipTaskPageQuery){resolveSharedReadBudgetGate()?.assertAllowed({collectionName:'tasks'});return reader.read(actorId,query);}};
}
