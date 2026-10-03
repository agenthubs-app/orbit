/**
 * W0057（真实 PostgreSQL）：洞察即时生成链路——SC-W0057-01（确认即生成、合批、定向领取、缺行对账）、
 * SC-W0057-03（即时池不占 10 次、20 次上限退回后台、幂等、重新分析补行、目标首次设置解封）、
 * SC-W0057-04（失败自动重试 5／10 分钟、第 3 次停下、不重复计费）。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库（地址不是本机回环直接失败），每个用例在随机 schema 里建表、用完即删。
 * 供应商一律是 fetch 桩（不出网，计数 HTTP 次数），账本用真实的 `ai_usage_ledger`／`ai_usage_calls`。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { INSTANT_INSIGHT_DAILY_LIMIT, USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { createDeepseekContactInsightGenerator } from "../../features/contacts/insights/generator";
import { runInstantInsightGeneration, type InstantInsightDeps } from "../../features/contacts/insights/instant";
import { createContactInsightsMaintenanceTask } from "../../features/contacts/insights/maintenance-task";
import { runContactInsightsMigrations } from "../../features/contacts/insights/migrations";
import { readContactInsightDetail, readContactInsightStatus } from "../../features/contacts/insights/read";
import { requestContactInsightRegeneration } from "../../features/contacts/insights/regenerate";
import {
  createPostgresContactInsightRepository,
  insertMissingContactInsightRows,
  markContactInsightsDirty,
  unblockNoGoalContactInsights,
} from "../../features/contacts/insights/repository";
import { createContactInsightsRuntime, type ContactInsightsRuntime } from "../../features/contacts/insights/runtime";
import { contactInsightView } from "../../features/contacts/insights/view";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runPlanMigrations } from "../../features/plans/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 120_000 };
const WORKSPACE = "workspace:contact-insights-instant";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NOW = new Date("2026-10-03T03:00:00.000Z"); // 东京 2026-10-03 12:00
const GOAL = "三个月内找到日本市场的渠道伙伴";
const ALICE = "actor:alice";
const BOB = "actor:bob";

interface Stub {
  fetchImplementation: typeof fetch;
  requests: { contacts: string[] }[];
  /** 第 n 次请求（从 1 计）是否失败（500，无响应体用量 → no_response）。 */
  failOn: Set<number>;
}

function providerStub(): Stub {
  const stub: Stub = { failOn: new Set(), fetchImplementation: undefined as never, requests: [] };
  stub.fetchImplementation = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content) as { contacts: { id: string; name: string }[] };
    stub.requests.push({ contacts: user.contacts.map((contact) => contact.name) });
    if (stub.failOn.has(stub.requests.length)) return new Response("{}", { status: 500 });
    const insights = user.contacts.map((contact) => ({
      contactId: contact.id,
      evidence: [],
      goalRelation: { en: `${contact.name} can open channel doors in Japan.`, zh: `${contact.name} 能帮你打开日本渠道。` },
      nextStep: { en: `Invite ${contact.name} for coffee.`, zh: `约 ${contact.name} 喝咖啡。` },
    }));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ insights }) } }], usage: { completion_tokens: 50, prompt_tokens: 100 } }), { status: 200 });
  }) as typeof fetch;
  return stub;
}

interface Harness {
  pool: Pool;
  client: TransactionalPostgresClient;
  clock: { now: Date };
  goals: Map<string, string | null>;
  stub: Stub;
  runtime: ContactInsightsRuntime;
  heartbeats: number;
  instant(input: { actorId: string; contactIds?: string[]; maxBatches?: number }): ReturnType<typeof runInstantInsightGeneration>;
}

