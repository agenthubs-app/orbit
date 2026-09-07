import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresRelationshipLifecycleRepository } from "../../features/connections/lifecycle/postgres-repository";
import { applyRelationshipStageCommand, applyRelationshipTaskCompletion } from "../../features/connections/lifecycle/transition";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

const now = "2026-08-21T01:00:00.000Z";
const workspaceId = "workspace:lifecycle-test";
const actorId = "actor:a";
const connectionId = "connection:a";
const contactId = "contact:a";
const connectionPayload = { id: connectionId, accountId: actorId, contactId, stage: "active", activeGoal: "目标", version: 3, summary: "保留原画像", createdAt: now, updatedAt: now };
const command = { actorId, connectionId, expectedVersion: 3, idempotencyKey: "key:1", stage: "needs_follow_up" as const, nextTask: { taskId: "task:1", title: "联系 Mina", dueAt: "2026-08-25T01:00:00.000Z" } };
const mutation = { actorId, connectionId, expectedVersion: 3, idempotencyKey: "key:1", command: "change_stage" as const, requestHash: "hash:1" };
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_LIFECYCLE_TEST_DATABASE_URL is not configured" };

test("SQL mutation checks receipts then locks only actor/workspace-owned records before writes", async () => {
  const calls: { sql: string; values?: readonly unknown[] }[] = [];
  const row = (collection: string, id: string, payload: Record<string, unknown>) => ({ workspace_id: workspaceId, collection_name: collection, record_id: id, user_id: actorId, payload, created_at: now, updated_at: now, lifecycle_state: "active" });
  const answers = [[], [row("connections", connectionId, connectionPayload)], [row("contacts", contactId, { id: contactId })], []];
  let transactions = 0;
  const client: TransactionalPostgresClient = {
    async query<T>(sql: string, values?: readonly unknown[]) {
      calls.push({ sql, values });
      return { rows: (answers[calls.length - 1] ?? [{ record_id: connectionId }]) as T[] };
    },
    async transaction(operation) { transactions += 1; return operation(this); },
    async close() {},
  };
  const repo = createPostgresRelationshipLifecycleRepository({ client, workspaceId });
  await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(transactions, 1);
  assert.match(calls[0].sql, /select[\s\S]+relationship_lifecycle_command_receipts/i);
  assert.deepEqual(calls[0].values, [workspaceId, actorId, "key:1"]);
  assert.match(calls[1].sql, /collection_name = 'connections'[\s\S]+user_id = \$\d+[\s\S]+for update/i);
  assert.ok(calls[1].values?.includes(workspaceId));
  assert.ok(calls[1].values?.includes(connectionId));
  assert.ok(calls[1].values?.includes(actorId));
  assert.match(calls[2].sql, /collection_name = 'contacts'[\s\S]+user_id = \$\d+/i);
  assert.match(calls[3].sql, /collection_name = 'tasks'[\s\S]+user_id = \$\d+[\s\S]+connectionId[\s\S]+for update/i);
  const update = calls.find(({ sql }) => /update orbit_records/i.test(sql));
  assert.match(update?.sql ?? "", /version/);
  assert.ok(update?.values?.includes(3));
  assert.ok(calls.some(({ sql }) => /insert into orbit_records[\s\S]*relationship_lifecycle_audits/i.test(sql)));
  assert.match(calls.at(-1)?.sql ?? "", /insert into relationship_lifecycle_command_receipts/i);
});

