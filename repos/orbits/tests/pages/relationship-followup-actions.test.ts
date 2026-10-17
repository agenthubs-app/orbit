import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipFollowupActions } from "../../app/(app)/app/orbit-2026/todo/relationship-followup-actions";
import { createRelationshipFollowupClient } from "../../app/(app)/app/orbit-2026/todo/relationship-followup-client";
import { MemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import { createRelationshipLifecycleHandlers } from "../../app/api/connections/[id]/lifecycle/handler";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";

const at = "2026-10-18T00:00:00.000Z";
const connection = { actorId: "a", connectionId: "connection:1", contactId: "contact:1", stage: "needs_follow_up" as const, activeGoal: null, version: 1, createdAt: at, updatedAt: at };
const task = { actorId: "a", connectionId: connection.connectionId, contactId: connection.contactId, taskId: "task:1", title: "Follow up", status: "open" as const, purpose: "follow_up" as const, dueAt: at, version: 1, createdAt: at, updatedAt: at };
const mapping = { taskId: task.taskId, connectionId: connection.connectionId, contactId: connection.contactId };
const detail = { mapping, snapshot: { connection, tasks: [task] } };

function fixture(tasks = [task]) {
  const repository = new MemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [{ actorId: "a", contactId: connection.contactId }], tasks });
  const handlers = createRelationshipLifecycleHandlers({ resolveActor: async () => ({ id: "a" }), repository, service: createRelationshipLifecycleService(repository, () => at) });
  const calls: { path: string; method: string; body: any }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ path: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).endsWith("/resolve")) return Response.json({ success: true, data: mapping });
    const request = new Request(`https://orbit.local${url}`, init), context = { params: Promise.resolve({ id: connection.connectionId }) };
    return init?.method === "POST" ? handlers.POST(request, context) : handlers.GET(request, context);
  };
  return { repository, calls, fetcher };
}

test("exact follow-up completion uses native versions/outcome and independent resolver/readback", async () => {
  const { fetcher, calls, repository } = fixture();
  const before = await createRelationshipFollowupClient({ actorId: "a", fetch: fetcher }).read(task.taskId);
  const actions = createRelationshipFollowupActions({ actorId: "a", fetch: fetcher });
  const nextTask = { taskId: "task:next", title: "Next step", dueAt: "2026-10-22T00:00:00.000Z" };
  const after = await actions.complete(before, { kind: "next_task", nextTask });
  assert.equal(after.snapshot.tasks.find(row => row.taskId === task.taskId)?.status, "completed");
  assert.equal(after.snapshot.tasks.find(row => row.taskId === nextTask.taskId)?.title, nextTask.title);
  assert.equal(after.snapshot.connection.version, 2);
  assert.deepEqual(calls.map(call => call.method), ["GET", "GET", "POST", "GET", "GET"]);
  assert.equal(calls[2].body.expectedConnectionVersion, 1); assert.equal(calls[2].body.expectedTaskVersion, 1);
  assert.equal(calls[2].body.taskId, task.taskId); assert.equal(calls[2].body.actorId, undefined);
  assert.equal((await repository.read("a", connection.connectionId))?.tasks.filter(row => row.taskId === nextTask.taskId).length, 1);
});

test("lost completion response retries the same command and never completes a different open task", async () => {
  const { fetcher, calls, repository } = fixture([task, { ...task, taskId: "task:other", title: "Other follow-up" }]); let lost = true;
  const before = await createRelationshipFollowupClient({ actorId: "a", fetch: fetcher }).read(task.taskId);
  const actions = createRelationshipFollowupActions({ actorId: "a", fetch: async (url, init) => {
    const response = await fetcher(url, init);
    if (init?.method === "POST" && lost) { lost = false; throw Error("LOST_AFTER_COMMIT"); }
    return response;
  } });
  await assert.rejects(actions.complete(before, { kind: "active", activeGoal: "Discuss plans" }));
  const completed = await actions.complete(before, { kind: "active", activeGoal: "Discuss plans" });
  assert.equal(completed.snapshot.connection.stage, "active");
  const posts = calls.filter(call => call.method === "POST");
  assert.equal(posts.length, 2); assert.equal(posts[0].body.idempotencyKey, posts[1].body.idempotencyKey);
  assert.equal((await repository.read("a", connection.connectionId))?.connection.version, 2);
  assert.equal(completed.snapshot.tasks.find(row => row.taskId === "task:other")?.status, "open");
  assert.equal(completed.snapshot.tasks.find(row => row.taskId === "task:other")?.version, 1);
});

