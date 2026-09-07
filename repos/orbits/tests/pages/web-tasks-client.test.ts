import assert from "node:assert/strict";
import test from "node:test";

import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";
import { createTaskActivitiesGetHandler } from "../../app/api/tasks/[id]/activities/handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createTasksClient } from "../../app/(app)/app/tasks/tasks-client";

function taskHarness() {
  const service = createTaskService({ repository: createTaskRepository({
    store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: "web-task-test",
  }) });
  let actorId = "account:web-tasks";
  let now = "2026-09-07T01:00:00.000Z";
  const deps = { service, now: () => now, resolveActor: async () => ({ id: actorId }) };
  const collection = createTaskCollectionHandlers(deps);
  const detail = createTaskDetailHandlers(deps);
  const activities = createTaskActivitiesGetHandler(deps);
  const requests: Request[] = [];
  const fetcher = (async (path: string, init?: RequestInit) => {
    const request = new Request(new URL(path, "https://orbit.test"), init);
    requests.push(request.clone());
    const segments = new URL(request.url).pathname.split("/");
    if (!segments[3]) return collection[request.method](request);
    const context = { params: Promise.resolve({ id: decodeURIComponent(segments[3]) }) };
    return segments[4] === "activities" ? activities(request, context) : detail[request.method](request, context);
  }) as typeof fetch;
  return { client: createTasksClient(fetcher), requests, setActor: (id: string) => { actorId = id; }, tick: () => { now = "2026-09-07T02:00:00.000Z"; } };
}

test("Web-created tasks can be read, completed and reopened through the canonical API", async () => {
  const { client, requests } = taskHarness();
  const task = await client.create("  准备访谈提纲  ");
  assert.equal(task.title, "准备访谈提纲");
  assert.equal(task.status, "open");
  assert.equal((await client.loadList("open"))[0].id, task.id);
  assert.equal((await client.loadTask(task.id)).id, task.id);
  await client.setCompleted(task.id, true);
  assert.deepEqual(await client.loadList("open"), []);
  assert.equal((await client.loadList("completed"))[0].id, task.id);
  await client.setCompleted(task.id, false);
  assert.equal((await client.loadList("open"))[0].id, task.id);
  const created = await requests[0].clone().json();
  assert.match(created.plannedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(created.category, "other");
  const keys = await Promise.all(requests.filter((request) => request.method !== "GET").map(async (request) => (await request.json()).idempotencyKey));
  assert.equal(new Set(keys).size, keys.length, "distinct user mutations must not collide");
});

test("Web edits retain server conflict protection and deletion remains actor-scoped", async () => {
  const { client, tick, setActor } = taskHarness();
  const original = await client.create("准备会面");
  tick();
  const updated = await client.update(original, "准备采访", "带上问题清单");
  assert.equal(updated.notes, "带上问题清单");
  assert.equal(updated.title, "准备采访");
  await assert.rejects(client.update(original, "过期修改", "旧备注"), (error: any) => error.code === "CONFLICT");
  assert.ok((await client.loadActivities(original.id)).some((item) => item.type === "updated"));
  setActor("account:other");
  await assert.rejects(client.loadTask(original.id), (error: any) => error.code === "NOT_FOUND");
  setActor("account:web-tasks");
  await client.remove(original.id);
  assert.deepEqual(await client.loadList("open"), []);
});

test("invalid input and unsupported note clearing never pretend to save", async () => {
  const { client, requests } = taskHarness();
  await assert.rejects(client.create("   "));
  assert.equal(requests.length, 0);
  const task = await client.create("资料");
  const updated = await client.update(task, "资料", "已有备注");
  const count = requests.length;
  await assert.rejects(client.update(updated, "资料", ""), (error: any) => error.code === "NOTES_CLEAR_UNSUPPORTED");
  assert.equal(requests.length, count);
});

test("malformed envelopes and task records fail visibly instead of becoming empty lists", async () => {
  for (const data of [{ tasks: [{ id: "x", title: "invalid" }] }, { other: [] }]) {
    const client = createTasksClient(async () => Response.json({ success: true, data }));
    await assert.rejects(client.loadList("open"), (error: any) => error.code === "INVALID_RESPONSE");
  }
  const unauthorized = createTasksClient(async () => Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Sign in" } }, { status: 401 }));
  await assert.rejects(unauthorized.loadList("open"), (error: any) => error.code === "UNAUTHORIZED");
  const offline = createTasksClient(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(offline.loadList("open"), (error: any) => error.code === "NETWORK_ERROR");
});
