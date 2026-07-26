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
    ],
  );
});

test("operation statuses cover selection, execution, and undo", () => {
  assert.deepEqual(
    [...AGENT_LEDGER_OPERATION_STATUSES],
    ["pending", "skipped", "succeeded", "failed", "undone"],
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
    ["confirm", "defer", "reject", "cancel", "undo", "retry"],
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
