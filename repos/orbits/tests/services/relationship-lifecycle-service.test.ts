import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { RelationshipLifecycleError, type RelationshipConnectionAggregate, type RelationshipStageCommand } from "../../features/connections/lifecycle/contract";
import { createMemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import type { RelationshipLifecycleMutationInput, RelationshipLifecycleRepository } from "../../features/connections/lifecycle/repository";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";
import { createConfiguredRelationshipLifecycleService } from "../../features/connections/lifecycle/service-factory";

const now = "2026-08-21T01:00:00.000Z";
const connection: RelationshipConnectionAggregate = { actorId: "actor:a", connectionId: "connection:a", contactId: "contact:a", stage: "active", activeGoal: "目标", version: 3, createdAt: now, updatedAt: now };
const command = { actorId: "actor:a", connectionId: "connection:a", expectedVersion: 3, idempotencyKey: "key:1", stage: "needs_follow_up" as const, nextTask: { taskId: "task:1", title: "联系 Mina", dueAt: "2026-08-25T01:00:00.000Z" } };
function setup() {
  const repository = createMemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [{ actorId: connection.actorId, contactId: connection.contactId }] });
  return { repository, service: createRelationshipLifecycleService(repository, () => now) };
}

test("service commits stage commands, exposes replay metadata and does not claim external side effects", async () => {
  const { service, repository } = setup();
  const result = await service.changeStage(command);
  assert.equal(result.snapshot.connection.stage, "needs_follow_up");
  assert.equal(result.snapshot.connection.version, 4);
  assert.equal(result.replayed, false);
  assert.equal(result.externalWriteExecuted, false);
  assert.equal(result.messageSent, false);
  assert.equal(result.aiProviderCalled, false);
  assert.deepEqual(await repository.read("actor:a", "connection:a"), result.snapshot);
  const replay = await service.changeStage(command);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, result.snapshot);
  assert.equal(repository.audits("actor:a").length, 1);
});

test("service rejects invalid identity and version before touching the repository", async () => {
  let calls = 0;
  const repository: RelationshipLifecycleRepository = {
    async read() { calls += 1; throw new Error("must not read"); },
    async mutate() { calls += 1; throw new Error("must not mutate"); },
  };
  const service = createRelationshipLifecycleService(repository, () => now);
  for (const patch of [{ actorId: " " }, { connectionId: "" }, { idempotencyKey: " " }, { actorId: "actor:a\0" }, { expectedVersion: 0 }, { expectedVersion: 1.5 }, { expectedVersion: Number.MAX_SAFE_INTEGER }]) {
    await assert.rejects(service.changeStage({ ...command, ...patch }), RelationshipLifecycleError);
  }
  for (const patch of [{ taskId: " " }, { expectedConnectionVersion: 0 }, { expectedTaskVersion: NaN }, { expectedTaskVersion: Number.MAX_SAFE_INTEGER }]) {
    await assert.rejects(service.completeTask({ actorId: "actor:a", connectionId: "connection:a", idempotencyKey: "complete", taskId: "task:1", expectedConnectionVersion: 4, expectedTaskVersion: 1, outcome: { kind: "active", activeGoal: "目标" }, ...patch }), RelationshipLifecycleError);
  }
  assert.equal(calls, 0);
});

test("service hashes canonical JSON using SHA-256, excludes the key and ignores object property order", async () => {
  const inputs: RelationshipLifecycleMutationInput[] = [];
  const repository: RelationshipLifecycleRepository = {
    async read() { throw new Error("must use atomic mutation"); },
    async mutate(input) { inputs.push(input); return { snapshot: { connection, tasks: [] }, replayed: false }; },
  };
  const service = createRelationshipLifecycleService(repository, () => now);
  await service.changeStage(command);
  await service.changeStage({ nextTask: { dueAt: command.nextTask.dueAt, title: command.nextTask.title, taskId: command.nextTask.taskId }, stage: command.stage, idempotencyKey: "key:2", expectedVersion: 3, connectionId: "connection:a", actorId: "actor:a" });
  const expected = createHash("sha256").update('{"actorId":"actor:a","command":"change_stage","connectionId":"connection:a","expectedVersion":3,"nextTask":{"dueAt":"2026-08-25T01:00:00.000Z","taskId":"task:1","title":"联系 Mina"},"stage":"needs_follow_up"}').digest("hex");
  assert.equal(inputs[0].requestHash, expected);
  assert.equal(inputs[1].requestHash, expected);
  assert.equal(inputs[1].idempotencyKey, "key:2");
});

test("same key with changed command is a conflict and repository errors remain visible", async () => {
  const { service, repository } = setup();
  await service.changeStage(command);
  await assert.rejects(service.changeStage({ ...command, nextTask: { ...command.nextTask, title: "不同任务" } }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(service.changeStage({ ...command, idempotencyKey: "new-key" }), { code: "CONFLICT" });
  assert.equal(repository.audits("actor:a").length, 1);
  const failure = new Error("database unavailable");
  const broken = createRelationshipLifecycleService({ async read() { throw failure; }, async mutate() { throw failure; } }, () => now);
  await assert.rejects(broken.changeStage(command), (error) => error === failure);
});

test("service completes a task atomically with its closing outcome and versions", async () => {
  const { service, repository } = setup();
  await service.changeStage(command);
  const complete = { actorId: "actor:a", connectionId: "connection:a", idempotencyKey: "complete", taskId: "task:1", expectedConnectionVersion: 4, expectedTaskVersion: 1, outcome: { kind: "active" as const, activeGoal: "约好合作方向" } };
  const result = await service.completeTask(complete);
  assert.equal(result.snapshot.connection.stage, "active");
  assert.equal(result.snapshot.connection.activeGoal, "约好合作方向");
  assert.equal(result.snapshot.connection.version, 5);
  assert.equal(result.snapshot.tasks[0].status, "completed");
  assert.equal(result.snapshot.tasks[0].version, 2);
  assert.equal(repository.audits("actor:a")[1].command, "complete_task");
  assert.equal((await service.completeTask(complete)).replayed, true);
});

test("service isolates caller command changes while the repository waits", async () => {
  const { repository } = setup();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const service = createRelationshipLifecycleService({ read: repository.read.bind(repository), async mutate(input, operation) { await ready; return repository.mutate(input, operation); } }, () => now);
  const callerCommand: RelationshipStageCommand = structuredClone(command);
  const pending = service.changeStage(callerCommand);
  callerCommand.nextTask.title = "changed while waiting";
  release();
  const result = await pending;
  assert.equal(result.snapshot.tasks[0].title, "联系 Mina");
  assert.equal((await service.changeStage(command)).replayed, true);
});

test("configured factory fails closed without a live database", () => {
  assert.equal(createConfiguredRelationshipLifecycleService({ env: {} }), null);
});
