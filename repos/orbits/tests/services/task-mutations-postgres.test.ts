import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";

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
