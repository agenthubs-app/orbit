import type { TaskItemContract } from "../../api/contract/tasks";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { mirrorTaskListSource } from "./task-list-source-mirror";

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

export function useTaskListSource(input: TaskListSourceInput): TaskListSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  return mirrorTaskListSource(state, input);
}
