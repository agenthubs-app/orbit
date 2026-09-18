import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createRelationshipInitializationService } from "../../features/connections/lifecycle/initialization";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { createPostgresRelationshipLifecycleRepository } from "../../features/connections/lifecycle/postgres-repository";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { RelationshipInitializationChoice, RelationshipInitializationInput } from "../../shared/contract/relationship-lifecycle";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const db = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required" };
const workspaceId = "workspace:initialization-test";
const now = "2026-09-17T01:00:00.000Z";
const task = { taskId: "relationship-task:new", title: "确认合作需求", dueAt: "2026-10-01T09:00:00+08:00" };
async function fixture(run: (f: { client: TransactionalPostgresClient; service: ReturnType<typeof createRelationshipInitializationService>; input(actor?: string, choice?: RelationshipInitializationChoice): Promise<RelationshipInitializationInput>; records(): Promise<unknown> }) => Promise<void>, legacy = false) {
  assert.ok(databaseUrl);
  const schema = `initialization_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runRelationshipLifecycleMigrations(client);
    // Minimal SQL authority fixture, not production schema or consent creation.
    await client.query(`create table event_ops_relationship_sides (workspace_id text, relationship_pair_id text, owner_actor_id text, contact_id text, connection_id text);
      create table event_ops_relationship_pairs (workspace_id text, relationship_pair_id text, request_id text);
      create table event_ops_contact_requests (workspace_id text, request_id text, relationship_pair_id text, status text);`);
    await client.query("insert into event_ops_relationship_pairs values ($1,'pair:1','request:1')", [workspaceId]);
    await client.query("insert into event_ops_contact_requests values ($1,'request:1','pair:1','accepted')", [workspaceId]);
    for (const actor of ["a", "b"]) {
      await client.query("insert into event_ops_relationship_sides values ($1,'pair:1',$2,$3,$4)", [workspaceId, actor, `contact:${actor}`, `connection:${actor}`]);
      for (const collection of ["contacts", "connections"]) {
        const id = `${collection === "contacts" ? "contact" : "connection"}:${actor}`;
        const payload = { id, stage: legacy ? "active" : "captured", ...(legacy ? {} : { version: 1, lifecycleInitialization: "pending" }),
          ...(collection === "connections" ? { accountId: actor, contactId: `contact:${actor}` } : { displayName: `Contact ${actor}` }),
          source: { type: "event_import", id: "event:test" }, evidenceIds: ["evidence:consent"], notes: "preserve private data", createdAt: now, updatedAt: now };
        await client.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,$2,$3,$4,'event_import','event:test',$5,$6,$6)", [workspaceId, collection, id, actor, payload, now]);
      }
    }
    const service = createRelationshipInitializationService({ client, workspaceId, now: () => now });
    const input = async (actor = "a", choice: RelationshipInitializationChoice = { stage: "active", activeGoal: "共同确认产品联调范围" }) => {
      const state = await service.read(actor, `contact:${actor}`);
      assert.equal(state.state, "pending");
      if (state.state !== "pending") throw new Error("Expected acquisition");
      return { expectedRevision: state.revision, idempotencyKey: `init:${actor}`, choice };
    };
    const records = async () => (await client.query("select collection_name,record_id,user_id,payload from orbit_records order by collection_name,record_id")).rows;
    await run({ client, service, input, records });
  } finally { await client.close(); try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } }
}

for (const choice of [{ stage: "active", activeGoal: "本人明确的合作目标" }, { stage: "needs_follow_up", nextTask: task }, { stage: "nurture", nextTask: task }, { stage: "archived" }] as RelationshipInitializationChoice[]) {
  test(`explicit ${choice.stage} initializes only the owner, canonical read/preflight and exact replay pass`, db, async () => fixture(async ({ client, service, input }) => {
    const beforeOther = await client.query("select payload from orbit_records where user_id='b' order by record_id");
    const command = await input("a", choice);
    const result = await service.initialize("a", "contact:a", command);
    assert.equal(result.replayed, false);
    assert.equal(result.snapshot.connection.stage, choice.stage);
    assert.equal(result.snapshot.connection.version, 2);
    const cold = createRelationshipInitializationService({ client, workspaceId });
    assert.deepEqual(await cold.read("a", "contact:a"), { state: "initialized", snapshot: result.snapshot });
    assert.deepEqual(await cold.initialize("a", "contact:a", command), { ...result, replayed: true });
    assert.deepEqual((await client.query("select payload from orbit_records where user_id='b' order by record_id")).rows, beforeOther.rows);
    assert.equal((await service.read("b", "contact:b")).state, "pending");
    const store = createPostgresLiveRecordStore({ client });
    const records = (await Promise.all(["contacts", "connections", "tasks"].map(collectionName => store.listRecords({ limit: "unbounded", workspaceId, userId: "a", collectionName })))).flat();
    assert.equal(assessRelationshipLifecycleMigration({ actorId: "a", workspaceId, records }).readyForCutover, true);
    assert.ok(records.filter(r => r.collectionName !== "tasks").every(r => r.payload.notes === "preserve private data"));
    if (choice.stage === "needs_follow_up" || choice.stage === "nurture") {
      const created = result.snapshot.tasks[0];
      assert.equal(created.dueAt, "2026-10-01T01:00:00.000Z");
      const canonical = createRelationshipLifecycleService(createPostgresRelationshipLifecycleRepository({ client, workspaceId }));
      const completed = await canonical.completeTask({ actorId: "a", connectionId: "connection:a", idempotencyKey: "complete:new", taskId: created.taskId,
        expectedConnectionVersion: 2, expectedTaskVersion: 1, outcome: { kind: "active", activeGoal: "已确认下一轮合作讨论" } });
      assert.equal(completed.snapshot.tasks[0].status, "completed");
      assert.deepEqual((await cold.initialize("a", "contact:a", command)).snapshot, result.snapshot, "replay returns initial receipt, not latest state");
    } else assert.equal(result.snapshot.tasks.length, 0);
  }));
}
test("historical accepted active/no-version defect is only repaired after the owner chooses", db, async () => fixture(async ({ service, input, records }) => {
  const before = await records(); await service.read("a", "contact:a"); assert.deepEqual(await records(), before);
  const result = await service.initialize("a", "contact:a", await input());
  assert.equal(result.snapshot.connection.version, 1);
}, true));
test("read and write reject other owner and fabricated contact prefix; pending consent never authorizes", db, async () => fixture(async ({ client, service, input, records }) => {
  const command = await input(); const before = await records();
  await assert.rejects(service.read("b", "contact:a"), { code: "NOT_FOUND" });
  await assert.rejects(service.initialize("b", "contact:a", command), { code: "NOT_FOUND" });
  await assert.rejects(service.read("a", "contact:event-consent:made-up"), { code: "NOT_FOUND" });
  await client.query("update event_ops_contact_requests set status='awaiting_target_consent'");
  await assert.rejects(service.initialize("a", "contact:a", command), { code: "NOT_FOUND" });
  assert.deepEqual(await records(), before);
}));
test("stale revision, unknown keys, no goal, missing/invalid date, and existing obligations never write", db, async () => fixture(async ({ client, service, input, records }) => {
  const command = await input(); const before = await records();
  for (const choice of [{ stage: "active", activeGoal: " " }, { stage: "active", activeGoal: "目标", actorId: "b" }, { stage: "nurture", nextTask: { ...task, dueAt: "2026-02-30T09:00:00Z" } }, { stage: "needs_follow_up", nextTask: { title: "没有日期" } }]) {
    await assert.rejects(service.initialize("a", "contact:a", { ...command, choice } as RelationshipInitializationInput));
  }
  await assert.rejects(service.initialize("a", "contact:a", { ...command, expectedRevision: "0".repeat(64) }), { code: "CONFLICT" });
  assert.deepEqual(await records(), before);
  await client.query("update orbit_records set payload=payload || '{\"notes\":\"new private note\"}'::jsonb where record_id='contact:a'");
  await assert.rejects(service.initialize("a", "contact:a", command), { code: "CONFLICT" });
  await client.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,'tasks','old','a','manual','test',$2,$3,$3)", [workspaceId, { id: "old", connectionId: "connection:a" }, now]);
  await assert.rejects(service.read("a", "contact:a"), { code: "INVALID_TRANSITION" });
}));
test("same-key parallel retries commit once; changed body and second initialization conflict", db, async () => fixture(async ({ client, service, input }) => {
  const command = await input("a", { stage: "needs_follow_up", nextTask: task });
  const results = await Promise.all([service.initialize("a", "contact:a", command), service.initialize("a", "contact:a", command)]);
  assert.deepEqual(results.map(r => r.replayed).sort(), [false, true]);
  assert.equal((await client.query("select * from orbit_records where collection_name='tasks'")).rows.length, 1);
  await assert.rejects(service.initialize("a", "contact:a", { ...command, choice: { stage: "archived" } }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(service.initialize("a", "contact:a", { ...command, idempotencyKey: "new" }), { code: "CONFLICT" });
}));
test("different-key concurrent choices allow exactly one and preserve the winner", db, async () => fixture(async ({ service, input }) => {
  const command = await input();
  const results = await Promise.allSettled([service.initialize("a", "contact:a", command), service.initialize("a", "contact:a", { ...command, idempotencyKey: "race", choice: { stage: "archived" } })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected" && r.reason.code === "CONFLICT").length, 1);
}));
test("task collision and audit failure roll back contact, connection, evidence, tasks and receipt", db, async () => fixture(async ({ client, service, input, records }) => {
  await client.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,'tasks',$2,'b','manual','test',$3,$4,$4)", [workspaceId, task.taskId, { id: task.taskId, title: "foreign preserved" }, now]);
  const command = await input("a", { stage: "needs_follow_up", nextTask: task });
  const before = await records();
  await assert.rejects(service.initialize("a", "contact:a", command), { code: "INVALID_TASK" });
  assert.deepEqual(await records(), before);
  assert.equal((await client.query("select * from relationship_lifecycle_command_receipts")).rows.length, 0);
  await client.query(`create function fail_init_audit() returns trigger language plpgsql as $$ begin if NEW.collection_name = 'relationship_lifecycle_audits' then raise exception 'injected'; end if; return NEW; end $$;
    create trigger fail_init_audit before insert on orbit_records for each row execute function fail_init_audit()`);
  await assert.rejects(service.initialize("a", "contact:a", { ...command, choice: { stage: "active", activeGoal: "目标" } }), /injected/);
  assert.deepEqual(await records(), before);
  assert.equal((await client.query("select * from relationship_lifecycle_command_receipts")).rows.length, 0);
}));
test("malformed ready snapshots and damaged receipt fail closed instead of claiming initialization", db, async () => fixture(async ({ client, service, input }) => {
  const command = await input();
  await service.initialize("a", "contact:a", command);
  await client.query("update relationship_lifecycle_command_receipts set response_snapshot=jsonb_set(response_snapshot,'{connection,activeGoal}','null'::jsonb)");
  await assert.rejects(service.initialize("a", "contact:a", command), { code: "INVALID_TRANSITION" });
  await client.query("update orbit_records set payload=payload || '{\"activeGoal\":null}'::jsonb where record_id='connection:a'");
  await assert.rejects(service.read("a", "contact:a"), { code: "INVALID_TRANSITION" });
}));
test("trigger-altered contact projection aborts the entire initialization", db, async () => fixture(async ({ client, service, input, records }) => {
  const command = await input(); const before = await records();
  await client.query(`create function corrupt_init_contact() returns trigger language plpgsql as $$ begin if NEW.collection_name = 'contacts' then NEW.payload := jsonb_set(NEW.payload, '{stage}', '"archived"'); end if; return NEW; end $$;
    create trigger corrupt_init_contact before update on orbit_records for each row execute function corrupt_init_contact()`);
  await assert.rejects(service.initialize("a", "contact:a", command), { code: "CONFLICT" });
  assert.deepEqual(await records(), before);
  assert.equal((await client.query("select * from relationship_lifecycle_command_receipts")).rows.length, 0);
}));
