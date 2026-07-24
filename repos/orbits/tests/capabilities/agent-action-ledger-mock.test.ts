/**
 * Agent action ledger mock 状态机测试。
 *
 * 覆盖：勾选子集执行、稍后处理、撤销、幂等重试（成功项不重复执行）、
 * 草稿编辑边界和非法转换。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMockAgentLedgerService } from "../../features/agent/ledger/mock-service";

test("listEntries returns the six fixtures", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.listEntries();
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.entries.length, 6);
    assert.equal(result.data.state, "success");
  }
});

test("confirm executes only selected operations and skips the rest", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: ["op-alex-save-note", "op-alex-draft"],
    actorLabel: "航太郎",
  });
  assert.equal(result.success, true);
  if (result.success) {
    const entry = result.data.entry;
    assert.equal(entry.status, "completed");
    const byId = new Map(entry.operations.map((operation) => [operation.operationId, operation]));
    assert.equal(byId.get("op-alex-save-note")?.status, "succeeded");
    assert.equal(byId.get("op-alex-draft")?.status, "succeeded");
    assert.equal(byId.get("op-alex-reminder")?.status, "skipped");
    assert.equal(entry.messageAutoSendExecuted, false);
  }
});

test("confirm with no selected operations fails validation", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: [],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AGENT_LEDGER_NO_OPERATIONS_SELECTED");
  }
});

test("defer moves awaiting entries to deferred, and deferred entries can confirm", async () => {
  const service = createMockAgentLedgerService();
  const deferred = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "defer",
  });
  assert.equal(deferred.success, true);
  if (deferred.success) {
    assert.equal(deferred.data.entry.status, "deferred");
  }
  const confirmed = await service.applyTransition({
    entryId: "ledger-followup-alex-chen",
    transition: "confirm",
    selectedOperationIds: ["op-alex-save-note"],
  });
  assert.equal(confirmed.success, true);
});

test("undo is limited to undoable completed or partially_failed entries", async () => {
  const service = createMockAgentLedgerService();
  const undone = await service.applyTransition({
    entryId: "ledger-archive-six-contacts",
    transition: "undo",
  });
  assert.equal(undone.success, true);
  if (undone.success) {
    assert.equal(undone.data.entry.status, "undone");
    assert.ok(
      undone.data.entry.operations.every((operation) => operation.status === "undone"),
    );
  }
  const invalid = await service.applyTransition({
    entryId: "ledger-auto-followup-yamada",
    transition: "undo",
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.equal(invalid.error.code, "AGENT_LEDGER_TRANSITION_INVALID");
  }
});

test("retry re-runs only failed operations; succeeded operations are never re-executed", async () => {
  const service = createMockAgentLedgerService();
  const retried = await service.applyTransition({
    entryId: "ledger-sync-three-events",
    transition: "retry",
  });
  assert.equal(retried.success, true);
  if (retried.success) {
    assert.equal(retried.data.entry.status, "completed");
    assert.equal(retried.data.entry.undoable, true);
  }
  assert.equal(service.getExecutionCount("sync:demo-day:2026-07-23"), 0);
  assert.equal(service.getExecutionCount("sync:dinner-review:2026-07-23"), 0);
  assert.equal(service.getExecutionCount("sync:kansai-matchup:2026-07-23"), 1);
});

test("scenario=empty returns an empty payload whose summary matches", async () => {
  const service = createMockAgentLedgerService();
  const result = await service.listEntries({ scenario: "empty" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.state, "empty");
    assert.equal(result.data.entries.length, 0);
    assert.ok(result.data.summary.includes("0 条"));
  }
});

test("draft edits only work on awaiting/deferred save_message_draft operations", async () => {
  const service = createMockAgentLedgerService();
  const updated = await service.updateDraft({
    entryId: "ledger-followup-alex-chen",
    operationId: "op-alex-draft",
    draftText: "Alex，改约下周三下午如何？",
  });
  assert.equal(updated.success, true);
  if (updated.success) {
    const draft = updated.data.entry.operations.find(
      (operation) => operation.operationId === "op-alex-draft",
    );
    assert.equal(draft?.draftPreview, "Alex，改约下周三下午如何？");
  }
  const rejected = await service.updateDraft({
    entryId: "ledger-archive-six-contacts",
    operationId: "op-archive-contacts",
    draftText: "should not work",
  });
  assert.equal(rejected.success, false);
  if (!rejected.success) {
    assert.equal(rejected.error.code, "AGENT_LEDGER_DRAFT_NOT_EDITABLE");
  }
});

test("unknown ids and missing ids fail with typed errors", async () => {
  const service = createMockAgentLedgerService();
  const missing = await service.applyTransition({ transition: "confirm" });
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.error.code, "AGENT_LEDGER_ENTRY_ID_REQUIRED");
  }
  const unknown = await service.applyTransition({
    entryId: "ledger-does-not-exist",
    transition: "confirm",
    selectedOperationIds: ["x"],
  });
  assert.equal(unknown.success, false);
  if (!unknown.success) {
    assert.equal(unknown.error.code, "AGENT_LEDGER_ENTRY_NOT_FOUND");
  }
});
