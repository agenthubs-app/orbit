import { useApiResource } from "../../hooks/useApiResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import { taskPageSchema } from "../../api/schema/task-page";
import { mirrorTaskListSource } from "./task-list-source-mirror";
import type { TaskListSource, TaskListSourceInput } from "./task-list-source";

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
  const selection=input.selection??{scope:"all",view:"open"};
  const params=new URLSearchParams({status:selection.view,scope:selection.scope,limit:"30"});
  // A browser can lose mirror capability. Its local offset is not a signed
  // server cursor; start a fresh network page instead of sending that offset.
  if(input.cursor&&!input.cursor.startsWith("local:"))params.set("cursor",input.cursor);
  const state = useApiResource<unknown>(`/api/tasks/page?${params}`, () => false, { scopeKey: JSON.stringify([input.scopeKey,params.toString()]), cachePolicy: "network-only", enabled: input.ready && !mirrorActive });
  if (mirrorActive) return mirrorTaskListSource(synced, input);
  const loaded = input.ready && (state.kind === "success" || state.kind === "empty");
  const parsed=loaded?taskPageSchema.safeParse(state.data):null;
  const page=parsed?.success&&parsed.data.actorId===input.actorId&&parsed.data.status===selection.view&&parsed.data.scope===selection.scope&&parsed.data.query===""?parsed.data:null;
  return {
    canonical: page? page.items.map(item=>({id:item.id,title:item.titlePreview,status:item.status,category:item.category,priority:item.priority,updatedAt:item.updatedAt,
      ...(item.completedAt?{completedAt:item.completedAt}:{}),...(item.plannedDate?{plannedDate:item.plannedDate}:{}),...(item.dueAt?{dueAt:item.dueAt}:{}),...(item.locationPreview?{location:item.locationPreview}:{}),...(item.relatedContact?{relatedContactId:item.relatedContact.id}:{})})):null,
    counts:page?.counts??null,
    nextCursor:page?.nextCursor??null,
    loading: state.kind === "loading",
    failure: state.kind === "failure" || state.kind === "offline" ? state.error.message : loaded&&!page?"待办数据无法确认，请刷新重试。":null,
    refreshing: state.refreshing,
    syncLabelKey: null,
    // The page API never pretends to contain legacy unconfirmed suggestions.
    tasksPayload: undefined,
    refresh: state.refresh,
    async confirmMutation() {
      state.refresh();
      return true;
    },
  };
}
