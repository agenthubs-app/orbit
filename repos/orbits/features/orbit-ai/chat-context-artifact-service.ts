import type {
  ChatConversationListResult,
  ChatConversationMessageService,
  ChatConversationMessageServiceResult,
  ChatConversationMockFailure,
  ChatMessageThreadResult,
} from "../chat/service";
import type { ChatMessage, ChatMessageThreadPayload } from "../chat/contract";
import { createChatConversationMessageService } from "../chat/service-factory";
import {
  type OrbitAgentArtifactGeneratedView,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactPresentation,
  type OrbitAgentArtifactProvenance,
  type OrbitAgentArtifactResult,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactSafety,
  type OrbitAgentArtifactStatus,
  type OrbitAgentArtifactTask,
  type OrbitAgentArtifactTaskRequest,
  type OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_CHAT_CONTEXT_ARTIFACT_SOURCE =
  "runtime:features/orbit-ai/chat-context-artifact-service.ts" as const;

const defaultConversationId = "live-orbit-agent-conversation";
const fallbackGeneratedAt = "2026-06-30T00:00:00.000Z";

const safety: OrbitAgentArtifactSafety = {
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
};

type ArtifactLocale = "en" | "zh";

interface ChatContextArtifactData {
  evidenceIds: readonly string[];
  generatedAt: string;
  liveDatabaseReadExecuted: boolean;
  messages: readonly ChatMessage[];
  source: string;
  sourceLabel: string;
  state: ChatMessageThreadPayload["state"] | "failure";
  summary: string;
  thread: ChatMessageThreadPayload | null;
  toolStatus: OrbitAgentArtifactToolCallTrace["status"];
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): ArtifactLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(locale: ArtifactLocale, copy: Record<ArtifactLocale, string>) {
  return copy[locale];
}

function isPromiseLike<TResult>(
  result: ChatConversationMessageServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function evidenceIdsFor(
  messages: readonly ChatMessage[],
  fallback: readonly string[],
): readonly string[] {
  const evidenceIds = messages.flatMap((message) => message.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : fallback.length > 0
      ? fallback
      : ["evidence:orbit-agent:chat-context:empty"];
}

function dataForThread(thread: ChatMessageThreadPayload): ChatContextArtifactData {
  return {
    evidenceIds: evidenceIdsFor(thread.messages, thread.provenance.evidenceIds),
    generatedAt: thread.provenance.collectedAt,
    liveDatabaseReadExecuted:
      thread.provenance.liveDatabaseReadExecuted === true,
    messages: thread.messages,
    source: thread.provenance.source,
    sourceLabel: thread.provenance.sourceLabel,
    state: thread.state,
    summary: thread.summary,
    thread,
    toolStatus:
      thread.state === "success"
        ? "completed"
        : thread.state === "pending"
          ? "planned"
          : "skipped",
  };
}

function dataForFailure(failure: ChatConversationMockFailure): ChatContextArtifactData {
  return {
    evidenceIds: evidenceIdsFor([], failure.error.evidenceIds),
    generatedAt: failure.error.provenance.collectedAt,
    liveDatabaseReadExecuted:
      failure.error.provenance.liveDatabaseReadExecuted === true,
    messages: [],
    source: failure.error.provenance.source,
    sourceLabel: failure.error.provenance.sourceLabel,
    state: "failure",
    summary: failure.error.message,
    thread: null,
    toolStatus: "failed",
  };
}

function dataForThreadResult(
  result: ChatMessageThreadResult,
): ChatContextArtifactData {
  return result.success === true ? dataForThread(result.data) : dataForFailure(result);
}

function preferredConversationId(
  request: OrbitAgentArtifactTaskRequest,
  listResult: ChatConversationListResult,
): string | null {
  const explicitConversationId =
    readText(request.toolArguments?.conversationId) ??
    readText(request.conversationId);

  if (explicitConversationId) {
    return explicitConversationId;
  }

  if (listResult.success === false) {
    return null;
  }

  const contactId = readText(request.toolArguments?.contactId);
  const byContact = contactId
    ? listResult.data.conversations.find(
        (conversation) => conversation.participantContactId === contactId,
      )
    : null;

  return (
    byContact?.conversationId ??
    listResult.data.conversations[0]?.conversationId ??
    null
  );
}

function presentationFor(
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: OrbitAgentArtifactPresentation = {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Loaded from the Chat conversation service",
      zh: "来自 Chat 会话服务",
    }),
    title: localize(locale, {
      en: "Relationship chat context",
      zh: "关系聊天上下文",
    }),
    widthHint: "half",
  };

  return {
    ...defaults,
    ...presentation,
    title: presentation?.title?.trim() || defaults.title,
  };
}

function messagePreview(message: ChatMessage): string {
  return message.body.length > 180
    ? `${message.body.slice(0, 177)}...`
    : message.body;
}

function messageItemFor(message: ChatMessage, locale: ArtifactLocale) {
  return {
    actions: [
      {
        actionId: `chat:review-message:${message.messageId}`,
        label: localize(locale, {
          en: "Review context",
          zh: "复核上下文",
        }),
        requiresConfirmation: true,
      },
    ],
    body: messagePreview(message),
    confidenceLabel: localize(locale, {
      en: "Source-backed",
      zh: "来源已绑定",
    }),
    evidenceIds: message.evidenceIds,
    id: `chat-message:${message.messageId}`,
    metadata: [
      {
        label: localize(locale, { en: "Sender", zh: "发送方" }),
        value: message.senderName,
      },
      {
        label: localize(locale, { en: "Role", zh: "角色" }),
        value: message.senderRole,
      },
      {
        label: localize(locale, { en: "Created", zh: "时间" }),
        value: message.createdAt,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: message.source.label,
      },
    ],
    reason: localize(locale, {
      en: "This message was loaded from live chat storage and remains review-only in Orbit AI.",
      zh: "这条消息来自 live Chat 存储，在 Orbit AI 中仍然只作为可复核上下文。",
    }),
    subtitle: message.conversationId,
    title: message.messageId,
  };
}

function contextItemFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
) {
  const context = data.thread?.oneToOneContext;

  if (!context) {
    return null;
  }

  return {
    actions: [
      {
        actionId: `chat:review-context:${context.contactId}`,
        label: localize(locale, {
          en: "Review relationship context",
          zh: "复核关系上下文",
        }),
        requiresConfirmation: true,
      },
    ],
    body: context.latestContext,
    confidenceLabel: context.relationshipStage,
    evidenceIds: context.evidenceIds,
    id: `chat-context:${context.contactId}`,
    metadata: [
      {
        label: localize(locale, { en: "Contact", zh: "联系人" }),
        value: context.participantName,
      },
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: context.organization || localize(locale, { en: "Unknown", zh: "未知" }),
      },
      {
        label: localize(locale, { en: "Stage", zh: "阶段" }),
        value: context.relationshipStage,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: data.sourceLabel,
      },
    ],
    reason: context.relationshipReason,
    subtitle: context.recommendedFollowup,
    title: context.participantName,
  };
}

