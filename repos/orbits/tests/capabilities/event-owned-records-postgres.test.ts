/**
 * W0041 SC-03 (b)：旧活动表 `listEvents` 的归属过滤下推到 SQL。
 *
 * - Postgres 专用 reader 只发一条带 actor 条件的 OR 查询（`user_id = actor` 或 `payload.accountId` 是等于 actor 的
 *   jsonb 字符串），与原「整 workspace 读取 + Node 严格相等过滤」逐条、逐序相等；
 * - 覆盖 userId 命中、accountId 命中、数字／数组／对象 accountId、两者都不命中、deleted、其他 workspace、actor 两端空白；
 * - 无 actor 0 查询返回 []；没有 reader 的 store（内存／注入）照旧走原路径；
 * - configured provider 注入了 reader（不再发出只按 workspace + collection 的读取）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  createConfiguredStorageEventStoreProvider,
  createStorageEventStoreProvider,
  type StorageEventPayload,
} from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import { createPostgresOwnedEventRecordReader } from "../../features/events/event-crud-and-import/providers/owned-events-postgres-reader";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:w0041-owned-events";

function payload(title: string, accountId?: unknown): StorageEventPayload {
  return {
    ...(accountId === undefined ? {} : { accountId }),
    description: `About ${title}`,
    endsAt: "2026-10-12T03:00:00.000Z",
    evidence: [{ capturedAt: "2026-10-01T00:00:00.000Z", createdBy: "w0041", evidenceId: `evidence:${title}`, excerpt: "owned" }],
    nextAction: "next",
    startsAt: "2026-10-12T01:00:00.000Z",
    status: "confirmed",
    title,
    venue: "Tokyo",
  };
}

test("W0041 owned-event reader: no actor issues no statement", async () => {
  const calls: string[] = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string) {
      calls.push(text);
      return { rows: [] as TRow[] };
    },
  };
  const provider = createStorageEventStoreProvider({
    ownedEventRecordReader: createPostgresOwnedEventRecordReader({ client, workspaceId: WORKSPACE }),
    store: createMemoryLiveRecordStore<StorageEventPayload>(),
    workspaceId: WORKSPACE,
  });
  assert.deepEqual(await provider.listEvents(undefined), []);
  assert.deepEqual(await provider.listEvents("   "), []);
  assert.deepEqual(calls, []);
});

test("W0041 owned-event reader: one statement, actor-bound, strict jsonb string comparison, never `payload ->> 'accountId'`", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      return { rows: [] as TRow[] };
    },
  };
  const read = createPostgresOwnedEventRecordReader({ client, workspaceId: WORKSPACE });
  assert.deepEqual(await read("account:a"), []);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.deepEqual(call!.values, [WORKSPACE, "events", "account:a"]);
  assert.match(call!.text, /user_id = \$3 or payload -> 'accountId' = to_jsonb\(\$3::text\)/u);
  assert.match(call!.text, /lifecycle_state <> 'deleted'/u);
  assert.doesNotMatch(call!.text, /->>\s*'accountId'/u);
  assert.doesNotMatch(call!.text, /\blimit\b/iu);
});

test("W0041 owned-event reader: a store without the reader (memory) keeps the original filter path", async () => {
  const store = createMemoryLiveRecordStore<StorageEventPayload>();
  const base = {
    collectionName: "events", createdAt: "2026-10-01T00:00:00.000Z", deletedAt: null, evidenceIds: [], lifecycleState: "active" as const,
    occurredAt: "2026-10-01T00:00:00.000Z", provider: null, providerRecordId: null, searchText: null, sourceId: "s", sourceLabel: null,
    sourceType: "manual", targetId: null, targetType: null, updatedAt: "2026-10-01T00:00:00.000Z", workspaceId: WORKSPACE,
  };
  await store.upsertRecord({ ...base, payload: payload("mine"), recordId: "events:mine", userId: "account:a" });
  await store.upsertRecord({ ...base, payload: payload("by-account", "account:a"), recordId: "events:by-account", userId: "account:b" });
  await store.upsertRecord({ ...base, payload: payload("theirs"), recordId: "events:theirs", userId: "account:b" });
  const provider = createStorageEventStoreProvider({ store, workspaceId: WORKSPACE });
  assert.deepEqual((await provider.listEvents("account:a")).map((event) => event.id).sort(), ["events:by-account", "events:mine"]);
});

async function withSchema(run: (input: { client: LiveRecordSqlClient; pool: Pool; schema: string; statements: string[] }) => Promise<void>) {
  assert.ok(databaseUrl);
  const schema = `w0041_owned_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const statements: string[] = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      statements.push(text);
      return { rows: (await pool.query(text, values as unknown[])).rows as TRow[] };
    },
  };
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await run({ client, pool, schema, statements });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

test("W0041 PG owned-event reader equals the old whole-workspace read + JS filter, row by row and in order", pgSkip, async () => {
  await withSchema(async ({ client, pool, statements }) => {
    let minute = 0;
    async function insert(recordId: string, userId: string | null, body: unknown, options: { lifecycle?: string; workspaceId?: string; occurredAt?: string | null } = {}) {
      minute += 1;
      const stamp = new Date(Date.parse("2026-10-01T00:00:00.000Z") + minute * 60_000).toISOString();
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at, occurred_at, lifecycle_state)
         values ($1, 'events', $2, $3, 'manual', $2, $4::jsonb, $5, $5, $6, $7)`,
        [options.workspaceId ?? WORKSPACE, recordId, userId, JSON.stringify(body), stamp, options.occurredAt === undefined ? stamp : options.occurredAt, options.lifecycle ?? "active"],
      );
    }
    // interleaved userId hits and accountId hits, with look-alikes that must not match
    await insert("events:a-user-1", "account:a", payload("a-user-1"));
    await insert("events:a-account-1", "account:b", payload("a-account-1", "account:a"));
    await insert("events:b-only", "account:b", payload("b-only"));
    await insert("events:a-user-2", "account:a", payload("a-user-2", "account:b"));
    await insert("events:a-account-2", null, payload("a-account-2", "account:a"));
    await insert("events:number-account", "account:b", payload("number-account", 123));
    await insert("events:string-123", "account:b", payload("string-123", "123"));
    await insert("events:array-account", "account:b", payload("array-account", ["account:a"]));
    await insert("events:object-account", "account:b", payload("object-account", { id: "account:a" }));
    await insert("events:null-account", "account:b", payload("null-account", null));
    await insert("events:a-deleted", "account:a", payload("a-deleted"), { lifecycle: "deleted" });
    await insert("events:a-account-deleted", "account:b", payload("a-account-deleted", "account:a"), { lifecycle: "deleted" });
    await insert("events:a-other-workspace", "account:a", payload("a-other-workspace", "account:a"), { workspaceId: "workspace:elsewhere" });
    await insert("events:a-user-null-occurred", "account:a", payload("a-user-null-occurred"), { occurredAt: null });
    await insert("events:a-user-3", "account:a", payload("a-user-3"));
    await insert("events:a-account-3", "account:c", payload("a-account-3", "account:a"));
    // other collection with the same owner must not leak in
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at)
       values ($1, 'contacts', 'contacts:a', 'account:a', 'manual', 'x', '{"accountId":"account:a"}'::jsonb, now(), now())`,
      [WORKSPACE],
    );
    const store = createPostgresLiveRecordStore<StorageEventPayload>({ client });
    const oldProvider = createStorageEventStoreProvider({ store, workspaceId: WORKSPACE });
    const newProvider = createStorageEventStoreProvider({
      ownedEventRecordReader: createPostgresOwnedEventRecordReader({ client, workspaceId: WORKSPACE }),
      store,
      workspaceId: WORKSPACE,
    });
    for (const actor of ["account:a", " account:a ", "account:b", "account:c", "123", "account:nobody"]) {
      statements.length = 0;
      const before = await oldProvider.listEvents(actor);
      assert.equal(statements.length, 1);
      assert.match(statements[0]!, /where workspace_id = \$1 and collection_name = \$2 and lifecycle_state <> 'deleted'\s+order by/u, "the old read is workspace + collection only");
      statements.length = 0;
      const after = await newProvider.listEvents(actor);
      assert.equal(statements.length, 1, `one statement for ${actor}`);
      assert.deepEqual(after, before, `same events in the same order for ${actor}`);
    }
    const owned = await newProvider.listEvents("account:a");
    assert.deepEqual(owned.map((event) => event.id), [
      "events:a-account-3", "events:a-user-3", "events:a-user-null-occurred", "events:a-account-2", "events:a-user-2", "events:a-account-1", "events:a-user-1",
    ]);
    assert.deepEqual((await newProvider.listEvents("123")).map((event) => event.id), ["events:string-123"], "a numeric accountId never equals a string actor");
    // getEvent is unchanged (single-row read)
    assert.equal((await newProvider.getEvent("events:a-account-1", "account:a"))?.id, "events:a-account-1");
    assert.equal(await newProvider.getEvent("events:number-account", "123"), null);
  });
});

test("W0041 PG configured provider injects the owned-event reader: no workspace-wide events read", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at)
       values ($1, 'events', 'events:mine', 'account:a', 'manual', 'x', $2::jsonb, now(), now()),
              ($1, 'events', 'events:theirs', 'account:b', 'manual', 'x', $3::jsonb, now(), now())`,
      [WORKSPACE, JSON.stringify(payload("mine")), JSON.stringify(payload("theirs"))],
    );
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const texts: Array<{ text: string; values: unknown[] }> = [];
    const original = Pool.prototype.query;
    Pool.prototype.query = function (this: Pool, ...args: unknown[]) {
      const [text, values] = args as [unknown, unknown];
      texts.push({ text: typeof text === "string" ? text : String((text as { text?: string }).text), values: Array.isArray(values) ? values : [] });
      return (original as (...input: unknown[]) => unknown).apply(this, args);
    } as typeof Pool.prototype.query;
    try {
      const provider = createConfiguredStorageEventStoreProvider({ env: { ORBIT_EVENT_DATABASE_URL: url.href, ORBIT_WORKSPACE_ID: WORKSPACE }, sourceLabel: "W0041 owned reader" });
      assert.ok(provider);
      assert.deepEqual((await provider.listEvents("account:a")).map((event) => event.id), ["events:mine"]);
    } finally {
      Pool.prototype.query = original;
    }
    const eventReads = texts.filter((entry) => /from\s+orbit_records/iu.test(entry.text));
    assert.equal(eventReads.length, 1);
    assert.ok(eventReads[0]!.values.includes("account:a"), "the read is bound to the actor");
  });
});
