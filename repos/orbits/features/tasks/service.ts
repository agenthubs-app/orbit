import { createHash } from "node:crypto";

import type {
  TaskActivityActorType,
  TaskActivityDTO,
  TaskActivityType,
  TaskCategory,
  TaskCompletionSource,
  TaskItemDTO,
  TaskPriority,
  TaskRecordPayload,
  TaskSource,
  TaskStatus,
} from "./contract";
import type { StoredTaskRecord, TaskRepository } from "./repository";

export type TaskServiceErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_VERSION_CONFLICT"
  | "TASK_INVALID_TRANSITION";

export class TaskServiceError extends Error {
  constructor(
    readonly code: TaskServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskServiceError";
  }
}

export interface TaskMutationResult {
  task: TaskItemDTO;
  activity: TaskActivityDTO;
}

export interface TaskCreateInput {
  actorId: string;
  title: string;
  notes?: string;
  location?: string;
  category: TaskCategory;
  plannedDate?: string;
  dueAt?: string;
  priority?: TaskPriority;
  source?: TaskSource;
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
  relatedConversationId?: string;
  suggestionId?: string;
  sourceNoteId?: string;
  sourceNoteVersion?: number;
  idempotencyKey: string;
  now: string;
}

export interface TaskUpdatePatch {
  title?: string;
  notes?: string;
  category?: TaskCategory;
  plannedDate?: string | null;
  dueAt?: string | null;
  location?: string | null;
  priority?: TaskPriority;
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
  relatedConversationId?: string;
}

export interface TaskService {
  get: (input: {
    actorId: string;
    taskId: string;
  }) => Promise<TaskItemDTO | null>;
  list: (input: {
    actorId: string;
    status?: TaskStatus;
    category?: TaskCategory;
  }) => Promise<readonly TaskItemDTO[]>;
  history: (input: {
    actorId: string;
    taskId?: string;
    from?: string;
    to?: string;
    category?: TaskCategory;
  }) => Promise<readonly TaskActivityDTO[]>;
  create: (input: TaskCreateInput) => Promise<TaskMutationResult>;
  update: (input: {
    actorId: string;
    taskId: string;
    expectedUpdatedAt: string;
    patch: TaskUpdatePatch;
    idempotencyKey: string;
    now: string;
  }) => Promise<TaskMutationResult>;
  complete: (input: {
    actorId: string;
    taskId: string;
    completedBy: string;
    completionSource: TaskCompletionSource;
    idempotencyKey: string;
    now: string;
  }) => Promise<TaskMutationResult>;
  reopen: (input: TaskTransitionInput) => Promise<TaskMutationResult>;
  cancel: (input: TaskTransitionInput) => Promise<TaskMutationResult>;
  delete: (input: TaskTransitionInput) => Promise<TaskMutationResult>;
}

