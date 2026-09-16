import test from 'node:test';import assert from 'node:assert/strict';
import {createStorageNotificationDeliveryService} from '../../features/notifications/delivery-service';import {createMemoryLiveRecordStore} from '../../shared/storage/live-record-store';
test('legacy and typed workers cannot claim each other’s records and uncertain sends are terminal until reconciled',async()=>{
 const now='2026-09-16T01:00:00.000Z',service=createStorageNotificationDeliveryService({actorId:'a',workspaceId:'w',store:createMemoryLiveRecordStore() as never,now:()=>now});
 const base={signalId:'n',signalRevision:'1',phase:'commitment' as const,title:'Orbit',body:'Notification',scheduledFor:now};
 const typed=await service.materialize({...base,policySource:{kind:'notification',id:'n',eventKey:'n:1'}} as never);await service.materialize({...base,signalId:'old'});
 assert.equal((await service.claimReady({now,limit:10,workerId:'legacy'})).length,1);
 const claimed=await service.claimReady({now,limit:10,workerId:'typed',lane:'typed'} as never);assert.equal(claimed.length,1);assert.equal(claimed[0].deliveryId,typed.delivery.deliveryId);
 await service.markUnknown!({deliveryId:typed.delivery.deliveryId,workerId:'typed',now,error:'network_timeout'});
 assert.equal((await service.get(typed.delivery.deliveryId))?.status,'receipt_unknown');assert.equal((await service.claimReady({now:'2026-09-17T01:00:00Z',limit:10,workerId:'recovery',lane:'typed'} as never)).length,0);
});
test('typed policy deferral does not consume provider retry attempts',async()=>{
 const now='2026-09-16T01:00:00.000Z',service=createStorageNotificationDeliveryService({actorId:'a',workspaceId:'w',store:createMemoryLiveRecordStore() as never,now:()=>now});
 const {delivery}=await service.materialize({signalId:'deferred',signalRevision:'1',phase:'commitment',title:'Orbit',body:'Notification',scheduledFor:now,policySource:{kind:'notification',id:'n',eventKey:'n'}});
 for(let i=0;i<5;i++){await service.claimReady({now,limit:1,workerId:'w',lane:'typed'});await service.defer({deliveryId:delivery.deliveryId,workerId:'w',now,availableAt:now});}
 assert.equal((await service.get(delivery.deliveryId))?.attempt,0);
});
test('delivery read rejects records belonging to a different actor',async()=>{
 const now='2026-09-16T01:00:00.000Z',store=createMemoryLiveRecordStore(),make=(actorId:string)=>createStorageNotificationDeliveryService({actorId,workspaceId:'w',store:store as never,now:()=>now});
 const {delivery}=await make('b').materialize({signalId:'foreign',signalRevision:'1',phase:'commitment',title:'Private',body:'Secret',scheduledFor:now});
 assert.equal(await make('a').get(delivery.deliveryId),null);
});
