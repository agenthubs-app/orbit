/**
 * Agent action ledger contract 测试。
 *
 * 验证账本状态机枚举、错误定义完备性、证据种类白名单（只允许确认后的语音转写）
 * 和 failure→AppError 转换。
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_LEDGER_ENTRY_STATUSES,
  AGENT_LEDGER_ERROR_CODES,
  AGENT_LEDGER_ERROR_DEFINITIONS,
  AGENT_LEDGER_EVIDENCE_KINDS,
  AGENT_LEDGER_OPERATION_STATUSES,
  AGENT_LEDGER_OPERATION_TYPES,
  AGENT_LEDGER_TRANSITIONS,
  agentLedgerFailureContext,
  agentLedgerFailureToAppError,
  type AgentLedgerFailure,
} from "../../features/agent/ledger/contract";

test("ledger entry statuses cover proposal, approval, execution, rejection, and recovery", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_ENTRY_STATUSES],
    [
      "awaiting_confirmation",
      "approved",
      "executing",
      "completed",
      "partially_failed",
      "failed",
      "rejected",
      "canceled",
      "undone",
      "deferred",
      // agent-design AG02 (设计稿附录 D).
      "expired",
    ],
  );
});

test("operation statuses cover selection, execution, and undo", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_OPERATION_STATUSES],
    // agent-design AG02 adds the three review receipts (设计稿附录 D).
    ["pending", "skipped", "succeeded", "failed", "undone", "needs_review", "user_confirmed", "abandoned"],
  );
});

test("operation types cover the design-derived write operations", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_OPERATION_TYPES],
    [
      "save_meeting_note",
      "create_followup_task",
      "create_followup_reminder",
      "save_message_draft",
      "archive_contacts",
      "generate_meeting_brief",
      "save_event_goal",
      "create_preparation_task",
      "add_to_orbit_schedule",
      "create_intro_request",
      "accept_intro_request",
      "propose_meeting_slots",
      "sync_event_to_calendar",
      "save_memory",
      // agent-design AG02: the to-do create and update executors.
      "create_todo",
      "update_todo",
      // agent-design AG06: a new memo with its interaction (memo.create).
      "create_memo",
      // agent-design AG10: the interaction written on an existing memo (memo.update).
      "update_memo",
      // agent-design AG12: the five contact operations.
      "create_contact",
      "update_contact",
      "delete_contact",
      "restore_contact",
      "import_contacts",
      // agent-design AG13: private events, «我去过», schedule items, and the other to-do verbs.
      "create_private_event",
      "update_private_event",
      "delete_private_event",
      "create_attendance",
      "update_attendance",
      "delete_attendance",
      "create_schedule",
      "update_schedule",
      "delete_schedule",
      "complete_todo",
      "reopen_todo",
      "delete_todo",
      // agent-design AG14: personal memory — a new entry, a change of one, forgetting one.
      "create_memory",
      "update_memory",
      "delete_memory",
      // agent-design AG15: scheduled rules, after a card.
      "create_rule",
      "update_rule",
      "pause_rule",
      "resume_rule",
      "cancel_rule",
    ],
  );
});

test("evidence kinds allow confirmed transcripts but never raw voice or audio", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_EVIDENCE_KINDS],
    [
      "event_material",
      "chat_summary",
      "calendar_signal",
      "contact_note",
      "confirmed_voice_transcript",
    ],
  );
  assert.ok(!AGENT_LEDGER_EVIDENCE_KINDS.some((kind) => /raw|audio/.test(kind)));
});

test("transitions cover confirmation, refusal, cancellation, and recovery", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_TRANSITIONS],
    // agent-design AG02: mark_done and abandon settle an item whose outcome is unknown.
    ["confirm", "defer", "reject", "cancel", "undo", "retry", "mark_done", "abandon"],
  );
});

test("every error code has a definition with app code, message, and recovery", () => {
  for (const code of AGENT_LEDGER_ERROR_CODES) {
    const definition = AGENT_LEDGER_ERROR_DEFINITIONS[code];
    assert.equal(definition.code, code);
    assert.ok(definition.appCode.length > 0);
    assert.ok(definition.message.length > 0);
    assert.ok(definition.recovery.length > 0);
  }
});

test("failure converts to AppError and API error context", () => {
  const failure: AgentLedgerFailure = {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS.AGENT_LEDGER_ENTRY_NOT_FOUND,
      state: "failure",
      provenance: {
        source: "fixture:test",
        sourceLabel: "test",
        evidenceIds: [],
        collectedAt: "2026-07-24T00:00:00.000+09:00",
        privacy: "demo-agent-ledger-only",
        generationMethod: "fixture",
        autonomousExecutionStarted: false,
        externalSideEffectExecuted: false,
        externalNetworkRequested: false,
        messageAutoSendExecuted: false,
        liveDatabaseReadExecuted: false,
        liveDatabaseWriteExecuted: false,
      },
      evidenceIds: [],
    },
  };

  const appError = agentLedgerFailureToAppError(failure);
  assert.equal(appError.code, "NOT_FOUND");

  const context = agentLedgerFailureContext(failure, "mock");
  assert.equal(context.service, "agent-action-ledger");
  assert.equal(context.agentLedgerErrorCode, "AGENT_LEDGER_ENTRY_NOT_FOUND");
});
