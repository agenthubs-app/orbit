import { isConnectionStage, isSourceType } from "../../../shared/domain/source-types";
import {
  RelationshipLifecycleError,
  type RelationshipConnectionAggregate,
  type RelationshipLifecycleErrorCode,
  type RelationshipLifecycleMutationPlan,
  type RelationshipLifecycleTask,
  type RelationshipNextTask,
  type RelationshipStageCommand,
  type RelationshipTaskCompletionCommand,
} from "./contract";

function requiredText(value: unknown, code: RelationshipLifecycleErrorCode): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RelationshipLifecycleError(code, "A nonempty value is required.");
  }
  return value.trim();
}

function identifier(value: unknown, code: RelationshipLifecycleErrorCode): string {
  const normalized = requiredText(value, code);
  if (normalized !== value || normalized.includes("\0")) {
    throw new RelationshipLifecycleError(code, "Invalid identifier.");
  }
  return normalized;
}

function instant(value: unknown, code: RelationshipLifecycleErrorCode): string {
  const text = requiredText(value, code);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (!match) throw new RelationshipLifecycleError(code, "A dated ISO instant is required.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const timestamp = Date.parse(text);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(timestamp)) {
    throw new RelationshipLifecycleError(code, "Invalid ISO instant.");
  }
  return new Date(timestamp).toISOString();
}

export { instant as normalizeRelationshipLifecycleInstant };

function checkVersion(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || !Number.isSafeInteger(actual) || actual < 1 || actual >= Number.MAX_SAFE_INTEGER || expected !== actual) {
    throw new RelationshipLifecycleError("CONFLICT", "The record version has changed or is invalid.");
  }
}

function isOpen(task: RelationshipLifecycleTask): boolean {
  return task.status === "open" || task.status === "scheduled";
}