async function seedContact(pool: Pool, id: string, actor: string, extra: Record<string, unknown> = {}, updatedAt = NOW): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'instant-test', 'active', $4::jsonb, $5, $5)`,
    [WORKSPACE, id, actor, JSON.stringify({ createdAt: "2026-09-01T00:00:00.000Z", displayName: `Person ${id.replace("contact:", "").toUpperCase()}`, id, ...extra }), updatedAt],
  );
}

async function withDatabase(run: (harness: Harness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
  const schema = `insights_instant_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 8, options: `-c search_path=${schema} -c statement_timeout=20000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    await runContactInsightsMigrations(pool);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const clock = { now: NOW };
    const goals = new Map<string, string | null>([[ALICE, GOAL], [BOB, GOAL]]);
    const stub = providerStub();
    const generator = createDeepseekContactInsightGenerator({ apiKey: "test-key", fetchImplementation: stub.fetchImplementation });
    const runtime = createContactInsightsRuntime({ client, generator, now: () => clock.now, readGoal: async (actorId) => goals.get(actorId) ?? null, workspaceId: WORKSPACE });
    const harness: Harness = {
      client, clock, goals, heartbeats: 0, pool, runtime, stub,
      instant: (input) => {
        const deps: InstantInsightDeps = { ...runtime, bootstrapHeartbeat: async () => { harness.heartbeats += 1; } };
        return runInstantInsightGeneration(deps, { coalesceMs: 0, ...input });
      },
    };
    await run(harness);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

async function row(pool: Pool, actor: string, contactId: string) {
  return (await pool.query(`select * from contact_insights where workspace_id = $1 and actor_id = $2 and contact_id = $3`, [WORKSPACE, actor, contactId])).rows[0] as Record<string, unknown> | undefined;
}

async function ledger(pool: Pool, actor = ALICE) {
  return (await pool.query(`select id, pool, purpose, trigger, status, idempotency_key from ai_usage_ledger where actor_id = $1 order by created_at, id`, [actor])).rows;
}

const mark = (harness: Harness, actor: string, ids: string[]) =>
  markContactInsightsDirty(harness.client, { actorId: actor, contactIds: ids, now: harness.clock.now, reason: "enrichment", workspaceId: WORKSPACE });

function maintenancePass(harness: Harness) {
  return createContactInsightsMaintenanceTask({ resolve: () => harness.runtime }).run({ deadline: Date.now() + 60_000, now: () => harness.clock.now } as never) as Promise<Record<string, number>>;
}

test("SC-01 confirm one card: the instant executor claims that contact, reserves 1 instant user-pool operation, calls the provider once, row ready; heartbeat bootstrapped", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await seedContact(harness.pool, "contact:a", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    const summary = await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.deepEqual([summary.batches, summary.contacts, summary.callsResponded, summary.fallback], [1, 1, 1, 0]);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.status, "ready");
    const ops = await ledger(harness.pool);
    assert.equal(ops.length, 1);
    assert.deepEqual([ops[0]!.pool, ops[0]!.purpose, ops[0]!.trigger, ops[0]!.status], ["user", "insight", "auto", "succeeded"]);
    assert.match(String(ops[0]!.idempotency_key), /^insight:instant:actor:alice:[0-9a-f]{32}:a1$/);
    // D62：即时生成不占用户池 10 次（user=0），单独计 instant=1。
    const usage = await harness.runtime.ledger.readUsageToday(ALICE, NOW);
    assert.deepEqual([usage.user, usage.instant, usage.background], [0, 1, 0]);
    assert.equal(harness.heartbeats, 1);
  });
});

test("SC-01 five cards confirmed <1 s apart: at most 2 provider calls, each ≤20 contacts (coalesced claim)", databaseTest, async () => {
  await withDatabase(async (harness) => {
    for (const id of ["a", "b", "c", "d", "e"]) await seedContact(harness.pool, `contact:${id}`, ALICE);
    // 第 1 张的 after 在合批等待（3 s）后才领取：此时 1–4 张已确认；第 5 张在它之后确认。
    for (const id of ["a", "b", "c", "d"]) await mark(harness, ALICE, [`contact:${id}`]);
    const kicks = [harness.instant({ actorId: ALICE, contactIds: ["contact:a"] })];
    await kicks[0];
    await mark(harness, ALICE, ["contact:e"]);
    for (const id of ["b", "c", "d", "e"]) kicks.push(harness.instant({ actorId: ALICE, contactIds: [`contact:${id}`] }));
    await Promise.all(kicks);
    assert.ok(harness.stub.requests.length <= 2, `${harness.stub.requests.length} provider calls`);
    assert.deepEqual(harness.stub.requests.map((request) => request.contacts.length), [4, 1]);
    for (const id of ["a", "b", "c", "d", "e"]) assert.equal((await row(harness.pool, ALICE, `contact:${id}`))?.status, "ready");
    assert.equal((await ledger(harness.pool)).length, 2);
  });
});

test("SC-01 G-7 targeted claim: another actor's older backlog is never processed by this actor's confirmation", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await seedContact(harness.pool, "contact:bob-1", BOB);
    await seedContact(harness.pool, "contact:a", ALICE);
    harness.clock.now = new Date(NOW.getTime() - 3_600_000);
    await mark(harness, BOB, ["contact:bob-1"]); // 更早的积压
    harness.clock.now = NOW;
    await mark(harness, ALICE, ["contact:a"]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.equal(harness.stub.requests.length, 1);
    assert.deepEqual(harness.stub.requests[0]!.contacts, ["Person A"]);
    assert.equal((await row(harness.pool, BOB, "contact:bob-1"))?.status, "pending");
    assert.notEqual((await row(harness.pool, BOB, "contact:bob-1"))?.dirty_at, null);
    assert.deepEqual(await ledger(harness.pool, BOB), []);
  });
});

test("SC-01 G-2 both post-confirm marks failed (no row): the next maintenance round reconciles the missing row and generates it", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await seedContact(harness.pool, "contact:a", ALICE);
    await seedContact(harness.pool, "contact:old", ALICE, {}, new Date(NOW.getTime() - 30 * 86_400_000));
    await seedContact(harness.pool, "contact:bob-1", BOB);
    harness.goals.set(BOB, null);
    assert.equal(await row(harness.pool, ALICE, "contact:a"), undefined);
    const summary = await maintenancePass(harness);
    assert.equal(summary.backfilled, 2, "alice's recent contact (pending) + bob's (blocked, no goal)");
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.status, "ready");
    assert.equal(await row(harness.pool, ALICE, "contact:old"), undefined, "older than 7 days stays for the authorised backfill");
    assert.equal((await row(harness.pool, BOB, "contact:bob-1"))?.status, "blocked_no_goal");
    assert.equal(harness.stub.requests.length, 1);
    // 第二轮：没有缺行，什么也不做。
    assert.equal((await maintenancePass(harness)).backfilled, 0);
    assert.equal(harness.stub.requests.length, 1);
  });
});

test("SC-03 instant pool: does not consume the 10 user actions; manual regenerate still counts; beyond 20/day falls back to the background pool silently", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const ledgerApi = createPostgresAiUsageLedger({ client: harness.client, workspaceId: WORKSPACE });
    for (let index = 0; index < INSTANT_INSIGHT_DAILY_LIMIT; index += 1) {
      await harness.pool.query(
        `insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, status, max_calls, created_at, finished_at)
         values ($1, $2, $3, '2026-10-03', 'user', 'insight', 'auto', $4, 'succeeded', 1, $5, $5)`,
        [WORKSPACE, `aiop_instant_${index}`, ALICE, `fill:instant:${index}`, NOW.toISOString()],
      );
    }
    const usage = await ledgerApi.readUsageToday(ALICE, NOW);
    assert.deepEqual([usage.user, usage.instant], [0, INSTANT_INSIGHT_DAILY_LIMIT]);
    // 详情「重新生成」按钮的次数判定（readConfiguredUserPoolUsed 同口径：账本 user）不受即时生成影响。
    await seedContact(harness.pool, "contact:a", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    const detail = await readContactInsightDetail({ actorId: ALICE, contactId: "contact:a", now: NOW }, {
      readGoal: async () => GOAL,
      readRows: (actorId, ids) => harness.runtime.repository.readRows(actorId, ids),
      readUserPoolUsed: async (actorId, now) => (await ledgerApi.readUsageToday(actorId, now)).user,
    });
    assert.equal(detail.quotaExhausted, false);
    // 第 21 次即时生成：不报错、0 次调用，行保持待更新（不顺延），后台池维护任务接手。
    const summary = await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.deepEqual([summary.fallback, summary.limited, summary.callsResponded], [1, true, 0]);
    assert.equal(harness.stub.requests.length, 0);
    const pending = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([pending?.status, pending?.ai_state, pending?.deferred_until], ["pending", "none", null]);
    assert.notEqual(pending?.dirty_at, null);
    await maintenancePass(harness);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.status, "ready");
    assert.equal((await ledgerApi.readUsageToday(ALICE, NOW)).background, 1);
    // 单人重新生成照常计入 10 次（trigger manual）。
    await seedContact(harness.pool, "contact:b", ALICE);
    await mark(harness, ALICE, ["contact:b"]);
    const outcome = await requestContactInsightRegeneration({ ...harness.runtime, schedule: () => { throw new Error("inline"); } }, { actorId: ALICE, contactId: "contact:b" });
    assert.equal(outcome.status, "scheduled");
    const after = await ledgerApi.readUsageToday(ALICE, NOW);
    assert.deepEqual([after.user, after.instant], [1, INSTANT_INSIGHT_DAILY_LIMIT]);
    assert.ok(after.user < USER_POOL_DAILY_LIMIT);
  });
});

test("SC-03 idempotent: kicking the same batch again (replay, double click) after it is ready reserves nothing; same version is never re-billed", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await seedContact(harness.pool, "contact:a", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    // 确认回放：再标一次 + 再踢一次（数据没变）。
    await mark(harness, ALICE, ["contact:a"]);
    await Promise.all([harness.instant({ actorId: ALICE, contactIds: ["contact:a"] }), harness.instant({ actorId: ALICE, contactIds: ["contact:a"] })]);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await ledger(harness.pool)).length, 1);
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.dirty_at, null);
  });
});

test("SC-03 re-analysis backfill: 1,050 confirmed contacts without rows get pending rows across pages; others' and unconfirmed contacts are never inserted; the instant kick handles at most 5 batches", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await harness.pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
       select $1, 'contacts', 'contact:' || lpad(n::text, 5, '0'), $2, 'manual', 'instant-test', 'active',
         jsonb_build_object('id', 'contact:' || lpad(n::text, 5, '0'), 'displayName', 'Person ' || n), $3, $3
       from generate_series(1, 1050) as n`,
      [WORKSPACE, ALICE, NOW],
    );
    await seedContact(harness.pool, "contact:unnamed", ALICE, { displayName: "" });
    await seedContact(harness.pool, "contact:bob-1", BOB);
    // 已有行的联系人不重复插入。
    await mark(harness, ALICE, ["contact:00001"]);
    const inserted = await insertMissingContactInsightRows(harness.client, { actorId: ALICE, now: NOW, reason: "goal", workspaceId: WORKSPACE });
    assert.equal(inserted.length, 1049);
    assert.equal(Number((await harness.pool.query(`select count(*) from contact_insights where actor_id = $1`, [ALICE])).rows[0].count), 1050);
    assert.equal(await row(harness.pool, ALICE, "contact:unnamed"), undefined);
    assert.equal(await row(harness.pool, BOB, "contact:bob-1"), undefined);
    assert.deepEqual((await row(harness.pool, ALICE, "contact:01050"))?.dirty_reasons, ["goal"]);
    // replayed：再执行一次幂等，0 行。
    assert.deepEqual(await insertMissingContactInsightRows(harness.client, { actorId: ALICE, now: NOW, reason: "goal", workspaceId: WORKSPACE }), []);
    const summary = await harness.instant({ actorId: ALICE });
    assert.equal(summary.batches, 5);
    assert.equal(harness.stub.requests.length, 5);
    assert.ok(harness.stub.requests.every((request) => request.contacts.length === 20));
    assert.equal(Number((await harness.pool.query(`select count(*) from contact_insights where actor_id = $1 and dirty_at is not null`, [ALICE])).rows[0].count), 950);
  });
});

