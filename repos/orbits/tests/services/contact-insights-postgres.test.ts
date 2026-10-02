/**
 * W0051 SC-W0051-01／02／04（真实 PostgreSQL）：每人洞察的存储、增量标记、后台批量生成、单人重新生成与只读路径。
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库，每个用例在随机 schema 里建表、用完即删；地址不是本机回环时直接失败。
 * 供应商一律是 fetch 桩（不出网），账本用真实的 W0048a `ai_usage_ledger`／`ai_usage_calls`。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { nextTokyoMidnight } from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { createDeepseekContactInsightGenerator, type ContactInsightGenerator } from "../../features/contacts/insights/generator";
import { createContactInsightsMaintenanceTask } from "../../features/contacts/insights/maintenance-task";
import { contactInsightsMigrationDefinitions, runContactInsightsMigrations } from "../../features/contacts/insights/migrations";
import { readContactInsightDetail } from "../../features/contacts/insights/read";
import { requestContactInsightRegeneration } from "../../features/contacts/insights/regenerate";
import {
  contactInsightGoalHash,
  createPostgresContactInsightRepository,
  markContactInsightsDirty,
  markContactInsightsGoalDirty,
} from "../../features/contacts/insights/repository";
import { createContactInsightsRuntime, type ContactInsightsRuntime } from "../../features/contacts/insights/runtime";
import { readContactInsightsTabPage } from "../../features/contacts/insights/tab-reader";
import { createContactInsightRegenerateHandler } from "../../app/api/contacts/[id]/insight/regenerate/handler";
import { contactInsightView } from "../../features/contacts/insights/view";
import { CONTACT_INSIGHT_LEASE_MS } from "../../features/contacts/insights/worker";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { createNewContactLayersDeps } from "../../features/network-analysis/layers-runtime";
import { runNewContactLayers } from "../../features/network-analysis/new-contact-layers";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runPlanMigrations } from "../../features/plans/migrations";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { planInput, steppingClock } from "../support/plan-fixture";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:contact-insights-test";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NOW = new Date("2026-10-03T03:00:00.000Z"); // 东京 2026-10-03 12:00
const GOAL = "三个月内找到日本市场的渠道伙伴";

function assertLoopbackDatabaseUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    assert.fail("ORBIT_EVENT_DATABASE_URL is not a valid URL.");
  }
  assert.ok(LOOPBACK_HOSTS.has(hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
}

interface Harness {
  pool: Pool;
  client: TransactionalPostgresClient;
  clock: { now: Date };
  goals: Map<string, string | null>;
  stub: ReturnType<typeof deepseekStub>;
  runtime: ContactInsightsRuntime;
}

async function seedContact(pool: Pool, id: string, actor: string, extra: Record<string, unknown> = {}): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'insights-test', 'active', $4::jsonb, now(), now())`,
    [WORKSPACE, id, actor, JSON.stringify({ createdAt: "2026-09-01T00:00:00.000Z", displayName: `Person ${id.replace("contact:", "").toUpperCase()}`, id, ...extra })],
  );
}

async function seedStrength(pool: Pool, actor: string, contactId: string, tier: string, dormant = false, lastSignalAt = "2026-09-25T00:00:00.000Z"): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'relationship_strengths', $2, $3, 'system', 'insights-test', 'active', $4::jsonb, now(), now())
     on conflict (workspace_id, collection_name, record_id) do update set payload = excluded.payload`,
    [WORKSPACE, `relationship-strength:${actor}:${contactId}`, actor, JSON.stringify({
      computedAt: NOW.toISOString(), contactId, dormant, lastSignalAt, peakScore: 50, rulesVersion: "rs-2026-10-v1", score: 50, signals: [], tier,
    })],
  );
}

async function seedMemo(pool: Pool, actor: string, contactId: string, noteHash: string, body: string): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contact_detail_states', $2, $3, 'manual', 'insights-test', 'active', $4::jsonb, now(), now())`,
    [WORKSPACE, `detail:${actor}:${contactId}`, actor, JSON.stringify({
      actorId: actor, contactId, notes: [{ body, createdAt: "2026-09-28T00:00:00.000Z", kind: "memo", noteId: `note:live-contact-detail-update:${noteHash}`, occurredAt: "2026-09-28" }],
      status: "active", tags: [], updatedAt: "2026-09-28T00:00:00.000Z",
    })],
  );
}

/** DeepSeek 响应桩：按请求里的别名为每位联系人写一条中英洞察；故意夹带一个别人的记录别名与一个本组外的联系人。 */
function deepseekStub(options: { onRequest?: (body: Record<string, unknown>) => Promise<void> | void; fail?: boolean } = {}) {
  const requests: Record<string, unknown>[] = [];
  const fetchImplementation = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push(body);
    await options.onRequest?.(body);
    if (options.fail) return new Response("{}", { status: 500 });
    const messages = body.messages as { content: string }[];
    const user = JSON.parse(messages[1]!.content) as { contacts: { id: string; name: string; records?: { id: string }[]; needs?: { need: string }[] }[] };
    const foreignRecord = user.contacts.flatMap((contact) => contact.records ?? []).at(-1)?.id ?? "R999";
    const insights = user.contacts.map((contact, index) => ({
      contactId: contact.id,
      evidence: [...(contact.records?.[0] ? [contact.records[0].id] : []), ...(contact.needs?.[0] ? [contact.needs[0].need] : []), ...(index === 0 ? [foreignRecord, "R999"] : [])],
      goalRelation: { en: `${contact.name} can open channel doors in Japan.`, zh: `${contact.name} 能帮你打开日本渠道。` },
      nextStep: { en: `Invite ${contact.name} for coffee next week.`, zh: `下周约 ${contact.name} 喝咖啡。` },
    }));
    insights.push({ contactId: "C999", evidence: [], goalRelation: { en: "Ghost", zh: "幽灵" }, nextStep: { en: "Ghost", zh: "幽灵" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ insights }) } }], usage: { completion_tokens: 50, prompt_tokens: 100 } }), { status: 200 });
  }) as typeof fetch;
  return { fetchImplementation, requests };
}

