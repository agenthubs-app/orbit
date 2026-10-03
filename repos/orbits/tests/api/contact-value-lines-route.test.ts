/**
 * W0061 SC-04／SC-05：「TA 能帮你」一句话的两条读取接口。
 *   - `GET /api/contacts/value-lines`（首页、候选卡重取）：鉴权、ids ≤20、语言、读失败 503；
 *   - 真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 本机测试库，随机 schema）：只返回本人联系人（他人 id 静默丢弃）、
 *     依据解析（名片扫描「名片」、手工「录入」、memo 东京日期、计划需求标题）、状态退化、`contact_insights` 0 写入、
 *     0 次供应商 HTTP；
 *   - 候选接口（GET 与 run）给每个候选附可选 `value`（按语言），读失败照常返回；
 *   - D39 口径实测：value-lines 6 个 id 的响应与数据库读取字节、候选接口 20 个候选的增量字节（各 ≤4 KB），输出
 *     `[W0061-measure]` 行供 REPORT 预算表引用。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createContactValueLinesHandler, parseValueLineIds } from "../../app/api/contacts/value-lines/handler";
import { createPlanCandidateRouteHandlers } from "../../app/api/agent/plans/candidates/route-handlers";
import { runContactInsightsMigrations } from "../../features/contacts/insights/migrations";
import { readContactValueInsightLines, readContactValueInsights, readContactValueLines, type ValueLineDeps } from "../../features/contacts/insights/value-lines";
import type { PlanMatchCandidatesView, PlanMatchCandidateView, PlanMatchingService } from "../../features/plans/matching-service";
import { runPlanMigrations } from "../../features/plans/migrations";
import { success } from "../../shared/api/envelope";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 60_000 };
const WORKSPACE = "workspace:value-lines";
const ALICE = "actor:alice";
const BOB = "actor:bob";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const BYTES_LIMIT = 4096;

/* ── 处理器（无数据库） ─────────────────────────────────────────────── */

const actor = (id: string | null) => async () => (id ? ({ id } as never) : null);

test("SC-W0061-04: value-lines requires a session, caps ids at 20, maps lang and turns read failures into 503", async () => {
  const seen: { contactIds: readonly string[]; language: string }[] = [];
  const readLines = async (input: { actorId: string; contactIds: readonly string[]; language: "zh" | "en" }) => {
    seen.push(input);
    return [];
  };
  const anonymous = await createContactValueLinesHandler({ readLines, resolveActor: actor(null) })(new Request("https://orbit.test/api/contacts/value-lines?ids=a"));
  assert.equal(anonymous.status, 401);
  const tooMany = Array.from({ length: 21 }, (_, index) => `c${index}`).join(",");
  const rejected = await createContactValueLinesHandler({ readLines, resolveActor: actor(ALICE) })(new Request(`https://orbit.test/api/contacts/value-lines?ids=${tooMany}`));
  assert.equal(rejected.status, 400);
  const empty = await createContactValueLinesHandler({ readLines, resolveActor: actor(ALICE) })(new Request("https://orbit.test/api/contacts/value-lines?ids="));
  assert.deepEqual(await empty.json(), success({ lines: [] }));
  await createContactValueLinesHandler({ readLines, resolveActor: actor(ALICE) })(new Request("https://orbit.test/api/contacts/value-lines?ids=a,b,a&lang=zh"));
  await createContactValueLinesHandler({ readLines, resolveActor: actor(ALICE) })(new Request("https://orbit.test/api/contacts/value-lines?ids=a&lang=ja"));
  assert.deepEqual(seen, [{ actorId: ALICE, contactIds: ["a", "b"], language: "zh" }, { actorId: ALICE, contactIds: ["a"], language: "en" }]);
  const broken = await createContactValueLinesHandler({ readLines: async () => { throw new Error("db down"); }, resolveActor: actor(ALICE) })(new Request("https://orbit.test/api/contacts/value-lines?ids=a"));
  assert.equal(broken.status, 503);
  assert.deepEqual(parseValueLineIds(" a , ,b"), ["a", "b"]);
});

/* ── 真实 PostgreSQL ─────────────────────────────────────────────────── */

/**
 * 代表性长度＝本机真实洞察的平均值（2026-10-03 本机 24 条 ready：`goal_relation` 中文 40 字、英文 115 字，
 * `next_step` 中文 29 字；依据平均 1 条、83 B）。
 */
