import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import { createOrbitAgentArtifactPreviewService } from "../../features/orbit-ai/artifact-task-preview-service";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function occurrences(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function artifactMetadataValue(
  item: { metadata?: readonly { label: string; value: string }[] } | undefined,
  label: string,
): string {
  return item?.metadata?.find((entry) => entry.label === label)?.value ?? "";
}

function seededConversationCase(index: number) {
  const conversation = defaultMockFixtures.conversations[index];
  const contact = defaultMockFixtures.contacts.find(
    (item) => item.id === conversation?.participantContactIds[0],
  );
  const messages = defaultMockFixtures.messages.filter(
    (message) => message.conversationId === conversation?.id,
  );

  assert.ok(conversation);
  assert.ok(contact);
  assert.ok(messages.length > 1);

  return { contact, conversation, messages };
}

test("live artifact task service registers chat.context before preview fallback", () => {
  const liveArtifactSource = source("features/orbit-ai/live-artifact-task-service.ts");

  assert.match(
    liveArtifactSource,
    /createOrbitAgentChatContextArtifactService/,
  );
  assert.match(liveArtifactSource, /chatContextService/);
});

test("live Agent artifacts bind contact and Event reads to the server actor", () => {
  const liveArtifactSource = source("features/orbit-ai/live-artifact-task-service.ts");
  const conversationRouteSource = source("app/api/ai/conversations/route.ts");

  assert.match(
    liveArtifactSource,
    /createConfiguredActorScopedLiveRelationshipNaturalSearchService/,
  );
  assert.match(liveArtifactSource, /createEventsRecommendationTool\(\{ actorId \}\)/);
  assert.match(
    liveArtifactSource,
    /createOrbitAgentFollowupReviewArtifactService\(\{\s*actorId,/,
  );
  assert.match(
    liveArtifactSource,
    /createOrbitAgentChatContextArtifactService\(\{\s*actorId,/,
  );
  assert.match(
    conversationRouteSource,
    /createOrbitAgentConversationServiceForActor\(agentContext\.actorId\)/,
  );
});

test("chat.context uses actor-scoped contact evidence before any workspace-wide chat fallback", async () => {
  const calls: string[] = [];
  const serviceModule = await import(
    "../../features/orbit-ai/chat-context-artifact-service"
  );
  const service = serviceModule.createOrbitAgentChatContextArtifactService({
    actorId: "actor:test-account",
    chatService: {
      getMessageThread() {
        throw new Error("Actor-scoped contact context must not read global chat.");
      },
      listConversations() {
        throw new Error("Actor-scoped contact context must not read global chat.");
      },
    } as never,
    contactsService: {
      listContacts(input: { actorId?: string | null } = {}) {
        calls.push(`list:${input.actorId}`);

        return {
          success: true,
          data: {
            state: "success",
            query: "",
            appliedFilters: {
              query: "",
              sourceFilters: [],
              statusFilters: [],
              tagFilters: [],
              valueFilters: [],
            },
            availableFilters: {
              sources: [],
              statuses: [],
              tags: [],
              values: [],
            },
            contacts: [
              {
                id: "contact:lin-mei",
                displayName: "林玫",
                role: "投资合伙人",
                organization: "港湾创投",
                location: "东京",
                profileSnippet: "关注人工智能早期项目",
                relationshipContext: "双方已有多次有效交流。",
                lastInteractionAt: "2026-07-25T09:00:00.000Z",
                nextAction: "发送项目清单。",
                source: {
                  type: "event_import",
                  id: "source:event",
                  label: "东京人工智能合作伙伴交流会",
                  evidenceId: "evidence:lin-mei:1",
                },
                evidence: [],
                tags: [],
                value: {
                  score: 90,
                  valueTypes: ["venture_capital"],
                  rationale: "投资合作",
                  evidenceIds: ["evidence:lin-mei:1"],
                },
                status: "active",
                databaseQueryExecuted: true,
                searchIndexReadExecuted: false,
                externalNetworkRequested: false,
                aiProviderRequested: false,
                calendarProviderRequested: false,
                emailProviderRequested: false,
                notificationDelivered: false,
              },
            ],
            summary: "1 contact",
            provenance: {
              source: "test:contacts",
              sourceLabel: "Actor-scoped Contacts",
              evidenceIds: ["evidence:lin-mei:1"],
              collectedAt: "2026-07-28T00:00:00.000Z",
              privacy: "live-contacts-list-search-filter",
              generationMethod: "live-store-query",
              searchIndexReadExecuted: false,
              databaseQueryExecuted: true,
              externalNetworkRequested: false,
              deviceRequested: false,
              aiProviderRequested: false,
              calendarProviderRequested: false,
              emailProviderRequested: false,
              notificationDelivered: false,
            },
            nextAction: "Review contact.",
          },
        };
      },
      searchContacts() {
        throw new Error("The bounded list is sufficient for identity resolution.");
      },
    } as never,
    contactDetailService: {
      async getContactDetail(input: {
        actorId?: string | null;
        contactId: string;
      }) {
        calls.push(`detail:${input.actorId}:${input.contactId}`);

        return {
          success: true,
          data: {
            state: "success",
            contact: {
              id: "contact:lin-mei",
              displayName: "林玫",
              role: "投资合伙人",
              organization: "港湾创投",
              location: "东京",
              relationshipContext: "双方已有多次有效交流。",
              publicProfile: {
                bio: "关注人工智能早期项目",
                selfIntroduction: "",
                industry: "风险投资",
                offering: [],
                seeking: [],
                topics: [],
                conversationPrompts: [],
                source: {
                  type: "event_import",
                  id: "source:event",
                  label: "东京人工智能合作伙伴交流会",
                  evidenceId: "evidence:lin-mei:1",
                },
                evidenceIds: ["evidence:lin-mei:1"],
              },
              source: {
                type: "event_import",
                id: "source:event",
                label: "东京人工智能合作伙伴交流会",
                evidenceId: "evidence:lin-mei:1",
              },
              evidence: [
                {
                  evidenceId: "evidence:lin-mei:1",
                  source: {
                    type: "calendar_signal",
                    id: "source:calendar",
                    label: "Calendar signal",
                    evidenceId: "evidence:lin-mei:1",
                  },
                  field: "relationship_context",
                  excerpt: "电话复盘了三家人工智能项目。",
                  capturedAt: "2026-07-25T09:00:00.000Z",
                  createdBy: "mock-contact-detail-tag-status-service",
                },
              ],
              tags: [],
              status: "active",
              notes: [],
              lastInteraction: {
                interactionId: "interaction:lin-mei",
                channel: "calendar_signal",
                occurredAt: "2026-07-25T09:00:00.000Z",
                summary: "电话复盘了三家人工智能项目。",
                source: {
                  type: "calendar_signal",
                  id: "source:calendar",
                  label: "Calendar signal",
                  evidenceId: "evidence:lin-mei:1",
                },
                evidenceIds: ["evidence:lin-mei:1"],
                calendarProviderRequested: false,
                emailProviderRequested: false,
                notificationDelivered: false,
                externalNetworkRequested: false,
                productionAuditLogWriteExecuted: false,
              },
              nextAction: "发送项目清单。",
              updatedAt: "2026-07-25T09:00:00.000Z",
              tagWriteExecuted: false,
              statusWriteExecuted: false,
              noteWriteExecuted: false,
              productionAuditLogWriteExecuted: false,
              databaseReadExecuted: true,
              databaseWriteExecuted: false,
              externalNetworkRequested: false,
              deviceRequested: false,
              aiProviderRequested: false,
              calendarProviderRequested: false,
              emailProviderRequested: false,
              notificationDelivered: false,
            },
            editableTagOptions: [],
            editableStatusOptions: [],
            summary: "Loaded.",
            provenance: {
              source: "test:contacts",
              sourceLabel: "Actor-scoped Contacts",
              evidenceIds: ["evidence:lin-mei:1"],
              collectedAt: "2026-07-28T00:00:00.000Z",
              privacy: "demo-contact-detail-tag-status-only",
              generationMethod: "live-store-query",
              databaseReadExecuted: true,
              databaseWriteExecuted: false,
              productionAuditLogWriteExecuted: false,
              externalNetworkRequested: false,
              deviceRequested: false,
              aiProviderRequested: false,
              calendarProviderRequested: false,
              emailProviderRequested: false,
              notificationDelivered: false,
            },
            nextAction: "Review.",
          },
        };
      },
    } as never,
  });

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: "总结林玫的关系和互动证据。ID: contact:lin-mei",
    toolArguments: { contactId: "contact:lin-mei" },
  });
  const generated = JSON.stringify(result);

  assert.equal(result.success, true);
  assert.deepEqual(calls, [
    "list:actor:test-account",
    "detail:actor:test-account:contact:lin-mei",
  ]);
  assert.match(generated, /电话复盘了三家人工智能项目/);
  assert.match(generated, /发送项目清单/);
  assert.match(generated, /互动证据/);
  assert.doesNotMatch(generated, /没有关系会话达到/);
  assert.deepEqual(result.data?.result.provenance.sourceModules, [
    "orbit-ai",
    "contacts",
  ]);
});

test("chat.context artifact reads source-backed live chat conversations", async () => {
  const workspaceId = "workspace:orbit-ai-chat-context-live-artifact-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  const chatService = createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Orbit AI chat context memory live storage",
      store,
      workspaceId,
    }),
  });
  const serviceModule = await import(
    "../../features/orbit-ai/chat-context-artifact-service"
  );
  const service = serviceModule.createOrbitAgentChatContextArtifactService({
    chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
  });
  const seeded = seededConversationCase(0);

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: `帮我整理${seeded.contact.displayName}的回复上下文`,
    toolArguments: {
      conversationId: seeded.conversation.id,
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.kind, "relationship_chat_context");
  assert.equal(result.data?.task.artifactProducer, "relationship_chat_review_producer");
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, true);
  assert.equal(result.data?.result.safety.liveDatabaseWriteExecuted, false);
  assert.deepEqual(result.data?.result.provenance.sourceModules, [
    "orbit-ai",
    "chat",
  ]);
  assert.equal(
    result.data?.result.provenance.toolCalls[0]?.toolName,
    "chat.context",
  );
  assert.equal(
    result.data?.result.provenance.toolCalls[0]?.status,
    "completed",
  );
  assert.doesNotMatch(
    result.data?.result.provenance.source ?? "",
    /artifact-task-preview-service/,
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.evidenceIds.includes(
      seeded.messages[0]?.evidenceIds[0] ?? "",
    ),
    true,
  );
  assert.match(
    result.data?.result.generatedView?.summary ?? "",
    new RegExp(
      [seeded.contact.displayName, seeded.conversation.id]
        .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|"),
    ),
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]
      ?.requiresConfirmation,
    true,
  );
});

