import {
  ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS,
  ORBIT_AGENT_ARTIFACT_KINDS,
  type OrbitAgentArtifactErrorCode,
  type OrbitAgentArtifactFailure,
  type OrbitAgentArtifactGeneratedView,
  type OrbitAgentArtifactKind,
  type OrbitAgentArtifactLookupInput,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactPresentation,
  type OrbitAgentArtifactProvenance,
  type OrbitAgentArtifactResult,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactScenario,
  type OrbitAgentArtifactSourceModule,
  type OrbitAgentArtifactStatus,
  type OrbitAgentArtifactProducer,
  type OrbitAgentArtifactSuccess,
  type OrbitAgentArtifactTask,
  type OrbitAgentArtifactTaskRequest,
  type OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE =
  "fixture:features/orbit-ai/mock-artifact-task-service.ts" as const;

const fixtureNow = "2026-06-27T00:02:00.000Z";
const fixtureReadyAt = "2026-06-27T00:02:01.000Z";
const defaultConversationId = "demo-orbit-agent-conversation-1";
const defaultArtifactId = "artifact:event-recommendations:demo";
const defaultTaskId = "task:event-recommendations:demo";

// mock artifact service 模拟“artifact producer 生成可复核 artifact”的过程。
// 它不会调用真实工具、数据库或外部服务，只根据 kind/query 生成稳定 fixture payload。
const supportedKinds = new Set<string>(ORBIT_AGENT_ARTIFACT_KINDS);
const supportedScenarios = new Set<OrbitAgentArtifactScenario>([
  "ready",
  "pending",
  "failure",
]);
type ArtifactLocale = "en" | "zh";

const safety = {
  actionsRequireConfirmation: true,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  domainWritesExecuted: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  externalSideEffectsExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  notificationDelivered: false,
} as const;

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 返回前 clone，避免调用方修改共享 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function readText(value: unknown): string | null {
  // 所有文本入口统一 trim；空字符串按缺失处理。
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): ArtifactLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(
  locale: ArtifactLocale,
  copy: Record<ArtifactLocale, string>,
): string {
  return copy[locale];
}

function normalizeScenario(
  scenario?: OrbitAgentArtifactTaskRequest["scenario"],
): OrbitAgentArtifactScenario {
  if (scenario && supportedScenarios.has(scenario as OrbitAgentArtifactScenario)) {
    return scenario as OrbitAgentArtifactScenario;
  }

  return "ready";
}

function normalizeKind(kind: unknown): OrbitAgentArtifactKind | null {
  // kind 必须来自 artifact contract 白名单，避免模型/调用方发明新 artifact 类型。
  if (typeof kind === "string" && supportedKinds.has(kind)) {
    return kind as OrbitAgentArtifactKind;
  }

  return null;
}

function slugFor(kind: OrbitAgentArtifactKind): string {
  return kind.replace(/_/g, "-");
}

function artifactIdFor(kind: OrbitAgentArtifactKind): string {
  return `artifact:${slugFor(kind)}:demo`;
}

function taskIdFor(kind: OrbitAgentArtifactKind): string {
  return `task:${slugFor(kind)}:demo`;
}

function defaultArtifactProducerFor(
  kind: OrbitAgentArtifactKind,
): OrbitAgentArtifactProducer {
  // kind 到 artifact producer 的映射是 UI trace 和 artifact 面板解释执行链的基础。
  switch (kind) {
    case "event_recommendations":
      return "event_recommendation_producer";
    case "contact_recommendations":
      return "contact_recommendation_producer";
    case "followup_queue":
      return "followup_review_producer";
    case "relationship_chat_context":
    case "email_context":
    case "generic":
    default:
      return "relationship_chat_review_producer";
  }
}

function sourceModulesFor(
  kind: OrbitAgentArtifactKind,
): readonly OrbitAgentArtifactSourceModule[] {
  // sourceModules 告诉 UI 这个 artifact 概念上来自哪些 Orbit 模块。
  switch (kind) {
    case "event_recommendations":
      return ["orbit-ai", "events"];
    case "contact_recommendations":
      return ["orbit-ai", "contacts"];
    case "followup_queue":
      return ["orbit-ai", "followups"];
    case "relationship_chat_context":
      return ["orbit-ai", "chat"];
    case "email_context":
      return ["orbit-ai", "chat", "contacts"];
    case "generic":
    default:
      return ["orbit-ai"];
  }
}

function labelFor(kind: OrbitAgentArtifactKind, locale: ArtifactLocale): string {
  const labels: Record<
    OrbitAgentArtifactKind,
    Record<ArtifactLocale, string>
  > = {
    contact_recommendations: {
      en: "Recommended contacts",
      zh: "推荐人脉",
    },
    email_context: {
      en: "Relevant email context",
      zh: "相关邮件上下文",
    },
    event_recommendations: {
      en: "Recommended events",
      zh: "推荐活动",
    },
    followup_queue: {
      en: "Follow-up queue",
      zh: "跟进队列",
    },
    generic: {
      en: "Agent artifact",
      zh: "Agent 结果",
    },
    relationship_chat_context: {
      en: "Relationship chat context",
      zh: "关系聊天上下文",
    },
  };

  return localize(locale, labels[kind]);
}

function presentationFor(
  kind: OrbitAgentArtifactKind,
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  // 每类 artifact 有默认展示面；调用方可以覆盖标题/宽度等 presentation 字段。
  const defaults: Record<OrbitAgentArtifactKind, OrbitAgentArtifactPresentation> = {
    contact_recommendations: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Generated by the contact recommendation artifact producer mock",
        zh: "由人脉推荐 artifact producer mock 生成",
      }),
      title: labelFor("contact_recommendations", locale),
      widthHint: "half",
    },
    email_context: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Generated by the relationship chat review artifact producer mock",
        zh: "由关系聊天复核 artifact producer mock 生成",
      }),
      title: labelFor("email_context", locale),
      widthHint: "half",
    },
    event_recommendations: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Generated by the event recommendation artifact producer mock",
        zh: "由活动推荐 artifact producer mock 生成",
      }),
      title: labelFor("event_recommendations", locale),
      widthHint: "half",
    },
    followup_queue: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Generated by the follow-up review artifact producer mock",
        zh: "由跟进复核 artifact producer mock 生成",
      }),
      title: labelFor("followup_queue", locale),
      widthHint: "half",
    },
    generic: {
      preferredSurface: "inline_card",
      subtitle: localize(locale, {
        en: "Generated by the generic artifact producer mock",
        zh: "由通用 artifact producer mock 生成",
      }),
      title: labelFor("generic", locale),
    },
    relationship_chat_context: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Generated by the relationship chat review artifact producer mock",
        zh: "由关系聊天复核 artifact producer mock 生成",
      }),
      title: labelFor("relationship_chat_context", locale),
      widthHint: "half",
    },
  };

  return {
    ...defaults[kind],
    ...presentation,
    title: presentation?.title?.trim() || defaults[kind].title,
  };
}

