import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresContactRecordPageReader } from "../../features/contacts/storage/contact-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

// The trigram index must change the plan, never the answer: the same queries
// are run on the bare table and after the migration, and compared row by row.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const W = "workspace:trgm";
const OWNER = "actor:owner";
const NOW = "2026-09-18T06:00:00.000Z";
const NAMES = [
  ["佐藤健一", "北星餐饮"], ["佐藤健司", "云端机器人"], ["高橋智子", "晨光餐饮"], ["伊藤香織", "蓝海餐饮"],
  ["渡辺颯太", "红桥餐饮"], ["小林浩二", "梅田餐饮"], ["山田千尋", "银座餐饮"], ["佐々木豪", "关西餐饮"],
  ["松本恵子", "青叶餐饮"], ["木村桜", "南山社群"], ["林恵", "竹林社群"], ["山崎凛", "晨光社群"],
  ["Emma Wilson", "Atlas Cloud"], ["Omar Rahman", "Contemporary Brand Studio"], ["Priya Rao", "Cloud Start Systems"],
  ["陈立安", "北辰软件"], ["田中爱子", "东京创业者联盟"], ["艾玛·威尔逊", "当代品牌工作室"], ["奥马尔·拉赫曼", "阿特拉斯云"],
  ["普丽娅·拉奥", "云启系统"], ["吴可欣", "南山餐饮"], ["刘雨薇", "晨光餐饮"], ["赵思琪", "蓝海餐饮"], ["张博文", "红桥餐饮"],
];
const QUERIES = ["佐藤", "佐藤健", "餐饮", "晨光餐饮", "云端", "云端机器人", "cloud", "CLOUD", "Emma", "emma wilson", "拉赫曼", "社群", "不存在的词", "健一"];

test("trigram search index changes the plan for ilike, never the results, and retires the unused tsvector index", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 60_000,
}, async () => {
  const schema = `trgm_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const statements: string[] = [];
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    statements.push(sql);
    const result = await pool.query(sql, values ? [...values] : undefined);
    return { rows: result.rows as T[] };
  } };
  // The bare table: every index except the trigram one, so "before" is today's production shape.
  const trgmBlock = /-- Substring search[\s\S]*?drop index if exists orbit_records_search_text_idx;/;
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, trgmBlock, "the trigram block must be one contiguous section of the schema");
  const bareSchemaSql = ORBIT_RECORDS_SCHEMA_SQL.replace(trgmBlock, "");
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(bareSchemaSql);
    const store = createPostgresLiveRecordStore({ client });
    let n = 0;
    for (const [displayName, organization] of NAMES) {
      n += 1;
      const id = `contact:${n}`;
      await store.upsertRecord({
        workspaceId: W, collectionName: "contacts", recordId: id, userId: OWNER, sourceType: "manual", sourceId: "trgm",
        evidenceIds: ["evidence:seed"], searchText: `${displayName} ${organization}`, createdAt: NOW, updatedAt: NOW, lifecycleState: "active",
        payload: { id, displayName, organization, stage: "captured", source: { type: "manual", id: "trgm" }, evidenceIds: ["evidence:seed"], createdAt: NOW, updatedAt: NOW },
      });
      await store.upsertRecord({
        workspaceId: W, collectionName: "connections", recordId: `connection:${id}`, userId: OWNER, sourceType: "manual", sourceId: "trgm",
        evidenceIds: ["evidence:seed"], searchText: `${displayName} relationship`, createdAt: NOW, updatedAt: NOW, lifecycleState: "active",
        payload: { id: `connection:${id}`, contactId: id, accountId: OWNER, summary: `Relationship with ${displayName}`, stage: "active", version: 1, valueTypes: [] },
      });
    }
    for (let noise = 0; noise < 40; noise += 1) {
      await store.upsertRecord({
        workspaceId: W, collectionName: "notes", recordId: `note:${noise}`, userId: OWNER, sourceType: "note", sourceId: `note:${noise}`,
        evidenceIds: [], searchText: `餐饮 会议纪要 ${noise} cloud`, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { id: `note:${noise}` },
      });
    }
    const pageReader = createPostgresContactRecordPageReader({ client, workspaceId: W });
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const query of QUERIES) {
        const generic = await store.listRecords({ workspaceId: W, collectionName: "contacts", searchText: query, limit: "unbounded" });
        const page = await pageReader({ query, limit: 50, cursor: null }, OWNER);
        out[query] = { generic: generic.map((record) => record.recordId), page: page ? JSON.parse(JSON.stringify(page)) : null };
      }
      return out;
    };
    const before = await snapshot();
    assert.ok((before["佐藤"] as { generic: string[] }).generic.length >= 2, "seed must produce hits");

    // Apply the real migration on the same data.
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL); // idempotent
    const indexes = (await pool.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = $1 and tablename = 'orbit_records'", [schema])).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("orbit_records_search_text_trgm_idx"), `trigram index must exist: ${indexes.join(",")}`);
    assert.ok(!indexes.includes("orbit_records_search_text_idx"), "the never-used tsvector index must be gone");
    assert.equal((await pool.query("select count(*) from pg_extension where extname = 'pg_trgm'")).rows[0].count, "1");

    const after = await snapshot();
    assert.deepEqual(after, before, "the index must not change a single result");

    // Plan shape for the search predicate itself. Production statements also filter by
    // workspace/collection; on a real-sized table the planner may AND both bitmaps.
    const plan = async (query: string) => {
      await pool.query("set enable_seqscan = off");
      const rows = await pool.query<{ "QUERY PLAN": string }>(
        "explain select record_id from orbit_records where search_text ilike $1",
        [`%${query}%`],
      );
      await pool.query("reset enable_seqscan");
      return rows.rows.map((row) => row["QUERY PLAN"]).join("\n");
    };
    const cost = (planText: string) => Number(/cost=[\d.]+\.\.([\d.]+)/.exec(planText)?.[1] ?? Number.NaN);
    const three = await plan("佐藤健");
    assert.match(three, /orbit_records_search_text_trgm_idx/, "a 3-character query must use the trigram index");
    assert.match(await plan("cloud"), /orbit_records_search_text_trgm_idx/);
    // Known limitation, recorded on purpose: a two-character pattern yields no trigram. The index is
    // still "usable" but degenerates to a full index scan, which the planner prices far above a real lookup.
    const two = await plan("佐藤");
    assert.ok(cost(two) > 10 * cost(three), `2-character search must be priced as a degenerate scan: ${cost(two)} vs ${cost(three)}`);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