test("chat.context resolves seeded follow-up requests before rendering the side-panel artifact", async () => {
  const workspaceId = "workspace:orbit-ai-chat-context-followup-resolution-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const generatorCalls: {
    relationship: { organization: string; participantName: string };
    resolution: { score: number; state: string };
    selectedConversation: { conversationId: string };
  }[] = [];

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  const chatService = createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Orbit AI follow-up resolution live storage",
      store,
      workspaceId,
    }),
  });
  const serviceModule = await import(
    "../../features/orbit-ai/chat-context-artifact-service"
  );
  const service = (
    serviceModule.createOrbitAgentChatContextArtifactService as unknown as (input: {
      chatService: typeof chatService;
      fallbackService: ReturnType<typeof createOrbitAgentArtifactPreviewService>;
      followupContextGenerator: {
        generate: (input: {
          relationship: { organization: string; participantName: string };
          resolution: { score: number; state: string };
          selectedConversation: { conversationId: string };
        }) => {
          confidenceLabel: string;
          privacyNote: string;
          recommendedFollowup: string;
          relationshipContext: string;
          summary: string;
        };
      };
    }) => ReturnType<typeof serviceModule.createOrbitAgentChatContextArtifactService>
  )({
    chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
    followupContextGenerator: {
      generate(input) {
        generatorCalls.push(input);

        return {
          confidenceLabel: "generated follow-up context",
          privacyNote: "Source-backed context only.",
          recommendedFollowup:
            "Generated next step: review the Aoba Technologies evidence before any send.",
          relationshipContext:
            "Generated context: Aoba Technologies is the resolved seeded relationship.",
          summary: `generated-followup:${input.selectedConversation.conversationId}:${input.relationship.organization}`,
        };
      },
    },
  });
  const seeded = seededConversationCase(1);

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "en",
    query: `Summarize my relationship context with ${seeded.contact.displayName} at ${seeded.contact.organization}.`,
    toolArguments: {
      contactName: seeded.contact.displayName,
      conversationId: "missing-seeded-followup-conversation",
    },
  });
  const resultText = JSON.stringify(result);

  assert.equal(result.success, true);
  assert.equal(result.data?.task.conversationId, seeded.conversation.id);
  assert.equal(result.data?.result.status, "ready");
  assert.equal(generatorCalls.length, 1);
  assert.equal(
    generatorCalls[0]?.selectedConversation.conversationId,
    seeded.conversation.id,
  );
  assert.equal(
    generatorCalls[0]?.relationship.organization,
    seeded.contact.organization,
  );
  assert.ok((generatorCalls[0]?.resolution.score ?? 0) >= 0.7);
  assert.match(
    result.data?.result.generatedView?.summary ?? "",
    new RegExp(
      `generated-followup:${seeded.conversation.id}:${seeded.contact.organization}`.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      ),
    ),
  );
  assert.doesNotMatch(
    resultText,
    /No mock chat conversation fixture matches that conversation id/,
  );
});

