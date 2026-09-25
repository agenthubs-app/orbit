import assert from "node:assert/strict";
import test from "node:test";
import { createContactLabelsGetHandler } from "../../app/api/contacts/labels/handler";

test("contact names require server identity and reject excessive/unknown filters before reading",async()=>{
  let reads=0;
  const reader=()=>({read:async(actorId:string,ids:readonly string[])=>{reads++;assert.equal(actorId,"a");assert.deepEqual(ids,["c"]);return {actorId,items:[],asOf:"2026-09-25T00:00:00Z"};}});
  const request=(query:string)=>new Request(`https://orbit.test/api/contacts/labels?${query}`);
  assert.equal((await createContactLabelsGetHandler({resolveActor:async()=>null,reader})(request("id=c"))).status,401);
  const handler=createContactLabelsGetHandler({resolveActor:async()=>({id:"a",workspaceId:"w"}),reader});
  for(const query of ["actorId=b","id=",Array(31).fill("id=c").join("&"),`id=${"x".repeat(2049)}`])assert.equal((await handler(request(query))).status,400);
  assert.equal(reads,0);const response=await handler(request("id=c"));assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(reads,1);
});
