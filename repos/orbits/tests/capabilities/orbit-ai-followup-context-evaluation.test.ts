import assert from "node:assert/strict";
import test from "node:test";

import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import type {
  ChatConversationMessageService,
  ChatConversationListResult,
  ChatMessageThreadResult,
} from "../../features/chat/service";
import { createOrbitAgentArtifactPreviewService } from "../../features/orbit-ai/artifact-task-preview-service";
import { createOrbitAgentChatContextArtifactService } from "../../features/orbit-ai/chat-context-artifact-service";
import { createLiveOrbitAgentConversationService } from "../../features/orbit-ai/live-conversation-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const ACCEPTED_CONTEXT_SCORE = 0.7;

type FollowupGeneratorCall = {
  locale: "en" | "zh";
  messages: readonly { body: string; messageId: string }[];
  privacy: {
    includedMessageCount: number;
    mode: "full" | "limited";
  };
  query: string;
  relationship: {
    contactId: string;
    organization: string;
    participantName: string;
    relationshipStage: string;
  };
  resolution: {
    matchedBy: string;
    score: number;
    state: "ambiguous" | "missing" | "resolved";
  };
  selectedConversation: {
    conversationId: string;
    participantContactId: string;
    participantName: string;
  };
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });
}

async function seededChatService() {
  const workspaceId = `workspace:orbit-ai-followup-context-${Date.now()}-${Math.random()}`;
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  return createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Orbit AI follow-up context evaluation storage",
      store,
      workspaceId,
    }),
  });
}

function createGeneratedContextSpy() {
  const calls: FollowupGeneratorCall[] = [];

  return {
    calls,
    generator: {
      generate(input: FollowupGeneratorCall) {
        calls.push(input);

        return {
          confidenceLabel: `generated-score:${input.resolution.score.toFixed(2)}`,
          privacyNote:
            input.privacy.mode === "limited"
              ? "Generated from privacy-limited relationship context only."
              : "Generated from source-backed relationship context.",
          recommendedFollowup: `Generated next step for ${input.relationship.participantName}: review ${input.messages.length} source messages before any send.`,
          relationshipContext: `Generated relationship context for ${input.relationship.participantName} at ${input.relationship.organization} via ${input.resolution.matchedBy}.`,
          summary: `generated-boundary:${input.relationship.participantName}:${input.selectedConversation.conversationId}:${input.messages.length}:${input.privacy.mode}`,
        };
      },
    },
  };
}

function metadataValue(
  item: { metadata?: readonly { label: string; value: string }[] } | undefined,
  label: string,
) {
  return item?.metadata?.find((entry) => entry.label === label)?.value ?? "";
}

function resolutionScore(
  item: { metadata?: readonly { label: string; value: string }[] } | undefined,
) {
  return Number(metadataValue(item, "Resolution score") || metadataValue(item, "匹配分"));
}

async function runContextCase(input: {
  chatService: ChatConversationMessageService;
  locale?: "en" | "zh";
  query: string;
  toolArguments?: Record<string, unknown>;
}) {
  const spy = createGeneratedContextSpy();
  const service = (createOrbitAgentChatContextArtifactService as unknown as (config: {
    chatService: ChatConversationMessageService;
    fallbackService: ReturnType<typeof createOrbitAgentArtifactPreviewService>;
    followupContextGenerator: typeof spy.generator;
  }) => ReturnType<typeof createOrbitAgentChatContextArtifactService>)({
    chatService: input.chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
    followupContextGenerator: spy.generator,
  });

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: input.locale ?? "en",
    query: input.query,
    toolArguments: input.toolArguments,
  });

  return { result, spy };
}

