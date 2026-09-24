import {SOURCE_TYPES} from '../../shared/domain/source-types';
import {legacyNotificationUnreadSummarySchema} from '../../shared/api-schema/legacy-notification-unread-summary';
import type {LegacyNotificationUnreadSummaryDTO} from '../../shared/contract/legacy-notification-unread-summary';
import type {TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';

/**
 * Legacy badge semantics deliberately count unavailable-source placeholders.
 * No source title, message body, contact graph or delivery receipt is needed.
 * Keep eligibility in parity tests with notificationFromRecord and the App VM.
 */
export async function readLegacyNotificationUnreadSummary(input:{client:TransactionalSqlExecutor;workspaceId:string;actorId:string;now?:()=>string}):Promise<LegacyNotificationUnreadSummaryDTO> {
  if(!input.actorId.trim()||!input.workspaceId.trim())throw new Error('A scoped actor is required');
  const result=await input.client.query<{unread_total:string;invalid_ids:boolean}>(`
    with candidates as (
      select payload->>'id' as id from orbit_records
      where workspace_id=$1 and collection_name='notifications' and user_id=$2 and lifecycle_state not in ('deleted','archived')
        and payload->>'channel' in ('in_app','email','calendar','system')
        and payload->>'status' in ('pending','sent','failed','dismissed')
        and payload->'source'->>'type'=any($3::text[])
        and not exists(select 1 from unnest(array['id','title','body','createdAt']) k
          where jsonb_typeof(payload->k) is distinct from 'string' or btrim(payload->>k,$4)='')
        and jsonb_typeof(payload->'source'->'id')='string' and btrim(payload->'source'->>'id',$4)<>''
        and case when jsonb_typeof(payload->'evidenceIds')='array' then exists (
          select 1 from jsonb_array_elements(payload->'evidenceIds') e
          where jsonb_typeof(e)='string' and btrim(e#>>'{}',$4)<>'') else false end
      union all
      select case when jsonb_typeof(payload->'entity'->'id')='string' then payload->'entity'->>'id' end as id from orbit_records
      where workspace_id=$1 and collection_name='reminderPlans' and user_id=$2 and lifecycle_state<>'deleted'
        and payload->'entity'->>'status' in ('delivered','failed')
    ), counted as (
      select id,count(*) over(partition by id) as copies from candidates
    ), resolved as (
      select c.*,i.payload->>'state' as state from counted c left join orbit_records i
        on i.workspace_id=$1 and i.collection_name='notification_interactions' and i.user_id=$2 and i.lifecycle_state='active'
        and i.record_id='notification-interaction:'||encode(sha256(convert_to($2,'UTF8')||decode('00','hex')||convert_to(c.id,'UTF8')),'hex')
        and i.payload->>'notificationId'=c.id
    )
    select count(*) filter(where state is distinct from 'ignored' and (state is distinct from 'read' or copies>1))::text as unread_total,
      coalesce(bool_or(id is null or id='' or length(id)>256 or btrim(id,$4)<>id or id~'[[:cntrl:]]'),false) as invalid_ids
    from resolved`,[input.workspaceId,input.actorId,SOURCE_TYPES,
      // ECMAScript String.trim whitespace, matching the legacy decoder.
      ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff']);
  if(result.rows[0]?.invalid_ids)throw new Error('Legacy notification identity is invalid');
  return legacyNotificationUnreadSummarySchema.parse({actorId:input.actorId,unreadTotal:Number(result.rows[0]?.unread_total),refreshedAt:(input.now??(()=>new Date().toISOString()))()});
}