function evidenceIdsFor(kind: OrbitAgentArtifactKind): readonly string[] {
  return [`evidence:orbit-agent:${slugFor(kind)}:fixture`];
}

function toolNameFor(kind: OrbitAgentArtifactKind): string {
  switch (kind) {
    case "event_recommendations":
      return "events.recommend";
    case "contact_recommendations":
      return "contacts.recommend";
    case "followup_queue":
      return "followups.reviewQueue";
    case "relationship_chat_context":
      return "chat.context";
    case "email_context":
      return "chat.reviewEmailContext";
    case "generic":
    default:
      return "orbitAi.renderGenericArtifact";
  }
}

function toolTraceFor(
  kind: OrbitAgentArtifactKind,
  status: "completed" | "planned" | "failed",
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  // tool trace 只记录 mock artifact producer 的计划/完成状态，不表示真实外部工具被调用。
  return [
    {
      evidenceIds: evidenceIdsFor(kind),
      reason:
        status === "planned"
          ? localize(locale, {
              en: "The artifact producer task is registered but the mock has not produced a generated view yet.",
              zh: "Artifact producer 任务已注册，但 mock 尚未生成可展示结果。",
            })
          : localize(locale, {
              en: "The mock artifact producer produced a traceable generated view without calling live providers.",
              zh: "Mock artifact producer 已生成可追踪结果，未调用 live provider。",
            }),
      status,
      toolCallId: `toolcall:${slugFor(kind)}:demo`,
      toolName: toolNameFor(kind),
    },
  ];
}

