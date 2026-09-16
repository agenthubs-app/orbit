import assert from 'node:assert/strict';import test from 'node:test';
import {createInboxNotificationHandler} from '../../app/api/inbox/notifications/handler';
const actor={id:'actor:a',userId:'login:a'};
test('new inbox routes derive ownership from auth and reject arbitrary action fields',async()=>{
 const calls:unknown[]=[];const service={list:async(id:string)=>{calls.push(id);return {enabled:true,items:[],unreadCount:0,nextCursor:null,asOf:new Date().toISOString()};},action:async(...args:unknown[])=>{calls.push(args);return {};}};
 const handler=createInboxNotificationHandler({resolveActor:async()=>actor,enabled:()=>true,runtime:()=>({service} as any),refresh:async()=>{}});
 assert.equal((await handler('list',new Request('http://localhost/api/inbox/notifications?actorId=other'))).status,200);assert.deepEqual(calls,['actor:a']);
 assert.equal((await handler('action',new Request('http://localhost',{method:'POST',body:JSON.stringify({actorId:'other',action:'read',expectedRevision:1,idempotencyKey:'r'})}),{params:Promise.resolve({id:'n'})})).status,400);
 assert.equal(calls.length,1);
});
test('unauthenticated and disabled actors never invoke record mutations',async()=>{
 const unavailable=createInboxNotificationHandler({resolveActor:async()=>null,runtime:()=>{throw new Error('should not call');}});
 assert.equal((await unavailable('list',new Request('http://localhost'))).status,401);
 const disabled=createInboxNotificationHandler({resolveActor:async()=>actor,enabled:()=>false,runtime:()=>{throw new Error('should not call');}});
 const list=await disabled('list',new Request('http://localhost'));assert.equal((await list.json()).data.enabled,false);
 assert.equal((await disabled('action',new Request('http://localhost',{method:'POST'}),{params:Promise.resolve({id:'n'})})).status,404);
});