interface TaskTransitionInput {
  actorId: string;
  taskId: string;
  idempotencyKey: string;
  now: string;
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 24)}`;
}

function taskActivity(input: {
  task: TaskItemDTO;
  type: TaskActivityType;
  actorType: TaskActivityActorType;
  actorId?: string;
  idempotencyKey: string;
  now: string;
  changes?: Readonly<Record<string, unknown>>;
}): TaskActivityDTO {
  return {
    id: stableId(
      "task-activity",
      input.task.ownerUserId,
      input.task.id,
      input.type,
      input.idempotencyKey,
    ),
    accountId: input.task.accountId,
    ownerUserId: input.task.ownerUserId,
    taskId: input.task.id,
    type: input.type,
    actorType: input.actorType,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    occurredAt: input.now,
    taskSnapshot: {
      title: input.task.title,
      category: input.task.category,
      ...(input.task.relatedContactId
        ? { relatedContactId: input.task.relatedContactId }
        : {}),
      ...(input.task.relatedEventId
        ? { relatedEventId: input.task.relatedEventId }
        : {}),
    },
    ...(input.changes ? { changes: input.changes } : {}),
  };
}

function replayFor(
  stored: StoredTaskRecord,
  type: TaskActivityType,
  actorId: string,
  idempotencyKey: string,
): TaskMutationResult | null {
  const id = stableId(
    "task-activity",
    actorId,
    stored.payload.task.id,
    type,
    idempotencyKey,
  );
  const activity = stored.payload.activities.find((item) => item.id === id);
  return activity ? { task: stored.payload.task, activity } : null;
}

function requireStored(
  stored: StoredTaskRecord | null,
  taskId: string,
): StoredTaskRecord {
  if (!stored) {
    throw new TaskServiceError("TASK_NOT_FOUND", `Task ${taskId} was not found`);
  }
  return stored;
}

function withoutCompletion(task: TaskItemDTO): TaskItemDTO {
  const {
    completedAt: _completedAt,
    completedBy: _completedBy,
    completionSource: _completionSource,
    ...openTask
  } = task;
  return openTask;
}

function payloadWithActivity(
  stored: StoredTaskRecord,
  task: TaskItemDTO,
  activity: TaskActivityDTO,
): TaskRecordPayload {
  return {
    version: 1,
    task,
    activities: [...stored.payload.activities, activity],
  };
}

function transitionActorType(
  source?: TaskCompletionSource,
): TaskActivityActorType {
  if (source === "agent_confirmed") {
    return "agent";
  }
  if (source === "notification_action") {
    return "notification_action";
  }
  return "user";
}

export function createTaskService(input: {
  repository: TaskRepository;
  insideMutation?: boolean;
  onTaskTerminated?: (input: {
    actorId: string;
    taskId: string;
    reason: "completed" | "cancelled" | "deleted";
  }) => Promise<void>;
}): TaskService {
  if (!input.insideMutation) {
    const read = createTaskService({ ...input, insideMutation: true });
    const run = async <K extends "create" | "update" | "complete" | "reopen" | "cancel" | "delete">(action: K, command: Parameters<TaskService[K]>[0]) => {
      let termination: Parameters<NonNullable<typeof input.onTaskTerminated>>[0] | undefined;
      const result = await input.repository.mutate(action, command, repository => {
        const service = createTaskService({ repository, insideMutation: true, onTaskTerminated: async value => { termination = value; } });
        return service[action](command as never);
      });
      if (termination) await input.onTaskTerminated?.(termination);
      return result;
    };
    return { get: read.get, list: read.list, history: read.history,
      create: command => run("create", command), update: command => run("update", command),
      complete: command => run("complete", command), reopen: command => run("reopen", command),
      cancel: command => run("cancel", command), delete: command => run("delete", command) };
  }
  return {
    async get(query) {
      const stored = await input.repository.get(query.actorId, query.taskId);
      return stored?.payload.task ?? null;
    },

    async list(query) {
      const records = await input.repository.list(query.actorId);
      return records
        .map((record) => record.payload.task)
        .filter(
          (task) =>
            (query.status === undefined || task.status === query.status) &&
            (query.category === undefined || task.category === query.category),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async history(query) {
      const records = query.taskId === undefined
        ? await input.repository.list(query.actorId, { includeDeleted: true })
        : await input.repository.get(query.actorId, query.taskId, { includeDeleted: true })
          .then(record => record ? [record] : []);
      return records
        .flatMap((record) => record.payload.activities)
        .filter(
          (activity) =>
            (query.category === undefined ||
              activity.taskSnapshot.category === query.category) &&
            (query.from === undefined || activity.occurredAt >= query.from) &&
            (query.to === undefined || activity.occurredAt <= query.to),
        )
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    },

    async create(createInput) {
      const taskId = stableId(
        "task",
        createInput.actorId,
        createInput.idempotencyKey,
      );
      const existing = await input.repository.get(createInput.actorId, taskId, {
        includeDeleted: true,
      });
      if (existing) {
        const replay = replayFor(
          existing,
          "created",
          createInput.actorId,
          createInput.idempotencyKey,
        );
        if (replay) {
          return replay;
        }
        throw new TaskServiceError(
          "TASK_VERSION_CONFLICT",
          "The idempotency key is already in use",
        );
      }

      const task: TaskItemDTO = {
        id: taskId,
        accountId: createInput.actorId,
        ownerUserId: createInput.actorId,
        title: createInput.title,
        ...(createInput.notes ? { notes: createInput.notes } : {}),
        ...(createInput.location ? { location: createInput.location } : {}),
        status: "open",
        category: createInput.category,
        ...(createInput.plannedDate
          ? { plannedDate: createInput.plannedDate }
          : {}),
        ...(createInput.dueAt ? { dueAt: createInput.dueAt } : {}),
        priority: createInput.priority ?? "normal",
        source: createInput.source ?? "manual",
        ...(createInput.relatedContactId
          ? { relatedContactId: createInput.relatedContactId }
          : {}),
        ...(createInput.relatedEventId
          ? { relatedEventId: createInput.relatedEventId }
          : {}),
        ...(createInput.relatedMeetingId
          ? { relatedMeetingId: createInput.relatedMeetingId }
          : {}),
        ...(createInput.relatedConversationId
          ? { relatedConversationId: createInput.relatedConversationId }
          : {}),
        ...(createInput.suggestionId
          ? { suggestionId: createInput.suggestionId }
          : {}),
        ...(createInput.sourceNoteId
          ? { sourceNoteId: createInput.sourceNoteId }
          : {}),
        ...(createInput.sourceNoteVersion !== undefined
          ? { sourceNoteVersion: createInput.sourceNoteVersion }
          : {}),
        createdAt: createInput.now,
        updatedAt: createInput.now,
      };
      const activity = taskActivity({
        task,
        type: "created",
        actorType: transitionActorType(
          createInput.source === "ai_confirmed" ? "agent_confirmed" : "user",
        ),
        actorId: createInput.actorId,
        idempotencyKey: createInput.idempotencyKey,
        now: createInput.now,
      });
      await input.repository.save({
        version: 1,
        task,
        activities: [activity],
      });
      return { task, activity };
    },

    async update(updateInput) {
      const stored = requireStored(
        await input.repository.get(updateInput.actorId, updateInput.taskId),
        updateInput.taskId,
      );
      const replay = replayFor(
        stored,
        "updated",
        updateInput.actorId,
        updateInput.idempotencyKey,
      );
      if (replay) {
        return replay;
      }
      if (stored.payload.task.updatedAt !== updateInput.expectedUpdatedAt) {
        throw new TaskServiceError(
          "TASK_VERSION_CONFLICT",
          "Task has changed since it was loaded",
        );
      }
      if (stored.payload.task.status === "cancelled") {
        throw new TaskServiceError(
          "TASK_INVALID_TRANSITION",
          "Cancelled tasks cannot be edited",
        );
      }

      const task: TaskItemDTO = {
        ...stored.payload.task,
        ...Object.fromEntries(Object.entries(updateInput.patch).filter(([, value]) => value !== null)),
        updatedAt: new Date(Math.max(Date.parse(updateInput.now), Date.parse(stored.payload.task.updatedAt) + 1)).toISOString(),
      };
      for (const field of ["plannedDate", "dueAt", "location"] as const) {
        if (updateInput.patch[field] === null) delete task[field];
      }
      const activity = taskActivity({
        task,
        type: "updated",
        actorType: "user",
        actorId: updateInput.actorId,
        idempotencyKey: updateInput.idempotencyKey,
        now: updateInput.now,
        changes: { ...updateInput.patch },
      });
      await input.repository.save(payloadWithActivity(stored, task, activity));
      return { task, activity };
    },

    async complete(completeInput) {
      const stored = requireStored(
        await input.repository.get(completeInput.actorId, completeInput.taskId),
        completeInput.taskId,
      );
      const replay = replayFor(
        stored,
        "completed",
        completeInput.actorId,
        completeInput.idempotencyKey,
      );
      if (replay) {
        return replay;
      }
      if (stored.payload.task.status === "completed") {
        const activity = [...stored.payload.activities]
          .reverse()
          .find((item) => item.type === "completed");
        if (activity) {
          return { task: stored.payload.task, activity };
        }
      }
      if (stored.payload.task.status !== "open") {
        throw new TaskServiceError(
          "TASK_INVALID_TRANSITION",
          "Only open tasks can be completed",
        );
      }

      const task: TaskItemDTO = {
        ...stored.payload.task,
        status: "completed",
        completedAt: completeInput.now,
        completedBy: completeInput.completedBy,
        completionSource: completeInput.completionSource,
        updatedAt: new Date(Math.max(Date.parse(completeInput.now), Date.parse(stored.payload.task.updatedAt) + 1)).toISOString(),
      };
      const activity = taskActivity({
        task,
        type: "completed",
        actorType: transitionActorType(completeInput.completionSource),
        actorId: completeInput.completedBy,
        idempotencyKey: completeInput.idempotencyKey,
        now: completeInput.now,
      });
      await input.repository.save(payloadWithActivity(stored, task, activity));
      await input.onTaskTerminated?.({
        actorId: completeInput.actorId,
        taskId: completeInput.taskId,
        reason: "completed",
      });
      return { task, activity };
    },

    async reopen(reopenInput) {
      const stored = requireStored(
        await input.repository.get(reopenInput.actorId, reopenInput.taskId),
        reopenInput.taskId,
      );
      const replay = replayFor(
        stored,
        "reopened",
        reopenInput.actorId,
        reopenInput.idempotencyKey,
      );
      if (replay) {
        return replay;
      }
      if (stored.payload.task.status !== "completed") {
        throw new TaskServiceError(
          "TASK_INVALID_TRANSITION",
          "Only completed tasks can be reopened",
        );
      }

      const task: TaskItemDTO = {
        ...withoutCompletion(stored.payload.task),
        status: "open",
        updatedAt: new Date(Math.max(Date.parse(reopenInput.now), Date.parse(stored.payload.task.updatedAt) + 1)).toISOString(),
      };
      const activity = taskActivity({
        task,
        type: "reopened",
        actorType: "user",
        actorId: reopenInput.actorId,
        idempotencyKey: reopenInput.idempotencyKey,
        now: reopenInput.now,
      });
      await input.repository.save(payloadWithActivity(stored, task, activity));
      return { task, activity };
    },

    async cancel(cancelInput) {
      const stored = requireStored(
        await input.repository.get(cancelInput.actorId, cancelInput.taskId),
        cancelInput.taskId,
      );
      const replay = replayFor(
        stored,
        "cancelled",
        cancelInput.actorId,
        cancelInput.idempotencyKey,
      );
      if (replay) {
        return replay;
      }
      if (stored.payload.task.status === "cancelled") {
        const activity = [...stored.payload.activities]
          .reverse()
          .find((item) => item.type === "cancelled");
        if (activity) {
          return { task: stored.payload.task, activity };
        }
      }

      const task: TaskItemDTO = {
        ...withoutCompletion(stored.payload.task),
        status: "cancelled",
        updatedAt: new Date(Math.max(Date.parse(cancelInput.now), Date.parse(stored.payload.task.updatedAt) + 1)).toISOString(),
      };
      const activity = taskActivity({
        task,
        type: "cancelled",
        actorType: "user",
        actorId: cancelInput.actorId,
        idempotencyKey: cancelInput.idempotencyKey,
        now: cancelInput.now,
      });
      await input.repository.save(payloadWithActivity(stored, task, activity));
      await input.onTaskTerminated?.({
        actorId: cancelInput.actorId,
        taskId: cancelInput.taskId,
        reason: "cancelled",
      });
      return { task, activity };
    },

    async delete(deleteInput) {
      const stored = requireStored(
        await input.repository.get(deleteInput.actorId, deleteInput.taskId, {
          includeDeleted: true,
        }),
        deleteInput.taskId,
      );
      const replay = replayFor(
        stored,
        "deleted",
        deleteInput.actorId,
        deleteInput.idempotencyKey,
      );
      if (replay) {
        return replay;
      }
      if (stored.deletedAt) {
        throw new TaskServiceError("TASK_NOT_FOUND", "Task was deleted");
      }

      const task: TaskItemDTO = {
        ...stored.payload.task,
        updatedAt: new Date(Math.max(Date.parse(deleteInput.now), Date.parse(stored.payload.task.updatedAt) + 1)).toISOString(),
      };
      const activity = taskActivity({
        task,
        type: "deleted",
        actorType: "user",
        actorId: deleteInput.actorId,
        idempotencyKey: deleteInput.idempotencyKey,
        now: deleteInput.now,
      });
      await input.repository.save(payloadWithActivity(stored, task, activity), {
        deletedAt: deleteInput.now,
      });
      await input.onTaskTerminated?.({
        actorId: deleteInput.actorId,
        taskId: deleteInput.taskId,
        reason: "deleted",
      });
      return { task, activity };
    },
  };
}