const ZH_RELATION = "惠子投早期企业软件项目，手上有十几家被投公司，能引荐其中做日本渠道的创始人。".padEnd(40, "。");
const EN_RELATION = "Keiko invests in early B2B SaaS and can introduce you to portfolio founders who run channel sales in Japan.".padEnd(115, ".");
const ZH_NEXT = "下周约她喝咖啡，请她引荐一家做日本渠道的被投公司。".padEnd(29, "。");
const EN_NEXT = "Ask her over coffee next week for one portfolio intro.";

/**
 * 数据库读取字节（近似 PostgreSQL 线上 DataRow 负载）：每个字段 4 B 长度 + 文本值字节（jsonb 按文本、null 只算长度）。
 * 列名只在 RowDescription 里出现一次，不按行重复计。
 */
function rowBytes(rows: readonly Record<string, unknown>[]): number {
  let total = 0;
  for (const row of rows) {
    for (const value of Object.values(row)) {
      total += 4;
      if (value === null || value === undefined) continue;
      const text = typeof value === "string" ? value : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
      total += Buffer.byteLength(text);
    }
  }
  return total;
}

interface Harness {
  pool: Pool;
  deps: ValueLineDeps & { bytes: () => number; reset: () => void };
}

async function withDatabase(run: (harness: Harness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
  const schema = `value_lines_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runPlanMigrations(pool);
    await runContactInsightsMigrations(pool);
    let bytes = 0;
    const deps = {
      bytes: () => bytes,
      client: {
        async query<TRow>(text: string, values?: readonly unknown[]) {
          assert.match(text.trim(), /^(\/\*[^*]*\*\/\s*)?(select|with)\b/i, "value lines only ever run read statements");
          assert.doesNotMatch(text, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i, "value lines never write");
          const result = await pool.query(text, values as unknown[]);
          bytes += rowBytes(result.rows);
          return { rows: result.rows as TRow[] };
        },
      },
      reset: () => {
        bytes = 0;
      },
      workspaceId: WORKSPACE,
    };
    await run({ deps, pool });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

async function seedContact(pool: Pool, id: string, owner: string, sourceType: string, extra: Record<string, unknown> = {}) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'value-lines-test', 'active', $4::jsonb, now(), now())`,
    [WORKSPACE, id, owner, JSON.stringify({ createdAt: "2026-09-01T00:00:00.000Z", displayName: `田中 ${id}`, id, organization: "Nexa Capital", role: "合伙人", source: { type: sourceType }, ...extra })],
  );
}

