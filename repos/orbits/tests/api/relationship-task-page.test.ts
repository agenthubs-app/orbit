import assert from 'node:assert/strict';
import test from 'node:test';
import {createRelationshipTaskPageGetHandler} from '../../app/api/relationship-tasks/page/handler';
const actor={id:'account',accountId:'account',userId:'subject',workspaceId:'workspace'};
const page={actorId:'account',mode:'open' as const,items:[],total:0,nextCursor:null,hasMore:false,asOf:'2026-09-25T00:00:00.000Z'};
const request=(query='')=>new Request(`https://orbit.test/api/relationship-tasks/page${query}`);
test('page authenticates once and passes server identity and bounded query',async()=>{
  let auth=0;const calls:unknown[]=[];
  const handler=createRelationshipTaskPageGetHandler({resolveActor:async()=>{auth++;return actor;},reader:workspace=>{
    assert.equal(workspace,'workspace');return {read:async(id,query)=>{calls.push([id,query]);return page;}};
  }});
  const response=await handler(request('?limit=30&mode=open&cursor=signed'));
  assert.equal(auth,1);assert.equal(response.status,200);
  assert.deepEqual(calls,[['account',{mode:'open',limit:30,cursor:'signed'}]]);
  assert.deepEqual((await response.json()).data,page);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('rejects missing auth and malformed queries before reading',async()=>{
  const reader=()=>{throw Error('must not read');};
  assert.equal((await createRelationshipTaskPageGetHandler({resolveActor:async()=>null,reader})(request())).status,401);
  const handler=createRelationshipTaskPageGetHandler({resolveActor:async()=>actor,reader});
  for(const query of ['?mode=all','?mode=open&mode=completed','?limit=51','?limit=0','?limit=NaN','?limit=1.5','?limit=','?limit=30&limit=30','?cursor=','?cursor=a&cursor=b','?actorId=other']){
    assert.equal((await handler(request(query))).status,400,query);
  }
});
test('cursor rejection is recoverable; missing storage/runtime failures never fall back or expose data',async()=>{
  for(const [message,status] of [['RELATIONSHIP_TASK_CURSOR_INVALID',400],['READ_CURSOR_SECRET_MISSING',503],['PRIVATE database exception',503]]){
    const response=await createRelationshipTaskPageGetHandler({resolveActor:async()=>actor,reader:()=>({read:async()=>{throw Error(String(message));}})})(request());
    assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE|READ_CURSOR_SECRET_MISSING/);
  }
  assert.equal((await createRelationshipTaskPageGetHandler({resolveActor:async()=>actor,reader:()=>null})(request())).status,503);
});
