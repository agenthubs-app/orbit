import {
  type OrbitAgentArtifactKind,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactTaskRequest,
} from "./artifact-contract";
import {
  type ChatConversationListResult,
  type ChatMessage,
  type ChatMessageThreadPayload,
  type ChatMessageThreadResult,
  type ChatSendMessageResult,
  type ChatSourceReference,
} from "../chat/contract";
import type { ChatConversationMessageService } from "../chat/service";
import { createOrbitAgentChatContextArtifactService } from "./chat-context-artifact-service";
import { createOrbitAgentContactRecommendationArtifactService } from "./contact-recommendation-artifact-service";
import { createOrbitAgentEventRecommendationArtifactService } from "./event-recommendation-artifact-service";
import { createMockOrbitAiRelationshipRecommendationService } from "./mock-contact-recommendation-service";
import {
  ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS,
  type OrbitAgentConversationErrorCode,
  type OrbitAgentConversationFailure,
  type OrbitAgentConversationInput,
  type OrbitAgentConversationMessage,
  type OrbitAgentConversationPayload,
  type OrbitAgentConversationProvenance,
  type OrbitAgentConversationResult,
  type OrbitAgentConversationScenario,
  type OrbitAgentConversationService,
  type OrbitAgentRoutingDecision,
  type OrbitAgentRoutingToolFamily,
  type OrbitAgentConversationSummary,
  type OrbitAgentProposedToolIntent,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import { createOrbitAiGeneralConversationService } from "./general-conversation-service";
import { createMockOrbitAgentArtifactTaskService } from "./mock-artifact-task-service";
import {
  createOrbitAiTodoSummaryService,
  todoSummaryResultToArtifactPayload,
} from "./todo-summary-service";

export const ORBIT_AGENT_CONVERSATION_FIXTURE_SOURCE =
  "fixture:features/orbit-ai/mock-conversation-service.ts" as const;

const fixtureCollectedAt = "2026-06-27T00:00:00.000Z";
const defaultConversationId = "demo-orbit-agent-conversation-1";
const aobaConversationId = "conversation_010";
const aobaContactId = "contact_010";

const supportedScenarios = new Set<OrbitAgentConversationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
type ConversationLocale = "en" | "zh";

const safetyLedger = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  domainToolCallsExecuted: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  externalSideEffectsExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  notificationDelivered: false,
} as const;

const fixtureProvenance: OrbitAgentConversationProvenance = {
  collectedAt: fixtureCollectedAt,
  evidenceIds: ["evidence:orbit-agent:conversation-fixture"],
  generationMethod: "fixture",
  privacy: "demo-orbit-agent-conversation-only",
  safety: safetyLedger,
  source: ORBIT_AGENT_CONVERSATION_FIXTURE_SOURCE,
  sourceLabel: "Orbit Agent local conversation fixture",
};

const baseMessages: readonly OrbitAgentConversationMessage[] = [
  {
    content:
      "你可以直接告诉我目标。我会先用普通对话澄清上下文，只有需要时才建议调用人脉、活动或跟进工具。",
    conversationId: defaultConversationId,
    createdAt: "2026-06-27T00:00:00.000Z",
    evidenceIds: ["evidence:orbit-agent:conversation-fixture"],
    messageId: "orbit-agent-message-system-1",
    role: "assistant",
  },
];

const baseSummary: OrbitAgentConversationSummary = {
  conversationId: defaultConversationId,
  evidenceIds: ["evidence:orbit-agent:conversation-fixture"],
  lastMessagePreview:
    "你可以直接告诉我目标。我会先用普通对话澄清上下文。",
  title: "Orbit Agent conversation",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

const aobaChatSource: ChatSourceReference = {
  collectedAt: "2026-07-01T19:00:00.000Z",
  generatedBy: "live-store-query",
  id: "source:orbit-agent-demo-aoba-conversation",
  label: "Orbit Agent demonstration conversation data",
  providerRecordId: "source:orbit-agent-demo-aoba-conversation",
  type: "chat_summary",
};

const aobaChatFlags = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  deviceRequested: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: true,
  liveDatabaseWriteExecuted: false,
  notificationDelivered: false,
  productionMessageStorageRequested: false,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
} as const;