test("SC-03 W57-2: no goal → blocked, 0 calls, 0 reservations; goal set (empty → non-empty) unblocks and generates; a ready row with a changed goal only shows 目标已更新", databaseTest, async () => {
  await withDatabase(async (harness) => {
    harness.goals.set(ALICE, null);
    await seedContact(harness.pool, "contact:a", ALICE);
    await seedContact(harness.pool, "contact:r", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    const blocked = await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.equal(blocked.noGoal, 1);
    assert.equal(harness.stub.requests.length, 0);
    assert.deepEqual(await ledger(harness.pool), []);
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.status, "blocked_no_goal");
    // 无目标：详情显示设目标引导。
    const noGoalView = contactInsightView(await harness.runtime.repository.readRows(ALICE, ["contact:a"]).then((rows) => rows.get("contact:a")), { contactId: "contact:a", goal: null, now: NOW });
    assert.equal(noGoalView.state, "no_goal");

    harness.goals.set(ALICE, GOAL);
    assert.deepEqual(await unblockNoGoalContactInsights(harness.client, { actorId: ALICE, now: NOW, workspaceId: WORKSPACE }), ["contact:a"]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.status, "ready");
    assert.equal(harness.stub.requests.length, 1);

    // W51-1 不回归：ready 行改目标不自动重算，解封只动 blocked 行。
    harness.goals.set(ALICE, "新的目标");
    assert.deepEqual(await unblockNoGoalContactInsights(harness.client, { actorId: ALICE, now: NOW, workspaceId: WORKSPACE }), []);
    const readyRow = await harness.runtime.repository.readRows(ALICE, ["contact:a"]).then((rows) => rows.get("contact:a"));
    assert.equal(readyRow?.dirtyAt, null);
    assert.equal(contactInsightView(readyRow, { contactId: "contact:a", goal: "新的目标", now: NOW }).goalUpdated, true);
    assert.equal(harness.stub.requests.length, 1);
  });
});

