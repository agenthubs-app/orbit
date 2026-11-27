/**
 * 2026-11-27 分档（真实 PostgreSQL，本机回环库，随机 schema）：
 * - 对话的月上限按档（free 100 / pro 1,000 轮），日上限两档同为 100；拒绝带 cap / used；
 * - 扫名片按图片张数（free 30 / pro 300）：按整张名片受理、超出的不受理、同一请求重放只计一次、失败退回、用完拒绝；
 * - 用量读取：一条语句数出三项本月已用，上限 / 升级后上限 / 恢复时间都来自档位表。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { chargeCardScan, cardChunks } from "../../features/ai-quota/card-scan-quota";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { overLimitText } from "../../features/ai-quota/over-limit";
import { TIER_LIMITS } from "../../features/ai-quota/tiers";
import { readAccountUsage } from "../../features/ai-quota/usage-read";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:tiers";
const NOW = new Date("2026-11-27T03:00:00.000Z");
const DEC_1 = "2026-11-30T15:00:00.000Z";

async function withSchema(run: (input: { pool: Pool; client: ReturnType<typeof createTransactionalPostgresClient> }) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `tiers_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    await run({ client, pool });
  } finally {
    await client.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

/** Monthly chat rounds already counted (succeeded rows, spread over earlier days of November so the daily 100 is not hit). */
async function seedChatRounds(pool: Pool, actor: string, rounds: number) {
  await pool.query(
    `insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, status, max_calls, finished_at)
     select $1, 'seed:' || $2 || ':' || n, $2, date '2026-11-01' + ((n % 20))::int, 'user', 'agent_chat', 'manual', 'seed:' || $2 || ':' || n, 'succeeded', 10, now()
     from generate_series(1, $3) as n`,
    [WS, actor, rounds],
  );
}

test("chat: the monthly limit follows the tier (free 100 / pro 1,000), the daily 100 is the same for both; the refusal carries cap and used", databaseTest, async () => {
  await withSchema(async ({ client, pool }) => {
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    const reserve = (actor: string, tier: "free" | "pro", key: string) => ledger.reserve({ actorId: actor, idempotencyKey: key, now: NOW, pool: "user", purpose: "agent_chat", tier, trigger: "manual" });

    await seedChatRounds(pool, "a:free", TIER_LIMITS.free.agent_chat.month!);
    const refused = await reserve("a:free", "free", "over");
    assert.deepEqual(refused, { cap: 100, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: DEC_1, used: 100 });
    assert.equal((await reserve("a:free", "pro", "as-pro")).ok, true, "the same usage is fine on pro");

    await seedChatRounds(pool, "a:pro", TIER_LIMITS.pro.agent_chat.month!);
    assert.deepEqual(await reserve("a:pro", "pro", "over"), { cap: 1000, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: DEC_1, used: 1000 });
    assert.equal((await ledger.reserve({ actorId: "a:pro", idempotencyKey: "dec", now: new Date(DEC_1), pool: "user", purpose: "agent_chat", tier: "pro", trigger: "manual" })).ok, true, "December starts again");

    // The daily 100 still applies on pro (all today).
    for (let n = 0; n < TIER_LIMITS.pro.agent_chat.day!; n += 1) assert.equal((await reserve("a:day", "pro", `d${n}`)).ok, true);
    const daily = await reserve("a:day", "pro", "d-over");
    assert.equal(daily.ok === false && daily.reason, "daily_limit");
  });
});

test("card scans: whole cards in order fit the month's room, the rest is not accepted; a replay counts once; a refund gives it back; used up is refused", databaseTest, async () => {
  await withSchema(async ({ client }) => {
    const deps = { client, now: () => NOW, workspaceId: WS };
    const charge = (key: string, chunks: number[], tier: "free" | "pro" = "free") => chargeCardScan({ actorId: "a", chargeKey: key, chunks, tier }, deps);

    const first = await charge("b1", Array.from({ length: 13 }, () => 2)); // 13 two-sided cards = 26 images
    assert.ok(first.kind === "accepted");
    assert.equal(first.acceptedChunks, 13);
    assert.equal(first.notice, null);
    const second = await charge("b2", [2, 1, 2, 1]); // room 4: 2 + 1 fit, the next 2-sided card does not
    assert.ok(second.kind === "accepted");
    assert.equal(second.acceptedChunks, 2);
    assert.deepEqual(second.notice && [second.notice.limit, second.notice.used, second.notice.upgradeLimit, second.notice.retryOn], [30, 29, 300, DEC_1]);
    const replay = await charge("b2", [2, 1, 2, 1]);
    assert.ok(replay.kind === "accepted" && replay.acceptedChunks === 2, "the same request is accepted the same way and counted once");
    await replay.refund(); // a replay never gives back the first attempt's charge
    const last = await charge("b3", [1]);
    assert.ok(last.kind === "accepted" && last.acceptedChunks === 1);
    const out = await charge("b4", [1]);
    assert.equal(out.kind, "limited");
    assert.equal(out.kind === "limited" && overLimitText("zh", out.notice), "这个月的 30 张已用完，12月1日恢复。升级到 Pro 每月可扫 300 张。");
    await last.refund();
    assert.equal((await charge("b5", [1])).kind, "accepted", "a refunded image can be scanned again");
    assert.equal((await charge("b6", [1], "pro")).kind, "accepted", "pro has 300");

    // Manifest grouping: front and back of one card stay together, in seq order.
    assert.deepEqual(cardChunks([{ cardId: "c2", seq: 3 }, { cardId: "c1", seq: 1 }, { cardId: "c1", seq: 2 }, { cardId: null, seq: 4 }]).map((card) => card.map((entry) => entry.seq)), [[1, 2], [3], [4]]);
  });
});

test("usage read: one statement counts the three items this month; limits, upgrade limits and the reset come from the tier table", databaseTest, async () => {
  await withSchema(async ({ client, pool }) => {
    await seedChatRounds(pool, "a", 7);
    await chargeCardScan({ actorId: "a", chargeKey: "k", chunks: [2, 2, 1], tier: "free" }, { client, now: () => NOW, workspaceId: WS });
    await pool.query(`create table if not exists plan_intakes (workspace_id text, actor_id text, created_at timestamptz)`).catch(() => undefined);
    await pool.query(`insert into plan_intakes (workspace_id, actor_id, created_at) values ($1, 'a', '2026-11-03T00:00:00Z'), ($1, 'a', '2026-10-30T00:00:00Z')`, [WS]);
    const free = await readAccountUsage(client, { actorId: "a", now: NOW, tier: "free", workspaceId: WS });
    assert.equal(free.tier, "free");
    assert.deepEqual(free.items.map((item) => [item.feature, item.used, item.limit, item.upgradeLimit, item.unit, item.retryOn]), [
      ["agent_chat", 7, 100, 1000, "round", DEC_1],
      ["card_scan", 5, 30, 300, "image", DEC_1],
      ["plan_new_goal", 1, 1, 10, "plan", DEC_1],
    ]);
    assert.deepEqual(free.tiers.pro.card_scan, TIER_LIMITS.pro.card_scan);
    const pro = await readAccountUsage(client, { actorId: "a", now: NOW, tier: "pro", workspaceId: WS });
    assert.deepEqual(pro.items.map((item) => [item.limit, item.upgradeLimit]), [[1000, null], [300, null], [10, null]]);
  });
});
