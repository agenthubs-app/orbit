import {createDiscoverySourceAdapters} from './discovery/source-adapters';
import {createDiscoveryRepository} from './discovery/discovery-repository';
import {hasExplicitAppointmentReminder} from './inbox-reminder-policy';
import { createConfiguredOrbitIntegrationService } from '../integrations/service-factory';
import type { InboxNotificationSource } from '../../shared/contract/inbox-notifications';
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { createInboxRecordService, InboxRecordError, type InboxSourceAccess } from './inbox-record-service';
import { createPostgresInboxRecordRepository, type InboxRecordTransaction } from './storage/inbox-record-repository';
import { createTaskService } from '../tasks/service';
import { createTaskRepository } from '../tasks/repository';
import { createTaskSuggestionService } from '../tasks/suggestion-service';
import { createTaskSuggestionRepository } from '../tasks/suggestion-repository';
import { createReminderPlanRepository } from './reminder-plan-repository';
import { createReminderPlanService } from './reminder-plan-service';
import type { AppointmentAggregate } from '../appointments/contract';

export function isTypedInboxEnabled(actorId:string,env:NodeJS.ProcessEnv=process.env):boolean {
  return (env.ORBIT_TYPED_INBOX_ACTORS??'').split(',').map(s=>s.trim()).includes(actorId);
}
export function createInboxRuntime(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string}) {
  const now=input.now??(()=>new Date().toISOString());
  const storeFor=(tx?:InboxRecordTransaction)=>createPostgresLiveRecordStore({client:tx?.executor??input.client});
  const collections:Partial<Record<InboxNotificationSource['sourceKind'],string>>={task:'tasks',schedule:'personal_schedule_items',note:'notes',contact:'contacts',goal:'profiles',connection:'integrations',reminder_plan:'reminderPlans',batch:'businessCardBatches'};
  const sourceAccess:InboxSourceAccess=async(actorId,source,tx)=>{
    const client=tx?.executor??input.client;
    if(source.objectId==='discovery') {
      const adapters=createDiscoverySourceAdapters({client,store:storeFor(tx),workspaceId:input.workspaceId,now,preferences:actor=>createDiscoveryRepository({...input,client:{...input.client,query:client.query}}).preferences(actor)});
      return await adapters.read(actorId,{kind:source.sourceKind,id:source.sourceId,revision:source.sourceRevision,at:source.occurredAt,key:source.sourceKind+':'+source.sourceId},false)?'available':'unavailable';
    }
    if(source.sourceKind==='connection') {
      const integrations=createConfiguredOrbitIntegrationService({actorId:source.authorId??actorId});
      const current=(await integrations?.listAuthorizations(now()))?.find(a=>a.provider===source.sourceId);
      return current?.status==='expired'&&current.expiresAt===source.sourceRevision?'available':'unavailable';
    }
    if(source.sourceKind==='appointment') {
      const found=await client.query<{payload:AppointmentAggregate}>(`select payload from appointment_aggregates where workspace_id=$1 and appointment_id=$2 and (owner_actor_id=$3 or invitee_actor_id=$3)`,[input.workspaceId,source.sourceId,actorId]);
      const a=found.rows[0]?.payload;if(!a)return 'unavailable';
      if(source.sourceRevision.startsWith('event:'))return a.history.some(h=>`event:${h.version}`===source.sourceRevision)?'available':'changed';
      if(await hasExplicitAppointmentReminder(client,input.workspaceId,actorId,a.appointmentId))return 'unavailable';
      return a.status==='cancelled'?'unavailable':String(a.version)===source.sourceRevision?'available':'changed';
    }
    if(source.sourceKind==='batch'&&source.objectId==='v2') {
      const found=await client.query<{version:string;status:string}>(`select version,status from bc_ingest_batches where workspace_id=$1 and id=$2 and actor_id=$3`,[input.workspaceId,source.sourceId,actorId]);
      const b=found.rows[0];return !b||['cancelled','expired'].includes(b.status)?'unavailable':String(b.version)===source.sourceRevision?'available':'changed';
    }
    const collection=collections[source.sourceKind];if(!collection)return 'unavailable';
    const record=await storeFor(tx).getRecord({workspaceId:input.workspaceId,collectionName:collection,recordId:source.sourceId});
    if(!record||record.userId!==actorId||record.lifecycleState!=='active')return 'unavailable';
    const p=record.payload;
    const entity=(p.note??p.task??p.entity??p.batch??p) as Record<string,unknown>;
    if(['deleted','cancelled','expired'].includes(String(entity.status)))return 'unavailable';
    if(source.sourceKind==='reminder_plan') {
      const targetType=entity.targetType,targetId=String(entity.targetId??'');
      const target=await storeFor(tx).getRecord({workspaceId:input.workspaceId,collectionName:targetType==='task'?'tasks':'personal_schedule_items',recordId:targetId});
      if(!target||target.userId!==actorId||target.lifecycleState!=='active')return 'unavailable';
      const body=(target.payload.task??target.payload) as Record<string,unknown>;
      if(['completed','cancelled','deleted'].includes(String(body.status??body.state)))return 'unavailable';
    }
    const revision=String(entity.version??entity.updatedAt??record.updatedAt);
    return revision===source.sourceRevision?'available':'changed';
  };
  const service=createInboxRecordService({repository:createPostgresInboxRecordRepository(input),now,sourceAccess,effects:{
    async accept(n,key,tx) {
      if(!tx.executor)throw new Error('A transaction is required');
      // Reuse the canonical task mutation lock and task suggestion acceptance;
      // all writes share this outer notification transaction.
      await tx.executor.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify(['task',input.workspaceId,n.actorId])]);
      const store=storeFor(tx);
      const suggestions=createTaskSuggestionService({repository:createTaskSuggestionRepository({store,workspaceId:input.workspaceId}),taskService:createTaskService({repository:createTaskRepository({store,workspaceId:input.workspaceId})}),validateSourceNote:async request=>sourceAccess(request.actorId,{sourceKind:'note',sourceId:request.noteId,sourceRevision:String(request.version),occurredAt:now(),readAt:now()},tx).then(s=>s==='available')});
      const sourceNote=n.sources.find(s=>s.sourceKind==='note');
      const candidate=await suggestions.suggest({actorId:n.actorId,title:n.title,reason:n.reason,category:'relationship',...(n.dueAt?{suggestedDueAt:n.dueAt}:{}),...(sourceNote?{sourceNoteId:sourceNote.sourceId,sourceNoteVersion:Number(sourceNote.sourceRevision)}:{}),evidenceIds:n.sources.map(s=>s.sourceId),confidence:1,deduplicationKey:n.semanticKey,...(n.expiresAt?{expiresAt:n.expiresAt}:{}),now:now()});
      return (await suggestions.accept({actorId:n.actorId,suggestionId:candidate.id,idempotencyKey:key,now:now()})).task.id;
    },
    async snooze(n,scheduledFor,key,tx) {
      const source=n.sources.find(s=>s.sourceKind==='reminder_plan');if(!source)throw new InboxRecordError('CONFLICT','This reminder has no editable plan');
      const reminders=createReminderPlanService({now,repository:createReminderPlanRepository({store:storeFor(tx),workspaceId:input.workspaceId})});
      const plan=await reminders.reschedule({actorId:n.actorId,reminderId:source.sourceId,fireAt:scheduledFor,timeZone:(await reminders.list({actorId:n.actorId,includeCancelled:true})).find(p=>p.id===source.sourceId)?.timeZone??'Asia/Tokyo',expectedUpdatedAt:source.sourceRevision,idempotencyKey:key});
      // The service persists this same notification object atomically.
      n.sources=n.sources.map(s=>s===source?{...s,sourceRevision:plan.updatedAt}:s);
    },
  }});
  return {service,sourceAccess};
}
export function createConfiguredInboxRuntime() {
  const runtime=createConfiguredTransactionalPostgresRuntime();return runtime?{...createInboxRuntime(runtime),...runtime}:null;
}