function provenanceFor(
  kind: OrbitAgentArtifactKind,
  status: OrbitAgentArtifactStatus,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: evidenceIdsFor(kind),
    generatedAt: status === "pending" ? fixtureNow : fixtureReadyAt,
    generationMethod:
      status === "ready" ? "artifact-producer-generated-view" : "rule-based-artifact-task",
    source: ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE,
    sourceModules: sourceModulesFor(kind),
    toolCalls: toolTraceFor(
      kind,
      status === "ready" ? "completed" : status === "failed" ? "failed" : "planned",
      locale,
    ),
  };
}

function generatedViewFor(
  kind: OrbitAgentArtifactKind,
  query: string,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  // generatedView 是给前端渲染的 pretty artifact；每个 action 都保留 confirmation 要求。
  switch (kind) {
    case "event_recommendations":
      return {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "event:review-founder-roundtable",
                    label: localize(locale, {
                      en: "Review event",
                      zh: "查看活动",
                    }),
                    requiresConfirmation: true,
                  },
                ],
                body: localize(locale, {
                  en: "Small-format founder discussion with a high likelihood of useful introductions.",
                  zh: "小范围创始人讨论，很可能带来有价值的引荐。",
                }),
                confidenceLabel: localize(locale, {
                  en: "High confidence",
                  zh: "高匹配度",
                }),
                evidenceIds: evidenceIdsFor(kind),
                id: "event-founder-roundtable",
                metadata: [
                  {
                    label: localize(locale, { en: "When", zh: "时间" }),
                    value: localize(locale, { en: "Next Thursday", zh: "下周四" }),
                  },
                  {
                    label: localize(locale, { en: "Fit", zh: "匹配点" }),
                    value: localize(locale, {
                      en: "Founder and investor network",
                      zh: "创始人和投资人网络",
                    }),
                  },
                ],
                reason: localize(locale, {
                  en: `Matches the request: ${query}`,
                  zh: `匹配这条请求：${query}`,
                }),
                subtitle: localize(locale, { en: "Tokyo", zh: "东京" }),
                title: localize(locale, {
                  en: "Founder relationship roundtable",
                  zh: "创始人关系圆桌",
                }),
              },
            ],
            title: labelFor("event_recommendations", locale),
          },
        ],
        summary: localize(locale, {
          en: "The event recommendation artifact producer found one high-fit event and prepared a side-panel view.",
          zh: "活动推荐生成器找到一个高匹配活动，并准备了侧边栏结果。",
        }),
      };
    case "contact_recommendations":
      return {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "contact:open-maya-chen",
                    label: localize(locale, {
                      en: "Review contact",
                      zh: "查看人脉",
                    }),
                    requiresConfirmation: true,
                  },
                ],
                body: localize(locale, {
                  en: "Strong overlap with the climate pilot and recent product partnership discussions.",
                  zh: "与 climate pilot 和最近的产品合作讨论有较强交集。",
                }),
                confidenceLabel: localize(locale, {
                  en: "Medium confidence",
                  zh: "中等置信度",
                }),
                evidenceIds: evidenceIdsFor(kind),
                id: "contact-maya-chen",
                metadata: [
                  { label: "Orbit", value: "1" },
                  {
                    label: localize(locale, {
                      en: "Last touch",
                      zh: "最近联系",
                    }),
                    value: localize(locale, {
                      en: "2 weeks ago",
                      zh: "2 周前",
                    }),
                  },
                ],
                reason: localize(locale, {
                  en: `Relevant to the user request: ${query}`,
                  zh: `与这条请求相关：${query}`,
                }),
                subtitle: localize(locale, {
                  en: "Product partnerships",
                  zh: "产品合作",
                }),
                title: "Maya Chen",
              },
            ],
            title: labelFor("contact_recommendations", locale),
          },
        ],
        summary: localize(locale, {
          en: "The contact recommendation artifact producer selected one relationship to review before any outreach.",
          zh: "人脉推荐生成器选择了一个关系，在任何外联前供你复核。",
        }),
      };
    case "followup_queue":
      return {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "followup:review-maya",
                    label: localize(locale, {
                      en: "Review follow-up",
                      zh: "查看跟进",
                    }),
                    requiresConfirmation: true,
                  },
                ],
                body: localize(locale, {
                  en: "Draft a short check-in that references the product partnership thread.",
                  zh: "起草一条简短 check-in，引用产品合作线索。",
                }),
                confidenceLabel: localize(locale, {
                  en: "Ready to review",
                  zh: "待复核",
                }),
                evidenceIds: evidenceIdsFor(kind),
                id: "followup-maya-checkin",
                metadata: [
                  {
                    label: localize(locale, { en: "Due", zh: "到期" }),
                    value: localize(locale, { en: "Today", zh: "今天" }),
                  },
                  {
                    label: localize(locale, { en: "Priority", zh: "优先级" }),
                    value: localize(locale, { en: "High", zh: "高" }),
                  },
                ],
                reason: localize(locale, {
                  en: `Follow-up is aligned with: ${query}`,
                  zh: `跟进事项匹配：${query}`,
                }),
                subtitle: "Maya Chen",
                title: localize(locale, {
                  en: "Partnership check-in",
                  zh: "合作 check-in",
                }),
              },
            ],
            title: localize(locale, {
              en: "Suggested follow-ups",
              zh: "建议跟进",
            }),
          },
        ],
        summary: localize(locale, {
          en: "The follow-up artifact producer prepared a review queue item without sending a message.",
          zh: "跟进生成器准备了一个待复核队列项，未发送任何消息。",
        }),
      };
    case "relationship_chat_context":
      return {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "chat:review-context-maya",
                    label: localize(locale, {
                      en: "Review context",
                      zh: "查看上下文",
                    }),
                    requiresConfirmation: true,
                  },
                ],
                body: localize(locale, {
                  en: "Recent thread suggests a concise reply with one specific next step.",
                  zh: "最近线索适合简短回复，并给出一个明确下一步。",
                }),
                confidenceLabel: localize(locale, {
                  en: "Context available",
                  zh: "可用上下文",
                }),
                evidenceIds: evidenceIdsFor(kind),
                id: "chat-context-maya",
                metadata: [
                  {
                    label: localize(locale, { en: "Thread", zh: "线索" }),
                    value: localize(locale, {
                      en: "Partnership planning",
                      zh: "合作规划",
                    }),
                  },
                  {
                    label: localize(locale, { en: "Tone", zh: "语气" }),
                    value: localize(locale, {
                      en: "Warm and direct",
                      zh: "温暖直接",
                    }),
                  },
                ],
                reason: localize(locale, {
                  en: `Useful for answering: ${query}`,
                  zh: `可帮助回复：${query}`,
                }),
                subtitle: localize(locale, {
                  en: "Relationship chat",
                  zh: "关系聊天",
                }),
                title: localize(locale, {
                  en: "Reply context",
                  zh: "回复上下文",
                }),
              },
            ],
            title: localize(locale, {
              en: "Conversation context",
              zh: "对话上下文",
            }),
          },
        ],
        summary: localize(locale, {
          en: "The relationship chat artifact producer prepared context for a reply, with no message sent.",
          zh: "关系聊天生成器准备了回复上下文，未发送任何消息。",
        }),
      };
    case "email_context":
      return {
        sections: [
          {
            items: [
              {
                actions: [
                  {
                    actionId: "email:review-context-maya",
                    label: localize(locale, {
                      en: "Review email",
                      zh: "查看邮件",
                    }),
                    requiresConfirmation: true,
                  },
                ],
                body: localize(locale, {
                  en: "The latest email asks for timing and a single owner for the next discussion.",
                  zh: "最近一封邮件询问下一次讨论的时间和负责人。",
                }),
                confidenceLabel: localize(locale, {
                  en: "Relevant",
                  zh: "相关",
                }),
                evidenceIds: evidenceIdsFor(kind),
                id: "email-context-maya",
                metadata: [
                  {
                    label: localize(locale, { en: "Source", zh: "来源" }),
                    value: localize(locale, {
                      en: "Mock email summary",
                      zh: "Mock 邮件摘要",
                    }),
                  },
                  {
                    label: localize(locale, { en: "Age", zh: "时间" }),
                    value: localize(locale, { en: "3 days", zh: "3 天前" }),
                  },
                ],
                reason: localize(locale, {
                  en: `Email context supports: ${query}`,
                  zh: `邮件上下文支持：${query}`,
                }),
                subtitle: localize(locale, {
                  en: "Email context",
                  zh: "邮件上下文",
                }),
                title: localize(locale, {
                  en: "Recent planning email",
                  zh: "最近的规划邮件",
                }),
              },
            ],
            title: localize(locale, {
              en: "Relevant emails",
              zh: "相关邮件",
            }),
          },
        ],
        summary: localize(locale, {
          en: "The relationship chat artifact producer summarized relevant email context for side-panel review.",
          zh: "关系聊天生成器汇总了相关邮件上下文，供侧边栏复核。",
        }),
      };
    case "generic":
    default:
      return {
        sections: [
          {
            items: [],
            title: localize(locale, {
              en: "No domain artifact selected",
              zh: "未选择领域结果",
            }),
          },
        ],
        summary: localize(locale, {
          en: `The generic artifact mock captured the request: ${query}`,
          zh: `通用 artifact mock 记录了请求：${query}`,
        }),
      };
  }
}