const aobaOneToOneContext = {
  contactId: aobaContactId,
  evidenceIds: [
    "evidence:orbit-agent-demo-aoba-relationship",
    "evidence:orbit-agent-demo-aoba-event",
  ],
  latestContext:
    "胡家明在 Aoba Technologies 负责日本市场合作，最近在活动后请求一份合作窗口和 pilot 时间线回顾。",
  organization: "Aoba Technologies",
  participantName: "胡家明",
  recommendedFollowup:
    "先复核 Aoba Technologies 的活动后对话证据，再确认是否发送一条围绕 pilot 时间线的跟进。",
  relationshipReason:
    "你们在出海 AI 活动后建立联系，讨论过日本市场合作、pilot 时间线和共同客户场景。",
  relationshipStage: "needs_follow_up",
  source: aobaChatSource,
};

const aobaConversation = {
  ...aobaChatFlags,
  conversationId: aobaConversationId,
  evidenceIds: ["evidence:orbit-agent-demo-aoba-conversation"],
  lastMessageAt: "2026-06-30T09:30:00+09:00",
  lastMessagePreview:
    "胡家明 asked for a concise recap before the Aoba Technologies pilot timing decision.",
  oneToOneContext: aobaOneToOneContext,
  organization: "Aoba Technologies",
  participantContactId: aobaContactId,
  participantName: "胡家明",
  source: aobaChatSource,
  status: "needs_followup" as const,
  title: "胡家明 · Aoba Technologies",
  unreadCount: 1,
};

const aobaMessages: readonly ChatMessage[] = [
  {
    ...aobaChatFlags,
    body: "活动上聊到 Aoba Technologies 正在评估日本市场的 AI pilot，我可以下周补一份窗口。",
    conversationId: aobaConversationId,
    createdAt: "2026-06-24T10:12:00+09:00",
    deliveryState: "mock_recorded_locally",
    evidenceIds: ["evidence:orbit-agent-demo-aoba-message-1"],
    messageId: "message_0042",
    senderName: "Orbit operator",
    senderRole: "orbit_user",
    source: aobaChatSource,
  },
  {
    ...aobaChatFlags,
    body: "谢谢，胡家明这边希望先看 pilot 时间线和共同客户场景，再决定是否拉技术同事。",
    conversationId: aobaConversationId,
    createdAt: "2026-06-25T16:40:00+09:00",
    deliveryState: "mock_received",
    evidenceIds: ["evidence:orbit-agent-demo-aoba-message-2"],
    messageId: "message_0043",
    senderName: "胡家明",
    senderRole: "contact",
    source: aobaChatSource,
  },
  {
    ...aobaChatFlags,
    body: "我会把活动后的合作窗口、pilot 风险和下周可选时间整理成一页。",
    conversationId: aobaConversationId,
    createdAt: "2026-06-27T11:05:00+09:00",
    deliveryState: "mock_recorded_locally",
    evidenceIds: ["evidence:orbit-agent-demo-aoba-message-3"],
    messageId: "message_0044",
    senderName: "Orbit operator",
    senderRole: "orbit_user",
    source: aobaChatSource,
  },
  {
    ...aobaChatFlags,
    body: "Aoba 内部周三下午有排期冲突，如果要推进，请先给我一个简短版和明确下一步。",
    conversationId: aobaConversationId,
    createdAt: "2026-06-29T18:20:00+09:00",
    deliveryState: "mock_received",
    evidenceIds: ["evidence:orbit-agent-demo-aoba-message-4"],
    messageId: "message_0045",
    senderName: "胡家明",
    senderRole: "contact",
    source: aobaChatSource,
  },
  {
    ...aobaChatFlags,
    body: "先确认是否继续围绕 pilot 时间线跟进；确认前不要发送消息、创建日程或通知任何人。",
    conversationId: aobaConversationId,
    createdAt: "2026-06-30T09:30:00+09:00",
    deliveryState: "mock_recorded_locally",
    evidenceIds: ["evidence:orbit-agent-demo-aoba-message-5"],
    messageId: "message_0046",
    senderName: "Orbit operator",
    senderRole: "orbit_user",
    source: aobaChatSource,
  },
];

