/**
 * W0047 SC-W0047-02（真实 PostgreSQL）：关系强度读模型与刷新。
 *
 * - 首次 ensure 批量读完整时间线、单事务写入全部行与 state（tierCountsAt30d／earliestCaptureAt 与纯函数一致）；
 * - 来源戳与东京日都没变时只读一条「来源戳 + state」语句，时间线读取 0 次；
 * - 写一条 memo 后重算；跨东京日、rulesVersion 变化都重算；
 * - 两个并发刷新与串行结果相同；删除全部缓存行后重算结果相同；
 * - 他人 0 行；connections 集合 0 次写；
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库，随机 schema，用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { runPlanMigrations } from "../../features/plans/migrations";
import { computeRelationshipStrength, computeRelationshipTierCountsAt } from "../../features/relationship-strength/compute";
import {
  createPostgresRelationshipStrengthStore,
  ensureRelationshipStrengths,
  readRelationshipStrengths,
  readRelationshipTierBoard,
  RELATIONSHIP_STRENGTH_COLLECTION,
  RELATIONSHIP_STRENGTH_STATE_COLLECTION,
  type RelationshipStrengthPostgresClient,
} from "../../features/relationship-strength/read-model";
import { RELATIONSHIP_STRENGTH_RULES } from "../../features/relationship-strength/rules";
import { readRelationshipTimelinesForActor } from "../../features/relationship-strength/timelines";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WORKSPACE = "workspace:strength";
const ALICE = "actor:alice";
const BOB = "actor:bob";
const NOW = new Date("2026-10-02T03:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

interface Meter { statements: string[]; writes: string[]; bytes: number }

function meteredClient(pool: Pool, url: string, meter: Meter): RelationshipStrengthPostgresClient {
  const base = createTransactionalPostgresClient({ connectionString: url, pool: pool as never });
  const wrap = (executor: { query: RelationshipStrengthPostgresClient["query"] }) => ({
    async query<TRow>(text: string, values?: readonly unknown[]) {
      meter.statements.push(text);
      if (/^\s*(\/\*[^*]*\*\/\s*)?(insert|update|delete)/i.test(text)) meter.writes.push(text);
      const result = await executor.query<TRow>(text, values);
      for (const row of result.rows) meter.bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
      return result;
    },
  });
  return {
    ...wrap(base),
    transaction: (operation, options) => base.transaction((tx) => operation(wrap(tx)), options),
  };
}

async function insertRecord(pool: Pool, input: { collection: string; id: string; userId: string; payload: Record<string, unknown>; createdAt?: string }) {
  const at = input.createdAt ?? "2026-06-01T00:00:00.000Z";
  await pool.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
    values ($1, $2, $3, $4, 'manual', $3, 'active', $5::jsonb, $6, $6)`, [WORKSPACE, input.collection, input.id, input.userId, JSON.stringify(input.payload), at]);
}

const contactPayload = (id: string, actor: string, createdAt: string, sourceType = "business_card_ocr") =>
  ({ id, accountId: actor, displayName: id, stage: "active", customTags: ["vip"], source: { type: sourceType, id: `src:${id}` }, evidenceIds: [], createdAt, updatedAt: createdAt });

/** Alice：c-core（多来源近期往来）、c-dormant（120 天前很热、之后无记录）、c-new（刚扫名片）、c-many（>12 条信号）。Bob：b1。 */
async function seed(pool: Pool) {
  for (const [id, createdAt, type] of [["c-core", ago(200), "business_card_ocr"], ["c-dormant", ago(300), "qr_scan"], ["c-new", ago(2), "business_card_ocr"], ["c-many", ago(400), "manual"]] as const) {
    await insertRecord(pool, { collection: "contacts", id, userId: ALICE, createdAt, payload: contactPayload(id, ALICE, createdAt, type) });
  }
  await insertRecord(pool, { collection: "contacts", id: "b1", userId: BOB, payload: contactPayload("b1", BOB, ago(5)) });
  // 一条 connections 行（同步集合）：强度刷新绝不写它。
  await insertRecord(pool, { collection: "connections", id: "conn-core", userId: ALICE, payload: { id: "conn-core", accountId: ALICE, contactId: "c-core", stage: "active", relationshipStrength: 10, businessRelevanceScore: 10 } });

  const memo = (noteId: string, day: number) => ({ noteId: `note:live-contact-detail-update:${noteId}`, body: "memo", authorLabel: "我", createdAt: ago(day), occurredAt: ago(day).slice(0, 10), kind: "memo" });
  await insertRecord(pool, { collection: "contact_detail_states", id: `contact-detail:${ALICE}:c-core`, userId: ALICE, payload: { actorId: ALICE, contactId: "c-core", status: "archived", tags: ["x"], notes: [memo("m1", 10), memo("m2", 3)] } });
  await insertRecord(pool, { collection: "contact_detail_states", id: `contact-detail:${BOB}:b1`, userId: BOB, payload: { actorId: BOB, contactId: "b1", notes: [memo("bob", 1)] } });
  // memo 提取（W0046 memo_extractions）：m1 提取出 collaborated → 30 分。
  await insertRecord(pool, { collection: "memo_extractions", id: "memo-extraction:alice:m1", userId: ALICE, payload: { key: "k1", actorId: ALICE, contactId: "c-core", noteId: "note:live-contact-detail-update:m1", status: "succeeded", updatedAt: ago(9), output: { eventTypes: ["collaborated"] } } });

  const encounter = (id: string, actor: string, contactId: string, day: number) => insertRecord(pool, { collection: "human_encounters", id, userId: actor, payload: { encounterId: id, actorId: actor, contactId, observedAt: ago(day) } });
  await encounter("enc-core", ALICE, "c-core", 5);
  await encounter("enc-dormant-1", ALICE, "c-dormant", 120);
  await encounter("enc-bob", BOB, "b1", 1);

  const schedule = (id: string, contactIds: string[], day: number, kind = "meeting") => insertRecord(pool, {
    collection: "personal_schedule_items", id, userId: ALICE,
    payload: { id, accountId: ALICE, ownerUserId: ALICE, kind, title: id, startsAt: ago(day), state: day < 0 ? "upcoming" : "ended", contactIds },
  });
  await schedule("s-core", ["c-core"], 20);
  await schedule("s-dormant", ["c-dormant"], 121);
  await schedule("s-future", ["c-core"], -10);
  // c-many：每 20 天一次约见（18 条），当前缓存只留 12 条信号。
  for (let index = 0; index < 18; index += 1) await schedule(`s-many-${index}`, ["c-many"], 380 - index * 20);

  await insertRecord(pool, { collection: "tasks", id: "t-dormant", userId: ALICE, payload: { taskId: "t-dormant", actorId: ALICE, connectionId: "conn", contactId: "c-dormant", status: "completed", title: "t", updatedAt: ago(122) } });
  await insertRecord(pool, { collection: "notes", id: "note-1", userId: ALICE, payload: { note: { id: "note-1", accountId: ALICE, ownerUserId: ALICE, title: "n", body: "b", contactIds: ["c-core", "b1"], createdAt: ago(4) } } });

  await pool.query(`insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on) values ($1, 'plan:a', $2, 1, 'active', 'g', 'month', '2026-09-01')`, [WORKSPACE, ALICE]);
  await pool.query(`insert into plan_log (workspace_id, id, actor_id, plan_id, kind, event, author, body, linked_contact_ids, idempotency_key, created_at)
    values ($1, 'log-1', $2, 'plan:a', 'auto', 'contact_established', 'user', 'x', $3, 'log-1', $4)`, [WORKSPACE, ALICE, ["c-core"], ago(15)]);
}

