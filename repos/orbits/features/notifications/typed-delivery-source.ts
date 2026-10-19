import type {TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import type {NotificationDelivery} from './delivery-service';
import type {TypedDeliveryContent} from './typed-delivery-worker';
import {createInboxRuntime} from './inbox-record-service-factory';
import {InboxRecordError} from './inbox-record-service';
import {createDiscoveryRepository} from './discovery/discovery-repository';
import type {DeliveryPolicyRepository} from './delivery-policy-repository';
import {readHistoricalNotificationSuppression} from './delivery-policy-repository';
import {createRelationshipMessageReader} from '../relationship-communication/message-store';
import type {AppointmentAggregate} from '../appointments/contract';
import type {InboxNotificationDTO} from '../../shared/contract/inbox-notifications';
import type {InboxDeliveryPreferencesDTO} from '../../shared/contract/notification-delivery-policy';
export function secretaryPushAllowed(sources:InboxNotificationDTO['sources'],p:InboxDeliveryPreferencesDTO):boolean {
 return sources.every(source=>source.sourceKind==='mail_summary'?false:
  source.sourceKind==='event_deadline'||source.sourceKind==='event_prep'?p.secretaryDeadline!==false:
  source.sourceKind==='event_pick'?p.secretaryPick!==false:true);
}
export function verifiedMeetingReminder(n:InboxNotificationDTO,a:AppointmentAggregate,actorId:string,now:string):boolean {
 const confirmed=a.confirmed,start=Date.parse(confirmed?.startsAtUtc??''),fire=Date.parse(n.scheduledFor??''),current=Date.parse(now);
 return n.actorId===actorId&&n.kind==='reminder'&&n.origin==='automation'&&n.target.kind==='appointment'&&n.target.status==='available'
  &&a.appointmentId===n.target.id&&n.semanticKey===`meeting-reminder:${a.appointmentId}:${confirmed?.proposalRevision}`
  &&(a.ownerActorId===actorId||a.inviteeActorId===actorId)&&a.contactIdsByActor[actorId]===n.object?.id
  &&['confirmed','reschedule_pending'].includes(a.status)&&!a.reminders.cancelled&&a.reminders.currentRevision===confirmed?.proposalRevision
  &&n.sources.some(s=>s.sourceKind==='appointment'&&s.sourceId===a.appointmentId&&s.sourceRevision===String(a.version))
  &&n.dueAt===confirmed?.startsAtUtc&&n.expiresAt===confirmed?.startsAtUtc
  &&Number.isFinite(start)&&Number.isFinite(fire)&&Number.isFinite(current)&&fire===start-30*60_000&&current>=fire&&current<start;
}
export function createTypedDeliverySources(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;repository:DeliveryPolicyRepository;now?:()=>string}) {
 // Sprint 0109: conversation, membership and read position come from the relationship message tables.
 const messages=createRelationshipMessageReader({client:input.client,workspaceId:input.workspaceId});
 async function conversation(id:string){const v=await messages.conversation(id),me=v?.members.find(m=>m.accountId===input.actorId);
  if(!v||v.status!=='active'||v.conversationId!==id||me?.state!=='active'||v.members.length!==2)return null;return {...v,me};
 }
 return {authorizeConversation:async(id:string)=>!!await conversation(id),
  async resolve(d:NotificationDelivery):Promise<TypedDeliveryContent|null>{
   if(d.actorId!==input.actorId||!d.policySource)return null;
   const cutover=await input.repository.cutover(input.actorId);if(!cutover?.enabled)return null;
   const p=await createDiscoveryRepository(input).preferences(input.actorId),source=d.policySource;
   if(source.kind==='notification'){
    if(await readHistoricalNotificationSuppression({executor:input.client,workspaceId:input.workspaceId,actorId:input.actorId,eventKey:source.eventKey}))return null;
    let n;try{n=await createInboxRuntime({...input,forDispatch:true}).service.get(input.actorId,source.id,p.language);}catch(error){if(error instanceof InboxRecordError&&error.code==='NOT_FOUND')return null;throw error;}
    const scheduled=n.scheduledFor??n.occurredAt,eventKey=n.id+':'+scheduled;
    const scheduledAt=Date.parse(scheduled),since=Date.parse(cutover.since);
    if(n.target.status!=='available'||n.disposition!=='open'||eventKey!==source.eventKey||!Number.isFinite(scheduledAt)||!Number.isFinite(since)||scheduledAt<since)return null;
    if(n.sources.some(s=>s.objectId==='discovery')&&!p.enabled)return null;
    if(!secretaryPushAllowed(n.sources,await input.repository.preferences(input.actorId)))return null;
    let meeting30m=false;
    if(n.semanticKey.startsWith('meeting-reminder:')){
     const row=await input.client.query<{payload:AppointmentAggregate}>(`select payload from appointment_aggregates where workspace_id=$1 and appointment_id=$2`,[input.workspaceId,n.target.id]);
     meeting30m=!!row.rows[0]&&verifiedMeetingReminder(n,row.rows[0].payload,input.actorId,(input.now??(()=>new Date().toISOString()))());
     if(!meeting30m)return null;
    }
    return {subject:{channel:n.kind,origin:n.origin,scheduledFor:scheduled,expiresAt:n.expiresAt,active:true,read:!!n.readAt,explicitNight:n.origin==='user',hasFactualWindow:!!n.dueAt,meeting30m},title:n.title,body:n.reason,href:'/inbox/notifications/'+encodeURIComponent(n.id),language:p.language};
   }
   const m=await messages.message(source.id);
   if(!m||m.messageId!==source.id||source.eventKey!==m.messageId||d.signalRevision!==m.sentAt||m.senderAccountId===input.actorId||m.conversationId!==source.conversationId||typeof m.body!=='string')return null;
   const v=await conversation(m.conversationId);if(!v||m.qualificationVersion!==v.qualificationVersion||!v.members.some(p=>p.accountId===m.senderAccountId)||m.sentAt<cutover.since||!Number.isFinite(Date.parse(m.sentAt)))return null;
   const isRead=v.me.readSeq>=m.seq;
   const name=v.members.find(p=>p.accountId===m.senderAccountId)?.displayName||m.senderDisplayName;if(!name)return null;
   return {subject:{channel:'message',origin:'business',scheduledFor:m.sentAt,conversationId:m.conversationId,active:true,read:isRead,explicitNight:false},title:name,body:m.body,href:'/inbox/'+encodeURIComponent(m.conversationId),language:p.language};
  },
 };
}
