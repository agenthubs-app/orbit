import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresContactCardReader } from "../../features/contacts/storage/contact-list-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("compact cards are bounded, permission scoped, signed and preserve global counts", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const schema = `contact_cards_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  let bytes = 0;
  let reads = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    reads += 1;
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const timestamp = "2026-09-17T00:00:00.000Z";
    const common = { workspaceId: "w", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active" as const };
    const seed = async (id: string, userId = "a") => store.upsertRecord({ ...common, userId, collectionName: "contacts", recordId: id, payload: {
      id, displayName: `東京联系人 ${id}`, organization: "Org", role: "designer", stage: "active",
      source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp,
      notes: "private note ".repeat(10000), nextAction: { text: "下一步".repeat(2000) },
    } });
    for (let n = 0; n < 35; n++) await seed(`c${String(n).padStart(3, "0")}`);
    await seed("foreign", "b");
    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3) });
    bytes = 0; reads = 0;
    const first = await reader.page({}, "a");
    assert.equal(reads, 1);
    assert.equal(first.items.length, 30);
    assert.equal(first.hasMore, true);
    assert.ok(bytes < 64_000, `page returned ${bytes} bytes`);
    assert.equal(first.items[0]?.nextActionPreview.length, 320);
    assert.ok(!JSON.stringify(first).includes("private note"));
    const second = await reader.page({ cursor: first.nextCursor }, "a");
    assert.equal(second.items.length, 5);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 35);
    assert.equal((await reader.page({}, "b")).items[0]?.id, "foreign");
    assert.equal((await reader.summary({}, "a")).total, 35);
    await assert.rejects(reader.page({ cursor: first.nextCursor }, "b"), /CONTACT_CURSOR_INVALID/);
    await assert.rejects(reader.page({ cursor: `${first.nextCursor}tampered` }, "a"), /CONTACT_CURSOR_INVALID/);
    await assert.rejects(reader.page({ cursor: first.nextCursor, statusFilters: ["nurture"] }, "a"), /CONTACT_CURSOR_INVALID/);
    await assert.rejects(reader.page({ limit: 51 }, "a"), /CONTACT_PAGE_INPUT_INVALID/);
    assert.equal((await reader.page({ query: "東京" }, "a")).items.length, 30);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
