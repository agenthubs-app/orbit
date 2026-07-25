import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExternalActionConfirmationDecisionRequest,
  buildExternalActionSendMessageRequest,
  externalActionConfirmationDecisionToView,
  externalActionNoOpToView,
  externalActionSandboxToView
} from "../src/view-models/external-action-sandbox";

test("externalActionSandboxToView maps web sandbox audit into Chinese no-op cards", () => {
  const view = externalActionSandboxToView({
    actions: [
      {
        actionId: "sandbox-message-demo-1",
        actionType: "send_message",
        confirmationRequired: true,
        confirmationId: "confirmation:external-action:message:maya-chen",
        label: "No-op send message",
        noOp: true,
        requestedEffect:
          "Send Maya the promised reliability memo and pilot-scope question.",
        suppressedEffect:
          "Message provider request suppressed by the mock external action sandbox.",
        targetLabel: "Maya Chen"
      }
    ],
    auditRecords: [
      {
        actionId: "sandbox-message-demo-1",
        actionType: "send_message",
        actorLabel: "Mock operator",
        auditId: "audit:external-action:message:maya-chen",
        noOp: true,
        productionAuditPersisted: false,
        providerKind: "message_provider",
        recordedAt: "2026-06-25T23:59:00.000+09:00",
        relationshipContext: {
          connectionOrigin: "会后交换名片",
          eventLabel: "关西跨境商务交流会",
          followupRationale: "她在活动后询问了可靠性备忘录。",
          sourceContextIds: ["event:kansai-cross-border", "note:reliability"]
        },
        sideEffectExecuted: false,
        targetLabel: "Maya Chen",
        evidenceIds: ["agent-action:memo", "contact:maya"]
      }
    ],
    nextAction:
      "Keep every participant-facing action in the sandbox until explicit confirmation, privacy review, and live replacement tests are ready.",
    state: "success",
    summary:
      "Mock external action sandbox replaces message sending, calendar writes, email sends, push delivery, notification delivery, and side-effect audit records with deterministic no-op fixtures."
  });

  assert.equal(view.title, "对外动作确认");
  assert.equal(view.summary, "1 个待确认动作 · 1 条确认记录");
  assert.equal(view.nextAction, "这里先跑沙盒确认，不会向外发出消息。");
  assert.equal(view.emptyText, "");
  assert.deepEqual(view.actions, [
    {
      actionTypeLabel: "发送消息",
      canConfirmSend: true,
      confirmationId: "confirmation:external-action:message:maya-chen",
      confirmationLabel: "需要确认",
      id: "sandbox-message-demo-1",
      requestedEffect: "准备向 Maya Chen 发送消息。",
      suppressedEffect: "不会向外发出，只留下确认记录。",
      targetLabel: "Maya Chen"
    }
  ]);
  assert.deepEqual(view.auditRecords, [
    {
      actionTypeLabel: "发送消息",
      actorLabel: "移动端用户",
      contextLines: [
        "对象：Maya Chen",
        "场景：关西跨境商务交流会",
        "理由：她在活动后询问了可靠性备忘录。"
      ],
      evidenceLabel: "2 条依据",
      id: "audit:external-action:message:maya-chen",
      providerLabel: "消息",
      resultLabel: "未执行对外动作",
      safetyText: "只记录确认，没有执行对外动作。",
      targetLabel: "Maya Chen",
      timestampLabel: "6月25日 周四 23:59",
      title: "发送消息 · Maya Chen"
    }
  ]);
  const visibleCopy = [
    view.title,
    view.summary,
    view.nextAction,
    ...view.actions.flatMap((action) => [
      action.actionTypeLabel,
      action.confirmationLabel,
      action.requestedEffect,
      action.suppressedEffect,
      action.targetLabel
    ]),
    ...view.auditRecords.flatMap((audit) => [
      audit.title,
      audit.actionTypeLabel,
      audit.actorLabel,
      audit.evidenceLabel,
      audit.providerLabel,
      audit.resultLabel,
      audit.safetyText,
      audit.targetLabel,
      audit.timestampLabel,
      ...audit.contextLines
    ])
  ].join(" ");
  assert.doesNotMatch(
    visibleCopy,
    /Mock|mock|provider|fixture|真实发送|已发送给/u
  );
});