test("SC-04 provider fails twice then succeeds: failed (retry in 5 min) → failed (retry in 10 min) → ready via the heartbeat maintenance; every attempt is a separate, never double-billed operation", databaseTest, async () => {
  await withDatabase(async (harness) => {
    harness.stub.failOn = new Set([1, 2]);
    await seedContact(harness.pool, "contact:a", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    let current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count], ["failed", 1]);
    assert.notEqual(current?.dirty_at, null);
    assert.equal((current?.deferred_until as Date).toISOString(), new Date(NOW.getTime() + 5 * 60_000).toISOString());
    const failedView = contactInsightView(await harness.runtime.repository.readRows(ALICE, ["contact:a"]).then((rows) => rows.get("contact:a")), { contactId: "contact:a", goal: GOAL, now: NOW });
    assert.deepEqual([failedView.state, failedView.autoRetry, failedView.canRegenerate], ["failed", true, false]);
    // 排期之前：心跳不重试；再次即时踢也不领（自动重试按排期）。
    await maintenancePass(harness);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.equal(harness.stub.requests.length, 1);
    harness.clock.now = new Date(NOW.getTime() + 5 * 60_000 + 1_000);
    await maintenancePass(harness);
    current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count, harness.stub.requests.length], ["failed", 2, 2]);
    assert.equal((current?.deferred_until as Date).toISOString(), new Date(harness.clock.now.getTime() + 10 * 60_000).toISOString());
    harness.clock.now = new Date(harness.clock.now.getTime() + 10 * 60_000 + 1_000);
    await maintenancePass(harness);
    current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count, current?.dirty_at, harness.stub.requests.length], ["ready", 0, null, 3]);
    // 计费：3 次尝试 = 3 笔不同操作（第 1 次即时池、两次重试后台池），每笔恰好 1 条 HTTP 子账；失败的尝试也拿到了 HTTP 响应，
    // 按实际发生计 1 次（failed），同一次尝试不会被重复预留或重复计费。
    const ops = await ledger(harness.pool);
    assert.equal(ops.length, 3);
    assert.equal(new Set(ops.map((op) => op.idempotency_key)).size, 3);
    assert.deepEqual(ops.map((op) => [op.pool, op.status]), [["user", "failed"], ["background", "failed"], ["background", "succeeded"]]);
    const calls = await harness.pool.query(`select operation_id, count(*)::int as n from ai_usage_calls group by operation_id`);
    assert.ok(calls.rows.every((entry) => entry.n === 1), "one HTTP sub-ledger per operation");
  });
});