const aobaChatProvenance = {
  ...aobaChatFlags,
  collectedAt: "2026-07-01T19:00:00.000Z",
  evidenceIds: [
    ...aobaConversation.evidenceIds,
    ...aobaMessages.flatMap((message) => message.evidenceIds),
  ],
  generationMethod: "live-store-query" as const,
  privacy: "live-chat-conversation-preview" as const,
  source: "demo:orbit-agent-aoba-conversation",
  sourceLabel: "Orbit Agent Aoba demonstration conversation data",
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?: OrbitAgentConversationInput["scenario"],
): OrbitAgentConversationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as OrbitAgentConversationScenario)
  ) {
    return scenario as OrbitAgentConversationScenario;
  }

  return "success";
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): ConversationLocale | null {
  return locale === "zh" || locale === "en" ? locale : null;
}

function inferLocaleFromMessage(message: string): ConversationLocale {
  return /[\u3400-\u9fff]/.test(message) ? "zh" : "en";
}

function localize(
  locale: ConversationLocale | null,
  copy: Record<ConversationLocale, string>,
  fallback?: string,
): string {
  return locale ? copy[locale] : fallback ?? copy.en;
}

function isAobaRelationshipContextRequest(message: string): boolean {
  return /aoba|胡家明|青葉|青叶/i.test(message);
}

function isRelationshipChatContextRequest(message: string): boolean {
  return (
    isAobaRelationshipContextRequest(message) ||
    /关系.*上下文|聊天.*上下文|为什么认识|為什麼認識|怎么认识|怎麼認識|relationship context|chat context|how do i know|relationship status|回复|回覆|reply|draft|草稿|写.*消息|寫.*消息|跟进消息|跟進消息/i.test(
      message,
    )
  );
}

function aobaThreadPayload(): ChatMessageThreadPayload {
  return {
    conversation: aobaConversation,
    messages: aobaMessages,
    nextAction:
      "Review Aoba Technologies source evidence before recording another storage-only reply.",
    oneToOneContext: aobaOneToOneContext,
    provenance: aobaChatProvenance,
    sendMessageState: {
      canSendInMock: true,
      confirmationRequiredBeforeLiveSend: true,
      externalSendRequested: false,
      productionMessageStorageRequested: false,
      realtimeTransportRequested: false,
      reason:
        "The demonstration chat store can stage a local reply, but external delivery still requires explicit confirmation.",
      status: "ready",
      websocketSubscriptionRequested: false,
    },
    state: "success",
    summary:
      "Orbit Agent loaded the Aoba Technologies demonstration relationship conversation for review-only follow-up context.",
  };
}

function createAobaRelationshipContextChatService(): ChatConversationMessageService {
  return {
    getMessageThread(input): ChatMessageThreadResult {
      return input.conversationId === aobaConversationId
        ? {
            data: aobaThreadPayload(),
            success: true,
          }
        : {
            data: {
              ...aobaThreadPayload(),
              messages: [],
              state: "empty",
              summary:
                "No demonstration messages matched this non-Aoba relationship context request.",
            },
            success: true,
          };
    },

    listConversations(): ChatConversationListResult {
      return {
        data: {
          conversations: [aobaConversation],
          nextAction:
            "Select 胡家明 · Aoba Technologies before drafting, sending, scheduling, or taking any external action.",
          provenance: aobaChatProvenance,
          state: "success",
          summary:
            "One Aoba Technologies relationship conversation is available in demonstration chat data.",
        },
        success: true,
      };
    },

    sendMessage(): ChatSendMessageResult {
      throw new Error(
        "Aoba relationship context demonstration service does not send chat messages.",
      );
    },
  };
}

function success(
  payload: OrbitAgentConversationPayload,
): OrbitAgentConversationResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: OrbitAgentConversationErrorCode,
): OrbitAgentConversationFailure {
  const definition = ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      evidenceIds: ["evidence:orbit-agent:controlled-failure"],
      provenance: {
        ...fixtureProvenance,
        evidenceIds: ["evidence:orbit-agent:controlled-failure"],
        generationMethod: "rule-based-agent-state",
        sourceLabel: "Controlled Orbit Agent conversation failure",
      },
      state: "failure",
    },
  };
}