async function withDatabase(run: (harness: Harness) => Promise<void>, stubOptions: Parameters<typeof deepseekStub>[0] = {}): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `insights_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 8, options: `-c search_path=${schema} -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    await runContactInsightsMigrations(pool);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const clock = { now: NOW };
    const goals = new Map<string, string | null>([["actor:alice", GOAL], ["actor:bob", GOAL]]);
    const stub = deepseekStub(stubOptions);
    const generator: ContactInsightGenerator = createDeepseekContactInsightGenerator({ apiKey: "test-key", fetchImplementation: stub.fetchImplementation });
    const runtime = createContactInsightsRuntime({ client, generator, now: () => clock.now, readGoal: async (actorId) => goals.get(actorId) ?? null, workspaceId: WORKSPACE });
    await run({ client, clock, goals, pool, runtime, stub });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

async function insightRow(pool: Pool, actor: string, contactId: string) {
  const result = await pool.query(`select * from contact_insights where workspace_id = $1 and actor_id = $2 and contact_id = $3`, [WORKSPACE, actor, contactId]);
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function dirtyIds(pool: Pool, actor = "actor:alice"): Promise<string[]> {
  const result = await pool.query(`select contact_id from contact_insights where workspace_id = $1 and actor_id = $2 and dirty_at is not null order by contact_id`, [WORKSPACE, actor]);
  return result.rows.map((row) => String(row.contact_id));
}

async function ledgerOps(pool: Pool, actor = "actor:alice") {
  return (await pool.query(`select id, pool, purpose, trigger, status from ai_usage_ledger where actor_id = $1 order by created_at, id`, [actor])).rows;
}

async function fillPool(pool: Pool, actor: string, poolName: "user" | "background", count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      `insert into ai_usage_ledger (workspace_id, id, actor_id, usage_day, pool, purpose, trigger, idempotency_key, status, max_calls, created_at, finished_at)
       values ($1, $2, $3, '2026-10-03', $4, 'memo_extraction', 'auto', $5, 'succeeded', 1, $6, $6)`,
      [WORKSPACE, `aiop_fill_${poolName}_${index}`, actor, poolName, `fill:${poolName}:${index}`, NOW.toISOString()],
    );
  }
}

function maintenance(runtime: ContactInsightsRuntime) {
  return createContactInsightsMaintenanceTask({ resolve: () => runtime });
}

async function runPass(harness: Harness) {
  return maintenance(harness.runtime).run({ deadline: Date.now() + 60_000, now: () => harness.clock.now } as never);
}

test("SC-01 migration builds contact_insights with lease columns, is repeatable and guards checksums", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    const columns = (await pool.query(`select column_name from information_schema.columns where table_name = 'contact_insights' and table_schema = current_schema()`)).rows.map((row) => row.column_name);
    for (const column of ["workspace_id", "actor_id", "contact_id", "status", "goal_relation", "next_step", "evidence", "relevance", "source_data_version",
      "dirty_at", "dirty_reasons", "deferred_until", "ai_state", "lease_owner", "lease_expires_at", "usage", "model", "generated_at", "attempts", "last_error_code"]) {
      assert.ok(columns.includes(column), column);
    }
    await runContactInsightsMigrations(pool);
    const tampered = contactInsightsMigrationDefinitions().map((migration) => ({ ...migration, sql: `${migration.sql}\n-- edited` }));
    await assert.rejects(runContactInsightsMigrations(pool, tampered), /checksum mismatch/);
  });
});

