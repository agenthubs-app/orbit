import assert from "node:assert/strict";
import test from "node:test";
import { createTasksClient } from "../../app/(app)/app/tasks/tasks-client";

test("To-do creation can explicitly use its selected local date rather than the legacy Tokyo default", async () => {
  let writes = 0;
  let request: { url: unknown; body: Record<string, string> };
  const client = createTasksClient(async (url, init) => {
    writes++;
    const body = JSON.parse(String(init?.body));
    request = { url, body };
    return Response.json({ success: true, data: { task: { id: "t1", title: "Call back", plannedDate: "2026-12-31", status: "open", category: "other", priority: "normal", updatedAt: "2026-10-18T00:00:00Z" } } });
  });
  const task = await client.create(" Call back ", "2026-12-31");
  assert.equal(request!.url, "/api/tasks");
  assert.equal(request!.body.plannedDate, "2026-12-31");
  assert.equal(request!.body.title, "Call back");
  assert.equal(request!.body.category, "other");
  assert.equal(task.plannedDate, "2026-12-31");
  await assert.rejects(client.create("Invalid", "2026-02-30"), { code: "INVALID_DATE" });
  assert.equal(writes, 1);
});

test("a create receipt with a different local date cannot close the To-do draft as saved", async () => {
  const client = createTasksClient(async () => Response.json({ success: true, data: { task: { id: "t1", title: "Call back", plannedDate: "2027-01-01", status: "open", category: "other", priority: "normal", updatedAt: "2026-10-18T00:00:00Z" } } }));
  await assert.rejects(client.create("Call back", "2026-12-31"), { code: "INVALID_RESPONSE" });
});
