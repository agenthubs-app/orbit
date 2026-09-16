import test from 'node:test';import assert from 'node:assert/strict';
import {handoffLocalDelivery} from '../../src/notifications/delivery-ownership';
const owner={actorId:'a',deviceId:'d',generation:1,cutover:true,owner:'local' as const};
test('server ownership is acknowledged only after all local reminders are cancelled',async()=>{
 const calls:string[]=[];let current=true;
 const adapter={getAllScheduledNotificationsAsync:async()=>[{identifier:'old',content:{data:{orbitReminderPlanId:'r'}}},{identifier:'other',content:{data:{}}}],cancelScheduledNotificationAsync:async(id:string)=>{calls.push(id);},getPermissionsAsync:async()=>({granted:false,status:'denied'}),scheduleNotificationAsync:async()=>{throw Error('must not schedule');}};
 const client={get:async()=>({success:true,data:owner}),post:async()=>{calls.push('ack');return {success:true,data:{...owner,owner:'server'}};}};
 const result=await handoffLocalDelivery({client:client as never,adapter,deviceId:'d',isCurrent:()=>current});assert.ok(result&&result!=='legacy');assert.equal(result.cancelled,1);assert.deepEqual(calls,['old','ack']);
 calls.length=0;adapter.cancelScheduledNotificationAsync=async()=>{current=false;calls.push('cancel');};
 assert.equal(await handoffLocalDelivery({client:client as never,adapter,deviceId:'d',isCurrent:()=>current}),null);assert.deepEqual(calls,['cancel']);
});
test('cancellation failure never acknowledges server ownership',async()=>{
 let acknowledged=false;const client={get:async()=>({success:true,data:owner}),post:async()=>{acknowledged=true;}};
 const adapter={getAllScheduledNotificationsAsync:async()=>[{identifier:'r',content:{data:{orbitReminderPlanId:'r'}}}],cancelScheduledNotificationAsync:async()=>{throw Error('native failure');}};
 await assert.rejects(handoffLocalDelivery({client:client as never,adapter:adapter as never,deviceId:'d',isCurrent:()=>true}),/native failure/);assert.equal(acknowledged,false);
});
