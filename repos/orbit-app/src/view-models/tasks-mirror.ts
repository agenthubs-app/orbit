import type { TaskItemContract } from "../api/contract/tasks";
import type { LocalSyncQueuedMutation } from "../data/sync/local-sync-repository";
import { isOfflineTaskCategory } from "../data/sync/task-outbox-mutation";

export type TaskMutationState = "queued" | "conflict" | "failed";
export type MirroredTask = TaskItemContract & { localMutationState?: TaskMutationState };

/** Keep canonical rows immutable and apply the actor's ordered task intents as a presentation overlay. */
export function overlayQueuedTasks(
  serverTasks: readonly TaskItemContract[],
  mutations: readonly LocalSyncQueuedMutation[],
  actorId: string,
): MirroredTask[] | null {
  const tasks = new Map<string, MirroredTask>(serverTasks.map(task => [task.id, task]));
  for (const mutation of mutations) {
    if (mutation.domainId !== "tasks" || mutation.kind !== "task" || mutation.actorId !== actorId || mutation.requestJson === null ||
        !["create", "update", "complete", "reopen", "cancel", "delete"].includes(mutation.operation) ||
        typeof mutation.patch !== "object" || mutation.patch === null || Array.isArray(mutation.patch)) return null;
    const prior = tasks.get(mutation.id);
    if (mutation.operation === "create") {
      if (prior || !mutation.id.startsWith("local:")) return null;
      const patch = mutation.patch as Record<string, unknown>;
      if (!isOfflineTaskCategory(patch.category) || typeof patch.title !== "string") return null;
      tasks.set(mutation.id, {
        id: mutation.id, accountId: actorId, ownerUserId: actorId, title: patch.title, status: "open", category: patch.category as TaskItemContract["category"],
        priority: patch.priority === "high" ? "high" : "normal", source: "manual", createdAt: mutation.createdAt,
        updatedAt: mutation.createdAt, ...(typeof patch.notes === "string" ? { notes: patch.notes } : {}),
        ...(typeof patch.location === "string" ? { location: patch.location } : {}),
        ...(typeof patch.plannedDate === "string" ? { plannedDate: patch.plannedDate } : {}),
        ...(typeof patch.dueAt === "string" ? { dueAt: patch.dueAt } : {}), localMutationState: mutationState(mutation.state),
      });
      continue;
    }
    if (!prior || prior.ownerUserId !== actorId || !isOfflineTaskCategory(prior.category)) return null;
    if (mutation.operation === "delete") {
      if (mutation.state !== "conflict") tasks.delete(mutation.id);
      else tasks.set(mutation.id, { ...prior, localMutationState: "conflict" });
      continue;
    }
    let next: MirroredTask;
    if (mutation.operation === "update") {
      next = applyTaskPatch(prior, mutation.patch as Record<string, unknown>, mutation.createdAt);
    } else if (mutation.operation === "complete") {
      next = { ...prior, status: "completed", completedAt: mutation.createdAt, completedBy: actorId, completionSource: "user", updatedAt: mutation.createdAt };
    } else if (mutation.operation === "reopen") {
      const { completedAt: _completedAt, completedBy: _completedBy, completionSource: _completionSource, ...open } = prior;
      next = { ...open, status: "open", updatedAt: mutation.createdAt };
    } else {
      next = { ...prior, status: "cancelled", updatedAt: mutation.createdAt };
    }
    tasks.set(mutation.id, { ...next, localMutationState: mutationState(mutation.state) });
  }
  return [...tasks.values()];
}

function applyTaskPatch(task: MirroredTask, patch: Record<string, unknown>, updatedAt: string): MirroredTask {
  const next: Record<string, unknown> = { ...task, updatedAt };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as unknown as MirroredTask;
}

function mutationState(state: LocalSyncQueuedMutation["state"]): TaskMutationState {
  return state === "conflict" ? "conflict" : state === "failed" ? "failed" : "queued";
}
