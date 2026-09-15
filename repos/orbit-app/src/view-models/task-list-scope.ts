import type { TaskItemContract } from "../api/contract/tasks";
import { taskDetailToView } from "./today-tasks";

export interface TaskListSelection {
  scope: "all" | "relationship";
  view: "open" | "completed";
}

export function isRelationshipTask(task: Pick<TaskItemContract, "category" | "relatedContactId">): boolean {
  return task.category === "relationship" || Boolean(task.relatedContactId?.trim());
}

export function parseTaskListSelection(params?: { scope?: unknown; view?: unknown } | null): TaskListSelection {
  const first = (value: unknown) => Array.isArray(value) ? value[0] : value;
  return {
    scope: first(params?.scope) === "relationship" ? "relationship" : "all",
    view: first(params?.view) === "completed" ? "completed" : "open",
  };
}

export function taskListHref(params?: { scope?: unknown; view?: unknown } | null): string {
  const selection = parseTaskListSelection(params), query = new URLSearchParams();
  if (selection.scope === "relationship") query.set("scope", selection.scope);
  if (selection.view === "completed") query.set("view", selection.view);
  return query.size ? `/tasks?${query}` : "/tasks";
}

export function selectTaskListItems(tasks: readonly TaskItemContract[], selection: TaskListSelection): TaskItemContract[] {
  const ids = new Set<string>();
  return tasks.filter(task => {
    if (!task.id || task.status !== selection.view || (selection.scope === "relationship" && !isRelationshipTask(task)) || ids.has(task.id)) return false;
    ids.add(task.id);
    return true;
  });
}

export function readTaskListItems(payload: unknown, actorId: string): TaskItemContract[] | null {
  if (!actorId || typeof payload !== "object" || payload === null || !("tasks" in payload) || !Array.isArray(payload.tasks)) return null;
  const items: TaskItemContract[] = [], ids = new Set<string>();
  for (const raw of payload.tasks) {
    if (typeof raw !== "object" || raw === null) return null;
    // Legacy unconfirmed suggestions may share the response but never become
    // persisted tasks or acquire completion controls from their taskId.
    if (typeof raw.taskId === "string" && !("status" in raw)) continue;
    if (!taskDetailToView({ task: raw }) || raw.accountId !== actorId || raw.ownerUserId !== actorId ||
      typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt)) ||
      (raw.relatedContactId !== undefined && typeof raw.relatedContactId !== "string")) return null;
    if (!ids.has(raw.id)) { ids.add(raw.id); items.push(raw as TaskItemContract); }
  }
  return items;
}

export function taskListReceiptMatches(payload: unknown, actorId: string, baseline: TaskItemContract, action: "complete" | "reopen"): boolean {
  const raw = typeof payload === "object" && payload !== null && "task" in payload ? payload.task : null;
  const item = readTaskListItems({ tasks: [raw] }, actorId)?.[0];
  return !!item && item.id === baseline.id && item.status === (action === "complete" ? "completed" : "open") && Date.parse(item.updatedAt) > Date.parse(baseline.updatedAt);
}

export type TaskMutationExpectation =
  | { action: "complete" | "reopen" | "delete" }
  | { action: "update"; patch: Readonly<Record<string, string | null>> };

export function taskMutationReceiptMatches(
  payload: unknown,
  actorId: string,
  baseline: TaskItemContract,
  expectation: TaskMutationExpectation,
): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  const task = readTaskListItems({ tasks: [root.task] }, actorId)?.[0];
  const activity = root.activity;
  if (!task || task.id !== baseline.id || Date.parse(task.updatedAt) <= Date.parse(baseline.updatedAt) ||
    !activity || typeof activity !== "object" || Array.isArray(activity)) return false;
  const receipt = activity as Record<string, unknown>;
  const activityType = expectation.action === "complete" ? "completed"
    : expectation.action === "reopen" ? "reopened"
      : expectation.action === "delete" ? "deleted" : "updated";
  if (receipt.accountId !== actorId || receipt.ownerUserId !== actorId || receipt.taskId !== baseline.id ||
    receipt.actorId !== actorId || receipt.actorType !== "user" || receipt.type !== activityType ||
    typeof receipt.id !== "string" || !receipt.id || typeof receipt.occurredAt !== "string" || !Number.isFinite(Date.parse(receipt.occurredAt))) return false;
  const snapshot = receipt.taskSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
    (snapshot as Record<string, unknown>).title !== task.title ||
    (snapshot as Record<string, unknown>).category !== task.category) return false;
  const expectedStatus = expectation.action === "complete" ? "completed"
    : expectation.action === "reopen" ? "open" : baseline.status;
  if (task.status !== expectedStatus) return false;
  if (expectation.action === "complete" && (
    baseline.status !== "open" ||
    typeof task.completedAt !== "string" ||
    !Number.isFinite(Date.parse(task.completedAt)) ||
    task.completedAt !== receipt.occurredAt ||
    task.completedBy !== actorId ||
    task.completionSource !== "user"
  )) return false;
  if (expectation.action === "reopen" && (
    baseline.status !== "completed" ||
    task.completedAt !== undefined ||
    task.completedBy !== undefined ||
    task.completionSource !== undefined
  )) return false;
  if (expectation.action === "update") {
    const changes = receipt.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return false;
    const patchEntries = Object.entries(expectation.patch);
    if (Object.keys(changes).length !== patchEntries.length) return false;
    for (const [key, expected] of Object.entries(expectation.patch)) {
      const actual = task[key as keyof TaskItemContract];
      if ((expected === null ? actual !== undefined : actual !== expected) || (changes as Record<string, unknown>)[key] !== expected) return false;
    }
  }
  return true;
}