async function withDatabase(operation: (fixture: {
  client: TransactionalPostgresClient;
  repo: ReturnType<typeof createPostgresRelationshipLifecycleRepository>;
  insert(collection: string, id: string, owner: string, payload: Record<string, unknown>): Promise<void>;
}) => Promise<void>) {
  assert.ok(databaseUrl);
  const schema = `lifecycle_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 2000, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runRelationshipLifecycleMigrations(client);
    await runRelationshipLifecycleMigrations(client);
    const insert = async (collection: string, id: string, owner: string, payload: Record<string, unknown>) => {
      await client.query("insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1,$2,$3,$4,'manual','test:source',$5,$6,$6)", [workspaceId, collection, id, owner, payload, now]);
    };
    await insert("contacts", contactId, actorId, { id: contactId });
    await insert("connections", connectionId, actorId, connectionPayload);
    await operation({ client, repo: createPostgresRelationshipLifecycleRepository({ client, workspaceId }), insert });
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

async function counts(client: TransactionalSqlExecutor) {
  const records = await client.query<{ collection_name: string; count: string }>("select collection_name, count(*)::text from orbit_records group by collection_name order by collection_name");
  const receipts = await client.query<{ count: string }>("select count(*)::text from relationship_lifecycle_command_receipts");
  return { records: records.rows, receipts: receipts.rows[0].count };
}

test("PostgreSQL persists lifecycle tasks and audits for cold reads and exact snapshot replay", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const first = await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(first.replayed, false);
  assert.equal(first.snapshot.connection.version, 4);
  const cold = createPostgresRelationshipLifecycleRepository({ client, workspaceId });
  assert.deepEqual(await cold.read(actorId, connectionId), first.snapshot);
  const record = await client.query<{ payload: Record<string, unknown> }>("select payload from orbit_records where collection_name='connections'");
  assert.equal(record.rows[0].payload.summary, "保留原画像");
  await repo.mutate({ ...mutation, expectedVersion: 4, idempotencyKey: "key:2", requestHash: "hash:2" }, (snapshot) => applyRelationshipStageCommand({ command: { actorId, connectionId, expectedVersion: 4, idempotencyKey: "key:2", stage: "active", activeGoal: "新目标" }, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const replay = await cold.mutate(mutation, () => { throw new Error("must replay the original snapshot"); });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal((await cold.read(actorId, connectionId))?.connection.version, 5);
  const audit = await client.query<{ payload: unknown }>("select payload from orbit_records where collection_name='relationship_lifecycle_audits'");
  assert.equal(JSON.stringify(audit.rows).includes("联系 Mina"), false);
}));

test("PostgreSQL rejects wrong actors, missing contact ownership, stale versions and changed hashes without writes", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const before = await counts(client);
  assert.equal(await repo.read("actor:other", connectionId), null);
  await assert.rejects(repo.mutate({ ...mutation, actorId: "actor:other" }, () => { throw new Error("must not run"); }), { code: "NOT_FOUND" });
  await assert.rejects(repo.mutate({ ...mutation, expectedVersion: 2 }, () => { throw new Error("must not run"); }), { code: "CONFLICT" });
  assert.deepEqual(await counts(client), before);
  await client.query("update orbit_records set user_id='actor:other' where collection_name='contacts'");
  await assert.rejects(repo.read(actorId, connectionId), { code: "FORBIDDEN" });
  await assert.rejects(repo.mutate(mutation, () => { throw new Error("must not run"); }), { code: "FORBIDDEN" });
  assert.deepEqual(await counts(client), before);
  await client.query("update orbit_records set user_id=$1 where collection_name='contacts'", [actorId]);
  await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const committed = await counts(client);
  await assert.rejects(repo.mutate({ ...mutation, requestHash: "different" }, () => { throw new Error("must not run"); }), { code: "IDEMPOTENCY_CONFLICT" });
  assert.deepEqual(await counts(client), committed);
}));

test("PostgreSQL rolls back task and connection writes when audit insertion fails", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const before = await repo.read(actorId, connectionId);
  const initialCounts = await counts(client);
  await client.query("create function fail_lifecycle_audit() returns trigger language plpgsql as $$ begin if new.collection_name = 'relationship_lifecycle_audits' then raise exception 'injected audit failure'; end if; return new; end $$; create trigger fail_lifecycle_audit before insert on orbit_records for each row execute function fail_lifecycle_audit();");
  await assert.rejects(repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now })), /injected audit failure/);
  assert.deepEqual(await repo.read(actorId, connectionId), before);
  assert.deepEqual(await counts(client), initialCounts);
  await client.query("drop trigger fail_lifecycle_audit on orbit_records");
  assert.equal((await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }))).replayed, false);
}));

test("PostgreSQL concurrent same-key requests commit once and replay once", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const second = createPostgresRelationshipLifecycleRepository({ client, workspaceId });
  const results = await Promise.all([repo, second].map((writer) => writer.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }))));
  assert.deepEqual(results.map(({ replayed }) => replayed).sort(), [false, true]);
  assert.deepEqual(results[0].snapshot, results[1].snapshot);
  assert.equal((await counts(client)).receipts, "1");
  assert.equal((await repo.read(actorId, connectionId))?.connection.version, 4);
}));

test("PostgreSQL concurrent different keys cannot both mutate the same expected version", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const results = await Promise.allSettled([1, 2].map((number) => repo.mutate({ ...mutation, idempotencyKey: `race:${number}` }, (snapshot) => applyRelationshipStageCommand({ command: { ...command, idempotencyKey: `race:${number}` }, current: snapshot.connection, tasks: snapshot.tasks, now }))));
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal((results.find(({ status }) => status === "rejected") as PromiseRejectedResult).reason.code, "CONFLICT");
  assert.equal((await counts(client)).receipts, "1");
}));

test("PostgreSQL rejects task id collisions without overwriting another actor's record", databaseTest, async () => withDatabase(async ({ client, repo, insert }) => {
  await insert("tasks", "task:1", "actor:other", { id: "task:1", title: "private other task", connectionId: "connection:other", status: "open" });
  await assert.rejects(repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now })), { code: "INVALID_TASK" });
  const task = await client.query<{ user_id: string; payload: { title: string } }>("select user_id,payload from orbit_records where collection_name='tasks'");
  assert.equal(task.rows[0].user_id, "actor:other");
  assert.equal(task.rows[0].payload.title, "private other task");
  assert.equal((await repo.read(actorId, connectionId))?.connection.version, 3);
  assert.equal((await counts(client)).receipts, "0");
}));

test("PostgreSQL accepts missing legacy versions as one but persists explicit next versions", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  await client.query("update orbit_records set payload=payload-'version' where collection_name='connections'");
  assert.equal((await repo.read(actorId, connectionId))?.connection.version, 1);
  await repo.mutate({ ...mutation, expectedVersion: 1 }, (snapshot) => applyRelationshipStageCommand({ command: { ...command, expectedVersion: 1 }, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const row = await client.query<{ payload: { version: number } }>("select payload from orbit_records where collection_name='connections'");
  assert.equal(row.rows[0].payload.version, 2);
}));

test("PostgreSQL completes a task and archives the relationship in one transaction", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const result = await repo.mutate({ ...mutation, command: "complete_task", expectedVersion: 4, idempotencyKey: "complete:1", requestHash: "complete:hash" }, (snapshot) => applyRelationshipTaskCompletion({ command: { actorId, connectionId, taskId: "task:1", expectedConnectionVersion: 4, expectedTaskVersion: 1, idempotencyKey: "complete:1", outcome: { kind: "archived", dismissTaskIds: [] } }, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(result.snapshot.connection.stage, "archived");
  assert.equal(result.snapshot.connection.version, 5);
  assert.equal(result.snapshot.tasks[0].status, "completed");
  assert.equal(result.snapshot.tasks[0].version, 2);
  assert.deepEqual(await repo.read(actorId, connectionId), result.snapshot);
  assert.equal((await counts(client)).receipts, "2");
}));

test("transaction retries are bounded and only retry serialization, deadlock and receipt races", async () => {
  for (const [code, constraint, expectedAttempts] of [
    ["40001", undefined, 3], ["40P01", undefined, 3],
    ["23505", "relationship_lifecycle_command_receipts_pkey", 3],
    ["23505", "unrelated_constraint", 1], ["08006", undefined, 1],
  ] as const) {
    let attempts = 0;
    const failure = Object.assign(new Error("injected transaction failure"), { code, constraint });
    const client: TransactionalPostgresClient = {
      async query() { throw new Error("query outside transaction"); },
      async transaction() { attempts += 1; throw failure; },
      async close() {},
    };
    const repo = createPostgresRelationshipLifecycleRepository({ client, workspaceId });
    await assert.rejects(repo.mutate(mutation, () => { throw new Error("must not run"); }), (error) => error === failure);
    assert.equal(attempts, expectedAttempts);
  }
});

test("PostgreSQL rejects malformed stored stages and versions without receipts or mutations", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  for (const payload of [
    { ...connectionPayload, version: null }, { ...connectionPayload, version: "3" },
    { ...connectionPayload, version: 0 }, { ...connectionPayload, stage: "captured" },
    { ...connectionPayload, accountId: "actor:other" },
  ]) {
    await client.query("update orbit_records set payload=$1 where collection_name='connections'", [payload]);
    await assert.rejects(repo.mutate(mutation, () => { throw new Error("must not run"); }), (error: unknown) => error instanceof Error && "code" in error);
    const stored = await client.query<{ payload: unknown }>("select payload from orbit_records where collection_name='connections'");
    assert.deepEqual(stored.rows[0].payload, payload);
    assert.equal((await counts(client)).receipts, "0");
  }
}));

test("PostgreSQL preserves generic tasks and existing task provenance while closing lifecycle tasks", databaseTest, async () => withDatabase(async ({ client, repo, insert }) => {
  const generic = { id: "task:generic", connectionId, title: "普通任务", status: "open" };
  await insert("tasks", "task:generic", actorId, generic);
  await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  await client.query("update orbit_records set payload=payload || $1::jsonb where collection_name='tasks' and record_id='task:1'", [{ evidenceIds: ["evidence:keep"], summary: "保留任务内容" }]);
  await repo.mutate({ ...mutation, expectedVersion: 4, idempotencyKey: "archive", requestHash: "archive" }, (snapshot) => applyRelationshipStageCommand({ command: { actorId, connectionId, expectedVersion: 4, idempotencyKey: "archive", stage: "archived", dismissTaskIds: ["task:1"] }, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const rows = await client.query<{ record_id: string; payload: Record<string, unknown> }>("select record_id,payload from orbit_records where collection_name='tasks'");
  assert.deepEqual(rows.rows.find(({ record_id }) => record_id === "task:generic")?.payload, generic);
  const task = rows.rows.find(({ record_id }) => record_id === "task:1")?.payload;
  assert.equal(task?.status, "dismissed");
  assert.deepEqual(task?.evidenceIds, ["evidence:keep"]);
  assert.equal(task?.summary, "保留任务内容");
}));

test("PostgreSQL isolates the validated plan from callback changes during SQL awaits", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const result = await repo.mutate(mutation, (snapshot) => {
    const plan = applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now });
    queueMicrotask(() => {
      plan.upsertTasks.length = 0;
      plan.audit.actorId = "actor:forged";
      plan.audit.taskIds.length = 0;
    });
    return plan;
  });
  assert.deepEqual(await repo.read(actorId, connectionId), result.snapshot);
  const audits = await client.query<{ payload: { actorId: string; taskIds: string[] } }>("select payload from orbit_records where collection_name='relationship_lifecycle_audits'");
  assert.equal(audits.rows[0].payload.actorId, actorId);
  assert.deepEqual(audits.rows[0].payload.taskIds, ["task:1"]);
}));

test("PostgreSQL fails closed on malformed or cross-actor stored receipt snapshots", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  const first = await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  const snapshot = first.snapshot;
  const malformed = [
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], actorId: "actor:other", title: "PRIVATE OTHER ACTOR TEXT" }] },
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], contactId: "contact:other" }] },
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], version: undefined }] },
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], status: "unknown" }] },
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], dueAt: "invalid" }] },
    { ...snapshot, tasks: [{ ...snapshot.tasks[0], dueAt: "2026-02-30T01:00:00Z" }] },
    { ...snapshot, connection: { ...snapshot.connection, stage: "captured" } },
    { ...snapshot, connection: { ...snapshot.connection, version: 0 } },
    { ...snapshot, connection: null }, null,
  ];
  const before = await counts(client);
  for (const response of malformed) {
    await client.query("update relationship_lifecycle_command_receipts set response_snapshot=$1", [JSON.stringify(response)]);
    await assert.rejects(repo.mutate(mutation, () => { throw new Error("must not invoke operation"); }), (error: unknown) => error instanceof Error && error.name === "RelationshipLifecycleError");
    assert.deepEqual(await counts(client), before);
  }
}));

test("PostgreSQL rejects null record payloads and impossible relationship task dates with domain errors", databaseTest, async () => withDatabase(async ({ client, repo, insert }) => {
  await client.query("update orbit_records set payload='null'::jsonb where collection_name='connections'");
  await assert.rejects(repo.mutate(mutation, () => { throw new Error("must not run"); }), (error: unknown) => error instanceof Error && error.name === "RelationshipLifecycleError");
  await client.query("update orbit_records set payload=$1 where collection_name='connections'", [connectionPayload]);
  await insert("tasks", "task:bad", actorId, { id: "task:bad", connectionId, contactId, title: "Invalid date", relationshipPurpose: "follow_up", status: "open", dueAt: "2026-02-30T01:00:00Z", createdAt: now, updatedAt: now });
  await assert.rejects(repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now })), { code: "INVALID_TASK" });
  assert.equal((await counts(client)).receipts, "0");
}));

test("PostgreSQL rejects relationship tasks with missing contact identity", databaseTest, async () => withDatabase(async ({ repo, insert }) => {
  await insert("tasks", "task:missing-contact", actorId, { id: "task:missing-contact", connectionId, title: "Missing contact", relationshipPurpose: "follow_up", status: "open", dueAt: now, createdAt: now, updatedAt: now });
  await assert.rejects(repo.read(actorId, connectionId), { code: "FORBIDDEN" });
}));

test("PostgreSQL normalizes valid stored timestamps to UTC before persisting receipt snapshots", databaseTest, async () => withDatabase(async ({ client, repo }) => {
  await client.query("update orbit_records set payload=payload || $1::jsonb where collection_name='connections'", [{ createdAt: "2026-08-21T10:00:00+09:00", updatedAt: "2026-08-21T10:00:00+09:00" }]);
  const first = await repo.mutate(mutation, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now }));
  assert.equal(first.snapshot.connection.createdAt, "2026-08-21T01:00:00.000Z");
  assert.deepEqual((await repo.mutate(mutation, () => { throw new Error("must replay"); })).snapshot, first.snapshot);
}));
