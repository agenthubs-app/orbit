import assert from "node:assert/strict";
import test from "node:test";

import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";
import { createTaskActivitiesGetHandler } from "../../app/api/tasks/[id]/activities/handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const workspaceId = "point-read-tests";
const actorId = "owner";
const now = "2026-09-25T00:00:00.000Z";

function setup() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createTaskService({ repository: createTaskRepository({ store, workspaceId }) });
  const suggestions = createTaskSuggestionService({
    repository: createTaskSuggestionRepository({ store, workspaceId }), taskService: service,
  });
  return { store, service, suggestions };
}

test("task detail reads just its owned ID and missing records without listing", async () => {
  const { store, service } = setup();
  const created = await service.create({ actorId, title: "Private detail", category: "work", idempotencyKey: "one", now });
  const get = store.getRecord.bind(store);
  const reads: string[] = [];
  store.getRecord = query => {
    assert.equal(query.userId, actorId, "ownership must reach storage, not just post-filter the payload");
    reads.push(query.recordId);
    return get(query);
  };
  store.listRecords = () => { throw new Error("Unbounded list forbidden for detail"); };
  const handler = createTaskDetailHandlers({ service, resolveActor: async () => ({ id: actorId, workspaceId }) });
  const response = await handler.GET(new Request("https://orbit.test/api/tasks/one"), { params: Promise.resolve({ id: created.task.id }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.task, created.task);
  assert.deepEqual(reads, [created.task.id]);
  const absent = await handler.GET(new Request("https://orbit.test/api/tasks/absent"), { params: Promise.resolve({ id: "absent" }) });
  assert.equal(absent.status, 404);
});

test("task point reads reject inconsistent ownership, IDs, history and deleted data", async () => {
  const { store, service } = setup();
  const created = await service.create({ actorId, title: "Private detail", category: "work", idempotencyKey: "one", now });
  const record = store.getRecord({ workspaceId, collectionName: "tasks", recordId: created.task.id })!;
  const task = record.payload.task as Record<string, unknown>;
  const activity = (record.payload.activities as Record<string, unknown>[])[0]!;
  store.listRecords = () => { throw new Error("Unbounded list forbidden for point reads"); };
  assert.equal(await service.get({ actorId: "foreign", taskId: created.task.id }), null);
  for (const variant of [
    { ...record, userId: "foreign" },
    { ...record, userId: null },
    ...[{ ownerUserId: "foreign" }, { accountId: "foreign" }, { accountId: [actorId] }, { id: "different" }].map(patch => ({ ...record, payload: { ...record.payload, task: { ...task, ...patch } } })),
    { ...record, payload: { ...record.payload, activities: [{ ...activity, ownerUserId: "foreign" }] } },
    { ...record, lifecycleState: "deleted" as const, deletedAt: now },
  ]) {
    store.upsertRecord(variant);
    assert.equal(await service.get({ actorId, taskId: created.task.id }), null);
  }
  store.upsertRecord(record);
  assert.deepEqual(await service.get({ actorId, taskId: created.task.id }), created.task);
});

test("accepted suggestion replay gets only the accepted task, preserves current status and does not recreate a deleted task", async () => {
  const { store, service, suggestions } = setup();
  const suggestion = await suggestions.suggest({ actorId, title: "Suggestion", reason: "Evidence", category: "work", evidenceIds: [], confidence: 0.8, deduplicationKey: "one", now });
  const command = { actorId, suggestionId: suggestion.id, idempotencyKey: "accept", now };
  const accepted = await suggestions.accept(command);
  const completed = await service.complete({ actorId, taskId: accepted.task.id, completedBy: actorId, completionSource: "user", idempotencyKey: "done", now: "2026-09-25T01:00:00.000Z" });
  store.listRecords = () => { throw new Error("Unbounded list forbidden for replay"); };
  const replay = await suggestions.accept(command);
  assert.deepEqual(replay.task, completed.task);
  await service.delete({ actorId, taskId: accepted.task.id, idempotencyKey: "delete", now: "2026-09-25T02:00:00.000Z" });
  await assert.rejects(suggestions.accept(command), /cannot be accepted from accepted/);
});

test("one task's activity endpoint reads only that task and retains deleted history for its owner", async () => {
  const { store, service } = setup();
  const created = await service.create({ actorId, title: "History", category: "work", idempotencyKey: "history", now });
  await service.delete({ actorId, taskId: created.task.id, idempotencyKey: "delete", now: "2026-09-25T01:00:00.000Z" });
  store.listRecords = () => { throw new Error("Unbounded list forbidden for one task's history"); };
  const context = { params: Promise.resolve({ id: created.task.id }) };
  const handler = (id: string) => createTaskActivitiesGetHandler({ service, resolveActor: async () => ({ id, workspaceId }) });
  const response = await handler(actorId)(new Request("https://orbit.test/history"), context);
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.deepEqual(data.activities.map((a: { type: string }) => a.type), ["created", "deleted"]);
  assert.ok(data.activities.every((a: { taskId: string }) => a.taskId === created.task.id));
  const foreign = await handler("foreign")(new Request("https://orbit.test/history"), context);
  assert.equal(foreign.status, 200);
  assert.deepEqual((await foreign.json()).data.activities, []);
});
