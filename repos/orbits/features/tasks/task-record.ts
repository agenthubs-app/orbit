import type { LiveRecord } from "../../shared/storage/live-record-store";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  type TaskActivityDTO,
  type TaskActivityType,
  type TaskCategory,
  type TaskItemDTO,
  type TaskRecordPayload,
} from "./contract";

export const TASK_COLLECTION = "tasks";

const taskSources = new Set([
  "manual",
  "ai_confirmed",
  "contact",
  "event",
  "inbox",
]);
const priorities = new Set(["normal", "high"]);
const completionSources = new Set([
  "user",
  "agent_confirmed",
  "notification_action",
]);
const activityTypes = new Set<TaskActivityType>([
  "created",
  "updated",
  "rescheduled",
  "completed",
  "reopened",
  "cancelled",
  "deleted",
]);
const activityActorTypes = new Set([
  "user",
  "agent",
  "system",
  "notification_action",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isTaskCategory(value: unknown): value is TaskCategory {
  return TASK_CATEGORIES.includes(value as TaskCategory);
}

function readTask(value: unknown, actorId: string): TaskItemDTO | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = value.status;
  const completed = status === "completed";
  const hasValidCompletion =
    isIsoDateTime(value.completedAt) &&
    isNonEmptyString(value.completedBy) &&
    completionSources.has(String(value.completionSource));
  const hasNoCompletion =
    value.completedAt === undefined &&
    value.completedBy === undefined &&
    value.completionSource === undefined;

  if (
    !isNonEmptyString(value.id) ||
    value.accountId !== actorId ||
    value.ownerUserId !== actorId ||
    !isNonEmptyString(value.title) ||
    !TASK_STATUSES.includes(status as TaskItemDTO["status"]) ||
    !isTaskCategory(value.category) ||
    !priorities.has(String(value.priority)) ||
    !taskSources.has(String(value.source)) ||
    !isOptionalString(value.notes) ||
    (value.plannedDate !== undefined && !isLocalDate(value.plannedDate)) ||
    (value.dueAt !== undefined && !isIsoDateTime(value.dueAt)) ||
    !isOptionalString(value.relatedContactId) ||
    !isOptionalString(value.relatedEventId) ||
    !isOptionalString(value.relatedMeetingId) ||
    !isOptionalString(value.relatedConversationId) ||
    !isOptionalString(value.suggestionId) ||
    !isIsoDateTime(value.createdAt) ||
    !isIsoDateTime(value.updatedAt) ||
    (completed ? !hasValidCompletion : !hasNoCompletion)
  ) {
    return null;
  }

  return value as unknown as TaskItemDTO;
}

function readActivity(
  value: unknown,
  task: TaskItemDTO,
  actorId: string,
): TaskActivityDTO | null {
  if (!isRecord(value) || !isRecord(value.taskSnapshot)) {
    return null;
  }

  const snapshot = value.taskSnapshot;
  if (
    !isNonEmptyString(value.id) ||
    value.accountId !== actorId ||
    value.ownerUserId !== actorId ||
    value.taskId !== task.id ||
    !activityTypes.has(value.type as TaskActivityType) ||
    !activityActorTypes.has(String(value.actorType)) ||
    !isOptionalString(value.actorId) ||
    !isIsoDateTime(value.occurredAt) ||
    !isNonEmptyString(snapshot.title) ||
    !isTaskCategory(snapshot.category) ||
    !isOptionalString(snapshot.relatedContactId) ||
    !isOptionalString(snapshot.relatedEventId) ||
    (value.changes !== undefined && !isRecord(value.changes))
  ) {
    return null;
  }

  return value as unknown as TaskActivityDTO;
}

function readPayload(value: unknown, actorId: string): TaskRecordPayload | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.activities)) {
    return null;
  }

  const task = readTask(value.task, actorId);
  if (!task) {
    return null;
  }

  const activities: TaskActivityDTO[] = [];
  const activityIds = new Set<string>();
  let previousOccurredAt: string | null = null;

  for (const candidate of value.activities) {
    const parsed = readActivity(candidate, task, actorId);
    if (
      !parsed ||
      activityIds.has(parsed.id) ||
      (previousOccurredAt !== null && parsed.occurredAt < previousOccurredAt)
    ) {
      return null;
    }
    activities.push(parsed);
    activityIds.add(parsed.id);
    previousOccurredAt = parsed.occurredAt;
  }

  return { version: 1, task, activities };
}

function relationTarget(task: TaskItemDTO): {
  targetType: string;
  targetId: string;
} {
  if (task.relatedEventId) {
    return { targetType: "event", targetId: task.relatedEventId };
  }
  if (task.relatedMeetingId) {
    return { targetType: "meeting", targetId: task.relatedMeetingId };
  }
  if (task.relatedContactId) {
    return { targetType: "contact", targetId: task.relatedContactId };
  }
  if (task.relatedConversationId) {
    return {
      targetType: "conversation",
      targetId: task.relatedConversationId,
    };
  }
  return { targetType: "task", targetId: task.id };
}

function invalidPayloadReason(payload: TaskRecordPayload): string {
  const task = payload.task;
  if (task.status === "completed" && !task.completedAt) {
    return "completedAt is required for completed tasks";
  }
  if (task.status === "completed" && !task.completedBy) {
    return "completedBy is required for completed tasks";
  }
  if (task.status === "completed" && !task.completionSource) {
    return "completionSource is required for completed tasks";
  }
  for (let index = 1; index < payload.activities.length; index += 1) {
    if (payload.activities[index].occurredAt < payload.activities[index - 1].occurredAt) {
      return "activity order must be append-only";
    }
  }
  return "task payload is invalid";
}

function livePayload(payload: TaskRecordPayload): Record<string, unknown> {
  return {
    version: payload.version,
    task: { ...payload.task },
    activities: payload.activities.map((item) => ({ ...item })),
  };
}

export function taskLiveRecordFromPayload(input: {
  workspaceId: string;
  payload: TaskRecordPayload;
}): LiveRecord<Record<string, unknown>> {
  const actorId = input.payload.task.ownerUserId;
  const validated = readPayload(input.payload, actorId);
  if (!validated || validated.task.accountId !== actorId) {
    throw new Error(invalidPayloadReason(input.payload));
  }

  const task = validated.task;
  const target = relationTarget(task);
  return {
    workspaceId: input.workspaceId,
    collectionName: TASK_COLLECTION,
    recordId: task.id,
    userId: actorId,
    sourceType: task.source,
    sourceId: task.id,
    sourceLabel: "Orbit task",
    evidenceIds: [],
    targetType: target.targetType,
    targetId: target.targetId,
    occurredAt: task.updatedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    lifecycleState: "active",
    searchText: [task.title, task.notes].filter(Boolean).join(" "),
    payload: livePayload(validated),
  };
}

export function taskRecordFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): TaskRecordPayload | null {
  if (
    record.collectionName !== TASK_COLLECTION ||
    record.lifecycleState === "deleted" ||
    record.userId !== actorId
  ) {
    return null;
  }

  const payload = readPayload(record.payload, actorId);
  if (!payload || payload.task.id !== record.recordId) {
    return null;
  }
  return payload;
}
