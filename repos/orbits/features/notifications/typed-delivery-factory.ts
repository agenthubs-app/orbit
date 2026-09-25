import type {TransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {createConfiguredTransactionalPostgresRuntime} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createStorageNotificationDeliveryService} from './delivery-service';
import {createPushDeviceService,type PushDeviceService} from './push-device-service';
import type {OrbitPushAdapter} from './push-adapter';
import {createConfiguredExpoPushAdapter} from './push-adapter';
import {createDeliveryPolicyRepository,readHistoricalNotificationSuppressions} from './delivery-policy-repository';
import {createTypedDeliverySources} from './typed-delivery-source';
import {createTypedDeliveryWorker} from './typed-delivery-worker';
import {createInboxRuntime} from './inbox-record-service-factory';
import {refreshInboxBusinessRecords} from './inbox-business-refresh';
export function createTypedDeliveryRuntime(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;now?:()=>string;devices?:PushDeviceService;push?:OrbitPushAdapter|null}) {
 const repository=createDeliveryPolicyRepository(input),devices=input.devices??createPushDeviceService({actorId:input.actorId}),sources=createTypedDeliverySources({...input,repository}),ledger=createStorageNotificationDeliveryService({...input,store:createPostgresLiveRecordStore({client:input.client}) as never,sqlClient:input.client,devices});
 return {...input,repository,devices,sources,ledger,worker:createTypedDeliveryWorker({...input,repository,devices,sources,ledger,push:input.push===undefined?createConfiguredExpoPushAdapter():input.push}),
  async materialize(){
   const cutover=await repository.cutover(input.actorId);if(!cutover?.enabled)return {notifications:0,messages:0};const inbox=createInboxRuntime(input);
   await refreshInboxBusinessRecords({...input,now:input.now?.()??new Date().toISOString(),service:inbox.service,since:cutover.since});
   const counts={notifications:0,messages:0};
   const state=await repository.get<{notifications:string|null;messages:{at:string;id:string}|null}>(input.client,'notificationDeliveryCursor',input.actorId)??{notifications:null,messages:null};
   let cursor=state.notifications;
   for(let page=0;page<4;page++){
    const list=await inbox.service.list(input.actorId,{limit:50,...(cursor?{cursor}:{})});
    const candidates=list.items.flatMap(n=>{
     const scheduled=n.scheduledFor??n.occurredAt;
     return scheduled<cutover.since||n.readAt||n.disposition!=='open'?[]:[{n,scheduled,eventKey:n.id+':'+scheduled}];
    });
    const historical=await readHistoricalNotificationSuppressions({executor:input.client,workspaceId:input.workspaceId,actorId:input.actorId,eventKeys:candidates.map(item=>item.eventKey)});
    for(const {n,scheduled,eventKey} of candidates){
     if(historical.has(eventKey))continue;
     await ledger.materialize({signalId:'typed:'+n.id,signalRevision:scheduled,phase:'commitment',title:'Orbit',body:'Notification',scheduledFor:scheduled,policySource:{kind:'notification',id:n.id,eventKey}});counts.notifications++;
    }
    cursor=list.nextCursor;if(!cursor)break;
   }
   // Candidate creation only needs references; dispatch still resolves the
   // current message, binding, membership and read state before sending.
   const position=state.messages??{at:cutover.since,id:''};const rows=await input.client.query<{payload:{messageId:string;conversationId:string;sentAt:string}}>(`select jsonb_build_object('messageId',m.payload->'messageId','conversationId',m.payload->'conversationId','sentAt',m.payload->'sentAt') as payload from orbit_records m where m.workspace_id=$1 and m.collection_name='relationship_communication_messages' and m.lifecycle_state='active' and m.payload->>'senderAccountId'<>$2 and (m.payload->>'sentAt',m.record_id)>($3,$4) and exists(select 1 from orbit_records c where c.workspace_id=$1 and c.collection_name='relationship_communication_conversations' and c.record_id=m.payload->>'conversationId' and c.payload->'participantAccountIds' ? $2) order by m.payload->>'sentAt',m.record_id limit 50`,[input.workspaceId,input.actorId,position.at,position.id]);
   for(const {payload:m} of rows.rows){await ledger.materialize({signalId:'message:'+m.messageId,signalRevision:m.sentAt,phase:'commitment',title:'Orbit',body:'Message',scheduledFor:m.sentAt,policySource:{kind:'message',id:m.messageId,conversationId:m.conversationId,eventKey:m.messageId}});counts.messages++;}
   const last=rows.rows.at(-1)?.payload;await repository.tx(input.actorId,db=>repository.save(db,'notificationDeliveryCursor',input.actorId,input.actorId,{notifications:cursor,messages:rows.rows.length===50&&last?{at:last.sentAt,id:last.messageId}:{at:cutover.since,id:''}}));return counts;
  },
 };
}
export function createConfiguredTypedDeliveryRuntime(actorId:string){const runtime=createConfiguredTransactionalPostgresRuntime({max:4});return runtime?createTypedDeliveryRuntime({...runtime,actorId}):null;}

// Preferences and source reads remain available when remote push credentials are absent.
export function createConfiguredDeliveryPolicyRuntime(actorId:string){
 const runtime=createConfiguredTransactionalPostgresRuntime({max:4});if(!runtime)return null;
 const repository=createDeliveryPolicyRepository(runtime),sources=createTypedDeliverySources({...runtime,actorId,repository});
 return {...runtime,repository,sources,devices:{listActive:()=>createPushDeviceService({actorId}).listActive()}};
}
