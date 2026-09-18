import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { SYNC_REVISION_MIGRATION_SQL } from "../../features/sync/migrations";
import { createIncrementalSyncReadService } from "../../features/sync/read-service";
import type { SyncChange } from "../../shared/contract/sync";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

// Three-layer topology: this local Postgres plays the cloud host holding every
// user's data; the only authorization filter under test is the server read path.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const WORKSPACE = "workspace:flow-topology";
const A = "actor:a";
const B = "actor:b";
const ORGANIZER = "actor:organizer";
const NOW = "2026-09-18T01:00:00.000Z";
const SEED = { a: { contacts: 30, tasks: 5 }, b: { contacts: 10, tasks: 3 }, organizer: { events: 2, tasks: 2 } };

async function createHost(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local host simulation only");
  const schema = `flow_topology_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=10000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => {
    try { await client.close(); } finally {
      try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
    }
  });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(SYNC_REVISION_MIGRATION_SQL);
  return { client, store: createPostgresLiveRecordStore({ client }) };
}

const INSERT = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
  values ($1,$2,$3,$4,'manual','flow-topology',$5::jsonb,$6,$6)`;

async function insertContact(client: TransactionalSqlExecutor, owner: string, id: string) {
  const base = { source: { type: "manual", id: "flow-topology" }, evidenceIds: ["evidence:seed"], createdAt: NOW, updatedAt: NOW };
  await client.query(INSERT, [WORKSPACE, "contacts", id, owner, JSON.stringify({ ...base, id, displayName: `Contact ${id}`, stage: "captured" }), NOW]);
  await client.query(INSERT, [WORKSPACE, "connections", `connection:${id}`, owner, JSON.stringify({
    ...base, id: `connection:${id}`, contactId: id, accountId: owner, summary: `Relationship ${id}`, stage: "active", version: 1, valueTypes: [],
  }), NOW]);
}

/** Sync collections are trigger-guarded: writers must hold the sync write lock inside the transaction. */
async function insertTaskUnderLock(client: { transaction<T>(run: (tx: TransactionalSqlExecutor) => Promise<T>): Promise<T> }, owner: string, id: string) {
  await client.transaction(async (tx) => {
    await tx.query("select orbit_records_acquire_sync_write_lock('tasks')");
    await tx.query(INSERT, [WORKSPACE, "tasks", id, owner, JSON.stringify({
      id, accountId: owner, title: `Task ${id}`, status: "open", source: { type: "manual", id: "flow-topology" },
      evidenceIds: ["evidence:seed"], createdAt: NOW, updatedAt: NOW,
    }), NOW]);
  });
}

type Host = Awaited<ReturnType<typeof createHost>>;

async function seedHost({ client }: Host) {
  for (let n = 1; n <= SEED.a.contacts; n += 1) await insertContact(client, A, `contact:a:${n}`);
  for (let n = 1; n <= SEED.b.contacts; n += 1) await insertContact(client, B, `contact:b:${n}`);
  for (let n = 1; n <= SEED.a.tasks; n += 1) await insertTaskUnderLock(client, A, `task:a:${n}`);
  for (let n = 1; n <= SEED.b.tasks; n += 1) await insertTaskUnderLock(client, B, `task:b:${n}`);
  for (let n = 1; n <= SEED.organizer.tasks; n += 1) await insertTaskUnderLock(client, ORGANIZER, `task:organizer:${n}`);
  for (let n = 1; n <= SEED.organizer.events; n += 1) {
    await client.query(INSERT, [WORKSPACE, "events", `event:${n}`, ORGANIZER, JSON.stringify({
      id: `event:${n}`, name: `Event ${n}`, location: "Tokyo", startsAt: NOW, endsAt: NOW, organizerId: ORGANIZER,
      source: { type: "manual", id: "flow-topology" }, evidenceIds: ["evidence:seed"],
    }), NOW]);
  }
}

function syncService(client: TransactionalSqlExecutor) {
  return createIncrementalSyncReadService({ client, cursorSecret: "flow-topology-test-secret-0123456789abcdef0123456789abcdef" });
}

async function pullAll(service: ReturnType<typeof syncService>, actorId: string, limit: number) {
  const changes: SyncChange[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await service.readPage({ actorId, workspaceId: WORKSPACE, cursor, limit });
    pages += 1;
    changes.push(...page.changes);
    cursor = page.nextCursor;
    if (!page.hasMore) return { changes, cursor, pages };
    assert.ok(pages < 50, "pagination must terminate");
  }
}

function owners(changes: readonly SyncChange[]) {
  return changes.map((change) => {
    const payload = change.payload as Record<string, unknown> | undefined;
    return { id: change.id, accountId: payload?.accountId, ownerUserId: payload?.ownerUserId };
  });
}

function contactsService({ client, store }: Host) {
  return createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({
      store,
      workspaceId: WORKSPACE,
      contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId: WORKSPACE }),
      contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId: WORKSPACE }),
    }),
  });
}

