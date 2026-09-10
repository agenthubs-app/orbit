import assert from "node:assert/strict";
import test from "node:test";
import { readCanonicalContactLifecycles } from "../../features/connections/lifecycle/read-projection";
import { createPostgresLifecycleMigrationRepository } from "../../features/connections/lifecycle/migration-repository";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { lifecycleMigrationDatabaseTest as databaseTest, lifecycleMigrationFixtureCommand, lifecycleMigrationFixtureRecord as record, migrationActorId as actorId, migrationManifest as manifest, migrationNow as now, migrationWorkspaceId as workspaceId, withLifecycleMigrationDatabase as withDatabase } from "../support/lifecycle-migration-fixture";

const scope = { actorId, workspaceId, now, timeZone: "Asia/Tokyo" };
const read = (client: TransactionalPostgresClient) => readCanonicalContactLifecycles({ client, ...scope });
const canonical = (client: TransactionalPostgresClient) => client.query("update orbit_records set payload=payload || '{\"version\":1}'::jsonb where workspace_id=$1 and user_id=$2", [workspaceId, actorId]);
function trace(client: TransactionalPostgresClient, afterFirst?: () => Promise<void>) {
  const calls: { sql: string; values?: readonly unknown[]; rows: readonly unknown[] }[] = [];
  let transactions = 0;
  const traced: TransactionalPostgresClient = { ...client, query: async () => { throw new Error("read outside transaction"); }, transaction: operation => {
    transactions++;
    return client.transaction(sql => operation({ query: async <T>(text: string, values?: readonly unknown[]) => {
      const result = await sql.query<T>(text, values);
      calls.push({ sql: text, values, rows: result.rows });
      if (calls.length === 1) await afterFirst?.();
      return result;
    } }));
  } };
  return { client: traced, calls, transactions: () => transactions };
}

test("actor-first batch reads use four queries for both one and fifty contacts", databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  for (const count of [1, 50]) {
    if (count === 50) for (let index = 1; index < count; index++) {
      await insert(record("contacts", `contact:${index}`, { id: `contact:${index}`, version: 1 }));
      await insert(record("connections", `connection:${index}`, { id: `connection:${index}`, contactId: `contact:${index}`, accountId: actorId, stage: "active", activeGoal: "Actor goal", version: 1, createdAt: now, updatedAt: now }));
    }
    const traced = trace(client);
    assert.equal((await read(traced.client)).length, count);
    assert.equal(traced.transactions(), 1);
    assert.equal(traced.calls.length, 4);
    assert.match(traced.calls[0].sql, /collection_name = 'connections'/u);
    for (const call of traced.calls) {
      assert.match(call.sql, /^select\b/iu);
      assert.ok(call.values?.includes(actorId));
      assert.ok(call.values?.includes(workspaceId));
      assert.doesNotMatch(call.sql, /receipts|create table|insert into|update orbit_records/iu);
    }
    for (const call of traced.calls.slice(0, 3)) assert.match(call.sql, /user_id = \$2/u);
    assert.match(traced.calls[3].sql, /^select exists/iu);
    assert.deepEqual(traced.calls[3].rows, [{ inconsistent: false }]);
  }
}));

test("foreign payloads never cross SQL even when a foreign task references the actor", databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  await insert(record("contacts", "contact:foreign", { id: "contact:foreign", private: "FOREIGN PRIVATE" }, "actor:other"));
  await insert(record("connections", "connection:foreign", { id: "connection:foreign", accountId: "actor:other", contactId: "contact:foreign", private: "FOREIGN PRIVATE" }, "actor:other"));
  const clean = trace(client);
  assert.equal((await read(clean.client)).length, 1);
  assert.equal(JSON.stringify(clean.calls.map(call => call.rows)).includes("FOREIGN PRIVATE"), false);
  await insert(record("tasks", "task:foreign", { id: "task:foreign", connectionId: "connection:a", title: "FOREIGN PRIVATE" }, "actor:other"));
  const conflicted = trace(client);
  await assert.rejects(read(conflicted.client), error => error instanceof Error && "code" in error && error.code === "INCONSISTENT_STATE" && !error.message.includes("FOREIGN"));
  assert.equal(JSON.stringify(conflicted.calls.map(call => call.rows)).includes("FOREIGN PRIVATE"), false);
  assert.deepEqual(conflicted.calls.at(-1)?.rows, [{ inconsistent: true }]);
}));

