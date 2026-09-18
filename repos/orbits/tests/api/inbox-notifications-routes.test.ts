import assert from 'node:assert/strict';import test from 'node:test';
import {createInboxNotificationHandler} from '../../app/api/inbox/notifications/handler';
import { isTypedInboxEnabled } from '../../features/notifications/inbox-record-service-factory';
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

// Sprint 0086: typed notifications are the inbox for every account. The rollout
// allowlist this used to read was never configured outside one QA account, so
// every other account silently fell back to the legacy feed and got a 404 on the
// notification settings. Only an explicit, per-account emergency opt-out remains.
test('typed notifications are enabled for every account, with an explicit opt-out only', () => {
  assert.equal(isTypedInboxEnabled('account_orbit_generated', {} as NodeJS.ProcessEnv), true);
  assert.equal(isTypedInboxEnabled('user_any', { ORBIT_TYPED_INBOX_DISABLED_ACTORS: '' } as unknown as NodeJS.ProcessEnv), true);
  assert.equal(isTypedInboxEnabled('user_any', { ORBIT_TYPED_INBOX_DISABLED_ACTORS: 'other' } as unknown as NodeJS.ProcessEnv), true);
  assert.equal(isTypedInboxEnabled('user_any', { ORBIT_TYPED_INBOX_DISABLED_ACTORS: ' user_any , other ' } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(isTypedInboxEnabled('   ', {} as NodeJS.ProcessEnv), false, 'an empty actor is never enabled');
  // The retired variable must not re-gate the feature.
  assert.equal(isTypedInboxEnabled('user_any', { ORBIT_TYPED_INBOX_ACTORS: 'someone-else' } as unknown as NodeJS.ProcessEnv), true);
});
