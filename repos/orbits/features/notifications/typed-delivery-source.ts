import type {TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import type {NotificationDelivery} from './delivery-service';
import type {TypedDeliveryContent} from './typed-delivery-worker';
import {createInboxRuntime} from './inbox-record-service-factory';
import {InboxRecordError} from './inbox-record-service';
import {createDiscoveryRepository} from './discovery/discovery-repository';
import type {DeliveryPolicyRepository} from './delivery-policy-repository';
import {readHistoricalNotificationSuppression} from './delivery-policy-repository';
const string=(v:unknown)=>typeof v==='string'?v:'';
export function createTypedDeliverySources(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;repository:DeliveryPolicyRepository;now?:()=>string}) {
 const store=createPostgresLiveRecordStore({client:input.client}),now=input.now??(()=>new Date().toISOString());
 const get=(collectionName:string,recordId:string)=>store.getRecord({workspaceId:input.workspaceId,collectionName,recordId});
 async function conversation(id:string){const row=await get('relationship_communication_conversations',id),v=row?.payload;if(!row||row.lifecycleState!=='active'||v?.status!=='active'||v.conversationId!==id||!Array.isArray(v.participantAccountIds)||!v.participantAccountIds.includes(input.actorId))return null;const bound=await get('relationship_communication_bindings',string(v.bindingId)),b=bound?.payload;
  if(!bound||bound.lifecycleState!=='active'||b?.status!=='confirmed'||b.conversationId!==id||b.contactId!==v.contactId||b.qualificationVersion!==v.qualificationVersion||!v.participantAccountIds.includes(b.inviterAccountId)||!v.participantAccountIds.includes(b.remoteAccountId))return null;return v;
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
    if(n.target.status!=='available'||n.disposition!=='open'||eventKey!==source.eventKey||scheduled<cutover.since)return null;
    if(n.sources.some(s=>s.objectId==='discovery')&&!p.enabled)return null;
    return {subject:{channel:n.kind,origin:n.origin,scheduledFor:scheduled,expiresAt:n.expiresAt,active:true,read:!!n.readAt,explicitNight:n.origin==='user',hasFactualWindow:!!n.dueAt},title:n.title,body:n.reason,href:'/inbox/notifications/'+encodeURIComponent(n.id),language:p.language};
   }
   const row=await get('relationship_communication_messages',source.id),m=row?.payload;
   if(!row||row.lifecycleState!=='active'||m?.deliveryState!=='delivered'||m.messageId!==source.id||source.eventKey!==m.messageId||d.signalRevision!==m.sentAt||m.senderAccountId===input.actorId||m.conversationId!==source.conversationId||typeof m.body!=='string')return null;
   const v=await conversation(string(m.conversationId));if(!v||m.qualificationVersion!==v.qualificationVersion||!(v.participantAccountIds as unknown[]).includes(m.senderAccountId)||string(m.sentAt)<cutover.since||!Number.isFinite(Date.parse(string(m.sentAt))))return null;
   const read=await input.client.query<{payload:Record<string,unknown>}>(`select payload from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='relationship_communication_reads' and payload->>'conversationId'=$3 limit 1`,[input.workspaceId,input.actorId,m.conversationId]);
   const cursor=read.rows[0]?.payload.lastReadMessageId;let isRead=false;if(typeof cursor==='string'){const last=await get('relationship_communication_messages',cursor),l=last?.payload;if(l?.conversationId===m.conversationId)isRead=string(l.sentAt)>string(m.sentAt)||(l.sentAt===m.sentAt&&string(l.messageId)>=string(m.messageId));}
   const names=v.participantDisplayNames as Record<string,unknown>|undefined,name=string(names?.[string(m.senderAccountId)])||string(m.senderDisplayName);if(!name)return null;
   return {subject:{channel:'message',origin:'business',scheduledFor:string(m.sentAt),conversationId:string(m.conversationId),active:true,read:isRead,explicitNight:false},title:name,body:m.body,href:'/inbox/'+encodeURIComponent(string(m.conversationId)),language:p.language};
  },
 };
}