async function withDatabase(run: (input: { pool: Pool; url: string }) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `strength_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 6, options: `-c search_path=${schema},public -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await seed(pool);
    await run({ pool, url: databaseUrl });
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

const isTimelineRead = (statement: string) => statement.includes("relationship-strength:timeline:");

async function cacheRows(pool: Pool, userId: string) {
  const result = await pool.query(`select record_id, payload from orbit_records where workspace_id = $1 and collection_name = $2 and user_id = $3 order by record_id`, [WORKSPACE, RELATIONSHIP_STRENGTH_COLLECTION, userId]);
  return result.rows as { record_id: string; payload: Record<string, unknown> }[];
}

test("SC-02: first ensure writes every row and the state in one transaction; unchanged stamp and day read the cache only", databaseTest, async () => {
  await withDatabase(async ({ pool, url }) => {
    const meter: Meter = { statements: [], writes: [], bytes: 0 };
    const store = createPostgresRelationshipStrengthStore({ client: meteredClient(pool, url, meter), workspaceId: WORKSPACE });
    const first = await ensureRelationshipStrengths(ALICE, NOW, { store });
    assert.equal(first.status, "recomputed");
    assert.equal(meter.statements.filter(isTimelineRead).length, 8);
    // 写只针对本读模型两个集合；connections 0 次写。
    assert.ok(meter.writes.length > 0);
    for (const write of meter.writes) {
      assert.match(write, /relationship-strength:(write-rows|write-state|clear-rows)/);
      assert.doesNotMatch(write, /'connections'/);
    }
    const rows = await cacheRows(pool, ALICE);
    assert.deepEqual(rows.map((row) => row.payload.contactId), ["c-core", "c-dormant", "c-many", "c-new"]);
    const byId = Object.fromEntries(rows.map((row) => [row.payload.contactId as string, row.payload]));
    assert.equal(byId["c-core"]!.tier, "core");
    assert.equal(byId["c-dormant"]!.dormant, true);
    assert.equal(byId["c-new"]!.tier, "new");
    assert.equal((byId["c-many"]!.signals as unknown[]).length, 12);
    // memo m1 的 collaborated 提取生效（30 分基础分）。
    const m1 = (byId["c-core"]!.signals as { timelineItemId: string; basePoints: number }[]).find((signal) => signal.timelineItemId === "memo:note:live-contact-detail-update:m1");
    assert.equal(m1?.basePoints, 30);
    // 他人 0 行；Bob 的联系人不在 Alice 的读模型里。
    assert.equal((await cacheRows(pool, BOB)).length, 0);
    const connections = await pool.query(`select payload, updated_at from orbit_records where collection_name = 'connections'`);
    assert.equal(connections.rows[0].payload.relationshipStrength, 10);

    // state 与纯函数一致（同一遍算出的 now − 30 天档位人数与最早建立时间）。
    const timelines = await readRelationshipTimelinesForActor(pool as never, WORKSPACE, { actorId: ALICE, now: NOW });
    const state = first.state!;
    assert.deepEqual(state.tierCountsAt30d, computeRelationshipTierCountsAt(timelines.timelines, new Date(NOW.getTime() - 30 * DAY)));
    assert.equal(state.earliestCaptureAt, ago(400));
    assert.equal(state.tokyoDate, "2026-10-02");
    assert.equal(state.rulesVersion, RELATIONSHIP_STRENGTH_RULES.version);
    assert.equal(state.contactCount, 4);
    // R-7：c-many 的 30 天前档位来自完整时间线（18 条），不是缓存的 12 条信号。
    assert.equal(timelines.timelines.get("c-many")!.filter((item) => item.source === "schedule").length, 18);
    assert.deepEqual(byId["c-core"], { ...computeRelationshipStrength(timelines.timelines.get("c-core")!, NOW), contactId: "c-core" });

    // 第二次：来源戳与东京日都未变 → 只读一条「来源戳 + state」，时间线 0 次、写 0 次。
    meter.statements.length = 0;
    meter.writes.length = 0;
    const second = await ensureRelationshipStrengths(ALICE, new Date(NOW.getTime() + 60_000), { store });
    assert.equal(second.status, "fresh");
    assert.equal(meter.statements.length, 1);
    assert.match(meter.statements[0]!, /relationship-strength:stamp-and-state/);
    // 本机库没有 sync_revision：退回 updated_at 口径（review P2-4 已知局限，见 REPORT）。
    assert.equal(store.stampMode(), "timestamp");
    assert.match(second.state!.sourceStamp, /^ts\|/);
    assert.equal(meter.writes.length, 0);

    // 列头人数统计全部、卡片按 lastSignalAt 倒序。
    const board = await readRelationshipTierBoard({ actorId: ALICE }, { store });
    assert.deepEqual(board.counts, { new: 1, active: 0, core: 2, dormant: 1 });
    assert.deepEqual(board.columns.core.map((card) => card.contactId), ["c-core", "c-many"]);
    const detail = await readRelationshipStrengths({ actorId: ALICE, contactIds: ["c-core", "b1"] }, { store });
    assert.deepEqual([...detail.keys()], ["c-core"]);
  });
});

test("SC-02: a new memo, a new Tokyo day or a new rules version recompute; everything else stays cached", databaseTest, async () => {
  await withDatabase(async ({ pool, url }) => {
    const meter: Meter = { statements: [], writes: [], bytes: 0 };
    const store = createPostgresRelationshipStrengthStore({ client: meteredClient(pool, url, meter), workspaceId: WORKSPACE });
    await ensureRelationshipStrengths(ALICE, NOW, { store });
    const before = (await cacheRows(pool, ALICE)).find((row) => row.payload.contactId === "c-new")!.payload;
    assert.equal(before.tier, "new");

    // 写一条 memo（与「写 memo」同一存储：contact_detail_states.notes 追加，updated_at 前进）。
    await insertRecord(pool, { collection: "contact_detail_states", id: `contact-detail:${ALICE}:c-new`, userId: ALICE, createdAt: NOW.toISOString(), payload: { actorId: ALICE, contactId: "c-new", notes: [
      { noteId: "note:live-contact-detail-update:new-1", body: "约了下周见面", createdAt: ago(1), occurredAt: ago(1).slice(0, 10), kind: "memo" },
    ] } });
    meter.statements.length = 0;
    const afterMemo = await ensureRelationshipStrengths(ALICE, new Date(NOW.getTime() + 60_000), { store });
    assert.equal(afterMemo.status, "recomputed");
    assert.ok(meter.statements.some(isTimelineRead));
    const after = (await cacheRows(pool, ALICE)).find((row) => row.payload.contactId === "c-new")!.payload;
    assert.ok((after.score as number) > (before.score as number));
    assert.ok((after.signals as { source: string }[]).some((signal) => signal.source === "memo"));

    // 跨东京日（东京 10-03 00:00 = UTC 10-02 15:00）重算；同日不重算。
    assert.equal((await ensureRelationshipStrengths(ALICE, new Date("2026-10-02T14:59:00.000Z"), { store })).status, "fresh");
    assert.equal((await ensureRelationshipStrengths(ALICE, new Date("2026-10-02T15:00:00.000Z"), { store })).status, "recomputed");
    // 规则版本变化重算。
    const bumped = { ...RELATIONSHIP_STRENGTH_RULES, version: "rs-test-bump" };
    assert.equal((await ensureRelationshipStrengths(ALICE, new Date("2026-10-02T15:01:00.000Z"), { store, rules: bumped })).status, "recomputed");
    assert.equal((await ensureRelationshipStrengths(ALICE, new Date("2026-10-02T15:02:00.000Z"), { store, rules: bumped })).status, "fresh");
  });
});

test("SC-02: two concurrent refreshes equal a serial one; wiping every cache row and recomputing gives the same rows", databaseTest, async () => {
  await withDatabase(async ({ pool, url }) => {
    const meter: Meter = { statements: [], writes: [], bytes: 0 };
    const store = createPostgresRelationshipStrengthStore({ client: meteredClient(pool, url, meter), workspaceId: WORKSPACE });
    const serial = await ensureRelationshipStrengths(ALICE, NOW, { store });
    const serialRows = await cacheRows(pool, ALICE);

    await pool.query(`delete from orbit_records where collection_name in ($1, $2)`, [RELATIONSHIP_STRENGTH_COLLECTION, RELATIONSHIP_STRENGTH_STATE_COLLECTION]);
    assert.equal((await cacheRows(pool, ALICE)).length, 0);
    const [a, b] = await Promise.all([
      ensureRelationshipStrengths(ALICE, NOW, { store }),
      ensureRelationshipStrengths(ALICE, NOW, { store }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), ["recomputed", "skipped"]);
    assert.deepEqual(await cacheRows(pool, ALICE), serialRows);
    const state = await pool.query(`select payload from orbit_records where collection_name = $1`, [RELATIONSHIP_STRENGTH_STATE_COLLECTION]);
    assert.equal(state.rows.length, 1);
    assert.deepEqual(state.rows[0].payload, serial.state);
  });
});

test("SC-02: a failing source read writes nothing and leaves the previous cache", databaseTest, async () => {
  await withDatabase(async ({ pool, url }) => {
    const meter: Meter = { statements: [], writes: [], bytes: 0 };
    const client = meteredClient(pool, url, meter);
    const store = createPostgresRelationshipStrengthStore({ client, workspaceId: WORKSPACE });
    await ensureRelationshipStrengths(ALICE, NOW, { store });
    const previous = await cacheRows(pool, ALICE);
    const failing = createPostgresRelationshipStrengthStore({
      client: { ...client, query: (text, values) => (text.includes("timeline:notes") ? Promise.reject(new Error("injected")) : client.query(text, values)) },
      workspaceId: WORKSPACE,
    });
    await assert.rejects(ensureRelationshipStrengths(ALICE, new Date("2026-10-03T03:00:00.000Z"), { store: failing }), /injected/);
    assert.deepEqual(await cacheRows(pool, ALICE), previous);
  });
});

test("review P2-6: signals older than the detail's latest 20 timeline items are read back by id with their real bilingual titles (one statement)", databaseTest, async () => {
  const { readRelationshipTimelineForContact } = await import("../../features/relationship-timeline/reader");
  const { readRelationshipSignalItems } = await import("../../features/relationship-strength/signal-items");
  await withDatabase(async ({ pool, url }) => {
    // 25 条近期笔记（0 分，不是信号）把最近 20 条时间线占满，计分信号全被挤到 20 条之外。
    for (let index = 0; index < 25; index += 1) {
      await insertRecord(pool, { collection: "notes", id: `note-flood-${index}`, userId: ALICE, payload: { note: { id: `note-flood-${index}`, accountId: ALICE, ownerUserId: ALICE, title: `flood ${index}`, body: "b", contactIds: ["c-core"], createdAt: new Date(NOW.getTime() - index * 60_000).toISOString() } } });
    }
    const meter: Meter = { statements: [], writes: [], bytes: 0 };
    const client = meteredClient(pool, url, meter);
    const store = createPostgresRelationshipStrengthStore({ client, workspaceId: WORKSPACE });
    await ensureRelationshipStrengths(ALICE, NOW, { store });
    const strength = (await readRelationshipStrengths({ actorId: ALICE, contactIds: ["c-core"] }, { store })).get("c-core")!;
    const timeline = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: "c-core", now: NOW }, { runtime: { client: pool as never, workspaceId: WORKSPACE } });
    assert.equal(timeline.items.length, 20);
    const shown = new Set(timeline.items.map((item) => item.id));
    const missing = strength.signals.map((signal) => signal.timelineItemId).filter((id) => !shown.has(id));
    assert.equal(missing.length, strength.signals.length, "every signal is outside the latest 20");

    meter.statements.length = 0;
    const items = await readRelationshipSignalItems(client, WORKSPACE, { actorId: ALICE, contactId: "c-core", timelineItemIds: missing });
    assert.equal(meter.statements.length, 1);
    assert.deepEqual(items.map((item) => item.id).sort(), [...missing].sort());
    const title = (id: string) => items.find((item) => item.id === id)?.title;
    assert.deepEqual(title("schedule:s-core"), { zh: "会面：s-core", en: "Meeting: s-core" });
    assert.deepEqual(title("plan:log-1"), { zh: "计划：确认已建立联系", en: "Plan: connection confirmed" });
    assert.deepEqual(title("capture:c-core"), { zh: "扫描名片，建立联系", en: "Added from a business card" });
    assert.deepEqual(title("memo:note:live-contact-detail-update:m1"), { zh: "写了 memo", en: "Wrote a memo" });
    // 他人 0 条：Bob 读同样的 id 什么都拿不到。
    assert.deepEqual(await readRelationshipSignalItems(client, WORKSPACE, { actorId: BOB, contactId: "c-core", timelineItemIds: missing }), []);
  });
});
