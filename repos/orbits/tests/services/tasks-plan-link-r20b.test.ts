import assert from "node:assert/strict";
import test from "node:test";

import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService, TaskServiceError } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:plan-task-owner";
const planLink = { planId: "plan:mine", typeItemId: "type:mine" };
const now = "2026-10-18T08:00:00.000Z";

test("a plan-linked task persists, unlinks, and hides an invalidated link without losing the task", async () => {
  const repository = createTaskRepository({
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:r20b-plan-link",
  });
  let active = true;
  const service = createTaskService({
    repository,
    planLinkReader: {
      isActiveTypeLink: async ({ actorId: owner, planId, typeItemId }) =>
        active && owner === actorId && planId === planLink.planId && typeItemId === planLink.typeItemId,
    },
  });
  const created = await service.create({ actorId, title: "会う準備", category: "relationship", planLink,
    idempotencyKey: "plan-task:create", now });
  await service.create({ actorId, title: "別件", category: "work", idempotencyKey: "plan-task:other", now });
  assert.deepEqual(created.task.planLink, planLink);
  assert.deepEqual((await repository.get(actorId, created.task.id))?.payload.task.planLink, planLink);
  assert.deepEqual((await service.get({ actorId, taskId: created.task.id }))?.planLink, planLink);
  assert.deepEqual((await service.list({ actorId, planId: planLink.planId, typeItemId: planLink.typeItemId })).map((task) => task.id), [created.task.id]);

  active = false;
  assert.deepEqual((await service.create({ actorId, title: "会う準備", category: "relationship", planLink,
    idempotencyKey: "plan-task:create", now })).task.planLink, planLink);
  const hidden = await service.get({ actorId, taskId: created.task.id });
  assert.equal(hidden?.id, created.task.id);
  assert.equal(hidden?.planLink, undefined);
  assert.equal((await service.list({ actorId })).find((task) => task.id === created.task.id)?.planLink, undefined);
  assert.deepEqual(await service.list({ actorId, planId: planLink.planId, typeItemId: planLink.typeItemId }), []);
  assert.deepEqual((await repository.get(actorId, created.task.id))?.payload.task.planLink, planLink);

  const unlinked = await service.update({ actorId, taskId: created.task.id,
    expectedUpdatedAt: created.task.updatedAt, patch: { planLink: null },
    idempotencyKey: "plan-task:unlink", now: "2026-10-18T08:01:00.000Z" });
  assert.equal(unlinked.task.planLink, undefined);
  assert.equal((await repository.get(actorId, created.task.id))?.payload.task.planLink, undefined);
});

test("a task may link only to the actor's active plan and its own real type", async () => {
  const repository = createTaskRepository({
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:r20b-plan-link-deny",
  });
  const service = createTaskService({
    repository,
    planLinkReader: { isActiveTypeLink: async ({ actorId: owner, planId, typeItemId }) =>
      owner === actorId && planId === planLink.planId && typeItemId === planLink.typeItemId },
  });
  for (const [index, forged] of [
    { planId: "plan:other", typeItemId: planLink.typeItemId },
    { planId: planLink.planId, typeItemId: "type:other" },
    { ...planLink, actorId: "actor:other" },
  ].entries()) {
    await assert.rejects(service.create({ actorId, title: "偽リンク", category: "relationship", planLink: forged,
      idempotencyKey: `plan-task:forged:${index}`, now }),
    (error: unknown) => error instanceof TaskServiceError && error.code === "TASK_INVALID_PLAN_LINK");
  }
  assert.deepEqual(await service.list({ actorId }), []);
});