function taskFor(input: {
  conversationId?: string | null;
  kind: OrbitAgentArtifactKind;
  presentation: OrbitAgentArtifactPresentation;
  query: string;
  status: OrbitAgentArtifactStatus;
  artifactProducer?: OrbitAgentArtifactProducer;
}): OrbitAgentArtifactTask {
  return {
    artifactId: artifactIdFor(input.kind),
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: fixtureNow,
    kind: input.kind,
    presentation: input.presentation,
    query: input.query,
    status: input.status,
    artifactProducer: input.artifactProducer ?? defaultArtifactProducerFor(input.kind),
    taskId: taskIdFor(input.kind),
    updatedAt: input.status === "pending" ? fixtureNow : fixtureReadyAt,
  };
}

function resultFor(
  task: OrbitAgentArtifactTask,
  status: OrbitAgentArtifactStatus,
  locale: ArtifactLocale,
): OrbitAgentArtifactResult {
  // pending artifact 不产生 generatedView，只给 UI loading/nextAction 状态。
  return {
    artifactId: task.artifactId,
    generatedView:
      status === "ready" ? generatedViewFor(task.kind, task.query, locale) : null,
    kind: task.kind,
    nextAction:
      status === "ready"
        ? localize(locale, {
            en: "Render the generated artifact and require user confirmation before executing any action.",
            zh: "渲染生成结果；执行任何动作前必须等待用户确认。",
          })
        : localize(locale, {
            en: "Keep the artifact surface in a loading state; do not execute tools or external actions.",
            zh: "保持结果区域为加载状态；不要执行工具或外部动作。",
          }),
    presentation: task.presentation,
    provenance: provenanceFor(task.kind, status, locale),
    safety,
    status,
    taskId: task.taskId,
  };
}

