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
import { createCanonicalReminderCommandService } from './canonical-reminder-command-transaction';
import type { AppointmentAggregate } from '../appointments/contract';
import { createPersonalScheduleService } from '../personal-schedule/service';
import { AppError } from '../../shared/errors/app-error';
import { isCurrentPersonalScheduleReminderPlan } from '../personal-schedule/reminder-plans';
import type { ReminderPlanDTO } from './reminder-plan-contract';
import {readSimpleInboxSourceStates} from './storage/inbox-source-state-batch';
import {createInboxProjectionWorkRepository,type InboxProjectionWriter} from './storage/inbox-projection-work';

/**
 * Typed notifications (reminder / suggestion / update) are the inbox. The rollout
 * allowlist this used to read (`ORBIT_TYPED_INBOX_ACTORS`) was never configured
 * outside one QA account, so every other account silently fell back to the legacy
 * feed and to a 404 on the notification settings — Sprint 0086.
 *
 * `ORBIT_TYPED_INBOX_DISABLED_ACTORS` remains as an emergency opt-out for a single
 * account; it is empty in every environment and exists only so a bad record can be
 * contained without a deploy.
 */
export function isTypedInboxEnabled(actorId:string,env:NodeJS.ProcessEnv=process.env):boolean {
  const disabled=(env.ORBIT_TYPED_INBOX_DISABLED_ACTORS??'').split(',').map(s=>s.trim()).filter(Boolean);
  return actorId.trim().length>0 && !disabled.includes(actorId);
}
export function createInboxRuntime(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string;forDispatch?:boolean;inboxProjection?:InboxProjectionWriter}) {
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
      if(source.sourceId.startsWith('schedule-reminder:')&&(input.forDispatch||entity.status==='scheduled')) {
        if(entity.id!==source.sourceId)return 'unavailable';
        let current;
        try {current=await createPersonalScheduleService({store:storeFor(tx),workspaceId:input.workspaceId,now}).get({actorId,id:targetId});}
        catch(error) {if(error instanceof AppError&&error.code==='NOT_FOUND')return 'unavailable';throw error;}
        if(!isCurrentPersonalScheduleReminderPlan(entity as unknown as ReminderPlanDTO,actorId,current))return 'unavailable';
        return String(entity.updatedAt??record.updatedAt)===source.sourceRevision?'available':'changed';
      }
      if(targetType==='schedule_item'&&/^.*:occurrence:\d{4}-\d{2}-\d{2}$/.test(targetId)) {
        try {
          const occurrence=await createPersonalScheduleService({store:storeFor(tx),workspaceId:input.workspaceId,now}).get({actorId,id:targetId});
          if(occurrence.state==='cancelled')return 'unavailable';
        } catch(error) {if(error instanceof AppError&&error.code==='NOT_FOUND')return 'unavailable';throw error;}
        return String(entity.updatedAt??record.updatedAt)===source.sourceRevision?'available':'changed';
      }
      const target=await storeFor(tx).getRecord({workspaceId:input.workspaceId,collectionName:targetType==='task'?'tasks':'personal_schedule_items',recordId:targetId});
      if(!target||target.userId!==actorId||target.lifecycleState!=='active')return 'unavailable';
      const body=(target.payload.task??target.payload) as Record<string,unknown>;
      if(['completed','cancelled','deleted'].includes(String(body.status??body.state)))return 'unavailable';
    }
    const revision=String(entity.version??entity.updatedAt??record.updatedAt);
    return revision===source.sourceRevision?'available':'changed';
  };
  const sourceAccessBatch=async(actorId:string,sources:readonly InboxNotificationSource[])=>{
    const states=await readSimpleInboxSourceStates({client:input.client,workspaceId:input.workspaceId,actorId,sources});
    // Complex kinds retain their domain-specific authorization/expiry checks.
    // Sequential fallback avoids starting hundreds of domain queries at once.
    for(let i=0;i<states.length;i++)if(states[i]===null)states[i]=await sourceAccess(actorId,sources[i]!);
    return states as ('available'|'changed'|'unavailable')[];
  };
  const service=createInboxRecordService({repository:createPostgresInboxRecordRepository(input),now,sourceAccess,sourceAccessBatch,effects:{
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
      const repository=createReminderPlanRepository({store:storeFor(tx),workspaceId:input.workspaceId});
      const current=await repository.getPlan(n.actorId,source.sourceId);
      if(!current||current.id!==source.sourceId||current.accountId!==n.actorId||current.ownerUserId!==n.actorId)throw new InboxRecordError('SOURCE_UNAVAILABLE','Reminder plan unavailable');
      if(!tx.executor)throw new Error('A transaction is required');
      const reminders=createCanonicalReminderCommandService({runtime:{client:input.client,workspaceId:input.workspaceId,now,executor:tx.executor,inboxProjection:input.inboxProjection}});
      const plan=await reminders.reschedule({actorId:n.actorId,reminderId:source.sourceId,fireAt:scheduledFor,timeZone:current.timeZone,expectedUpdatedAt:source.sourceRevision,idempotencyKey:key});
      // The service persists this same notification object atomically.
      n.sources=n.sources.map(s=>s===source?{...s,sourceRevision:plan.updatedAt}:s);
    },
  }});
  return {service,sourceAccess,sourceAccessBatch};
}
export function createConfiguredInboxRuntime() {
  const runtime=createConfiguredTransactionalPostgresRuntime();if(!runtime)return null;
  const inboxProjection=process.env.ORBIT_CANONICAL_INBOX_PROJECTION==='1'?createInboxProjectionWorkRepository(runtime):undefined;
  return {...createInboxRuntime({...runtime,inboxProjection}),...runtime};
}
