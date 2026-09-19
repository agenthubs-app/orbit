/**
 * Agent actions route view-model 测试。
 *
 * Actions 屏的三档分档规则复用操作账本既有状态归属（用户 2026-09-19 拍板，
 * 不发明新规则）：
 *   awaiting_confirmation → 需要你决定（decide）
 *   approved / executing  → 建议今天做（today）
 *   deferred              → 可稍后（later）
 * 终态条目不进三档；今日进度环分子 = completedAt 落在本地今天的终态条目数，
 * 分母 = 三档合计 + 今日已完成。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  type AgentLedgerEntry,
} from "../../features/agent/ledger/contract";
import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import type { AgentLedgerService } from "../../features/agent/ledger/service";
import { loadAgentActionsRouteViewModel } from "../../app/(app)/app/agent/actions/actions-route-view-model";

function stubLedgerService(entries: readonly AgentLedgerEntry[]): AgentLedgerService {
  return {
    applyTransition() {
      throw new Error("actions route view-model never mutates the ledger");
    },
    listEntries() {
      return {
        success: true,
        data: {
          entries,
          nextAction: "stub",
          provenance: {
            ...agentLedgerEntryFixtures[0].provenance,
            evidenceIds: ["stub-evidence"],
          },
          state: entries.length === 0 ? "empty" : "success",
          summary: "stub",
        },
      };
    },
    updateDraft() {
      throw new Error("actions route view-model never mutates drafts");
    },
  };
}

function tierEntries(
  model: Awaited<ReturnType<typeof loadAgentActionsRouteViewModel>>,
  key: string,
): readonly AgentLedgerEntry[] {
  return model.tiers.find((tier) => tier.key === key)?.entries ?? [];
}

test("default ledger groups entries into the three tiers by existing status attribution", async () => {
  const model = await loadAgentActionsRouteViewModel();

  assert.equal(model.state, "success");
  assert.deepEqual(
    model.tiers.map((tier) => tier.key),
    ["decide", "today", "later"],
  );
  assert.equal(tierEntries(model, "decide").length, 2);
  assert.ok(
    tierEntries(model, "decide").every(
      (entry) => entry.status === "awaiting_confirmation",
    ),
  );
  assert.equal(tierEntries(model, "today").length, 1);
  assert.ok(
    tierEntries(model, "today").every(
      (entry) => entry.status === "approved" || entry.status === "executing",
    ),
  );
  assert.equal(tierEntries(model, "later").length, 0);
});

test("terminal entries stay out of every tier", async () => {
  const model = await loadAgentActionsRouteViewModel();
  const tieredIds = model.tiers.flatMap((tier) =>
    tier.entries.map((entry) => entry.entryId),
  );

  assert.equal(tieredIds.includes("ledger-archive-six-contacts"), false);
  assert.equal(tieredIds.includes("ledger-sync-three-events"), false);
  assert.equal(tieredIds.includes("ledger-auto-followup-yamada"), false);
});

test("progress ring totals are real ledger counts, not design mock numbers", async () => {
  const model = await loadAgentActionsRouteViewModel();

  // mock 账本里唯一的 completed 条目没有 completedAt → 今日进度分子为 0。
  assert.equal(model.completedToday, 0);
  assert.equal(model.todaysTotal, 3);
});

test("an approved entry lands in today and a deferred entry lands in later", async () => {
  const base = agentLedgerEntryFixtures[0];
  const entries: AgentLedgerEntry[] = [
    { ...base, entryId: "stub-approved", status: "approved" },
    { ...base, entryId: "stub-deferred", status: "deferred" },
  ];
  const model = await loadAgentActionsRouteViewModel(undefined, {
    ledgerService: stubLedgerService(entries),
  });

  assert.deepEqual(
    tierEntries(model, "today").map((entry) => entry.entryId),
    ["stub-approved"],
  );
  assert.deepEqual(
    tierEntries(model, "later").map((entry) => entry.entryId),
    ["stub-deferred"],
  );
  assert.equal(tierEntries(model, "decide").length, 0);
});

test("only entries completed today feed the progress ring numerator", async () => {
  const base = agentLedgerEntryFixtures[0];
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const entries: AgentLedgerEntry[] = [
    { ...base, entryId: "stub-done-today", status: "completed", completedAt: new Date().toISOString() },
    {
      ...base,
      entryId: "stub-done-yesterday",
      status: "completed",
      completedAt: new Date(dayStart.getTime() - 60_000).toISOString(),
    },
    { ...base, entryId: "stub-awaiting", status: "awaiting_confirmation" },
  ];
  const model = await loadAgentActionsRouteViewModel(undefined, {
    ledgerService: stubLedgerService(entries),
  });

  assert.equal(model.completedToday, 1);
  assert.equal(model.todaysTotal, 2);
});

test("?entry= marks the selected entry for the deep link", async () => {
  const model = await loadAgentActionsRouteViewModel({
    entry: "ledger-followup-alex-chen",
  });

  assert.equal(model.selectedEntryId, "ledger-followup-alex-chen");
});

test("an array-valued ?entry= param takes its first value", async () => {
  const model = await loadAgentActionsRouteViewModel({
    entry: ["ledger-followup-alex-chen", "ledger-reply-xuwei-intro"],
  });

  assert.equal(model.selectedEntryId, "ledger-followup-alex-chen");
});

test("the empty scenario yields an empty state with all three tiers present", async () => {
  const model = await loadAgentActionsRouteViewModel(undefined, undefined, {
    scenario: "empty",
  });

  assert.equal(model.state, "empty");
  assert.deepEqual(
    model.tiers.map((tier) => [tier.key, tier.entries.length]),
    [
      ["decide", 0],
      ["today", 0],
      ["later", 0],
    ],
  );
  assert.equal(model.completedToday, 0);
  assert.equal(model.todaysTotal, 0);
});

test("the failure scenario yields a typed failure view model", async () => {
  const model = await loadAgentActionsRouteViewModel(undefined, undefined, {
    scenario: "failure",
  });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_MOCK_FAILED");
  assert.equal(model.tiers.length, 0);
  assert.equal(model.completedToday, 0);
  assert.equal(model.todaysTotal, 0);
});

test("an explicitly missing live actor fails closed instead of showing mock entries", async () => {
  const model = await loadAgentActionsRouteViewModel(undefined, {
    ledgerService: null,
  });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_ACTOR_REQUIRED");
  assert.equal(
    model.failureMessage,
    AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ACTOR_REQUIRED.message,
  );
  assert.equal(model.tiers.length, 0);
});
