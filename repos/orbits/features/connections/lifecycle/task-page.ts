import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {RelationshipTaskPageDTO} from '../../../shared/contract/relationship-lifecycle';
import {relationshipTaskPageSchema,relationshipTaskPageItemSchema} from '../../../shared/api-schema/relationship-lifecycle';
import type {LiveRecordSqlClient} from '../../../shared/storage/postgres-live-record-store';
import {createConfiguredPostgresLiveRecordStore} from '../../../shared/storage/configured-live-record-store';
import {LIFECYCLE_TASK_CLASSIFIED_CTES,LIFECYCLE_SORT_RUNTIME_CTE,lifecycleSortRuntimeSchema,assertLifecycleNodeSortRuntime} from '../../followups/storage/lifecycle-task-pages';
import {resolveSharedReadBudgetGate} from '../../sync/read-budget-gate';

const position=z.object({due:z.string().min(1).max(2048),id:z.string().min(1).max(2048),record:z.string().min(1).max(2048)}).strict();
export interface RelationshipTaskPageQuery {mode:'open'|'completed';limit?:number;cursor?:string|null}
const SQL=`${LIFECYCLE_TASK_CLASSIFIED_CTES}, eligible as materialized (
  select *,coalesce(task->>'dueAt','9999') as list_due from classified
  where issue is null and connection is not null
    and case when $3='open' then task->>'status' in ('open','scheduled') else task->>'status' in ('completed','dismissed') end
), page as (
  select * from eligible where $4::text is null or
    (list_due collate pg_catalog."und-x-icu",id collate pg_catalog."und-x-icu",record_id collate "C")>
    ($4 collate pg_catalog."und-x-icu",$5 collate pg_catalog."und-x-icu",$6 collate "C")
  order by list_due collate pg_catalog."und-x-icu",id collate pg_catalog."und-x-icu",record_id collate "C" limit $7
), ${LIFECYCLE_SORT_RUNTIME_CTE}
select jsonb_build_object('ok',integrity.ok,'runtime',(select to_jsonb(runtime) from runtime),
  'total',(select count(*) from eligible),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'itemKey',record_id,'taskId',id,'connectionId',task->>'connectionId','contactId',contact->>'id',
    'titlePreview',left(task->>'title',240),'contactNamePreview',contact->>'displayName',
    'status',task->>'status','dueAt',task->>'dueAt','position',jsonb_build_object('due',list_due,'id',id,'record',record_id)
  ) order by list_due collate pg_catalog."und-x-icu",id collate pg_catalog."und-x-icu",record_id collate "C") from page),'[]'::jsonb)) as result from integrity`;

export function createRelationshipTaskPageReader(input:{client:LiveRecordSqlClient;workspaceId:string;secret:string;now?:()=>string}) {
  return {async read(actorId:string,query:RelationshipTaskPageQuery):Promise<RelationshipTaskPageDTO> {
    const limit=query.limit??30;
    if(!actorId.trim()||!['open','completed'].includes(query.mode)||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('RELATIONSHIP_TASK_PAGE_INPUT_INVALID');
    if(Buffer.byteLength(input.secret)<32)throw Error('READ_CURSOR_SECRET_MISSING');
    const scope=JSON.stringify(['relationship-task-page:v1',input.workspaceId,actorId,query.mode]);
    const sign=(payload:string)=>createHmac('sha256',input.secret).update(scope).update(payload).digest();
    let before:z.infer<typeof position>|null=null;
    if(query.cursor)try {
      if(query.cursor.length>18000)throw Error();
      const [payload,signature,...extra]=query.cursor.split('.');if(!payload||!signature||extra.length)throw Error();
      const provided=Buffer.from(signature,'base64url'),expected=sign(payload);
      if(provided.toString('base64url')!==signature||provided.length!==expected.length||!timingSafeEqual(provided,expected))throw Error();
      before=position.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));
    }catch{throw Error('RELATIONSHIP_TASK_CURSOR_INVALID');}
    const response=await input.client.query<{result:unknown}>(SQL,[input.workspaceId,actorId,query.mode,before?.due??null,before?.id??null,before?.record??null,limit+1]);
    const row=z.object({ok:z.literal(true),runtime:lifecycleSortRuntimeSchema,total:z.number().int().nonnegative().safe(),items:z.array(relationshipTaskPageItemSchema.extend({position})).max(51)}).strict().parse(response.rows[0]?.result);
    assertLifecycleNodeSortRuntime();
    const selected=row.items.slice(0,limit),hasMore=row.items.length>limit,last=selected.at(-1);
    const encoded=hasMore&&last?Buffer.from(JSON.stringify(last.position)).toString('base64url'):null;
    return relationshipTaskPageSchema.parse({actorId,mode:query.mode,items:selected.map(({position:_position,...item})=>item),total:row.total,hasMore,
      nextCursor:encoded?`${encoded}.${sign(encoded).toString('base64url')}`:null,asOf:input.now?.()??new Date().toISOString()});
  }};
}

export function createConfiguredRelationshipTaskPageReader(expectedWorkspaceId?:string) {
  const configured=createConfiguredPostgresLiveRecordStore();if(!configured)return null;
  if(expectedWorkspaceId&&expectedWorkspaceId!==configured.workspaceId)throw Error('RELATIONSHIP_TASK_STORAGE_UNAVAILABLE');
  const reader=createRelationshipTaskPageReader({client:configured.client,workspaceId:configured.workspaceId,
    secret:process.env.ORBIT_READ_CURSOR_SECRET??process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET??''});
  return {read(actorId:string,query:RelationshipTaskPageQuery){resolveSharedReadBudgetGate()?.assertAllowed({collectionName:'tasks'});return reader.read(actorId,query);}};
}
