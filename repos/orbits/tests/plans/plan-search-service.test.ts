/**
 * R34 SC-R34-03（内存账本）+ SC-R34-04：`createPlanSearchService({ provider, ledger, limit })`
 * - 每条查询 reserve（purpose `plan_search`、pool `user`、trigger `plan`、幂等键 `${prefix}#search-${n}`）→ beginCall（provider `tavily`）
 *   → endCall → finish；同一 prefix 重跑不新增账本行、不再发请求；
 * - 退化：某条查询抛错 / 超时 → 该条 `failed+1`、不重试、其余继续、`status: "partial"`；全部失败 → `unavailable` 且 `sources: []`；
 *   `createDisabledPlanSearch()` 直接 `unavailable` 不记账；`createMockPlanSearch()` 按目标返回固定 2–4 条；
 * - 测试里真实网络调用 0 次（`fetch` 注入计数；mock / disabled 根本不碰 fetch）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_SEARCH_PER_PLAN_LIMIT } from "../../features/ai-quota/constants";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { createDisabledPlanSearch } from "../../features/plans/search/disabled";
import { createMockPlanSearch } from "../../features/plans/search/mock";
import { planSearchQueries } from "../../features/plans/search/queries";
import { createPlanSearchService, PLAN_SEARCH_LEDGER_MODEL } from "../../features/plans/search/service";
import { createTavilySearchProvider, TavilySearchError } from "../../features/plans/search/tavily";
import type { PlanSearchContext, PlanSearchInput, PlanSearchProvider, PlanSearchRawResult } from "../../features/plans/search/types";
import type { PlanGoalKind } from "../../shared/contract/plan-v2";
import { MemoryAiLedger } from "../support/plan-ai-fixture";

const NOW = new Date("2026-11-01T03:00:00.000Z");
const CONTEXT: PlanSearchContext = { actorId: "actor:alice", ledgerKeyPrefix: "draft:intake-1:1", now: NOW };
const INPUT: PlanSearchInput = { goalKind: "fundraising", goalText: "シード資金調達", industries: ["technology_internet"], language: "ja", premise: [], purpose: null };

function hit(host: string, score = 0.5): PlanSearchRawResult {
  return { content: `${host} の本文`, score, title: host, url: `https://${host}/page` };
}

/** 按查询在模板列表里的序号（1 起）决定行为的假供应商；并发下不能用调用顺序当序号。记录调用过的查询词。 */
function fakeProvider(behaviour: (query: string, n: number) => Promise<PlanSearchRawResult[]>): PlanSearchProvider & { calls: string[] } {
  const calls: string[] = [];
  const order = planSearchQueries(INPUT).map((query) => query.query);
  return {
    calls,
    name: "tavily",
    async search(query) {
      calls.push(query);
      return behaviour(query, order.indexOf(query) + 1);
    },
  };
}

