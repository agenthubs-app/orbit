import assert from "node:assert/strict";
import test from "node:test";
import { createTaskPageGetHandler } from "../../app/api/tasks/page/handler";
import type { TaskPageContract } from "../../shared/contract/task-page";

const actor = {id:"a",workspaceId:"w"};
const request = (query="") => new Request(`https://orbit.test/api/tasks/page${query}`);
const page:TaskPageContract = {actorId:"a",status:"open",scope:"all",query:"",items:[],total:0,counts:{open:0,completed:0},nextCursor:null,hasMore:false,asOf:"2026-09-25T00:00:00Z"};
test("task page resolves server identity once and passes only bounded filters",async()=>{
  let auth=0; const calls:unknown[]=[];
  const handler=createTaskPageGetHandler({resolveActor:async()=>{auth++;return actor;},reader:workspace=>{
    assert.equal(workspace,"w");return {read:async(id,query)=>{calls.push([id,query]);return page;},readToday:async()=>{throw Error("unused");}};
  }});
  const response=await handler(request("?status=open&scope=relationship&limit=20&query=abc&cursor=signed"));
  assert.equal(auth,1);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(calls,[["a",{status:"open",scope:"relationship",limit:20,query:"abc",cursor:"signed"}]]);
});
test("task page rejects unauthenticated and malformed requests without accessing data",async()=>{
  const reader=()=>{throw Error("must not read");};
  assert.equal((await createTaskPageGetHandler({resolveActor:async()=>null,reader})(request())).status,401);
  const handler=createTaskPageGetHandler({resolveActor:async()=>actor,reader});
  for(const query of ["?actorId=b","?status=cancelled","?status=open&status=completed","?scope=foreign","?limit=0","?limit=51","?limit=","?limit=1.5","?cursor=","?cursor=a&cursor=b",`?query=${"x".repeat(241)}`]) {
    assert.equal((await handler(request(query))).status,400,query);
  }
});
test("task page never falls back to full reads on cursor or storage failure",async()=>{
  for(const [message,status] of [["TASK_PAGE_CURSOR_INVALID",400],["READ_CURSOR_SECRET_MISSING",503],["private database details",503]] as const){
    const response=await createTaskPageGetHandler({resolveActor:async()=>actor,reader:()=>({read:async()=>{throw Error(message);},readToday:async()=>{throw Error("unused");}})})(request());
    assert.equal(response.status,status);assert.ok(!(await response.text()).includes(message));
  }
});
