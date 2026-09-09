import assert from "node:assert/strict";
import test from "node:test";
import type { RelationshipConnectionAggregate } from "../../features/connections/lifecycle/contract";
import { createMemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import { applyRelationshipStageCommand } from "../../features/connections/lifecycle/transition";

const now = "2026-08-21T01:00:00.000Z";
const connection: RelationshipConnectionAggregate = {
  actorId: "actor:a", connectionId: "connection:a", contactId: "contact:a", activeGoal: "目标",
  stage: "active", version: 3, createdAt: now, updatedAt: now,
};
const contact = { actorId: connection.actorId, contactId: connection.contactId };
const command = {
  actorId: connection.actorId, connectionId: connection.connectionId, expectedVersion: 3,
  idempotencyKey: "key:1", stage: "needs_follow_up" as const,
  nextTask: { taskId: "task:1", title: "联系 Mina", dueAt: "2026-08-25T01:00:00.000Z" },
};
const input = {
  actorId: connection.actorId, connectionId: connection.connectionId, expectedVersion: 3,
  idempotencyKey: "key:1", command: "change_stage" as const, requestHash: "hash:1",
};
function repository() {
  return createMemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [contact] });
}

test("memory reads are actor scoped and isolate seed and returned objects", async () => {
  const seed = structuredClone({ connections: [connection], contacts: [contact] });
  const repo = createMemoryRelationshipLifecycleRepository(seed);
  seed.connections[0].activeGoal = "mutated seed";
  assert.equal(await repo.read("actor:b", connection.connectionId), null);
  const first = await repo.read(connection.actorId, connection.connectionId);
  assert.equal(first?.connection.activeGoal, "目标");
  first!.connection.activeGoal = "mutated read";
  assert.equal((await repo.read(connection.actorId, connection.connectionId))?.connection.activeGoal, "目标");
});

test("memory requires the referenced contact to belong to the actor", async () => {
  const repo = createMemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [{ ...contact, actorId: "actor:b" }] });
  await assert.rejects(repo.read(connection.actorId, connection.connectionId), { code: "FORBIDDEN" });
  await assert.rejects(repo.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now })), { code: "FORBIDDEN" });
  assert.deepEqual(repo.audits(connection.actorId), []);
  assert.deepEqual(repo.tasksForActor(connection.actorId), []);
});

test("memory commits connection, task, audit, and exact replay snapshot together", async () => {
  const repo = repository();
  const first = await repo.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(first.replayed, false);
  assert.equal(first.snapshot.connection.stage, "needs_follow_up");
  assert.equal(first.snapshot.connection.version, 4);
  assert.equal(first.snapshot.tasks[0].taskId, "task:1");
  assert.equal(repo.audits(connection.actorId).length, 1);
  assert.equal(repo.tasksForActor(connection.actorId).length, 1);
  const originalSnapshot = structuredClone(first.snapshot);
  first.snapshot.connection.stage = "archived";
  first.snapshot.tasks[0].title = "changed client response";
  const replay = await repo.mutate(input, () => { throw new Error("replay must not invoke operation"); });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, originalSnapshot);
  assert.deepEqual(await repo.read(connection.actorId, connection.connectionId), originalSnapshot);
  assert.equal(repo.audits(connection.actorId).length, 1);
});

test("same key and different hash conflicts without writing", async () => {
  const repo = repository();
  await repo.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const before = await repo.read(connection.actorId, connection.connectionId);
  await assert.rejects(repo.mutate({ ...input, requestHash: "hash:changed" }, () => { throw new Error("must not run"); }), { code: "IDEMPOTENCY_CONFLICT" });
  assert.deepEqual(await repo.read(connection.actorId, connection.connectionId), before);
  assert.equal(repo.audits(connection.actorId).length, 1);
});

test("a thrown operation rolls back even mutations to its private snapshot and does not consume the key", async () => {
  const repo = repository();
  const failure = new Error("simulated mutation failure");
  await assert.rejects(repo.mutate(input, (snapshot) => {
    snapshot.connection.version = 99;
    snapshot.connection.stage = "archived";
    throw failure;
  }), (error) => error === failure);
  assert.deepEqual((await repo.read(connection.actorId, connection.connectionId))?.connection, connection);
  assert.deepEqual(repo.audits(connection.actorId), []);
  assert.deepEqual(repo.tasksForActor(connection.actorId), []);
  const retry = await repo.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(retry.replayed, false);
});

