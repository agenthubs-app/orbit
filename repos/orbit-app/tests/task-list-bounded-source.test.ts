import assert from "node:assert/strict";
import test from "node:test";
import { mirrorTaskListSource } from "../src/screens/tasks/task-list-source-mirror";

const input={actorId:"a",ready:true,scopeKey:"a",selection:{scope:"all" as const,view:"open" as const}};
const records=Array.from({length:65},(_,n)=>({payload:{id:`task:${String(n).padStart(3,"0")}`,accountId:"a",ownerUserId:"a",title:`Task ${n}`,status:"open",category:n%2?"relationship":"work",priority:"normal",source:"manual",createdAt:"2026-09-25T00:00:00Z",updatedAt:"2026-09-25T00:00:00Z"}}));
const state={status:"fresh" as const,lastSyncedAt:"2026-09-25T00:00:00Z",workspaceId:"w",error:null,records,refresh:async()=>null,invalidate:async()=>null} as unknown as Parameters<typeof mirrorTaskListSource>[0];
test("local task mirror exposes a 30 item window and exact counts without another business read",()=>{
  const first=mirrorTaskListSource(state,input);
  assert.equal(first.canonical?.length,30);assert.deepEqual(first.counts,{open:65,completed:0});
  const second=mirrorTaskListSource(state,{...input,cursor:first.nextCursor});
  assert.equal(second.canonical?.length,30);assert.notEqual(first.canonical?.[0]?.id,second.canonical?.[0]?.id);
  const third=mirrorTaskListSource(state,{...input,cursor:second.nextCursor});
  assert.equal(third.canonical?.length,5);assert.equal(third.nextCursor,null);
  assert.equal(new Set([...(first.canonical??[]),...(second.canonical??[]),...(third.canonical??[])].map(t=>t.id)).size,65);
  const filtered=mirrorTaskListSource(state,{...input,selection:{scope:"relationship",view:"open"}});
  assert.equal(filtered.counts?.open,32);assert.equal(filtered.canonical?.length,30);
  const empty=mirrorTaskListSource(state,{...input,selection:{scope:"all",view:"completed"}});
  assert.deepEqual(empty.canonical,[]);assert.equal(empty.counts?.open,65);
});

test("completed fold pages the same local mirror without replacing open rows",()=>{
  const completed=Array.from({length:35},(_,n)=>({payload:{...records[n]!.payload,id:`done:${String(n).padStart(3,"0")}`,status:"completed"}}));
  const mixed={...state,records:[...records,...completed]} as unknown as Parameters<typeof mirrorTaskListSource>[0];
  const collapsed=mirrorTaskListSource(mixed,input);
  assert.equal(collapsed.completedSection,null);
  const first=mirrorTaskListSource(mixed,{...input,completedExpanded:true});
  assert.equal(first.canonical?.length,30);
  assert.equal(first.completedSection?.canonical?.length,30);
  assert.equal(first.completedSection?.nextCursor,"local:30");
  const second=mirrorTaskListSource(mixed,{...input,completedExpanded:true,completedCursor:first.completedSection?.nextCursor});
  assert.equal(second.canonical?.[0]?.id,first.canonical?.[0]?.id);
  assert.equal(second.completedSection?.canonical?.length,5);
  assert.equal(second.completedSection?.nextCursor,null);
  assert.equal(new Set([...(first.completedSection?.canonical??[]),...(second.completedSection?.canonical??[])].map(task=>task.id)).size,35);
});
