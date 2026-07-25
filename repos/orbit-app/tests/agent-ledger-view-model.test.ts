import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentLedgerEntryContract,
  AgentLedgerListPayloadContract
} from "../src/api/agent-ledger-contract";
import { agentLedgerToSurfaceView } from "../src/view-models/agent-ledger";

function entry(
  input: Pick<
    AgentLedgerEntryContract,
    "entryId" | "status" | "title" | "undoable"
  >
): AgentLedgerEntryContract {
  return {
    createdAt: "2026-07-26T01:00:00.000Z",
    entryId: input.entryId,
    evidenceChips: [
      {
        evidenceId: `evidence:${input.entryId}`,
        kind: "contact_note",
        label: "已确认会面笔记"
      }
    ],
    evidenceIds: [`evidence:${input.entryId}`],
    operations: [
      {
        autoSendCapable: false,
        effectSummary: "只写入 Orbit，不自动发送消息。",
        executorKey: "followups.createTask",
        idempotencyKey: `${input.entryId}:v1`,
        operationId: `${input.entryId}:operation`,
        operationType: "create_followup_task",
        selectedByDefault: true,
        status: "pending",
        title: "创建跟进任务"
      }
    ],
    preview: "创建跟进任务：确认下周试点范围",
    riskLevel: "write",
    runId: `run:${input.entryId}`,
    sourceRefs: [
      {
        id: `source:${input.entryId}`,
        label: "Climate founders dinner",
        type: "event_material"
      }
    ],
    status: input.status,
    title: input.title,
    undoable: input.undoable,
    updatedAt: "2026-07-26T01:05:00.000Z",
    whyNow: "活动结束后的跟进窗口正在缩短。",
    workflowKey: "post_event_followup_v1"
  };
}

function payload(): AgentLedgerListPayloadContract {
  return {
    entries: [
      entry({
        entryId: "action:followup-task:mobile",
        status: "awaiting_confirmation",
        title: "建立跟进任务 — Kenji Watanabe",
        undoable: true
      }),
      entry({
        entryId: "action:followup-reminder:deferred",
        status: "deferred",
        title: "设置提醒 — Kenji Watanabe",
        undoable: true
      }),
      entry({
        entryId: "action:message-draft:completed",
        status: "completed",
        title: "准备跟进草稿 — Kenji Watanabe",
        undoable: true
      }),
      entry({
        entryId: "action:sync-event:partial",
        status: "partially_failed",
        title: "同步活动",
        undoable: true
      })
    ],
    nextAction: "先处理等待确认与失败项。",
    state: "success",
    summary: "4 条操作保存在统一账本。"
  };
}

test("Today projects the unified ledger without inventing separate mobile ids", () => {
  const view = agentLedgerToSurfaceView(payload(), "today");

  assert.equal(view.title, "Today");
  assert.deepEqual(
    view.sections.map((section) => section.id),
    ["decide", "recent"]
  );
  assert.equal(
    view.sections[0]?.entries[0]?.id,
    "action:followup-task:mobile"
  );
  assert.equal(
    view.sections.flatMap((section) => section.entries).some(
      (item) => item.id === "action:followup-reminder:deferred"
    ),
    false
  );
  assert.deepEqual(
    view.sections[0]?.entries[0]?.transitions.map(
      (transition) => transition.transition
    ),
    ["confirm", "defer", "reject"]
  );
});

test("All Actions restores every ledger status and only offers valid transitions", () => {
  const view = agentLedgerToSurfaceView(payload(), "all");
  const entries = view.sections[0]?.entries ?? [];

  assert.equal(view.title, "All Actions");
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries
      .find((item) => item.id === "action:followup-reminder:deferred")
      ?.transitions.map((transition) => transition.transition),
    ["confirm", "reject"]
  );
  assert.deepEqual(
    entries
      .find((item) => item.id === "action:message-draft:completed")
      ?.transitions.map((transition) => transition.transition),
    ["undo"]
  );
  assert.deepEqual(
    entries
      .find((item) => item.id === "action:sync-event:partial")
      ?.transitions.map((transition) => transition.transition),
    ["retry", "undo"]
  );
});

test("ledger operation audit fields remain visible to the native client", () => {
  const action = agentLedgerToSurfaceView(payload(), "all").sections[0]
    ?.entries[0];

  assert.equal(action?.runLabel, "run:action:followup-task:mobile");
  assert.equal(action?.workflowLabel, "post_event_followup_v1");
  assert.equal(
    action?.operations[0]?.idempotencyKey,
    "action:followup-task:mobile:v1"
  );
  assert.deepEqual(action?.evidenceLabels, [
    "已确认会面笔记 · evidence:action:followup-task:mobile"
  ]);
});