test("SC-01 a memo (or any marker) dirties only that contact, idempotently, with a reason; other actors and foreign ids are never marked; read paths mark nothing and call nothing", databaseTest, async () => {
  await withDatabase(async ({ pool, client, runtime, stub }) => {
    for (const id of ["contact:a", "contact:b", "contact:c"]) await seedContact(pool, id, "actor:alice");
    await seedContact(pool, "contact:bob-1", "actor:bob");
    const marked = await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    assert.deepEqual(marked, ["contact:a"]);
    assert.deepEqual(await dirtyIds(pool), ["contact:a"]);
    const first = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal(first?.status, "pending");
    assert.deepEqual(first?.dirty_reasons, ["memo"]);
    // 幂等：同一联系人再标一次不新增行；不同原因合并。
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "plan_link", workspaceId: WORKSPACE });
    assert.equal(Number((await pool.query(`select count(*) from contact_insights`)).rows[0].count), 1);
    assert.deepEqual((await insightRow(pool, "actor:alice", "contact:a"))?.dirty_reasons, ["memo", "plan_link"]);
    // 他人的联系人 id 与不存在的 id 一律不标。
    assert.deepEqual(await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:bob-1", "contact:nope"], reason: "memo", workspaceId: WORKSPACE }), []);
    assert.deepEqual(await dirtyIds(pool, "actor:bob"), []);

    // 三条读取路径：列表洞察一句（readRows）、详情、洞察标签——0 次标记、0 次生成、0 次配额。
    const before = (await pool.query(`select contact_id, dirty_at, updated_at from contact_insights order by contact_id`)).rows;
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    await repository.readRows("actor:alice", ["contact:a", "contact:b"]);
    await readContactInsightDetail({ actorId: "actor:alice", contactId: "contact:a", now: NOW }, {
      readGoal: async () => GOAL,
      readRows: (actorId, ids) => repository.readRows(actorId, ids),
      readUserPoolUsed: async () => 0,
    });
    await readContactInsightsTabPage({ client, workspaceId: WORKSPACE }, "actor:alice", { country: null, industry: null, page: 1, sort: "relevance", tier: null });
    // 列表与待唤醒的窄读：只回本人的行；没有文字的行不给洞察一句。
    assert.deepEqual([...(await repository.readPreviews("actor:alice", ["contact:a", "contact:bob-1"])).keys()], []);
    assert.deepEqual([...(await repository.readNextSteps("actor:alice", ["contact:a", "contact:bob-1"])).entries()], [["contact:a", { nextStep: null, status: "pending" }]]);
    assert.deepEqual((await pool.query(`select contact_id, dirty_at, updated_at from contact_insights order by contact_id`)).rows, before);
    assert.equal(stub.requests.length, 0);
    assert.deepEqual(await ledgerOps(pool), []);
    assert.ok(runtime);
  });
});

test("SC-01 plan link triggers (link / establish / unlink / accepted match candidate) dirty exactly the affected contact inside the plan transaction", databaseTest, async () => {
  await withDatabase(async ({ pool, client }) => {
    for (const id of ["contact:a", "contact:b", "contact:c", "contact:d"]) await seedContact(pool, id, "actor:alice");
    const repository = createPostgresPlanRepository({ pool: pool as never });
    const service = createPlanService({
      now: steppingClock(),
      references: createPostgresPlanReferenceValidator({ actorId: "actor:alice", client: pool as never, eventCore: { async getPublishedEvent(id: string) { return id === "event:tokyo-saas-night" ? ({ eventId: id } as never) : null; } }, workspaceId: WORKSPACE }),
      repository,
      scope: { actorId: "actor:alice", workspaceId: WORKSPACE },
    });
    const plan = await service.createVersion(planInput());
    const need = plan.items.find((item) => item.kind === "network_need")!;
    const done = plan.items.find((item) => item.kind === "action")!;
    // 无关写入（行动完成）不标。
    await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: done.id });
    assert.deepEqual(await dirtyIds(pool), []);
    await service.updateItem({ change: { contactId: "contact:a", op: "link_contact" }, itemId: need.id });
    assert.deepEqual(await dirtyIds(pool), ["contact:a"]);
    assert.deepEqual((await insightRow(pool, "actor:alice", "contact:a"))?.dirty_reasons, ["plan_link"]);
    await service.updateItem({ change: { contactId: "contact:a", op: "establish_contact" }, itemId: need.id });
    await service.updateItem({ change: { contactId: "contact:b", op: "link_contact" }, itemId: need.id });
    await pool.query(`update contact_insights set dirty_at = null, dirty_reasons = '{}'`);
    await service.updateItem({ change: { contactId: "contact:b", op: "unlink_contact" }, itemId: need.id });
    assert.deepEqual(await dirtyIds(pool), ["contact:b"]);
    // 接受匹配候选：经 linkWithin 在同一事务里标；驳回不标。
    await pool.query(`insert into plan_match_jobs (workspace_id, id, actor_id, source_kind, source_key) values ($1, 'job:1', 'actor:alice', 'batch', 'batch:1')`, [WORKSPACE]);
    for (const [id, contactId] of [["cand:c", "contact:c"], ["cand:d", "contact:d"]] as const) {
      await pool.query(
        `insert into plan_match_candidates (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength) values ($1, $2, 'actor:alice', 'job:1', $3, $4, $5, 'rule', 'strong')`,
        [WORKSPACE, id, plan.plan.id, need.id, contactId],
      );
    }
    await pool.query(`update contact_insights set dirty_at = null, dirty_reasons = '{}'`);
    await service.decideMatchCandidate({ candidateId: "cand:d", contactName: "D", decision: "dismiss" });
    assert.deepEqual(await dirtyIds(pool), []);
    await service.decideMatchCandidate({ candidateId: "cand:c", contactName: "C", decision: "accept" });
    assert.deepEqual(await dirtyIds(pool), ["contact:c"]);
    assert.ok(client);
  });
});