for (const defect of ["orphan-contact", "foreign-contact", "foreign-connection", "claimed-connection", "orphan-task", "malformed-task", "null-owner-task"]) test(`batch reads reject ${defect} without a partial result`, databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  if (defect === "orphan-contact") await insert(record("contacts", "contact:orphan", { id: "contact:orphan", version: 1 }));
  if (defect === "foreign-contact") await client.query("update orbit_records set user_id='actor:other' where collection_name='contacts'");
  if (defect === "foreign-connection") await insert(record("connections", "connection:foreign", { id: "connection:foreign", accountId: "actor:other", contactId: "contact:a", private: "FOREIGN PRIVATE" }, "actor:other"));
  if (defect === "claimed-connection") await insert(record("connections", "connection:foreign", { id: "connection:foreign", accountId: actorId, contactId: "contact:other", private: "FOREIGN PRIVATE" }, "actor:other"));
  if (defect === "orphan-task") await insert(record("tasks", "task:orphan", { id: "task:orphan", connectionId: "connection:missing" }));
  if (defect === "malformed-task") {
    await insert(record("tasks", "task:malformed", {}));
    await client.query("update orbit_records set payload='null'::jsonb where collection_name='tasks'");
  }
  if (defect === "null-owner-task") await insert(record("tasks", "task:unowned", { id: "task:unowned", connectionId: "connection:a", private: "FOREIGN PRIVATE" }, null));
  const traced = trace(client);
  await assert.rejects(read(traced.client), { code: "INCONSISTENT_STATE" });
  assert.equal(JSON.stringify(traced.calls.map(call => call.rows)).includes("FOREIGN PRIVATE"), false);
}));

test("batch reader uses one consistent snapshot when another transaction inserts new data", databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  const traced = trace(client, () => insert(record("contacts", "contact:concurrent-orphan", { id: "contact:concurrent-orphan", version: 1 })));
  assert.equal((await read(traced.client)).length, 1);
  await assert.rejects(read(client), { code: "INCONSISTENT_STATE" });
}));

test("read identity, clock and timezone are captured before SQL awaits", databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  await insert(record("tasks", "task:next", { id: "task:next", connectionId: "connection:a", contactId: "contact:a", version: 2, title: "Actor next task", status: "open", dueAt: "2026-09-09T02:00:00.000Z", createdAt: now, updatedAt: now }));
  const input = { client, ...scope };
  input.client = trace(client, async () => { input.actorId = "actor:other"; input.workspaceId = "workspace:other"; input.now = "invalid"; input.timeZone = "Invalid/Zone"; }).client;
  const views = await readCanonicalContactLifecycles(input);
  assert.equal(views[0].nextFollowup?.taskId, "task:next");
  assert.equal(views[0].nextFollowup?.timeStatus, "today");
}));

test("canonical reads require current valid data, never a past migration receipt", databaseTest, async () => withDatabase(async ({ client }) => {
  await assert.rejects(read(client), { code: "INCONSISTENT_STATE" });
  const repo = createPostgresLifecycleMigrationRepository({ client, workspaceId });
  await repo.apply(lifecycleMigrationFixtureCommand(await repo.dryRun(manifest)));
  assert.equal((await read(client)).length, 1);
  await client.query("update orbit_records set payload=payload-'activeGoal' where collection_name='connections'");
  await assert.rejects(read(client), { code: "INCONSISTENT_STATE" });
}));

test("empty actors and deleted foreign references do not leak or create ghost actions", databaseTest, async () => withDatabase(async ({ client, insert }) => {
  await canonical(client);
  await insert({ ...record("tasks", "task:deleted", { id: "task:deleted", connectionId: "connection:a", private: "FOREIGN PRIVATE" }, "actor:other"), lifecycleState: "deleted", deletedAt: now });
  assert.equal((await read(client))[0].nextFollowup, null);
  assert.deepEqual(await readCanonicalContactLifecycles({ client, ...scope, actorId: "actor:empty" }), []);
}));

test("invalid read scope fails before starting a transaction", async () => {
  let starts = 0;
  const client: TransactionalPostgresClient = { query: async () => ({ rows: [] }), transaction: async () => { starts++; throw new Error("must not start"); }, close: async () => {} };
  await assert.rejects(readCanonicalContactLifecycles({ client, ...scope, timeZone: "Invalid/Zone" }), { code: "INVALID_INPUT" });
  assert.equal(starts, 0);
});
