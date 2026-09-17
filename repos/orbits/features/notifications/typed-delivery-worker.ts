import type {NotificationDelivery,NotificationDeliveryService} from './delivery-service';
import type {PushDeviceService} from './push-device-service';
import type {OrbitPushAdapter} from './push-adapter';
import type {DeliveryPolicyRepository} from './delivery-policy-repository';
import {evaluateDeliveryPolicy,type DeliveryPolicySubject} from './delivery-policy';
export interface TypedDeliveryContent {subject:DeliveryPolicySubject;title:string;body:string;href:string;language:'zh'|'en'|'ja';}
export interface TypedDeliverySources {resolve(delivery:NotificationDelivery):Promise<TypedDeliveryContent|null>;}
const privateBody={zh:{message:'你收到了一条新消息',notification:'你有一条 Orbit 通知'},en:{message:'You have a new message',notification:'You have an Orbit notification'},ja:{message:'新しいメッセージがあります',notification:'Orbit から通知があります'}};
export function createTypedDeliveryWorker(input:{actorId:string;ledger:NotificationDeliveryService;repository:DeliveryPolicyRepository;devices:PushDeviceService;push:OrbitPushAdapter|null;sources:TypedDeliverySources;now?:()=>string}) {
 const now=input.now??(()=>new Date().toISOString());
 return {async run(options:{workerId:string;limit?:number}) {
  const result={claimed:0,deferred:0,deadLettered:0,receiptPending:0,receiptUnknown:0,retried:0,sent:0,suppressed:0};
  if(input.push?.getReceipt)for(const pending of await input.ledger.list({status:'receipt_pending',limit:500})){
   if(!pending.providerReceiptId)continue;
   try{const receipt=await input.push.getReceipt(pending.providerReceiptId);if(receipt.status==='ok'){await input.ledger.markReceiptVerified({deliveryId:pending.deliveryId,providerReceiptId:pending.providerReceiptId,now:now()});if(pending.policySource)await input.repository.settle(input.actorId,pending.deliveryId,'sent',pending.providerReceiptId);}else if(receipt.status==='error'){await input.ledger.markReceiptFailed({deliveryId:pending.deliveryId,providerReceiptId:pending.providerReceiptId,error:receipt.error??'provider_receipt_error',now:now()});if(/DeviceNotRegistered/.test(receipt.error??''))await input.devices.revoke(pending.deviceId);}}
   catch{/* Retain the provider ticket. Receipt lookup failure never resends. */}
  }
  const claimed=await input.ledger.claimReady({now:now(),limit:Math.min(100,options.limit??25),workerId:options.workerId,lane:'typed'});result.claimed=claimed.length;
  for(const d of claimed){
   const owned={deliveryId:d.deliveryId,workerId:options.workerId,now:now()};
   const suppress=async(reason:string)=>{await input.ledger.markSuppressed({...owned,reason});result.suppressed++;};
   const defer=async(availableAt:string)=>{await input.ledger.defer({...owned,availableAt});result.deferred++;};
   const source=await input.sources.resolve(d);if(!source){await suppress('source_unavailable');continue;}
   const p=await input.repository.preferences(input.actorId),decision=evaluateDeliveryPolicy(source.subject,p,now());
   if(decision.action==='suppress'){await suppress(decision.reason);continue;}if(decision.action==='defer'){await defer(decision.availableAt);continue;}
   if(!input.push){await defer(new Date(Date.parse(now())+60000).toISOString());continue;}
   let device=(await input.devices.listActive()).find(x=>x.deviceId===d.deviceId);if(!device){await suppress('device_revoked');continue;}
   const reserved=await input.repository.reserve(input.actorId,{deliveryId:d.deliveryId,eventKey:d.policySource!.eventKey,deviceId:d.deviceId,automatic:source.subject.origin==='automation',suggestion:source.subject.channel==='suggestion',conversationId:source.subject.conversationId,expectedPreferenceRevision:p.revision});
   if(!reserved.allowed){if(reserved.reason==='local_owner'||reserved.reason==='preferences_changed'){await defer(new Date(Date.parse(now())+60000).toISOString());}else if(reserved.reason==='dispatch_already_started'){if(reserved.receiptId){if(reserved.receiptVerified){await input.ledger.markSent({...owned,providerReceiptId:reserved.receiptId});result.sent++;}else{await input.ledger.markReceiptPending({...owned,providerReceiptId:reserved.receiptId});result.receiptPending++;}}else{await input.ledger.markUnknown!({...owned,error:'dispatch_recovery_requires_reconciliation'});result.receiptUnknown++;}}else await suppress(reserved.reason);continue;}
   // Recheck the authority and token after durable ownership/quota reservation.
   const fresh=await input.sources.resolve(d),current=await input.repository.preferences(input.actorId);device=(await input.devices.listActive()).find(x=>x.deviceId===d.deviceId);
   if(!fresh||!device||current.revision!==reserved.preferences.revision||evaluateDeliveryPolicy(fresh.subject,current,now()).action!=='send'){await input.repository.settle(input.actorId,d.deliveryId,'rejected');await suppress('pre_send_state_changed');continue;}
   const full=current.lockScreenContent==='full';
   let receipt:Awaited<ReturnType<OrbitPushAdapter['send']>>;
   try {
    receipt=await input.push.send({token:device.token,title:full?fresh.title.slice(0,160):'Orbit',body:full?fresh.body.slice(0,512):privateBody[fresh.language][fresh.subject.channel==='message'?'message':'notification'],data:{deliveryId:d.deliveryId},sound:reserved.sound?'default':null});
    if(!receipt.receiptId)throw Error('Missing provider ticket');

   }catch(error){
    if((error as {notAccepted?:boolean}).notAccepted){await input.repository.settle(input.actorId,d.deliveryId,'rejected');if(/DeviceNotRegistered|InvalidCredentials|MessageTooBig/.test(String(error))){if(/DeviceNotRegistered/.test(String(error)))await input.devices.revoke(d.deviceId);await suppress('provider_rejected');}else{const retry=await input.ledger.markRetry({...owned,error:'provider_rejected_retryable'});if(retry.status==='dead_letter')result.deadLettered++;else result.retried++;}}
    else {await input.repository.settle(input.actorId,d.deliveryId,'unknown');await input.ledger.markUnknown!({...owned,error:'provider_outcome_unknown'});result.receiptUnknown++;}
    continue;
   }
    await input.repository.settle(input.actorId,d.deliveryId,receipt.verified?'sent':'receipt_pending',receipt.receiptId);
    if(receipt.verified){await input.ledger.markSent({...owned,providerReceiptId:receipt.receiptId});result.sent++;}else{await input.ledger.markReceiptPending({...owned,providerReceiptId:receipt.receiptId});result.receiptPending++;}
  }
  return result;
 }};
}
