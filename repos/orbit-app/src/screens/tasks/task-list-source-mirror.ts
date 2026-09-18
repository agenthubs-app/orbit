import type { TaskItemContract } from "../../api/contract/tasks";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { readTaskListItems } from "../../view-models/task-list-scope";
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
  const canonical = input.ready ? itemsFrom(state.records, input.actorId) : null;
  return {
    canonical,
    loading: input.ready && state.status === "local-ready" && state.records.length === 0,
    failure: state.status === "failure" ? state.error ?? "sync.failure" : null,
    refreshing: state.status === "syncing",
    syncLabelKey: `sync.${state.status === "local-ready" ? "localReady" : state.status}` as MessageKey,
    tasksPayload: undefined,
    refresh: () => { void state.refresh(); },
    async confirmMutation(taskId, action) {
      const mirror = await state.invalidate();
      const mirrored = mirror?.status === "fresh" ? itemsFrom(mirror.records, input.actorId)?.find((task) => task.id === taskId) : null;
      return Boolean(mirrored && mirrored.status === (action === "complete" ? "completed" : "open"));
    },
  };
}