test("happy path: one ledger operation per query with purpose plan_search / pool user / trigger plan, key `${prefix}#search-${n}`, one responded call on provider tavily, finished succeeded; sources filtered and deduped", async () => {
  const ledger = new MemoryAiLedger();
  const provider = fakeProvider(async (_query, n) => [hit(`site${n}.example.jp`, 0.9), hit(`site${n}.example.jp`, 0.1), hit("shared.example.jp", n / 10)]);
  const service = createPlanSearchService({ ledger, provider });
  assert.equal(service.id, "tavily");
  const expected = planSearchQueries(INPUT);
  const result = await service.search(INPUT, CONTEXT);
  assert.equal(result.status, "ok");
  assert.deepEqual([result.queries, result.failed], [expected.length, 0]);
  assert.ok(expected.length > 0 && expected.length <= PLAN_SEARCH_PER_PLAN_LIMIT);
  assert.deepEqual(provider.calls, expected.map((query) => query.query));
  // 账本：每条查询一行。
  assert.equal(ledger.operations.length, expected.length);
  ledger.operations.forEach((op, index) => {
    assert.deepEqual([op.purpose, op.pool, op.trigger, op.key, op.status], ["plan_search", "user", "plan", `${CONTEXT.ledgerKeyPrefix}#search-${index + 1}`, "succeeded"], `op ${index + 1}`);
    assert.equal(op.calls.length, 1);
    assert.equal(op.calls[0].status, "responded");
  });
  assert.equal(ledger.finishes.filter((entry) => entry.outcome === "succeeded").length, expected.length);
  // 结果：同 host 去重后 = 每条查询一个独立 host + 共享 host 一条（最高分那条）。
  const hosts = result.sources.map((source) => new URL(source.url).hostname);
  assert.equal(new Set(hosts).size, hosts.length);
  assert.equal(hosts.length, expected.length + 1);
  assert.equal(result.sources.find((source) => source.url.includes("shared.example.jp"))?.query, expected[expected.length - 1].query);
  for (const source of result.sources) {
    assert.equal(source.fetchedAt, NOW.toISOString());
    assert.ok(expected.some((query) => query.query === source.query));
    assert.ok(!("id" in source));
  }

  // 同一 prefix 重跑：账本不新增行、供应商不再被调用，结果为 unavailable（账本里这些操作已结清，不能再发未记账的请求）。
  const again = await service.search(INPUT, CONTEXT);
  assert.equal(ledger.operations.length, expected.length);
  assert.equal(provider.calls.length, expected.length);
  assert.deepEqual(again, { failed: expected.length, queries: expected.length, sources: [], status: "unavailable" });
});

test("partial: a throwing query and a timed-out query each count once as failed, are not retried, the rest continue; no_response calls are released in the ledger", async () => {
  const ledger = new MemoryAiLedger();
  const provider = fakeProvider(async (_query, n) => {
    if (n === 2) throw new TavilySearchError("PROVIDER_REQUEST_FAILED", "boom", true);
    if (n === 3) throw new TavilySearchError("PROVIDER_TIMEOUT", "slow", false);
    return [hit(`site${n}.example.jp`)];
  });
  const result = await createPlanSearchService({ ledger, provider }).search(INPUT, CONTEXT);
  const total = planSearchQueries(INPUT).length;
  assert.equal(result.status, "partial");
  assert.deepEqual([result.queries, result.failed, result.sources.length], [total, 2, total - 2]);
  assert.equal(provider.calls.length, total, "no retry");
  assert.equal(ledger.operations.length, total);
  assert.equal(ledger.operations[1].status, "failed", "responded error → failed");
  assert.equal(ledger.operations[1].calls[0].status, "responded");
  assert.equal(ledger.operations[2].status, "released", "timeout → no_response → released");
  assert.equal(ledger.operations[2].calls[0].status, "no_response");
  assert.equal(ledger.finishes.length, total, "finish called exactly once per query, including failed ones");
});

test("unavailable: every query failing (even with a non-Tavily error) gives status unavailable with no sources; the limit option caps the queries", async () => {
  const ledger = new MemoryAiLedger();
  const provider = fakeProvider(async () => {
    throw new Error("unexpected");
  });
  const result = await createPlanSearchService({ ledger, limit: 3, provider }).search(INPUT, CONTEXT);
  assert.deepEqual(result, { failed: 3, queries: 3, sources: [], status: "unavailable" });
  assert.equal(provider.calls.length, 3);
  assert.equal(ledger.operations.length, 3);
  assert.ok(ledger.operations.every((op) => op.calls.length === 1 && op.calls[0].status === "no_response" && op.status === "released"));
});

