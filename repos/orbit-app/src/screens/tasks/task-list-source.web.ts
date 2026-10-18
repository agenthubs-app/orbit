import { useApiResource } from "../../hooks/useApiResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { taskPageSchema } from "../../api/schema/task-page";
import { mirrorTaskListSource } from "./task-list-source-mirror";
import type { TaskListEntry, TaskListSource, TaskListSourceInput } from "./task-list-source";

const TASK_PAGE_UNCONFIRMED = "待办数据无法确认，请刷新重试。";

function rowsFromPage(page: ReturnType<typeof taskPageSchema.parse> | null): TaskListEntry[] | null {
  return page?.items.map(item=>({id:item.id,title:item.titlePreview,status:item.status,category:item.category,priority:item.priority,updatedAt:item.updatedAt,baseRevision:null,
    ...(item.completedAt?{completedAt:item.completedAt}:{}),...(item.plannedDate?{plannedDate:item.plannedDate}:{}),...(item.dueAt?{dueAt:item.dueAt}:{}),...(item.locationPreview?{location:item.locationPreview}:{}),...(item.relatedContact?{relatedContactId:item.relatedContact.id}:{})}))??null;
}

/**
 * Web task list source (sprint 0078): mirror-first when the browser mirror is
 * available (secure context, OPFS, Web Crypto), the plain network read otherwise.
 * Both hooks always run so the hook order never changes; the network read is
 * switched off while the mirror is the source, and the mirror is inert (its
 * lifecycle reports online-only) while the network is. Static rendering has no
 * browser capabilities and therefore always renders the network source.
 */
export function useTaskListSource(input: TaskListSourceInput): TaskListSource {
  const mirror = useWebMirrorStatus();
  const mirrorActive = mirror.mode === "local-mirror";
  const synced = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const outbox = useOfflineTaskOutbox(synced, false);
  const selection=input.selection??{scope:"all",view:"open"};
  const params=new URLSearchParams({status:selection.view,scope:selection.scope,limit:"30"});
  if(input.today&&input.timeZone){params.set("today",input.today);params.set("timeZone",input.timeZone);}
  // A browser can lose mirror capability. Its local offset is not a signed
  // server cursor; start a fresh network page instead of sending that offset.
  if(input.cursor&&!input.cursor.startsWith("local:"))params.set("cursor",input.cursor);
  const state = useApiResource<unknown>(`/api/tasks/page?${params}`, () => false, { scopeKey: JSON.stringify([input.scopeKey,params.toString()]), cachePolicy: "network-only", enabled: input.ready && !mirrorActive });
  const completedParams=new URLSearchParams({status:"completed",scope:selection.scope,limit:"30"});
  if(input.today&&input.timeZone){completedParams.set("today",input.today);completedParams.set("timeZone",input.timeZone);}
  if(input.completedCursor&&!input.completedCursor.startsWith("local:"))completedParams.set("cursor",input.completedCursor);
  const completedEnabled=Boolean(input.ready&&!mirrorActive&&input.completedExpanded&&selection.view==="open");
  const completedState=useApiResource<unknown>(`/api/tasks/page?${completedParams}`,()=>false,{scopeKey:JSON.stringify([input.scopeKey,completedParams.toString()]),cachePolicy:"network-only",enabled:completedEnabled});
  if (mirrorActive) return mirrorTaskListSource(synced, input, outbox);
  const loaded = input.ready && (state.kind === "success" || state.kind === "empty");
  const parsed=loaded?taskPageSchema.safeParse(state.data):null;
  const page=parsed?.success&&parsed.data.actorId===input.actorId&&parsed.data.status===selection.view&&parsed.data.scope===selection.scope&&parsed.data.query===""?parsed.data:null;
  const completedLoaded=completedEnabled&&(completedState.kind==="success"||completedState.kind==="empty");
  const completedParsed=completedLoaded?taskPageSchema.safeParse(completedState.data):null;
  const completedPage=completedParsed?.success&&completedParsed.data.actorId===input.actorId&&completedParsed.data.status==="completed"&&completedParsed.data.scope===selection.scope&&completedParsed.data.query===""?completedParsed.data:null;
  return {
    canonical:rowsFromPage(page),
    counts:page?.counts??null,
    nextCursor:page?.nextCursor??null,
    completedSection:completedEnabled?{
      canonical:rowsFromPage(completedPage),
      nextCursor:completedPage?.nextCursor??null,
      loading:completedState.kind==="loading",
      failure:completedState.kind==="failure"||completedState.kind==="offline"?completedState.error.message:completedLoaded&&!completedPage?TASK_PAGE_UNCONFIRMED:null,
      unconfirmed:Boolean(completedLoaded&&!completedPage),
    }:null,
    loading: state.kind === "loading",
    failure: state.kind === "failure" || state.kind === "offline" ? state.error.message : loaded&&!page?TASK_PAGE_UNCONFIRMED:null,
    unconfirmed: Boolean(loaded && !page),
    refreshing: state.refreshing,
    syncLabelKey: null,
    offline: null,
    // The page API never pretends to contain legacy unconfirmed suggestions.
    tasksPayload: undefined,
    queuedMutations: [],
    queueFailure: null,
    enqueueOfflineMutation: async () => { throw new Error("browser task writes require a connection"); },
    refresh() { state.refresh(); if(completedEnabled)completedState.refresh(); },
    async confirmMutation() {
      state.refresh();
      if(completedEnabled)completedState.refresh();
      return true;
    },
  };
}
