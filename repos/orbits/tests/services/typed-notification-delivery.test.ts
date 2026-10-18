import test from 'node:test';import assert from 'node:assert/strict';
import {createTypedDeliveryWorker} from '../../features/notifications/typed-delivery-worker';
import {createStorageNotificationDeliveryService} from '../../features/notifications/delivery-service';import {createMemoryLiveRecordStore} from '../../shared/storage/live-record-store';
import {defaultDeliveryPreferences} from '../../features/notifications/delivery-policy';
import {secretaryPushAllowed,verifiedMeetingReminder} from '../../features/notifications/typed-delivery-source';
import type {InboxNotificationDTO} from '../../shared/contract/inbox-notifications';
import type {AppointmentAggregate} from '../../features/appointments/contract';
test('only the current participant-owned 30-minute appointment reminder gets the exception',()=>{
 const scheduledFor='2026-09-16T14:00:00.000Z',dueAt='2026-09-16T14:30:00.000Z';
 const n={actorId:'a',semanticKey:'meeting-reminder:apt:3',kind:'reminder',origin:'automation',scheduledFor,dueAt,expiresAt:dueAt,target:{kind:'appointment',id:'apt',status:'available'},object:{id:'contact',name:'Person'},sources:[{sourceKind:'appointment',sourceId:'apt',sourceRevision:'7'}]} as unknown as InboxNotificationDTO;
 const a={appointmentId:'apt',ownerActorId:'a',inviteeActorId:'b',contactIdsByActor:{a:'contact'},status:'confirmed',version:7,confirmed:{proposalRevision:3,startsAtUtc:dueAt},reminders:{cancelled:false,currentRevision:3}} as unknown as AppointmentAggregate;
 assert.equal(verifiedMeetingReminder(n,a,'a',scheduledFor),true);
 assert.equal(verifiedMeetingReminder(n,{...a,status:'cancelled'},'a',scheduledFor),false);
 assert.equal(verifiedMeetingReminder(n,{...a,reminders:{cancelled:true,currentRevision:3}},'a',scheduledFor),false);
 assert.equal(verifiedMeetingReminder(n,a,'other',scheduledFor),false);
 assert.equal(verifiedMeetingReminder(n,a,'a',dueAt),false);
});
test('secretary switches only mute matching push sources',()=>{
 const p={...defaultDeliveryPreferences('a'),secretaryDeadline:false,secretaryPick:false};
 assert.equal(secretaryPushAllowed([{sourceKind:'event_deadline'}] as never,p),false);
 assert.equal(secretaryPushAllowed([{sourceKind:'event_prep'}] as never,p),false);
 assert.equal(secretaryPushAllowed([{sourceKind:'event_pick'}] as never,p),false);
 assert.equal(secretaryPushAllowed([{sourceKind:'mail_summary'}] as never,defaultDeliveryPreferences('a')),false);
 assert.equal(secretaryPushAllowed([{sourceKind:'contact'}] as never,p),true);
});
test('quiet and 07:30–07:50 candidates become one private digest per device',async()=>{
 const at='2026-09-16T22:50:00.000Z',ledger=createStorageNotificationDeliveryService({actorId:'a',workspaceId:'w',store:createMemoryLiveRecordStore() as never,now:()=>at});
 for(const [id,due] of [['night','2026-09-16T14:10:00.000Z'],['morning','2026-09-16T22:40:00.000Z']])await ledger.materialize({signalId:id,signalRevision:'1',phase:'commitment',title:'PRIVATE',body:'PRIVATE BODY',scheduledFor:due,policySource:{kind:'notification',id,eventKey:id}});
 const seen=new Set<string>(),keys:string[]=[],sentBodies:string[]=[];let sends=0;
 const prefs=defaultDeliveryPreferences('a');
 const repo={preferences:async()=>prefs,reserve:async(_actor:string,value:{digestKey?:string})=>{keys.push(value.digestKey??'');if(seen.has(value.digestKey??''))return {allowed:false,reason:'digest_duplicate'};seen.add(value.digestKey??'');return {allowed:true,sound:true,preferences:prefs};},settle:async()=>{}};
 const worker=createTypedDeliveryWorker({actorId:'a',ledger,repository:repo as never,now:()=>at,devices:{listActive:async()=>[{deviceId:'actor-device',token:'token'}]} as never,push:{send:async message=>{sends++;sentBodies.push(message.body);assert.equal(message.title,'Orbit');assert.equal(message.body.includes('PRIVATE'),false);assert.deepEqual(Object.keys(message.data),['deliveryId']);return {receiptId:'ticket',verified:true};}},sources:{resolve:async d=>({subject:{channel:'reminder',origin:'automation',active:true,read:false,explicitNight:false,scheduledFor:d.scheduledFor},title:'PRIVATE',body:'PRIVATE BODY',href:'/inbox/notifications/'+d.signalId,language:'en'})}});
 await worker.run({workerId:'digest'});assert.equal(sends,1);assert.match(sentBodies[0]!,/2/);assert.deepEqual(keys,['digest:2026-09-17','digest:2026-09-17']);assert.equal((await ledger.list({status:'suppressed'})).length,1);
});
test('source cancellation and provider timeout cannot leak body or retry an uncertain send',async()=>{
 const at='2026-09-16T01:00:00.000Z',ledger=createStorageNotificationDeliveryService({actorId:'a',workspaceId:'w',store:createMemoryLiveRecordStore() as never,now:()=>at});
 const ids=[];for(const id of ['cancelled','revoked','timeout'])ids.push((await ledger.materialize({signalId:id,signalRevision:'1',phase:'commitment',title:'PRIVATE',body:'PRIVATE BODY',scheduledFor:at,policySource:{kind:'notification',id,eventKey:id}})).delivery.deliveryId);
 let sends=0;const states:string[]=[];const repo={preferences:async()=>defaultDeliveryPreferences('a'),reserve:async()=>({allowed:true,sound:false,preferences:defaultDeliveryPreferences('a')}),settle:async(_a:string,_id:string,state:string)=>{states.push(state);}};
 const worker=createTypedDeliveryWorker({actorId:'a',ledger,repository:repo as never,now:()=>at,devices:{listActive:async()=>[{deviceId:'actor-device',token:'token'}]} as never,push:{send:async m=>{sends++;assert.equal(m.title,'Orbit');assert.notEqual(m.body,'PRIVATE BODY');assert.deepEqual(Object.keys(m.data),['deliveryId']);throw Error('timeout');}},sources:{resolve:async d=>d.signalId==='cancelled'?null:{subject:{channel:'reminder',origin:'automation',active:true,read:false,explicitNight:false,scheduledFor:at},title:'PRIVATE',body:'PRIVATE BODY',href:'/inbox/notifications/n',language:'zh'}}});
 await worker.run({workerId:'one',limit:10});assert.equal(sends,2);assert.equal(states.filter(s=>s==='unknown').length,2);assert.equal((await ledger.get(ids[0]))?.status,'suppressed');assert.equal((await ledger.get(ids[2]))?.status,'receipt_unknown');await worker.run({workerId:'two',limit:10});assert.equal(sends,2);
});
test('a persisted provider ticket recovers a failed ledger write without sending again',async()=>{
 let at='2026-09-16T01:00:00.000Z',calls=0,record:{state:string;receiptId?:string}|null=null;
 const ledger=createStorageNotificationDeliveryService({actorId:'a',workspaceId:'w',store:createMemoryLiveRecordStore() as never,now:()=>at});
 const d=(await ledger.materialize({signalId:'n',signalRevision:'1',phase:'commitment',title:'N',body:'B',scheduledFor:at,policySource:{kind:'notification',id:'n',eventKey:'n'}})).delivery;
 const original=ledger.markReceiptPending;let fail=true;ledger.markReceiptPending=async value=>{if(fail){fail=false;throw Error('database temporary failure');}return original(value);};
 const p=defaultDeliveryPreferences('a'),repository={preferences:async()=>p,reserve:async()=>record?{allowed:false,reason:'dispatch_already_started',receiptId:record.receiptId,receiptVerified:record.state==='sent'}:{allowed:true,sound:true,preferences:p},settle:async(_a:string,_id:string,state:string,receiptId?:string)=>{record={state,receiptId};}};
 const worker=createTypedDeliveryWorker({actorId:'a',ledger,repository:repository as never,devices:{listActive:async()=>[{deviceId:'actor-device',token:'token'}]} as never,push:{send:async()=>{calls++;return {receiptId:'real-ticket-boundary'};}},now:()=>at,sources:{resolve:async()=>({subject:{channel:'reminder',origin:'automation',active:true,read:false,explicitNight:false,scheduledFor:'2026-09-16T01:00:00Z'},title:'N',body:'B',href:'/inbox/notifications/n',language:'zh'})}});
 await assert.rejects(worker.run({workerId:'first'}));at='2026-09-16T01:16:00.000Z';await worker.run({workerId:'recovery'});assert.equal(calls,1);assert.equal((await ledger.get(d.deliveryId))?.providerReceiptId,'real-ticket-boundary');assert.equal((await ledger.get(d.deliveryId))?.status,'receipt_pending');
});
