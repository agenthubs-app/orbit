import assert from "node:assert/strict";
import test from "node:test";
import { createTaskSuggestionPageGetHandler } from "../../app/api/task-suggestions/page/handler";

const request=(query="")=>new Request(`https://orbit.test/api/task-suggestions/page${query}`);
const actor={id:"a",workspaceId:"w"};
test("suggestion page binds authenticated identity and bounded selection", async()=>{
  const calls:unknown[]=[];
  const handler=createTaskSuggestionPageGetHandler({resolveActor:async()=>actor,reader:workspace=>{
    assert.equal(workspace,"w");return {read:async(id,query)=>{calls.push([id,query]);return {actorId:id,scope:query.scope??"all",items:[],total:0,nextCursor:null,hasMore:false,asOf:"2026-09-25T00:00:00Z"};}};
  }});
  const response=await handler(request("?scope=relationship&limit=20&cursor=signed"));
  assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(calls,[["a",{scope:"relationship",limit:20,cursor:"signed"}]]);
});
test("suggestion page never falls back to a full list on invalid input or storage failure", async()=>{
  const reader=()=>{throw Error("must not read");};
  assert.equal((await createTaskSuggestionPageGetHandler({resolveActor:async()=>null,reader})(request())).status,401);
  const handler=createTaskSuggestionPageGetHandler({resolveActor:async()=>actor,reader});
  for(const query of ["?actorId=b","?scope=bad","?scope=all&scope=relationship","?limit=0","?limit=31","?limit=","?limit=1.5","?cursor=","?cursor=a&cursor=b"])
    assert.equal((await handler(request(query))).status,400,query);
  for(const [message,status] of [["SUGGESTION_PAGE_CURSOR_INVALID",400],["private database error",503]] as const){
    const response=await createTaskSuggestionPageGetHandler({resolveActor:async()=>actor,reader:()=>({read:async()=>{throw Error(message);}})})(request());
    assert.equal(response.status,status);assert.ok(!(await response.text()).includes(message));
  }
});
