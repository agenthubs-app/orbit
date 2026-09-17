import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipInitializationHandlers } from "../../app/api/contacts/[id]/relationship-initialization/handler";
import { RelationshipLifecycleError } from "../../features/connections/lifecycle/contract";
import type { RelationshipInitializationService } from "../../features/connections/lifecycle/initialization";

const context = { params: Promise.resolve({ id: "contact:a" }) };
const body = { expectedRevision: "a".repeat(64), idempotencyKey: "init:1", choice: { stage: "active", activeGoal: "明确目标" } };
const request = (value: unknown) => new Request("https://test/api/contacts/contact:a/relationship-initialization", { method: "POST", body: JSON.stringify(value) });
test("initialization route denies unauthenticated calls before resolving private resources", async () => {
  const handlers = createRelationshipInitializationHandlers({ resolveActor: async () => null });
  assert.equal((await handlers.GET(request(body), context)).status, 401);
  assert.equal((await handlers.POST(request(body), context)).status, 401);
});
test("route takes actor from session only, rejects unknown actor/source/defaults, exposes no-store pending state", async () => {
  const calls: unknown[] = [];
  const service: RelationshipInitializationService = {
    async read(actor, contact) { calls.push([actor, contact]); return { state: "pending", revision: "b".repeat(64), connectionId: "connection:a" }; },
    async initialize(actor, contact, input) { calls.push([actor, contact, input]); throw new RelationshipLifecycleError("CONFLICT", "private internal details"); },
  };
  const handlers = createRelationshipInitializationHandlers({ resolveActor: async () => ({ id: "a" }), service });
  const response = await handlers.GET(request(body), context);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).data.state, "pending");
  for (const invalid of [{}, { ...body, actorId: "b" }, { ...body, choice: { stage: "active" } }, { ...body, source: "ai" }]) assert.equal((await handlers.POST(request(invalid), context)).status, 400);
  assert.equal(calls.length, 1);
  const conflict = await handlers.POST(request(body), context);
  assert.equal(conflict.status, 409); assert.ok(!(await conflict.text()).includes("private internal details"));
  assert.deepEqual(calls[1], ["a", "contact:a", body]);
});
test("owner mismatch is indistinguishable from missing contact", async () => {
  const handlers = createRelationshipInitializationHandlers({ resolveActor: async () => ({ id: "b" }), service: {
    async read() { throw new RelationshipLifecycleError("FORBIDDEN", "private person"); },
    async initialize() { throw new RelationshipLifecycleError("NOT_FOUND", "private person"); },
  } });
  assert.equal((await handlers.GET(request(body), context)).status, 404);
  assert.equal((await handlers.POST(request(body), context)).status, 404);
});
