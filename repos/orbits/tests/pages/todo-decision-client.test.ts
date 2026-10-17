import assert from "node:assert/strict";
import test from "node:test";
import { createTodoDecisionClient } from "../../app/(app)/app/orbit-2026/todo/todo-decision-client";

const decision = (source: "task_suggestion" | "agent_action" | "plan_pending" | "entity_draft" | "contact_draft") => ({ source, sourceId: "id:/+?", key: `${source}:id:/+?`, actions: ["accept", "dismiss", "snooze", "open"] as const });

test("task suggestion decisions call only their native endpoint and require a matching authoritative receipt", async () => {
  const requests: { url: string; body: Record<string, string> }[] = [];
  const client = createTodoDecisionClient(async (url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(url), body });
    const action = String(url).split("/").at(-1);
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    return Response.json({ success: true, data: { suggestion: { id: "id:/+?", status: action === "accept" ? "accepted" : action === "dismiss" ? "dismissed" : "snoozed", ...(action === "snooze" ? { nextVisibleAt: body.nextVisibleAt } : {}), ...(action === "accept" ? { acceptedTaskId: "new-task" } : {}) }, ...(action === "accept" ? { task: { id: "new-task" } } : {}) } });
  });
  await client.decide(decision("task_suggestion"), "accept");
  await client.decide(decision("task_suggestion"), "dismiss");
  await client.decide(decision("task_suggestion"), "snooze", { nextVisibleAt: "2099-01-01T00:00:00Z" });
  assert.deepEqual(requests.map(request => request.url), ["/api/task-suggestions/id%3A%2F%2B%3F/accept", "/api/task-suggestions/id%3A%2F%2B%3F/dismiss", "/api/task-suggestions/id%3A%2F%2B%3F/snooze"]);
  assert.ok(requests.every(request => request.body.idempotencyKey?.startsWith("web:todo:")));
  assert.equal(requests[2].body.nextVisibleAt, "2099-01-01T00:00:00Z");
});

test("Agent accept/reject use the queue boundary; later uses existing ledger defer without executing an outbox", async () => {
  const urls: string[] = [];
  const client = createTodoDecisionClient(async (url, init) => {
    urls.push(String(url));
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("transition")) {
      assert.deepEqual(body, { transition: "defer" });
      return Response.json({ success: true, data: { state: "success", transition: "defer", entry: { entryId: "id:/+?", status: "deferred" } } });
    }
    return Response.json({ success: true, data: { state: "success", actionId: "id:/+?", decision: String(url).endsWith("accept") ? "accepted" : "dismissed" } });
  });
  await client.decide(decision("agent_action"), "accept");
  await client.decide(decision("agent_action"), "dismiss");
  await client.decide(decision("agent_action"), "snooze");
  assert.deepEqual(urls, ["/api/agent/actions/id%3A%2F%2B%3F/accept", "/api/agent/actions/id%3A%2F%2B%3F/dismiss", "/api/agent/ledger/id%3A%2F%2B%3F/transition"]);
});

test("plan pending writes remain native and opaque IDs are never interpreted as another route", async () => {
  const requests: string[] = [];
  const client = createTodoDecisionClient(async (url, init) => {
    requests.push(String(url));
    assert.deepEqual(Object.keys(JSON.parse(String(init?.body))), ["idempotencyKey"]);
    return Response.json({ success: true, data: { id: "id:/+?", status: String(url).endsWith("accept") ? "accepted" : "dismissed", replayed: false } });
  });
  await client.decide(decision("plan_pending"), "accept");
  await client.decide(decision("plan_pending"), "dismiss");
  assert.deepEqual(requests, ["/api/agent/plans/v2/pending/id%3A%2F%2B%3F/accept", "/api/agent/plans/v2/pending/id%3A%2F%2B%3F/dismiss"]);
});

test("read-only, sample, unadvertised and unsupported decisions fail before any request", async () => {
  let requests = 0;
  const client = createTodoDecisionClient(async () => { requests++; throw Error("must not write"); });
  for (const item of [decision("entity_draft"), decision("contact_draft"), { ...decision("task_suggestion"), sample: true as const }, { ...decision("task_suggestion"), actions: ["open"] as const }]) {
    await assert.rejects(client.decide(item, "accept"), { code: "TODO_ACTION_UNAVAILABLE" });
  }
  await assert.rejects(client.decide(decision("plan_pending"), "snooze"), { code: "TODO_ACTION_UNAVAILABLE" });
  await assert.rejects(client.decide(decision("task_suggestion"), "snooze"), { code: "TODO_SNOOZE_TIME_INVALID" });
  assert.equal(requests, 0);
});

test("ambiguous retries reuse idempotency and wrong-source receipts never become a successful UI decision", async () => {
  const keys: string[] = [];
  let mode = "network";
  const client = createTodoDecisionClient(async (_url, init) => {
    keys.push(JSON.parse(String(init?.body)).idempotencyKey);
    if (mode === "network") throw Error("offline");
    return Response.json({ success: true, data: { id: mode === "wrong" ? "other" : "id:/+?", status: "accepted", replayed: false } });
  });
  await assert.rejects(client.decide(decision("plan_pending"), "accept"), { code: "NETWORK_ERROR" });
  mode = "wrong";
  await assert.rejects(client.decide(decision("plan_pending"), "accept"), { code: "INVALID_RESPONSE" });
  mode = "ok";
  await client.decide(decision("plan_pending"), "accept");
  assert.equal(new Set(keys).size, 1);
  await client.decide(decision("plan_pending"), "accept");
  assert.notEqual(keys[3], keys[2], "a new successful intent releases the prior key");
});