test("memory rejects stale versions and forged mutation identity before committing", async () => {
  const repo = repository();
  await assert.rejects(repo.mutate({ ...input, expectedVersion: 2 }, () => { throw new Error("must not run"); }), { code: "CONFLICT" });
  for (const change of [{ version: 5 }, { actorId: "actor:b" }, { contactId: "contact:b" }]) {
    await assert.rejects(repo.mutate(input, (snapshot) => {
      const plan = applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now });
      return { ...plan, connection: { ...plan.connection, ...change } };
    }));
  }
  assert.deepEqual((await repo.read(connection.actorId, connection.connectionId))?.connection, connection);
  assert.deepEqual(repo.audits(connection.actorId), []);
  assert.deepEqual(repo.tasksForActor(connection.actorId), []);
});

test("concurrent memory commands with the same version cannot both commit", async () => {
  const repo = repository();
  const results = await Promise.allSettled([1, 2].map((number) => repo.mutate(
    { ...input, idempotencyKey: `parallel:${number}` },
    (snapshot) => applyRelationshipStageCommand({ command: { ...command, idempotencyKey: `parallel:${number}` }, current: snapshot.connection, tasks: snapshot.tasks, now }),
  )));
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const failed = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
  assert.equal(failed.reason.code, "CONFLICT");
  assert.equal(repo.audits(connection.actorId).length, 1);
});

test("a task id already used on another connection is never overwritten", async () => {
  const repo = createMemoryRelationshipLifecycleRepository({
    connections: [connection], contacts: [contact],
    tasks: [{ actorId: connection.actorId, connectionId: "connection:other", contactId: "contact:other", taskId: "task:1", title: "other task", dueAt: now, purpose: "maintenance", status: "open", createdAt: now, updatedAt: now, version: 1 }],
  });
  await assert.rejects(repo.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now })), { code: "INVALID_TASK" });
  assert.equal(repo.tasksForActor(connection.actorId)[0].title, "other task");
  assert.equal((await repo.read(connection.actorId, connection.connectionId))?.connection.version, 3);
  assert.deepEqual(repo.audits(connection.actorId), []);
});

test("receipt and task identities cannot cross actor boundaries", async () => {
  const other = { ...connection, actorId: "actor:b", connectionId: "connection:b", contactId: "contact:b" };
  const repo = createMemoryRelationshipLifecycleRepository({ connections: [connection, other], contacts: [contact, { actorId: other.actorId, contactId: other.contactId }] });
  for (const current of [connection, other]) {
    const result = await repo.mutate({ ...input, actorId: current.actorId, connectionId: current.connectionId }, (snapshot) => applyRelationshipStageCommand({ command: { ...command, actorId: current.actorId, connectionId: current.connectionId }, current: snapshot.connection, tasks: snapshot.tasks, now }));
    assert.equal(result.replayed, false);
    assert.equal(result.snapshot.connection.actorId, current.actorId);
    assert.equal(repo.tasksForActor(current.actorId).length, 1);
    assert.equal(repo.audits(current.actorId).length, 1);
  }
});

test("a reentrant mutation cannot commit the same connection version twice", async () => {
  const repo = repository();
  let inner: Promise<unknown> | undefined;
  const outer = await repo.mutate(input, (snapshot) => {
    inner = repo.mutate({ ...input, idempotencyKey: "inner:1" }, (inside) => applyRelationshipStageCommand({
      command: { ...command, idempotencyKey: "inner:1", nextTask: { ...command.nextTask, taskId: "task:inner" } },
      current: inside.connection, tasks: inside.tasks, now,
    })).then(() => "committed", (error) => error.code);
    return applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now });
  });
  assert.equal(await inner, "CONFLICT");
  assert.equal(outer.snapshot.connection.version, 4);
  assert.equal(repo.audits(connection.actorId).length, 1);
  assert.deepEqual(repo.tasksForActor(connection.actorId).map(({ taskId }) => taskId), ["task:1"]);
});

test("the receipt retains the validated input even if the caller changes its object", async () => {
  const repo = repository();
  const callerInput = { ...input };
  const first = await repo.mutate(callerInput, (snapshot) => {
    callerInput.requestHash = "hash:mutated";
    return applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now });
  });
  const replay = await repo.mutate(input, () => { throw new Error("must replay"); });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal(repo.audits(connection.actorId).length, 1);
});
