/**
 * Today route view-model 测试。
 *
 * Today 是操作账本的一个视图：awaiting_confirmation → 需要你决定，
 * executing → ORBIT 已准备，completed/failed/partially_failed/undone → 最近完成。
 * deferred（稍后处理）不在 Today 出现，只在 All actions 可见。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_LEDGER_ENTRY_STATUSES } from "../../features/agent/ledger/contract";
import {
  loadAppTodayRouteViewModel,
  TODAY_SECTION_BY_STATUS,
} from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";

test("today buckets ledger entries into decide, prepared, and recent", async () => {
  const model = await loadAppTodayRouteViewModel();

  assert.equal(model.state, "success");
  assert.deepEqual(
    model.sections.map((section) => section.key),
    ["decide", "prepared", "recent"],
  );
  assert.equal(model.decideCount, 2);
});

test("each section only contains entries whose status belongs to it", async () => {
  const model = await loadAppTodayRouteViewModel();
  const allowed: Record<string, readonly string[]> = {
    decide: ["awaiting_confirmation"],
    prepared: ["executing"],
    recent: ["completed", "partially_failed", "undone"],
  };

  for (const section of model.sections) {
    for (const entry of section.entries) {
      assert.ok(
        allowed[section.key].includes(entry.status),
        `${entry.entryId} (${entry.status}) does not belong in ${section.key}`,
      );
    }
  }
});

test("deferred entries never surface on Today", async () => {
  const model = await loadAppTodayRouteViewModel();
  const statuses = model.sections.flatMap((section) =>
    section.entries.map((entry) => entry.status),
  );

  assert.ok(!statuses.includes("deferred"));
});

test("selection defaults to the first decide entry", async () => {
  const model = await loadAppTodayRouteViewModel();

  assert.equal(model.selectedEntry?.entryId, "ledger-followup-alex-chen");
});

test("an explicit ?entry= wins over the default selection", async () => {
  const model = await loadAppTodayRouteViewModel({ entry: "ledger-reply-xuwei-intro" });

  assert.equal(model.selectedEntry?.entryId, "ledger-reply-xuwei-intro");
});

test("an unknown ?entry= falls back to the default selection", async () => {
  const model = await loadAppTodayRouteViewModel({ entry: "ledger-does-not-exist" });

  assert.equal(model.selectedEntry?.entryId, "ledger-followup-alex-chen");
});

test("the failure scenario yields a typed failure view model", async () => {
  const model = await loadAppTodayRouteViewModel({ scenario: "failure" });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_MOCK_FAILED");
  assert.equal(model.sections.length, 0);
  assert.equal(model.selectedEntry, null);
  assert.ok((model.failureMessage ?? "").length > 0);
});

test("the empty scenario yields an empty view model with no sections", async () => {
  const model = await loadAppTodayRouteViewModel({ scenario: "empty" });

  assert.equal(model.state, "empty");
  assert.equal(model.sections.length, 0);
  assert.equal(model.decideCount, 0);
});

test("every ledger status has an explicit Today routing decision", () => {
  for (const status of AGENT_LEDGER_ENTRY_STATUSES) {
    assert.ok(
      status in TODAY_SECTION_BY_STATUS,
      `${status} has no Today routing decision and would be silently dropped`,
    );
  }
});

test("failed entries are visible on Today; only deferred is hidden", () => {
  assert.equal(TODAY_SECTION_BY_STATUS.failed, "recent");
  assert.equal(TODAY_SECTION_BY_STATUS.deferred, null);

  const hidden = AGENT_LEDGER_ENTRY_STATUSES.filter(
    (status) => TODAY_SECTION_BY_STATUS[status] === null,
  );
  assert.deepEqual(hidden, ["deferred"]);
});
