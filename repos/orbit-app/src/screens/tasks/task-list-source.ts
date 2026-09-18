import type { TaskItemContract } from "../../api/contract/tasks";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { readTaskListItems } from "../../view-models/task-list-scope";

/**
 * Native task list source: the local mirror fed by the lease → domain-page
 * protocol. The network only advances the mirror; a second visit reads the
 * mirror without a business request. Web resolves task-list-source.web.ts.
 */
export interface TaskListSourceInput {
  actorId: string;
  ready: boolean;
  scopeKey: string;
}

export interface TaskListSource {
  canonical: TaskItemContract[] | null;
  /** Nothing readable yet (first sync still running). */
  loading: boolean;
  failure: string | null;
  refreshing: boolean;
  /** Mirror freshness label for the screen; null where there is no mirror (Web). */
  syncLabelKey: MessageKey | null;
  /**
   * The raw /api/tasks payload when the source is the network (it also carries
   * unconfirmed legacy suggestions); undefined when the source is the mirror.
   */
  tasksPayload: unknown | undefined;
  refresh(): void;
  /** After a mutation receipt: does the authoritative source now agree with the intended status? */
  confirmMutation(taskId: string, action: "complete" | "reopen"): Promise<boolean>;
}

function itemsFrom(records: readonly { payload: unknown }[], actorId: string): TaskItemContract[] | null {
  return readTaskListItems({ tasks: records.map((record) => record.payload) }, actorId);
}

export function useTaskListSource(input: TaskListSourceInput): TaskListSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
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
