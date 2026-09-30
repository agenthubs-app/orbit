import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";

// Explicit isolated target only; never loads a local application env file.
const url = process.env.ORBIT_TASKS_TEST_DATABASE_URL;
test("PostgreSQL task version, receipt, rollback and actor isolation across independent clients", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  assert.ok(url);
  const schema = `c0010_tasks_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const clients = [0, 1].map(() => createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) }));
  const workspaceId = "c0010-test";
  const actorId = "c0010-owner";
  const service = (client: typeof clients[number]) => createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId, transactionClient: client }) });
  try {
    await clients[0].query(ORBIT_RECORDS_SCHEMA_SQL);
    const [a, b] = clients.map(service);
    const created = await a.create({ actorId, title: "Original", category: "personal", location: "Tokyo", idempotencyKey: "create", now: "2026-09-14T00:00:00Z" });
    const input = { actorId, taskId: created.task.id, expectedUpdatedAt: created.task.updatedAt, now: "2026-09-14T00:01:00Z" };
    const results = await Promise.allSettled([
      a.update({ ...input, patch: { title: "First" }, idempotencyKey: "a" }),
      b.update({ ...input, patch: { title: "Second" }, idempotencyKey: "b" }),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.code === "TASK_VERSION_CONFLICT").length, 1);
    assert.equal((await b.history({ actorId })).length, 2);
    assert.deepEqual(await b.list({ actorId: "c0010-other" }), []);
    const before = (await b.list({ actorId }))[0];
    await assert.rejects(b.update({ ...input, actorId: "c0010-other", expectedUpdatedAt: before.updatedAt, patch: { title: "Stolen" }, idempotencyKey: "steal" }), (e: any) => e.code === "TASK_NOT_FOUND");
    const clear = { ...input, expectedUpdatedAt: before.updatedAt, patch: { location: null }, idempotencyKey: "clear", now: "2026-09-14T00:02:00Z" };
    const cleared = await a.update(clear);
    assert.equal(Object.hasOwn((await b.list({ actorId }))[0], "location"), false);
    assert.deepEqual(await b.update({ ...clear, now: "2026-09-14T00:03:00Z" }), cleared);
    await assert.rejects(b.update({ ...clear, patch: { location: "Kyoto" } }), (e: any) => e.code === "TASK_VERSION_CONFLICT");
    const faulty = { ...clients[0], transaction: <T>(operation: Parameters<typeof clients[0]["transaction"]>[0]) => clients[0].transaction(async tx => operation({ query: async (text: string, values?: readonly unknown[]) => {
      if (/insert into orbit_records/i.test(text) && values?.includes("task_mutations")) throw new Error("injected receipt failure");
      return tx.query(text, values);
    } })) as Promise<T> };
    await assert.rejects(service(faulty).update({ ...input, expectedUpdatedAt: cleared.task.updatedAt, patch: { title: "Must roll back" }, idempotencyKey: "rollback", now: "2026-09-14T00:04:00Z" }), /injected receipt failure/);
    assert.deepEqual((await b.list({ actorId }))[0], cleared.task);
    assert.equal((await b.history({ actorId })).length, 3);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});

test("PostgreSQL task delete checks an optional version and fingerprints it in the receipt", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  assert.ok(url);
  const schema = `c0010_task_delete_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const client = createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) });
  const service = createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: "c0010-delete", transactionClient: client }) });
  try {
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const created = await service.create({ actorId: "owner", title: "Delete me", category: "personal", idempotencyKey: "create", now: "2026-09-14T00:00:00Z" });
    await assert.rejects(service.delete({ actorId: "owner", taskId: created.task.id, expectedUpdatedAt: "2026-01-01T00:00:00Z", idempotencyKey: "delete-stale", now: "2026-09-14T00:01:00Z" }), (error: any) => error.code === "TASK_VERSION_CONFLICT");
    assert.deepEqual(await service.get({ actorId: "owner", taskId: created.task.id }), created.task);
    assert.equal((await service.history({ actorId: "owner", taskId: created.task.id })).length, 1);

    const deleted = await service.delete({ actorId: "owner", taskId: created.task.id, expectedUpdatedAt: created.task.updatedAt, idempotencyKey: "delete-fresh", now: "2026-09-14T00:02:00Z" });
    assert.deepEqual(await service.delete({ actorId: "owner", taskId: created.task.id, expectedUpdatedAt: created.task.updatedAt, idempotencyKey: "delete-fresh", now: "2026-09-14T00:03:00Z" }), deleted);
    await assert.rejects(service.delete({ actorId: "owner", taskId: created.task.id, expectedUpdatedAt: "different-version", idempotencyKey: "delete-fresh", now: "2026-09-14T00:04:00Z" }), (error: any) => error.code === "TASK_VERSION_CONFLICT");
  } finally {
    await client.close();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});