test("SC-01 enrichment trigger: the new-contact layers entry dirties exactly its contacts (reason enrichment), 0 AI", databaseTest, async () => {
  await withDatabase(async ({ pool, client, stub }) => {
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    const gateCalls: string[] = [];
    const gate = {
      async beginCall() { gateCalls.push("beginCall"); return { callId: "x" }; },
      async endCall() { gateCalls.push("endCall"); },
      async finish() { gateCalls.push("finish"); },
      async reserve() { gateCalls.push("reserve"); return { ok: false as const, reason: "disabled" as const }; },
    };
    const deps = createNewContactLayersDeps({ enricher: null, gate, runtime: { client, workspaceId: WORKSPACE } as never, store: {} as never });
    const result = await runNewContactLayers(
      { actorId: "actor:alice", contactIds: ["contact:a", "contact:bob-x"], now: NOW, sourceKey: "import:1" },
      { ...deps, enqueuePlanMatch: async () => ({ state: "skipped" }), refreshSnapshot: async () => ({ decision: "fresh" }) },
    );
    assert.equal(result.enrichment, "done");
    assert.deepEqual(await dirtyIds(pool), ["contact:a"]);
    assert.deepEqual((await insightRow(pool, "actor:alice", "contact:a"))?.dirty_reasons, ["enrichment"]);
    assert.deepEqual(gateCalls, []);
    assert.equal(stub.requests.length, 0);
  });
});

test("SC-02 background batches: ≤20 contacts per call, one background-pool operation per batch, one cost row per HTTP, started committed before the call; bilingual, foreign evidence dropped, rule relevance; request has no email, phone or memo body", databaseTest, async () => {
  const seen: string[][] = [];
  let poolRef: Pool | null = null;
  await withDatabase(async (harness) => {
    poolRef = harness.pool;
    const { pool, client } = harness;
    for (let index = 0; index < 25; index += 1) {
      const id = `contact:${String(index).padStart(2, "0")}`;
      await seedContact(pool, id, "actor:alice", { email: `secret${index}@example.com`, phone: `+81-90-0000-${String(index).padStart(4, "0")}`, organization: "Acme", role: "BD" });
    }
    await seedMemo(pool, "actor:alice", "contact:00", "abc123", "私密 memo 正文：不会进提示词");
    await seedStrength(pool, "actor:alice", "contact:00", "core");
    await seedStrength(pool, "actor:alice", "contact:01", "new", false, "2025-01-01T00:00:00.000Z");
    // contact:00 在生效计划的人脉需求上已建立联系。
    const repository = createPostgresPlanRepository({ pool: pool as never });
    const service = createPlanService({
      now: steppingClock(),
      references: createPostgresPlanReferenceValidator({ actorId: "actor:alice", client: pool as never, eventCore: { async getPublishedEvent() { return { eventId: "event:tokyo-saas-night" } as never; } }, workspaceId: WORKSPACE }),
      repository,
      scope: { actorId: "actor:alice", workspaceId: WORKSPACE },
    });
    const plan = await service.createVersion(planInput());
    const need = plan.items.find((item) => item.kind === "network_need")!;
    await service.updateItem({ change: { contactId: "contact:00", op: "link_contact" }, itemId: need.id });
    await service.updateItem({ change: { contactId: "contact:00", op: "establish_contact" }, itemId: need.id });
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: Array.from({ length: 25 }, (_, index) => `contact:${String(index).padStart(2, "0")}`), now: NOW, reason: "enrichment", workspaceId: WORKSPACE });
    const summary = await runPass(harness) as Record<string, number>;
    assert.equal(summary.batches, 2);
    assert.equal(harness.stub.requests.length, 2);
    const sizes = harness.stub.requests.map((body) => (JSON.parse((body.messages as { content: string }[])[1]!.content) as { contacts: unknown[] }).contacts.length).sort((a, b) => a - b);
    assert.deepEqual(sizes, [5, 20]);
    const raw = JSON.stringify(harness.stub.requests);
    assert.doesNotMatch(raw, /secret\d+@example\.com|\+81-90|私密 memo 正文/);
    assert.doesNotMatch(raw, /contact:\d\d/); // 真实 id 不出境（只用别名）
    const ops = await ledgerOps(pool);
    assert.equal(ops.length, 2);
    assert.ok(ops.every((op) => op.pool === "background" && op.purpose === "insight" && op.trigger === "auto" && op.status === "succeeded"));
    const calls = (await pool.query(`select operation_id, status, input_tokens, output_tokens from ai_usage_calls`)).rows;
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.status === "responded" && call.input_tokens === 100 && call.output_tokens === 50));
    const zero = await insightRow(pool, "actor:alice", "contact:00");
    assert.equal(zero?.status, "ready");
    assert.equal(zero?.dirty_at, null);
    assert.equal(zero?.ai_state, "done");
    assert.equal(zero?.lease_owner, null);
    assert.match(String((zero?.goal_relation as { zh: string }).zh), /日本渠道/);
    assert.match(String((zero?.goal_relation as { en: string }).en), /Japan/);
    // 依据：只留这位联系人自己的记录或需求（别人的记录别名与未知别名被丢弃）。
    const evidence = zero?.evidence as { source: string; id: string }[];
    assert.ok(evidence.length >= 1);
    assert.ok(evidence.every((entry) => entry.source === "plan_need" ? entry.id === need.id : entry.id.includes("abc123") || entry.id.startsWith("plan:")), JSON.stringify(evidence));
    // 规则相关度：已建立联系（61）+ 核心档（9）+ 最近 30 天（2）= 72；新认识且一年没往来 = 3。
    assert.equal(zero?.relevance, 72);
    assert.equal((await insightRow(pool, "actor:alice", "contact:01"))?.relevance, 3);
    assert.equal(zero?.goal_hash, contactInsightGoalHash(GOAL));
    const previews = await createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE }).readPreviews("actor:alice", ["contact:00", "contact:01"]);
    assert.equal(previews.size, 2);
    assert.match(previews.get("contact:00")!.zh, /日本渠道/);
    void seen;
  }, {
    // 发请求那一刻，这一批的行已经以 started + 租约提交（另一条连接能看到）。
    onRequest: async () => {
      const rows = (await poolRef!.query(`select ai_state, lease_owner from contact_insights where ai_state = 'started'`)).rows;
      seen.push(rows.map((row) => String(row.ai_state)));
      assert.ok(rows.length > 0 && rows.every((row) => row.lease_owner));
    },
  });
});

