import {hasExplicitAppointmentReminder} from './inbox-reminder-policy';
import type { TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import type { InboxRecordService } from './inbox-record-service';
import type { ReminderPlanDTO } from './reminder-plan-contract';
import type { BusinessCardBatchContract } from '../../shared/contract/business-card-batch';
import type { AppointmentAggregate } from '../appointments/contract';
import { reminderPlanNotification, appointmentChangeNotification, batchResultNotification } from './inbox-business-projections';
import { createNotificationInteractionService } from './interaction-service';
import { createConfiguredOrbitIntegrationService } from '../integrations/service-factory';
import { createPersonalScheduleService } from '../personal-schedule/service';
import { isCurrentPersonalScheduleReminderPlan } from '../personal-schedule/reminder-plans';
import { AppError } from '../../shared/errors/app-error';
import { createInboxProjectionWorkRepository } from './storage/inbox-projection-work';

// Existing business facts project to records. This is not a second delivery
// executor: explicit reminder scheduling remains in the existing plan service.
export async function refreshInboxBusinessRecords(input:{actorId:string;principalId?:string;client:TransactionalPostgresClient;workspaceId:string;service:InboxRecordService;since:string;now?:string}) {
  const at=input.now??new Date().toISOString(),store=createPostgresLiveRecordStore({client:input.client});
  const inboxProjection=process.env.ORBIT_CANONICAL_INBOX_PROJECTION==='1'?createInboxProjectionWorkRepository({...input,now:()=>at}):undefined;
  await createPersonalScheduleService({store,client:input.client,workspaceId:input.workspaceId,now:()=>at,inboxProjection}).refreshReminderPlans({actorId:input.actorId});
  const interactions=createNotificationInteractionService({store,workspaceId:input.workspaceId});
  let before='';let projected=0;
  while(true) {
    const page=await input.client.query<{record_id:string;collection_name:string;payload:Record<string,unknown>}>(`select record_id,collection_name,payload from orbit_records where workspace_id=$1 and user_id=$2 and lifecycle_state='active'
      and collection_name in ('reminderPlans','businessCardBatches') and record_id>$3 order by record_id limit 50`,[input.workspaceId,input.actorId,before]);
    for(const row of page.rows) {
      if(row.collection_name==='reminderPlans') {
        const plan=row.payload.entity as ReminderPlanDTO;
        if(!plan||plan.ownerUserId!==input.actorId)continue;
        const n=reminderPlanNotification(plan,at);if(!n)continue;
        if(plan.status==='scheduled'&&plan.id.startsWith('schedule-reminder:')) {
          let current;
          try {current=await createPersonalScheduleService({store,workspaceId:input.workspaceId,now:()=>at}).get({actorId:input.actorId,id:plan.targetId});}
          catch(error) {if(error instanceof AppError&&error.code==='NOT_FOUND')continue;throw error;}
          if(!isCurrentPersonalScheduleReminderPlan(plan,input.actorId,current))continue;
        }
        const state=(await interactions.list(input.actorId,[plan.id]))[plan.id];
        await input.service.upsert({...n,...(state?{readAt:at,disposition:state==='ignored'?'dismissed' as const:'open' as const}:{})});projected++;
      } else {
        const b=row.payload.batch as BusinessCardBatchContract;
        if(!b||b.actorId!==input.actorId||b.updatedAt<input.since)continue;
        const n=batchResultNotification({actorId:input.actorId,batchId:b.id,revision:b.updatedAt,occurredAt:b.updatedAt,count:b.totalItems,status:b.status,pipeline:'v1'});
        if(n){await input.service.upsert(n);projected++;}
      }
    }
    if(page.rows.length<50)break;before=page.rows.at(-1)!.record_id;
  }
  const tables=await input.client.query<{appointments:string|null;batches:string|null}>("select to_regclass('appointment_aggregates')::text as appointments,to_regclass('bc_ingest_batches')::text as batches");
  if(tables.rows[0]?.appointments) {
    let after='';
    while(true) {
      const page=await input.client.query<{appointment_id:string;payload:AppointmentAggregate}>(`select appointment_id,payload from appointment_aggregates where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2) and updated_at >= $3::timestamptz and appointment_id>$4 order by appointment_id limit 50`,[input.workspaceId,input.actorId,input.since,after]);
      for(const row of page.rows) {
        const a=row.payload,contactId=a.contactIdsByActor[input.actorId];if(!contactId)continue;
        const contact=await store.getRecord({workspaceId:input.workspaceId,collectionName:'contacts',recordId:contactId});
        if(!contact||contact.userId!==input.actorId||contact.lifecycleState!=='active'||typeof contact.payload.displayName!=='string')continue;
        for(const history of a.history.filter(h=>h.at>=input.since)) {
          const proposal=a.proposals.find(p=>p.revision===history.proposalRevision);
          const n=appointmentChangeNotification({actorId:input.actorId,appointmentId:a.appointmentId,contactName:contact.payload.displayName,contactId,history,time:history.command==='accept'&&a.confirmed?.proposalRevision===history.proposalRevision?a.confirmed.startsAtUtc:undefined,timeZone:proposal?.timezone});
          if(n){n.sources=[...n.sources,{sourceKind:'contact',sourceId:contactId,sourceRevision:contact.updatedAt,occurredAt:history.at,readAt:at}];await input.service.upsert(n);projected++;}
        }
        // One automatic pre-meeting reminder, with explicit plan precedence.
        if(a.confirmed && !a.reminders.cancelled && !['cancelled','completed'].includes(a.status)) {
          const starts=a.confirmed.startsAtUtc,fireAt=new Date(Date.parse(starts)-30*60_000).toISOString();
          const explicit=await hasExplicitAppointmentReminder(input.client,input.workspaceId,input.actorId,a.appointmentId);
          if(fireAt<=at&&at<starts&&!explicit){
            const name=contact.payload.displayName,copy={zh:{title:`与${name}的约谈将于30分钟内开始`,reason:'已确认的约谈即将开始。'},en:{title:`Your meeting with ${name} starts within 30 minutes`,reason:'Your confirmed meeting is coming up.'},ja:{title:`${name}さんとの面談が30分以内に始まります`,reason:'確定した面談の開始時刻が近づいています。'}};
            await input.service.upsert({actorId:input.actorId,semanticKey:`meeting-reminder:${a.appointmentId}:${a.confirmed.proposalRevision}`,kind:'reminder',origin:'automation',...copy.zh,copy,object:{id:contactId,name},occurredAt:fireAt,dueAt:starts,scheduledFor:fireAt,expiresAt:starts,sources:[{sourceKind:'appointment',sourceId:a.appointmentId,sourceRevision:String(a.version),occurredAt:a.updatedAt,readAt:at}],target:{kind:'appointment',id:a.appointmentId,href:`/contacts/${encodeURIComponent(contactId)}?appointmentId=${encodeURIComponent(a.appointmentId)}`,status:'available'},actions:['read','dismiss','handle']});projected++;
          }
        }
      }
      if(page.rows.length<50)break;after=page.rows.at(-1)!.appointment_id;
    }
  }
  if(tables.rows[0]?.batches) {
    let after='';
    while(true) {
      const page=await input.client.query<{id:string;version:string;status:string;expected_items:number;updated_at:Date}>(`select id,version,status,expected_items,updated_at from bc_ingest_batches where workspace_id=$1 and actor_id=$2 and updated_at >= $3::timestamptz and id>$4 order by id limit 50`,[input.workspaceId,input.actorId,input.since,after]);
      for(const b of page.rows){const n=batchResultNotification({actorId:input.actorId,batchId:b.id,revision:String(b.version),occurredAt:b.updated_at.toISOString(),count:b.expected_items,status:b.status,pipeline:'v2'});if(n){await input.service.upsert(n);projected++;}}
      if(page.rows.length<50)break;after=page.rows.at(-1)!.id;
    }
  }
  const integrations=createConfiguredOrbitIntegrationService({actorId:input.principalId??input.actorId});
  if(integrations)for(const a of await integrations.listAuthorizations(at)) {
    // A never-connected or unconfigured provider is not a notification.
    if(a.status!=='expired'||!a.expiresAt)continue;
    const names={google_calendar:'Google Calendar',gmail:'Gmail',microsoft_graph:'Microsoft'},name=names[a.provider];
    const copy={zh:{title:`${name}需要重新连接`,reason:'授权已到期，请重新连接以恢复同步。'},en:{title:`Reconnect ${name}`,reason:'Authorization expired. Reconnect to resume syncing.'},ja:{title:`${name}の再接続が必要です`,reason:'認証の有効期限が切れました。同期を再開するには再接続してください。'}};
    await input.service.upsert({actorId:input.actorId,semanticKey:`connection:${a.provider}:${a.expiresAt}`,kind:'update',origin:'business',...copy.zh,copy,occurredAt:a.expiresAt,sources:[{sourceKind:'connection',sourceId:a.provider,sourceRevision:a.expiresAt,authorId:input.principalId??input.actorId,occurredAt:a.expiresAt,readAt:at}],target:{kind:'source',id:a.provider,href:'/settings',status:'available'},actions:['read','dismiss','handle']});projected++;
  }
  return {projected,appointmentStorage:!!tables.rows[0]?.appointments,batchV2Storage:!!tables.rows[0]?.batches};
}