function emptyStateFor(data: ChatContextArtifactData, locale: ArtifactLocale): string | undefined {
  if (data.messages.length > 0) {
    return undefined;
  }

  if (data.state === "pending") {
    return localize(locale, {
      en: "The chat context is waiting for source data review.",
      zh: "聊天上下文正在等待来源数据复核。",
    });
  }

  if (data.state === "failure") {
    return localize(locale, {
      en: "Chat context could not be loaded from the Chat service.",
      zh: "无法从 Chat 服务加载聊天上下文。",
    });
  }

  return localize(locale, {
    en: "No live chat messages matched this context request.",
    zh: "没有匹配这次请求的 live 聊天消息。",
  });
}

function generatedViewFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const contextItem = contextItemFor(data, locale);

  return {
    emptyState: emptyStateFor(data, locale),
    sections: [
      {
        body: localize(locale, {
          en: `Source: ${data.sourceLabel}`,
          zh: `来源：${data.sourceLabel}`,
        }),
        items: contextItem ? [contextItem] : [],
        title: localize(locale, {
          en: "Relationship context",
          zh: "关系上下文",
        }),
      },
      {
        items: data.messages.slice(-5).map((message) => messageItemFor(message, locale)),
        title: localize(locale, {
          en: "Recent messages",
          zh: "最近消息",
        }),
      },
    ],
    summary:
      data.thread && data.messages.length > 0
        ? localize(locale, {
            en: `${data.thread.oneToOneContext.participantName} has ${data.messages.length} source-backed messages in ${data.thread.conversation.conversationId}.`,
            zh: `${data.thread.oneToOneContext.participantName} 在 ${data.thread.conversation.conversationId} 有 ${data.messages.length} 条带来源的消息。`,
          })
        : data.summary,
  };
}

function toolTraceFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: data.evidenceIds,
      reason:
        data.toolStatus === "failed"
          ? localize(locale, {
              en: "The Chat service returned a controlled failure while loading relationship chat context.",
              zh: "Chat 服务在加载关系聊天上下文时返回了受控失败。",
            })
          : localize(locale, {
              en: "Orbit AI loaded reviewable relationship chat context from Chat without sending messages, opening transport, or executing external actions.",
              zh: "Orbit AI 从 Chat 加载可复核关系聊天上下文，未发送消息、未打开传输层、未执行外部动作。",
            }),
      status: data.toolStatus,
      toolCallId: "toolcall:relationship-chat-context:live-chat",
      toolName: "chat.context",
    },
  ];
}

function provenanceFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: data.evidenceIds,
    generatedAt: data.generatedAt || fallbackGeneratedAt,
    generationMethod: "artifact-producer-generated-view",
    source: data.source || ORBIT_AGENT_CHAT_CONTEXT_ARTIFACT_SOURCE,
    sourceModules: ["orbit-ai", "chat"],
    toolCalls: toolTraceFor(data, locale),
  };
}