test("SC-02 background pool used up: the whole batch is deferred to the next Tokyo midnight, lease released, 0 calls; the view says 'updates tomorrow'", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client } = harness;
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    await fillPool(pool, "actor:alice", "background", 60);
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a", "contact:b"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    const summary = await runPass(harness) as Record<string, number>;
    assert.equal(summary.deferred, 1);
    assert.equal(harness.stub.requests.length, 0);
    const row = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal((row?.deferred_until as Date).toISOString(), nextTokyoMidnight(NOW));
    assert.equal(row?.ai_state, "none");
    assert.equal(row?.lease_owner, null);
    assert.ok(row?.dirty_at);
    assert.equal((await ledgerOps(pool)).filter((op) => op.purpose === "insight").length, 0);
    // 同一东京日内再跑：不领取（顺延未到）。
    assert.equal(((await runPass(harness)) as Record<string, number>).batches, 0);
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    const view = contactInsightView((await repository.readRows("actor:alice", ["contact:a"])).get("contact:a"), { contactId: "contact:a", goal: GOAL, now: NOW });
    assert.equal(view.state, "pending");
    assert.equal(view.deferredUntil, nextTokyoMidnight(NOW));
  });
});

test("SC-02 no relationship goal: rows become blocked_no_goal with 0 calls and 0 reservations", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client } = harness;
    harness.goals.set("actor:alice", "  ");
    await seedContact(pool, "contact:a", "actor:alice");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    const summary = await runPass(harness) as Record<string, number>;
    assert.equal(summary.noGoal, 1);
    assert.equal(harness.stub.requests.length, 0);
    assert.deepEqual(await ledgerOps(pool), []);
    const row = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal(row?.status, "blocked_no_goal");
    assert.equal(row?.dirty_at, null);
  });
});

test("SC-02 a run that dies mid-way is not re-called: the expired started rows are marked failed until the next change", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client } = harness;
    await seedContact(pool, "contact:a", "actor:alice");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    // 进程领取后崩溃（没有完成、没有结算）。
    const claimed = await repository.claimDirtyBatch({ leaseMs: CONTACT_INSIGHT_LEASE_MS, limit: 20, now: NOW, owner: "crashed-worker" });
    assert.equal(claimed?.rows.length, 1);
    // 租约内：另一个执行器领不到（CAS），0 次调用。
    assert.equal(((await runPass(harness)) as Record<string, number>).batches, 0);
    assert.equal(await repository.claimSingle({ actorId: "actor:alice", contactId: "contact:a", leaseMs: CONTACT_INSIGHT_LEASE_MS, now: NOW, owner: "other" }), null);
    harness.clock.now = new Date(NOW.getTime() + CONTACT_INSIGHT_LEASE_MS + 1000);
    const summary = await runPass(harness) as Record<string, number>;
    assert.equal(summary.interrupted, 1);
    assert.equal(summary.batches, 0);
    assert.equal(harness.stub.requests.length, 0);
    const row = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal(row?.status, "failed");
    assert.equal(row?.last_error_code, "INTERRUPTED");
    assert.equal(row?.dirty_at, null);
    // 下一次待更新才重新生成。
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: harness.clock.now, reason: "memo", workspaceId: WORKSPACE });
    await runPass(harness);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.status, "ready");
  });
});

test("SC-01 R-10: a tier change alone never makes the insight stale — re-marking with unchanged data costs 0 calls and keeps the text; goal changes only mark after a re-analysis", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client } = harness;
    await seedContact(pool, "contact:a", "actor:alice");
    await seedStrength(pool, "actor:alice", "contact:a", "active");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    await runPass(harness);
    assert.equal(harness.stub.requests.length, 1);
    const ready = await insightRow(pool, "actor:alice", "contact:a");
    // 档位从 active 衰减为 new（时间线不变）：不标待更新；即使被别的写入标了，版本不变 → 0 次调用、文字不变。
    await seedStrength(pool, "actor:alice", "contact:a", "new");
    assert.deepEqual(await dirtyIds(pool), []);
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "manual", workspaceId: WORKSPACE });
    const summary = await runPass(harness) as Record<string, number>;
    assert.equal(summary.unchanged, 1);
    assert.equal(harness.stub.requests.length, 1);
    const after = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal(after?.source_data_version, ready?.source_data_version);
    assert.deepEqual(after?.goal_relation, ready?.goal_relation);
    assert.equal(after?.dirty_at, null);
    // 改目标本身 0 次标记，只在读取时显示「目标已更新」；重新分析后统一标。
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    const row = (await repository.readRows("actor:alice", ["contact:a"])).get("contact:a");
    const view = contactInsightView(row, { contactId: "contact:a", goal: "新的目标：找投资人", now: NOW });
    assert.equal(view.goalUpdated, true);
    assert.equal(view.canRegenerate, true);
    assert.deepEqual(await dirtyIds(pool), []);
    assert.equal(await markContactInsightsGoalDirty(client, { actorId: "actor:alice", goal: GOAL, now: NOW, workspaceId: WORKSPACE }), 0);
    assert.equal(await markContactInsightsGoalDirty(client, { actorId: "actor:alice", goal: "新的目标：找投资人", now: NOW, workspaceId: WORKSPACE }), 1);
    assert.deepEqual((await insightRow(pool, "actor:alice", "contact:a"))?.dirty_reasons, ["goal"]);
  });
});

