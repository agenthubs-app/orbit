/**
 * R33 SC-R33-04：账本迁移 v8「ai-usage-plan-v3-purposes」——`plan_search` / `plan_prep` 可记账（user 池、各自的 max_calls），
 * `plan_search` 与初次生成的 `plan_prep` 不计入用户池 10 次与计划流程 15 次，重生成的 `plan_prep` 计入 15 次；
 * 回退 SQL 恢复 v7 约束后 `plan_search` 被拒，再次前进又接受。真实 PostgreSQL（本机回环库，随机 schema）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  AI_QUOTA_MAX_CALLS,
  AI_QUOTA_MONTHLY_LIMITS,
  AI_QUOTA_PURPOSE_POOLS,
  AI_QUOTA_PURPOSES,
  isPlanFlowOperation,
  isRecordOnlyUserOperation,
  PLAN_FLOW_DAILY_LIMIT,
  PLAN_FLOW_PURPOSES,
  PLAN_PREP_REGENERATE_TRIGGER,
  PLAN_SEARCH_PER_PLAN_LIMIT,
  USER_POOL_DAILY_LIMIT,
} from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { AI_USAGE_PLAN_V3_ROLLBACK_SQL, NETWORK_ANALYSIS_MIGRATIONS, runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:r33-ledger";

test("constants: both purposes exist, are user-pool, plan_search is outside the plan-flow purposes and only regenerated prep counts", () => {
  assert.ok(AI_QUOTA_PURPOSES.includes("plan_search") && AI_QUOTA_PURPOSES.includes("plan_prep"));
  assert.ok(!PLAN_FLOW_PURPOSES.includes("plan_search") && !PLAN_FLOW_PURPOSES.includes("plan_prep"));
  assert.deepEqual([AI_QUOTA_PURPOSE_POOLS.plan_search, AI_QUOTA_PURPOSE_POOLS.plan_prep], ["user", "user"]);
  assert.deepEqual([AI_QUOTA_MAX_CALLS.plan_search, AI_QUOTA_MAX_CALLS.plan_prep], [1, 3]);
  assert.deepEqual([AI_QUOTA_MONTHLY_LIMITS.plan_search, AI_QUOTA_MONTHLY_LIMITS.plan_prep], [undefined, undefined]);
  assert.equal(PLAN_SEARCH_PER_PLAN_LIMIT, 8);
  assert.equal(isRecordOnlyUserOperation({ pool: "user", purpose: "plan_search", trigger: "auto" }), true);
  assert.equal(isRecordOnlyUserOperation({ pool: "user", purpose: "plan_prep", trigger: "plan" }), true);
  assert.equal(isRecordOnlyUserOperation({ pool: "user", purpose: "plan_prep", trigger: PLAN_PREP_REGENERATE_TRIGGER }), false);
  assert.equal(isPlanFlowOperation({ pool: "user", purpose: "plan_prep", trigger: PLAN_PREP_REGENERATE_TRIGGER }), true);
  assert.equal(isPlanFlowOperation({ pool: "user", purpose: "plan_prep", trigger: "plan" }), false);
  assert.equal(isPlanFlowOperation({ pool: "user", purpose: "plan_search", trigger: "auto" }), false);
});

test("ledger v8 accepts plan_search / plan_prep in the user pool, counts only regenerated prep against the plan-flow limit, and rolls back to v7", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `r33_ledger_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const insertRaw = (purpose: string, key: string) => pool.query(
    `insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, max_calls) values ($1, $2, 'a', '2026-11-01', 'user', $3, 'auto', $2, 1)`,
    [WS, key, purpose],
  );
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    const applied = () => pool.query("select version, name from network_analysis_schema_migrations order by version").then((result) => result.rows);
    assert.equal((await applied()).length, NETWORK_ANALYSIS_MIGRATIONS.length);
    assert.deepEqual((await applied()).at(-1), { name: "ai-usage-plan-v3-purposes", version: 8 });

    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    const now = new Date("2026-11-01T03:00:00.000Z");
    const reserve = (key: string, purpose: "plan_search" | "plan_prep" | "plan_draft" | "insight", trigger: "auto" | "manual" | "plan" = "auto") =>
      ledger.reserve({ actorId: "actor:a", idempotencyKey: key, now, pool: "user", purpose, trigger });

    // 8 次搜索 + 4 张初次准备卡：都记账、都不占用户池 10 次与计划流程 15 次。
    for (let n = 1; n <= PLAN_SEARCH_PER_PLAN_LIMIT; n += 1) assert.equal((await reserve(`search:${n}`, "plan_search")).ok, true, `search ${n}`);
    for (let n = 1; n <= 4; n += 1) assert.equal((await reserve(`prep:${n}`, "plan_prep", "plan")).ok, true, `prep ${n}`);
    const stored = (await pool.query("select purpose, pool, max_calls from ai_usage_ledger where idempotency_key in ('search:1', 'prep:1') order by purpose")).rows;
    assert.deepEqual(stored, [{ max_calls: AI_QUOTA_MAX_CALLS.plan_prep, pool: "user", purpose: "plan_prep" }, { max_calls: AI_QUOTA_MAX_CALLS.plan_search, pool: "user", purpose: "plan_search" }]);
    let usage = await ledger.readUsageToday("actor:a", now);
    assert.deepEqual([usage.user, usage.planFlow], [0, 0]);
    // 重生成的准备卡计入计划流程的 15 次。
    assert.equal((await reserve("prep:regen", "plan_prep", PLAN_PREP_REGENERATE_TRIGGER)).ok, true);
    usage = await ledger.readUsageToday("actor:a", now);
    assert.deepEqual([usage.user, usage.planFlow], [0, 1]);
    for (let n = 1; n < PLAN_FLOW_DAILY_LIMIT; n += 1) assert.equal((await reserve(`draft:${n}`, "plan_draft", "manual")).ok, true);
    assert.deepEqual(await reserve("prep:regen-over", "plan_prep", PLAN_PREP_REGENERATE_TRIGGER), { limit: "plan_flow", ok: false, reason: "daily_limit", retryOn: "2026-11-01T15:00:00.000Z" });
    // 流程满了搜索与初次准备卡照常记账；用户池 10 次也不受影响。
    assert.equal((await reserve("search:more", "plan_search")).ok, true);
    assert.equal((await reserve("prep:more", "plan_prep", "plan")).ok, true);
    for (let n = 0; n < USER_POOL_DAILY_LIMIT; n += 1) assert.equal((await reserve(`insight:${n}`, "insight", "manual")).ok, true);
    assert.equal((await reserve("insight:over", "insight", "manual")).ok, false);
    assert.equal((await reserve("search:still", "plan_search")).ok, true);
    // 固定池：两用途不能从后台池预留。
    await assert.rejects(ledger.reserve({ actorId: "actor:a", idempotencyKey: "search:bg", now, pool: "background", purpose: "plan_search", trigger: "auto" }), /user pool only/u);

    // 回退：删掉两种用途的行，v7 约束回来，plan_search 被拒；再前进又接受。
    await pool.query(AI_USAGE_PLAN_V3_ROLLBACK_SQL);
    assert.equal((await applied()).length, NETWORK_ANALYSIS_MIGRATIONS.length - 1);
    assert.equal((await pool.query("select count(*)::int as n from ai_usage_ledger where purpose in ('plan_search', 'plan_prep')")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int as n from ai_usage_ledger")).rows[0].n, PLAN_FLOW_DAILY_LIMIT - 1 + USER_POOL_DAILY_LIMIT, "other rows survive the rollback");
    await assert.rejects(insertRaw("plan_search", "raw:search"));
    await assert.rejects(insertRaw("plan_prep", "raw:prep"));
    await insertRaw("event_matching", "raw:matching");
    await runNetworkAnalysisMigrations(pool);
    assert.equal((await applied()).length, NETWORK_ANALYSIS_MIGRATIONS.length);
    await insertRaw("plan_search", "raw:search");
    await assert.rejects(insertRaw("plan_bogus", "raw:bogus"));
    await client.close().catch(() => undefined);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