test("chat.context default generator renders a seeded contact as a participant-facing relationship brief", async () => {
  const workspaceId = "workspace:orbit-ai-chat-context-aoba-brief-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  const chatService = createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Orbit AI Aoba relationship brief live storage",
      store,
      workspaceId,
    }),
  });
  const serviceModule = await import(
    "../../features/orbit-ai/chat-context-artifact-service"
  );
  const service = serviceModule.createOrbitAgentChatContextArtifactService({
    chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
  });
  const seeded = seededConversationCase(1);

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: `总结和${seeded.contact.displayName}在${seeded.contact.organization}的关系上下文`,
    toolArguments: {
      contactName: seeded.contact.displayName,
      conversationId: "missing-seeded-followup-conversation",
    },
  });
  assert.equal(result.success, true);

  if (result.success !== true) {
    throw new Error("Expected Aoba relationship context artifact to resolve.");
  }

  const generatedView = result.data.result.generatedView;
  const summary = generatedView?.summary ?? "";
  const sourceBody = generatedView?.sections[0]?.body ?? "";
  const relationshipItem = generatedView?.sections[0]?.items[0];
  const recentMessageItems = generatedView?.sections[1]?.items ?? [];
  const recentMessageActionLabels = recentMessageItems.map(
    (item) => item.actions[0]?.label ?? "",
  );
  const generatedText = JSON.stringify(generatedView);

  assert.equal(result.data.task.conversationId, seeded.conversation.id);
  assert.equal(result.data.result.status, "ready");
  assert.ok(Number(artifactMetadataValue(relationshipItem, "匹配分")) >= 0.7);
  assert.equal(artifactMetadataValue(relationshipItem, "来源"), "来自已保存的关系聊天");
  assert.match(
    artifactMetadataValue(relationshipItem, "技术来源"),
    /Orbit AI Aoba relationship brief live storage/,
  );
  assert.match(sourceBody, /来自已保存的关系聊天/);
  assert.doesNotMatch(sourceBody, /live storage|Postgres|Orbit AI Aoba/i);
  assert.match(summary, new RegExp(seeded.contact.displayName));
  assert.match(summary, new RegExp(seeded.contact.organization ?? ""));
  assert.match(summary, /为什么认识|关系/);
  assert.match(summary, /关系来源：2026年\d{1,2}月\d{1,2}日首条保存聊天：/);
  assert.match(summary, /最新上下文|最近/);
  assert.match(summary, /确认/);
  assert.match(summary, /不会发送|不会创建日程/);
  assert.match(
    relationshipItem?.body ?? "",
    new RegExp(seeded.contact.displayName),
  );
  assert.match(
    relationshipItem?.body ?? "",
    /2026年\d{1,2}月\d{1,2}日首条保存聊天/,
  );
  assert.match(relationshipItem?.subtitle ?? "", /确认/);
  assert.match(generatedText, /互动|需求|跟进|确认/u);
  assert.doesNotMatch(
    generatedText,
    /needs_follow_up|direct relationship match|scored relationship match|由直接关系匹配生成|由关系匹配分生成/,
  );
  assert.doesNotMatch(generatedText, /Orbit operator|2026-06-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(occurrences(generatedText, /为什么认识/g), 1);
  assert.equal(occurrences(generatedText, /最新上下文/g), 1);
  assert.deepEqual(
    relationshipItem?.actions.map((action) => action.label),
    ["确认并生成跟进建议", "暂不继续", "复核关系上下文"],
  );
  assert.equal(
    new Set(recentMessageActionLabels).size,
    recentMessageActionLabels.length,
  );
  assert.equal(recentMessageActionLabels.includes("复核上下文"), false);
  assert.match(
    recentMessageActionLabels[0] ?? "",
    /复核 \d{1,2}月\d{1,2}日/,
  );
  assert.doesNotMatch(
    summary,
    /conversation_(?:seed_)?\d+|message_\d+|生成跟进上下文消息/,
  );
  assert.doesNotMatch(
    generatedText,
    /Review source evidence before recording another live-storage message|Follow up about .* concrete next step/,
  );
});