function validateSnapshot(
  command: { actorId: string; connectionId: string; idempotencyKey: string },
  current: RelationshipConnectionAggregate,
  tasks: RelationshipLifecycleTask[],
  expectedVersion: number,
): void {
  identifier(command.actorId, "FORBIDDEN");
  identifier(command.connectionId, "NOT_FOUND");
  identifier(command.idempotencyKey, "INVALID_TRANSITION");
  if (current.actorId !== command.actorId) throw new RelationshipLifecycleError("FORBIDDEN", "Connection is not owned by the actor.");
  if (current.connectionId !== command.connectionId) throw new RelationshipLifecycleError("NOT_FOUND", "Connection not found.");
  identifier(current.contactId, "FORBIDDEN");
  checkVersion(expectedVersion, current.version);
  if (!isConnectionStage(current.stage)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Connection requires lifecycle migration.");
  const taskIds = new Set<string>();
  for (const task of tasks) {
    if (task.actorId !== command.actorId || task.connectionId !== current.connectionId || task.contactId !== current.contactId) {
      throw new RelationshipLifecycleError("FORBIDDEN", "Task ownership or relationship does not match.");
    }
    identifier(task.taskId, "INVALID_TASK");
    if (taskIds.has(task.taskId)) throw new RelationshipLifecycleError("INVALID_TASK", "Duplicate task identifier.");
    taskIds.add(task.taskId);
    if (!Number.isSafeInteger(task.version) || task.version < 1 || !["open", "scheduled", "completed", "dismissed"].includes(task.status) || !["follow_up", "maintenance"].includes(task.purpose)) {
      throw new RelationshipLifecycleError("INVALID_TASK", "Invalid relationship task.");
    }
  }
}

function createTask(
  nextTask: RelationshipNextTask,
  current: RelationshipConnectionAggregate,
  tasks: RelationshipLifecycleTask[],
  purpose: RelationshipLifecycleTask["purpose"],
  now: string,
): RelationshipLifecycleTask {
  const taskId = identifier(nextTask?.taskId, "INVALID_TASK");
  if (tasks.some((task) => task.taskId === taskId)) throw new RelationshipLifecycleError("INVALID_TASK", "Task identifier already exists.");
  return {
    actorId: current.actorId,
    connectionId: current.connectionId,
    contactId: current.contactId,
    taskId,
    title: requiredText(nextTask.title, "INVALID_TASK"),
    dueAt: instant(nextTask.dueAt, "INVALID_TASK"),
    purpose,
    status: "open",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyRelationshipStageCommand(input: {
  command: RelationshipStageCommand;
  current: RelationshipConnectionAggregate;
  tasks: RelationshipLifecycleTask[];
  now: string;
}): RelationshipLifecycleMutationPlan {
  const { command, current, tasks } = input;
  validateSnapshot(command, current, tasks, command.expectedVersion);
  const now = instant(input.now, "INVALID_TRANSITION");
  const upsertTasks: RelationshipLifecycleTask[] = [];
  const dismissTasks: RelationshipLifecycleTask[] = [];
  let activeGoal: string | null = null;
  switch (command.stage) {
    case "needs_follow_up":
    case "nurture":
      // Existing tasks are retained; only archival explicitly dismisses them.
      upsertTasks.push(createTask(command.nextTask, current, tasks, command.stage === "nurture" ? "maintenance" : "follow_up", now));
      break;
    case "active":
      activeGoal = requiredText(command.activeGoal, "INVALID_TRANSITION");
      break;
    case "archived": {
      const openTasks = tasks.filter(isOpen);
      if (!Array.isArray(command.dismissTaskIds) || command.dismissTaskIds.length !== openTasks.length || new Set(command.dismissTaskIds).size !== openTasks.length || openTasks.some((task) => !command.dismissTaskIds.includes(task.taskId))) {
        throw new RelationshipLifecycleError("INVALID_TASK", "Confirm dismissal of exactly the open relationship tasks.");
      }
      for (const task of openTasks) {
        checkVersion(task.version, task.version);
        dismissTasks.push({ ...task, status: "dismissed", version: task.version + 1, updatedAt: now });
      }
      break;
    }
    default:
      throw new RelationshipLifecycleError("INVALID_TRANSITION", "Unknown relationship stage.");
  }
  const source = command.source ?? { type: "manual" as const, id: command.idempotencyKey };
  if (!isSourceType(source.type)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Invalid command source.");
  const sourceId = identifier(source.id, "INVALID_TRANSITION");
  return {
    connection: { ...current, stage: command.stage, activeGoal, updatedAt: now, version: current.version + 1 },
    upsertTasks,
    dismissTasks,
    audit: {
      auditId: `lifecycle:${JSON.stringify([command.actorId, command.connectionId, command.idempotencyKey])}`,
      actorId: command.actorId,
      connectionId: current.connectionId,
      command: "change_stage",
      fromStage: current.stage,
      toStage: command.stage,
      taskIds: [...upsertTasks, ...dismissTasks].map((task) => task.taskId),
      source: { type: source.type, id: sourceId },
      occurredAt: now,
    },
  };
}

export function applyRelationshipTaskCompletion(input: {
  command: RelationshipTaskCompletionCommand;
  current: RelationshipConnectionAggregate;
  tasks: RelationshipLifecycleTask[];
  now: string;
}): RelationshipLifecycleMutationPlan {
  const { command, current, tasks } = input;
  validateSnapshot(command, current, tasks, command.expectedConnectionVersion);
  const task = tasks.find((candidate) => candidate.taskId === command.taskId);
  if (!task) throw new RelationshipLifecycleError("NOT_FOUND", "Task not found.");
  checkVersion(command.expectedTaskVersion, task.version);
  if (!isOpen(task)) throw new RelationshipLifecycleError("INVALID_TASK", "Task is already closed.");
  const now = instant(input.now, "INVALID_TRANSITION");
  const completed: RelationshipLifecycleTask = { ...task, status: "completed", version: task.version + 1, updatedAt: now };
  const identity = { actorId: command.actorId, connectionId: command.connectionId, idempotencyKey: command.idempotencyKey, source: command.source, expectedVersion: command.expectedConnectionVersion };
  const outcome = command.outcome;
  let stageCommand: RelationshipStageCommand;
  switch (outcome?.kind) {
    case "next_task":
      if (current.stage !== "needs_follow_up" && current.stage !== "nurture") {
        throw new RelationshipLifecycleError("INVALID_TRANSITION", "Choose an explicit relationship stage when closing this task.");
      }
      stageCommand = { ...identity, stage: current.stage, nextTask: outcome.nextTask };
      break;
    case "active":
      stageCommand = { ...identity, stage: "active", activeGoal: outcome.activeGoal };
      break;
    case "nurture":
      stageCommand = { ...identity, stage: "nurture", nextTask: outcome.nextTask };
      break;
    case "archived":
      stageCommand = { ...identity, stage: "archived", dismissTaskIds: outcome.dismissTaskIds, reason: outcome.reason };
      break;
    default:
      throw new RelationshipLifecycleError("INVALID_TRANSITION", "A task closing outcome is required.");
  }
  const plan = applyRelationshipStageCommand({ command: stageCommand, current, tasks: tasks.map((candidate) => candidate.taskId === task.taskId ? completed : candidate), now });
  return {
    ...plan,
    upsertTasks: [completed, ...plan.upsertTasks],
    audit: { ...plan.audit, command: "complete_task", taskIds: [completed.taskId, ...plan.audit.taskIds] },
  };
}