test("externalActionNoOpToView maps a confirmed sandbox send without provider claims", () => {
  const view = externalActionNoOpToView({
    actionId: "sandbox-message-demo-1",
    actionType: "send_message",
    actorLabel: "移动端用户",
    auditRecord: {
      auditId: "audit:external-action:message:maya-chen",
      sideEffectExecuted: false,
      targetLabel: "Maya Chen"
    },
    externalSideEffectExecuted: false,
    nextAction:
      "Review the side-effect audit record and keep the live provider switch disabled until replacement tests pass.",
    providerRequestIssued: false,
    state: "success",
    targetLabel: "Maya Chen"
  });

  assert.deepEqual(view, {
    detail: "Maya Chen · 发送消息",
    message: "已记录沙盒确认。没有调用邮件、短信或消息服务。",
    title: "沙盒确认完成"
  });
});

test("buildExternalActionSendMessageRequest keeps send confirmation explicit", () => {
  const request = buildExternalActionSendMessageRequest({
    id: "sandbox-message-demo-1",
    targetLabel: "Maya Chen"
  });

  assert.deepEqual(request, {
    actionId: "sandbox-message-demo-1",
    actorLabel: "移动端用户",
    targetLabel: "Maya Chen"
  });
});

test("external action confirmation helpers prepare approve and reject decisions", () => {
  const action = {
    confirmationId: "confirmation:external-action:message:maya-chen",
    id: "sandbox-message-demo-1",
    targetLabel: "Maya Chen"
  };

  assert.deepEqual(
    buildExternalActionConfirmationDecisionRequest(action, "approve"),
    {
      request: {
        body: { actorLabel: "移动端用户" },
        path: "/api/confirmations/confirmation%3Aexternal-action%3Amessage%3Amaya-chen/approve"
      },
      success: true
    }
  );
  assert.deepEqual(
    buildExternalActionConfirmationDecisionRequest(action, "reject"),
    {
      request: {
        body: { actorLabel: "移动端用户" },
        path: "/api/confirmations/confirmation%3Aexternal-action%3Amessage%3Amaya-chen/reject"
      },
      success: true
    }
  );
  assert.deepEqual(
    buildExternalActionConfirmationDecisionRequest(
      { confirmationId: "", id: "sandbox-message-demo-1", targetLabel: "Maya Chen" },
      "approve"
    ),
    {
      error: "这条确认缺少编号，暂时不能处理。",
      success: false
    }
  );
});

test("externalActionConfirmationDecisionToView maps decisions without external-send claims", () => {
  const approvedView = externalActionConfirmationDecisionToView({
    decision: {
      actorLabel: "移动端用户",
      confirmationId: "confirmation:external-action:message:maya-chen",
      externalActionExecuted: false,
      status: "approved"
    },
    requirement: {
      action: {
        externalActionExecuted: false,
        kind: "send-message",
        targetLabel: "Maya Chen"
      },
      status: "approved"
    },
    state: "approved"
  });
  const rejectedView = externalActionConfirmationDecisionToView({
    decision: {
      actorLabel: "移动端用户",
      confirmationId: "confirmation:external-action:message:maya-chen",
      externalActionExecuted: false,
      status: "rejected"
    },
    requirement: {
      action: {
        externalActionExecuted: false,
        kind: "send-message",
        targetLabel: "Maya Chen"
      },
      status: "rejected"
    },
    state: "rejected"
  });

  assert.deepEqual(approvedView, {
    detail: "Maya Chen · 发送消息",
    message: "只记录这次决定，没有执行对外动作。",
    title: "已记录批准"
  });
  assert.deepEqual(rejectedView, {
    detail: "Maya Chen · 发送消息",
    message: "这条对外动作仍留在复核边界内。",
    title: "已记录拒绝"
  });
  assert.doesNotMatch(
    JSON.stringify([approvedView, rejectedView]),
    /真实发送|已发送|邮件已发|日程已创建/u
  );
});
