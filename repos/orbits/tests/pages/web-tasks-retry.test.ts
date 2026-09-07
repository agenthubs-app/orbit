import assert from "node:assert/strict";
import test from "node:test";
import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createTasksClient, tasksErrorMessage } from "../../app/(app)/app/tasks/tasks-client";
import { toReminderAlerts } from "../../app/(app)/app/inbox/inbox-panel-view-model";

test("retry after a committed task response is lost does not create a duplicate", async () => {
  const service = createTaskService({ repository: createTaskRepository({ store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: "retry-test" }) });
  const handler = createTaskCollectionHandlers({ service, resolveActor: async () => ({ id: "test" }), now: () => "2026-09-07T00:00:00Z" });
  let drop = true;
  const client = createTasksClient(async (path, init) => {
    const request = new Request(new URL(String(path), "https://orbit.test"), init);
    const result = await handler[request.method](request);
    if (drop) { drop = false; throw new TypeError("response lost after commit"); }
    return result;
  });
  await assert.rejects(client.create("整理会议记录"));
  await client.create("整理会议记录");
  assert.equal((await client.loadList("open")).length, 1);
  await client.create("整理会议记录");
  assert.equal((await client.loadList("open")).length, 2, "new intentional creation gets a new key");
});

test("one-hour reminder retry preserves both its time and idempotency key", async () => {
  const bodies: any[] = [];
  const client = createTasksClient(async (_path, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) throw new TypeError("response lost");
    return Response.json({ success: true, data: {} });
  });
  const task = { id: "task:1", title: "资料", notes: "", status: "open" as const, category: "work" as const, priority: "normal" as const, updatedAt: "2026-09-07T00:00:00Z", href: "/app/tasks/task%3A1" };
  await assert.rejects(client.addReminder(task));
  await client.addReminder(task);
  assert.deepEqual(bodies[0], bodies[1]);
  await client.addReminder(task);
  assert.notEqual(bodies[1].idempotencyKey, bodies[2].idempotencyKey);
});

test("canonical App task links open Web task details without changing legacy reminder links", () => {
  const hrefs = ["/tasks/task%3Aone%2Ftwo", "/app/contacts/person", "https://evil.test", "/tasks/../settings"];
  const alerts = toReminderAlerts({ reminders: hrefs.map((href, index) => ({ reminderId: String(index), title: "待办提醒", contactName: "待办提醒", organization: "Orbit", dueAt: "2026-09-07T00:00:00Z", recommendedWindow: "2026-09-07T00:00:00Z", priority: "normal", href })) } as any);
  assert.deepEqual(alerts.map((alert) => alert.href), ["/app/tasks/task%3Aone%2Ftwo", "/app/contacts/person", "/app/followups", "/app/followups"]);
});

test("an expired uncertain reminder offers an explicit recovery instead of an unusable time picker", async (t) => {
  let now = Date.parse("2026-09-07T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const client = createTasksClient(async () => { throw new TypeError("offline"); });
  const task = { id: "task:1", title: "资料", notes: "", status: "open" as const, category: "work" as const, priority: "normal" as const, updatedAt: "2026-09-07T00:00:00Z", href: "/app/tasks/task%3A1" };
  await assert.rejects(client.addReminder(task));
  now += 2 * 60 * 60 * 1000;
  await assert.rejects(client.addReminder(task), (error: unknown) => {
    assert.match(tasksErrorMessage(error, false), /返回列表.*重新打开/);
    return true;
  });
});
