import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";

import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { createMemoryRecordSource, createPostgresRecordSource, type MemoryRecord } from "../../features/agent-v1/domains/source";
import type { DomainKind, DomainQuery } from "../../features/agent-v1/domains/types";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { A, B, CURSOR_KEY, memo, pagedWorld, scopeOf, smallWorld, todo, WORKSPACE } from "./read-kit";

/**
 * agent-design AG05: the Postgres record source gives the same answers as the memory source the unit
 * tests use (scope, filters, order, keyset pages, counts, the deny list), on the generic record table of
 * a local isolated database. The authorization check (`existing`) returns keys only, never a record.
 * Needs ORBIT_LIFECYCLE_TEST_DATABASE_URL.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const pools: Pool[] = [];
after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

async function withSchema(records: MemoryRecord[], run: (client: { query: Pool["query"] }, seen: string[]) => Promise<void>) {
  assert.match(new URL(databaseUrl!).hostname, /^(localhost|127\.0\.0\.1|::1)$/u, "only a local database");
  const schema = `agent_v1_read_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const scoped = new URL(databaseUrl!);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: scoped.toString(), max: 1 });
  pools.push(admin, pool);
  await admin.query(`create schema "${schema}"`);
  try {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const record of records) {
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at)
         values ($1, $2, $3, $4, 'test', 'test', '{}', $5, $6, $7::jsonb, now(), coalesce($8::timestamptz, now()), $9)`,
        [record.workspaceId, record.collection, record.id, record.userId, record.deleted ? "deleted" : "active", record.searchText ?? "", JSON.stringify(record.payload), record.updatedAt ?? null, record.deleted ? new Date().toISOString() : null],
      );
    }
    const seen: string[] = [];
    await run({ query: (async (text: string, values?: unknown[]) => {
      const result = await pool.query(text, values);
      for (const row of result.rows) if (row.record_id) seen.push(String(row.record_id));
      return result;
    }) as Pool["query"] }, seen);
  } finally {
    await admin.query(`drop schema if exists "${schema}" cascade`);
  }
}

const QUERIES: [DomainKind, string, DomainQuery][] = [
  ["memo", A, { contactId: "contact:c17" }],
  ["memo", A, { contactId: "contact:c17", order: "oldest", text: "灰釉" }],
  ["memo", A, { from: "2026-01-10T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" }],
  ["memo", B, { contactId: "contact:c17" }],
  ["todo", A, { status: "open" }],
  ["todo", A, { text: "修订报价" }],
  ["schedule", A, { from: "2026-11-15T15:00:00.000Z", to: "2026-11-16T15:00:00.000Z" }],
  ["contact", A, { text: "小林" }],
  ["contact", A, { status: undefined, text: "东都精机的小林健さん" }],
];

test("Postgres and memory sources agree on scope, filters, order and pages", { skip }, async () => {
  const world = pagedWorld(25);
  world.records.push(todo(A, "task:done", "已完成", { status: "completed" }), memo(A, "note:gone", "已删的笔记 灰釉", "2026-01-02T00:00:00.000Z", ["contact:c17"]));
  world.records[world.records.length - 1].deleted = true;
  await withSchema(world.records, async (client) => {
    const events = { async byIds() { return []; } };
    const pg = createDomainRegistry({ cursorKey: CURSOR_KEY, events, now: () => "2026-11-15T01:00:00.000Z", source: createPostgresRecordSource(client) });
    const memory = createDomainRegistry({ cursorKey: CURSOR_KEY, events, now: () => "2026-11-15T01:00:00.000Z", source: createMemoryRecordSource(world.records) });
    for (const [kind, account, query] of QUERIES) {
      const left = await pg.read(kind, scopeOf(account), query);
      const right = await memory.read(kind, scopeOf(account), query);
      assert.deepEqual(left.items.map((item) => item.id), right.items.map((item) => item.id), `${kind} ${JSON.stringify(query)}`);
      assert.equal(left.total, right.total, `${kind} total`);
      if (left.nextCursor) {
        const next = await pg.read(kind, scopeOf(account), { ...query, cursor: left.nextCursor });
        const nextMemory = await memory.read(kind, scopeOf(account), { ...query, cursor: right.nextCursor });
        assert.deepEqual(next.items.map((item) => item.id), nextMemory.items.map((item) => item.id), `${kind} page 2`);
      }
    }
    const within = await pg.read("contact", scopeOf(A), { status: "within", text: "东和商事的田中浩さん" });
    assert.deepEqual(within.items.map((item) => item.id), ["contact:c30"]);
  });
});

test("AG20b R2: Postgres folds the stored text the same way as the memory source (spaces, 的/の, width, case)", { skip }, async () => {
  const records = [todo(A, "task:r2a", "回复 Mara 的报价"), todo(A, "task:r2b", "窑炉の点検"), todo(A, "task:r2c", "ＦＩＸ　Ｋｉｌｎ ｄｏｏｒ")];
  await withSchema(records, async (client) => {
    const events = { async byIds() { return []; } };
    const pg = createDomainRegistry({ cursorKey: CURSOR_KEY, events, now: () => "2026-11-15T01:00:00.000Z", source: createPostgresRecordSource(client) });
    const memory = createDomainRegistry({ cursorKey: CURSOR_KEY, events, now: () => "2026-11-15T01:00:00.000Z", source: createMemoryRecordSource(records) });
    for (const [text, expected] of [["回复mara", ["task:r2a"]], ["窑炉点検", ["task:r2b"]], ["fix kiln", ["task:r2c"]], ["的", ["task:r2a"]], ["回复 Lena", []]] as const) {
      const left = (await pg.read("todo", scopeOf(A), { text })).items.map((item) => item.id);
      const right = (await memory.read("todo", scopeOf(A), { text })).items.map((item) => item.id);
      assert.deepEqual(left, expected, `postgres: ${text}`);
      assert.deepEqual(right, expected, `memory: ${text}`);
    }
  });
});

test("Postgres: a withdrawn record is counted, never returned; the existence check returns no record", { skip }, async () => {
  const world = smallWorld();
  await withSchema(world.records, async (client, seen) => {
    const source = createPostgresRecordSource(client);
    const denied = new Set(["note:m31"]);
    const registry = createDomainRegistry({ cursorKey: CURSOR_KEY, denied: () => denied, events: { async byIds() { return []; } }, now: () => "2026-11-15T01:00:00.000Z", source });
    const read = await registry.read("memo", scopeOf(A), { contactId: "contact:c17" });
    assert.deepEqual(read.items.map((item) => item.id), ["note:m32"]);
    assert.equal(read.withheld, 1);
    assert.ok(read.partialReasons.includes("withheld"));
    await assert.rejects(registry.read("memo", scopeOf(A), { id: "note:m31" }), /READ_NOT_FOUND/u);
    assert.equal(seen.includes("note:m31"), false, "the withdrawn note was never returned by a query");
    const before = seen.length;
    const visible = await source.existing({ accountId: A, workspaceId: WORKSPACE }, [{ collection: "notes", id: "note:m37" }, { collection: "notes", id: "note:mb1" }, { collection: "tasks", id: "task:t42" }]);
    assert.deepEqual([...visible].sort(), ["notes:note:m37", "tasks:task:t42"]);
    assert.equal(seen.length, before, "the existence check returned no record id");
  });
});
