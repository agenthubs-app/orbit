import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryLiveRecordStore} from '../../shared/storage/live-record-store';
import {createReminderPlanRepository} from '../../features/notifications/reminder-plan-repository';
import {createReminderPlanService} from '../../features/notifications/reminder-plan-service';
test('legacy reminder dispatcher leaves externally managed plans and history untouched',async()=>{
 const now='2026-09-16T01:00:00.000Z',repository=createReminderPlanRepository({store:createMemoryLiveRecordStore(),workspaceId:'w'});
 const service=createReminderPlanService({now:()=>now,repository,deliveryManagedExternally:async(actor:string)=>actor==='a'} as never);
 for(const actorId of ['a','b'])await service.create({actorId,body:'Send quotation',channels:['in_app'],createdBy:'user',deepLink:'/tasks/t',fireAt:now,idempotencyKey:'r',targetId:'t',targetType:'task',timeZone:'Asia/Tokyo',title:'Send quotation'});
 const result=await service.dispatchDue({now,provider:{send:async()=>{throw Error('must not push');}}});
 assert.equal(result.claimed,1);assert.equal((await service.list({actorId:'a'}))[0].status,'scheduled');assert.equal((await repository.listDeliveries('a')).length,0);assert.equal((await service.list({actorId:'b'}))[0].status,'delivered');
});