test("server-side filter: A's sync pages and contact list never carry B's or the organizer's rows", options, async (t) => {
  const h = await createHost(t);
  await seedHost(h);
  const service = syncService(h.client);

  const a = await pullAll(service, A, 2);
  assert.ok(a.pages >= 3, "limit 2 must page through A's rows");
  assert.equal(a.changes.length, SEED.a.tasks);
  for (const row of owners(a.changes)) {
    assert.equal(row.accountId, A, `${row.id} accountId`);
    assert.equal(row.ownerUserId, A, `${row.id} ownerUserId`);
    assert.doesNotMatch(row.id, /:(b|organizer):/);
  }
  const b = await pullAll(service, B, 100);
  assert.equal(b.changes.length, SEED.b.tasks);
  assert.ok(b.changes.every((change) => change.id.startsWith("task:b:")));

  // A's cursor is bound to A; presenting it as B is rejected before any row is read.
  await assert.rejects(service.readPage({ actorId: B, workspaceId: WORKSPACE, cursor: a.cursor, limit: 10 }));

  const contacts = contactsService(h);
  const forA = await contacts.listContacts({ actorId: A });
  assert.ok(forA.success);
  assert.equal(forA.data.contacts.length, SEED.a.contacts);
  assert.ok(forA.data.contacts.every((contact) => contact.id.startsWith("contact:a:")), "no B contact leaks into A");
  const forB = await contacts.listContacts({ actorId: B });
  assert.ok(forB.success);
  assert.equal(forB.data.contacts.length, SEED.b.contacts);
  assert.ok(forB.data.contacts.every((contact) => contact.id.startsWith("contact:b:")));
});

test("three pulls: full → exactly one delta after a locked write → zero", options, async (t) => {
  const h = await createHost(t);
  await seedHost(h);
  const service = syncService(h.client);

  const first = await service.readPage({ actorId: A, workspaceId: WORKSPACE, limit: 100 });
  assert.equal(first.hasMore, false);
  assert.equal(first.changes.length, SEED.a.tasks);
  assert.ok(first.changes.length > 0);

  await insertTaskUnderLock(h.client, A, "task:a:new");
  await insertTaskUnderLock(h.client, B, "task:b:new"); // B's concurrent write must not surface for A.

  const second = await service.readPage({ actorId: A, workspaceId: WORKSPACE, cursor: first.nextCursor, limit: 100 });
  assert.deepEqual(second.changes.map((change) => change.id), ["task:a:new"]);
  assert.equal(second.hasMore, false);
  assert.ok(BigInt(second.highWatermark) > BigInt(first.highWatermark));

  const third = await service.readPage({ actorId: A, workspaceId: WORKSPACE, cursor: second.nextCursor, limit: 100 });
  assert.deepEqual(third.changes, []);
  assert.equal(third.hasMore, false);
});

test("sync collections reject writers that skip the write lock", options, async (t) => {
  const h = await createHost(t);
  await assert.rejects(
    h.client.query(INSERT, [WORKSPACE, "tasks", "task:unlocked", A, JSON.stringify({ id: "task:unlocked" }), NOW]),
    /SYNC_WRITE_LOCK_REQUIRED/,
  );
});
