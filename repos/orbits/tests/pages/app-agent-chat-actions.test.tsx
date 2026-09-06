import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentActionStatusCard,
  agentChatActionCanConfirm,
  agentChatActionStatusLabel,
  parseAgentChatRunActions,
  parseAgentChatRunView,
} from "../../app/(app)/app/agent/agent-action-status-card";
import {
  agentLedgerErrorMessage,
  agentLedgerReviewTransitionsForStatus,
} from "../../features/agent/ledger/presentation";
import {
  agentRetryRequestForAssistant,
  prepareAgentFailedRequestRetry,
} from "../../app/(app)/app/agent/orbit-real-agent";
import { latestConversationRuntimeLink } from "../../features/orbit-ai/conversation-runtime-links";

test("conversation response links actions from exactly one shared run", () => {
  const link = latestConversationRuntimeLink(
    [
      {
        actionId: "action:older",
        conversationId: "conversation:agent",
        runId: "run:older",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
      {
        actionId: "action:new-task",
        conversationId: "conversation:agent",
        runId: "run:new",
        updatedAt: "2026-07-26T01:00:00.000Z",
      },
      {
        actionId: "action:new-reminder",
        conversationId: "conversation:agent",
        runId: "run:new",
        updatedAt: "2026-07-26T00:59:59.000Z",
      },
      {
        actionId: "action:other-conversation",
        conversationId: "conversation:other",
        runId: "run:other",
        updatedAt: "2026-07-26T02:00:00.000Z",
      },
    ],
    "conversation:agent",
  );

  assert.deepEqual(link, {
    actionIds: ["action:new-task", "action:new-reminder"],
    runId: "run:new",
  });
});

test("chat narrows run actions to the action ids linked by the conversation API", () => {
  const actions = parseAgentChatRunActions(
    {
      success: true,
      data: {
        actions: [
          {
            actionId: "action:linked",
            operations: [
              { operationId: "operation:note" },
              { operationId: "operation:draft" },
            ],
            riskLevel: "write",
            status: "awaiting_confirmation",
            title: "Review the follow-up",
          },
          {
            actionId: "action:other-conversation",
            operations: [{ operationId: "operation:other" }],
            riskLevel: "external",
            status: "completed",
            title: "Do not expose this action",
          },
        ],
      },
    },
    ["action:linked"],
  );

  assert.deepEqual(actions, [
    {
      actionId: "action:linked",
      operationIds: ["operation:note", "operation:draft"],
      preview: "",
      riskLevel: "write",
      status: "awaiting_confirmation",
      title: "Review the follow-up",
    },
  ]);
});

test("chat action state labels are product-readable in Chinese and English", () => {
  assert.equal(
    agentChatActionStatusLabel("awaiting_confirmation", "zh"),
    "等待确认",
  );
  assert.equal(agentChatActionStatusLabel("completed", "en"), "Completed");
  assert.equal(
    agentChatActionStatusLabel("new-server-state", "zh"),
    "正在同步",
  );
});

test("review controls follow the ledger state machine and localize stale-state errors", () => {
  assert.deepEqual(
    agentLedgerReviewTransitionsForStatus("awaiting_confirmation"),
    ["confirm", "defer", "reject"],
  );
  assert.deepEqual(agentLedgerReviewTransitionsForStatus("deferred"), [
    "confirm",
    "reject",
  ]);
  assert.deepEqual(agentLedgerReviewTransitionsForStatus("rejected"), []);
  assert.equal(
    agentLedgerErrorMessage(
      {
        success: false,
        error: {
          code: "CONFLICT",
          context: {
            agentLedgerErrorCode: "AGENT_LEDGER_TRANSITION_INVALID",
          },
          message:
            "That transition is not allowed from the entry's current status.",
        },
      },
      "zh",
    ),
    "操作状态已经变化，请刷新后再试。",
  );
  assert.equal(
    agentLedgerErrorMessage(
      {
        success: false,
        error: {
          code: "CONFLICT",
          message:
            "That transition is not allowed from the entry's current status.",
        },
      },
      "zh",
    ),
    "操作没有完成，请刷新状态后重试。",
  );
});

test("chat derives ordered Run progress and retry controls from the server envelope", () => {
  const run = parseAgentChatRunView({
    success: true,
    data: {
      progress: {
        activeStepId: "step:2",
        canCancel: false,
        canRetry: true,
        completedSteps: 1,
        failedSteps: 1,
        percent: 50,
        totalSteps: 2,
      },
      run: { status: "failed" },
      steps: [
        {
          error: { message: "Provider timed out." },
          name: "synthesis",
          sequence: 2,
          status: "failed",
          stepId: "step:2",
        },
        {
          name: "planner",
          sequence: 1,
          status: "completed",
          stepId: "step:1",
        },
      ],
    },
  });

  assert.deepEqual(run, {
    progress: {
      activeStepId: "step:2",
      canCancel: false,
      canRetry: true,
      completedSteps: 1,
      failedSteps: 1,
      percent: 50,
      totalSteps: 2,
    },
    status: "failed",
    steps: [
      {
        error: undefined,
        name: "planner",
        sequence: 1,
        status: "completed",
        stepId: "step:1",
      },
      {
        error: "Provider timed out.",
        name: "synthesis",
        sequence: 2,
        status: "failed",
        stepId: "step:2",
      },
    ],
  });
});

test("failed Agent requests replay the nearest preceding user request", () => {
  assert.equal(
    agentRetryRequestForAssistant(
      [
        { role: "user", text: "先找人" },
        {
          items: [],
          kind: "people",
          panelTitle: "",
          role: "assistant",
          text: "第一轮",
        },
        { role: "user", text: "  再生成跟进建议  " },
        {
          items: [],
          kind: "people",
          panelTitle: "",
          role: "assistant",
          text: "失败",
        },
      ],
      3,
    ),
    "再生成跟进建议",
  );
  assert.equal(
    agentRetryRequestForAssistant(
      [
        {
          items: [],
          kind: "people",
          panelTitle: "",
          role: "assistant",
          text: "没有用户请求",
        },
      ],
      0,
    ),
    null,
  );
});

test("failed Agent request retry consumes the failure without duplicating its user turn", () => {
  const retry = prepareAgentFailedRequestRetry(
    [
      { role: "user", text: "先找人" },
      {
        items: [],
        kind: "people",
        panelTitle: "",
        role: "assistant",
        text: "第一轮",
      },
      { role: "user", text: "重新检查这段关系" },
      {
        items: [],
        kind: "people",
        panelTitle: "",
        retryRequest: "重新检查这段关系",
        role: "assistant",
        text: "Provider unavailable",
      },
    ],
    3,
  );

  assert.ok(retry);
  assert.equal(retry.query, "重新检查这段关系");
  assert.deepEqual(retry.visibleMessages, [
    { role: "user", text: "先找人" },
    {
      items: [],
      kind: "people",
      panelTitle: "",
      role: "assistant",
      text: "第一轮",
    },
    { role: "user", text: "重新检查这段关系" },
  ]);
  assert.deepEqual(retry.historyMessages, [
    { role: "user", text: "先找人" },
    {
      items: [],
      kind: "people",
      panelTitle: "",
      role: "assistant",
      text: "第一轮",
    },
  ]);
});

test("chat never offers one-click confirmation for external actions", () => {
  assert.equal(
    agentChatActionCanConfirm({
      actionId: "action:external-calendar",
      operationIds: ["operation:calendar-write"],
      preview: "Create an external calendar event",
      riskLevel: "external",
      status: "awaiting_confirmation",
      title: "Write to external calendar",
    }),
    false,
  );
  assert.equal(
    agentChatActionCanConfirm({
      actionId: "action:internal-task",
      operationIds: ["operation:create-task"],
      preview: "Create an internal task",
      riskLevel: "write",
      status: "awaiting_confirmation",
      title: "Create task",
    }),
    true,
  );
});

test("chat action card exposes the shared action id and canonical Today and ledger paths", () => {
  const html = renderToStaticMarkup(
    <AgentActionStatusCard
      actionIds={["action:post-event:1"]}
      language="zh"
      navigate={() => undefined}
      runId="run:post-event:1"
    />,
  );

  assert.match(html, /data-agent-run-id="run:post-event:1"/);
  assert.match(html, /data-agent-action-id="action:post-event:1"/);
  assert.match(html, /本次 Agent 过程/);
  assert.match(html, /正在同步/);
  assert.match(html, /在 Today 查看/);
  assert.match(html, /全部安排/);
});

test("Agent chat persists run ids without rendering internal tracking UI", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL(
        "../../app/(app)/app/agent/orbit-real-agent.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /actionIds\?: readonly string\[\]/);
  assert.match(source, /runId\?: string/);
  assert.match(source, /payload\.data\.actionIds/);
  assert.match(source, /evidenceRefsFromArtifacts/);
  assert.doesNotMatch(source, /data-agent-evidence-sources/);
  assert.match(source, /showRunDetails={false}/);
  assert.doesNotMatch(source, /data-agent-run-details/);
});

test("Agent run cancellation uses user-facing request language", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL(
        "../../app/(app)/app/agent/agent-action-status-card.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /取消本次请求/);
  assert.match(source, /正在取消…/);
  assert.match(source, /Cancel this request/);
  assert.match(source, /Canceling…/);
  assert.doesNotMatch(source, /取消 Run|Cancel run/);
});

test("Agent run transition API exposes cancellation only, not a fake in-place retry", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL(
        "../../app/api/ai/runs/[id]/transition/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /body\?\.action !== "cancel"/);
  assert.match(source, /runtime\.cancelRun/);
  assert.doesNotMatch(source, /runtime\.retryRun/);
});


test("product action handoff shows review links without run diagnostics or visible ids", () => {
  const html = renderToStaticMarkup(
    <AgentActionStatusCard
      actionIds={["action:private-internal-id"]}
      language="zh"
      navigate={() => undefined}
      runId="run:private-internal-id"
      showRunDetails={false}
    />,
  );
  const visibleText = html.replace(/<[^>]*>/g, "");
  assert.match(visibleText, /本次安排/);
  assert.match(visibleText, /在 Today 查看/);
  assert.match(visibleText, /全部安排/);
  assert.doesNotMatch(visibleText, /private-internal-id|Agent 过程|Agent 进度|确认执行/);
  assert.doesNotMatch(html, /data-agent-run-step|data-agent-run-status/);
});
