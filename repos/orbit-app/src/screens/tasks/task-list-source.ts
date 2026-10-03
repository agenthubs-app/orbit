import type { TaskItemContract } from "../../api/contract/tasks";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { Platform } from "react-native";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import type { LocalSyncQueuedMutation } from "../../data/sync/local-sync-repository";
import type { OfflineTaskMutationInput } from "../../data/sync/sync-coordinator";
import type { MessageKey } from "../../i18n/messages";
import { mirrorTaskListSource } from "./task-list-source-mirror";
import type { TaskListSelection } from "../../view-models/task-list-scope";

// A list entry is deliberately not a complete task/detail record. Network
// cards do not contain notes, history, creation metadata or ownership claims.
export type TaskListEntry = Pick<TaskItemContract, "id" | "title" | "status" | "category" | "priority" | "updatedAt" | "completedAt" | "plannedDate" | "dueAt" | "location" | "relatedContactId" | "notes"> & { localMutationState?: "queued" | "conflict" | "failed"; baseRevision: string | null };

/**
 * Native task list source: the local mirror fed by the lease → domain-page
 * protocol. The network only advances the mirror; a second visit reads the
 * mirror without a business request. Web resolves task-list-source.web.ts.
 */
export interface TaskListSourceInput {
  actorId: string;
  ready: boolean;
  scopeKey: string;
  selection?: TaskListSelection;
  cursor?: string | null;
}

export interface TaskListSource {
  canonical: TaskListEntry[] | null;
  counts: {open:number;completed:number} | null;
  nextCursor: string | null;
  /** Nothing readable yet (first sync still running). */
  loading: boolean;
  failure: string | null;
  refreshing: boolean;
  /** Mirror freshness label for the screen; null where there is no mirror (Web). */
  syncLabelKey: MessageKey | null;
  /** Sprint 0131: set while the list is the device copy and the last sync failed (the page shows 截至 and turns writes off). */
  offline: { lastSyncedAt: string | null } | null;
  /**
   * The raw /api/tasks payload when the source is the network (it also carries
   * unconfirmed legacy suggestions); undefined when the source is the mirror.
   */
  tasksPayload: unknown | undefined;
  queuedMutations: readonly LocalSyncQueuedMutation[];
  queueFailure: string | null;
  enqueueOfflineMutation(mutation: OfflineTaskMutationInput): Promise<void>;
  refresh(): void;
  /** After a mutation receipt: does the authoritative source now agree with the intended status? */
  confirmMutation(taskId: string, action: "complete" | "reopen"): Promise<boolean>;
}

export function useTaskListSource(input: TaskListSourceInput): TaskListSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const outbox = useOfflineTaskOutbox(state, Platform.OS !== "web");
  return mirrorTaskListSource(state, input, outbox);
}
