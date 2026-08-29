import assert from "node:assert/strict";
import test from "node:test";

import { createTaskRepository } from "../../features/tasks/repository";
import {
  createTaskService,
  TaskServiceError,
} from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const workspaceId = "workspace:tasks-service";
const actorId = "account:xiaoyu";
const now = "2026-08-29T02:00:00.000Z";

function serviceWithStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createTaskRepository({ store, workspaceId });
  return {
    repository,
    service: createTaskService({ repository }),
    store,
  };
}

async function createTask(
  service: ReturnType<typeof createTaskService>,
  overrides: Record<string, unknown> = {},
) {
  return service.create({
    actorId,
    title: "准备活动资料",
    category: "event",
    plannedDate: "2026-08-29",
    priority: "high",
    relatedEventId: "event:kansai-business",
    idempotencyKey: "create:event-materials",
    now,
    ...overrides,
  });
}

test("creates and lists a manual task only for its owning actor", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);

  assert.equal(created.task.source, "manual");
  assert.equal(created.task.status, "open");
  assert.equal(created.activity.type, "created");
  assert.deepEqual(await service.list({ actorId }), [created.task]);
  assert.deepEqual(await service.list({ actorId: "account:other" }), []);
});

test("replays an idempotent create without adding another record or activity", async () => {
  const { service, store } = serviceWithStore();
  const first = await createTask(service);
  const replay = await createTask(service);

  assert.deepEqual(replay, first);
  assert.equal(
    store.listRecords({ workspaceId, collectionName: "tasks" }).length,
    1,
  );
  assert.equal((await service.history({ actorId })).length, 1);
});

test("updates with optimistic concurrency and rejects a stale version", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);
  const updated = await service.update({
    actorId,
    taskId: created.task.id,
    expectedUpdatedAt: created.task.updatedAt,
    patch: { title: "准备活动资料与参会名单", category: "work" },
    idempotencyKey: "update:event-materials:v2",
    now: "2026-08-29T02:10:00.000Z",
  });

  assert.equal(updated.task.title, "准备活动资料与参会名单");
  assert.equal(updated.task.category, "work");
  assert.equal(updated.activity.type, "updated");

  await assert.rejects(
    service.update({
      actorId,
      taskId: created.task.id,
      expectedUpdatedAt: created.task.updatedAt,
      patch: { title: "过期写入" },
      idempotencyKey: "update:event-materials:stale",
      now: "2026-08-29T02:20:00.000Z",
    }),
    (error: unknown) =>
      error instanceof TaskServiceError && error.code === "TASK_VERSION_CONFLICT",
  );
});

test("completes idempotently and records one completion fact", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);
  const input = {
    actorId,
    taskId: created.task.id,
    completedBy: actorId,
    completionSource: "user" as const,
    idempotencyKey: "complete:event-materials",
    now: "2026-08-29T03:00:00.000Z",
  };

  const completed = await service.complete(input);
  const replay = await service.complete(input);
  const history = await service.history({ actorId });

  assert.equal(completed.task.status, "completed");
  assert.equal(completed.task.completedAt, input.now);
  assert.deepEqual(replay, completed);
  assert.equal(history.filter((item) => item.type === "completed").length, 1);
});

test("reopens a completed task without erasing its previous completion", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);
  await service.complete({
    actorId,
    taskId: created.task.id,
    completedBy: actorId,
    completionSource: "user",
    idempotencyKey: "complete:event-materials",
    now: "2026-08-29T03:00:00.000Z",
  });
  const reopened = await service.reopen({
    actorId,
    taskId: created.task.id,
    idempotencyKey: "reopen:event-materials",
    now: "2026-08-29T04:00:00.000Z",
  });

  assert.equal(reopened.task.status, "open");
  assert.equal(reopened.task.completedAt, undefined);
  assert.deepEqual(
    (await service.history({ actorId })).map((item) => item.type),
    ["created", "completed", "reopened"],
  );
});

test("cancels an open task without putting it in completed results", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);
  const cancelled = await service.cancel({
    actorId,
    taskId: created.task.id,
    idempotencyKey: "cancel:event-materials",
    now: "2026-08-29T03:00:00.000Z",
  });

  assert.equal(cancelled.task.status, "cancelled");
  assert.deepEqual(await service.list({ actorId, status: "completed" }), []);
});

test("soft deletes a task from normal reads while retaining its activity history", async () => {
  const { service } = serviceWithStore();
  const created = await createTask(service);
  const deleted = await service.delete({
    actorId,
    taskId: created.task.id,
    idempotencyKey: "delete:event-materials",
    now: "2026-08-29T05:00:00.000Z",
  });

  assert.equal(deleted.activity.type, "deleted");
  assert.deepEqual(await service.list({ actorId }), []);
  assert.deepEqual(
    (await service.history({ actorId })).map((item) => item.type),
    ["created", "deleted"],
  );
});

test("terminal task actions cancel future reminder plans exactly once", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createTaskRepository({ store, workspaceId });
  const calls: Array<{ actorId: string; taskId: string; reason: string }> = [];
  const service = createTaskService({
    repository,
    onTaskTerminated: async (input) => { calls.push(input); },
  });
  const completed = await createTask(service, { idempotencyKey: "create:complete-hook" });
  const cancelled = await createTask(service, { idempotencyKey: "create:cancel-hook" });
  const deleted = await createTask(service, { idempotencyKey: "create:delete-hook" });

  const completeInput = { actorId, taskId: completed.task.id, completedBy: actorId, completionSource: "user" as const, idempotencyKey: "complete:hook", now };
  await service.complete(completeInput);
  await service.complete(completeInput);
  await service.cancel({ actorId, taskId: cancelled.task.id, idempotencyKey: "cancel:hook", now });
  await service.delete({ actorId, taskId: deleted.task.id, idempotencyKey: "delete:hook", now });

  assert.deepEqual(calls, [
    { actorId, taskId: completed.task.id, reason: "completed" },
    { actorId, taskId: cancelled.task.id, reason: "cancelled" },
    { actorId, taskId: deleted.task.id, reason: "deleted" },
  ]);
});
