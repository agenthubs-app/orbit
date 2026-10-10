/**
 * W0050 review P1（D46③）：从真实的 `/app/contacts/dashboard` page 入口打开「机会」标签，对任意表 0 次写入。
 *
 * 真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema；live 模式经 PGOPTIONS 的 search_path 指到该 schema）。
 * 只替换与数据库无关的边界：会话（auth）、账号解析、界面语言、样式组件；页面本身与它调用的全部加载器
 * （强度读模型、人脉分析、名单、档位查询、`loadOpportunitiesTab`）都是真实代码、真实数据库。
 *
 * 夹具处在「会触发强度重算」的状态：本人有联系人与时间线，却还没有强度缓存（state 行缺失 ⇒ 来源戳／东京日都算变化）。
 * - 打开 `?tab=opportunities`：schema 内每张表的 statement 级触发器计数为 0，进程内所有 pg 连接也没有发出 INSERT／UPDATE／DELETE；
 * - 对照：同一夹具打开 `?tab=structure` 会刷新强度缓存（写 orbit_records），证明夹具确实处在会写的状态。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

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

test("review P1: opening the opportunities tab from the real dashboard page writes nothing to any table, even when the strength cache is due a refresh", databaseTest, async (t) => {
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 4; index += 1) await harness.addContact(ALICE, `${ALICE}:c${index}`, { primaryIndustryId: "finance_investment", role: "Partner" });
    const before = await harness.pool.query(`select count(*)::int as n from orbit_records where collection_name in ('relationship_strengths', 'relationship_strength_state')`);
    assert.equal(before.rows[0]!.n, 0, "no strength cache yet → a refreshing entry would compute and write");
    const counter = await installWriteCounter(harness);
    setEnv(t, {
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

    const tree = await page({ searchParams: Promise.resolve({ tab: "opportunities" }) });
    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table in the schema");
    assert.deepEqual(pgWrites, [], "no write statement from any pg connection in the process");
    const analysis = findProps(tree, "NetworkAnalysis");
    assert.ok(analysis, "the real page rendered the analysis sub-page");
    assert.equal(analysis.initialTab, "opp");
    const view = analysis.opportunities as { report: { state: string }; coverage: { state: string } };
    assert.equal(view.coverage.state, "no_plan", "the opportunities loader really ran against the schema");
    assert.equal(view.report.state, "none");
    const after = await harness.pool.query(`select count(*)::int as n from orbit_records where collection_name in ('relationship_strengths', 'relationship_strength_state')`);
    assert.equal(after.rows[0]!.n, 0, "the strength cache was not refreshed");

    // 对照：结构标签照旧刷新强度缓存（夹具确实处在会写的状态）。
    await page({ searchParams: Promise.resolve({ tab: "structure" }) });
    const control = await counter.byTable();
    assert.ok(control.some((row) => row.table_name === "orbit_records"), JSON.stringify(control));
  });
});
