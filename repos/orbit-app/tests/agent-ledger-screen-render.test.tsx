import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type { AgentLedgerListPayloadContract } from "../src/api/agent-ledger-contract";
import { AgentLedgerContent } from "../src/screens/agent/AgentLedgerContent";
import { agentLedgerToSurfaceView } from "../src/view-models/agent-ledger";
import { renderedText } from "./helpers/render";

const payload: AgentLedgerListPayloadContract = {
  entries: [
    {
      contactName: "Kenji Watanabe",
      createdAt: "2026-07-26T01:00:00.000Z",
      entryId: "action:followup-task:native",
      evidenceChips: [
        {
          evidenceId: "evidence:confirmed-note:kenji",
          kind: "contact_note",
          label: "已确认会面笔记"
        }
      ],
      evidenceIds: ["evidence:confirmed-note:kenji"],
      operations: [
        {
          autoSendCapable: false,
          effectSummary: "创建任务，不会自动发送消息。",
          idempotencyKey: "action:followup-task:native:v1",
          operationId: "action:followup-task:native:create",
          operationType: "create_followup_task",
          selectedByDefault: true,
          status: "pending",
          title: "创建会后跟进任务"
        }
      ],
      organization: "Aster Grid",
      preview: "确认周三提供移动端设计反馈。",
      riskLevel: "write",
      runId: "run:post-event-followup:native",
      sourceRefs: [
        {
          id: "source:event:climate-dinner",
          label: "Climate founders dinner",
          type: "event_material"
        }
      ],
      status: "awaiting_confirmation",
      title: "建立跟进任务 — Kenji Watanabe",
      undoable: true,
      updatedAt: "2026-07-26T01:05:00.000Z",
      whyNow: "活动结束后的跟进窗口正在缩短。",
      workflowKey: "post_event_followup_v1"
    }
  ],
  nextAction: "确认任务，或稍后再处理。",
  state: "success",
  summary: "1 条操作等待确认。"
};

test("native ledger content renders the shared Action identity, audit and controls", () => {
  const text = renderedText(
    <AgentLedgerContent
      error={null}
      feedback={null}
      onTransition={() => undefined}
      pending={null}
      view={agentLedgerToSurfaceView(payload, "today")}
    />
  );

  assert.match(text, /Today/u);
  assert.match(text, /action:followup-task:native/u);
  assert.match(text, /run:post-event-followup:native/u);
  assert.match(text, /post_event_followup_v1/u);
  assert.match(text, /创建会后跟进任务/u);
  assert.match(text, /确认执行/u);
  assert.match(text, /稍后处理/u);
  assert.match(text, /忽略/u);
  assert.match(text, /消息/u);
});