function payloadFor(input: {
  artifacts?: readonly OrbitAgentArtifactPayload[];
  assistantMessage: string;
  locale?: ConversationLocale | null;
  messages?: readonly OrbitAgentConversationMessage[];
  proposedToolIntents?: readonly OrbitAgentProposedToolIntent[];
  routingDecision?: OrbitAgentRoutingDecision;
  sourceLabel?: string;
}): OrbitAgentConversationPayload {
  const messages = input.messages ?? baseMessages;
  const latestMessage = messages[messages.length - 1];

  return {
    activeConversationId: defaultConversationId,
    assistantMessage: input.assistantMessage,
    artifacts: input.artifacts ?? [],
    conversations: [
      {
        ...baseSummary,
        lastMessagePreview: latestMessage?.content ?? baseSummary.lastMessagePreview,
        updatedAt: latestMessage?.createdAt ?? baseSummary.updatedAt,
      },
    ],
    messages,
    nextAction: localize(input.locale ?? null, {
      en: "Continue the conversation naturally; confirm before any proposed tool or external action runs.",
      zh: "继续自然对话；任何计划工具或外部动作执行前都需要确认。",
    }),
    proposedToolIntents: input.proposedToolIntents ?? [],
    provenance: {
      ...fixtureProvenance,
      generationMethod: "rule-based-agent-reply",
      sourceLabel: input.sourceLabel ?? "Orbit Agent local reply rule",
    },
    routingDecision: input.routingDecision,
    state: "success",
  };
}

function emptyPayload(): OrbitAgentConversationPayload {
  return {
    activeConversationId: null,
    assistantMessage:
      "还没有 agent 对话。你可以直接输入目标，我会先用普通对话开始。",
    artifacts: [],
    conversations: [],
    messages: [],
    nextAction: "Start a local Orbit Agent conversation with a free-form message.",
    proposedToolIntents: [],
    provenance: {
      ...fixtureProvenance,
      evidenceIds: ["evidence:orbit-agent:empty"],
      generationMethod: "rule-based-agent-state",
      sourceLabel: "Empty Orbit Agent conversation state",
    },
    state: "empty",
  };
}

function pendingPayload(): OrbitAgentConversationPayload {
  return {
    activeConversationId: defaultConversationId,
    assistantMessage:
      "我正在整理这轮对话，但现在不会调用工具或执行外部动作。",
    artifacts: [],
    conversations: [baseSummary],
    messages: baseMessages,
    nextAction: "Wait for the local conversation guard before retrying.",
    proposedToolIntents: [],
    provenance: {
      ...fixtureProvenance,
      evidenceIds: ["evidence:orbit-agent:pending"],
      generationMethod: "rule-based-agent-state",
      sourceLabel: "Pending Orbit Agent conversation state",
    },
    state: "pending",
  };
}

