/**
 * W0046 SC-W0046-01（真实 PostgreSQL）：时间线读取器只读聚合。
 *
 * - 单人：七种来源都有记录的联系人 → 符合契约、降序、只含本人数据，过程 0 次写；
 * - 同 workspace 两个 actor：他人数据 0 条；不查询私信表与 event_ops 表；每条语句带 LIMIT；
 * - 任一来源失败其余照常；全部失败 items: [] 且七种都列出；
 * - 跨联系人最近动态：七种来源合并倒序、limit 生效、他人数据 0 条、已删除联系人的条目不出现。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库，随机 schema，用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import type { EventOperationsSqlExecutor } from "../../features/events/event-operations/storage/postgres-client";
import { runPlanMigrations } from "../../features/plans/migrations";
import {
  readMemoEventOptions,
  readRecentRelationshipTimelineForActor,
  readRelationshipTimelineForContact,
  type RelationshipTimelineRuntime,
} from "../../features/relationship-timeline/reader";
import { RELATIONSHIP_TIMELINE_SOURCES } from "../../features/relationship-timeline/build";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WORKSPACE = "workspace:timeline";
const ALICE = "actor:alice";
const BOB = "actor:bob";
const C1 = "contact:c1";
const C2 = "contact:c2";
const C_DELETED = "contact:gone";
const B1 = "contact:b1";
const NOW = new Date("2026-10-02T03:00:00.000Z");

interface Meter { statements: string[]; writes: number; bytes: number; params?: unknown[][] }

function metered(pool: Pool, meter: Meter, failOn?: RegExp): EventOperationsSqlExecutor {
  return {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      meter.statements.push(text);
      meter.params?.push([...(values ?? [])]);
      if (/^\s*(insert|update|delete)/i.test(text)) meter.writes += 1;
      if (failOn?.test(text)) throw new Error("injected source failure");
      const result = await pool.query(text, values as unknown[]);
      for (const row of result.rows) meter.bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
      return { rowCount: result.rowCount ?? 0, rows: result.rows as TRow[] };
    },
  };
}

async function insertRecord(pool: Pool, input: { collection: string; id: string; userId: string; payload: Record<string, unknown>; targetId?: string; deleted?: boolean; createdAt?: string }) {
  const at = input.createdAt ?? "2026-09-01T00:00:00.000Z";
  await pool.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, target_type, target_id, lifecycle_state, payload, created_at, updated_at, deleted_at)
    values ($1, $2, $3, $4, 'manual', $3, 'contact', $5, $6, $7::jsonb, $8, $8, $9)`, [
    WORKSPACE, input.collection, input.id, input.userId, input.targetId ?? null, input.deleted ? "deleted" : "active", JSON.stringify(input.payload), at, input.deleted ? at : null,
  ]);
}

function contact(id: string, actor: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return { id, accountId: actor, displayName: id, stage: "active", source: { type: "business_card_ocr", id: `src:${id}` }, evidenceIds: [], createdAt, updatedAt: createdAt, ...extra };
}

async function seed(pool: Pool) {
  await insertRecord(pool, { collection: "contacts", id: C1, userId: ALICE, createdAt: "2026-09-01T00:00:00.000Z", payload: contact(C1, ALICE, "2026-09-01T00:00:00.000Z", { metEventId: "event:e1", metEventTitle: "Tokyo SaaS Night" }) });
  await insertRecord(pool, { collection: "contacts", id: C2, userId: ALICE, createdAt: "2026-09-02T00:00:00.000Z", payload: contact(C2, ALICE, "2026-09-02T00:00:00.000Z", { source: { type: "manual", id: "src:c2" } }) });
  await insertRecord(pool, { collection: "contacts", id: C_DELETED, userId: ALICE, deleted: true, createdAt: "2026-09-03T00:00:00.000Z", payload: contact(C_DELETED, ALICE, "2026-09-03T00:00:00.000Z") });
  await insertRecord(pool, { collection: "contacts", id: B1, userId: BOB, createdAt: "2026-09-29T00:00:00.000Z", payload: contact(B1, BOB, "2026-09-29T00:00:00.000Z") });

  const detail = (actor: string, contactId: string, notes: unknown[]) => insertRecord(pool, {
    collection: "contact_detail_states", id: `contact-detail:${encodeURIComponent(actor)}:${encodeURIComponent(contactId)}`, userId: actor, targetId: contactId,
    payload: { actorId: actor, contactId, status: "active", tags: [], notes, updatedAt: "2026-09-30T00:00:00.000Z" },
  });
  await detail(ALICE, C1, [
    { noteId: "note:live-contact-detail-update:m1", body: "聊了 B 轮融资", authorLabel: "我", createdAt: "2026-09-30T03:00:00.000Z", occurredAt: "2026-09-20", eventId: "event:e1", kind: "memo" },
    { noteId: "note:enc-1", body: "谈过：是", authorLabel: "You", createdAt: "2026-09-18T10:00:00.000Z" },
  ]);
  await detail(ALICE, C_DELETED, [{ noteId: "note:live-contact-detail-update:gone", body: "已删除联系人的 memo", authorLabel: "我", createdAt: "2026-10-01T00:00:00.000Z" }]);
  // bob 对同一个 contactId 的详情状态（他人数据）。
  await detail(BOB, C1, [{ noteId: "note:live-contact-detail-update:bob", body: "bob 的 memo", authorLabel: "我", createdAt: "2026-10-01T05:00:00.000Z" }]);

  await insertRecord(pool, { collection: "human_encounters", id: "enc-1", userId: ALICE, targetId: C1, payload: { encounterId: "enc-1", actorId: ALICE, contactId: C1, observedAt: "2026-09-18T10:00:00.000Z", eventId: "event:e1", noteText: "在展台聊了合作" } });
  await insertRecord(pool, { collection: "human_encounters", id: "enc-bob", userId: BOB, targetId: C1, payload: { encounterId: "enc-bob", actorId: BOB, contactId: C1, observedAt: "2026-10-01T10:00:00.000Z", noteText: "bob" } });

  const note = (actor: string, id: string, contactIds: string[], createdAt: string) => insertRecord(pool, {
    collection: "notes", id, userId: actor,
    payload: { schemaVersion: 2, note: { id, accountId: actor, ownerUserId: actor, title: `笔记 ${id}`, body: "一起做活动", manualContactIds: contactIds, mentions: [], contactIds, eventIds: [], version: 1, createdAt, updatedAt: createdAt }, operations: [] },
  });
  await note(ALICE, "note-1", [C1, C2], "2026-09-21T00:00:00.000Z");
  await note(BOB, "note-bob", [C1], "2026-10-01T00:00:00.000Z");

  for (const actor of [ALICE, BOB]) {
    await pool.query(`insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on) values ($1, $2, $3, 1, 'active', '目标', 'month', '2026-09-01')`, [WORKSPACE, `plan:${actor}`, actor]);
  }
  const log = (actor: string, id: string, event: string, kind: string, contactIds: string[], createdAt: string) => pool.query(
    `insert into plan_log (workspace_id, id, actor_id, plan_id, kind, event, author, body, linked_contact_ids, idempotency_key, created_at) values ($1, $2, $3, $4, $5, $6, 'user', '记录', $7, $2, $8)`,
    [WORKSPACE, id, actor, `plan:${actor}`, kind, event, contactIds, createdAt],
  );
  await log(ALICE, "log-1", "contact_established", "auto", [C1], "2026-09-22T00:00:00.000Z");
  await log(ALICE, "log-gone", "contact_linked", "auto", [C_DELETED], "2026-10-01T01:00:00.000Z");
  await log(BOB, "log-bob", "contact_linked", "auto", [C1], "2026-10-01T02:00:00.000Z");

  const schedule = (actor: string, id: string, extra: Record<string, unknown>) => insertRecord(pool, {
    collection: "personal_schedule_items", id, userId: actor,
    payload: { id, accountId: actor, ownerUserId: actor, sourceId: id, category: "meeting", kind: "meeting", title: `日程 ${id}`, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", evidenceIds: [], ...extra },
  });
  await schedule(ALICE, "s-1", { startsAt: "2026-09-25T01:00:00.000Z", state: "ended", contactIds: [C1] });
  await schedule(ALICE, "s-cancelled", { startsAt: "2026-09-26T01:00:00.000Z", state: "cancelled", contactIds: [C1] });
  await schedule(ALICE, "s-future", { startsAt: "2026-10-20T01:00:00.000Z", state: "upcoming", contactIds: [C1] });
  await schedule(ALICE, "s-event", { kind: "event", category: "event", startsAt: "2026-09-17T09:00:00.000Z", state: "ended", contactIds: [], contactId: C1, eventId: "event:e1" });
  await schedule(BOB, "s-bob", { startsAt: "2026-09-28T01:00:00.000Z", state: "ended", contactIds: [C1] });

  const task = (actor: string, id: string, status: string, updatedAt: string) => insertRecord(pool, {
    collection: "tasks", id, userId: actor,
    payload: { taskId: id, actorId: actor, connectionId: `conn:${actor}`, contactId: C1, status, title: `任务 ${id}`, purpose: "follow_up", dueAt: updatedAt, createdAt: "2026-09-01T00:00:00.000Z", updatedAt, version: 1 },
  });
  await task(ALICE, "t-1", "completed", "2026-09-24T00:00:00.000Z");
  await task(ALICE, "t-open", "open", "2026-09-29T00:00:00.000Z");
  await task(BOB, "t-bob", "completed", "2026-09-30T00:00:00.000Z");
}

async function withTimelineDatabase(run: (pool: Pool) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `timeline_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema},public -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await seed(pool);
    await run(pool);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

function runtimeFor(pool: Pool, meter: Meter, failOn?: RegExp): RelationshipTimelineRuntime {
  return { client: metered(pool, meter, failOn), workspaceId: WORKSPACE };
}

function assertReadOnlyBounded(meter: Meter) {
  assert.equal(meter.writes, 0);
  for (const statement of meter.statements) {
    assert.match(statement, /\blimit\b/i, "每条读取都带 LIMIT");
    assert.doesNotMatch(statement, /relationship_conversations|relationship_messages|event_ops|event_operation/i);
  }
}

test("单人时间线：七种来源、降序、只含本人数据、0 次写、每条读取有上限", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const meter: Meter = { statements: [], writes: 0, bytes: 0 };
    const result = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW, limit: 50 }, { runtime: runtimeFor(pool, meter) });
    assert.deepEqual(result.unavailableSources, []);
    assert.deepEqual([...new Set(result.items.map((item) => item.source))].sort(), [...RELATIONSHIP_TIMELINE_SOURCES].sort());
    assert.deepEqual(result.items.map((item) => item.id), [
      "schedule:s-1",
      "followup_done:t-1",
      "plan:log-1",
      "note:note-1",
      "memo:note:live-contact-detail-update:m1",
      "encounter:enc-1",
      "schedule:s-event",
      "capture:contact:c1",
    ]);
    assert.equal(result.total, 8);
    assert.ok(result.items.every((item) => item.contactId === C1));
    const bobIds = ["enc-bob", "note-bob", "log-bob", "s-bob", "t-bob", "note:live-contact-detail-update:bob"];
    assert.ok(!result.items.some((item) => bobIds.some((id) => item.id.endsWith(id))));
    assert.equal(meter.statements.length, 7);
    assertReadOnlyBounded(meter);

    const limited = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW, limit: 3 }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) });
    assert.equal(limited.items.length, 3);
    assert.equal(limited.total, 8);

    // bob 读 alice 的联系人：联系人不属于 bob → 空时间线。
    const foreign = await readRelationshipTimelineForContact({ actorId: BOB, contactId: C1, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) });
    assert.deepEqual(foreign.items, []);
    assert.deepEqual(foreign.unavailableSources, []);
  });
});

test("单个来源失败时其余照常；全部失败 items 为空且七种都列出", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const partial = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }, /from plan_log/) });
    assert.deepEqual(partial.unavailableSources, ["plan"]);
    assert.ok(partial.items.length > 0);
    assert.ok(!partial.items.some((item) => item.source === "plan"));

    const none = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }, /./) });
    assert.deepEqual(none.items, []);
    assert.deepEqual(none.unavailableSources, RELATIONSHIP_TIMELINE_SOURCES);

    const unconfigured = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW }, { runtime: null });
    assert.deepEqual(unconfigured.items, []);
    assert.deepEqual(unconfigured.unavailableSources, RELATIONSHIP_TIMELINE_SOURCES);
  });
});

test("跨联系人最近动态：合并倒序、limit 生效、他人与已删除联系人的条目不出现", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const meter: Meter = { statements: [], writes: 0, bytes: 0 };
    const result = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 50 }, { runtime: runtimeFor(pool, meter) });
    assert.deepEqual(result.unavailableSources, []);
    assert.deepEqual([...new Set(result.items.map((item) => item.source))].sort(), [...RELATIONSHIP_TIMELINE_SOURCES].sort());
    assert.ok(result.items.every((item) => item.contactId === C1 || item.contactId === C2));
    assert.ok(!result.items.some((item) => item.id.endsWith("gone") || item.id === "plan:log-gone"));
    assert.ok(!result.items.some((item) => /bob/.test(item.id)));
    const times = result.items.map((item) => item.occurredAt);
    assert.deepEqual(times, [...times].sort().reverse());
    // note-1 关联两位联系人，各一条。
    assert.equal(result.items.filter((item) => item.id === "note:note-1").length, 2);
    assertReadOnlyBounded(meter);
    assert.equal(meter.statements.length, 8);

    const top = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 2 }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) });
    assert.deepEqual(top.items.map((item) => item.id), ["schedule:s-1", "followup_done:t-1"]);

    const degraded = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 10 }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }, /'human_encounters'/) });
    assert.deepEqual(degraded.unavailableSources, ["encounter"]);
    assert.ok(degraded.items.length > 0);
    const allFailed = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 10 }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }, /./) });
    assert.deepEqual(allFailed.items, []);
    assert.deepEqual(allFailed.unavailableSources, RELATIONSHIP_TIMELINE_SOURCES);
  });
});

test("W0052 review P3：最近 N 条每个来源只读前 N 条（仍 8 条语句、归并结果与全量读一致）；单人详情每来源仍读 50 条", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const full = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 50 }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) });
    const meter: Meter = { bytes: 0, params: [], statements: [], writes: 0 };
    const top = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 3 }, { runtime: runtimeFor(pool, meter) });
    assert.equal(meter.statements.length, 8);
    assertReadOnlyBounded(meter);
    // 六个来源（memo／活动／笔记／计划／日程／跟进）的 LIMIT 参数 = 3，不再是 50；建立联系本来就按 limit 读。
    const sourceLimits = meter.statements.flatMap((text, index) => (/collection_name = 'contacts'/.test(text) && /order by created_at desc, record_id/.test(text) ? [] : [meter.params![index]]))
      .filter((values) => values.includes(3) || values.includes(50));
    assert.ok(sourceLimits.length >= 6, JSON.stringify(sourceLimits));
    assert.ok(sourceLimits.every((values) => !values.includes(50)), JSON.stringify(sourceLimits));
    assert.deepEqual(top.items.map((item) => item.id), full.items.slice(0, 3).map((item) => item.id), "top 3 unchanged");

    const detailMeter: Meter = { bytes: 0, params: [], statements: [], writes: 0 };
    const detail = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C1, now: NOW, limit: 3 }, { runtime: runtimeFor(pool, detailMeter) });
    assert.equal(detail.total, 8, "detail 「共 N 条」 still counts every source up to 50");
    assert.equal(detailMeter.params!.filter((values) => values.includes(50)).length, 6, "detail keeps 50 per source");
  });
});

test("「写 memo」关联活动推荐：本人近 30 天已报名活动日程，有上限、只读", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const meter: Meter = { statements: [], writes: 0, bytes: 0 };
    const options = await readMemoEventOptions({ actorId: ALICE, now: NOW }, { runtime: runtimeFor(pool, meter) });
    assert.deepEqual(options, [{ eventId: "event:e1", title: "日程 s-event", startsAt: "2026-09-17T09:00:00.000Z" }]);
    assertReadOnlyBounded(meter);
    assert.deepEqual(await readMemoEventOptions({ actorId: BOB, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) }), []);
    assert.deepEqual(await readMemoEventOptions({ actorId: ALICE, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }, /./) }), []);
  });
});

test("单条笔记关联超多联系人：单人读取仍命中；最近动态每条记录至多展开 20 个 id，归属查询参数与 LIMIT 固定上限", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const many = Array.from({ length: 600 }, (_, index) => `contact:bulk-${String(index).padStart(3, "0")}`);
    const contactIds = [...many, C2].sort();
    await insertRecord(pool, {
      collection: "notes", id: "note-bulk", userId: ALICE,
      payload: { schemaVersion: 2, note: { id: "note-bulk", accountId: ALICE, ownerUserId: ALICE, title: "群发", body: "很多人", manualContactIds: contactIds, mentions: [], contactIds, eventIds: [], version: 1, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" }, operations: [] },
    });
    // C2 排在 600 个 id 之后：单人读取按该联系人过滤，仍能读到。
    const single = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C2, now: NOW }, { runtime: runtimeFor(pool, { statements: [], writes: 0, bytes: 0 }) });
    assert.ok(single.items.some((item) => item.id === "note:note-bulk"));

    const meter: Meter = { statements: [], writes: 0, bytes: 0, params: [] };
    const recent = await readRecentRelationshipTimelineForActor({ actorId: ALICE, now: NOW, limit: 50 }, { runtime: runtimeFor(pool, meter) });
    assert.ok(recent.items.length > 0);
    assert.ok(recent.items.every((item) => item.contactId === C1 || item.contactId === C2));
    for (const [index, statement] of meter.statements.entries()) {
      const arrays = (meter.params?.[index] ?? []).filter(Array.isArray) as unknown[][];
      for (const array of arrays) assert.ok(array.length <= 200, `参数数组 ${array.length} 超过固定上限`);
      if (/collection_name = 'contacts'/.test(statement) && arrays.length) {
        assert.equal(meter.params?.[index]?.at(-1), 200, "归属查询 LIMIT 为固定上限");
      }
    }
    assert.ok(meter.bytes < 60_000, `bytes ${meter.bytes}`);
    assertReadOnlyBounded(meter);
  });
});

test("R24: an undone plan score (score_reversed) is not an interaction on the timeline", databaseTest, async () => {
  await withTimelineDatabase(async (pool) => {
    const insert = (id: string, event: string, contactIds: string[], payload: Record<string, unknown>, createdAt: string) => pool.query(
      `insert into plan_log (workspace_id, id, actor_id, plan_id, kind, event, author, body, linked_contact_ids, payload, idempotency_key, created_at)
       values ($1, $2, $3, $4, 'auto', $5, 'user', '計画：更新', $6, $7::jsonb, $2, $8)`,
      [WORKSPACE, id, ALICE, `plan:${ALICE}`, event, contactIds, JSON.stringify(payload), createdAt],
    );
    await insert("award-kept", "score_awarded", [C2], { points: 10 }, "2026-09-27T00:00:00.000Z");
    await insert("award-undone", "score_awarded", [C2], { points: 10 }, "2026-09-28T00:00:00.000Z");
    await insert("award-undone-rev", "score_reversed", [], { awardLogId: "award-undone" }, "2026-09-28T00:01:00.000Z");
    const result = await readRelationshipTimelineForContact({ actorId: ALICE, contactId: C2, now: NOW, limit: 50 }, { runtime: runtimeFor(pool, { bytes: 0, statements: [], writes: 0 }) });
    const ids = result.items.map((item) => item.id);
    assert.ok(ids.some((id) => id.includes("award-kept")), ids.join(","));
    assert.ok(!ids.some((id) => id.includes("award-undone")), ids.join(","));
  });
});