test("SC-04 three failures stop at failed with 重新生成; retry_count resets on the next round and on success (history does not consume the new round)", databaseTest, async () => {
  await withDatabase(async (harness) => {
    harness.stub.failOn = new Set([1, 2, 3]);
    await seedContact(harness.pool, "contact:a", ALICE);
    await mark(harness, ALICE, ["contact:a"]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    harness.clock.now = new Date(NOW.getTime() + 6 * 60_000);
    await maintenancePass(harness);
    harness.clock.now = new Date(harness.clock.now.getTime() + 11 * 60_000);
    await maintenancePass(harness);
    let current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count, current?.dirty_at, harness.stub.requests.length], ["failed", 3, null, 3]);
    harness.clock.now = new Date(harness.clock.now.getTime() + 60 * 60_000);
    await maintenancePass(harness);
    assert.equal(harness.stub.requests.length, 3, "stopped: no more automatic retries");
    const view = contactInsightView(await harness.runtime.repository.readRows(ALICE, ["contact:a"]).then((rows) => rows.get("contact:a")), { contactId: "contact:a", goal: GOAL, now: harness.clock.now });
    assert.deepEqual([view.state, view.autoRetry, view.canRegenerate], ["failed", false, true]);
    // 新一轮待更新：清零，重新获得 2 次自动重试。
    await mark(harness, ALICE, ["contact:a"]);
    current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count], ["pending", 0]);
    harness.stub.failOn = new Set([4]);
    await harness.instant({ actorId: ALICE, contactIds: ["contact:a"] });
    assert.equal((await row(harness.pool, ALICE, "contact:a"))?.retry_count, 1);
    harness.clock.now = new Date(harness.clock.now.getTime() + 6 * 60_000);
    await maintenancePass(harness);
    current = await row(harness.pool, ALICE, "contact:a");
    assert.deepEqual([current?.status, current?.retry_count], ["ready", 0]);
  });
});