test("SC-04 R-11 single regenerate: two concurrent clicks → one CAS lease, one provider call, one user-pool operation; same version again → 0; background pool full does not block; user pool full → limited with 0 calls", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client, runtime } = harness;
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    await runPass(harness);
    assert.equal(harness.stub.requests.length, 1);
    // 资料变了（新 memo）→ 过期；后台池已用满也不影响手动重新生成。
    await seedMemo(pool, "actor:alice", "contact:a", "new-memo", "新的一条");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    await fillPool(pool, "actor:alice", "background", 60);
    const tasks: (() => Promise<void>)[] = [];
    const deps = { ...runtime, client, schedule: (task: () => Promise<void>) => { tasks.push(task); } };
    const outcomes = await Promise.all([
      requestContactInsightRegeneration(deps, { actorId: "actor:alice", contactId: "contact:a" }),
      requestContactInsightRegeneration(deps, { actorId: "actor:alice", contactId: "contact:a" }),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), ["in_progress", "scheduled"]);
    for (const task of tasks) await task();
    assert.equal(tasks.length, 1);
    assert.equal(harness.stub.requests.length, 2);
    const userOps = (await ledgerOps(pool)).filter((op) => op.pool === "user");
    assert.equal(userOps.length, 1);
    assert.equal(userOps[0]?.purpose, "insight");
    assert.equal(userOps[0]?.trigger, "manual");
    assert.equal(userOps[0]?.status, "succeeded");
    const row = await insightRow(pool, "actor:alice", "contact:a");
    assert.equal(row?.status, "ready");
    // 落败的那次点击在对方领取之后才标记（dirty_seq 前进）→ 行保留待更新；下一轮后台任务发现版本没变，0 次调用清掉。
    await runPass(harness);
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.dirty_at, null);
    assert.equal(harness.stub.requests.length, 2);
    // 同一版本再点：数据没变 → unchanged，0 次调用、不新增操作。
    assert.equal((await requestContactInsightRegeneration(deps, { actorId: "actor:alice", contactId: "contact:a" })).status, "unchanged");
    assert.equal(harness.stub.requests.length, 2);
    assert.equal((await ledgerOps(pool)).filter((op) => op.pool === "user").length, 1);
    // 别人的联系人：not_found，不标、不调用。
    assert.equal((await requestContactInsightRegeneration(deps, { actorId: "actor:bob", contactId: "contact:b" })).status, "not_found");
    // 用户主动池当日 10 次用满：limited，0 次调用，租约释放、待更新保留。
    await fillPool(pool, "actor:alice", "user", 9);
    await seedMemo(pool, "actor:alice", "contact:b", "b-memo", "b 的 memo");
    const limited = await requestContactInsightRegeneration(deps, { actorId: "actor:alice", contactId: "contact:b" });
    assert.equal(limited.status, "limited");
    assert.equal(harness.stub.requests.length, 2);
    const b = await insightRow(pool, "actor:alice", "contact:b");
    assert.equal(b?.lease_owner, null);
    assert.notEqual(b?.ai_state, "started");
    assert.ok(b?.dirty_at);
    const detail = await readContactInsightDetail({ actorId: "actor:alice", contactId: "contact:a", now: NOW }, {
      readGoal: async () => "新的目标",
      readRows: (actorId, ids) => createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE }).readRows(actorId, ids),
      readUserPoolUsed: async (actorId, now) => (await createPostgresAiUsageLedger({ client, workspaceId: WORKSPACE }).readUsageToday(actorId, now)).user,
    });
    assert.equal(detail.quotaExhausted, true);
  });
});

