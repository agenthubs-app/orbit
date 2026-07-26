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
  assert.equal(agentChatActionStatusLabel("awaiting_confirmation", "zh"), "等待确认");
  assert.equal(agentChatActionStatusLabel("completed", "en"), "Completed");
  assert.equal(agentChatActionStatusLabel("new-server-state", "zh"), "正在同步");
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
  assert.match(html, /全部操作/);
});

test("Agent chat keeps run and action ids in persisted assistant messages", async () => {
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
  assert.match(source, /data-agent-evidence-sources/);
  assert.match(source, /<AgentActionStatusCard/);
});
