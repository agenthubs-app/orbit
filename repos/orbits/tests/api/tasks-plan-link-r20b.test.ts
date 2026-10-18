import assert from "node:assert/strict";
import test from "node:test";

import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:r20b-task-plan";
const workspaceId = "workspace:r20b-task-plan";
const planLink = { planId: "plan:mine", typeItemId: "type:mine" };

function handlers() {
  let active = true;
  const service = createTaskService({
    repository: createTaskRepository({ store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId }),
    planLinkReader: { isActiveTypeLink: async ({ actorId: owner, planId, typeItemId }) =>
      active && owner === actorId && planId === planLink.planId && typeItemId === planLink.typeItemId },
  });
  const dependencies = { service, resolveActor: async () => ({ id: actorId, workspaceId }),
    now: () => "2026-10-18T08:00:00.000Z",
    conditionalRead: { workspaceId, client: { query: async () => ({ rows: [{ max_updated_at: "2026-10-18T08:00:00.000Z", count: "2" }] }) } as any } };
  return { collection: createTaskCollectionHandlers(dependencies), detail: createTaskDetailHandlers(dependencies), setActive: (value: boolean) => { active = value; } };
}

function post(body: unknown) {
  return new Request("https://orbit.local/api/tasks", { method: "POST", body: JSON.stringify(body) });
}

test("task HTTP writes a validated planLink, reads it, and accepts PATCH null to unlink", async () => {
  const { collection, detail, setActive } = handlers();
  const createdResponse = await collection.POST(post({ title: "会う準備", category: "relationship",
    idempotencyKey: "task-plan:create", planLink }));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as any).data.task;
  assert.deepEqual(created.planLink, planLink);
  assert.equal((await collection.POST(post({ title: "別件", category: "work",
    idempotencyKey: "task-plan:other" }))).status, 201);
  const linkedUrl = `https://orbit.local/api/tasks?planId=${encodeURIComponent(planLink.planId)}&typeItemId=${encodeURIComponent(planLink.typeItemId)}`;
  const linkedList = await collection.GET(new Request(linkedUrl));
  assert.deepEqual(((await linkedList.json()) as any).data.tasks.map((task: any) => task.id), [created.id]);
  assert.equal(linkedList.headers.get("etag"), null);
  setActive(false);
  const invalidated = await collection.GET(new Request(linkedUrl, { headers: { "if-none-match": "*" } }));
  assert.equal(invalidated.status, 200);
  assert.deepEqual(((await invalidated.json()) as any).data.tasks, []);
  setActive(true);
  assert.equal((await collection.GET(new Request("https://orbit.local/api/tasks?planId=plan%3Amine"))).status, 400);
  const context = { params: Promise.resolve({ id: created.id }) };
  const read = await detail.GET(new Request(`https://orbit.local/api/tasks/${created.id}`), context);
  assert.deepEqual(((await read.json()) as any).data.task.planLink, planLink);
  const updated = await detail.PATCH(new Request(`https://orbit.local/api/tasks/${created.id}`, {
    method: "PATCH", body: JSON.stringify({ action: "update", expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "task-plan:unlink", patch: { planLink: null } }),
  }), context);
  assert.equal(updated.status, 200);
  assert.equal(((await updated.json()) as any).data.task.planLink, undefined);
});

test.skip("general task list rechecks plan validity even when its task watermark is unchanged (plan-aware ETag pending)", async () => {
  const { collection, setActive } = handlers();
  const created = await collection.POST(post({ title: "会う準備", category: "relationship",
    idempotencyKey: "task-plan:general-list", planLink }));
  assert.equal(created.status, 201);

  const url = "https://orbit.local/api/tasks";
  const first = await collection.GET(new Request(url));
  assert.equal(first.status, 200);
  assert.deepEqual(((await first.json()) as any).data.tasks[0].planLink, planLink);
  const previousTag = first.headers.get("etag");
  assert.ok(previousTag, "the general task list keeps its conditional-read contract");

  setActive(false);
  const refreshed = await collection.GET(new Request(url, {
    headers: { "if-none-match": previousTag },
  }));
  assert.equal(refreshed.status, 200);
  assert.equal(((await refreshed.json()) as any).data.tasks[0].planLink, undefined);
});

test("task HTTP rejects malformed and foreign plan links before persistence", async () => {
  const { collection } = handlers();
  for (const [index, link] of [
    { planId: "plan:mine" },
    { planId: "plan:mine", typeItemId: "type:mine", actorId: "account:other" },
    { planId: "plan:foreign", typeItemId: "type:mine" },
  ].entries()) {
    const response = await collection.POST(post({ title: "偽リンク", category: "relationship",
      idempotencyKey: `task-plan:bad:${index}`, planLink: link }));
    assert.equal(response.status, 400);
  }
  const list = await collection.GET(new Request("https://orbit.local/api/tasks"));
  assert.deepEqual(((await list.json()) as any).data.tasks, []);
});

test("a task create with an explicit null planLink stores an ordinary unlinked task", async () => {
  const { collection } = handlers();
  const response = await collection.POST(post({ title: "普通任务", category: "work",
    idempotencyKey: "task-plan:null-create", planLink: null }));
  assert.equal(response.status, 201);
  assert.equal(((await response.json()) as any).data.task.planLink, undefined);
});
