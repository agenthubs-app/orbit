import { tasksPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import { readTaskListItems } from "../../view-models/task-list-scope";
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
  const state = useApiResource<unknown>(tasksPath(), () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only", enabled: !mirrorActive });
  if (mirrorActive) return mirrorTaskListSource(synced, input);
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
