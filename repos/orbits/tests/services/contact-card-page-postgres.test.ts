import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    await store.upsertRecord({ ...common, collectionName: "connections", recordId: "cn", payload: {
      id: "cn", accountId: "a", contactId: "c000", stage: "active", summary: "Private relationship context",
      valueTypes: ["strategic_fit", "commercial_opportunity", "strategic_fit"],
      source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp,
    } });
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
    assert.deepEqual(first.items.find(item => item.id === "c000")?.valueTypes, ["strategic_fit", "commercial_opportunity"]);
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

test("W0051 SC-04: tier filter is a server-side SQL filter; total, per-source counts and cursor paging agree under the filter", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const schema = `contact_cards_tier_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const timestamp = "2026-09-17T00:00:00.000Z";
    const common = { workspaceId: "w", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active" as const };
    const seed = async (id: string, sourceType: string, userId = "a") => store.upsertRecord({ ...common, userId, collectionName: "contacts", recordId: id, payload: {
      id, displayName: `联系人 ${id}`, organization: "Org", role: "designer", stage: "active",
      source: { type: sourceType, id: "s" }, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp,
    } });
    const strength = (contactId: string, tier: string, dormant: boolean, userId = "a") => store.upsertRecord({ ...common, userId, collectionName: "relationship_strengths",
      recordId: `relationship-strength:${userId}:${contactId}`, payload: { contactId, tier, dormant, score: 50, signals: [] } });
    // 35 位核心（25 扫名片 + 10 手动），5 位有往来，3 位待唤醒（档位 core 但 dormant 优先），2 位没有缓存行。
    for (let n = 0; n < 45; n++) {
      const id = `c${String(n).padStart(3, "0")}`;
      await seed(id, n < 25 || (n >= 35 && n < 40) ? "business_card_ocr" : "manual");
      if (n < 35) await strength(id, "core", false);
      else if (n < 40) await strength(id, "active", false);
      else if (n < 43) await strength(id, "core", true);
    }
    // 他人的档位行不影响 a 的筛选；他人的联系人不出现。
    await seed("foreign", "manual", "b");
    await strength("foreign", "core", false, "b");
    await strength("c044", "core", false, "b");
    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3) });

    const unfiltered = await reader.summary({}, "a");
    assert.equal(unfiltered.total, 45);

    const core = await reader.summary({ tierFilters: ["core"] }, "a");
    assert.equal(core.total, 35);
    assert.deepEqual(core.sources, { business_card_ocr: 25, manual: 10 });
    const first = await reader.page({ tierFilters: ["core"] }, "a");
    assert.equal(first.items.length, 30);
    assert.equal(first.hasMore, true);
    const second = await reader.page({ cursor: first.nextCursor, tierFilters: ["core"] }, "a");
    assert.equal(second.items.length, 5);
    assert.equal(second.hasMore, false);
    const ids = [...first.items, ...second.items].map((item) => item.id);
    assert.equal(new Set(ids).size, 35);
    assert.ok(ids.every((id) => Number(id.slice(1)) < 35));
    // 游标绑定档位筛选：换筛选或去掉筛选都拒绝。
    await assert.rejects(reader.page({ cursor: first.nextCursor }, "a"), /CONTACT_CURSOR_INVALID/);
    await assert.rejects(reader.page({ cursor: first.nextCursor, tierFilters: ["active"] }, "a"), /CONTACT_CURSOR_INVALID/);

    const dormant = await reader.summary({ tierFilters: ["dormant"] }, "a");
    assert.equal(dormant.total, 3);
    assert.deepEqual((await reader.page({ tierFilters: ["dormant"] }, "a")).items.map((item) => item.id).sort(), ["c040", "c041", "c042"]);
    const scanActive = await reader.summary({ sourceFilters: ["business_card_ocr"], tierFilters: ["active"] }, "a");
    assert.equal(scanActive.total, 5);
    assert.deepEqual(scanActive.sources, { business_card_ocr: 5 });
    // 选多个档位 = 并集；未知档位拒绝。
    assert.equal((await reader.summary({ tierFilters: ["active", "dormant"] }, "a")).total, 8);
    await assert.rejects(reader.page({ tierFilters: ["vip"] }, "a"), /CONTACT_PAGE_INPUT_INVALID/);
    // 没有档位时游标作用域的验证见下一个用例（基线实现生成的固定游标）。
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});

test("W0051 review P3: a cursor signed by the baseline implementation (4ea98833, no tier filter) still decodes and pages with the new reader", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  // 夹具由基线 4ea98833 的 contact-list-postgres-reader 在同样的 35 位联系人上生成（见 tests/fixtures/w0051-baseline-contact-cursor.json）。
  const fixture = JSON.parse(readFileSync(join(__dirname, "../fixtures/w0051-baseline-contact-cursor.json"), "utf8")) as { cursorSecret: string; cursor: string; firstPageIds: string[] };
  const schema = `contact_cards_fixture_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const timestamp = "2026-09-17T00:00:00.000Z";
    const common = { workspaceId: "w", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active" as const };
    for (let n = 0; n < 35; n++) {
      const id = `c${String(n).padStart(3, "0")}`;
      await store.upsertRecord({ ...common, collectionName: "contacts", recordId: id, payload: { id, displayName: `联系人 ${id}`, organization: "Org", role: "designer", stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp } });
    }
    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: fixture.cursorSecret });
    const first = await reader.page({}, "a");
    assert.deepEqual(first.items.map((item) => item.id), fixture.firstPageIds);
    assert.equal(first.nextCursor, fixture.cursor, "the new reader signs byte-identical cursors without a tier filter");
    const second = await reader.page({ cursor: fixture.cursor }, "a");
    assert.equal(second.items.length, 5);
    assert.equal(new Set([...fixture.firstPageIds, ...second.items.map((item) => item.id)]).size, 35);
    // 基线游标不能用在带档位筛选的查询上（作用域不同）。
    await assert.rejects(reader.page({ cursor: fixture.cursor, tierFilters: ["core"] }, "a"), /CONTACT_CURSOR_INVALID/);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
