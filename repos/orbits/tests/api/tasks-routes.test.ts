import assert from "node:assert/strict";
import test from "node:test";

import {
  createTaskCollectionHandlers,
} from "../../app/api/tasks/collection-handler";
import {
  createTaskDetailHandlers,
} from "../../app/api/tasks/[id]/handler";
import {
  createTaskActivitiesGetHandler,
} from "../../app/api/tasks/[id]/activities/handler";
import {
  createTaskHistoryGetHandler,
} from "../../app/api/tasks/history/handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const workspaceId = "workspace:task-routes";
const actorId = "account:xiaoyu";
const now = "2026-08-29T06:00:00.000Z";

function testDependencies(actor: string | null = actorId) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createTaskService({
    repository: createTaskRepository({ store, workspaceId }),
  });
  return {
    now: () => now,
    resolveActor: async () => (actor ? { id: actor, workspaceId } : null),
    service,
  };
}

async function responseData(response: Response) {
  return (await response.json()) as {
    success: boolean;
    data?: any;
    error?: { code?: string };
  };
}

test("authenticates before parsing a task mutation body", async () => {
  const handlers = createTaskCollectionHandlers(testDependencies(null));
  const response = await handlers.POST(
    new Request("https://orbit.local/api/tasks", {
      body: "{broken",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await responseData(response)).error?.code, "UNAUTHORIZED");
});

test("creates and lists canonical actor-owned tasks", async () => {
  const dependencies = testDependencies();
  const handlers = createTaskCollectionHandlers(dependencies);
  const createdResponse = await handlers.POST(
    new Request("https://orbit.local/api/tasks", {
      body: JSON.stringify({
        category: "work",
        idempotencyKey: "api:create:proposal",
        plannedDate: "2026-08-29",
        priority: "high",
        title: "完成企业 AI 提案",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(createdResponse.status, 201);
  assert.equal((await responseData(createdResponse)).data.task.accountId, actorId);

  const listResponse = await handlers.GET(
    new Request("https://orbit.local/api/tasks?status=open&category=work"),
  );
  const listed = await responseData(listResponse);
  assert.equal(listResponse.status, 200);
  assert.equal(listed.data.tasks.length, 1);
  assert.equal(listed.data.tasks[0].title, "完成企业 AI 提案");
});

test("rejects unknown create fields and invalid category values", async () => {
  const handlers = createTaskCollectionHandlers(testDependencies());
  for (const body of [
    {
      actorId: "account:other",
      category: "work",
      idempotencyKey: "api:create:forged",
      title: "伪造归属",
    },
    {
      category: "sales",
      idempotencyKey: "api:create:category",
      title: "错误分类",
    },
  ]) {
    const response = await handlers.POST(
      new Request("https://orbit.local/api/tasks", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    assert.equal(response.status, 400);
    assert.equal((await responseData(response)).error?.code, "VALIDATION_ERROR");
  }
});

test("updates, completes, exposes activity history, and reopens one task", async () => {
  const dependencies = testDependencies();
  const collection = createTaskCollectionHandlers(dependencies);
  const createdResponse = await collection.POST(
    new Request("https://orbit.local/api/tasks", {
      body: JSON.stringify({
        category: "relationship",
        idempotencyKey: "api:create:contact-sato",
        relatedContactId: "contact:sato",
        title: "联系佐藤确认会面",
      }),
      method: "POST",
    }),
  );
  const created = (await responseData(createdResponse)).data.task;
  const detail = createTaskDetailHandlers(dependencies);
  const context = { params: Promise.resolve({ id: created.id }) };

  const updateResponse = await detail.PATCH(
    new Request(`https://orbit.local/api/tasks/${created.id}`, {
      body: JSON.stringify({
        action: "update",
        expectedUpdatedAt: created.updatedAt,
        idempotencyKey: "api:update:contact-sato",
        patch: { title: "联系佐藤确认下周会面" },
      }),
      method: "PATCH",
    }),
    context,
  );
  assert.equal(updateResponse.status, 200);

  const completeResponse = await detail.PATCH(
    new Request(`https://orbit.local/api/tasks/${created.id}`, {
      body: JSON.stringify({
        action: "complete",
        idempotencyKey: "api:complete:contact-sato",
      }),
      method: "PATCH",
    }),
    context,
  );
  assert.equal(completeResponse.status, 200);
  assert.equal((await responseData(completeResponse)).data.task.status, "completed");

  const activities = createTaskActivitiesGetHandler(dependencies);
  const activityResponse = await activities(
    new Request(`https://orbit.local/api/tasks/${created.id}/activities`),
    context,
  );
  assert.deepEqual(
    (await responseData(activityResponse)).data.activities.map(
      (item: { type: string }) => item.type,
    ),
    ["created", "updated", "completed"],
  );

  const history = createTaskHistoryGetHandler(dependencies);
  const historyResponse = await history(
    new Request("https://orbit.local/api/tasks/history?category=relationship"),
  );
  assert.equal((await responseData(historyResponse)).data.activities.length, 3);

  const reopenResponse = await detail.PATCH(
    new Request(`https://orbit.local/api/tasks/${created.id}`, {
      body: JSON.stringify({
        action: "reopen",
        idempotencyKey: "api:reopen:contact-sato",
      }),
      method: "PATCH",
    }),
    context,
  );
  assert.equal((await responseData(reopenResponse)).data.task.status, "open");
});

test("maps stale updates to conflict and soft deletes with retained history", async () => {
  const dependencies = testDependencies();
  const collection = createTaskCollectionHandlers(dependencies);
  const createdResponse = await collection.POST(
    new Request("https://orbit.local/api/tasks", {
      body: JSON.stringify({
        category: "personal",
        idempotencyKey: "api:create:passport",
        title: "更新护照资料",
      }),
      method: "POST",
    }),
  );
  const created = (await responseData(createdResponse)).data.task;
  const detail = createTaskDetailHandlers(dependencies);
  const context = { params: Promise.resolve({ id: created.id }) };

  const stale = await detail.PATCH(
    new Request(`https://orbit.local/api/tasks/${created.id}`, {
      body: JSON.stringify({
        action: "update",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        idempotencyKey: "api:update:passport:stale",
        patch: { title: "过期修改" },
      }),
      method: "PATCH",
    }),
    context,
  );
  assert.equal(stale.status, 409);

  const deleted = await detail.DELETE(
    new Request(`https://orbit.local/api/tasks/${created.id}`, {
      body: JSON.stringify({ idempotencyKey: "api:delete:passport" }),
      method: "DELETE",
    }),
    context,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(
    (await responseData(await collection.GET(new Request("https://orbit.local/api/tasks"))))
      .data.tasks,
    [],
  );

  const history = createTaskHistoryGetHandler(dependencies);
  const historyResponse = await history(
    new Request("https://orbit.local/api/tasks/history"),
  );
  assert.deepEqual(
    (await responseData(historyResponse)).data.activities.map(
      (item: { type: string }) => item.type,
    ),
    ["created", "deleted"],
  );
});
