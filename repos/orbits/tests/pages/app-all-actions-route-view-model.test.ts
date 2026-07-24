/**
 * All actions route view-model 测试。
 *
 * All actions 是账本的全量视图：包含 Today 不显示的 deferred，
 * 并按状态提供筛选。可撤销/可重试完全由条目状态推导。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadAppAllActionsRouteViewModel } from "../../app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";

test("all actions lists every ledger entry by default", async () => {
  const model = await loadAppAllActionsRouteViewModel();

  assert.equal(model.state, "success");
  assert.equal(model.entries.length, 6);
  assert.equal(model.activeFilter, "all");
});

test("the filter row carries a count per status plus an all bucket", async () => {
  const model = await loadAppAllActionsRouteViewModel();
  const byKey = new Map(model.filters.map((filter) => [filter.key, filter]));

  assert.equal(byKey.get("all")?.count, 6);
  assert.equal(byKey.get("awaiting_confirmation")?.count, 2);
  assert.equal(byKey.get("executing")?.count, 1);
  assert.equal(byKey.get("completed")?.count, 1);
  assert.equal(byKey.get("partially_failed")?.count, 1);
  assert.equal(byKey.get("undone")?.count, 1);
  assert.ok(byKey.get("all")?.active);
});

test("?status= narrows the list and moves the active filter", async () => {
  const model = await loadAppAllActionsRouteViewModel({
    status: "awaiting_confirmation",
  });

  assert.equal(model.activeFilter, "awaiting_confirmation");
  assert.equal(model.entries.length, 2);
  assert.ok(
    model.entries.every((entry) => entry.status === "awaiting_confirmation"),
  );
});

test("filter counts stay computed from the full ledger while filtered", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "completed" });
  const all = model.filters.find((filter) => filter.key === "all");

  assert.equal(all?.count, 6);
  assert.equal(all?.active, false);
});

test("an unknown ?status= falls back to the all bucket", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "nonsense" });

  assert.equal(model.activeFilter, "all");
  assert.equal(model.entries.length, 6);
});

test("the failure scenario yields a typed failure view model", async () => {
  const model = await loadAppAllActionsRouteViewModel({ scenario: "failure" });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_MOCK_FAILED");
  assert.equal(model.entries.length, 0);
});

test("an active filter with zero matches keeps its pill visible", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "failed" });

  assert.equal(model.activeFilter, "failed");
  assert.equal(model.entries.length, 0);
  const failedPill = model.filters.find((filter) => filter.key === "failed");
  assert.ok(failedPill, "the active failed pill must stay visible at count 0");
  assert.equal(failedPill.count, 0);
  assert.ok(failedPill.active);
});

test("inactive zero-count statuses stay hidden from the filter row", async () => {
  const model = await loadAppAllActionsRouteViewModel();

  assert.equal(model.filters.some((filter) => filter.key === "failed"), false);
  assert.equal(model.filters.some((filter) => filter.key === "deferred"), false);
});
