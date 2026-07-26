import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  orbitAgentConversationServiceFactory,
} from "../../features/orbit-ai/service-factory";
import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";
import {
  createOrbitAgentRuntimeService,
  resetOrbitAgentRuntimeServicesForTests,
} from "../../features/agent/runtime/service-factory";

afterEach(() => {
  mock.restoreAll();
});

test("conversation POST routes a known workflow before planner sendMessage", async () => {
  const delegate = createMockOrbitAgentConversationService();
  let listCalls = 0;
  let sendCalls = 0;

  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: {
      ...delegate,
      listConversations(input) {
        listCalls += 1;
        return delegate.listConversations(input);
      },
      sendMessage(input) {
        sendCalls += 1;
        return delegate.sendMessage(input);
      },
    },
    success: true as const,
  }));

  const route = await import("../../app/api/ai/conversations/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/ai/conversations", {
      body: JSON.stringify({
        locale: "zh",
        message:
          "请创建会后跟进。联系人：Kenji Watanabe。活动：Climate founders dinner。会面内容：Kenji 希望下周继续讨论储能试点，我答应发送合作案例。",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const envelope = (await response.json()) as {
    data?: {
      actionIds?: readonly string[];
      activeConversationId?: string | null;
      runId?: string;
    };
    success?: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(envelope.success, true);
  assert.equal(listCalls, 1);
  assert.equal(sendCalls, 0);
  assert.equal(
    envelope.data?.activeConversationId,
    "demo-orbit-agent-conversation-1",
  );
  assert.ok(envelope.data?.runId);
  assert.equal(envelope.data?.actionIds?.length, 4);
});

test("conversation POST calls planner sendMessage exactly once for ordinary requests", async () => {
  const delegate = createMockOrbitAgentConversationService();
  let listCalls = 0;
  let sendCalls = 0;

  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: {
      ...delegate,
      listConversations(input) {
        listCalls += 1;
        return delegate.listConversations(input);
      },
      sendMessage(input) {
        sendCalls += 1;
        return delegate.sendMessage(input);
      },
    },
    success: true as const,
  }));

  const route = await import("../../app/api/ai/conversations/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/ai/conversations", {
      body: JSON.stringify({
        locale: "zh",
        message: "帮我推荐下周适合见 Maya 的活动",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const envelope = (await response.json()) as { success?: boolean };

  assert.equal(response.status, 200);
  assert.equal(envelope.success, true);
  assert.equal(listCalls, 0);
  assert.equal(sendCalls, 1);
});

test("ordinary conversation responses never inherit an older run link", async () => {
  resetOrbitAgentRuntimeServicesForTests();
  const runtime = createOrbitAgentRuntimeService("mock");
  await runtime.createRun({
    conversationId: "demo-orbit-agent-conversation-1",
    runId: "run:historical",
    trigger: "chat",
    workflowKey: "post_event_capture_v1",
  });
  await runtime.proposeAction({
    actionId: "action:historical",
    compensation: { supported: false },
    conversationId: "demo-orbit-agent-conversation-1",
    evidenceChips: [],
    evidenceIds: ["evidence:historical"],
    operations: [],
    payloadVersion: 1,
    preview: "Historical action must not appear on this turn.",
    riskLevel: "write",
    runId: "run:historical",
    sourceRefs: [],
    title: "Historical action",
    whyNow: "Historical request",
    workflowKey: "post_event_capture_v1",
    workflowVersion: 1,
  });

  const delegate = createMockOrbitAgentConversationService();
  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: delegate,
    success: true as const,
  }));
  const route = await import("../../app/api/ai/conversations/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/ai/conversations", {
      body: JSON.stringify({
        conversationId: "demo-orbit-agent-conversation-1",
        locale: "zh",
        message: "普通对话，不创建任何动作",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const envelope = (await response.json()) as {
    data?: { actionIds?: readonly string[]; runId?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(envelope.data?.runId, undefined);
  assert.equal(envelope.data?.actionIds, undefined);
});
