import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createOrbitAgentArtifactPreviewService } from "../../features/orbit-ai/artifact-task-preview-service";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
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

// Sprint 0104: the legacy chat store is retired. Without an actor and without an
// injected thread source, chat.context must not reach for a workspace-wide chat read.
test("chat.context without an actor or thread source falls back instead of reading the retired chat store", async () => {
  const previous = { mode: process.env.ORBIT_MODULE_MODE, feature: process.env.ORBIT_FEATURE_MODE };
  process.env.ORBIT_MODULE_MODE = "live";
  process.env.ORBIT_FEATURE_MODE = "live";
  try {
    const serviceModule = await import(
      "../../features/orbit-ai/chat-context-artifact-service"
    );
    const fallbackCalls: string[] = [];
    const preview = createOrbitAgentArtifactPreviewService();
    const service = serviceModule.createOrbitAgentChatContextArtifactService({
      fallbackService: {
        createArtifactTask(request) {
          fallbackCalls.push(request.kind);
          return preview.createArtifactTask(request);
        },
        getArtifactTask: (request) => preview.getArtifactTask(request),
      },
    });
    const result = await service.createArtifactTask({
      kind: "relationship_chat_context",
      locale: "zh",
      query: "帮我整理山田千寻的回复上下文",
    });

    assert.deepEqual(fallbackCalls, ["relationship_chat_context"]);
    assert.equal(result.success, true);
    assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, false);
  } finally {
    if (previous.mode === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previous.mode;
    if (previous.feature === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previous.feature;
  }
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

test("/app/agent keeps technical provenance out of the user conversation", () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除。对话面今天分三个文件：
  // 壳（作用域 / 顶栏 / 视觉隐藏 h1）、对话屏（回合 JSX）、富组件（结果 .panel）。
  const shellSource = source("app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx");
  const chatSource = source("app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx");
  const richSource = source(
    "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
  );
  const agentSource = [shellSource, chatSource, richSource].join("\n");

  assert.match(shellSource, /data-orbit-agent-screen-title/);
  assert.match(shellSource, /<h1/);
  // R07: the page no longer mounts a top bar; Orbit2026Shell (layout) provides nav and
  // highlights iOrbit for /app/agent.
  assert.doesNotMatch(shellSource, /AccountTopNav|OrbitTopNav/);
  assert.match(
    source("app/(app)/app/orbit-2026/shell/shell-routes.ts"),
    /matches\(path, "\/app\/agent"\)\) return "iorbit"/,
  );
  assert.doesNotMatch(agentSource, /function AgentTopNav/);
  assert.doesNotMatch(agentSource, /function AgentEvidenceSources/);
  assert.doesNotMatch(agentSource, /data-agent-evidence-sources/);
  // 工作台改版后固定 444px 的结果侧栏没有了，结果改为内联 .panel 渲染
  // （AgentPeopleRow / AgentEventRow / AgentTodoRow）。这里改盯这个容器，
  // 保证结果仍有专属承载区。
  assert.match(richSource, /className="panel-body"/);
  // 任务 4：常驻历史侧栏与拖拽宽度是本计划唯一的能力移除（设计 786–804 无侧栏），
  // 因此这里改断它**不会**回流，而不是断 resize 常量还在。
  assert.doesNotMatch(agentSource, /HISTORY_SIDEBAR_MAX_WIDTH/);
  assert.doesNotMatch(agentSource, /cursor: "col-resize"/);
  assert.doesNotMatch(agentSource, /<AgentOutcomeFeedback/);
  assert.match(chatSource, /showRunDetails={false}/);
  assert.doesNotMatch(agentSource, /data-agent-run-details/);
  // iOrbit 任务 1b：artifact→证据的纯函数搬到 `iorbit-0918/iorbit-model.ts`。
  assert.match(
    source("app/(app)/app/agent/iorbit-0918/iorbit-model.ts"),
    /evidenceRefsFromArtifacts/,
  );
  assert.match(pageSource, /data-orbit-route="app-agent-route"/);
});