test("PostgreSQL replays all six task write receipts exactly once and status actions ignore title-version changes", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  assert.ok(url);
  const schema = `c0010_task_replay_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  const client = createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) });
  const service = createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: "c0010-replay", transactionClient: client }) });
  const actorId = "owner";
  try {
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const created = await service.create({ actorId, title: "Initial", category: "personal", idempotencyKey: "create-replay", now: "2026-09-14T00:00:00Z" });
    assert.deepEqual(await service.create({ actorId, title: "Initial", category: "personal", idempotencyKey: "create-replay", now: "2026-09-14T00:01:00Z" }), created);
    const updateInput = { actorId, taskId: created.task.id, expectedUpdatedAt: created.task.updatedAt, patch: { title: "Remote title" }, idempotencyKey: "update-replay", now: "2026-09-14T00:02:00Z" };
    const updated = await service.update(updateInput);
    assert.deepEqual(await service.update({ ...updateInput, now: "2026-09-14T00:03:00Z" }), updated);
    const changedPayload = { ...updateInput, patch: { title: "Conflicting title" }, now: "2026-09-14T00:03:30Z" };
    await assert.rejects(service.update(changedPayload), (error: any) => error.code === "TASK_VERSION_CONFLICT");
    await assert.rejects(service.update({ ...changedPayload, now: "2026-09-14T00:03:45Z" }), (error: any) => error.code === "TASK_VERSION_CONFLICT");
    assert.deepEqual(await service.update({ ...updateInput, now: "2026-09-14T00:03:50Z" }), updated);
    assert.deepEqual(await service.get({ actorId, taskId: created.task.id }), updated.task);
    const completed = await service.complete({ actorId, taskId: created.task.id, completedBy: actorId, completionSource: "user", idempotencyKey: "complete-replay", now: "2026-09-14T00:04:00Z" });
    assert.equal(completed.task.title, "Remote title", "status actions operate on the latest title without an expectedUpdatedAt guard");
    assert.deepEqual(await service.complete({ actorId, taskId: created.task.id, completedBy: actorId, completionSource: "user", idempotencyKey: "complete-replay", now: "2026-09-14T00:05:00Z" }), completed);
    const reopened = await service.reopen({ actorId, taskId: created.task.id, idempotencyKey: "reopen-replay", now: "2026-09-14T00:06:00Z" });
    assert.deepEqual(await service.reopen({ actorId, taskId: created.task.id, idempotencyKey: "reopen-replay", now: "2026-09-14T00:07:00Z" }), reopened);
    const cancelled = await service.cancel({ actorId, taskId: created.task.id, idempotencyKey: "cancel-replay", now: "2026-09-14T00:08:00Z" });
    assert.deepEqual(await service.cancel({ actorId, taskId: created.task.id, idempotencyKey: "cancel-replay", now: "2026-09-14T00:09:00Z" }), cancelled);
    const deleteTarget = await service.create({ actorId, title: "Delete", category: "personal", idempotencyKey: "delete-target-create", now: "2026-09-14T00:10:00Z" });
    const deleted = await service.delete({ actorId, taskId: deleteTarget.task.id, expectedUpdatedAt: deleteTarget.task.updatedAt, idempotencyKey: "delete-replay", now: "2026-09-14T00:11:00Z" });
    assert.deepEqual(await service.delete({ actorId, taskId: deleteTarget.task.id, expectedUpdatedAt: deleteTarget.task.updatedAt, idempotencyKey: "delete-replay", now: "2026-09-14T00:12:00Z" }), deleted);
    await assert.rejects(service.complete({ actorId, taskId: deleteTarget.task.id, completedBy: actorId, completionSource: "user", idempotencyKey: "complete-replay", now: "2026-09-14T00:13:00Z" }), (error: any) => error.code === "TASK_VERSION_CONFLICT");
    const receipts = await client.query<{ record_id: string }>("select record_id from orbit_records where workspace_id = $1 and collection_name = 'task_mutations'", ["c0010-replay"]);
    assert.equal(receipts.rows.length, 7, "one create, update, complete, reopen, cancel, delete-target create, and delete receipt is stored");
  } finally {
    await client.close();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});

test("personal schedule transactions reject concurrent versions and roll back failed receipts", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  const { createPersonalScheduleService } = await import("../../features/personal-schedule/service");
  assert.ok(url); const schema = `c0010_schedule_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 }); await admin.query(`create schema ${schema}`);
  const clients = [0, 1].map(() => createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) }));
  const make = (client: typeof clients[number]) => createPersonalScheduleService({ client, store: createPostgresLiveRecordStore({ client }), workspaceId: "c0010", now: () => "2026-09-14T00:00:00Z" });
  try {
    await clients[0].query(ORBIT_RECORDS_SCHEMA_SQL); const [a, b] = clients.map(make);
    const created = await a.create("owner", { title: "Personal", startsAt: "2026-09-14T01:00:00Z", idempotencyKey: "create" });
    const input = { expectedUpdatedAt: created.scheduleItem.updatedAt, patch: { location: "Kyoto" }, idempotencyKey: "one" };
    const results = await Promise.allSettled([a.update("owner", created.scheduleItem.id, input), b.update("owner", created.scheduleItem.id, { ...input, idempotencyKey: "two", patch: { location: "Osaka" } })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.code === "CONFLICT").length, 1);
    const before = await b.get({ actorId: "owner", id: created.scheduleItem.id });
    const faulty = { ...clients[0], transaction: <T>(operation: Parameters<typeof clients[0]["transaction"]>[0]) => clients[0].transaction(async tx => operation({ query: async (text: string, values?: readonly unknown[]) => {
      if (/insert into orbit_records/i.test(text) && values?.includes("personal_schedule_mutations")) throw new Error("injected personal receipt failure");
      return tx.query(text, values);
    } })) as Promise<T> };
    await assert.rejects(make(faulty).remove("owner", before.id, { expectedUpdatedAt: before.updatedAt, idempotencyKey: "rollback" }), /injected personal receipt failure/);
    assert.deepEqual(await b.get({ actorId: "owner", id: before.id }), before);
  } finally { await Promise.all(clients.map(c => c.close())); await admin.query(`drop schema ${schema} cascade`); await admin.end(); }
});

