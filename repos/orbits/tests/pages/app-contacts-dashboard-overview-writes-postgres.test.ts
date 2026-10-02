/**
 * W0052 review P1：从真实的 `/app/contacts/dashboard` page 入口打开「概览」，对任意表 0 次写入（照 W0050 机会标签同一写法）。
 *
 * 真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema；live 模式经 PGOPTIONS 的 search_path 指到该 schema）。
 * 只替换与数据库无关的边界：会话、账号解析、界面语言、样式组件；页面与它调用的全部加载器（人脉分析、名单、
 * `loadOverviewCockpit`：计划 getCurrent、快照只读视图、待确认、时间线、档位看板、姓名）都是真实代码、真实数据库。
 *
 * 夹具同时处在三种「会写」的状态：
 * - 强度缓存待重算（有联系人、还没有强度缓存）；
 * - 生效计划正处阶段边界（「进入新阶段」还没写）；
 * - 快照已生成、之后新增 3 位联系人 → 判定为自动重算。
 * 打开概览：schema 内每张表的 statement 级触发器计数为 0，进程内所有 pg 连接也没有发出写语句，付费 AI 主机 0 次请求。
 * 对照：同一夹具打开 `?tab=structure` 会刷新强度缓存（写 orbit_records）；`getCurrentView` 会写 plan_log。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date();

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

/** 进程内所有 pg 语句里的写语句（含 Pool 回调形式与 Promise 形式）。 */
function countPgWrites(t: TestContext) {
  const writes: string[] = [];
  const original = Client.prototype.query as (...args: unknown[]) => unknown;
  (Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function patched(this: Client, ...args: unknown[]) {
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text ?? "";
    if (/^\s*(\/\*[^*]*\*\/\s*)?(insert|update|delete)\b/i.test(text)) writes.push(text.trim().slice(0, 80));
    return original.apply(this, args);
  };
  t.after(() => { (Client.prototype as unknown as { query: unknown }).query = original; });
  return writes;
}

async function installWriteCounter(harness: NetworkHarness) {
  await harness.pool.query(`create table w50_write_log (table_name text not null, op text not null)`);
  await harness.pool.query(`create function w50_count_write() returns trigger language plpgsql as $$ begin insert into w50_write_log values (TG_TABLE_NAME, TG_OP); return null; end $$`);
  const tables = (await harness.pool.query(`select tablename from pg_tables where schemaname = $1 and tablename <> 'w50_write_log'`, [harness.schema])).rows.map((row) => String(row.tablename));
  for (const table of tables) await harness.pool.query(`create trigger w50_count after insert or update or delete on ${table} for each statement execute function w50_count_write()`);
  return {
    async reset() { await harness.pool.query(`truncate w50_write_log`); },
    async byTable() { return (await harness.pool.query(`select table_name, op, count(*)::int as n from w50_write_log group by 1, 2 order by 1, 2`)).rows as Array<{ table_name: string; op: string; n: number }>; },
  };
}

function setEnv(t: TestContext, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function loadRealDashboardPage(t: TestContext) {
  const stubs: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(projectRoot, "auth.ts")]: { auth: async () => ({ user: { email: "alice@example.test", id: "auth:alice", name: "Alice" } }) },
    [join(projectRoot, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: async () => ({ email: "alice@example.test", id: ALICE, name: "Alice" }) },
    [join(projectRoot, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh", localizeOrbitTree: (tree: unknown) => tree },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(projectRoot, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(projectRoot, "app/(app)/app/orbit-account-shell.tsx")]: { AccountTopNav: () => null },
  };
  const ids = Object.keys(stubs).map((id) => testRequire.resolve(id));
  const previous = new Map(ids.map((id) => [id, testRequire.cache[id]]));
  t.after(() => {
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
      else delete testRequire.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(stubs)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  const pagePath = testRequire.resolve(join(projectRoot, "app/(app)/app/contacts/dashboard/page.tsx"));
  delete testRequire.cache[pagePath];
  return testRequire(pagePath).default as (input?: { searchParams?: Promise<{ tab?: string }> }) => Promise<unknown>;
}

function findProps(node: unknown, name: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const element = node as { type?: { name?: string }; props?: Record<string, unknown> };
  if (typeof element.type === "function" && (element.type as { name?: string }).name === name) return element.props ?? null;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findProps(child, name);
    if (found) return found;
  }
  return null;
}

function countPaidFetch(t: TestContext) {
  const original = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : (input as Request).url;
    if (PAID_AI_HOSTS.includes(new URL(url).hostname)) hits.push(url);
    return original(input as never, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  return hits;
}

function mockGenerator(): NetworkSnapshotGenerator {
  return {
    billable: false, model: "mock", promptVersion: "test-v1", provider: "mock" as never,
    async generate(input: SnapshotInput) { return { content: buildMockSnapshotContent(input), usage: { inputTokens: 0, outputTokens: 0 } }; },
  };
}

/** 五周前开始的两阶段计划：今天在第 2 阶段，「进入新阶段」还没写；1 条需求关联 c0。 */
async function seedPhaseBoundaryPlan(harness: NetworkHarness) {
  const plans = createPlanService({
    now: () => NOW.toISOString(),
    phaseRefiner: async () => ({ inserts: [], weekUpdates: [] }),
    references: createPostgresPlanReferenceValidator({ actorId: ALICE, client: harness.pool, eventCore: null, workspaceId: WORKSPACE }),
    repository: createPostgresPlanRepository({ pool: harness.pool }),
    scope: { actorId: ALICE, workspaceId: WORKSPACE },
  });
  const startsOn = new Date(NOW.getTime() - 35 * 86_400_000).toISOString().slice(0, 10);
  await plans.createVersion({
    analysis: { summary: "s" }, goalSnapshot: "拿到天使轮融资", horizon: "quarter", sourceSessionId: null, startsOn,
    phases: [{ endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "一" }, { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "二" }],
    items: [
      { criteria: { description: null, primaryIndustryId: "finance_investment", secondaryIndustryId: null, targetCount: 2, titleKeywords: [] }, kind: "network_need", phaseKey: "p1", title: "A" },
      { kind: "action", phaseKey: "p2", suggestedWeek: 6, title: "约人" },
    ],
  } as never);
  const links = JSON.stringify([{ contactId: `${ALICE}:c0`, establishedAt: null, linkedAt: "2026-09-01T00:00:00.000Z", state: "linked" }]);
  await harness.pool.query(`update plan_items set status = 'linked', contact_links = $1::jsonb, linked_contact_ids = $2 where title = 'A'`, [links, [`${ALICE}:c0`]]);
  return plans;
}

test("review P1: opening the overview from the real dashboard page writes nothing to any table, with the strength cache, plan phase and snapshot all due", databaseTest, async (t) => {
  const paid = countPaidFetch(t);
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 4; index += 1) await harness.addContact(ALICE, `${ALICE}:c${index}`, { displayName: `Alice ${index}`, primaryIndustryId: "finance_investment", role: "Partner" });
    // 快照：后台先生成一版，再新增 3 位 → 自动重算待办（只用 mock 生成器准备夹具，不在被测路径里）。
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client, generator: mockGenerator(), now: () => NOW,
      readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "拿到天使轮融资", profileSection: { profile: { relationshipGoal: "拿到天使轮融资" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    assert.equal((await runtime.service.readView(ALICE, "zh")).freshness.job, "queued");
    assert.equal((await runtime.service.runWorker(ALICE)).status, "succeeded");
    for (let index = 4; index < 7; index += 1) await harness.addContact(ALICE, `${ALICE}:c${index}`, { displayName: `Alice ${index}`, primaryIndustryId: "retail_consumer" });
    assert.equal((await runtime.service.evaluate(ALICE)).decision.kind, "auto");
    await harness.pool.query(`delete from network_analysis_jobs`);
    const plans = await seedPhaseBoundaryPlan(harness);
    const before = await harness.pool.query(`select count(*)::int as n from orbit_records where collection_name in ('relationship_strengths', 'relationship_strength_state')`);
    assert.equal(before.rows[0]!.n, 0, "no strength cache yet → a refreshing entry would compute and write");

    const counter = await installWriteCounter(harness);
    setEnv(t, {
      ORBIT_CONTACT_INSIGHT_GENERATOR: undefined,
      ORBIT_DATABASE_TARGET: undefined,
      ORBIT_GUIDE_DEMO: undefined,
      ORBIT_MODULE_MODE: "live",
      ORBIT_NETWORK_ANALYSIS_GENERATOR: undefined,
      ORBIT_PLAN_GENERATOR: undefined,
      ORBIT_WORKSPACE_ID: WORKSPACE,
      PGOPTIONS: `-c search_path=${harness.schema}`,
    });
    const pgWrites = countPgWrites(t);
    const page = loadRealDashboardPage(t);
    await counter.reset();

    const tree = await page({ searchParams: Promise.resolve({}) });
    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table in the schema");
    assert.deepEqual(pgWrites, [], "no write statement from any pg connection in the process");
    assert.deepEqual(paid, [], "no paid AI request");
    const overview = findProps(tree, "NetworkOverview");
    assert.ok(overview, "the real page rendered the overview");
    const data = overview.overview as { meta: { kind: string }; cards: Array<{ id: string; n: number | null }>; tierPending: number | null; tiers: Array<{ count: number | null }> };
    assert.equal(data.meta.kind, "snapshot", "the snapshot was read (read-only)");
    assert.deepEqual(data.cards.map((card) => [card.id, card.n]).slice(1, 3), [["gap", 1], ["week", 1]], "plan read via getCurrent at the phase boundary");
    // 分析总数按聚合口径（本夹具的联系人缺资产字段，聚合计为 0）；有总数时待统计 = 总数。
    const total = (data as { total?: number | null }).total ?? null;
    assert.equal(data.tierPending, total !== null && total > 0 ? total : null);
    assert.deepEqual(data.tiers.map((tier) => tier.count), total !== null && total > 0 ? [null, null, null, null] : [0, 0, 0, 0], "no tier cache → dashes (not zeros) when the account has contacts");
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs`)).rows[0]!.n, 0, "no snapshot job queued");
    assert.equal((await harness.pool.query(`select count(*)::int as n from orbit_records where collection_name in ('relationship_strengths', 'relationship_strength_state')`)).rows[0]!.n, 0, "the strength cache was not refreshed");

    // 对照：结构标签照旧刷新强度缓存；getCurrentView 会写「进入新阶段」（夹具确实处在会写的状态）。
    await page({ searchParams: Promise.resolve({ tab: "structure" }) });
    await plans.getCurrentView();
    const control = (await counter.byTable()).map((row) => row.table_name);
    assert.ok(control.includes("orbit_records"), control.join(","));
    assert.ok(control.includes("plan_log"), control.join(","));
  });
});
