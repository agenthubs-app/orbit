import type { InboxNotificationDTO, InboxNotificationSource } from '../../../shared/contract/inbox-notifications';
import type { TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';
import type { InboxReadWindow } from './inbox-record-repository';

// All filters precede LIMIT; source authorization still runs in the service.
// In particular, "changed" sources retain the old visible-list semantics.
const scope = `workspace_id=$1 and collection_name='inboxNotifications' and user_id=$2
  and lifecycle_state='active' and occurred_at<=$3::timestamptz`;
const active = `payload->'notification'->>'disposition'='open'
  and (payload->'notification'->>'scheduledFor' is null or (payload->'notification'->>'scheduledFor')::timestamptz<=$3::timestamptz)
  and (payload->'notification'->>'kind'='reminder' or (payload->'notification'->>'occurredAt')::timestamptz>=$3::timestamptz-interval '30 days')`;
const before = `($4::timestamptz is null or (occurred_at,record_id)<($4::timestamptz,$5::text))`;

export function createPostgresInboxReadWindow(input:{client:TransactionalSqlExecutor;workspaceId:string}):InboxReadWindow {
  return {
    async invalidIds(actorId,asOf) {
      // Preserve fail-closed integrity checks, including corrupt history outside
      // the requested page. Only offending IDs, never all history, leave SQL.
      const result=await input.client.query<{record_id:string}>(`select record_id from orbit_records
        where ${scope} and (
          coalesce(payload->'notification'->>'kind','') not in ('reminder','suggestion','update')
          or jsonb_typeof(payload->'notification'->'title') is distinct from 'string'
          or jsonb_typeof(payload->'notification'->'reason') is distinct from 'string'
          or coalesce(btrim(payload->'notification'->>'title',$4),'')=''
          or coalesce(btrim(payload->'notification'->>'reason',$4),'')=''
          or case when jsonb_typeof(payload->'notification'->'sources')='array' then
            jsonb_array_length(payload->'notification'->'sources')=0 or exists (
              select 1 from jsonb_array_elements(payload->'notification'->'sources') s
              where jsonb_typeof(s->'sourceKind') is distinct from 'string' or jsonb_typeof(s->'sourceId') is distinct from 'string'
                or coalesce(btrim(s->>'sourceKind',$4),'')='' or coalesce(btrim(s->>'sourceId',$4),'')='')
            else true end
          or payload->'notification'->>'actorId' is distinct from user_id
          or payload->'notification'->>'id' is distinct from record_id
          or (payload->'notification'->>'occurredAt')::timestamptz is distinct from occurred_at
        ) order by record_id limit 20`,[input.workspaceId,actorId,asOf,' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff']);
      return result.rows.map(r=>r.record_id);
    },
    async page(query) {
      const result=await input.client.query<{notification:InboxNotificationDTO}>(`select payload->'notification' as notification
        from orbit_records where ${scope} and ${before}
        and ($6::boolean or (${active}))
        and ($7::text is null or payload->'notification'->>'kind'=$7)
        order by occurred_at desc,record_id desc limit $8`,
      [input.workspaceId,query.actorId,query.asOf,query.before?.at??null,query.before?.id??null,query.history,query.kind??null,query.limit]);
      return result.rows.map(r=>r.notification);
    },
    async unreadPage(query) {
      const result=await input.client.query<{id:string;occurredAt:string;sources:InboxNotificationSource[]}>(`select
        record_id as id,payload->'notification'->>'occurredAt' as "occurredAt",
        (select jsonb_agg(s-'excerpt') from jsonb_array_elements(payload->'notification'->'sources') s) as sources
        from orbit_records where ${scope} and ${before} and (${active})
        and payload->'notification'->>'readAt' is null
        and (payload->'notification'->>'expiresAt' is null or (payload->'notification'->>'expiresAt')::timestamptz>$6::timestamptz)
        order by occurred_at desc,record_id desc limit $7`,
      [input.workspaceId,query.actorId,query.asOf,query.before?.at??null,query.before?.id??null,query.now,query.limit]);
      return result.rows;
    },
  };
}