function success(payload: OrbitAgentArtifactPayload): OrbitAgentArtifactSuccess {
  return {
    data: clonePayload(payload),
    success: true,
  };
}

function failure(
  code: OrbitAgentArtifactErrorCode,
  input?: { artifactId?: string; taskId?: string },
): OrbitAgentArtifactFailure {
  const definition = ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS[code];

  return {
    error: {
      ...definition,
      artifactId: input?.artifactId,
      evidenceIds: ["evidence:orbit-agent:artifact-controlled-failure"],
      state: "failure",
      taskId: input?.taskId,
    },
    success: false,
  };
}

function payloadFor(input: {
  conversationId?: string | null;
  kind: OrbitAgentArtifactKind;
  locale?: string | null;
  presentation?: Partial<OrbitAgentArtifactPresentation>;
  query: string;
  status: OrbitAgentArtifactStatus;
  artifactProducer?: OrbitAgentArtifactProducer;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.locale);
  const presentation = presentationFor(input.kind, locale, input.presentation);
  const task = taskFor({
    conversationId: input.conversationId,
    kind: input.kind,
    presentation,
    query: input.query,
    status: input.status,
    artifactProducer: input.artifactProducer,
  });

  return {
    result: resultFor(task, input.status, locale),
    task,
  };
}