function statusFor(data: ChatContextArtifactData): OrbitAgentArtifactStatus {
  if (data.state === "pending") {
    return "pending";
  }

  if (data.state === "failure") {
    return "failed";
  }

  return "ready";
}

function taskFor(input: {
  conversationId?: string | null;
  generatedAt: string;
  presentation: OrbitAgentArtifactPresentation;
  query: string;
  status: OrbitAgentArtifactStatus;
}): OrbitAgentArtifactTask {
  return {
    artifactId: "artifact:relationship-chat-context:live-chat",
    artifactProducer: "relationship_chat_review_producer",
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: input.generatedAt,
    kind: "relationship_chat_context",
    presentation: input.presentation,
    query: input.query,
    status: input.status,
    taskId: "task:relationship-chat-context:live-chat",
    updatedAt: input.generatedAt,
  };
}

function resultFor(input: {
  data: ChatContextArtifactData;
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewFor(input.data, input.locale),
    kind: "relationship_chat_context",
    nextAction:
      input.data.messages.length > 0
        ? localize(input.locale, {
            en: "Review chat evidence before drafting, sending, scheduling, or taking any external action.",
            zh: "请先复核聊天证据，再决定是否起草、发送、安排日程或执行外部动作。",
          })
        : localize(input.locale, {
            en: "Adjust the request or add source-backed chat messages.",
            zh: "请调整请求，或补充有来源证据的聊天消息。",
          }),
    presentation: input.presentation,
    provenance: provenanceFor(input.data, input.locale),
    safety: {
      ...safety,
      liveDatabaseReadExecuted: input.data.liveDatabaseReadExecuted,
    },
    status: input.task.status,
    taskId: input.task.taskId,
  };
}

function payloadFor(input: {
  data: ChatContextArtifactData;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const status = statusFor(input.data);
  const generatedAt = input.data.generatedAt || fallbackGeneratedAt;
  const task = taskFor({
    conversationId:
      input.data.thread?.conversation.conversationId ??
      input.request.conversationId,
    generatedAt,
    presentation,
    query: input.query,
    status,
  });

  return {
    result: resultFor({
      data: input.data,
      locale,
      presentation,
      task,
    }),
    task,
  };
}

function success(payload: OrbitAgentArtifactPayload): OrbitAgentArtifactResultEnvelope {
  return {
    data: payload,
    success: true,
  };
}

function resultForSelectedConversation(input: {
  chatService: ChatConversationMessageService;
  listResult: ChatConversationListResult;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): ChatConversationMessageServiceResult<OrbitAgentArtifactResultEnvelope> {
  if (input.listResult.success === false) {
    return success(
      payloadFor({
        data: dataForFailure(input.listResult),
        query: input.query,
        request: input.request,
      }),
    );
  }

  const conversationId = preferredConversationId(input.request, input.listResult);

  if (!conversationId) {
    return success(
      payloadFor({
        data: {
          evidenceIds: evidenceIdsFor([], input.listResult.data.provenance.evidenceIds),
          generatedAt: input.listResult.data.provenance.collectedAt,
          liveDatabaseReadExecuted:
            input.listResult.data.provenance.liveDatabaseReadExecuted === true,
          messages: [],
          source: input.listResult.data.provenance.source,
          sourceLabel: input.listResult.data.provenance.sourceLabel,
          state: input.listResult.data.state,
          summary: input.listResult.data.summary,
          thread: null,
          toolStatus: input.listResult.data.state === "pending" ? "planned" : "skipped",
        },
        query: input.query,
        request: input.request,
      }),
    );
  }

  const threadResult = input.chatService.getMessageThread({
    conversationId,
    scenario: input.request.scenario,
  });
  const toArtifactResult = (resolved: ChatMessageThreadResult) =>
    success(
      payloadFor({
        data: dataForThreadResult(resolved),
        query: input.query,
        request: input.request,
      }),
    );

  if (isPromiseLike(threadResult)) {
    return threadResult.then(toArtifactResult);
  }

  return toArtifactResult(threadResult);
}

export function createOrbitAgentChatContextArtifactService(input: {
  chatService?: ChatConversationMessageService;
  fallbackService?: OrbitAgentArtifactTaskService;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();
  const chatService =
    input.chatService ?? createChatConversationMessageService();

  return {
    createArtifactTask(request) {
      if (request.kind !== "relationship_chat_context") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      const listResult = chatService.listConversations({
        scenario: request.scenario,
      });
      const toArtifactResult = (resolved: ChatConversationListResult) =>
        resultForSelectedConversation({
          chatService,
          listResult: resolved,
          query,
          request,
        });

      if (isPromiseLike(listResult)) {
        return listResult.then(toArtifactResult);
      }

      return toArtifactResult(listResult);
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