test("PostgreSQL task API returns the server snapshot after a stale delete and accepts the confirmed version", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  assert.ok(url);
  const schema = `c0010_task_api_conflict_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const client = createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) });
  const actorId = "c0010-api-conflict-owner";
  const workspaceId = "c0010-api-conflict-workspace";
  const service = createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId, transactionClient: client }) });
  let now = "2026-09-30T00:00:00.000Z";
  const dependencies = {
    now: () => now,
    resolveActor: async () => ({ id: actorId, workspaceId }),
    service,
  };
  const collection = createTaskCollectionHandlers(dependencies);
  const detail = createTaskDetailHandlers(dependencies);
  let schemaCreated = false;

  try {
    await admin.query(`create schema ${schema}`);
    schemaCreated = true;
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);

    const createResponse = await collection.POST(new Request("https://orbit.local/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "personal", idempotencyKey: "phone:create", title: "Original phone title" }),
    }));
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json() as { data: { task: { id: string; updatedAt: string } } }).data.task;
    const context = { params: Promise.resolve({ id: created.id }) };

    now = "2026-09-30T00:01:00.000Z";
    const webEdit = await detail.PATCH(new Request(`https://orbit.local/api/tasks/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", expectedUpdatedAt: created.updatedAt, idempotencyKey: "web:update", patch: { title: "Web's newer title" } }),
    }), context);
    assert.equal(webEdit.status, 200);
    const current = (await webEdit.json() as { data: { task: { title: string; updatedAt: string } } }).data.task;
    assert.equal(current.title, "Web's newer title");
    assert.notEqual(current.updatedAt, created.updatedAt);

    now = "2026-09-30T00:02:00.000Z";
    const staleDelete = await detail.DELETE(new Request(`https://orbit.local/api/tasks/${created.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: created.updatedAt, idempotencyKey: "phone:delete-stale" }),
    }), context);
    assert.equal(staleDelete.status, 409);
    assert.equal((await staleDelete.json() as { error: { code: string } }).error.code, "CONFLICT");
    assert.deepEqual(await service.get({ actorId, taskId: created.id }), current);

    const snapshotResponse = await detail.GET(new Request(`https://orbit.local/api/tasks/${created.id}`), context);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = (await snapshotResponse.json() as { data: { task: { title: string; updatedAt: string } } }).data.task;
    assert.equal(snapshot.title, "Web's newer title");
    assert.equal(snapshot.updatedAt, current.updatedAt);

    now = "2026-09-30T00:03:00.000Z";
    const confirmedDelete = await detail.DELETE(new Request(`https://orbit.local/api/tasks/${created.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: snapshot.updatedAt, idempotencyKey: "phone:delete-confirmed" }),
    }), context);
    assert.equal(confirmedDelete.status, 200);
    assert.equal(await service.get({ actorId, taskId: created.id }), null);
    assert.equal((await service.history({ actorId, taskId: created.id })).at(-1)?.type, "deleted");
  } finally {
    await client.close();
    if (schemaCreated) await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});

test("PostgreSQL task routes hide a foreign actor's task from every mutation and bind create to its actor", { skip: url ? false : "isolated ORBIT_TASKS_TEST_DATABASE_URL not provided" }, async () => {
  assert.ok(url);
  const schema = `c0010_task_actor_matrix_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const client = createTransactionalPostgresClient({ connectionString: url, pool: new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema}` }) });
  const workspaceId = "c0010-task-actor-matrix";
  const ownerId = "c0010-task-owner";
  const otherActorId = "c0010-task-other-actor";
  const service = createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId, transactionClient: client }) });
  let actorId = ownerId;
  const dependencies = {
    now: () => "2026-10-01T00:00:00.000Z",
    resolveActor: async () => ({ id: actorId, workspaceId }),
    service,
  };
  const collection = createTaskCollectionHandlers(dependencies);
  const detail = createTaskDetailHandlers(dependencies);
  let schemaCreated = false;

  try {
    await admin.query(`create schema ${schema}`);
    schemaCreated = true;
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);

    const ownerCreate = await collection.POST(new Request("https://orbit.local/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "personal", idempotencyKey: "same-create-key", title: "Actor-scoped create" }),
    }));
    assert.equal(ownerCreate.status, 201);
    const ownerTask = (await ownerCreate.json() as { data: { task: { id: string; accountId: string; ownerUserId: string; title: string; status: string; updatedAt: string } } }).data.task;
    assert.equal(ownerTask.accountId, ownerId);
    assert.equal(ownerTask.ownerUserId, ownerId);
    const ownerBefore = await service.get({ actorId: ownerId, taskId: ownerTask.id });
    assert.ok(ownerBefore);
    const ownerHistory = await service.history({ actorId: ownerId, taskId: ownerTask.id });

    actorId = otherActorId;
    const otherCreate = await collection.POST(new Request("https://orbit.local/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "personal", idempotencyKey: "same-create-key", title: "Actor-scoped create" }),
    }));
    assert.equal(otherCreate.status, 201);
    const otherTask = (await otherCreate.json() as { data: { task: { id: string; accountId: string; ownerUserId: string } } }).data.task;
    assert.notEqual(otherTask.id, ownerTask.id);
    assert.equal(otherTask.accountId, otherActorId);
    assert.equal(otherTask.ownerUserId, otherActorId);
    assert.equal(await service.get({ actorId: otherActorId, taskId: ownerTask.id }), null);
    const otherBefore = await service.get({ actorId: otherActorId, taskId: otherTask.id });
    assert.ok(otherBefore);
    const otherHistory = await service.history({ actorId: otherActorId, taskId: otherTask.id });

    const context = { params: Promise.resolve({ id: ownerTask.id }) };
    const attempts = [
      {
        name: "update",
        request: () => detail.PATCH(new Request(`https://orbit.local/api/tasks/${ownerTask.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "update", expectedUpdatedAt: ownerTask.updatedAt, idempotencyKey: "foreign:update", patch: { title: "Unauthorized edit" } }),
        }), context),
      },
      ...(["complete", "reopen", "cancel"] as const).map(action => ({
        name: action,
        request: () => detail.PATCH(new Request(`https://orbit.local/api/tasks/${ownerTask.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, idempotencyKey: `foreign:${action}` }),
        }), context),
      })),
      {
        name: "delete",
        request: () => detail.DELETE(new Request(`https://orbit.local/api/tasks/${ownerTask.id}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedUpdatedAt: ownerTask.updatedAt, idempotencyKey: "foreign:delete" }),
        }), context),
      },
    ];

    for (const attempt of attempts) {
      const response = await attempt.request();
      assert.equal(response.status, 404, `${attempt.name} must not reveal or mutate another actor's task`);
      assert.equal((await response.json() as { error: { code: string } }).error.code, "NOT_FOUND");
    }

    assert.deepEqual(await service.get({ actorId: ownerId, taskId: ownerTask.id }), ownerBefore);
    assert.deepEqual(await service.history({ actorId: ownerId, taskId: ownerTask.id }), ownerHistory);
    assert.deepEqual((await service.list({ actorId: ownerId })).map(task => task.id), [ownerTask.id]);
    assert.deepEqual(await service.get({ actorId: otherActorId, taskId: otherTask.id }), otherBefore);
    assert.deepEqual(await service.history({ actorId: otherActorId, taskId: otherTask.id }), otherHistory);
    assert.deepEqual((await service.list({ actorId: otherActorId })).map(task => task.id), [otherTask.id]);
    const receipts = await client.query<{ user_id: string; count: string }>(
      "select user_id, count(*)::text as count from orbit_records where workspace_id = $1 and collection_name = 'task_mutations' group by user_id order by user_id",
      [workspaceId],
    );
    assert.deepEqual(receipts.rows, [
      { user_id: otherActorId, count: "1" },
      { user_id: ownerId, count: "1" },
    ]);
  } finally {
    await client.close();
    if (schemaCreated) await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});
