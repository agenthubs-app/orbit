/**
 * 2026-11-27 隐藏月上限（用户定「加隐藏月上限」）：每人每东京自然月——当场洞察 60 批、后台洞察 40 批、手动重新分析 10 次、
 * 笔记提取 300 次、草稿类（draft_assist）60 次。超出返回 monthly_limit + 下月 1 日；下月重新开始；别的用途、别的池不受影响。
 * 真实 PostgreSQL（本机回环库，随机 schema）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  AI_QUOTA_MONTHLY_FUSES,
  AI_QUOTA_MONTHLY_LIMITS,
  BACKGROUND_INSIGHT_MONTHLY_LIMIT,
  INSTANT_INSIGHT_MONTHLY_LIMIT,
  MANUAL_REANALYSIS_MONTHLY_LIMIT,
  monthlyFuseFor,
  type AiQuotaPool,
  type AiQuotaPurpose,
  type AiQuotaTrigger,
} from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:monthly-fuses";
const NEXT_MONTH = "2026-11-30T15:00:00.000Z";

test("constants: the fuses and their values", () => {
  assert.deepEqual([INSTANT_INSIGHT_MONTHLY_LIMIT, BACKGROUND_INSIGHT_MONTHLY_LIMIT, MANUAL_REANALYSIS_MONTHLY_LIMIT], [60, 40, 10]);
  assert.deepEqual([AI_QUOTA_MONTHLY_LIMITS.memo_extraction, AI_QUOTA_MONTHLY_LIMITS.draft_assist], [300, 60]);
  assert.equal(AI_QUOTA_MONTHLY_FUSES.length, 3);
  assert.equal(monthlyFuseFor({ pool: "user", purpose: "insight", trigger: "auto" })?.limit, 60);
  assert.equal(monthlyFuseFor({ pool: "user", purpose: "insight", trigger: "manual" }), null, "a regenerated insight is not under the instant fuse");
  assert.equal(monthlyFuseFor({ pool: "background", purpose: "insight", trigger: "auto" })?.limit, 40);
  assert.equal(monthlyFuseFor({ pool: "user", purpose: "snapshot", trigger: "manual" })?.limit, 10);
  assert.equal(monthlyFuseFor({ pool: "background", purpose: "snapshot", trigger: "auto" }), null, "the automatic snapshot has no fuse");
});

test("monthly fuses: each class stops at its limit within a Tokyo month, the next month starts again, others are unaffected", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `monthly_fuses_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    let seq = 0;
    const reserve = (actor: string, day: number, poolName: AiQuotaPool, purpose: AiQuotaPurpose, trigger: AiQuotaTrigger, at?: string) =>
      ledger.reserve({ actorId: actor, idempotencyKey: `k:${(seq += 1)}`, now: new Date(at ?? `2026-11-${String(day).padStart(2, "0")}T03:00:00.000Z`), pool: poolName, purpose, trigger });
    /** Fills `total` operations, `perDay` a Tokyo day (staying under each daily limit), from Nov 1. */
    const fill = async (actor: string, total: number, perDay: number, poolName: AiQuotaPool, purpose: AiQuotaPurpose, trigger: AiQuotaTrigger) => {
      for (let n = 0; n < total; n += 1) {
        const result = await reserve(actor, 1 + Math.floor(n / perDay), poolName, purpose, trigger);
        assert.equal(result.ok, true, `${purpose} ${n + 1}: ${JSON.stringify(result)}`);
      }
      return 1 + Math.floor((total - 1) / perDay);
    };
    const monthly = (cap: number) => ({ cap, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: NEXT_MONTH });

    // 1 当场洞察：日 20，月 60 → 第 4 天被月上限挡住；手动重新生成的洞察（manual）照常。
    let day = await fill("a:instant", INSTANT_INSIGHT_MONTHLY_LIMIT, 20, "user", "insight", "auto");
    assert.deepEqual(await reserve("a:instant", day + 1, "user", "insight", "auto"), monthly(INSTANT_INSIGHT_MONTHLY_LIMIT));
    assert.equal((await reserve("a:instant", day + 1, "user", "insight", "manual")).ok, true);
    assert.equal((await reserve("a:instant", 1, "user", "insight", "auto", NEXT_MONTH)).ok, true, "December starts again");

    // 2 后台洞察：月 40（日 60 之内）；后台的笔记提取照常。
    day = await fill("a:bg", BACKGROUND_INSIGHT_MONTHLY_LIMIT, 40, "background", "insight", "auto");
    assert.deepEqual(await reserve("a:bg", day, "background", "insight", "auto"), monthly(BACKGROUND_INSIGHT_MONTHLY_LIMIT));
    assert.equal((await reserve("a:bg", day, "background", "memo_extraction", "auto")).ok, true);

    // 3 手动重新分析：日 3，月 10 → 第 4 天第 2 次被挡；自动快照（后台）照常。
    day = await fill("a:manual", MANUAL_REANALYSIS_MONTHLY_LIMIT, 3, "user", "snapshot", "manual");
    assert.deepEqual(await reserve("a:manual", day, "user", "snapshot", "manual"), monthly(MANUAL_REANALYSIS_MONTHLY_LIMIT));
    assert.equal((await reserve("a:manual", day, "background", "snapshot", "auto")).ok, true);

    // 4 笔记提取：月 300（后台日 60 之内）。
    day = await fill("a:memo", 300, 60, "background", "memo_extraction", "auto");
    assert.deepEqual(await reserve("a:memo", day + 1, "background", "memo_extraction", "auto"), monthly(AI_QUOTA_MONTHLY_LIMITS.memo_extraction!));

    // 5 草稿类：月 60、没有日上限、不占用户池 10 次。
    await fill("a:draft", 60, 60, "user", "draft_assist", "manual");
    assert.deepEqual(await reserve("a:draft", 1, "user", "draft_assist", "manual"), monthly(AI_QUOTA_MONTHLY_LIMITS.draft_assist!));
    assert.equal((await ledger.readUsageToday("a:draft", new Date("2026-11-01T03:00:00.000Z"))).user, 0);
    assert.equal((await reserve("a:draft", 1, "user", "insight", "manual")).ok, true, "the user pool is untouched");
    await assert.rejects(reserve("a:draft", 1, "background", "draft_assist", "manual"), /user pool only/u);

    // released operations (no model response) do not count.
    for (let n = 0; n < 5; n += 1) {
      const result = await reserve("a:released", 1, "user", "draft_assist", "manual");
      assert.ok(result.ok);
      await ledger.finish(result.operationId, "failed");
    }
    assert.equal(await ledger.countMonthly("a:released", "draft_assist", new Date("2026-11-01T03:00:00.000Z")), 0);
    await client.close().catch(() => undefined);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