function ambiguousConversationService(): ChatConversationMessageService {
  const source = {
    collectedAt: "2026-07-01T00:00:00.000Z",
    generatedBy: "live-store-query" as const,
    id: "source:ambiguous-followup-context",
    label: "Ambiguous follow-up context fixture",
    providerRecordId: "source:ambiguous-followup-context",
    type: "chat_summary" as const,
  };
  const flags = {
    aiProviderRequested: false as const,
    calendarProviderRequested: false as const,
    deviceRequested: false as const,
    emailProviderRequested: false as const,
    externalNetworkRequested: false as const,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: false,
    notificationDelivered: false as const,
    productionMessageStorageRequested: false as const,
    realtimeTransportRequested: false as const,
    websocketSubscriptionRequested: false as const,
  };
  const conversations = ["conversation_alex_a", "conversation_alex_b"].map(
    (conversationId, index) => ({
      ...flags,
      conversationId,
      evidenceIds: [`evidence:${conversationId}`],
      lastMessageAt: `2026-06-2${index}T13:00:00+09:00`,
      lastMessagePreview: "Follow up with Alex after the event.",
      oneToOneContext: {
        contactId: `contact_alex_${index}`,
        evidenceIds: [`evidence:${conversationId}`],
        latestContext: "Two people named Alex match this follow-up request.",
        organization: index === 0 ? "Aoba Ventures" : "Aoba Studio",
        participantName: "Alex Chen",
        recommendedFollowup: "Ask which Alex before drafting.",
        relationshipReason: "Ambiguous relationship identity.",
        relationshipStage: "reviewing",
        source,
      },
      organization: index === 0 ? "Aoba Ventures" : "Aoba Studio",
      participantContactId: `contact_alex_${index}`,
      participantName: "Alex Chen",
      source,
      status: "active" as const,
      title: "Alex Chen conversation",
      unreadCount: 0,
    }),
  );

  return {
    getMessageThread(): ChatMessageThreadResult {
      throw new Error("Ambiguous context should not read a thread before clarification.");
    },
    listConversations(): ChatConversationListResult {
      return {
        data: {
          conversations,
          nextAction: "Ask for a disambiguating person or organization.",
          provenance: {
            ...flags,
            collectedAt: "2026-07-01T00:00:00.000Z",
            evidenceIds: conversations.flatMap((item) => item.evidenceIds),
            generationMethod: "live-store-query",
            privacy: "live-chat-conversation-preview",
            source: "test:ambiguous-followup-context",
            sourceLabel: "Ambiguous follow-up context fixture",
          },
          state: "success",
          summary: "Two Alex conversations match.",
        },
        success: true,
      };
    },
    sendMessage() {
      throw new Error("Follow-up context evaluation must not send chat messages.");
    },
  };
}

