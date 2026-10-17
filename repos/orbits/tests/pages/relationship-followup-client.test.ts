import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipFollowupClient } from "../../app/(app)/app/orbit-2026/todo/relationship-followup-client";

const at = "2026-10-18T00:00:00.000Z";
const mapping = { taskId: "task:1", connectionId: "connection:1", contactId: "contact:1" };
const snapshot = { connection: { actorId: "a", connectionId: mapping.connectionId, contactId: mapping.contactId, stage: "needs_follow_up", activeGoal: null, version: 1, createdAt: at, updatedAt: at },
  tasks: [{ actorId: "a", connectionId: mapping.connectionId, contactId: mapping.contactId, taskId: mapping.taskId, title: "Follow up", status: "open", purpose: "follow_up", dueAt: at, version: 1, createdAt: at, updatedAt: at }] };

test("dot-segment task identifiers never become normalized resolver paths", async () => {
  let calls = 0;
  const client = createRelationshipFollowupClient({ fetch: async () => { calls++; throw Error("MUST_NOT_FETCH"); } });
  for (const id of [".", ".."]) await assert.rejects(client.read(id), /INVALID_RESPONSE/);
  assert.equal(calls, 0);
});

test("task-addressed detail resolves exact identity before reading existing lifecycle endpoint", async () => {
  const calls: string[] = [];
  const client = createRelationshipFollowupClient({ fetch: async (url, init) => {
    calls.push(String(url)); assert.equal(init?.cache, "no-store");
    return Response.json({ success: true, data: calls.length === 1 ? mapping : { snapshot } });
  } });
  assert.deepEqual(await client.read("task:1"), { mapping, snapshot });
  assert.deepEqual(calls, ["/api/relationship-tasks/task%3A1/resolve", "/api/connections/connection%3A1/lifecycle"]);
});

test("unverified mapping never reaches connection API; mismatched snapshot and legacy-only tasks are not actionable", async () => {
  let calls = 0;
  const client = createRelationshipFollowupClient({ fetch: async () => { calls++; return Response.json({ success: true, data: { ...mapping, taskId: "another" } }); } });
  await assert.rejects(client.read("task:1"), /INVALID_RESPONSE/); assert.equal(calls, 1);
  for (const changed of [{ ...snapshot, connection: { ...snapshot.connection, contactId: "different" } }, { ...snapshot, tasks: [] }, { ...snapshot, tasks: [{ ...snapshot.tasks[0], connectionId: "different" }] }]) {
    let step = 0;
    const changedClient = createRelationshipFollowupClient({ fetch: async () => Response.json({ success: true, data: step++ === 0 ? mapping : { snapshot: changed } }) });
    await assert.rejects(changedClient.read("task:1"), /INVALID_RESPONSE/);
  }
});

test("resolver missing/denied/unavailable never invents a connection or performs writes", async () => {
  for (const status of [401, 403, 404, 409, 503]) {
    let calls = 0;
    const client = createRelationshipFollowupClient({ fetch: async (_url, init) => { calls++; assert.equal(init?.method ?? "GET", "GET"); return Response.json({ success: false, error: { code: "PRIVATE_SQL" } }, { status }); } });
    await assert.rejects(client.read("task:1"), new RegExp(status === 401 || status === 403 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "UNAVAILABLE"));
    assert.equal(calls, 1);
  }
});

test("actor-bound detail rejects a mismatched actor and aborts before any late connection read", async () => {
  const wrongActor = createRelationshipFollowupClient({ actorId: "other", fetch: async url => Response.json({ success: true, data: String(url).endsWith("/resolve") ? mapping : { snapshot } }) });
  await assert.rejects(wrongActor.read("task:1"), /INVALID_RESPONSE/);
  const controller = new AbortController(); let calls = 0;
  const aborted = createRelationshipFollowupClient({ fetch: async (_url, init) => {
    calls++; assert.equal(init?.signal, controller.signal); assert.equal(init?.credentials, "same-origin");
    controller.abort(); return Response.json({ success: true, data: mapping });
  } });
  await assert.rejects(aborted.read("task:1", controller.signal), /ABORTED/);
  assert.equal(calls, 1);
});

test("oversized or malformed resolver envelopes fail before following any mapping", async () => {
  let calls = 0;
  const client = createRelationshipFollowupClient({ fetch: async () => { calls++; return new Response("x".repeat(1024 * 1024 + 1)); } });
  await assert.rejects(client.read("task:1"), /INVALID_RESPONSE/); assert.equal(calls, 1);
});
