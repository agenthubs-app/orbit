import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import { createOrbitAgentArtifactPreviewService } from "../../features/orbit-ai/artifact-task-preview-service";
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

test("live artifact task service registers chat.context before preview fallback", () => {
  const liveArtifactSource = source("features/orbit-ai/live-artifact-task-service.ts");

  assert.match(
    liveArtifactSource,
    /createOrbitAgentChatContextArtifactService/,
  );
  assert.match(liveArtifactSource, /chatContextService/);
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

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: "帮我整理山田千寻的回复上下文",
    toolArguments: {
      conversationId: "conversation_001",
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
      "evidence:message:0001",
    ),
    true,
  );
  assert.match(
    result.data?.result.generatedView?.summary ?? "",
    /山田 千尋|conversation_001/,
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

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "en",
    query: "Summarize my relationship context with Aoba Technologies.",
    toolArguments: {
      contactName: "Aoba",
      conversationId: "missing-seeded-followup-conversation",
    },
  });
  const resultText = JSON.stringify(result);

  assert.equal(result.success, true);
  assert.equal(result.data?.task.conversationId, "conversation_010");
  assert.equal(result.data?.result.status, "ready");
  assert.equal(generatorCalls.length, 1);
  assert.equal(generatorCalls[0]?.selectedConversation.conversationId, "conversation_010");
  assert.equal(generatorCalls[0]?.relationship.organization, "Aoba Technologies");
  assert.ok((generatorCalls[0]?.resolution.score ?? 0) >= 0.7);
  assert.match(
    result.data?.result.generatedView?.summary ?? "",
    /generated-followup:conversation_010:Aoba Technologies/,
  );
  assert.doesNotMatch(
    resultText,
    /No mock chat conversation fixture matches that conversation id/,
  );
});

test("chat.context default generator renders Aoba as a participant-facing relationship brief", async () => {
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

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: "总结和 Aoba Technologies 的关系上下文",
    toolArguments: {
      contactName: "Aoba",
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

  assert.equal(result.data.task.conversationId, "conversation_010");
  assert.equal(result.data.result.status, "ready");
  assert.equal(artifactMetadataValue(relationshipItem, "匹配分"), "0.86");
  assert.equal(artifactMetadataValue(relationshipItem, "来源"), "来自已保存的关系聊天");
  assert.match(
    artifactMetadataValue(relationshipItem, "技术来源"),
    /Orbit AI Aoba relationship brief live storage/,
  );
  assert.match(sourceBody, /来自已保存的关系聊天/);
  assert.doesNotMatch(sourceBody, /live storage|Postgres|Orbit AI Aoba/i);
  assert.match(summary, /胡家明/);
  assert.match(summary, /Aoba Technologies/);
  assert.match(summary, /为什么认识|关系/);
  assert.match(summary, /关系来源：2026年6月\d{1,2}日首条保存聊天：/);
  assert.match(summary, /最新上下文|最近/);
  assert.match(summary, /确认/);
  assert.match(summary, /不会发送|不会创建日程/);
  assert.match(relationshipItem?.body ?? "", /胡家明/);
  assert.match(relationshipItem?.body ?? "", /2026年6月\d{1,2}日首条保存聊天/);
  assert.match(relationshipItem?.subtitle ?? "", /确认/);
  assert.match(generatedText, /活动后|pilot 时间线|周三下午/);
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
  assert.match(recentMessageActionLabels[0] ?? "", /复核 6月\d{1,2}日/);
  assert.doesNotMatch(summary, /conversation_010|message_0046|生成跟进上下文消息/);
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
  assert.match(agentSource, /aria-label=\{t\(\{ en: "Back to Orbit home", zh: "返回 Orbit 首页" \}\)\}/);
  assert.match(agentSource, /href=\{preserveHref\("\/"\)\}/);
  assert.match(agentSource, /返回 Orbit 首页/);
  assert.doesNotMatch(agentSource, /AccountTopNav/);
  assert.match(agentSource, /function AgentTopNav/);
  assert.match(agentSource, /className="orbit-brand-link/);
  assert.match(agentSource, /<Logo size=\{25\}/);
  assert.doesNotMatch(agentSource, /return panel\.sourceLabel \?\?/);
  assert.match(agentSource, /<details/);
  assert.doesNotMatch(agentSource, /intent\.toolFamily \? <div className="mono"/);
  assert.match(agentSource, /overflowWrap:\s*"anywhere"/);
  assert.match(agentSource, /wordBreak:\s*"break-word"/);
  // 结果面板宽度可拖拽调整，但仍由 maxWidth 夹取以防溢出。
  assert.match(agentSource, /width: panelWidth/);
  assert.match(agentSource, /maxWidth:\s*"min\(80vw, 760px\)"/);
  assert.match(agentSource, /cursor: "col-resize"/);
  assert.match(agentSource, /item\.actions\.length > 0/);
  assert.match(agentSource, /data-orbit-agent-artifact-action/);
  assert.match(agentSource, /primaryItems/);
  assert.match(agentSource, /secondaryItems/);
  assert.match(agentSource, /历史证据/);
  assert.doesNotMatch(agentSource, /flatMap\(\(section\) => section\.items\)\.slice\(0, 4\)/);
  assert.match(pageSource, /data-orbit-route="app-agent-route"/);
});