function payloadForLookup(
  input: OrbitAgentArtifactLookupInput,
  status: OrbitAgentArtifactStatus,
): OrbitAgentArtifactResultEnvelope {
  const artifactId = readText(input.artifactId);

  // lookup 必须能从 artifactId 反推出已支持 kind，否则返回 not found。
  if (!artifactId) {
    return failure("ORBIT_AGENT_ARTIFACT_NOT_FOUND");
  }

  const kind = ORBIT_AGENT_ARTIFACT_KINDS.find(
    (candidate) => artifactId === artifactIdFor(candidate),
  );

  if (!kind) {
    return failure("ORBIT_AGENT_ARTIFACT_NOT_FOUND", { artifactId });
  }

  return success(
    payloadFor({
      kind,
      query: `Lookup generated artifact ${artifactId}`,
      status,
    }),
  );
}

export function createMockOrbitAgentArtifactTaskService(): OrbitAgentArtifactTaskService {
  return {
    createArtifactTask(input): OrbitAgentArtifactResultEnvelope {
      // create 路径先处理场景，再校验 query/kind，最后生成 ready 或 pending payload。
      const scenario = normalizeScenario(input.scenario);

      if (scenario === "failure") {
        return failure("ORBIT_AGENT_ARTIFACT_MOCK_FAILED");
      }

      const query = readText(input.query);

      if (!query) {
        return failure("ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED");
      }

      const kind = normalizeKind(input.kind);

      if (!kind) {
        return failure("ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND");
      }

      return success(
        payloadFor({
          conversationId: input.conversationId,
          kind,
          locale: input.locale,
          presentation: input.presentation,
          query,
          status: scenario === "pending" ? "pending" : "ready",
          artifactProducer: input.artifactProducer,
        }),
      );
    },

    getArtifactTask(input): OrbitAgentArtifactResultEnvelope {
      // get 路径按 artifactId 回放同一类 mock payload，方便 UI 详情页/调试页复用。
      const scenario = normalizeScenario(input.scenario);

      if (scenario === "failure") {
        return failure("ORBIT_AGENT_ARTIFACT_MOCK_FAILED", {
          artifactId: readText(input.artifactId) ?? undefined,
        });
      }

      return payloadForLookup(
        input,
        scenario === "pending" ? "pending" : "ready",
      );
    },
  };
}
