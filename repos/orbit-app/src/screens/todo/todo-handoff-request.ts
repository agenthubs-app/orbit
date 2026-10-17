import type { TodoNextMoveItem } from "../../api/contract/todo-page";
import { readTaskListItems } from "../../view-models/task-list-scope";
import type { TodoHandoffRecord } from "./todo-handoff-state";

/** Fixed audit content keeps an idempotent encounter retry byte-identical across locale changes. */
export const TODO_SENT_ENCOUNTER_NOTE = "Message sent, confirmed by the user in To-do.";

const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  value.length <= 256 && value.trim() === value && value !== "." && value !== ".." && !/[\u0000-\u001f\u007f]/u.test(value);

export function todoHandoffTarget(item: TodoNextMoveItem, taskPayload: unknown, actorId: string):
  { contactId: string; taskId: string | null } | null {
  if (item.source !== "agent_signal" || item.sample || !validId(item.sourceId) ||
    item.key !== `agent_signal:${item.sourceId}` || !actorId) return null;
  if (!item.taskId) return validId(item.contactId) ? { contactId: item.contactId, taskId: null } : null;
  if (!validId(item.taskId)) return null;
  const task = readTaskListItems({ tasks: [typeof taskPayload === "object" && taskPayload !== null && "task" in taskPayload
    ? taskPayload.task : null] }, actorId)?.[0];
  if (!task || task.id !== item.taskId || task.status !== "open" || !validId(task.relatedContactId) ||
    item.contactId && item.contactId !== task.relatedContactId) return null;
  return { contactId: task.relatedContactId, taskId: item.taskId };
}

export function todoHandoffRetryTarget(record: TodoHandoffRecord, item: TodoNextMoveItem):
  { contactId: string; taskId: string | null } | null {
  const confirmation = record.confirmation;
  if (!confirmation || item.source !== "agent_signal" || item.sample || record.sourceId !== item.sourceId ||
    item.key !== `agent_signal:${item.sourceId}` || !validId(confirmation.contactId) ||
    (item.taskId ?? null) !== confirmation.taskId ||
    (confirmation.taskId === null && item.contactId !== confirmation.contactId) ||
    (item.contactId && item.contactId !== confirmation.contactId)) return null;
  return { contactId: confirmation.contactId, taskId: confirmation.taskId };
}

export function todoHandoffTaskReceipt(payload: unknown, actorId: string, taskId: string, contactId: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  const task = readTaskListItems({ tasks: [row.task] }, actorId)?.[0];
  const activity = row.activity && typeof row.activity === "object" ? row.activity as Record<string, unknown> : null;
  const snapshot = activity?.taskSnapshot && typeof activity.taskSnapshot === "object"
    ? activity.taskSnapshot as Record<string, unknown> : null;
  return task?.id === taskId && task.status === "completed" && task.completedBy === actorId &&
    task.relatedContactId === contactId && activity?.type === "completed" && activity.taskId === taskId &&
    activity.accountId === actorId && activity.ownerUserId === actorId && snapshot?.relatedContactId === contactId;
}

export function todoEncounterReceipt(payload: unknown, contactId: string, observedAt: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  return typeof row.encounterId === "string" && row.encounterId.startsWith("encounter:") &&
    row.contactId === contactId && row.observedAt === observedAt && row.privacy === "private" && row.talked === "uncertain";
}
