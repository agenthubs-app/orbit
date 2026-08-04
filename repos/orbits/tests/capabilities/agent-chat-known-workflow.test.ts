import assert from "node:assert/strict";
import test from "node:test";

import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createMemoryAgentRuntimeRepository } from "../../features/agent/runtime/repository";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import {
  createChatKnownWorkflowOrchestrator,
  type ChatKnownWorkflowContextReader,
} from "../../features/orbit-ai/chat-known-workflow";
import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";

function runtimeHarness() {
  return createAgentRuntimeService({
    executors: createAgentExecutorRegistry([]),
    now: () => "2026-07-26T00:00:00.000Z",
    repository: createMemoryAgentRuntimeRepository(),
  });
}

function contextReader(input: {
  eventMatchesContact?: boolean;
  events?: readonly {
    endsAt: string;
    evidenceIds: readonly string[];
    id: string;
    status: string;
    title: string;
  }[];
} = {}): ChatKnownWorkflowContextReader {
  return {
    async listContacts() {
      return [
        {
          displayName: "Kenji Watanabe",
          evidenceIds: ["evidence:contact:kenji"],
          id: "contact:kenji-watanabe",
          lastInteractionAt: "2026-07-20T09:00:00.000Z",
          nextAction: "Send the pilot examples.",
          organization: "Aster Grid",
          relationshipContext: "Discussed a storage pilot.",
        },
      ];
    },
    async listEvents() {
      return (
        input.events ?? [
          {
            endsAt: "2026-07-25T12:00:00.000Z",
            evidenceIds: ["evidence:event:climate-dinner"],
            id: "demo-event-1",
            status: "confirmed",
            title: "Climate founders dinner",
          },
        ]
      );
    },
    async eventHasContact() {
      return input.eventMatchesContact ?? false;
    },
  };
}

async function conversationResult(message: string) {
  return createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message,
  });
}

test("chat asks for missing confirmed meeting content and creates no action", async () => {
  const runtime = runtimeHarness();
  const message =
    "请创建会后跟进。联系人：Kenji Watanabe。活动：Climate founders dinner。";
  const response = await createChatKnownWorkflowOrchestrator({
    contextReader: contextReader(),
    legacyDeterministicPostEventFollowupEnabled: true,
    now: () => "2026-07-26T00:00:00.000Z",
    runtime,
  }).handle({
    conversationInput: { locale: "zh", message },
    conversationResult: await conversationResult(message),
  });

  assert.equal(response.outcome, "clarification");
  assert.equal((await runtime.listActions({})).length, 0);
  assert.equal(response.result.success, true);
  if (response.result.success) {
    assert.match(response.result.data.assistantMessage, /会面内容/);
    assert.deepEqual(response.result.data.actionIds, []);
  }
});

test("explicit verified chat command starts the known post-event workflow in the active conversation", async () => {
  const runtime = runtimeHarness();
  const message =
    "请创建会后跟进。联系人：Kenji Watanabe。活动：Climate founders dinner。会面内容：Kenji 希望下周继续讨论储能试点，我答应发送合作案例。";
  const response = await createChatKnownWorkflowOrchestrator({
    contextReader: contextReader(),
    legacyDeterministicPostEventFollowupEnabled: true,
    now: () => "2026-07-26T00:00:00.000Z",
    runtime,
  }).handle({
    conversationInput: { locale: "zh", message },
    conversationResult: await conversationResult(message),
  });

  assert.equal(response.outcome, "started");
  assert.equal(response.result.success, true);
  const actions = await runtime.listActions({});
  assert.equal(actions.length, 4);
  assert.ok(
    actions.every(
      (action) =>
        action.conversationId === "demo-orbit-agent-conversation-1" &&
        action.workflowKey === "post_event_followup_v1",
    ),
  );
  assert.ok(
    actions.some(
      (action) =>
        action.operations[0]?.payload.noteText ===
        "Kenji 希望下周继续讨论储能试点，我答应发送合作案例。",
    ),
  );
  if (response.result.success) {
    assert.equal(response.result.data.runId, actions[0].runId);
    assert.deepEqual(
      new Set(response.result.data.actionIds),
      new Set(actions.map((action) => action.actionId)),
    );
  }
});

test("live-default chat boundary does not trigger the deterministic post-event workflow", async () => {
  const runtime = runtimeHarness();
  const message =
    "请创建会后跟进。联系人：Kenji Watanabe。活动：Climate founders dinner。会面内容：Kenji 希望下周继续讨论储能试点，我答应发送合作案例。";
  const response = await createChatKnownWorkflowOrchestrator({
    contextReader: contextReader(),
    now: () => "2026-07-26T00:00:00.000Z",
    runtime,
  }).handle({
    conversationInput: { locale: "zh", message },
    conversationResult: await conversationResult(message),
  });

  assert.equal(response.outcome, "not_applicable");
  assert.equal((await runtime.listActions({})).length, 0);
});

test("chat can infer one event from authoritative attendee context", async () => {
  const runtime = runtimeHarness();
  const message =
    "请创建会后跟进。联系人：Kenji Watanabe。会面内容：我们确认了下周三继续评审储能试点方案。";
  const response = await createChatKnownWorkflowOrchestrator({
    contextReader: contextReader({ eventMatchesContact: true }),
    legacyDeterministicPostEventFollowupEnabled: true,
    now: () => "2026-07-26T00:00:00.000Z",
    runtime,
  }).handle({
    conversationInput: { locale: "zh", message },
    conversationResult: await conversationResult(message),
  });

  assert.equal(response.outcome, "started");
  assert.equal((await runtime.listActions({})).length, 4);
});

test("ambiguous authoritative events cause clarification without writes", async () => {
  const runtime = runtimeHarness();
  const message =
    "请创建会后跟进。联系人：Kenji Watanabe。会面内容：我们确认了下周三继续评审储能试点方案。";
  const response = await createChatKnownWorkflowOrchestrator({
    contextReader: contextReader({
      eventMatchesContact: true,
      events: [
        {
          endsAt: "2026-07-24T12:00:00.000Z",
          evidenceIds: ["evidence:event:one"],
          id: "event:one",
          status: "confirmed",
          title: "Climate dinner one",
        },
        {
          endsAt: "2026-07-25T12:00:00.000Z",
          evidenceIds: ["evidence:event:two"],
          id: "event:two",
          status: "confirmed",
          title: "Climate dinner two",
        },
      ],
    }),
    legacyDeterministicPostEventFollowupEnabled: true,
    now: () => "2026-07-26T00:00:00.000Z",
    runtime,
  }).handle({
    conversationInput: { locale: "zh", message },
    conversationResult: await conversationResult(message),
  });

  assert.equal(response.outcome, "clarification");
  assert.equal((await runtime.listActions({})).length, 0);
  if (response.result.success) {
    assert.match(response.result.data.assistantMessage, /多个活动/);
  }
});