async function seedMemo(pool: Pool, owner: string, contactId: string, noteHash: string, occurredAt: string | null) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
     values ($1, 'contact_detail_states', $2, $3, 'manual', 'value-lines-test', 'active', $4::jsonb, now(), now())`,
    [WORKSPACE, `contact-detail:${encodeURIComponent(owner)}:${encodeURIComponent(contactId)}`, owner, JSON.stringify({
      actorId: owner, contactId, notes: [{ body: "聊了引荐", createdAt: "2026-09-29T16:30:00.000Z", kind: "memo", noteId: `note:live-contact-detail-update:${noteHash}`, ...(occurredAt ? { occurredAt } : {}) }],
    })],
  );
}

async function seedNeed(pool: Pool, owner: string, needId: string, title: string) {
  await pool.query(
    `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on) values ($1, $2, $3, 1, 'active', 'g', 'quarter', '2026-09-14')
     on conflict do nothing`,
    [WORKSPACE, `plan:${owner}`, owner],
  );
  await pool.query(
    `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key) values ($1, $2, $3, $4, 'network_need', $5, 'open', 1)`,
    [WORKSPACE, needId, owner, `plan:${owner}`, title],
  );
}

async function seedInsight(pool: Pool, owner: string, contactId: string, status: string, evidence: unknown[] = [], text = true) {
  await pool.query(
    `insert into contact_insights (workspace_id, actor_id, contact_id, status, goal_relation, next_step, evidence, relevance, generated_at, updated_at)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, 70, '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z')`,
    [WORKSPACE, owner, contactId, status, text ? JSON.stringify({ en: EN_RELATION, zh: ZH_RELATION }) : null, text ? JSON.stringify({ en: EN_NEXT, zh: ZH_NEXT }) : null, JSON.stringify(evidence)],
  );
}

async function memoNoteSuffix(pool: Pool, contactId: string): Promise<string> {
  const result = await pool.query(`select payload->'notes'->0->>'noteId' as note_id from orbit_records where collection_name = 'contact_detail_states' and payload->>'contactId' = $1`, [contactId]);
  return String(result.rows[0]!.note_id).replace("note:live-contact-detail-update:", "");
}

const insightSnapshot = (pool: Pool) =>
  pool.query(`select actor_id, contact_id, status, dirty_at, updated_at, ai_state, attempts from contact_insights order by actor_id, contact_id`).then((result) => JSON.stringify(result.rows));

test("SC-W0061-04: value lines read only the actor's contacts, resolve evidence, degrade by state and never write or call a provider", databaseTest, async (t) => {
  const providerCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    providerCalls.push(String(input));
    return new Response("{}", { status: 500 });
  });
  await withDatabase(async ({ deps, pool }) => {
    await seedContact(pool, "c-card", ALICE, "business_card_ocr");
    await seedContact(pool, "c-manual", ALICE, "manual", { organization: "", role: "" });
    await seedContact(pool, "c-pending", ALICE, "business_card_ocr");
    await seedContact(pool, "c-none", ALICE, "manual");
    await seedContact(pool, "c-nogoal", ALICE, "manual");
    await seedContact(pool, "c-failed", ALICE, "manual");
    await seedContact(pool, "c-bob", BOB, "business_card_ocr");
    await seedMemo(pool, ALICE, "c-card", "m1", "2026-09-28");
    await seedMemo(pool, ALICE, "c-manual", "m2", null); // 没选日期：取写入时间的东京日期（9/30）
    await seedNeed(pool, ALICE, "need-intro", "能引荐被投公司的投资人");
    await seedNeed(pool, BOB, "need-bob", "鲍勃的需求");
    await seedInsight(pool, ALICE, "c-card", "ready", [
      { id: "capture:c-card", source: "capture" },
      { id: "memo:note:live-contact-detail-update:m1", source: "memo" },
      { id: "encounter:e1", source: "encounter" },
      { id: "need-intro", source: "plan_need" },
      { id: "need-bob", source: "plan_need" },
    ]);
    await seedInsight(pool, ALICE, "c-manual", "ready", [{ id: "capture:c-manual", source: "capture" }, { id: "memo:note:live-contact-detail-update:m2", source: "memo" }]);
    await seedInsight(pool, ALICE, "c-pending", "pending", [], false);
    await seedInsight(pool, ALICE, "c-nogoal", "blocked_no_goal", [], false);
    await seedInsight(pool, ALICE, "c-failed", "failed", [], false);
    await seedInsight(pool, BOB, "c-bob", "ready", [{ id: "capture:c-bob", source: "capture" }]);
    const before = await insightSnapshot(pool);

    const lines = await readContactValueLines({ actorId: ALICE, contactIds: ["c-card", "c-bob", "c-manual", "c-pending", "c-none", "c-nogoal", "c-failed", "c-missing"], language: "zh" }, deps);
    assert.deepEqual(lines.map((line) => line.contactId), ["c-card", "c-manual", "c-pending", "c-none", "c-nogoal", "c-failed"], "bob's contact and unknown ids are silently dropped");
    const byId = new Map(lines.map((line) => [line.contactId, line]));
    assert.deepEqual(byId.get("c-card"), {
      contactId: "c-card",
      evidence: ["card", "memo:2026-09-28", "need:能引荐被投公司的投资人"],
      name: "田中 c-card",
      nextStep: ZH_NEXT,
      relation: ZH_RELATION,
      state: "ready",
      subtitle: "Nexa Capital · 合伙人",
    });
    assert.deepEqual(byId.get("c-manual")!.evidence, ["entry", "memo:2026-09-30"]);
    assert.equal(byId.get("c-manual")!.subtitle, undefined, "empty company · title is omitted");
    assert.deepEqual(["c-pending", "c-none", "c-nogoal", "c-failed"].map((id) => byId.get(id)!.state), ["pending", "pending", "no_goal", "failed"]);
    assert.ok(["c-pending", "c-none", "c-nogoal", "c-failed"].every((id) => byId.get(id)!.relation === undefined && byId.get(id)!.evidence === undefined));
    const english = await readContactValueLines({ actorId: ALICE, contactIds: ["c-card"], language: "en" }, deps);
    assert.equal(english[0]!.relation, EN_RELATION);
    // 他人联系人：bob 自己读得到，alice 读不到。
    assert.equal((await readContactValueLines({ actorId: BOB, contactIds: ["c-bob", "c-card"], language: "zh" }, deps)).map((line) => line.contactId).join(), "c-bob");
    // 候选卡重取（只读洞察）：只返回本人有洞察行的 id；他人与还没有行的 id 不返回，也不带姓名。
    const insightOnly = await readContactValueInsightLines({ actorId: ALICE, contactIds: ["c-bob", "c-card", "c-none", "c-pending"], language: "zh" }, deps);
    assert.deepEqual(insightOnly.map((line) => [line.contactId, line.state, line.name]), [["c-card", "ready", undefined], ["c-pending", "pending", undefined]]);

    assert.equal(await insightSnapshot(pool), before, "reading never writes or marks contact_insights dirty");
    assert.deepEqual(providerCalls, [], "0 provider calls");
  });
});

test("SC-W0061-05: measured bytes — value-lines for 6 ids and the candidate increment for 20 candidates stay ≤ 4 KB", databaseTest, async () => {
  await withDatabase(async ({ deps, pool }) => {
    await seedNeed(pool, ALICE, "need-intro", "能引荐被投公司的投资人");
    // 真实 id 长度：联系人 id 约 30 字（`orbit-contact-13be4ea69b-n02`），memo noteId 后缀按 UUID（36 字）算。
    const ids = Array.from({ length: 20 }, (_, index) => `orbit-contact-w61measure-n${String(index).padStart(2, "0")}`);
    for (const [index, id] of ids.entries()) {
      await seedContact(pool, id, ALICE, "business_card_ocr");
      await seedMemo(pool, ALICE, id, `${randomUUID()}`, "2026-09-28");
      // 真实洞察平均 1 条依据；这里单数位 1 条（名片）、双数位 2 条（名片 + memo），平均 1.5 条，略重于真实。
      await seedInsight(pool, ALICE, id, "ready", [
        { id: `capture:${id}`, source: "capture" },
        ...(index % 2 === 0 ? [{ id: `memo:note:live-contact-detail-update:${await memoNoteSuffix(pool, id)}`, source: "memo" }] : []),
      ]);
    }
    const measure: Record<string, number> = {};
    const handler = createContactValueLinesHandler({
      readInsightLines: (input) => readContactValueInsightLines(input, deps),
      readLines: (input) => readContactValueLines(input, deps),
      resolveActor: actor(ALICE),
    });
    // 首页实际只带露出的 3 条事项（≤3 个 id）；硬上限按 PLANNER 的 6 个 id 量。
    for (const count of [3, 6]) {
      for (const lang of ["zh", "en"] as const) {
        deps.reset();
        const response = await handler(new Request(`https://orbit.test/api/contacts/value-lines?ids=${ids.slice(0, count).join(",")}&lang=${lang}`));
        const body = await response.text();
        assert.equal((JSON.parse(body) as { data: { lines: unknown[] } }).data.lines.length, count);
        measure[`valueLines${count}.${lang}.response`] = Buffer.byteLength(body);
        measure[`valueLines${count}.${lang}.db`] = deps.bytes();
      }
    }

    // 候选接口：20 位候选，同一批数据，附 value 与不附的响应字节差。
    const candidates: PlanMatchCandidateView[] = ids.map((id, index) => ({
      aiReason: null, contactId: id, contactName: `田中 ${id}`, contactSubtitle: "Nexa Capital · 合伙人", id: `cand-${index}`,
      industry: { en: "Venture Capital", zh: "风险投资" }, needId: "need-intro", needTitle: "能引荐被投公司的投资人", strength: "candidate", tier: "rule",
    }));
    const view: PlanMatchCandidatesView = { candidates, contactCount: 20, pendingByNeed: { "need-intro": 20 } };
    const matchingService = (() => ({ listPending: async () => view, runForBatch: async () => ({ run: { state: "skipped" }, view }) })) as unknown as () => PlanMatchingService;
    const routes = (readValues: typeof readContactValueInsights) => createPlanCandidateRouteHandlers({ matchingService, readValues, resolveActor: actor(ALICE) });
    const bare = await (await routes(async () => new Map()).GET(new Request("https://orbit.test/api/agent/plans/candidates"))).text();
    for (const lang of ["zh", "en"] as const) {
      deps.reset();
      const response = await routes((input) => readContactValueInsights(input, deps)).GET(new Request("https://orbit.test/api/agent/plans/candidates", { headers: { "x-orbit-lang": lang } }));
      const body = await response.text();
      const parsed = JSON.parse(body) as { data: PlanMatchCandidatesView };
      assert.ok(parsed.data.candidates.every((candidate) => candidate.value?.state === "ready"));
      assert.equal(parsed.data.candidates[0]!.value!.relation, lang === "zh" ? ZH_RELATION : EN_RELATION);
      measure[`candidates20.${lang}.increment`] = Buffer.byteLength(body) - Buffer.byteLength(bare);
      measure[`candidates20.${lang}.db`] = deps.bytes();
    }
    // 刚导入（都还在生成）时的增量，以及候选卡每次重取（`fields=insight`，20 个 id 都还在生成）。
    await pool.query(`update contact_insights set status = 'pending', goal_relation = null, next_step = null`);
    deps.reset();
    const pendingBody = await (await routes((input) => readContactValueInsights(input, deps)).GET(new Request("https://orbit.test/api/agent/plans/candidates"))).text();
    measure["candidates20.pending.increment"] = Buffer.byteLength(pendingBody) - Buffer.byteLength(bare);
    measure["candidates20.pending.db"] = deps.bytes();
    deps.reset();
    const refetch = await (await handler(new Request(`https://orbit.test/api/contacts/value-lines?ids=${ids.join(",")}&lang=zh&fields=insight`))).text();
    assert.equal((JSON.parse(refetch) as { data: { lines: unknown[] } }).data.lines.length, 20);
    measure["refetch20.pending.response"] = Buffer.byteLength(refetch);
    measure["refetch20.pending.db"] = deps.bytes();
    console.log(`[W0061-measure] ${JSON.stringify(measure)}`);
    for (const [key, value] of Object.entries(measure)) assert.ok(value <= BYTES_LIMIT, `${key} = ${value} B exceeds ${BYTES_LIMIT} B`);
  });
});