test("ten named follow-up context evaluation cases enforce resolution score before ready UI", async () => {
  const seeded = await seededChatService();
  const cases = [
    {
      expectedConversationId: "conversation_001",
      expectedStatus: "ready",
      name: "direct match",
      query: "Summarize 山田千寻 follow-up context.",
      toolArguments: { conversationId: "conversation_001" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      name: "missing conversation",
      query: "总结和 Aoba Technologies 的关系上下文",
      toolArguments: {
        contactName: "Aoba Technologies",
        conversationId: "demo-orbit-agent-conversation-1",
      },
    },
    {
      expectedConversationId: null,
      expectedStatus: "pending",
      name: "ambiguous person",
      query: "Summarize Alex follow-up context.",
      service: ambiguousConversationService(),
      toolArguments: { contactName: "Alex" },
    },
    {
      expectedConversationId: "conversation_007",
      expectedStatus: "ready",
      name: "stale relationship",
      query: "Review the stale relationship with 曾伟 before I follow up.",
      toolArguments: { contactName: "曾伟" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      name: "recent event",
      query: "Use recent event context for Aoba Technologies before follow-up.",
      toolArguments: { organization: "Aoba Technologies" },
    },
    {
      expectedConversationId: "conversation_007",
      expectedStatus: "ready",
      name: "pending reply",
      query: "Who is pending a reply: 曾伟 from Kansai Community?",
      toolArguments: { contactName: "曾伟", relationshipStage: "needs_follow_up" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      locale: "zh" as const,
      name: "Chinese-language request",
      query: "总结和 Aoba Technologies 的关系上下文",
      toolArguments: { organization: "Aoba Technologies" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      name: "English-language request",
      query: "Summarize my relationship context with Aoba Technologies.",
      toolArguments: { organization: "Aoba Technologies" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      name: "schedule conflict",
      query: "Before scheduling, check the Aoba Technologies relationship context for conflict risk.",
      toolArguments: { organization: "Aoba Technologies", scheduleState: "conflict" },
    },
    {
      expectedConversationId: "conversation_010",
      expectedStatus: "ready",
      name: "privacy-limited context",
      query: "Use privacy-limited context for Aoba Technologies.",
      toolArguments: { organization: "Aoba Technologies", privacyLimit: true },
    },
  ] as const;

  assert.deepEqual(cases.map((item) => item.name), [
    "direct match",
    "missing conversation",
    "ambiguous person",
    "stale relationship",
    "recent event",
    "pending reply",
    "Chinese-language request",
    "English-language request",
    "schedule conflict",
    "privacy-limited context",
  ]);

  for (const evaluationCase of cases) {
    const { result, spy } = await runContextCase({
      chatService: evaluationCase.service ?? seeded,
      locale: evaluationCase.locale,
      query: evaluationCase.query,
      toolArguments: evaluationCase.toolArguments,
    });
    const resultText = JSON.stringify(result);
    const item = result.data?.result.generatedView?.sections[0]?.items[0];
    const score = resolutionScore(item);

    assert.equal(result.success, true, evaluationCase.name);
    assert.equal(result.data?.result.status, evaluationCase.expectedStatus, evaluationCase.name);
    assert.equal(
      result.data?.task.conversationId,
      evaluationCase.expectedConversationId,
      evaluationCase.name,
    );
    assert.doesNotMatch(
      resultText,
      /No mock chat conversation fixture matches that conversation id/,
      evaluationCase.name,
    );

    if (evaluationCase.expectedStatus === "ready") {
      assert.ok(
        score >= ACCEPTED_CONTEXT_SCORE,
        `${evaluationCase.name} score ${score} must be >= ${ACCEPTED_CONTEXT_SCORE}`,
      );
      assert.equal(spy.calls.length, 1, evaluationCase.name);
      assert.match(
        result.data?.result.generatedView?.summary ?? "",
        /^generated-boundary:/,
        evaluationCase.name,
      );
    } else {
      assert.ok(
        score >= ACCEPTED_CONTEXT_SCORE,
        `${evaluationCase.name} keeps a high-scoring ambiguous match pending instead of marking the UI ready`,
      );
      assert.equal(spy.calls.length, 0, evaluationCase.name);
    }
  }
});

test("mixed Chinese and Latin Aoba query resolves from identity terms without tool arguments", async () => {
  const { result, spy } = await runContextCase({
    chatService: await seededChatService(),
    locale: "zh",
    query: "总结和Aoba的关系上下文",
  });
  const item = result.data?.result.generatedView?.sections[0]?.items[0];

  assert.equal(result.success, true);
  assert.equal(result.data?.result.status, "ready");
  assert.equal(result.data?.task.conversationId, "conversation_010");
  assert.equal(resolutionScore(item), 0.86);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0]?.relationship.participantName, "胡家明");
  assert.equal(spy.calls[0]?.relationship.organization, "Aoba Technologies");
  assert.equal(spy.calls[0]?.resolution.matchedBy, "query_terms");
  assert.doesNotMatch(
    JSON.stringify(result),
    /No mock chat conversation fixture matches that conversation id/,
  );
});

test("live Orbit Agent uses generated follow-up context instead of canned planner final text", async () => {
  const chatService = await seededChatService();
  const spy = createGeneratedContextSpy();
  const requests: unknown[] = [];
  const artifactTaskService = (createOrbitAgentChatContextArtifactService as unknown as (config: {
    chatService: ChatConversationMessageService;
    fallbackService: ReturnType<typeof createOrbitAgentArtifactPreviewService>;
    followupContextGenerator: typeof spy.generator;
  }) => ReturnType<typeof createOrbitAgentChatContextArtifactService>)({
    chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
    followupContextGenerator: spy.generator,
  });
  const service = createLiveOrbitAgentConversationService({
    apiKey: "test-gemini-key",
    artifactTaskService,
    fetchImplementation: (async (_url, init) => {
      requests.push(init);

      return jsonResponse({
        steps: [
          {
            content: [
              {
                text: JSON.stringify({
                  assistantMessage:
                    "CANNED_PLANNER_FINAL_TEXT should not be reused as the follow-up context artifact.",
                  intent: "relationship_chat_context",
                  toolRequests: [
                    {
                      arguments: {
                        contactName: "Aoba Technologies",
                        conversationId: "missing-seeded-followup-conversation",
                      },
                      requiresUserConfirmation: true,
                      toolName: "chat.context",
                    },
                  ],
                }),
                type: "text",
              },
            ],
            type: "model_output",
          },
        ],
      });
    }) as typeof fetch,
    maxLoopSteps: 2,
    model: "gemini-test-model",
  });

  const result = await service.sendMessage({
    locale: "en",
    message: "Summarize my relationship context with Aoba Technologies.",
  });
  const artifact = result.data?.artifacts[0];
  const artifactText = JSON.stringify(artifact);

  assert.equal(result.success, true);
  assert.equal(requests.length, 1);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0]?.selectedConversation.conversationId, "conversation_010");
  assert.equal(spy.calls[0]?.relationship.organization, "Aoba Technologies");
  assert.equal(spy.calls[0]?.messages.length, 5);
  assert.equal(artifact?.task.conversationId, "conversation_010");
  assert.match(artifact?.result.generatedView?.summary ?? "", /^generated-boundary:/);
  assert.doesNotMatch(artifactText, /CANNED_PLANNER_FINAL_TEXT/);
  assert.doesNotMatch(
    artifactText,
    /No mock chat conversation fixture matches that conversation id/,
  );
});
