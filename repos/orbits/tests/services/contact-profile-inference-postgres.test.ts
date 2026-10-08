/**
 * W0058（真实 PostgreSQL）：名片推测与洞察同一调用产出并写回联系人——
 * SC-W0058-01（有目标：一批 1 次 HTTP，洞察与三栏推测同时落库；无目标 0 次调用、无推测）、
 * SC-W0058-02（写入路径优先级：memo／用户清空／存量不覆盖，旧推测被替换，memo 可替换推测；语言与双语原文）、
 * SC-W0058-04（写回冲突 → 行保持 pending → 维护任务从存的推测重放、provider 不再调用；到上限 skipped；
 *              写回推测后再次领取判为未变化 0 次调用；升提示词版本不让存量 ready 行过期或被领取）。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库（地址不是本机回环直接失败），每个用例在随机 schema 里建表、用完即删。
 * 供应商一律是 fetch 桩（不出网，计数 HTTP 次数）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createDeepseekContactInsightGenerator } from "../../features/contacts/insights/generator";
import { runInstantInsightGeneration, type InstantInsightDeps } from "../../features/contacts/insights/instant";
import { createContactInsightsMaintenanceTask } from "../../features/contacts/insights/maintenance-task";
import { runContactInsightsMigrations } from "../../features/contacts/insights/migrations";
import { contactInsightGoalHash, markContactInsightsDirty } from "../../features/contacts/insights/repository";
import { createContactInsightsRuntime, type ContactInsightsRuntime } from "../../features/contacts/insights/runtime";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runPlanMigrations } from "../../features/plans/migrations";
import { AppError } from "../../shared/errors/app-error";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 120_000 };
const WORKSPACE = "workspace:contact-profile-inference";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NOW = new Date("2026-10-03T03:00:00.000Z");
const GOAL = "三个月内找到日本市场的渠道伙伴";
const ALICE = "actor:alice";
const BOB = "actor:bob";

interface Stub {
  fetchImplementation: typeof fetch;
  requests: { contacts: Record<string, unknown>[] }[];
}

/** 按请求里的名片字段给每人一组推测：职位 → offering，备注 → topics，公司 → seeking；外加一条套话（应被丢弃）。 */
function providerStub(): Stub {
  const stub: Stub = { fetchImplementation: undefined as never, requests: [] };
  stub.fetchImplementation = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content) as { contacts: Record<string, unknown>[] };
    stub.requests.push({ contacts: user.contacts });
    const insights = user.contacts.map((contact) => ({
      contactId: contact.id,
      evidence: [],
      goalRelation: { en: `${String(contact.name)} can open channel doors.`, zh: `${String(contact.name)} 能帮你打开渠道。` },
      nextStep: { en: `Invite ${String(contact.name)} for coffee.`, zh: `约 ${String(contact.name)} 喝咖啡。` },
      profile: {
        offering: [
          ...(contact.title ? [{ basis: "title", text: { en: "Japan channel building", zh: "日本渠道开拓" } }] : []),
          { basis: "company", text: { en: "Networking", zh: "人脉资源" } },
        ],
        seeking: contact.company ? [{ basis: "company", text: { en: "Overseas distributors", zh: "海外经销商" } }] : [],
        topics: contact.cardNotes ? [{ basis: "card_notes", text: { en: "Cold-chain logistics", zh: "冷链物流" } }] : [],
      },
    }));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ insights }) } }], usage: { completion_tokens: 80, prompt_tokens: 120 } }), { status: 200 });
  }) as typeof fetch;
  return stub;
}

interface Harness {
  pool: Pool;
  client: TransactionalPostgresClient;
  goals: Map<string, string | null>;
  stub: Stub;
  runtime: ContactInsightsRuntime;
  instant(actorId: string, contactIds?: string[], overrides?: Partial<InstantInsightDeps>): ReturnType<typeof runInstantInsightGeneration>;
}

