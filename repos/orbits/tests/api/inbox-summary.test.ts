import assert from 'node:assert/strict';
import test from 'node:test';
import {createInboxSummaryGetHandler} from '../../app/api/inbox/summary/handler';
import {inboxSummarySchema} from '../../shared/api-schema/inbox-summary';
const actor={id:'account',accountId:'account',userId:'subject',workspaceId:'workspace',name:'Test',email:'test@example.test'};
const at='2026-09-25T00:00:00.000Z';
test('combined legacy summary authenticates once and selects only narrow readers',async()=>{
  let auth=0;const calls:string[]=[];
  const response=await createInboxSummaryGetHandler({resolveActor:async()=>{auth++;return actor;},typedEnabled:()=>false,
    readMessages:async a=>{assert.equal(a.accountId,'account');calls.push('messages');return 4;},
    readLegacy:async()=>{calls.push('legacy');return 3;},now:()=>at})();
  assert.equal(response.status,200);assert.equal(auth,1);assert.deepEqual(calls,['messages','legacy']);
  const body=await response.json();assert.deepEqual(inboxSummarySchema.parse(body.data),{actorId:'account',messagesUnread:4,notificationsUnread:3,notificationMode:'legacy',notificationRead:'ready',asOf:at});
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('typed mode reads its permission-checked count without legacy or feed materialization',async()=>{
  const response=await createInboxSummaryGetHandler({resolveActor:async()=>actor,typedEnabled:()=>true,
    readMessages:async()=>2,readLegacy:async()=>{throw Error('wrong source');},readTyped:async()=>5,now:()=>at})();
  const body=await response.json();assert.equal(response.status,200);
  assert.deepEqual(inboxSummarySchema.parse(body.data),{actorId:'account',messagesUnread:2,notificationsUnread:5,notificationMode:'typed',notificationRead:'ready',asOf:at});
});
test('authentication and server failures never leak internals or fabricate a zero count',async()=>{
  assert.equal((await createInboxSummaryGetHandler({resolveActor:async()=>null,typedEnabled:()=>{throw Error('must not read');}})()).status,401);
  for(const readMessages of [async()=>{throw Error('PRIVATE database error');},async()=>-1,async()=>Number.MAX_SAFE_INTEGER+1]){
    const response=await createInboxSummaryGetHandler({resolveActor:async()=>actor,typedEnabled:()=>false,readMessages,readLegacy:async()=>0})();
    assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE/);
  }
  assert.equal(inboxSummarySchema.safeParse({actorId:'account',messagesUnread:0,notificationsUnread:null,notificationMode:'legacy',notificationRead:'ready',asOf:at}).success,false);
});