test("default Orbit Agent API resolves Aoba relationship context for product deep links", async () => {
  const previousAgentMode = process.env.ORBIT_AGENT_CONVERSATION_MODE;
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;

  try {
    delete process.env.ORBIT_AGENT_CONVERSATION_MODE;
    delete process.env.ORBIT_MODULE_MODE;

    const route = await import("../../app/api/ai/conversations/route");
    const response = await route.POST(
      new Request("https://orbit.local/api/ai/conversations", {
        body: JSON.stringify({
          locale: "zh",
          message: "总结和Aoba的关系上下文",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const envelope = (await response.json()) as {
      data?: {
        artifacts?: readonly {
          result: {
            generatedView?: {
              sections?: readonly {
                items?: readonly {
                  actions?: readonly { label?: string }[];
                }[];
              }[];
              summary?: string;
            };
            nextAction?: string;
            status: string;
          };
          task: { conversationId?: string | null; kind: string };
        }[];
        proposedToolIntents?: readonly { toolFamily?: string }[];
      };
      success?: boolean;
    };
    const artifact = envelope.data?.artifacts?.[0];
    const artifactText = JSON.stringify(artifact);

    assert.equal(response.status, 200);
    assert.equal(envelope.success, true);
    assert.equal(artifact?.task.kind, "relationship_chat_context");
    assert.equal(artifact?.task.conversationId, "conversation_010");
    assert.equal(artifact?.result.status, "ready");
    assert.equal(envelope.data?.proposedToolIntents?.[0]?.toolFamily, "relationship_chat");
    assert.match(artifact?.result.generatedView?.summary ?? "", /胡家明/);
    assert.match(artifact?.result.generatedView?.summary ?? "", /Aoba Technologies/);
    assert.match(artifact?.result.generatedView?.summary ?? "", /6月24日|首条保存聊天/);
    assert.match(artifact?.result.nextAction ?? "", /复核聊天证据/);
    const actionLabels =
      artifact?.result.generatedView?.sections?.[1]?.items?.map(
        (item) => item.actions?.[0]?.label ?? "",
      ) ?? [];
    assert.equal(new Set(actionLabels).size, actionLabels.length);
    assert.equal(actionLabels.includes("复核上下文"), false);
    assert.match(actionLabels[0] ?? "", /复核 6月24日.*AI pilot/);
    assert.match(actionLabels[3] ?? "", /复核 6月29日.*排期冲突/);
    assert.doesNotMatch(
      artifactText,
      /No mock chat conversation fixture matches that conversation id/,
    );
  } finally {
    if (previousAgentMode === undefined) {
      delete process.env.ORBIT_AGENT_CONVERSATION_MODE;
    } else {
      process.env.ORBIT_AGENT_CONVERSATION_MODE = previousAgentMode;
    }

    if (previousModuleMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousModuleMode;
    }
  }
});

test("/app/agent product route keeps technical provenance secondary and prevents overflow", () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(agentSource, /data-orbit-agent-screen-title/);
  assert.match(agentSource, /<h1/);
  assert.match(agentSource, /<AccountTopNav active="agent"/);
  assert.doesNotMatch(agentSource, /function AgentTopNav/);
  assert.match(agentSource, /function AgentEvidenceSources/);
  assert.match(agentSource, /data-agent-evidence-sources/);
  assert.match(agentSource, /<details/);
  assert.match(agentSource, /overflowWrap:\s*"anywhere"/);
  assert.match(agentSource, /minWidth:\s*0/);
  // 结果面板保持固定产品宽度；聊天历史侧栏独立夹取并可拖拽。
  assert.match(agentSource, /width:\s*444/);
  assert.match(agentSource, /HISTORY_SIDEBAR_MAX_WIDTH/);
  assert.match(agentSource, /cursor: "col-resize"/);
  assert.match(agentSource, /<AgentOutcomeFeedback/);
  assert.match(agentSource, /<AgentActionStatusCard/);
  assert.match(agentSource, /evidenceRefsFromArtifacts/);
  assert.match(pageSource, /data-orbit-route="app-agent-route"/);
});
