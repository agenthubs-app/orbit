/**
 * Agent action ledger fixture 测试。
 *
 * 验证 6 条设计稿派生条目覆盖全部状态、部分失败条目同时含成功与失败子操作、
 * 草稿子操作只存草稿（autoSendCapable false）、证据 chip 不含语音。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_LEDGER_ENTRY_STATUSES,
  AGENT_LEDGER_EVIDENCE_KINDS,
} from "../../features/agent/ledger/contract";
import {
  AGENT_LEDGER_FIXTURE_SOURCE,
  agentLedgerEntryFixtures,
  mockAgentLedgerProvenance,
} from "../../features/agent/ledger/fixtures";

test("fixtures provide six entries with unique ids", () => {
  assert.equal(agentLedgerEntryFixtures.length, 6);
  const ids = new Set(agentLedgerEntryFixtures.map((entry) => entry.entryId));
  assert.equal(ids.size, 6);
});

test("fixtures cover awaiting, executing, completed, partially_failed, and undone", () => {
  const statuses = new Set(agentLedgerEntryFixtures.map((entry) => entry.status));
  for (const expected of [
    "awaiting_confirmation",
    "executing",
    "completed",
    "partially_failed",
    "undone",
  ]) {
    assert.ok(statuses.has(expected as (typeof AGENT_LEDGER_ENTRY_STATUSES)[number]));
  }
});

test("every entry has at least one operation and consistent provenance", () => {
  for (const entry of agentLedgerEntryFixtures) {
    assert.ok(entry.operations.length >= 1, entry.entryId);
    assert.equal(entry.provenance.source, AGENT_LEDGER_FIXTURE_SOURCE);
    assert.equal(entry.messageAutoSendExecuted, false);
    assert.equal(entry.externalSideEffectExecuted, false);
  }
  assert.equal(mockAgentLedgerProvenance.messageAutoSendExecuted, false);
});

test("the partial-failure fixture mixes succeeded and failed operations", () => {
  const entry = agentLedgerEntryFixtures.find(
    (candidate) => candidate.entryId === "ledger-sync-three-events",
  );
  assert.ok(entry);
  assert.equal(entry.status, "partially_failed");
  const opStatuses = entry.operations.map((operation) => operation.status);
  assert.ok(opStatuses.includes("succeeded"));
  assert.ok(opStatuses.includes("failed"));
});

test("message draft operations carry a draft preview and can never auto-send", () => {
  const drafts = agentLedgerEntryFixtures
    .flatMap((entry) => entry.operations)
    .filter((operation) => operation.operationType === "save_message_draft");
  assert.ok(drafts.length >= 1);
  for (const draft of drafts) {
    assert.equal(draft.autoSendCapable, false);
    assert.ok((draft.draftPreview ?? "").length > 0);
  }
});

test("evidence chips only use whitelisted kinds", () => {
  for (const entry of agentLedgerEntryFixtures) {
    for (const chip of entry.evidenceChips) {
      assert.ok(AGENT_LEDGER_EVIDENCE_KINDS.includes(chip.kind));
    }
  }
});
