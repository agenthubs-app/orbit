import {randomUUID} from 'node:crypto';
import type {TransactionalPostgresClient,TransactionalSqlExecutor} from '../../../shared/storage/transactional-postgres';

// Additive schema, deliberately not installed from a request or worker. The
// deployment/backfill gate must be completed before enabling its producer.
export const INBOX_PROJECTION_WORK_SCHEMA_SQL=`
create table if not exists orbit_inbox_projection_work (
  workspace_id text not null, actor_id text not null, source_kind text not null,
  source_id text not null, source_revision text not null,
  generation bigint not null default 1 check(generation>0),
  state text not null check(state in ('pending','leased','done','failed')),
  available_at timestamptz not null, attempts integer not null default 0 check(attempts>=0),
  lease_token text, lease_until timestamptz, error_code text,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key(workspace_id,actor_id,source_kind,source_id),
  check(source_kind in ('canonical_reminder')),
  check((state='leased' and lease_token is not null and lease_until is not null)
    or (state<>'leased' and lease_token is null and lease_until is null))
);
create index if not exists orbit_inbox_projection_pending_idx
  on orbit_inbox_projection_work(workspace_id,available_at,actor_id,source_kind,source_id) where state='pending';
create index if not exists orbit_inbox_projection_leased_idx
  on orbit_inbox_projection_work(workspace_id,lease_until,actor_id,source_kind,source_id) where state='leased';
`;

export interface InboxProjectionSource {actorId:string;sourceKind:'canonical_reminder';sourceId:string;sourceRevision:string}
export interface InboxProjectionLease extends InboxProjectionSource {generation:string;leaseToken:string;attempts:number}
const MAX_ATTEMPTS=8;
function required(value:string){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>2048||value.includes('\0'))throw Error('INBOX_PROJECTION_INPUT_INVALID');return value;}
function timestamp(value:string){if(!Number.isFinite(Date.parse(value)))throw Error('INBOX_PROJECTION_INPUT_INVALID');return new Date(value).toISOString();}

/** Latest-state projection only; appointment/message event histories must not
 * use this coalescing key. It is a durable pending set, never a sequence cursor. */
