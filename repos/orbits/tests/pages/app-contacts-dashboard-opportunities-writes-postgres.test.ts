/**
 * W0050 review P1（D46③）起：从真实的 `/app/contacts/dashboard` page 入口直接打开「机会」标签不写库。
 * R11b 起该页是 NetworkAnalysisScreen（三个标签同一加载器，旧「机会」子页、覆盖率与报告已删除）；本用例守 R11b 的
 * 锁定规则（SC-R11b-03）：不足 10 人时直开 `?tab=opportunities` 也只渲染锁定页——0 次写入、0 个生成任务、强度缓存不刷新。
 * 10 人起的写入规则（只许排队一次快照任务）见 app-contacts-dashboard-overview-writes-postgres.test.ts。
 *
 * 真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema；live 模式经 PGOPTIONS 的 search_path 指到该 schema）。
 * 只替换与数据库无关的边界：会话（auth）、账号解析、界面语言、样式组件；页面与它调用的加载器都是真实代码、真实数据库。
 * 夹具处在「会触发强度重算」的状态：本人有联系人，却还没有强度缓存。
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

test("review P1 (R11b): opening the opportunities tab directly while below 10 people renders the lock and writes nothing", databaseTest, async (t) => {
  await withNetworkDatabase(async (harness) => {
    const at = new Date().toISOString();
    for (let index = 0; index < 4; index += 1) {
      await harness.addContact(ALICE, `${ALICE}:c${index}`, { createdAt: at, evidenceIds: ["e"], primaryIndustryId: "finance_investment", role: "Partner", source: { id: "s", type: "manual" }, updatedAt: at });
    }
    const strengthRows = `select count(*)::int as n from orbit_records where collection_name in ('relationship_strengths', 'relationship_strength_state')`;
    assert.equal((await harness.pool.query(strengthRows)).rows[0]!.n, 0, "no strength cache yet → a refreshing entry would compute and write");
    const counter = await installWriteCounter(harness);
    setEnv(t, {
      ORBIT_DATABASE_TARGET: undefined,
      ORBIT_GUIDE_DEMO: undefined,
      ORBIT_MODULE_MODE: "live",
      ORBIT_NETWORK_ANALYSIS_GENERATOR: undefined,
      ORBIT_PLAN_GENERATOR: undefined,
      // The contact card reader signs its cursors; the runner loads no .env, so the test brings its own.
      ORBIT_READ_CURSOR_SECRET: "local-test-secret-".repeat(3),
      ORBIT_WORKSPACE_ID: WORKSPACE,
      PGOPTIONS: `-c search_path=${harness.schema}`,
    });
    const pgWrites = countPgWrites(t);
    const page = loadRealDashboardPage(t);
    await counter.reset();

    const tree = await page({ searchParams: Promise.resolve({ tab: "opportunities" }) });
    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table in the schema");
    assert.deepEqual(pgWrites, [], "no write statement from any pg connection in the process");
    const screen = findProps(tree, "NetworkAnalysisScreen");
    assert.ok(screen, "the real page rendered the analysis screen");
    assert.equal(screen.initialTab, "opportunities");
    const lock = (screen.view as { lock: { state: string; total: number } }).lock;
    assert.deepEqual([lock.state, lock.total], ["locked", 4], "the count really ran against the schema: 4 of 10");
    assert.equal(screen.snapshot, null, "a direct opportunities link does not get past the lock to the snapshot");
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs`)).rows[0]!.n, 0, "no snapshot job queued");
    assert.equal((await harness.pool.query(strengthRows)).rows[0]!.n, 0, "the strength cache was not refreshed");
  });
});
