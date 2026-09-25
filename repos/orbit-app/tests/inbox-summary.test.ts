import assert from 'node:assert/strict';
import test from 'node:test';
import {createOrbitApiClient} from '../src/api/client';
import {readUnifiedInboxCount} from '../src/api/inbox-summary';
const at='2026-09-25T00:00:00Z';
const legacy={actorId:'a',messagesUnread:2,notificationsUnread:3,notificationMode:'legacy',notificationRead:'ready',asOf:at};
function harness(responses:{status:number;data?:unknown}[]){
 const paths:string[]=[];const controller=new AbortController();
 const client=createOrbitApiClient({baseUrl:'https://example.test',fetchImpl:async path=>{paths.push(String(path));const r=responses.shift();assert.ok(r);return new Response(JSON.stringify(r.status===200?{success:true,data:r.data}:{success:false,error:{code:'UNAVAILABLE',message:'Unavailable'}}),{status:r.status,headers:{'content-type':'application/json'}});}});
 return {paths,controller,read:()=>readUnifiedInboxCount({client,actorId:'a',signal:controller.signal})};
}
test('unified legacy count requires one request and no legacy list',async()=>{
 const h=harness([{status:200,data:legacy}]);assert.deepEqual(await h.read(),{kind:'count',count:5});assert.equal(h.paths.length,1);
});
test('typed count is complete in the one bounded summary request',async()=>{
 const h=harness([{status:200,data:{...legacy,notificationMode:'typed',notificationsUnread:4}}]);
 assert.deepEqual(await h.read(),{kind:'count',count:6});assert.equal(h.paths.length,1);
});
test('missing, forbidden, failed, foreign, and malformed summaries stay unknown without fallback reads',async()=>{
 for(const r of [{status:404},{status:403},{status:503},{status:200,data:{...legacy,actorId:'foreign'}},{status:200,data:{...legacy,messagesUnread:-1}}]){
  const f=harness([r]);assert.deepEqual(await f.read(),{kind:'count',count:undefined});assert.equal(f.paths.length,1);
 }
});
test('aborted reads cannot publish a count',async()=>{
 const h=harness([{status:404}]);h.controller.abort();assert.deepEqual(await h.read(),{kind:'count',count:undefined});
});