function scenarioResult(
  scenario: OrbitAgentConversationScenario,
): OrbitAgentConversationResult | null {
  switch (scenario) {
    case "empty":
      return success(emptyPayload());
    case "pending":
      return success(pendingPayload());
    case "failure":
      return failure("ORBIT_AGENT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function proposedIntentsFor(
  message: string,
  locale: ConversationLocale | null,
  routingDecision?: OrbitAgentRoutingDecision,
): readonly OrbitAgentProposedToolIntent[] {
  const normalized = message.toLowerCase();
  const intents: OrbitAgentProposedToolIntent[] = [];
  const allowedToolFamilies = new Set<OrbitAgentRoutingToolFamily>([
    "contacts",
    "events",
    "followups",
  ]);

  if (routingDecision && !routingDecision.needsTool) {
    return [];
  }

  if (
    routingDecision?.toolFamily &&
    !allowedToolFamilies.has(routingDecision.toolFamily)
  ) {
    return [];
  }

  if (routingDecision) {
    if (routingDecision.toolFamily === "events") {
      intents.push({
        intentId: "intent:event-context-review",
        label: localize(locale, {
          en: "Inspect event context",
          zh: "查看活动上下文",
        }),
        reason: localize(locale, {
          en: "The user mentioned meeting or event planning, so event tools may help after confirmation.",
          zh: "用户提到了见面或活动安排，确认后活动工具可能有帮助。",
        }),
        requiresUserConfirmation: true,
        toolFamily: "events",
      });
    } else if (routingDecision.toolFamily === "contacts") {
      intents.push({
        intentId: "intent:contact-recommendations",
        label: localize(locale, {
          en: "Recommend relevant contacts",
          zh: "推荐相关人脉",
        }),
        reason: localize(locale, {
          en: "The user asked for people or relationship recommendations, so contact recommendation context can be generated.",
          zh: "用户请求人物或关系推荐，可以生成待复核的人脉推荐上下文。",
        }),
        requiresUserConfirmation: true,
        toolFamily: "contacts",
      });
    } else if (isRelationshipChatContextRequest(message)) {
      intents.push({
        intentId: "intent:relationship-chat-review",
        label: localize(locale, {
          en: "Review relationship conversation context",
          zh: "复核关系对话上下文",
        }),
        reason: localize(locale, {
          en: "The user mentioned a person, reply, or follow-up, so relationship chat context may help after confirmation.",
          zh: "用户提到了人物、回复或跟进，确认后关系聊天上下文可能有帮助。",
        }),
        requiresUserConfirmation: true,
        toolFamily: "relationship_chat",
      });
    } else if (routingDecision.toolFamily === "followups") {
      intents.push({
        intentId: "intent:followup-queue",
        label: localize(locale, {
          en: "Review follow-up queue",
          zh: "复核跟进队列",
        }),
        reason: localize(locale, {
          en: "The user asked about follow-ups, so a follow-up review artifact can be generated.",
          zh: "用户询问了跟进事项，可以生成待复核的跟进结果。",
        }),
        requiresUserConfirmation: true,
        toolFamily: "followups",
      });
    }

    return intents;
  }

  if (
    isRelationshipChatContextRequest(message)
  ) {
    intents.push({
      intentId: "intent:relationship-chat-review",
      label: localize(locale, {
        en: "Review relationship conversation context",
        zh: "复核关系对话上下文",
      }),
      reason: localize(locale, {
        en: "The user mentioned a person, reply, or follow-up, so relationship chat context may help after confirmation.",
        zh: "用户提到了人物、回复或跟进，确认后关系聊天上下文可能有帮助。",
      }),
      requiresUserConfirmation: true,
      toolFamily: "relationship_chat",
    });
  }

  if (/活动|event|meet|见/.test(normalized)) {
    intents.push({
      intentId: "intent:event-context-review",
      label: localize(locale, {
        en: "Inspect event context",
        zh: "查看活动上下文",
      }),
      reason: localize(locale, {
        en: "The user mentioned meeting or event planning, so event tools may help after confirmation.",
        zh: "用户提到了见面或活动安排，确认后活动工具可能有帮助。",
      }),
      requiresUserConfirmation: true,
      toolFamily: "events",
    });
  }

  if (
    /联系人|人脉|contact|introduc|推荐.*人|谁/.test(normalized)
  ) {
    intents.push({
      intentId: "intent:contact-recommendations",
      label: localize(locale, {
        en: "Recommend relevant contacts",
        zh: "推荐相关人脉",
      }),
      reason: localize(locale, {
        en: "The user asked for people or relationship recommendations, so contact recommendation context can be generated.",
        zh: "用户请求人物或关系推荐，可以生成待复核的人脉推荐上下文。",
      }),
      requiresUserConfirmation: true,
      toolFamily: "contacts",
    });
  }

  if (
    /跟进|follow|todo|待办/.test(normalized)
  ) {
    intents.push({
      intentId: "intent:followup-queue",
      label: localize(locale, {
        en: "Review follow-up queue",
        zh: "复核跟进队列",
      }),
      reason: localize(locale, {
        en: "The user asked about follow-ups, so a follow-up review artifact can be generated.",
        zh: "用户询问了跟进事项，可以生成待复核的跟进结果。",
      }),
      requiresUserConfirmation: true,
      toolFamily: "followups",
    });
  }

  return intents;
}

function isContactRecommendationRequest(message: string): boolean {
  return /联系人|人脉|contact|introduc|推荐.*人|谁|find .*someone|find .*person|find .*buyer|who can|who should|investor|organizer|market entry|poc buyer|sponsor/i.test(
    message,
  );
}

function isTodoSummaryRequest(
  message: string,
  routingDecision?: OrbitAgentRoutingDecision,
): boolean {
  return (
    routingDecision?.intent === "todo_synthesis" ||
    /to-do|todo|task list|tasks?|what should i do|social reminders?|birthday.*mention|introduction request.*action|待办|待辦|任务清单|任务|今天.*做/i.test(
      message,
    )
  );
}

function firstArtifactRequestFor(
  message: string,
  locale: ConversationLocale | null,
  routingDecision?: OrbitAgentRoutingDecision,
): Omit<OrbitAgentArtifactTaskRequest, "conversationId" | "query"> | null {
  const normalized = message.toLowerCase();

  if (routingDecision && !routingDecision.needsTool) return null;

  if (routingDecision) {
    if (routingDecision.toolFamily === "events") {
      return {
        kind: "event_recommendations",
        presentation: {
          preferredSurface: "side_panel",
          title: localize(locale, {
            en: "Recommended events",
            zh: "推荐活动",
          }),
          widthHint: "half",
        },
      };
    }

    if (routingDecision.toolFamily === "contacts") {
      return {
        kind: "contact_recommendations",
        presentation: {
          preferredSurface: "side_panel",
          title: localize(locale, {
            en: "Recommended contacts",
            zh: "推荐人脉",
          }),
          widthHint: "half",
        },
      };
    }

    if (isRelationshipChatContextRequest(message)) {
      return {
        kind: "relationship_chat_context",
        presentation: {
          preferredSurface: "side_panel",
          title: localize(locale, {
            en: "Relationship chat context",
            zh: "关系聊天上下文",
          }),
          widthHint: "half",
        },
        toolArguments: isAobaRelationshipContextRequest(message)
          ? {
              contactName: "Aoba",
            }
          : undefined,
      };
    }

    if (routingDecision.toolFamily === "followups") {
      return {
        kind: "followup_queue",
        presentation: {
          preferredSurface: "side_panel",
          title: localize(locale, {
            en: "Follow-up queue",
            zh: "跟进队列",
          }),
          widthHint: "half",
        },
      };
    }

    if (routingDecision.toolFamily === "todo") {
      return {
        kind: "followup_queue",
        presentation: {
          preferredSurface: "side_panel",
          title: localize(locale, {
            en: "Upcoming relationship work",
            zh: "关系待办摘要",
          }),
          widthHint: "half",
        },
      };
    }

    return null;
  }

  if (/活动|event|meet|见/.test(normalized)) {
    return {
      kind: "event_recommendations",
      presentation: {
        preferredSurface: "side_panel",
        title: localize(locale, {
          en: "Recommended events",
          zh: "推荐活动",
        }),
        widthHint: "half",
      },
    };
  }

  if (isRelationshipChatContextRequest(message)) {
    return {
      kind: "relationship_chat_context",
      presentation: {
        preferredSurface: "side_panel",
        title: localize(locale, {
          en: "Relationship chat context",
          zh: "关系聊天上下文",
        }),
        widthHint: "half",
      },
      toolArguments: isAobaRelationshipContextRequest(message)
        ? {
            contactName: "Aoba",
          }
        : undefined,
    };
  }

  if (/跟进|follow|todo|待办/.test(normalized)) {
    return {
      kind: "followup_queue",
      presentation: {
        preferredSurface: "side_panel",
        title: localize(locale, {
          en: "Follow-up queue",
          zh: "跟进队列",
        }),
        widthHint: "half",
      },
    };
  }

  if (isContactRecommendationRequest(message)) {
    return {
      kind: "contact_recommendations",
      presentation: {
        preferredSurface: "side_panel",
        title: localize(locale, {
          en: "Recommended contacts",
          zh: "推荐人脉",
        }),
        widthHint: "half",
      },
    };
  }

  return null;
}

function assistantReplyFor(input: {
  artifactKind: OrbitAgentArtifactKind | null;
  locale: ConversationLocale | null;
  message: string;
}): string {
  if (!input.artifactKind) {
    return localize(
      input.locale,
      {
        en: "Understood. Keep describing the goal in natural language; if contact, event, or follow-up context is needed, I will explain what to inspect before waiting for confirmation.",
        zh: "我明白。你可以继续用自然语言描述目标；如果需要联系人、活动或跟进上下文，我会先说明要查什么，再等你确认。",
      },
      "我明白。你可以继续用自然语言描述目标；如果需要联系人、活动或跟进上下文，我会先说明要查什么，再等你确认。",
    );
  }

  switch (input.artifactKind) {
    case "event_recommendations":
      return localize(
        input.locale,
        {
          en: "I understand you need event recommendations. I asked the event recommendation generator to prepare a side-panel result; any registration, calendar, or external contact action still requires your confirmation.",
          zh: "我理解你需要活动推荐。我已经让活动推荐生成器整理了一个可在侧边栏查看的结果；任何报名、日历或外部联系动作仍需要你确认。",
        },
        "我理解你需要活动推荐。我已经让活动推荐生成器整理了一个可在侧边栏查看的结果；任何报名、日历或外部联系动作仍需要你确认。",
      );
    case "contact_recommendations":
      return localize(
        input.locale,
        {
          en: "I understand you need contact recommendations. I asked the contact recommendation generator to prepare a reviewable result; any outreach or record write still requires your confirmation.",
          zh: "我理解你需要人脉推荐。我已经让人脉推荐生成器生成了一个可查看的推荐结果；任何联系或记录写入动作仍需要你确认。",
        },
        "我理解你需要人脉推荐。我已经让人脉推荐生成器生成了一个可查看的推荐结果；任何联系或记录写入动作仍需要你确认。",
      );
    case "followup_queue":
      return localize(
        input.locale,
        {
          en: "I understand you want to review follow-ups. I asked the follow-up generator to prepare a queue result; any message send or task update still requires your confirmation.",
          zh: "我理解你想查看跟进事项。我已经让跟进生成器整理了一个队列结果；任何发送消息或更新任务的动作仍需要你确认。",
        },
        "我理解你想查看跟进事项。我已经让跟进生成器整理了一个队列结果；任何发送消息或更新任务的动作仍需要你确认。",
      );
    case "relationship_chat_context":
      return localize(
        input.locale,
        {
          en: "I understand you need chat context. I asked the relationship chat generator to prepare reviewable reply context; I will not send any message automatically.",
          zh: "我理解你需要聊天上下文。我已经让关系聊天生成器整理了可查看的回复上下文；我不会自动发送任何消息。",
        },
        "我理解你需要聊天上下文。我已经让关系聊天生成器整理了可查看的回复上下文；我不会自动发送任何消息。",
      );
    case "email_context":
    case "generic":
    default:
      return localize(
        input.locale,
        {
          en: "I understand your goal. I prepared a reviewable context result; any external action still requires your confirmation.",
          zh: "我理解你的目标了。我已经生成了一个可查看的上下文结果；任何外部动作仍需要你确认。",
        },
        "我理解你的目标了。我已经生成了一个可查看的上下文结果；任何外部动作仍需要你确认。",
      );
  }
}

function artifactPayloadForMessage(
  message: string,
  locale: ConversationLocale | null,
  routingDecision?: OrbitAgentRoutingDecision,
): OrbitAgentArtifactPayload | null {
  if (isTodoSummaryRequest(message, routingDecision)) {
    const result = createOrbitAiTodoSummaryService().answerUpcomingWork({
      locale,
      query: message,
    });

    return todoSummaryResultToArtifactPayload({
      conversationId: defaultConversationId,
      locale,
      query: message,
      result,
    });
  }

  const artifactRequest = firstArtifactRequestFor(
    message,
    locale,
    routingDecision,
  );

  if (!artifactRequest) {
    return null;
  }

  const artifactService =
    artifactRequest.kind === "relationship_chat_context" &&
    isAobaRelationshipContextRequest(message)
      ? createOrbitAgentChatContextArtifactService({
          chatService: createAobaRelationshipContextChatService(),
          fallbackService: createMockOrbitAgentArtifactTaskService(),
        })
      : artifactRequest.kind === "contact_recommendations"
        ? createOrbitAgentContactRecommendationArtifactService({
            fallbackService: createMockOrbitAgentArtifactTaskService(),
            relationshipRecommendationService:
              createMockOrbitAiRelationshipRecommendationService(),
          })
      : artifactRequest.kind === "event_recommendations"
        ? createOrbitAgentEventRecommendationArtifactService({
            fallbackService: createMockOrbitAgentArtifactTaskService(),
          })
      : createMockOrbitAgentArtifactTaskService();
  const artifactResult = artifactService.createArtifactTask({
    ...artifactRequest,
    conversationId: defaultConversationId,
    locale,
    query: message,
  });
  const syncArtifactResult = requireSyncArtifactResult(artifactResult);

  return syncArtifactResult.success ? syncArtifactResult.data : null;
}

function requireSyncArtifactResult(
  result: OrbitAgentArtifactResultEnvelope | Promise<OrbitAgentArtifactResultEnvelope>,
): OrbitAgentArtifactResultEnvelope {
  const maybePromise = result as { then?: unknown };

  if (typeof maybePromise.then === "function") {
    throw new Error(
      "Mock Orbit Agent conversation requires a synchronous artifact service.",
    );
  }

  return result as OrbitAgentArtifactResultEnvelope;
}

function userMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: defaultConversationId,
    createdAt: "2026-06-27T00:01:00.000Z",
    evidenceIds: ["evidence:orbit-agent:user-message"],
    messageId: "orbit-agent-message-user-latest",
    role: "user",
  };
}

function assistantMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: defaultConversationId,
    createdAt: "2026-06-27T00:01:01.000Z",
    evidenceIds: ["evidence:orbit-agent:assistant-reply"],
    messageId: "orbit-agent-message-assistant-latest",
    role: "assistant",
  };
}

export function createMockOrbitAgentConversationService(): OrbitAgentConversationService {
  return {
    getConversation(input): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversationId = readText(input.conversationId);

      if (conversationId !== defaultConversationId) {
        return failure("ORBIT_AGENT_CONVERSATION_NOT_FOUND");
      }

      return success(
        payloadFor({
          assistantMessage: baseMessages[0].content,
          sourceLabel: "Orbit Agent conversation lookup fixture",
        }),
      );
    },

    listConversations(input = {}): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor({
          assistantMessage: baseMessages[0].content,
          sourceLabel: "Orbit Agent conversation list fixture",
        }),
      );
    },

    sendMessage(input): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const message = readText(input.message);

      if (!message) {
        return failure("ORBIT_AGENT_MESSAGE_REQUIRED");
      }

      const locale = normalizeLocale(input.locale) ?? inferLocaleFromMessage(message);
      const generalConversation =
        createOrbitAiGeneralConversationService().generateReply({
          history: input.history,
          locale,
          message,
        });
      const proposedToolIntents = proposedIntentsFor(
        message,
        locale,
        generalConversation.decision,
      );
      const artifact = artifactPayloadForMessage(
        message,
        locale,
        generalConversation.decision,
      );
      const reply =
        generalConversation.decision.intent === "todo_synthesis"
          ? localize(locale, {
              en: "I summarized upcoming relationship work from conversation and schedule context. Review the linked people or events before taking action.",
              zh: "我已从对话和日程上下文整理关系待办。执行前请先复核关联的人或活动。",
            })
          : assistantReplyFor({
              artifactKind: artifact?.task.kind ?? null,
              locale,
              message,
            }) || generalConversation.reply.message;
      const assistantReply = artifact ? reply : generalConversation.reply.message;

      return success(
        payloadFor({
          artifacts: artifact ? [artifact] : [],
          assistantMessage: assistantReply,
          locale,
          messages: [
            ...baseMessages,
            ...(input.history ?? []).map((turn, index) => ({
              content: turn.content,
              conversationId: defaultConversationId,
              createdAt: "2026-06-27T00:00:30.000Z",
              evidenceIds: ["evidence:orbit-agent:conversation-history"],
              messageId: `orbit-agent-message-history-${index + 1}`,
              role: turn.role,
            })),
            userMessage(message),
            assistantMessage(assistantReply),
          ],
          proposedToolIntents,
          routingDecision: generalConversation.decision,
          sourceLabel: "Orbit Agent free-form reply rule",
        }),
      );
    },
  };
}
