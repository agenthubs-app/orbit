/**
 * W0021 SC-W0021-01：活动归属的开始时间窗口查询（真实 PostgreSQL，本机回环库的随机临时 schema）。
 *
 * - 同一数据集上，旧算法（整个 workspace 的已发布目录 + 内存过滤，即 W0015 的实现）与新查询给出的
 *   候选深相等；
 * - 再加 100 场窗口外的活动（published／draft／archived／cancelled，带大 description／source_payload）后，
 *   新查询返回的行数、字节、语句数严格不变；EXPLAIN 走 `event_ops_events_public_catalogue_idx`；
 * - 半开区间与东京午夜边界、多张名片跨多日、无效 scannedAt 不查、改 session timezone 结果不变。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库；没配置时整组 skip（REPORT 里证明本次运行 0 skip）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventCoreService } from "../../features/events/core/service";
import { createPostgresEventStartWindowReader, EVENT_START_WINDOW_SQL } from "../../features/events/core/start-window";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import {
  resolveEventAttribution,
  type AttributionEvent,
  type EventAttributionCard,
  type EventAttributionSource,
} from "../../features/plans/event-attribution";
import { createEventAttributionSource } from "../../features/plans/event-attribution-runtime";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WORKSPACE = "workspace:attribution-window";
const USER = "actor:alice";

interface Meter {
  statements: number;
  rows: number;
  bytes: number;
}

function meteredExecutor(pool: Pool, meter: Meter) {
  return {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      const result = await pool.query(text, values as unknown[]);
      meter.statements += 1;
      meter.rows += result.rows.length;
      for (const row of result.rows) meter.bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
      return result as unknown as { rows: TRow[]; rowCount: number | null };
    },
  };
}

async function withEventsDatabase(run: (pool: Pool) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `attr_window_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 1,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  try {
    await admin.query(`create schema ${schema}`);
    await runEventOperationsMigrations(pool);
    await run(pool);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

let code = 0;
async function insertEvent(
  pool: Pool,
  input: { id: string; startsAt: string; state?: "published" | "draft" | "archived" | "cancelled"; big?: boolean; title?: string },
) {
  const state = input.state ?? "published";
  const startsAt = new Date(input.startsAt);
  const description = input.big ? "长描述".repeat(400) : "活动说明";
  const payload = input.big ? { agenda: Array.from({ length: 40 }, (_, index) => `议程 ${index}：${"x".repeat(40)}`) } : { tags: ["t"] };
  code += 1;
  await pool.query(
    `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
       description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload, cancelled_at, archived_at)
     values ($1, $2, 'actor:organizer', now(), now(), $3, $4, $5, 'Shibuya', 'Asia/Tokyo', $6, $7, $8, $9::jsonb, $10, $11)`,
    [
      WORKSPACE,
      input.id,
      `W${code}`,
      input.title ?? `活动 ${input.id}`,
      description,
      startsAt,
      new Date(startsAt.getTime() + 2 * 3_600_000),
      state,
      JSON.stringify(payload),
      state === "cancelled" ? new Date() : null,
      state === "archived" ? new Date() : null,
    ],
  );
}

/** W0015 的旧实现：读整个已发布目录，再在内存里按 [from, to) 过滤。 */
function legacySource(pool: Pool, registered: readonly string[]): EventAttributionSource {
  const core = createEventCoreService(createPostgresEventCoreRepository({ client: pool as never, workspaceId: WORKSPACE }));
  return {
    async listEventsStartingBetween(fromIso, toIso) {
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);
      return (await core.listPublishedEvents())
        .filter((event) => {
          const start = Date.parse(event.startsAt);
          return start >= from && start < to;
        })
        .map((event): AttributionEvent => ({ eventId: event.eventId, startsAt: event.startsAt, title: event.title }));
    },
    async registeredEventIds({ eventIds }) {
      return new Set(eventIds.filter((id) => registered.includes(id)));
    },
  };
}

function windowSource(pool: Pool, registered: readonly string[], meter: Meter): EventAttributionSource {
  return createEventAttributionSource({
    readRegistrations: async ({ eventIds }) => eventIds.map((eventId) => ({ eventId, status: registered.includes(eventId) ? "rsvped" : "cancelled" })),
    window: createPostgresEventStartWindowReader({ client: meteredExecutor(pool, meter), workspaceId: WORKSPACE }),
  });
}

// 9/27 的窗口：扫描日 9/27（东京）→ 查 [9/26 00:00 JST, 9/28 00:00 JST) = [9/25 15:00Z, 9/27 15:00Z)。
const FROM = "2026-09-25T15:00:00.000Z";
const TO = "2026-09-27T15:00:00.000Z";

