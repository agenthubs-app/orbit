import type { TaskItemContract } from "../../src/api/contract/tasks";
import type { TaskPageContract } from "../../src/api/contract/task-page";

/** A transport fixture only. PG authorization/bounds are tested in Web. */
export function taskPageFixture(tasks: readonly TaskItemContract[], actorId:string, params:URLSearchParams):TaskPageContract {
  const status=params.get("status")==="completed"?"completed":"open",scope=params.get("scope")==="relationship"?"relationship":"all";
  const selected=tasks.filter(t=>t.ownerUserId===actorId&&t.accountId===actorId&&(scope==="all"||t.category==="relationship"||t.relatedContactId));
  const counts={open:selected.filter(t=>t.status==="open").length,completed:selected.filter(t=>t.status==="completed").length};
  const offset=Number(params.get("cursor")??0),limit=Number(params.get("limit")??30);
  const sorted=selected.filter(t=>t.status===status).sort((a,b)=>a.id<b.id?-1:1);
  const items:TaskPageContract["items"]=sorted.slice(offset,offset+limit).map(t=>({id:t.id,titlePreview:t.title,locationPreview:t.location??null,status,category:t.category,priority:t.priority,plannedDate:t.plannedDate??null,dueAt:t.dueAt??null,updatedAt:t.updatedAt,completedAt:t.completedAt??null,
    relatedContact:t.relatedContactId==="contact:22"?{id:t.relatedContactId,namePreview:"真实联系人",organizationPreview:"真实机构"}:null}));
  const hasMore=offset+limit<sorted.length;
  return {actorId,status,scope,query:"",items,counts,total:counts[status],hasMore,nextCursor:hasMore?String(offset+limit):null,asOf:"2026-09-25T00:00:00Z"};
}
