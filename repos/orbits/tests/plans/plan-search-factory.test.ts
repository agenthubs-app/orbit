/**
 * R34 SC-R34-05（factory 部分）：`configuredPlanSearch(env)`：`ORBIT_PLAN_SEARCH=tavily` 且有 `TAVILY_API_KEY` 且有 live 账本 → tavily；
 * 开关没开 / 没 key / 没账本 → disabled。不读进程环境、不碰网络（fetch 注入且断言 0 次）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { configuredPlanSearch, PLAN_SEARCH_ENV, TAVILY_API_KEY_ENV } from "../../features/plans/search/factory";
import { MemoryAiLedger } from "../support/plan-ai-fixture";

test("three environments: switch off → disabled; switch on without key → disabled; switch on with key but no ledger → disabled; all three present → tavily", async () => {
  let fetchCalls = 0;
  const fetchImplementation: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error("must not be reached");
  };
  const ledger = new MemoryAiLedger();
  const withLedger = { fetchImplementation, ledger: () => ledger };
  const noLedger = { fetchImplementation, ledger: () => null };
  assert.equal(PLAN_SEARCH_ENV, "ORBIT_PLAN_SEARCH");
  assert.equal(TAVILY_API_KEY_ENV, "TAVILY_API_KEY");

  assert.equal(configuredPlanSearch({}, withLedger).id, "disabled");
  assert.equal(configuredPlanSearch({ ORBIT_PLAN_SEARCH: "off", TAVILY_API_KEY: "k" }, withLedger).id, "disabled");
  assert.equal(configuredPlanSearch({ ORBIT_PLAN_SEARCH: "tavily" }, withLedger).id, "disabled");
  assert.equal(configuredPlanSearch({ ORBIT_PLAN_SEARCH: "tavily", TAVILY_API_KEY: "   " }, withLedger).id, "disabled");
  assert.equal(configuredPlanSearch({ ORBIT_PLAN_SEARCH: "tavily", TAVILY_API_KEY: "k" }, noLedger).id, "disabled");
  assert.equal(configuredPlanSearch({ ORBIT_PLAN_SEARCH: " Tavily ", TAVILY_API_KEY: "k" }, withLedger).id, "tavily");

  // disabled 的结果形状，且装配本身不发请求。
  const disabled = configuredPlanSearch({}, withLedger);
  assert.deepEqual(await disabled.search({ goalKind: "sales", goalText: "x", industries: [], language: "ja", premise: [], purpose: null }, { actorId: "a", ledgerKeyPrefix: "p", now: new Date() }), { failed: 0, queries: 0, sources: [], status: "unavailable" });
  assert.equal(fetchCalls, 0);
  assert.equal(ledger.operations.length, 0);
});