const IN_WINDOW = [
  { id: "event:at-from", startsAt: FROM }, // == from：包含
  { id: "event:tokyo-midnight", startsAt: "2026-09-26T15:00:00.000Z" }, // 东京 9/27 00:00
  { id: "event:mixer", startsAt: "2026-09-27T10:00:00.000Z" }, // 东京 9/27 19:00
  { id: "event:mixer-twin", startsAt: "2026-09-27T10:00:00.000Z" }, // 同一开始时间：按 eventId 平局
  { id: "event:before-to", startsAt: "2026-09-27T14:59:59.999Z" }, // to − 1ms：包含
];
const EDGE_OUT = [
  { id: "event:at-to", startsAt: TO }, // == to：不含
  { id: "event:before-from", startsAt: "2026-09-25T14:59:59.999Z" },
];

const REGISTERED = [...IN_WINDOW, ...EDGE_OUT, { id: "event:oct-2", startsAt: "2026-10-02T01:00:00.000Z" }].map((event) => event.id);

async function seed(pool: Pool) {
  for (const event of [...IN_WINDOW, ...EDGE_OUT]) await insertEvent(pool, event);
  // 窗口内但不是 published：两种算法都不应返回。
  await insertEvent(pool, { id: "event:draft-in", startsAt: "2026-09-27T09:00:00.000Z", state: "draft" });
  await insertEvent(pool, { id: "event:cancelled-in", startsAt: "2026-09-27T09:00:00.000Z", state: "cancelled" });
  await insertEvent(pool, { id: "event:archived-in", startsAt: "2026-09-27T09:00:00.000Z", state: "archived" });
  // 另一天的已发布活动（多卡跨日时会进窗口）。
  await insertEvent(pool, { id: "event:oct-2", startsAt: "2026-10-02T01:00:00.000Z" });
}

const CARD_SETS: Record<string, EventAttributionCard[]> = {
  "single card on 9/27": [{ cardId: "c1", scannedAt: "2026-09-27T12:30:00.000Z" }],
  "JST midnight scan (UTC previous day 15:00)": [{ cardId: "c1", scannedAt: "2026-09-26T15:00:00.000Z" }],
  "several cards across several days": [
    { cardId: "c1", scannedAt: "2026-09-27T12:30:00.000Z" },
    { cardId: "c2", scannedAt: "2026-09-28T00:10:00.000Z" },
    { cardId: "c3", scannedAt: "2026-10-02T03:00:00.000Z" },
    { cardId: "c4", scannedAt: "2026-09-26T00:00:00.000Z" },
  ],
  "a card before any event": [{ cardId: "c1", scannedAt: "2026-09-20T03:00:00.000Z" }],
};

test("window query returns the same candidates as the full-catalogue algorithm, including boundaries and ties", databaseTest, async () => {
  await withEventsDatabase(async (pool) => {
    await seed(pool);
    const meter: Meter = { bytes: 0, rows: 0, statements: 0 };
    for (const [label, cards] of Object.entries(CARD_SETS)) {
      const legacy = await resolveEventAttribution(legacySource(pool, REGISTERED), { cards, userId: USER });
      const windowed = await resolveEventAttribution(windowSource(pool, REGISTERED, meter), { cards, userId: USER });
      assert.deepEqual(windowed, legacy, label);
    }
    // 直接看窗口：半开区间，from 含、to 不含、to − 1ms 含；非 published 不含；按开始时间、event_id 排序。
    const reader = createPostgresEventStartWindowReader({ client: pool as never, workspaceId: WORKSPACE });
    const rows = await reader.listPublishedStartingBetween(FROM, TO);
    assert.deepEqual(
      rows.map((row) => row.eventId),
      ["event:at-from", "event:tokyo-midnight", "event:mixer", "event:mixer-twin", "event:before-to"],
    );
    assert.deepEqual(rows[0], { eventId: "event:at-from", startsAt: FROM, title: "活动 event:at-from" });
    // 平局规则不变：同一开始时间取 eventId 小的一场。
    const tie = await resolveEventAttribution(windowSource(pool, ["event:mixer", "event:mixer-twin"], meter), {
      cards: [{ cardId: "c1", scannedAt: "2026-09-27T10:30:00.000Z" }],
      userId: USER,
    });
    assert.equal(tie.byCard.c1, "event:mixer");
  });
});