test("SC-02 status read: own contact without a row → goal known (正在生成 / 设目标); another actor's contact → null (404); 0 provider calls", databaseTest, async () => {
  await withDatabase(async (harness) => {
    await seedContact(harness.pool, "contact:a", ALICE);
    await seedContact(harness.pool, "contact:bob-1", BOB);
    const repository = createPostgresContactInsightRepository({ client: harness.client, workspaceId: WORKSPACE });
    const deps = {
      ownsContact: (actorId: string, contactId: string) => repository.ownsContact(actorId, contactId),
      readGoal: async (actorId: string) => harness.goals.get(actorId) ?? null,
      readRows: (actorId: string, ids: readonly string[]) => repository.readRows(actorId, ids),
      readUserPoolUsed: async () => 0,
    };
    const own = await readContactInsightStatus({ actorId: ALICE, contactId: "contact:a", now: NOW }, deps);
    assert.ok(own);
    assert.equal(contactInsightView(own.row, { contactId: "contact:a", goal: own.goal, goalKnown: own.goalKnown, now: NOW }).state, "pending");
    harness.goals.set(ALICE, null);
    const noGoal = await readContactInsightStatus({ actorId: ALICE, contactId: "contact:a", now: NOW }, deps);
    assert.equal(contactInsightView(noGoal!.row, { contactId: "contact:a", goal: noGoal!.goal, goalKnown: noGoal!.goalKnown, now: NOW }).state, "no_goal");
    assert.equal(await readContactInsightStatus({ actorId: ALICE, contactId: "contact:bob-1", now: NOW }, deps), null);
    assert.equal(harness.stub.requests.length, 0);
    assert.deepEqual(await ledger(harness.pool), []);
  });
});
