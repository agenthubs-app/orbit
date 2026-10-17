import type { TodoNextMoveItem } from "../../api/contract/todo-page";

const PROMPT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_PROMPTS = 50;

export interface TodoHandoffRecord {
  sourceId: string;
  handedOffAt: string;
  confirmation?: {
    contactId: string;
    taskId: string | null;
    idempotencyKey: string;
    observedAt: string;
    taskCompleted: boolean;
  };
}

function time(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace(".000Z", "Z") ? parsed : null;
}

function eligible(item: TodoNextMoveItem): boolean {
  return item.source === "agent_signal" && !item.sample &&
    !!item.sourceId && item.key === `agent_signal:${item.sourceId}` &&
    Boolean(item.contactId || item.taskId);
}

export function todoHandoffStorageKey(actorId: string, serverUrl: string): string | null {
  const actor = actorId.trim();
  const server = serverUrl.trim().replace(/\/+$/u, "");
  return actor && server ? `orbit.todo.handoff.v1:${encodeURIComponent(server)}:${encodeURIComponent(actor)}` : null;
}

export function pendingTodoHandoff(
  records: readonly TodoHandoffRecord[], item: TodoNextMoveItem, now: string,
): TodoHandoffRecord | null {
  if (!eligible(item)) return null;
  const current = time(now);
  const record = records.find(candidate => candidate.sourceId === item.sourceId);
  const handedOff = record && time(record.handedOffAt);
  return current !== null && handedOff !== null && handedOff !== undefined &&
    current >= handedOff && (record?.confirmation || current - handedOff < PROMPT_LIFETIME_MS) ? record ?? null : null;
}

export function markTodoHandoff(
  records: readonly TodoHandoffRecord[], item: TodoNextMoveItem, now: string,
): TodoHandoffRecord[] {
  if (!eligible(item) || time(now) === null) return [...records];
  const existing = pendingTodoHandoff(records, item, now);
  if (existing) return [...records];
  const next: TodoHandoffRecord[] = [{ sourceId: item.sourceId, handedOffAt: now },
    ...records.filter(record => record.sourceId !== item.sourceId && pendingAge(record, now))];
  while (next.length > MAX_PROMPTS) {
    let removable = next.length - 1;
    while (removable >= 0 && next[removable]?.confirmation) removable--;
    if (removable < 0) return [...records];
    next.splice(removable, 1);
  }
  return next;
}

function pendingAge(record: TodoHandoffRecord, now: string): boolean {
  const current = time(now), handedOff = time(record.handedOffAt);
  return current !== null && handedOff !== null && current >= handedOff &&
    (Boolean(record.confirmation) || current - handedOff < PROMPT_LIFETIME_MS);
}

export function beginTodoHandoffConfirmation(
  records: readonly TodoHandoffRecord[], item: TodoNextMoveItem,
  input: { contactId: string; taskId: string | null; idempotencyKey: string; observedAt: string }, now: string,
): TodoHandoffRecord[] | null {
  const pending = pendingTodoHandoff(records, item, now);
  if (!pending || !input.contactId || !input.idempotencyKey || time(input.observedAt) === null ||
    (item.contactId && item.contactId !== input.contactId) ||
    (item.taskId ?? null) !== input.taskId) return null;
  if (pending.confirmation) return pending.confirmation.contactId === input.contactId &&
    pending.confirmation.taskId === input.taskId ? [...records] : null;
  return records.map(record => record.sourceId === item.sourceId ? { ...record,
    confirmation: { ...input, taskCompleted: false },
  } : record);
}

export function markTodoHandoffTaskCompleted(records: readonly TodoHandoffRecord[], sourceId: string): TodoHandoffRecord[] {
  return records.map(record => record.sourceId === sourceId && record.confirmation?.taskId
    ? { ...record, confirmation: { ...record.confirmation, taskCompleted: true } } : record);
}

export function clearTodoHandoff(records: readonly TodoHandoffRecord[], sourceId: string): TodoHandoffRecord[] {
  return records.filter(record => record.sourceId !== sourceId);
}

export function retryTodoHandoffItem(record: TodoHandoffRecord): TodoNextMoveItem | null {
  if (!record.confirmation || !record.sourceId || time(record.handedOffAt) === null) return null;
  return { key: `agent_signal:${record.sourceId}`, source: "agent_signal", sourceId: record.sourceId,
    titlePreview: "", createdAt: record.handedOffAt, draftAvailable: false,
    contactId: record.confirmation.contactId,
    ...(record.confirmation.taskId ? { taskId: record.confirmation.taskId } : {}),
  };
}

export function orphanedTodoHandoffs(
  records: readonly TodoHandoffRecord[], items: readonly TodoNextMoveItem[],
): TodoHandoffRecord[] {
  const visible = new Set(items.filter(item => item.source === "agent_signal" &&
    item.key === `agent_signal:${item.sourceId}`).map(item => item.sourceId));
  return records.filter(record => !visible.has(record.sourceId) && retryTodoHandoffItem(record));
}
