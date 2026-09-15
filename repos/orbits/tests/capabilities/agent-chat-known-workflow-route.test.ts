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
import { createConfiguredMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";
import { createContactsAnalysisSourceDataVersion } from "../../features/mobile/contacts-analysis-report-provider";
import { createOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import type { StoredAiSessionOriginContract } from "../../shared/contract/ai-sessions";

function verificationFor(origin: StoredAiSessionOriginContract | undefined) {
  return origin && "verification" in origin ? origin.verification : undefined;
}

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

test("protocol v2 conversation POST replays one persisted result for the same request id", async () => {
  const delegate = createMockOrbitAgentConversationService();
  let sendCalls = 0;
  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: {
      ...delegate,
      sendMessage(input) {
        sendCalls += 1;
        return delegate.sendMessage(input);
      },
    },
    success: true as const,
  }));
  const route = await import("../../app/api/ai/conversations/route");
  const requestBody = {
    clientMessageId: "message:route-v2:client",
    expectedMessageRevision: 0,
    locale: "zh",
    message: "普通可靠会话",
    protocolVersion: 2,
    references: [],
    requestId: "request:route-v2",
    sessionId: "session:route-v2",
  };

  const send = () =>
    route.POST(
      new Request("https://orbit.local/api/ai/conversations", {
        body: JSON.stringify(requestBody),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
  const first = await send();
  const firstEnvelope = await first.json();
  const replay = await send();
  const replayEnvelope = await replay.json();

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(firstEnvelope.success, true);
  assert.equal(firstEnvelope.data.reliableSend.state, "completed");
  assert.equal(firstEnvelope.data.reliableSend.replayed, false);
  assert.equal(replayEnvelope.data.reliableSend.state, "completed");
  assert.equal(replayEnvelope.data.reliableSend.replayed, true);
  assert.equal(replayEnvelope.data.reliableSend.requestId, requestBody.requestId);
  assert.deepEqual(replayEnvelope.data.messages, firstEnvelope.data.messages);
  assert.equal(sendCalls, 1);

  const conflict = await route.POST(
    new Request("https://orbit.local/api/ai/conversations", {
      body: JSON.stringify({ ...requestBody, message: "同 ID 换内容" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const conflictEnvelope = await conflict.json();
  assert.equal(conflict.status, 409);
  assert.equal(conflictEnvelope.error.code, "CONFLICT");
  assert.equal(sendCalls, 1);
});

test("contacts analysis send verifies current actor data and records only a server-trusted execution", async () => {
  const delegate = createMockOrbitAgentConversationService();
  const sentMessages: string[] = [];
  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: {
      ...delegate,
      sendMessage(input) {
        sentMessages.push(input.message ?? "");
        return delegate.sendMessage(input);
      },
    },
    success: true as const,
  }));
  const dashboard = await createConfiguredMobileContactsDashboardService("mock").getDashboard({ actorId: "mock:anonymous" });
  assert.equal(dashboard.success, true);
  if (!dashboard.success) return;
  const sourceDataVersion = createContactsAnalysisSourceDataVersion({
    aggregate: dashboard.data.aggregate,
    contacts: dashboard.data.contacts,
    distributions: dashboard.data.distributions,
    gaps: dashboard.data.gaps,
    opportunities: dashboard.data.opportunities,
    profile: dashboard.data.profile,
    summary: dashboard.data.summary,
  });
  const route = await import("../../app/api/ai/conversations/route");
  const body = {
    clientMessageId: "message:analysis-route:client",
    expectedMessageRevision: 0,
    locale: "zh",
    message: "请重点分析需要恢复联系的人",
    origin: {
      entryClient: "web",
      entryPointId: "contacts.analysis",
      initialGroupId: null,
      kind: "structured",
      sourceDataVersion,
      template: { id: "contacts.analysis", version: 1 },
    },
    protocolVersion: 2,
    references: [],
    requestId: "request:analysis-route",
    sessionId: "session:analysis-route",
  };
  const post = (value: unknown) => route.POST(new Request("https://orbit.local/api/ai/conversations", {
    body: JSON.stringify(value), headers: { "content-type": "application/json" }, method: "POST",
  }));

  const stale = await post({ ...body, origin: { ...body.origin, sourceDataVersion: "f".repeat(64) } });
  assert.equal(stale.status, 409);
  assert.equal(sentMessages.length, 0);

  const acceptedBody = {
    ...body,
    clientMessageId: "message:analysis-route:accepted",
    requestId: "request:analysis-route:accepted",
    sessionId: "session:analysis-route:accepted",
  };
  const accepted = await post(acceptedBody);
  assert.equal(accepted.status, 200);
  assert.match(sentMessages[0] ?? "", /^Execute the registered contacts\.analysis@1 task/u);
  assert.match(sentMessages[0] ?? "", /请重点分析需要恢复联系的人/u);
  const stored = await createOrbitAgentChatSessionProvider("mock", "mock:anonymous")?.getSession(acceptedBody.sessionId);
  assert.deepEqual(verificationFor(stored?.origin), {
    analysisVersion: "contacts.analysis@1",
    kind: "contacts_analysis_execution",
    sourceDataVersion,
  });
});

test("protocol v2 conversation POST authorizes contact references before planner execution", async () => {
  const delegate = createMockOrbitAgentConversationService();
  let sendCalls = 0;
  mock.method(orbitAgentConversationServiceFactory, "create", () => ({
    mode: "mock" as const,
    service: {
      ...delegate,
      sendMessage(input) {
        sendCalls += 1;
        return delegate.sendMessage(input);
      },
    },
    success: true as const,
  }));
  const route = await import("../../app/api/ai/conversations/route");
  const body = {
    clientMessageId: "message:route-reference:client",
    expectedMessageRevision: 0,
    locale: "zh",
    message: "为联系人准备一封可编辑草稿",
    protocolVersion: 2,
    references: [{ id: "demo-contact-1", type: "contact" }],
    requestId: "request:route-reference",
    sessionId: "session:route-reference",
  };
  const send = (requestBody: unknown) => route.POST(new Request("https://orbit.local/api/ai/conversations", {
    body: JSON.stringify(requestBody),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));

  const allowed = await send(body);
  assert.equal(allowed.status, 200);
  assert.equal(sendCalls, 1);

  const rejected = await send({
    ...body,
    clientMessageId: "message:route-reference-denied:client",
    references: [{ id: "contact:not-accessible", type: "contact" }],
    requestId: "request:route-reference-denied",
    sessionId: "session:route-reference-denied",
  });
  const rejectedEnvelope = await rejected.json();
  assert.equal(rejected.status, 403);
  assert.equal(rejectedEnvelope.error.code, "FORBIDDEN");
  assert.doesNotMatch(rejectedEnvelope.error.message, /contact:not-accessible/u);
  assert.equal(sendCalls, 1);
});

test("ordinary conversation responses use a fresh progress run and never inherit older actions", async () => {
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
  assert.match(envelope.data?.runId ?? "", /^run:conversation:/);
  assert.notEqual(envelope.data?.runId, "run:historical");
  assert.equal(envelope.data?.actionIds, undefined);
});