test("invalid scannedAt never queries; the SQL uses a half-open range and no BETWEEN", databaseTest, async () => {
  await withEventsDatabase(async (pool) => {
    await seed(pool);
    const meter: Meter = { bytes: 0, rows: 0, statements: 0 };
    const result = await resolveEventAttribution(windowSource(pool, REGISTERED, meter), {
      cards: [{ cardId: "c1", scannedAt: "not a date" }],
      userId: USER,
    });
    assert.deepEqual(result, { byCard: { c1: null }, events: [] });
    assert.equal(meter.statements, 0);
    assert.match(EVENT_START_WINDOW_SQL, /starts_at >= \$2::timestamptz/);
    assert.match(EVENT_START_WINDOW_SQL, /starts_at < \$3::timestamptz/);
    assert.doesNotMatch(EVENT_START_WINDOW_SQL, /between/i);
    // 不带时区的时间会被 session timezone 解释：直接拒绝。
    const reader = createPostgresEventStartWindowReader({ client: pool as never, workspaceId: WORKSPACE });
    await assert.rejects(reader.listPublishedStartingBetween("2026-09-25T15:00:00", TO));
  });
});

test("100 extra out-of-window events leave rows, bytes and statements unchanged; EXPLAIN uses the catalogue index", databaseTest, async () => {
  await withEventsDatabase(async (pool) => {
    await seed(pool);
    const cards = CARD_SETS["several cards across several days"]!;
    const before: Meter = { bytes: 0, rows: 0, statements: 0 };
    const first = await resolveEventAttribution(windowSource(pool, REGISTERED, before), { cards, userId: USER });
    const legacyBefore = await resolveEventAttribution(legacySource(pool, REGISTERED), { cards, userId: USER });
    const states = ["published", "draft", "archived", "cancelled"] as const;
    for (let index = 0; index < 100; index += 1) {
      // 窗口是 [9/25 15:00Z, 10/3 15:00Z)：一半在 8 月，一半在 11 月以后。
      const base = index % 2 === 0 ? Date.parse("2026-08-01T01:00:00.000Z") : Date.parse("2026-11-10T01:00:00.000Z");
      await insertEvent(pool, {
        big: true,
        id: `event:noise-${index}`,
        startsAt: new Date(base + index * 3_600_000).toISOString(),
        state: states[index % states.length],
      });
    }
    await pool.query("analyze event_ops_events");
    const after: Meter = { bytes: 0, rows: 0, statements: 0 };
    const second = await resolveEventAttribution(windowSource(pool, REGISTERED, after), { cards, userId: USER });
    assert.deepEqual(second, first);
    assert.deepEqual(after, before);
    assert.ok(before.statements === 1 && before.rows > 0);
    // 旧算法仍给出同样的候选，但它读的是整个目录（这里只断言结果，字节差见测量脚本）。
    assert.deepEqual(await resolveEventAttribution(legacySource(pool, REGISTERED), { cards, userId: USER }), legacyBefore);
    assert.deepEqual(second, legacyBefore);

    const explainParams = [WORKSPACE, "2026-09-25T15:00:00.000Z", "2026-10-03T15:00:00.000Z"];
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan = off");
      const plan = (await client.query(`explain ${EVENT_START_WINDOW_SQL}`, explainParams)).rows
        .map((row) => String(row["QUERY PLAN"]))
        .join("\n");
      assert.match(plan, /event_ops_events_public_catalogue_idx/);
      await client.query("rollback");
    } finally {
      client.release();
    }
    const defaultPlan = (await pool.query(`explain ${EVENT_START_WINDOW_SQL}`, explainParams)).rows
      .map((row) => String(row["QUERY PLAN"]))
      .join("\n");
    console.log(`[W0021 SC-01] default plan with 113 rows:\n${defaultPlan}`);
  });
});

test("the result does not depend on the database session time zone", databaseTest, async () => {
  await withEventsDatabase(async (pool) => {
    await seed(pool);
    const cards = CARD_SETS["several cards across several days"]!;
    const meter: Meter = { bytes: 0, rows: 0, statements: 0 };
    await pool.query("set timezone = 'UTC'");
    const utc = await resolveEventAttribution(windowSource(pool, REGISTERED, meter), { cards, userId: USER });
    await pool.query("set timezone = 'America/Los_Angeles'");
    const la = await resolveEventAttribution(windowSource(pool, REGISTERED, meter), { cards, userId: USER });
    await pool.query("set timezone = 'Asia/Tokyo'");
    const tokyo = await resolveEventAttribution(windowSource(pool, REGISTERED, meter), { cards, userId: USER });
    assert.deepEqual(la, utc);
    assert.deepEqual(tokyo, utc);
    assert.ok(utc.events.length > 0);
  });
});