test("SC-03 insights tab page: server-side 30 per page, sort by relevance / tier / recent, filter by industry / region / tier (tier read live from W0047)", databaseTest, async () => {
  await withDatabase(async ({ pool, client }) => {
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    for (let index = 0; index < 33; index += 1) {
      const id = `contact:${String(index).padStart(2, "0")}`;
      await seedContact(pool, id, "actor:alice", index < 3
        ? { primaryIndustryId: "technology_internet", region: { city: "Tokyo", countryCode: "JP" } }
        : { primaryIndustryId: "finance_investment", region: { countryCode: "SG" } });
      await pool.query(
        `insert into contact_insights (workspace_id, actor_id, contact_id, status, relevance, goal_relation, next_step, goal_hash)
         values ($1, 'actor:alice', $2, 'ready', $3, '{"zh":"关系","en":"Relation"}', '{"zh":"下一步","en":"Next"}', $4)`,
        [WORKSPACE, id, index, contactInsightGoalHash(GOAL)],
      );
    }
    await seedStrength(pool, "actor:alice", "contact:00", "core", false, "2026-10-01T00:00:00.000Z");
    await seedStrength(pool, "actor:alice", "contact:01", "active", false, "2026-10-02T00:00:00.000Z");
    await seedStrength(pool, "actor:alice", "contact:02", "core", true, "2026-06-01T00:00:00.000Z");
    // 他人的洞察行不出现。
    await seedContact(pool, "contact:bob-1", "actor:bob");
    await pool.query(`insert into contact_insights (workspace_id, actor_id, contact_id, status, relevance) values ($1, 'actor:bob', 'contact:bob-1', 'ready', 100)`, [WORKSPACE]);
    const read = (query: Partial<Parameters<typeof readContactInsightsTabPage>[2]>) =>
      readContactInsightsTabPage({ client, workspaceId: WORKSPACE }, "actor:alice", { country: null, industry: null, page: 1, sort: "relevance", tier: null, ...query });
    const first = await read({});
    assert.equal(first.total, 33);
    assert.equal(first.entries.length, 30);
    assert.equal(first.hasNext, true);
    assert.equal(first.entries[0]?.row.contactId, "contact:32");
    assert.ok(!first.entries.some((entry) => entry.row.contactId === "contact:bob-1"));
    const second = await read({ page: 2 });
    assert.equal(second.entries.length, 3);
    assert.equal(second.hasNext, false);
    assert.deepEqual((await read({ sort: "tier" })).entries.slice(0, 3).map((entry) => [entry.row.contactId, entry.tier]), [["contact:00", "core"], ["contact:01", "active"], ["contact:02", "dormant"]]);
    assert.deepEqual((await read({ sort: "recent" })).entries.slice(0, 3).map((entry) => entry.row.contactId), ["contact:01", "contact:00", "contact:02"]);
    assert.equal((await read({ industry: "technology_internet" })).total, 3);
    assert.equal((await read({ country: "SG" })).total, 30);
    assert.deepEqual((await read({ tier: "dormant" })).entries.map((entry) => entry.row.contactId), ["contact:02"]);
    assert.equal((await read({ tier: "core", country: "JP" })).total, 1);
    assert.ok(repository);
  });
});

test("SC-04 regenerate route: concurrent POSTs → 202 + 202(inProgress), provider called once; 429 USER_DAILY_LIMIT with 0 calls; 404 foreign; 409 no goal; 403 demo", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client, runtime } = harness;
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    await seedContact(pool, "contact:bob-1", "actor:bob");
    const tasks: (() => Promise<void>)[] = [];
    const handler = (actorId: string, demo = false) => createContactInsightRegenerateHandler({
      deps: () => ({ ...runtime, client }),
      isDemo: async () => demo,
      resolveActor: async () => ({ id: actorId }) as never,
      schedule: (task) => { tasks.push(task); },
    });
    const post = (actorId: string, contactId: string, demo = false) =>
      handler(actorId, demo)(new Request(`https://orbit.test/api/contacts/${encodeURIComponent(contactId)}/insight/regenerate`, { method: "POST" }), { params: Promise.resolve({ id: encodeURIComponent(contactId) }) });
    const responses = await Promise.all([post("actor:alice", "contact:a"), post("actor:alice", "contact:a")]);
    assert.deepEqual(responses.map((response) => response.status), [202, 202]);
    const bodies = await Promise.all(responses.map(async (response) => (await response.json() as { data: { inProgress: boolean } }).data.inProgress));
    assert.deepEqual(bodies.sort(), [false, true]);
    for (const task of tasks.splice(0)) await task();
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.status, "ready");
    assert.equal((await post("actor:alice", "contact:bob-1")).status, 404);
    assert.equal((await post("actor:alice", "contact:b", true)).status, 403);
    await fillPool(pool, "actor:alice", "user", 9);
    const limited = await post("actor:alice", "contact:b");
    assert.equal(limited.status, 429);
    assert.equal((await limited.json() as { error: { context?: { reason?: string } } }).error.context?.reason ?? "", "USER_DAILY_LIMIT");
    assert.equal(harness.stub.requests.length, 1);
    harness.goals.set("actor:bob", null);
    assert.equal((await post("actor:bob", "contact:bob-1")).status, 409);
    assert.equal(tasks.length, 0);
  });
});

/* ── 第二段（Codex review 裁决）：故障注入 ─────────────────────────────── */

