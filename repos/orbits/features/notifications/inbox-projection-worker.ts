import type {TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {readCanonicalReminderProjectionSource} from './canonical-reminder-wake';
import {createInboxProjectionWorkRepository} from './storage/inbox-projection-work';
import {createPostgresInboxRecordTransaction} from './storage/inbox-record-repository';
import {createInboxRecordUpserter,InboxRecordError} from './inbox-record-service';
import {createNotificationInteractionService} from './interaction-service';
import {reminderPlanNotification} from './inbox-business-projections';
import {createPersonalScheduleService} from '../personal-schedule/service';
import {isCurrentPersonalScheduleReminderPlan} from '../personal-schedule/reminder-plans';
import {AppError} from '../../shared/errors/app-error';

/** One bounded database-only pass over changed/due plans. A pure-in-app delivered
 * plan additionally needs its delivery fence. Invalid UI content becomes a failed
 * work item, never a failed reminder send. */
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
        const store=createPostgresLiveRecordStore({client:executor});
        // Same rule as the legacy refresh: elapsed scheduled plans remain as
        // history, but must not create a new notice after their series changed.
        if(plan.status==='scheduled'&&plan.id.startsWith('schedule-reminder:')) {
          let current;
          try {current=await createPersonalScheduleService({store,workspaceId:input.workspaceId,now}).get({actorId:lease.actorId,id:plan.targetId});}
          catch(error){if(error instanceof AppError&&error.code==='NOT_FOUND')return;throw error;}
          if(!isCurrentPersonalScheduleReminderPlan(plan,lease.actorId,current))return;
        }
        const raw=reminderPlanNotification(plan,now());
        if(!raw)throw Error('CANONICAL_PROJECTION_SOURCE_INVALID');
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
