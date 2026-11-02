/**
 * R34 SC-R34-03（真实 PostgreSQL，本机回环库、随机 schema）：`createPlanSearchService` 对一份计划：
 * `ai_usage_ledger` 里恰好 `queries` 行（purpose `plan_search`、pool `user`、trigger `plan`、幂等键 `${prefix}#search-${n}`），
 * 每行一条 `ai_usage_calls`（provider `tavily`、responded）；`user_used` / `plan_flow_used` 不增加；同一 prefix 重跑不新增行、不再调供应商；
 * 失败的查询：有响应 → failed，无响应（超时）→ released。真实网络调用 0 次（假供应商）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { planSearchQueries } from "../../features/plans/search/queries";
import { createPlanSearchService, PLAN_SEARCH_LEDGER_MODEL } from "../../features/plans/search/service";
import { TavilySearchError } from "../../features/plans/search/tavily";
import type { PlanSearchInput, PlanSearchProvider, PlanSearchRawResult } from "../../features/plans/search/types";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:r34-search";
const NOW = new Date("2026-11-01T03:00:00.000Z");
const INPUT: PlanSearchInput = { goalKind: "sales", goalText: "飲食店向け予約SaaSの新規顧客を増やす", industries: ["food_hospitality"], language: "ja", premise: [], purpose: null };

test("ledger rows: exactly one plan_search operation per query with one tavily call; record-only; idempotent rerun; failed and timed-out queries settle correctly", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `r34_search_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    const calls: string[] = [];
    const order = planSearchQueries(INPUT).map((query) => query.query);
    const provider: PlanSearchProvider = {
      name: "tavily",
      async search(query): Promise<PlanSearchRawResult[]> {
        calls.push(query);
        // 并发执行：序号按查询在模板里的位置，不按到达顺序。第二次调用同一条查询（重跑时重开的 released 操作）正常返回。
        const n = order.indexOf(query) + 1;
        if (n === 2) throw new TavilySearchError("PROVIDER_REQUEST_FAILED", "401", true);
        if (n === 3 && calls.filter((entry) => entry === query).length === 1) throw new TavilySearchError("PROVIDER_TIMEOUT", "slow", false);
        return [{ content: `${n} 本文`, score: 0.5, title: `T${n}`, url: `https://site${n}.example.jp/` }];
      },
    };
    const service = createPlanSearchService({ ledger, provider });
    const expected = planSearchQueries(INPUT);
    const prefix = "draft:intake-r34:1";
    const result = await service.search(INPUT, { actorId: "actor:a", ledgerKeyPrefix: prefix, now: NOW });
    assert.deepEqual([result.status, result.queries, result.failed, result.sources.length], ["partial", expected.length, 2, expected.length - 2]);

    const rows = (await pool.query("select idempotency_key, purpose, pool, trigger, status from ai_usage_ledger where workspace_id = $1 order by idempotency_key", [WS])).rows;
    assert.equal(rows.length, expected.length, "exactly one row per query");
    const byKey = new Map(rows.map((row) => [row.idempotency_key, row]));
    for (let n = 1; n <= expected.length; n += 1) {
      const row = byKey.get(`${prefix}#search-${n}`);
      assert.ok(row, `row for search-${n}`);
      assert.deepEqual([row.purpose, row.pool, row.trigger], ["plan_search", "user", "plan"]);
      assert.equal(row.status, n === 2 ? "failed" : n === 3 ? "released" : "succeeded", `status of search-${n}`);
    }
    const callRows = (await pool.query("select l.idempotency_key, c.provider, c.model, c.status from ai_usage_calls c join ai_usage_ledger l on l.workspace_id = c.workspace_id and l.id = c.operation_id where c.workspace_id = $1 order by l.idempotency_key", [WS])).rows;
    assert.equal(callRows.length, expected.length, "one call per operation");
    for (const row of callRows) {
      assert.deepEqual([row.provider, row.model], ["tavily", PLAN_SEARCH_LEDGER_MODEL]);
      assert.equal(row.status, row.idempotency_key === `${prefix}#search-3` ? "no_response" : "responded");
    }
    const usage = await ledger.readUsageToday("actor:a", NOW);
    assert.deepEqual([usage.user, usage.planFlow], [0, 0], "record-only: neither the user pool nor the plan-flow limit moves");

    // 同一 prefix 重跑：账本行数不变。已结清的（succeeded / failed）操作回放 `owner: false`，不再调供应商；
    // 只有无响应而 released 的 search-3 按账本语义重开同一行（多一条子账），这次成功 → 结果只含它一条。
    const again = await service.search(INPUT, { actorId: "actor:a", ledgerKeyPrefix: prefix, now: NOW });
    assert.equal((await pool.query("select count(*)::int as n from ai_usage_ledger where workspace_id = $1", [WS])).rows[0].n, expected.length, "rerun adds no ledger row");
    assert.equal((await pool.query("select count(*)::int as n from ai_usage_calls where workspace_id = $1", [WS])).rows[0].n, expected.length + 1, "only the reopened released operation gets a new call");
    assert.deepEqual(calls.slice(expected.length), [order[2]], "only search-3 is searched again");
    assert.deepEqual([again.status, again.queries, again.failed, again.sources.length], ["partial", expected.length, expected.length - 1, 1]);
    assert.equal((await pool.query("select status from ai_usage_ledger where workspace_id = $1 and idempotency_key = $2", [WS, `${prefix}#search-3`])).rows[0].status, "succeeded");
    assert.deepEqual([(await ledger.readUsageToday("actor:a", NOW)).user, (await ledger.readUsageToday("actor:a", NOW)).planFlow], [0, 0]);
    await client.close().catch(() => undefined);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