test("completion rejects inconsistent receipt or changed readback and aborts old scopes", async () => {
  for (const tamper of ["contact", "task", "goal", "readback", "abort"] as const) {
    const { fetcher } = fixture(), controller = new AbortController(); let privateRead = false;
    const actions = createRelationshipFollowupActions({ actorId: "a", fetch: async (url, init) => {
      const response = await fetcher(url, init); const body = await response.json();
      if (init?.method === "POST") {
        if (tamper === "contact") body.data.snapshot.connection.contactId = "other";
        if (tamper === "task") body.data.snapshot.tasks[0].status = "open";
        if (tamper === "goal") body.data.snapshot.connection.activeGoal = "Different";
        if (tamper === "abort") controller.abort();
      } else { privateRead = true; if (tamper === "readback" && body.data.snapshot) body.data.snapshot.connection.version = 99; }
      return Response.json(body);
    } });
    await assert.rejects(actions.complete(detail, { kind: "active", activeGoal: "Discuss plans" }, controller.signal));
    assert.equal(privateRead, tamper === "readback");
  }
});

test("encounter note is an independent private save; failure retains retry identity and never completes the task", async () => {
  const calls: { path: string; key: string | null; body: any }[] = []; let fail = true;
  const actions = createRelationshipFollowupActions({ actorId: "a", now: () => Date.parse(at), fetch: async (url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push({ path: String(url), key: new Headers(init?.headers).get("idempotency-key"), body });
    if (fail) return Response.json({ success: false }, { status: 503 });
    return Response.json({ success: true, data: { ...body, encounterId: "encounter:1", createdAt: at } });
  } });
  await assert.rejects(actions.saveNote(detail, "phone", "A private note")); fail = false;
  assert.deepEqual(await actions.saveNote(detail, "phone", "A private note"), { encounterId: "encounter:1", noteText: "A private note" });
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.path === "/api/encounters"));
  assert.equal(calls[0].key, calls[1].key); assert.equal(calls[0].body.observedAt, calls[1].body.observedAt);
  assert.equal(calls[0].body.privacy, "private"); assert.equal(calls[0].body.talked, "uncertain");
  assert.equal(calls[0].body.contactId, mapping.contactId); assert.equal(calls[0].body.connectionId, mapping.connectionId);
});

test("note rejects wrong identity/privacy/text receipts and malformed or foreign detail before request", async () => {
  for (const patch of [{ contactId: "other" }, { connectionId: "other" }, { privacy: "relationship_shared" }, { noteText: "Different" }]) {
    const actions = createRelationshipFollowupActions({ actorId: "a", now: () => Date.parse(at), fetch: async (_url, init) => Response.json({ success: true, data: { ...JSON.parse(String(init?.body)), encounterId: "encounter:1", ...patch } }) });
    await assert.rejects(actions.saveNote(detail, "email", "Private"));
  }
  let calls = 0;
  const foreign = createRelationshipFollowupActions({ actorId: "b", fetch: async () => { calls++; throw Error("MUST_NOT_FETCH"); } });
  await assert.rejects(foreign.saveNote(detail, "email", "Private"));
  await assert.rejects(foreign.complete(detail, { kind: "active", activeGoal: "Plans" }));
  assert.equal(calls, 0);
});