test("review P2 fence: a re-mark that lands in the same millisecond as the claim survives completion and failure (dirty_seq fence, not timestamps)", databaseTest, async () => {
  await withDatabase(async ({ pool, client }) => {
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a", "contact:b"], now: NOW, reason: "memo", workspaceId: WORKSPACE });
    const repository = createPostgresContactInsightRepository({ client, workspaceId: WORKSPACE });
    const batch = await repository.claimDirtyBatch({ leaseMs: CONTACT_INSIGHT_LEASE_MS, limit: 20, now: NOW, owner: "w1" });
    assert.equal(batch?.rows.length, 2);
    // 生成期间同一毫秒又写了 memo。
    await markContactInsightsDirty(client, { actorId: "actor:alice", contactIds: ["contact:a", "contact:b"], now: NOW, reason: "plan_link", workspaceId: WORKSPACE });
    const text = { en: "x", zh: "x" };
    await repository.complete({ actorId: "actor:alice", claimedAt: batch!.claimedAt, goalHash: "g", model: "m", now: NOW, owner: "w1", results: [{ contactId: "contact:a", evidence: [], goalRelation: text, nextStep: text, relevance: 1, sourceDataVersion: "v" }], usage: null });
    await repository.fail({ actorId: "actor:alice", claimedAt: batch!.claimedAt, code: "INVALID_OUTPUT", contactIds: ["contact:b"], now: NOW, owner: "w1" });
    assert.deepEqual(await dirtyIds(pool), ["contact:a", "contact:b"], "both re-marks are kept");
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.status, "ready");
    // 没有再次标记的领取，完成后清除。
    const again = await repository.claimDirtyBatch({ leaseMs: CONTACT_INSIGHT_LEASE_MS, limit: 20, now: NOW, owner: "w2" });
    await repository.markUnchanged({ actorId: "actor:alice", claimedAt: again!.claimedAt, contactIds: ["contact:a", "contact:b"], now: NOW, owner: "w2" });
    assert.deepEqual(await dirtyIds(pool), []);
  });
});

test("review fault injection: the same version failing twice returns RETRY_EXHAUSTED with no third provider call", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool, client, runtime } = harness;
    await seedContact(pool, "contact:a", "actor:alice");
    const tasks: (() => Promise<void>)[] = [];
    const deps = { ...runtime, client, schedule: (task: () => Promise<void>) => { tasks.push(task); } };
    const click = async () => {
      const outcome = await requestContactInsightRegeneration(deps, { actorId: "actor:alice", contactId: "contact:a" });
      for (const task of tasks.splice(0)) await task();
      return outcome.status;
    };
    assert.equal(await click(), "scheduled");
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.status, "failed");
    assert.equal(await click(), "scheduled");
    assert.equal(harness.stub.requests.length, 2);
    assert.equal(await click(), "retry_exhausted");
    assert.equal(harness.stub.requests.length, 2, "0 extra calls");
    const userOps = (await ledgerOps(pool)).filter((op) => op.pool === "user");
    assert.equal(userOps.length, 2);
    // 租约已释放（下一次资料变化后可以再生成）。
    assert.equal((await insightRow(pool, "actor:alice", "contact:a"))?.lease_owner, null);
  }, { fail: true });
});

test("review fault injection: when marking fails inside the plan transaction the savepoint rolls back only the mark — the user's link is kept", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    for (const id of ["contact:a", "contact:b"]) await seedContact(pool, id, "actor:alice");
    // 注入故障：contact:a 的洞察行写不进去。
    await pool.query(`alter table contact_insights add constraint w0051_fault_injection check (contact_id <> 'contact:a')`);
    const service = createPlanService({
      now: steppingClock(),
      references: createPostgresPlanReferenceValidator({ actorId: "actor:alice", client: pool as never, eventCore: { async getPublishedEvent(id: string) { return { eventId: id } as never; } }, workspaceId: WORKSPACE }),
      repository: createPostgresPlanRepository({ pool: pool as never }),
      scope: { actorId: "actor:alice", workspaceId: WORKSPACE },
    });
    const plan = await service.createVersion(planInput());
    const need = plan.items.find((item) => item.kind === "network_need")!;
    const linked = await service.updateItem({ change: { contactId: "contact:a", op: "link_contact" }, itemId: need.id });
    assert.deepEqual(linked.item.contactLinks.map((link) => link.contactId), ["contact:a"]);
    const stored = (await pool.query(`select contact_links from plan_items where id = $1`, [need.id])).rows[0]!.contact_links as { contactId: string }[];
    assert.deepEqual(stored.map((link) => link.contactId), ["contact:a"], "the plan write committed");
    assert.equal(await insightRow(pool, "actor:alice", "contact:a"), undefined);
    // 同一事务之后的写入照常（事务没有进入失败状态）；其他联系人照常标记。
    await service.updateItem({ change: { contactId: "contact:b", op: "link_contact" }, itemId: need.id });
    assert.deepEqual(await dirtyIds(pool), ["contact:b"]);
  });
});

test("review P3: an out-of-range insights tab page still reports the real total", databaseTest, async () => {
  await withDatabase(async ({ pool, client }) => {
    for (let index = 0; index < 3; index += 1) {
      const id = `contact:${index}`;
      await seedContact(pool, id, "actor:alice");
      await pool.query(`insert into contact_insights (workspace_id, actor_id, contact_id, status, relevance) values ($1, 'actor:alice', $2, 'ready', $3)`, [WORKSPACE, id, index]);
    }
    const page = await readContactInsightsTabPage({ client, workspaceId: WORKSPACE }, "actor:alice", { country: null, industry: null, page: 5, sort: "relevance", tier: null });
    assert.deepEqual([page.entries.length, page.total, page.hasNext], [0, 3, false]);
    const empty = await readContactInsightsTabPage({ client, workspaceId: WORKSPACE }, "actor:bob", { country: null, industry: null, page: 1, sort: "relevance", tier: null });
    assert.deepEqual([empty.entries.length, empty.total], [0, 0]);
  });
});