test("SC-W0061-04: candidate routes attach value by language (GET header, run body) and still answer when the read fails", async () => {
  const candidate: PlanMatchCandidateView = {
    aiReason: "做投后", contactId: "c1", contactName: "N", contactSubtitle: null, id: "cand-1", industry: null, needId: "n1", needTitle: "T", strength: "candidate", tier: "ai",
  };
  const view: PlanMatchCandidatesView = { candidates: [candidate], contactCount: 1, pendingByNeed: { n1: 1 } };
  const matchingService = (() => ({ listPending: async () => view, runForBatch: async () => ({ run: { state: "skipped" }, view }) })) as unknown as () => PlanMatchingService;
  const languages: string[] = [];
  const readValues = async (input: { language: "zh" | "en"; contactIds: readonly string[] }) => {
    languages.push(input.language);
    return new Map([["c1", { evidence: [], nextStep: null, relation: `R-${input.language}`, state: "ready" as const }]]);
  };
  const routes = createPlanCandidateRouteHandlers({ matchingService, readValues, resolveActor: actor(ALICE) });
  const get = (await (await routes.GET(new Request("https://orbit.test/api/agent/plans/candidates", { headers: { "x-orbit-lang": "zh" } }))).json()) as { data: PlanMatchCandidatesView };
  assert.equal(get.data.candidates[0]!.value!.relation, "R-zh");
  const run = (await (await routes.POST_RUN(new Request("https://orbit.test/api/agent/plans/candidates/run", { body: JSON.stringify({ batchId: "b1", language: "en" }), method: "POST" }))).json()) as { data: PlanMatchCandidatesView };
  assert.equal(run.data.candidates[0]!.value!.relation, "R-en");
  assert.deepEqual(languages, ["zh", "en"]);
  const failing = createPlanCandidateRouteHandlers({ matchingService, readValues: async () => { throw new Error("down"); }, resolveActor: actor(ALICE) });
  const response = await failing.GET(new Request("https://orbit.test/api/agent/plans/candidates"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: PlanMatchCandidatesView };
  assert.equal(body.data.candidates[0]!.value, undefined);
  assert.equal(body.data.candidates[0]!.aiReason, "做投后", "existing fields keep their meaning");
});