async function seedContact(pool: Pool, id: string, actor: string, extra: Record<string, unknown> = {}): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'profile-test', 'active', $4::jsonb, $5, $5)`,
    [WORKSPACE, id, actor, JSON.stringify({
      accountId: actor, createdAt: "2026-09-01T00:00:00.000Z", displayName: `Person ${id.replace("contact:", "")}`, evidenceIds: ["e"], id,
      source: { id: "profile-test", type: "manual" }, stage: "active", updatedAt: "2026-09-01T00:00:00.000Z", ...extra,
    }), NOW],
  );
}

async function contactPayload(pool: Pool, id: string): Promise<Record<string, any>> {
  return (await pool.query(`select payload from orbit_records where workspace_id = $1 and collection_name = 'contacts' and record_id = $2`, [WORKSPACE, id])).rows[0]!.payload;
}

async function row(pool: Pool, actor: string, contactId: string) {
  return (await pool.query(`select * from contact_insights where workspace_id = $1 and actor_id = $2 and contact_id = $3`, [WORKSPACE, actor, contactId])).rows[0] as Record<string, any> | undefined;
}

async function withDatabase(run: (harness: Harness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
  const schema = `profile_inference_${randomUUID().replaceAll("-", "")}`;
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
    const goals = new Map<string, string | null>([[ALICE, GOAL], [BOB, null]]);
    const stub = providerStub();
    const generator = createDeepseekContactInsightGenerator({ apiKey: "test-key", fetchImplementation: stub.fetchImplementation });
    const runtime = createContactInsightsRuntime({ client, generator, now: () => NOW, readGoal: async (actorId) => goals.get(actorId) ?? null, workspaceId: WORKSPACE });
    const harness: Harness = {
      client, goals, pool, runtime, stub,
      instant: (actorId, contactIds = [], overrides = {}) =>
        runInstantInsightGeneration({ ...runtime, bootstrapHeartbeat: async () => undefined, log: () => undefined, ...overrides }, { actorId, coalesceMs: 0, contactIds }),
    };
    await run(harness);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

const mark = (harness: Harness, actor: string, ids: string[]) =>
  markContactInsightsDirty(harness.client, { actorId: actor, contactIds: ids, now: NOW, reason: "enrichment", workspaceId: WORKSPACE });

function maintenancePass(harness: Harness, overrides: Partial<ContactInsightsRuntime> = {}) {
  return createContactInsightsMaintenanceTask({ resolve: () => ({ ...harness.runtime, log: () => undefined, ...overrides }) })
    .run({ deadline: Date.now() + 60_000, now: () => NOW } as never) as Promise<Record<string, number>>;
}

test("SC-01 one batch, one call: confirming 3 cards writes 3 insights and their inferred profile lists (card_inference, goal language, bilingual); no goal → 0 calls, no inference", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool } = harness;
    await seedContact(pool, "contact:a", ALICE, { notes: "海外事業部 tanaka@acme.co.jp 03-1234-5678 冷链专线", organization: "Acme Logistics", role: "Sales Director" });
    await seedContact(pool, "contact:b", ALICE, { organization: "Beta Foods", role: "Buyer" });
    await seedContact(pool, "contact:c", ALICE, { organization: "Gamma" });
    await seedContact(pool, "contact:z", BOB, { organization: "Zeta", role: "CEO" });
    await mark(harness, ALICE, ["contact:a", "contact:b", "contact:c"]);
    const summary = await harness.instant(ALICE, ["contact:a", "contact:b", "contact:c"]);
    assert.equal(summary.callsResponded, 1);
    assert.equal(harness.stub.requests.length, 1, "insights and profile come from the same single HTTP");
    assert.equal(harness.stub.requests[0]!.contacts.length, 3);
    assert.doesNotMatch(JSON.stringify(harness.stub.requests), /tanaka@acme|03-1234-5678/);
    for (const id of ["contact:a", "contact:b", "contact:c"]) {
      const insight = await row(pool, ALICE, id);
      assert.equal(insight?.status, "ready", id);
      assert.equal(insight?.profile_apply_state, "applied", id);
    }
    const a = await contactPayload(pool, "contact:a");
    assert.deepEqual(a.publicProfile.offering, ["日本渠道开拓"], "boilerplate dropped, Chinese goal → zh value");
    assert.deepEqual(a.publicProfile.seeking, ["海外经销商"]);
    assert.deepEqual(a.publicProfile.topics, ["冷链物流"]);
    assert.equal(a.enrichment.fields.offering.via, "card_inference");
    assert.equal(a.enrichment.fields.offering.origin, "ai");
    assert.deepEqual(a.enrichment.fields.offering.bilingual, { en: ["Japan channel building"], zh: ["日本渠道开拓"] });
    const c = await contactPayload(pool, "contact:c");
    assert.equal(c.publicProfile?.offering, undefined, "no title → no offering");
    assert.deepEqual(c.publicProfile.seeking, ["海外经销商"]);
    // 没有目标：0 次调用，没有推测。
    await mark(harness, BOB, ["contact:z"]);
    const bob = await harness.instant(BOB, ["contact:z"]);
    assert.equal(bob.noGoal, 1);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await row(pool, BOB, "contact:z"))?.status, "blocked_no_goal");
    assert.equal((await contactPayload(pool, "contact:z")).publicProfile, undefined);
    // 写回推测后再次领取：版本未变 → 0 次调用（推测不进输入版本）。
    await mark(harness, ALICE, ["contact:a", "contact:b", "contact:c"]);
    const again = await harness.instant(ALICE, ["contact:a"]);
    assert.equal(again.callsResponded, 0);
    assert.equal(harness.stub.requests.length, 1);
    assert.equal((await row(pool, ALICE, "contact:a"))?.dirty_at, null);
  });
});

test("SC-02 write priority on real rows: memo values, user-cleared fields and legacy values are kept; an older inference is replaced; memo extraction then replaces the inference; English goal writes English", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool } = harness;
    harness.goals.set(ALICE, "Find channel partners in Japan");
    const p = (origin: string, via: string) => ({ origin, updatedAt: "2026-09-20T00:00:00.000Z", via });
    await seedContact(pool, "contact:memo", ALICE, { enrichment: { fields: { offering: p("ai", "memo_extraction") }, version: 1 }, organization: "M", publicProfile: { offering: ["报关代理"] }, role: "Broker" });
    await seedContact(pool, "contact:cleared", ALICE, { enrichment: { fields: { offering: p("user", "contact_edit") }, version: 1 }, organization: "U", publicProfile: { offering: [] }, role: "Owner" });
    await seedContact(pool, "contact:legacy", ALICE, { organization: "L", publicProfile: { offering: ["老数据"] }, role: "Manager" });
    await seedContact(pool, "contact:old", ALICE, { enrichment: { fields: { offering: p("ai", "card_inference") }, version: 1 }, organization: "O", publicProfile: { offering: ["Old guess"] }, role: "Partner" });
    // review P2：这次没推出的栏，旧的 card_inference 值被清掉（memo 值不动）。
    await seedContact(pool, "contact:stale", ALICE, {
      enrichment: { fields: { topics: p("ai", "card_inference") }, version: 1 }, organization: "S", publicProfile: { topics: ["Old topic"] }, role: "Partner",
    });
    const ids = ["contact:memo", "contact:cleared", "contact:legacy", "contact:old", "contact:stale"];
    await mark(harness, ALICE, ids);
    await harness.instant(ALICE, ids);
    assert.equal(harness.stub.requests.length, 1);
    assert.deepEqual((await contactPayload(pool, "contact:memo")).publicProfile.offering, ["报关代理"]);
    assert.equal((await contactPayload(pool, "contact:memo")).enrichment.fields.offering.via, "memo_extraction");
    assert.deepEqual((await contactPayload(pool, "contact:memo")).publicProfile.seeking, ["Overseas distributors"], "empty seeking still filled, in English");
    assert.deepEqual((await contactPayload(pool, "contact:cleared")).publicProfile.offering, []);
    assert.equal((await contactPayload(pool, "contact:cleared")).enrichment.fields.offering.origin, "user");
    assert.deepEqual((await contactPayload(pool, "contact:legacy")).publicProfile.offering, ["老数据"]);
    const old = await contactPayload(pool, "contact:old");
    assert.deepEqual(old.publicProfile.offering, ["Japan channel building"]);
    assert.deepEqual(old.enrichment.fields.offering.bilingual, { en: ["Japan channel building"], zh: ["日本渠道开拓"] });
    const stale = await contactPayload(pool, "contact:stale");
    assert.equal(stale.publicProfile.topics, undefined, "stale inferred topics cleared");
    assert.equal(stale.enrichment.fields.topics, undefined);
    assert.equal(stale.enrichment.fields.offering.via, "card_inference");
    assert.equal((await contactPayload(pool, "contact:memo")).publicProfile.topics, undefined);
    // memo 提取可以替换推测。
    const contacts = createStorageContactGraphProvider({ store: createPostgresLiveRecordStore({ client: harness.client }), workspaceId: WORKSPACE });
    const written = await contacts.applyContactMemoExtraction!("contact:old", ALICE, [{ field: "offering", origin: "ai", value: ["报关代理"], via: "memo_extraction" }], "2026-10-03T04:00:00.000Z");
    assert.deepEqual(written, ["offering"]);
    const replaced = await contactPayload(pool, "contact:old");
    assert.deepEqual(replaced.publicProfile.offering, ["报关代理"]);
    assert.equal(replaced.enrichment.fields.offering.via, "memo_extraction");
    assert.equal(replaced.enrichment.fields.offering.bilingual, undefined);
  });
});

test("SC-04 write-back conflict: the insight stays ready, the row keeps profile_apply_state=pending, maintenance replays the stored inference with 0 provider calls; repeated failures end as skipped", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool } = harness;
    await seedContact(pool, "contact:a", ALICE, { organization: "Acme", role: "Sales Director" });
    await seedContact(pool, "contact:b", ALICE, { organization: "Beta", role: "Buyer" });
    await mark(harness, ALICE, ["contact:a", "contact:b"]);
    const conflict = async () => { throw new AppError("CONFLICT", "Contact changed while applying card inference."); };
    await harness.instant(ALICE, ["contact:a", "contact:b"], { applyProfileInference: conflict });
    assert.equal(harness.stub.requests.length, 1);
    const pending = await row(pool, ALICE, "contact:a");
    assert.equal(pending?.status, "ready");
    assert.equal(pending?.profile_apply_state, "pending");
    assert.equal(pending?.profile_apply_attempts, 1);
    assert.equal(pending?.profile_inference.language, "zh");
    assert.equal((await contactPayload(pool, "contact:a")).publicProfile, undefined);
    // contact:b 的写回一直失败：第 2、3 次后 skipped。
    const flaky = async (input: { actorId: string; contactId: string; values: readonly never[]; at: string }) => {
      if (input.contactId === "contact:b") return conflict();
      return harness.runtime.applyProfileInference!(input);
    };
    const first = await maintenancePass(harness, { applyProfileInference: flaky as never });
    assert.equal(first.callsResponded, 0);
    assert.equal(harness.stub.requests.length, 1, "replay never calls the provider");
    assert.equal((await row(pool, ALICE, "contact:a"))?.profile_apply_state, "applied");
    assert.deepEqual((await contactPayload(pool, "contact:a")).publicProfile.offering, ["日本渠道开拓"]);
    assert.equal((await row(pool, ALICE, "contact:b"))?.profile_apply_state, "pending");
    assert.equal((await row(pool, ALICE, "contact:b"))?.profile_apply_attempts, 2);
    await maintenancePass(harness, { applyProfileInference: flaky as never });
    assert.equal((await row(pool, ALICE, "contact:b"))?.profile_apply_state, "skipped");
    await maintenancePass(harness);
    assert.equal((await row(pool, ALICE, "contact:b"))?.profile_apply_state, "skipped", "skipped rows are not replayed");
    assert.equal(harness.stub.requests.length, 1);
  });
});

test("SC-04 prompt version bump: an existing ready row built with contact-insight@1 is neither stale nor claimed — maintenance makes 0 calls", databaseTest, async () => {
  await withDatabase(async (harness) => {
    const { pool } = harness;
    await seedContact(pool, "contact:a", ALICE, { organization: "Acme", role: "Sales Director" });
    await pool.query(
      `insert into contact_insights (workspace_id, actor_id, contact_id, status, goal_relation, next_step, evidence, relevance, source_data_version, goal_hash, ai_state, generated_at, model)
       values ($1, $2, 'contact:a', 'ready', '{"zh":"甲","en":"a"}', '{"zh":"乙","en":"b"}', '[]', 10, 'version-from-contact-insight@1', $3, 'done', $4, 'm')`,
      [WORKSPACE, ALICE, contactInsightGoalHash(GOAL), NOW.toISOString()],
    );
    const pass = await maintenancePass(harness);
    assert.equal(pass.batches, 0);
    assert.equal(harness.stub.requests.length, 0);
    const kept = await row(pool, ALICE, "contact:a");
    assert.equal(kept?.source_data_version, "version-from-contact-insight@1");
    assert.equal(kept?.dirty_at, null);
    assert.equal(kept?.profile_apply_state, null);
  });
});
