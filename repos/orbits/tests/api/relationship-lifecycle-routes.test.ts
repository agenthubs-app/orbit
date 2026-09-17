import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipLifecycleHandlers } from "../../app/api/connections/[id]/lifecycle/handler";
import { createMemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";

const now = "2026-09-16T00:00:00.000Z";
const context = { params: Promise.resolve({ id: "connection:one" }) };
function fixture(actorId: string | null = "owner") {
  const identity = { actorId: "owner", connectionId: "connection:one", contactId: "contact:one", createdAt: now, updatedAt: now, version: 1 };
  const repository = createMemoryRelationshipLifecycleRepository({
    contacts: [{ actorId: "owner", contactId: "contact:one" }],
    connections: [{ ...identity, stage: "needs_follow_up", activeGoal: null }],
    tasks: [{ ...identity, taskId: "task:one", title: "联系确认", dueAt: now, status: "open", purpose: "follow_up" }],
  });
  return { repository, handlers: createRelationshipLifecycleHandlers({ resolveActor: async () => actorId ? { id: actorId } : null, repository, service: createRelationshipLifecycleService(repository, () => now) }) };
}
function request(outcome: unknown, extra = {}) {
  return new Request("http://localhost/api/connections/connection:one/lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "task:one", expectedConnectionVersion: 1, expectedTaskVersion: 1, idempotencyKey: "intent:one", outcome, ...extra }) });
}
for (const outcome of [
  { kind: "next_task", nextTask: { taskId: "task:two", title: "下一次跟进", dueAt: "2026-10-01T00:00:00.000Z" } },
  { kind: "active", activeGoal: "推进合作" },
  { kind: "nurture", nextTask: { taskId: "task:two", title: "定期联系", dueAt: "2026-10-01T00:00:00.000Z" } },
  { kind: "archived", dismissTaskIds: [] },
]) test(`lifecycle HTTP ${outcome.kind}: atomic completion, replay, refresh and stale conflict`, async () => {
  const { handlers, repository } = fixture();
  const response = await handlers.POST(request(outcome), context);
  assert.equal(response.status, 200);
  const result = (await response.json()).data;
  assert.equal(result.snapshot.tasks.find((task: { taskId: string }) => task.taskId === "task:one").status, "completed");
  assert.equal(result.snapshot.connection.version, 2);
  assert.equal((await (await handlers.POST(request(outcome), context)).json()).data.replayed, true);
  assert.equal(repository.audits("owner").length, 1);
  const read = await handlers.GET(new Request("http://localhost"), context);
  assert.deepEqual((await read.json()).data.snapshot, result.snapshot);
  assert.equal((await handlers.POST(request(outcome, { idempotencyKey: "intent:stale" }), context)).status, 409);
  assert.equal((await handlers.POST(request({ kind: "active", activeGoal: "changed" }), context)).status, 409);
});
test("lifecycle HTTP denies missing/foreign actors and rejects identity injection before writes", async () => {
  for (const [actor, status] of [[null, 401], ["foreign", 404]] as const) {
    const { handlers } = fixture(actor);
    assert.equal((await handlers.GET(new Request("http://localhost"), context)).status, status);
    assert.equal((await handlers.POST(request({ kind: "active", activeGoal: "合作" }), context)).status, status);
  }
  const { handlers, repository } = fixture();
  for (const extra of [{ actorId: "foreign" }, { expectedTaskVersion: 0 }, { expectedConnectionVersion: 0 }]) {
    assert.equal((await handlers.POST(request({ kind: "active", activeGoal: "合作" }, extra), context)).status, 400);
  }
  assert.equal((await handlers.POST(request({ kind: "active", activeGoal: "" }), context)).status, 400);
  assert.equal(repository.audits("owner").length, 0);
});
