import type { TaskItemContract } from "../../api/contract/tasks";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { readTaskListItems, selectTaskListItems } from "../../view-models/task-list-scope";
import type { TaskListSource, TaskListSourceInput } from "./task-list-source";

type SyncedTasks = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

function itemsFrom(records: readonly { payload: unknown }[], actorId: string): TaskItemContract[] | null {
  return readTaskListItems({ tasks: records.map((record) => record.payload) }, actorId);
}

/**
 * The mirror-backed task list, shared by native and (when the browser mirror is
 * available) Web: the network only advances the mirror, reads never wait on it.
 */
export function mirrorTaskListSource(state: SyncedTasks, input: TaskListSourceInput): TaskListSource {
  // Sprint 0087: an empty list is only a fact once a sync has happened. Until
  // then `canonical` stays null, because the screen renders 暂无待办 from an empty
  // array and cannot tell the difference on its own.
  //
  // `syncing` alone cannot mean "never synced": it is also the state of a
  // refresh, and blanking the list on every pull-to-refresh would be its own
  // bug. A cursor — surfaced as lastSyncedAt — is the actual evidence.
  const everSynced = state.lastSyncedAt !== null
    || state.status === "fresh" || state.status === "local-ready" || state.status === "stale";
  // A failed first sync has no list either — 0078 already settled that it shows
  // the error rather than an empty page, and an empty array here would show both.
  const readable = everSynced && !(state.status === "failure" && state.records.length === 0);
  const canonical = input.ready && readable ? itemsFrom(state.records, input.actorId) : null;
  const selection=input.selection??{scope:"all",view:"open"};
  const open=canonical?selectTaskListItems(canonical,{...selection,view:"open"}):null;
  const completed=canonical?selectTaskListItems(canonical,{...selection,view:"completed"}):null;
  const selected=selection.view==="open"?open:completed;
  const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
  // This is a local mirror window, not a server cursor or a new network read.
  // Sorting matches the explicit task-page v1 order for canonical ASCII IDs.
  selected?.sort((a,b)=>selection.view==="completed"?compare(b.updatedAt,a.updatedAt)||compare(a.id,b.id)
    :compare(a.dueAt??a.plannedDate??"9999",b.dueAt??b.plannedDate??"9999")||compare(b.updatedAt,a.updatedAt)||compare(a.id,b.id));
  const offset=input.cursor?.match(/^local:([0-9]+)$/)?Number(input.cursor.slice(6)):0;
  const validOffset=Number.isSafeInteger(offset)&&offset>=0?offset:0;
  return {
    canonical:selected?.slice(validOffset,validOffset+30)??null,
    counts:open&&completed?{open:open.length,completed:completed.length}:null,
    nextCursor:selected&&validOffset+30<selected.length?`local:${validOffset+30}`:null,
    loading: input.ready && !everSynced && state.status !== "failure",
    failure: state.status === "failure" ? state.error ?? "sync.failure" : null,
    refreshing: state.status === "syncing",
    // A never-synced collection reads as syncing: from the user's side the page
    // is fetching, and there is no separate thing for them to do about it.
    syncLabelKey: `sync.${state.status === "local-ready" ? "localReady" : state.status === "unsynced" ? "syncing" : state.status}` as MessageKey,
    tasksPayload: undefined,
    refresh: () => { void state.refresh(); },
    async confirmMutation(taskId, action) {
      const mirror = await state.invalidate();
      const mirrored = mirror?.status === "fresh" ? itemsFrom(mirror.records, input.actorId)?.find((task) => task.id === taskId) : null;
      return Boolean(mirrored && mirrored.status === (action === "complete" ? "completed" : "open"));
    },
  };
}
