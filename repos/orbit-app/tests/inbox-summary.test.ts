import assert from 'node:assert/strict';
import test from 'node:test';
import {createOrbitApiClient} from '../src/api/client';
import {readUnifiedInboxCount,type InboxSummaryCapability} from '../src/api/inbox-summary';
const at='2026-09-25T00:00:00Z';
const legacy={actorId:'a',messagesUnread:2,notificationsUnread:3,notificationMode:'legacy',notificationRead:'ready',asOf:at};
function harness(responses:{status:number;data?:unknown}[]){
 const paths:string[]=[];const capability:InboxSummaryCapability={};const controller=new AbortController();
 const client=createOrbitApiClient({baseUrl:'https://example.test',fetchImpl:async path=>{paths.push(String(path));const r=responses.shift();assert.ok(r);return new Response(JSON.stringify(r.status===200?{success:true,data:r.data}:{success:false,error:{code:'UNAVAILABLE',message:'Unavailable'}}),{status:r.status,headers:{'content-type':'application/json'}});}});
 return {paths,capability,controller,read:()=>readUnifiedInboxCount({client,capability,actorId:'a',signal:controller.signal})};
}
test('unified legacy count requires one request and no legacy list',async()=>{
 const h=harness([{status:200,data:legacy}]);assert.deepEqual(await h.read(),{kind:'count',count:5});assert.equal(h.paths.length,1);
});
test('typed compatibility only refreshes typed, never also reads legacy',async()=>{
 const h=harness([{status:200,data:{...legacy,notificationMode:'typed',notificationRead:'refresh-required',notificationsUnread:null}},
 {status:200,data:{enabled:true,items:[],unreadCount:4,nextCursor:null,asOf:at}}]);
 assert.deepEqual(await h.read(),{kind:'count',count:6});assert.equal(h.paths.length,2);assert.ok(h.paths[1]!.endsWith('/api/inbox/notifications?limit=1'));
});
test('only explicit endpoint absence permits fallback, remembered for this scope',async()=>{
 const h=harness([{status:404}]);assert.deepEqual(await h.read(),{kind:'unsupported'});assert.deepEqual(await h.read(),{kind:'unsupported'});assert.equal(h.paths.length,1);
 for(const r of [{status:403},{status:503},{status:200,data:{...legacy,actorId:'foreign'}},{status:200,data:{...legacy,messagesUnread:-1}}]){
  const f=harness([r]);assert.deepEqual(await f.read(),{kind:'count',count:undefined});assert.equal(f.paths.length,1);assert.equal(f.capability.legacyOnly,undefined);
 }
});
test('typed refresh failures remain unknown instead of counting missing notifications as zero', async () => {
 for (const response of [
  {status:503}, {status:403}, {status:404}, {status:200,data:{}},
  {status:200,data:{enabled:false,items:[],unreadCount:0,nextCursor:null,asOf:at}},
 ]) {
  const h=harness([{status:200,data:{...legacy,notificationMode:'typed',notificationRead:'refresh-required',notificationsUnread:null}},response]);
  assert.deepEqual(await h.read(),{kind:'count',count:undefined});
  assert.equal(h.paths.length,2,'a failed refresh must not trigger full legacy list reads');
  assert.equal(h.capability.legacyOnly,undefined);
 }
});
test('aborted responses cannot publish a count or change capability',async()=>{
 const h=harness([{status:404}]);h.controller.abort();assert.deepEqual(await h.read(),{kind:'count',count:undefined});assert.equal(h.capability.legacyOnly,undefined);
});
