import { tasksPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { readTaskListItems } from "../../view-models/task-list-scope";
import type { TaskListSource, TaskListSourceInput } from "./task-list-source";

/**
 * Web task list source: no local mirror exists in the browser yet (sprint 0077),
 * so the list stays a network read exactly as before.
 */
export function useTaskListSource(input: TaskListSourceInput): TaskListSource {
  const state = useApiResource<unknown>(tasksPath(), () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only" });
  const loaded = input.ready && (state.kind === "success" || state.kind === "empty");
  return {
    canonical: loaded ? readTaskListItems(state.data, input.actorId) : null,
    loading: state.kind === "loading",
    failure: state.kind === "failure" || state.kind === "offline" ? state.error.message : null,
    refreshing: state.refreshing,
    syncLabelKey: null,
    tasksPayload: loaded ? state.data : {},
    refresh: state.refresh,
    async confirmMutation() {
      state.refresh();
      return true;
    },
  };
}