test("ledger denial (disabled / limit) means no provider call for that query and it counts as failed; a ledger that throws in beginCall still ends with finish", async () => {
  const refuse = async (): Promise<never> => {
    throw new Error("must not be reached");
  };
  const denied: AiQuotaGate = { beginCall: refuse, endCall: refuse, finish: refuse, reserve: async () => ({ ok: false, reason: "disabled" }) };
  const provider = fakeProvider(async (_query, n) => [hit(`site${n}.example.jp`)]);
  const result = await createPlanSearchService({ ledger: denied, provider }).search(INPUT, CONTEXT);
  assert.equal(result.status, "unavailable");
  assert.equal(provider.calls.length, 0);

  const exploding = new MemoryAiLedger();
  exploding.beginCall = async () => {
    throw new Error("ledger down");
  };
  const second = await createPlanSearchService({ ledger: exploding, provider }).search(INPUT, CONTEXT);
  assert.equal(second.status, "unavailable");
  assert.equal(provider.calls.length, 0);
  assert.equal(exploding.finishes.length, planSearchQueries(INPUT).length);
  assert.ok(exploding.finishes.every((entry) => entry.outcome === "failed"));
});

test("empty goal text: nothing to search, no ledger rows, unavailable", async () => {
  const ledger = new MemoryAiLedger();
  const provider = fakeProvider(async () => []);
  assert.deepEqual(await createPlanSearchService({ ledger, provider }).search({ ...INPUT, goalText: " " }, CONTEXT), { failed: 0, queries: 0, sources: [], status: "unavailable" });
  assert.deepEqual([ledger.operations.length, provider.calls.length], [0, 0]);
});

test("real adapter through the service with an injected fetch: 10 s timeout per query is enforced via AbortController, the whole plan never throws, and fetch is the only network path (counted)", async () => {
  const ledger = new MemoryAiLedger();
  let fetchCalls = 0;
  const fetchImplementation: typeof fetch = (_url, init) => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }
    return Promise.resolve(new Response(JSON.stringify({ results: [{ content: "c", score: 0.5, title: "t", url: `https://h${fetchCalls}.example.jp/` }] }), { status: 200 }));
  };
  const provider = createTavilySearchProvider({ apiKey: "tvly-test", fetchImplementation, timeoutMs: 20 });
  const result = await createPlanSearchService({ ledger, provider }).search(INPUT, CONTEXT);
  const total = planSearchQueries(INPUT).length;
  assert.equal(fetchCalls, total);
  assert.deepEqual([result.status, result.queries, result.failed, result.sources.length], ["partial", total, 1, total - 1]);
  assert.ok(ledger.operations.every((op) => op.calls.length === 1 && op.calls[0].status !== "started"));
  assert.equal(ledger.operations.every((op) => op.status !== "reserved"), true, "no operation left open");
  // 子账 provider / model 固定。
  assert.equal(PLAN_SEARCH_LEDGER_MODEL, "search:basic");
});

test("disabled: unavailable at once, no ledger rows, no network; mock: 2–4 fixed sources per goal kind, no ledger rows, no network", async () => {
  const ledger = new MemoryAiLedger();
  const disabled = createDisabledPlanSearch();
  assert.equal(disabled.id, "disabled");
  assert.deepEqual(await disabled.search(INPUT, CONTEXT), { failed: 0, queries: 0, sources: [], status: "unavailable" });
  const mock = createMockPlanSearch();
  assert.equal(mock.id, "mock");
  const kinds: PlanGoalKind[] = ["launch", "fundraising", "sales", "hiring", "partnership", "career"];
  for (const goalKind of kinds) {
    const result = await mock.search({ ...INPUT, goalKind }, CONTEXT);
    assert.equal(result.status, "ok", goalKind);
    assert.ok(result.sources.length >= 2 && result.sources.length <= 4, `${goalKind}: ${result.sources.length}`);
    assert.equal(result.queries, result.sources.length);
    assert.equal(result.failed, 0);
    for (const source of result.sources) {
      assert.equal(source.kind, "web");
      assert.ok(source.url.startsWith("https://"));
      assert.ok(source.snippet.length > 0 && Array.from(source.snippet).length <= 300);
      assert.equal(source.fetchedAt, NOW.toISOString());
      assert.ok(source.query.length > 0 && source.title.length > 0);
      assert.ok(!("id" in source));
    }
    assert.equal(new Set(result.sources.map((source) => new URL(source.url).hostname)).size, result.sources.length, `${goalKind}: hosts unique`);
  }
  assert.equal(ledger.operations.length, 0);
});
