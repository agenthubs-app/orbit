import type {TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {readCanonicalReminderProjectionSource} from './canonical-reminder-wake';
import {createInboxProjectionWorkRepository} from './storage/inbox-projection-work';
import {createPostgresInboxRecordTransaction} from './storage/inbox-record-repository';
import {createInboxRecordUpserter,InboxRecordError} from './inbox-record-service';
import {createNotificationInteractionService} from './interaction-service';
import {reminderPlanNotification} from './inbox-business-projections';

/** One bounded database-only pass. Delivery is already authoritative; invalid
 * UI content becomes a visible failed work item, never a failed reminder send. */
export async function runInboxProjectionPass(input:{client:TransactionalPostgresClient;workspaceId:string;enabled:boolean;now?:()=>string;limit?:number;deadline?:number;clock?:()=>Date}) {
  const result={projectionClaimed:0,projectionCompleted:0,projectionSkipped:0,projectionFailed:0,projectionDeferred:0};
  if(!input.enabled)return result;
  const clock=input.clock??(()=>new Date()),now=input.now??(()=>clock().toISOString());
  if(input.deadline!==undefined&&clock().getTime()>=input.deadline)return {...result,projectionDeferred:1};
  const queue=createInboxProjectionWorkRepository({...input,now});
  const leases=await queue.claim({limit:input.limit});result.projectionClaimed=leases.length;
  for(const lease of leases){
    if(input.deadline!==undefined&&clock().getTime()>=input.deadline){result.projectionDeferred++;continue;}
    try{
      let projected=false;
      const completed=await queue.complete(lease,async executor=>{
        await executor.query("set local statement_timeout = '5s'");
        await executor.query("set local lock_timeout = '1s'");
        const plan=await readCanonicalReminderProjectionSource(executor,input.workspaceId,lease);
        if(!plan)return;
        const raw=reminderPlanNotification(plan,now());
        if(!raw)throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
        const store=createPostgresLiveRecordStore({client:executor});
        const state=(await createNotificationInteractionService({store,workspaceId:input.workspaceId}).list(lease.actorId,[plan.id]))[plan.id];
        const upsert=createInboxRecordUpserter({now,transaction:async(actorId,operation)=>{
          if(actorId!==lease.actorId)throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
          return operation(await createPostgresInboxRecordTransaction({executor,workspaceId:input.workspaceId,actorId}));
        }});
        await upsert({...raw,...(state?{readAt:now(),disposition:state==='ignored'?'dismissed' as const:'open' as const}:{})});
        projected=true;
      });
      if(completed&&projected)result.projectionCompleted++;else result.projectionSkipped++;
    }catch(error){
      const permanent=(error instanceof InboxRecordError&&error.code==='VALIDATION_ERROR')||(error instanceof Error&&error.message==='CANONICAL_PROJECTION_SOURCE_INVALID');
      await queue.fail(lease,permanent?'SOURCE_INVALID':'PROJECTION_FAILED',{permanent});
      result.projectionFailed++;
    }
  }
  return result;
}
