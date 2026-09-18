import {createHash} from 'node:crypto';
import type {TransactionalPostgresClient,TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import type {InboxDeliveryOwnerDTO,InboxDeliveryPreferencesDTO,InboxDeliveryPreferencesInput} from '../../shared/contract/notification-delivery-policy';
import {defaultDeliveryPreferences,deliveryQuotaUsage,type DeliveryQuotaReservation} from './delivery-policy';
export class DeliveryPolicyConflict extends Error {}
export const deliveryPolicyId=(...parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function createDeliveryPolicyRepository(input:{client:TransactionalPostgresClient;workspaceId:string;now?:()=>string}) {
 const now=input.now??(()=>new Date().toISOString());
 async function tx<T>(actorId:string,fn:(db:TransactionalSqlExecutor)=>Promise<T>):Promise<T>{for(let attempt=0;;attempt++)try{return await input.client.transaction(async db=>{await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['notification-delivery-policy',input.workspaceId,actorId])]);return fn(db);});}catch(e){if(attempt>=2||!['40001','40P01'].includes(String((e as {code?:string}).code)))throw e;}}
 async function get<T>(db:TransactionalSqlExecutor,collectionName:string,recordId:string):Promise<T|null>{return (await createPostgresLiveRecordStore({client:db}).getRecord({workspaceId:input.workspaceId,collectionName,recordId}))?.payload as T??null;}
 async function save(db:TransactionalSqlExecutor,collectionName:string,recordId:string,actorId:string,payload:unknown){await createPostgresLiveRecordStore({client:db}).upsertRecord({workspaceId:input.workspaceId,collectionName,recordId,userId:actorId,sourceType:'system',sourceId:recordId,evidenceIds:[],lifecycleState:'active',payload:payload as Record<string,unknown>,createdAt:now(),updatedAt:now()});}
 async function prefs(db:TransactionalSqlExecutor,actorId:string):Promise<InboxDeliveryPreferencesDTO>{
  const saved=await get<InboxDeliveryPreferencesDTO>(db,'notificationChannelPreferences',actorId),legacy=await get<{entity:{lockScreenContent?:'private'|'full';quietHours?:{enabled:boolean;timeZone:string}}}>(db,'notificationPreferences',actorId);
  const profile=await db.query<{zone:string|null}>(`select payload->>'timezone' as zone from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='profiles' and lifecycle_state='active' and payload->>'accountId'=$2 order by updated_at desc limit 1`,[input.workspaceId,actorId]);
  const result={...defaultDeliveryPreferences(actorId),...saved,lockScreenContent:legacy?.entity.lockScreenContent??saved?.lockScreenContent??'private',quietHoursEnabled:legacy?.entity.quietHours?.enabled??saved?.quietHoursEnabled??true};
  const zone=profile.rows[0]?.zone??legacy?.entity.quietHours?.timeZone??result.timeZone;try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();result.timeZone=zone;}catch{/* Preserve validated preference. */}return result;
 }
 const repository={tx,get,save,
  preferences:(actorId:string)=>prefs(input.client,actorId),
  async updatePreferences(actorId:string,patch:InboxDeliveryPreferencesInput,authorizeConversation:(id:string)=>Promise<boolean>){return tx(actorId,async db=>{
   const p=await prefs(db,actorId);if(p.revision!==patch.expectedRevision)throw new DeliveryPolicyConflict('Refresh preferences');
   const muted=new Set(p.mutedConversationIds);if(patch.muteConversation){if(!await authorizeConversation(patch.muteConversation.conversationId))throw new DeliveryPolicyConflict('Conversation unavailable');if(patch.muteConversation.muted)muted.add(patch.muteConversation.conversationId);else muted.delete(patch.muteConversation.conversationId);if(muted.size>1000)throw new DeliveryPolicyConflict('Mute limit reached');}
   const {expectedRevision:_revision,muteConversation:_mute,...changes}=patch;const next={...p,...changes,mutedConversationIds:[...muted],revision:p.revision+1};
   const legacy=await get<{entity:Record<string,unknown>}>(db,'notificationPreferences',actorId);const entity=legacy?.entity??{accountId:actorId,ownerUserId:actorId,inAppEnabled:true,iosPushEnabled:true};
   await save(db,'notificationPreferences',actorId,actorId,{entity:{...entity,lockScreenContent:next.lockScreenContent,quietHours:{enabled:next.quietHoursEnabled,start:'22:00',end:'08:00',timeZone:next.timeZone},updatedAt:now()}});
   await save(db,'notificationChannelPreferences',actorId,actorId,next);return next;
  });},
  cutover:(actorId:string)=>get<{enabled:boolean;legacyBlocked?:boolean;generation:number;since:string;batchId:string}>(input.client,'notificationCutover',actorId),
  async owner(actorId:string,deviceId:string):Promise<InboxDeliveryOwnerDTO>{const cutover=await repository.cutover(actorId),saved=await get<InboxDeliveryOwnerDTO>(input.client,'notificationDeliveryOwners',deliveryPolicyId(actorId,deviceId));return {actorId,deviceId,cutover:!!cutover?.enabled,generation:cutover?.generation??0,owner:cutover?.enabled&&saved?.generation===cutover.generation?'server':'local'};},
  async acknowledgeOwner(actorId:string,deviceId:string,generation:number,localCancelled:boolean){return tx(actorId,async db=>{const cutover=await get<{enabled:boolean;generation:number}>(db,'notificationCutover',actorId);if(!localCancelled||!cutover?.enabled||cutover.generation!==generation)throw new DeliveryPolicyConflict('Delivery ownership changed');const owner:InboxDeliveryOwnerDTO={actorId,deviceId,generation,cutover:true,owner:'server'};await save(db,'notificationDeliveryOwners',deliveryPolicyId(actorId,deviceId),actorId,owner);return owner;});},
  async reserve(actorId:string,value:{deliveryId:string;eventKey:string;deviceId:string;automatic:boolean;suggestion:boolean;conversationId?:string;expectedPreferenceRevision:number}) {
   return tx(actorId,async db=>{
    const p=await prefs(db,actorId);if(p.revision!==value.expectedPreferenceRevision)return {allowed:false as const,reason:'preferences_changed'};
    const cutover=await get<{enabled:boolean;generation:number}>(db,'notificationCutover',actorId),owner=await get<InboxDeliveryOwnerDTO>(db,'notificationDeliveryOwners',deliveryPolicyId(actorId,value.deviceId));if(!cutover?.enabled||owner?.generation!==cutover.generation||owner.owner!=='server')return {allowed:false as const,reason:'local_owner'};
    const attemptId=deliveryPolicyId(actorId,value.deliveryId),attempt=await get<{state:string;receiptId?:string}>(db,'notificationDeliveryAttempts',attemptId);if(attempt&&attempt.state!=='rejected')return {allowed:false as const,reason:'dispatch_already_started',receiptId:attempt.receiptId,receiptVerified:attempt.state==='sent'};
    const eventId=deliveryPolicyId(actorId,value.eventKey),reservation=await get<DeliveryQuotaReservation>(db,'notificationDeliveryReservations',eventId);
    if(value.automatic&&!reservation){const rows=await db.query<{payload:DeliveryQuotaReservation}>(`select payload from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='notificationDeliveryReservations' and (payload->>'at')::timestamptz >= $3::timestamptz`,[input.workspaceId,actorId,new Date(Date.parse(now())-48*3600000).toISOString()]);const usage=deliveryQuotaUsage(rows.rows.map(r=>r.payload),now(),p.timeZone);if(usage.automatic>=2||(value.suggestion&&usage.suggestions>=1))return {allowed:false as const,reason:'daily_quota'};await save(db,'notificationDeliveryReservations',eventId,actorId,{eventKey:value.eventKey,at:now(),timeZone:p.timeZone,suggestion:value.suggestion});}
    let sound=true;
    if(value.conversationId){const key=deliveryPolicyId(actorId,value.conversationId),last=await get<{at:string}>(db,'notificationConversationSound',key);sound=!last||Date.parse(now())-Date.parse(last.at)>=60000;if(sound)await save(db,'notificationConversationSound',key,actorId,{at:now(),eventKey:value.eventKey});}
    await save(db,'notificationDeliveryAttempts',attemptId,actorId,{state:'started',deliveryId:value.deliveryId,eventKey:value.eventKey,deviceId:value.deviceId,at:now(),sound});
    return {allowed:true as const,sound,preferences:p};
   });
  },
  async settle(actorId:string,deliveryId:string,state:'receipt_pending'|'sent'|'unknown'|'rejected',receiptId?:string){return tx(actorId,async db=>{const id=deliveryPolicyId(actorId,deliveryId),old=await get<Record<string,unknown>>(db,'notificationDeliveryAttempts',id);if(!old)throw new DeliveryPolicyConflict('No dispatch reservation');if(old.state==='unknown'&&state==='rejected')throw new DeliveryPolicyConflict('Unknown dispatch cannot be released');if(['sent','receipt_pending'].includes(state)&&!receiptId?.trim())throw new DeliveryPolicyConflict('Provider receipt required');await save(db,'notificationDeliveryAttempts',id,actorId,{...old,state,receiptId:receiptId??old.receiptId??null,settledAt:now()});});},
 };
 return repository;
}
export type DeliveryPolicyRepository=ReturnType<typeof createDeliveryPolicyRepository>;
