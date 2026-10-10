/**
 * R22 SC-R22-01 / SC-R22-07（真实 PostgreSQL，只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库）：
 * plans v2 迁移（从零、从 v1 数据升级、重跑、约束）与 AI 账本新用途（max_calls、月上限、计划生成流程日上限）。
 * 每个用例一个随机 schema，用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { AI_QUOTA_MAX_CALLS, nextTokyoMonthStart, PLAN_FLOW_DAILY_LIMIT, USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { NETWORK_ANALYSIS_MIGRATIONS, runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { PLAN_MIGRATIONS, PLAN_SCHEMA_MIGRATIONS, runPlanMigrations } from "../../features/plans/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:plans-v2-test";

async function withSchema(run: (pool: Pool) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `plans_v2_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 6, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await run(pool);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function insertV1(pool: Pool, id: string, actor: string, version: number, status: "active" | "archived" = "active") {
  await pool.query(
    `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on, archived_at)
     values ($1, $2, $3, $4, $5, 'g', 'quarter', '2026-09-01', $6)`,
    [WS, id, actor, version, status, status === "archived" ? "2026-09-10T00:00:00Z" : null],
  );
}

async function insertV2(pool: Pool, id: string, actor: string, version: number, goalId: string, extra: Record<string, unknown> = {}) {
  const row = { event_allocation: 15, event_target_count: 3, goal_kind: "launch", horizon: null, status: "active", ...extra };
  await pool.query(
    `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on, model_version, goal_id, goal_kind,
       event_allocation, event_target_count, achieved_at, archived_at)
     values ($1, $2, $3, $4, $5, 'goal', $6, '2026-10-10', 2, $7, $8, $9, $10, $11, $12)`,
    [WS, id, actor, version, row.status, row.horizon, goalId, row.goal_kind, row.event_allocation, row.event_target_count, (row as { achieved_at?: string }).achieved_at ?? null, (row as { archived_at?: string }).archived_at ?? null],
  );
}

test("plans v2 migrates from zero, records both versions, and reruns without changes", databaseTest, async () => {
  await withSchema(async (pool) => {
    await runPlanMigrations(pool);
    const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = current_schema() order by tablename")).rows.map((row) => row.tablename);
    for (const table of ["plan_drafts", "plan_flow_commands", "plan_intakes", "plan_revisions"]) assert.ok(tables.includes(table), table);
    const applied = async () => (await pool.query("select version, name, checksum, applied_at from plans_schema_migrations order by version")).rows;
    const before = await applied();
    assert.deepEqual(before.map(({ version, name, checksum }) => ({ checksum, name, version })), PLAN_MIGRATIONS.map(({ version, name, checksum }) => ({ checksum, name, version })));
    assert.equal(before.length, 2);
    await runPlanMigrations(pool);
    assert.deepEqual(await applied(), before);
  });
});

test("plans v2 upgrades a database that already holds v1 plans, items, log and receipts", databaseTest, async () => {
  await withSchema(async (pool) => {
    await runPlanMigrations(pool, PLAN_SCHEMA_MIGRATIONS.slice(0, 1));
    await insertV1(pool, "old-1", "actor:a", 1, "archived");
    await insertV1(pool, "old-2", "actor:a", 2, "active");
    await pool.query(
      `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key, criteria, linked_event_id, answer, completed_at)
       values ($1, 'i-need', 'actor:a', 'old-2', 'network_need', 'VC', 'open', 1, '{"targetCount":2}'::jsonb, null, null, null),
              ($1, 'i-act', 'actor:a', 'old-2', 'action', 'Meet', 'done', 2, null, null, null, now()),
              ($1, 'i-info', 'actor:a', 'old-2', 'info', 'Ask', 'answered', 3, null, null, 'yes', null),
              ($1, 'i-event', 'actor:a', 'old-2', 'event', 'Night', 'attended', 4, null, 'event:1', null, null)`,
      [WS],
    );
    await pool.query(
      `insert into plan_log (workspace_id, id, actor_id, plan_id, item_id, kind, event, author, body, idempotency_key)
       values ($1, 'log-1', 'actor:a', 'old-2', 'i-need', 'auto', 'plan_created', 'system', 'created', 'reanalysis:2026-09')`,
      [WS],
    );
    await runPlanMigrations(pool);
    const rows = (await pool.query("select id, model_version, horizon, revision, goal_id from plans order by id")).rows;
    assert.deepEqual(rows, [
      { goal_id: null, horizon: "quarter", id: "old-1", model_version: 1, revision: 1 },
      { goal_id: null, horizon: "quarter", id: "old-2", model_version: 1, revision: 1 },
    ]);
    assert.equal((await pool.query("select count(*)::int as n from plan_items where allocation is null and skipped_at is null")).rows[0].n, 4);
    assert.equal((await pool.query("select count(*)::int as n from plan_log")).rows[0].n, 1);
  });
});

test("plans v2 constraints: v1 keeps its horizon and one active plan; v2 is one active plan per goal", databaseTest, async () => {
  await withSchema(async (pool) => {
    await runPlanMigrations(pool);
    // v1 不能没有期限；v2 不能有期限，也必须有目标与イベント枠。
    await assert.rejects(pool.query(`insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on) values ($1, 'x', 'a', 1, 'active', 'g', null, '2026-09-01')`, [WS]));
    await assert.rejects(insertV2(pool, "v2-h", "a", 2, "goal-1", { horizon: "year" }));
    await assert.rejects(pool.query(`insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, starts_on, model_version) values ($1, 'v2-bare', 'a', 3, 'active', 'g', '2026-09-01', 2)`, [WS]));
    // 每人仍只有一份生效的 v1（legacy 桶）。
    await insertV1(pool, "v1-a", "a", 10);
    await assert.rejects(insertV1(pool, "v1-b", "a", 11));
    // v2：不同目标可同时生效，同一目标只有一份；与 v1 共存。
    await insertV2(pool, "v2-1", "a", 20, "goal-1");
    await insertV2(pool, "v2-2", "a", 21, "goal-2");
    await assert.rejects(insertV2(pool, "v2-3", "a", 22, "goal-1"));
    // 达成 = archived + achieved_at；生效中的计划不能带达成时间。
    await assert.rejects(pool.query(`update plans set achieved_at = now() where id = 'v2-1'`));
    await pool.query(`update plans set status = 'archived', archived_at = now(), achieved_at = now() where id = 'v2-1'`);
    await insertV2(pool, "v2-4", "a", 23, "goal-1");
    // 配点 5 分一档；跳过只给人物类型。
    await assert.rejects(pool.query(`insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key, allocation) values ($1, 'n1', 'a', 'v2-2', 'network_need', 'VC', 'open', 1, 12)`, [WS]));
    await pool.query(`insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key, allocation, type_slot, skipped_at) values ($1, 'n2', 'a', 'v2-2', 'network_need', 'VC', 'open', 1, 30, 'vc_partner', now())`, [WS]);
    await assert.rejects(pool.query(`insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key, skipped_at) values ($1, 'a1', 'a', 'v2-2', 'action', 'x', 'not_started', 2, now())`, [WS]));
    // 每份计划同时只有一份打开的见直草稿。
    const draft = (id: string) => pool.query(
      `insert into plan_drafts (workspace_id, id, actor_id, kind, plan_id, base_revision, content, origin_content) values ($1, $2, 'a', 'review', 'v2-2', 1, '{}'::jsonb, '{}'::jsonb)`, [WS, id]);
    await draft("d1");
    await assert.rejects(draft("d2"));
  });
});

test("the AI ledger accepts the plan v2 purposes with their own max_calls, monthly limits and the plan-flow daily limit", databaseTest, async () => {
  await withSchema(async (pool) => {
    await runPlanMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    assert.equal((await pool.query("select count(*)::int as n from network_analysis_schema_migrations")).rows[0].n, NETWORK_ANALYSIS_MIGRATIONS.length);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool: pool as never });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    const now = new Date("2026-10-10T03:00:00.000Z");
    const reserve = (key: string, purpose: Parameters<typeof ledger.reserve>[0]["purpose"], pool: "user" | "background" = "user", at = now) =>
      ledger.reserve({ actorId: "actor:a", idempotencyKey: key, now: at, pool, purpose, trigger: "manual" });

    const draft = await reserve("draft:1", "plan_draft");
    assert.equal(draft.ok, true);
    const stored = (await pool.query("select purpose, max_calls from ai_usage_ledger where idempotency_key = 'draft:1'")).rows[0];
    assert.deepEqual(stored, { max_calls: AI_QUOTA_MAX_CALLS.plan_draft, purpose: "plan_draft" });
    await assert.rejects(pool.query(`insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, max_calls) values ($1, 'x', 'a', '2026-10-10', 'user', 'mail_summary', 'manual', 'k', 1)`, [WS]));

    // 見直し：月 3 次；第 4 次被月上限挡住（下月 1 日恢复）；released 不计。
    for (const n of [1, 2, 3]) assert.equal((await reserve(`review:${n}`, "plan_review")).ok, true);
    assert.deepEqual(await reserve("review:4", "plan_review"), { limit: "monthly", ok: false, reason: "monthly_limit", retryOn: nextTokyoMonthStart(now) });
    assert.equal(await ledger.countMonthly("actor:a", "plan_review", now), 3);
    await pool.query("update ai_usage_ledger set status = 'released', finished_at = now() where idempotency_key = 'review:3'");
    assert.equal(await ledger.countMonthly("actor:a", "plan_review", now), 2);
    assert.equal((await reserve("review:5", "plan_review")).ok, true);
    // 下个月重新计数。
    assert.equal((await reserve("review:next-month", "plan_review", "user", new Date("2026-10-31T15:00:00.000Z"))).ok, true);

    // 计划生成流程的日上限 15，不占用户池 10 次总熔断。
    let flow = 4; // draft:1 + review:1/2/5 already today
    for (let n = 0; flow < PLAN_FLOW_DAILY_LIMIT; n += 1, flow += 1) assert.equal((await reserve(`revise:${n}`, "plan_revise")).ok, true);
    assert.deepEqual(await reserve("revise:over", "plan_revise"), { limit: "plan_flow", ok: false, reason: "daily_limit", retryOn: "2026-10-10T15:00:00.000Z" });
    const usage = await ledger.readUsageToday("actor:a", now);
    assert.equal(usage.planFlow, PLAN_FLOW_DAILY_LIMIT);
    assert.equal(usage.user, 0);
    for (let n = 0; n < USER_POOL_DAILY_LIMIT; n += 1) assert.equal((await reserve(`insight:${n}`, "insight")).ok, true);
    assert.equal((await reserve("insight:over", "insight")).ok, false);
    // 复核 m11：有月上限的新用途只能从固定的池预留。
    await assert.rejects(reserve("draft:wrong-pool", "plan_draft", "background"), /user pool only/);
    await client.close().catch(() => undefined);
  });
});

test("review m1: a v1 row cannot carry a goal id (it would escape the one-active-v1 bucket); a v2 goal id cannot be 'legacy'", databaseTest, async () => {
  await withSchema(async (pool) => {
    await runPlanMigrations(pool);
    await assert.rejects(pool.query(`insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on, goal_id) values ($1, 'v1g', 'a', 1, 'active', 'g', 'month', '2026-09-01', 'goal-x')`, [WS]));
    await assert.rejects(insertV2(pool, "v2l", "a", 2, "legacy"));
  });
});