export function createInboxProjectionWorkRepository(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string}) {
  const workspaceId=required(input.workspaceId),now=()=>timestamp(input.now?.()??new Date().toISOString());
  const scope=(source:InboxProjectionSource)=>[workspaceId,required(source.actorId),source.sourceKind,required(source.sourceId)];
  const fence=(lease:InboxProjectionLease)=>[...scope(lease),required(lease.sourceRevision),required(lease.generation),required(lease.leaseToken)];
  async function claimTransaction<T>(operation:(tx:TransactionalSqlExecutor)=>Promise<T>):Promise<T>{
    for(let attempt=0;;attempt++)try{return await input.client.transaction(operation);}
    catch(error){if(attempt>=2||!['40001','40P01'].includes(String((error as {code?:string})?.code)))throw error;}
  }
  return {
    /** Must share the authority's transaction and source-row lock. Stale
     * backfill must lock/re-read the source before enqueue, never replay a scan. */
    async enqueue(executor:TransactionalSqlExecutor,source:InboxProjectionSource):Promise<void>{
      if(source.sourceKind!=='canonical_reminder')throw Error('INBOX_PROJECTION_INPUT_INVALID');
      await executor.query(`insert into orbit_inbox_projection_work
        (workspace_id,actor_id,source_kind,source_id,source_revision,generation,state,available_at,created_at,updated_at)
        values($1,$2,$3,$4,$5,1,'pending',$6,$6,$6)
        on conflict(workspace_id,actor_id,source_kind,source_id) do update set
          source_revision=excluded.source_revision,generation=orbit_inbox_projection_work.generation+1,
          state='pending',available_at=excluded.available_at,attempts=0,lease_token=null,lease_until=null,error_code=null,updated_at=excluded.updated_at
        where orbit_inbox_projection_work.source_revision<>excluded.source_revision`,[...scope(source),required(source.sourceRevision),now()]);
    },
    async claim(options:{limit?:number;leaseMs?:number}={}):Promise<InboxProjectionLease[]>{
      const limit=options.limit??25,leaseMs=options.leaseMs??60000;
      if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw Error('INBOX_PROJECTION_INPUT_INVALID');
      const at=now(),until=new Date(Date.parse(at)+leaseMs).toISOString(),token=randomUUID();
      return claimTransaction(async tx=>{
        const result=await tx.query<{actor_id:string;source_kind:'canonical_reminder';source_id:string;source_revision:string;generation:string;lease_token:string|null;attempts:number;state:string}>(`
          with candidates as (
            select workspace_id,actor_id,source_kind,source_id from orbit_inbox_projection_work
            where workspace_id=$1 and ((state='pending' and available_at<=$2::timestamptz) or (state='leased' and lease_until<=$2::timestamptz))
            order by available_at,actor_id,source_kind,source_id limit $3 for update skip locked
          ) update orbit_inbox_projection_work w set
            state=case when w.attempts>=$6 then 'failed' else 'leased' end,
            lease_token=case when w.attempts>=$6 then null else $4 end,
            lease_until=case when w.attempts>=$6 then null else $5::timestamptz end,
            error_code=case when w.attempts>=$6 then 'ATTEMPTS_EXHAUSTED' else null end,
            attempts=case when w.attempts>=$6 then w.attempts else w.attempts+1 end,updated_at=$2
          from candidates c where (w.workspace_id,w.actor_id,w.source_kind,w.source_id)=(c.workspace_id,c.actor_id,c.source_kind,c.source_id)
          returning w.actor_id,w.source_kind,w.source_id,w.source_revision,w.generation::text,w.lease_token,w.attempts,w.state
        `,[workspaceId,at,limit,token,until,MAX_ATTEMPTS]);
        return result.rows.filter(row=>row.state==='leased').map(row=>({actorId:row.actor_id,sourceKind:row.source_kind,sourceId:row.source_id,sourceRevision:row.source_revision,generation:row.generation,leaseToken:row.lease_token!,attempts:row.attempts}));
      });
    },
    /** Database-only operation: source reads must not acquire authority row
     * locks after this work-row lock. Revalidate current source in the snapshot;
     * a concurrent producer queues a new generation when it commits. No sends. */
    async complete(lease:InboxProjectionLease,operation:(executor:TransactionalSqlExecutor)=>Promise<void>):Promise<boolean>{
      return input.client.transaction(async tx=>{
        const values=fence(lease);
        const current=await tx.query(`select generation from orbit_inbox_projection_work where
          workspace_id=$1 and actor_id=$2 and source_kind=$3 and source_id=$4 and source_revision=$5
          and generation::text=$6 and lease_token=$7 and state='leased' and lease_until>$8::timestamptz for update`,[...values,now()]);
        if(!current.rows.length)return false;
        await operation(tx);
        const done=await tx.query(`update orbit_inbox_projection_work set state='done',lease_token=null,lease_until=null,error_code=null,updated_at=$8
          where workspace_id=$1 and actor_id=$2 and source_kind=$3 and source_id=$4 and source_revision=$5
          and generation::text=$6 and lease_token=$7 and state='leased' and lease_until>$8::timestamptz returning generation`,[...values,now()]);
        if(!done.rows.length)throw Error('PROJECTION_LEASE_LOST');
        return true;
      });
    },
    async fail(lease:InboxProjectionLease,errorCode:string,options:{permanent?:boolean}={}):Promise<boolean>{
      if(!/^[A-Z0-9_]{1,80}$/.test(errorCode))throw Error('INBOX_PROJECTION_INPUT_INVALID');
      const at=now(),retryAt=new Date(Date.parse(at)+Math.min(900000,1000*2**Math.min(lease.attempts,10))).toISOString();
      const result=await input.client.query(`update orbit_inbox_projection_work set
        state=case when attempts>=$11 or $12 then 'failed' else 'pending' end,
        available_at=$9,updated_at=$8,lease_token=null,lease_until=null,error_code=$10
        where workspace_id=$1 and actor_id=$2 and source_kind=$3 and source_id=$4 and source_revision=$5
          and generation::text=$6 and lease_token=$7 and state='leased' and lease_until>$8::timestamptz returning generation`,[...fence(lease),at,retryAt,errorCode,MAX_ATTEMPTS,options.permanent??false]);
      return result.rows.length===1;
    },
  };
}
