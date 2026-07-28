import {
  CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS,
  type AsyncConversationCreateFromDraftInput,
  type AsyncConversationCreateResult,
  type AsyncConversationDraftReply,
  type AsyncConversationFailure,
  type AsyncConversationInboxItem,
  type AsyncConversationInput,
  type AsyncConversationMessage,
  type AsyncConversationNoSideEffects,
  type AsyncConversationProvenance,
  type AsyncConversationScheduleWindow,
  type AsyncConversationStageActionInput,
  type AsyncConversationStagePayload,
  type AsyncConversationStageResult,
  type AsyncConversationThread,
  type AsyncConversationWorkspaceSuccessPayload,
  type AsyncConversationWorkspaceResult,
  type ChatConversationListPayload,
  type ChatConversationListResult,
  type ChatConversationMessageService,
  type ChatConversationMockErrorCode,
  type ChatConversationMockFailure,
  type ChatConversationMockProvenance,
  type ChatConversationMockScenario,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessageThreadPayload,
  type ChatMessageThreadResult,
  type ChatSendMessagePayload,
  type ChatSendMessageResult,
} from "./contract";
import type { AsyncRelationshipConversationService } from "./service";
import {
  chatLocalSendSource,
  mockChatConversationFailureProvenance,
  mockChatConversationListFixture,
  mockChatConversationProvenance,
  mockChatConversations,
  mockChatMessages,
  mockEmptyChatConversationFixture,
  mockEmptyChatThreadFixture,
  mockPendingChatConversationFixture,
  mockPendingChatSendFixture,
  mockPendingChatThreadFixture,
  readySendMessageState,
} from "./fixtures";

const supportedScenarios = new Set<ChatConversationMockScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// Chat conversation mock service 只模拟一对一关系聊天记录。
// sendMessage 会把消息追加到返回 payload，但不写生产消息存储、不发 websocket、不调用 AI。
const mockOnlyExecutionFlags = {
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  aiProviderRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
} as const;

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // chat payload 包含 messages 数组，返回 clone 防止调用方改共享 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function listSuccess(
  data: ChatConversationListPayload,
): ChatConversationListResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function threadSuccess(
  data: ChatMessageThreadPayload,
): ChatMessageThreadResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function sendSuccess(data: ChatSendMessagePayload): ChatSendMessageResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ChatConversationMockErrorCode,
): ChatConversationMockFailure {
  // chat failure 都保留在 mock conversation 边界内，避免暴露真实传输或存储细节。
  const definition = CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockChatConversationFailureProvenance,
      evidenceIds: mockChatConversationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ChatConversationMockScenario | string | null,
): ChatConversationMockScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatConversationMockScenario)
  ) {
    return scenario as ChatConversationMockScenario;
  }

  return "success";
}

function listScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatConversationListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess(mockEmptyChatConversationFixture);
    case "pending":
      return listSuccess(mockPendingChatConversationFixture);
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function threadScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatMessageThreadResult | null {
  switch (scenario) {
    case "empty":
      return threadSuccess(mockEmptyChatThreadFixture);
    case "pending":
      return threadSuccess(mockPendingChatThreadFixture);
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function sendScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatSendMessageResult | null {
  switch (scenario) {
    case "pending":
      return sendSuccess(mockPendingChatSendFixture);
    case "empty":
      return failure("CHAT_CONVERSATION_EMPTY");
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function conversationById(
  conversationId: string,
): ChatConversationSummary | null {
  // 当前 mock 只查 fixture 中的 conversation summary，不访问生产会话表。
  return (
    mockChatConversations.find(
      (conversation) => conversation.conversationId === conversationId,
    ) ?? null
  );
}

function messagesForConversation(conversationId: string): readonly ChatMessage[] {
  return mockChatMessages.filter(
    (message) => message.conversationId === conversationId,
  );
}

function uniqueEvidenceIds(input: {
  conversation: ChatConversationSummary;
  messages: readonly ChatMessage[];
  extraEvidenceIds?: readonly string[];
}): readonly string[] {
  return [
    ...new Set([
      ...input.conversation.evidenceIds,
      ...input.messages.flatMap((message) => message.evidenceIds),
      ...(input.extraEvidenceIds ?? []),
    ]),
  ];
}

function provenanceFor(input: {
  conversation: ChatConversationSummary;
  messages: readonly ChatMessage[];
  generationMethod: ChatConversationMockProvenance["generationMethod"];
  sourceLabel: string;
  extraEvidenceIds?: readonly string[];
}): ChatConversationMockProvenance {
  // provenance 汇总 conversation、messages 和额外 mock-send evidence。
  return {
    ...mockChatConversationProvenance,
    evidenceIds: uniqueEvidenceIds(input),
    generationMethod: input.generationMethod,
    sourceLabel: input.sourceLabel,
  };
}

function threadPayloadFor(
  conversation: ChatConversationSummary,
): ChatMessageThreadPayload {
  // thread payload 由 conversation summary + 对应 messages 派生，保持一对一上下文一致。
  const messages = messagesForConversation(conversation.conversationId);

  return {
    state: "success",
    conversation,
    messages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversation.oneToOneContext,
    summary: `${conversation.participantName}'s one-to-one thread is assembled from local relationship evidence fixtures.`,
    provenance: provenanceFor({
      conversation,
      messages,
      generationMethod: "rule-based-thread",
      sourceLabel: `Mock chat thread for ${conversation.participantName}`,
    }),
    nextAction:
      "Review source evidence before recording a local mock reply or wiring live delivery.",
  };
}

function buildSentMessage(input: {
  conversation: ChatConversationSummary;
  body: string;
}): ChatMessage {
  // 发送消息只是构造 mock_recorded_locally 记录；mockOnlyExecutionFlags 明确所有外部通道为 false。
  return {
    messageId: `demo-message-local-${input.conversation.conversationId}`,
    conversationId: input.conversation.conversationId,
    senderRole: "orbit_user",
    senderName: "Alex Tan",
    body: input.body,
    createdAt: "2026-06-25T23:55:00.000Z",
    deliveryState: "mock_recorded_locally",
    source: chatLocalSendSource,
    evidenceIds: [
      ...input.conversation.evidenceIds,
      "evidence:chat:mock-send",
    ],
    ...mockOnlyExecutionFlags,
  };
}

function sendPayloadFor(input: {
  conversation: ChatConversationSummary;
  body: string;
}): ChatSendMessagePayload {
  const previousMessages = messagesForConversation(input.conversation.conversationId);
  const message = buildSentMessage(input);
  const messages = [...previousMessages, message];

  return {
    state: "success",
    conversationId: input.conversation.conversationId,
    message,
    messages,
    sendMessageState: readySendMessageState,
    oneToOneContext: input.conversation.oneToOneContext,
    summary:
      "A local mock message was recorded without live transport, websocket subscriptions, or production storage.",
    provenance: provenanceFor({
      conversation: input.conversation,
      messages,
      generationMethod: "rule-based-send",
      sourceLabel: "Mock chat send rule",
      extraEvidenceIds: ["evidence:chat:mock-send"],
    }),
    nextAction:
      "Keep live delivery behind confirmation and provider replacement tests.",
  };
}

export function createMockChatConversationMessageService(): ChatConversationMessageService {
  // public API 对应列表、线程详情和本地发送三类 route。
  return {
    listConversations(input = {}): ChatConversationListResult {
      const scenario = listScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return listSuccess(mockChatConversationListFixture);
    },

    getMessageThread(input): ChatMessageThreadResult {
      const conversationId = readText(input.conversationId);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED");
      }

      const scenario = threadScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversation = conversationById(conversationId);

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND");
      }

      return threadSuccess(threadPayloadFor(conversation));
    },

    sendMessage(input): ChatSendMessageResult {
      const conversationId = readText(input.conversationId);
      const body = readText(input.body);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED");
      }

      if (!body) {
        return failure("CHAT_MESSAGE_BODY_REQUIRED");
      }

      const scenario = sendScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversation = conversationById(conversationId);

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND");
      }

      return sendSuccess(sendPayloadFor({ conversation, body }));
    },
  };
}

const asyncNoSideEffects: AsyncConversationNoSideEffects = {
  calendarEntryCreated: false,
  externalMessageSent: false,
  networkRequestMade: false,
  notificationDelivered: false,
  savedRecordCreated: false,
} as const;

const asyncConversationProvenance: AsyncConversationProvenance = {
  source: "fixture:features/chat/mock-service.ts",
  sourceLabel: "Mock asynchronous relationship correspondence",
  evidenceIds: [
    "evidence:conversation:aoba:breakfast",
    "evidence:conversation:aoba:follow-up-task",
    "evidence:conversation:lina:intro",
  ],
  generatedBy: "mock-async-conversation-service",
  privacy: "local-relationship-correspondence-preview",
};

type AsyncConversationRecord = Omit<
  AsyncConversationWorkspaceSuccessPayload,
  "currentUser" | "inbox" | "provenance" | "sideEffects" | "state"
>;

const aobaScheduleWindow: AsyncConversationScheduleWindow = {
  windowId: "schedule_window_aoba_thu_1000",
  label: "Thu 10:00-10:25 JST",
  startsAt: "2026-07-09T10:00:00+09:00",
  endsAt: "2026-07-09T10:25:00+09:00",
  timezone: "Asia/Tokyo",
  availabilityState: "available_for_staging",
  sourceContextLabel: "Calendar hold from Orbit schedule context",
};

const asyncConversationRecords: readonly AsyncConversationRecord[] = [
  {
    selectedThread: {
      conversationId: "conversation_demo_aoba",
      threadId: "thread_demo_aoba",
      subject: "Founder breakfast recap",
      correspondenceMode: "asynchronous",
      realtimeTransportEnabled: false,
      messages: [
        {
          messageId: "message_demo_aoba_1",
          senderName: "Aoba Mori",
          senderRole: "contact",
          body:
            "The Yoyogi climate founder breakfast was useful. Could you send the two-point recap before I speak with the venue team?",
          occurredAt: "2026-07-07T08:42:00+09:00",
          deliveryState: "received_snapshot",
          sourceContextLabel: "Yoyogi climate founder breakfast",
          evidenceIds: ["evidence:conversation:aoba:breakfast"],
        },
        {
          messageId: "message_demo_aoba_2",
          senderName: "Alex Tan",
          senderRole: "orbit_user",
          body:
            "Yes. I will keep it short and tie it back to the venue team's follow-up questions.",
          occurredAt: "2026-07-07T09:06:00+09:00",
          deliveryState: "local_draft_snapshot",
          sourceContextLabel: "Aoba follow-up task",
          evidenceIds: ["evidence:conversation:aoba:follow-up-task"],
        },
      ],
      summary:
        "Aoba asked for a short recap from the Yoyogi climate founder breakfast before a venue-team conversation.",
      sourceContextLabels: [
        "Yoyogi climate founder breakfast",
        "Aoba follow-up task",
      ],
    },
    draftReply: {
      draftId: "draft_reply_aoba_recap",
      body:
        "Aoba, here is the short recap from breakfast: the venue team cared most about founder fit and a clear follow-up owner. I can send the two bullets before your venue conversation and keep Thu 10:00 JST open if a quick calibration helps.",
      tone: "warm, specific, relationship-aware",
      sourceContextLabel: "Aoba follow-up task",
      externalSendStatus: "not_requested",
      evidenceIds: [
        "evidence:conversation:aoba:breakfast",
        "evidence:conversation:aoba:follow-up-task",
      ],
    },
    nextActions: [
      {
        actionId: "stage_reply_aoba_recap",
        title: "Prepare a local reply preview",
        description:
          "Stage the breakfast recap reply for review without sending it or creating a calendar record.",
        stageHref: "/app/chat?action=stage-reply&conversation=conversation_demo_aoba",
        sourceContextLabel: "Aoba follow-up task",
        followUpTaskId: "task_demo_aoba_recap",
        eventId: "event_yoyogi_climate_breakfast",
        scheduleWindowId: "schedule_window_aoba_thu_1000",
      },
    ],
    contact: {
      contactId: "contact_demo_aoba",
      displayName: "Aoba Mori",
      organization: "Yoyogi Climate Founders",
      role: "Community partnerships lead",
      sourceContextLabel: "Yoyogi climate founder breakfast",
    },
    connection: {
      connectionId: "connection_demo_aoba",
      contactId: "contact_demo_aoba",
      relationshipReason:
        "Aoba and Alex met through the Yoyogi climate founder breakfast, then turned the conversation into a concrete venue-team recap request.",
      relationshipStage: "active_follow_up",
      sourceContextLabel: "Yoyogi climate founder breakfast",
      evidenceIds: [
        "evidence:conversation:aoba:breakfast",
        "evidence:conversation:aoba:follow-up-task",
      ],
    },
    event: {
      eventId: "event_yoyogi_climate_breakfast",
      name: "Yoyogi climate founder breakfast",
      occurredAt: "2026-07-07T08:00:00+09:00",
      location: "Yoyogi, Tokyo",
      sourceContextLabel: "Event attendance record",
    },
    schedule: {
      timezone: "Asia/Tokyo",
      sourceContextLabel: "Calendar hold from Orbit schedule context",
      windows: [aobaScheduleWindow],
    },
    followUpTask: {
      taskId: "task_demo_aoba_recap",
      title: "Send Aoba the founder breakfast recap",
      dueLabel: "Before Thu venue-team call",
      status: "open",
      sourceContextLabel: "Aoba follow-up task",
    },
  },
  {
    selectedThread: {
      conversationId: "conversation_demo_lina",
      threadId: "thread_demo_lina",
      subject: "Investor intro context",
      correspondenceMode: "asynchronous",
      realtimeTransportEnabled: false,
      messages: [
        {
          messageId: "message_demo_lina_1",
          senderName: "Lina Park",
          senderRole: "contact",
          body:
            "If the robotics investor intro still makes sense, can you remind me which angle is most relevant?",
          occurredAt: "2026-07-06T17:10:00+09:00",
          deliveryState: "received_snapshot",
          sourceContextLabel: "Robotics investor intro note",
          evidenceIds: ["evidence:conversation:lina:intro"],
        },
      ],
      summary:
        "Lina is asking whether the robotics investor intro still has a focused reason to happen.",
      sourceContextLabels: ["Robotics investor intro note"],
    },
    draftReply: {
      draftId: "draft_reply_lina_intro",
      body:
        "Lina, the strongest angle is still the operator-led robotics deployment story. I would frame the intro around customer evidence rather than fundraising timing.",
      tone: "concise, advisory",
      sourceContextLabel: "Robotics investor intro note",
      externalSendStatus: "not_requested",
      evidenceIds: ["evidence:conversation:lina:intro"],
    },
    nextActions: [
      {
        actionId: "stage_reply_lina_intro",
        title: "Stage the intro-angle reply",
        description:
          "Prepare Lina's reply as a local preview and keep the investor intro unsent.",
        stageHref: "/app/chat?action=stage-reply&conversation=conversation_demo_lina",
        sourceContextLabel: "Robotics investor intro note",
        followUpTaskId: "task_demo_lina_intro",
        eventId: "event_robotics_operator_roundtable",
        scheduleWindowId: "schedule_window_lina_fri_1530",
      },
    ],
    contact: {
      contactId: "contact_demo_lina",
      displayName: "Lina Park",
      organization: "Kita Robotics",
      role: "Founder",
      sourceContextLabel: "Robotics investor intro note",
    },
    connection: {
      connectionId: "connection_demo_lina",
      contactId: "contact_demo_lina",
      relationshipReason:
        "Lina asked for help positioning a robotics investor introduction after a prior operator roundtable.",
      relationshipStage: "warm_intro_pending",
      sourceContextLabel: "Robotics investor intro note",
      evidenceIds: ["evidence:conversation:lina:intro"],
    },
    event: {
      eventId: "event_robotics_operator_roundtable",
      name: "Robotics operator roundtable",
      occurredAt: "2026-06-30T18:30:00+09:00",
      location: "Marunouchi, Tokyo",
      sourceContextLabel: "Roundtable attendance note",
    },
    schedule: {
      timezone: "Asia/Tokyo",
      sourceContextLabel: "Intro review schedule context",
      windows: [
        {
          windowId: "schedule_window_lina_fri_1530",
          label: "Fri 15:30-15:50 JST",
          startsAt: "2026-07-10T15:30:00+09:00",
          endsAt: "2026-07-10T15:50:00+09:00",
          timezone: "Asia/Tokyo",
          availabilityState: "available_for_staging",
          sourceContextLabel: "Intro review schedule context",
        },
      ],
    },
    followUpTask: {
      taskId: "task_demo_lina_intro",
      title: "Clarify Lina's investor intro angle",
      dueLabel: "Before Friday afternoon",
      status: "open",
      sourceContextLabel: "Robotics investor intro note",
    },
  },
] as const;

function asyncFailure(
  code: AsyncConversationFailure["error"]["code"],
): AsyncConversationFailure {
  const definitions: Record<
    AsyncConversationFailure["error"]["code"],
    Omit<AsyncConversationFailure["error"], "code" | "evidenceIds">
  > = {
    ASYNC_CONVERSATION_ACTION_NOT_FOUND: {
      appCode: "NOT_FOUND",
      message:
        "No staged async conversation action matches the selected relationship thread.",
      recovery:
        "Choose a next action from the selected thread before staging a local preview.",
    },
    ASYNC_CONVERSATION_NOT_FOUND: {
      appCode: "NOT_FOUND",
      message:
        "No mock asynchronous relationship conversation matches the selected id.",
      recovery:
        "Choose a conversation from the relationship inbox before reviewing a thread.",
    },
    ASYNC_CONVERSATION_DRAFT_CONTEXT_REQUIRED: {
      appCode: "VALIDATION_ERROR",
      message:
        "A subject and body are required before staging a new relationship conversation from a draft.",
      recovery:
        "Generate or write a draft subject and body before creating a new conversation thread.",
    },
    ASYNC_CONVERSATION_ACTOR_REQUIRED: {
      appCode: "UNAUTHORIZED",
      message:
        "An authenticated actor is required for live relationship conversations.",
      recovery:
        "Sign in before reading or saving actor-scoped relationship conversation records.",
    },
    ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED: {
      appCode: "SERVICE_UNAVAILABLE",
      message:
        "The live relationship conversation store is not configured.",
      recovery:
        "Configure the Orbit live database before using live relationship conversations.",
    },
  };

  return {
    success: false,
    error: {
      code,
      evidenceIds: ["evidence:conversation:async-not-found"],
      ...definitions[code],
    },
  };
}

function asyncConversationById(
  conversationId: string | null,
): AsyncConversationRecord | null {
  const selectedId =
    conversationId ?? asyncConversationRecords[0].selectedThread.conversationId;

  return (
    asyncConversationRecords.find(
      (record) => record.selectedThread.conversationId === selectedId,
    ) ?? null
  );
}

function asyncInboxItem(
  record: AsyncConversationRecord,
): AsyncConversationInboxItem {
  const latestMessage =
    record.selectedThread.messages[record.selectedThread.messages.length - 1];

  return {
    conversationId: record.selectedThread.conversationId,
    contactId: record.contact.contactId,
    participantName: record.contact.displayName,
    organization: record.contact.organization,
    subject: record.selectedThread.subject,
    preview: latestMessage?.body ?? record.selectedThread.summary,
    lastCorrespondenceAt: latestMessage?.occurredAt ?? record.event.occurredAt,
    unreadCount: record.selectedThread.messages.filter(
      (message: AsyncConversationMessage) => message.senderRole === "contact",
    ).length,
    nextActionLabel: record.nextActions[0]?.title ?? "Review relationship context",
    sourceContextLabels: record.selectedThread.sourceContextLabels,
  };
}

function normalizeAsyncConversationId(
  input?: AsyncConversationInput,
): string | null {
  const value = input?.conversationId;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAsyncUserId(input?: AsyncConversationInput): string {
  const value = input?.userId;

  return typeof value === "string" && value.trim()
    ? value.trim()
    : "test-user-orbit";
}

function cloneAsyncPayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function asyncWorkspacePayload(
  input?: AsyncConversationInput,
): AsyncConversationWorkspaceResult {
  const record = asyncConversationById(normalizeAsyncConversationId(input));

  if (!record) {
    return asyncFailure("ASYNC_CONVERSATION_NOT_FOUND");
  }

  return {
    success: true,
    data: cloneAsyncPayload({
      ...record,
      state: "success",
      currentUser: {
        userId: normalizeAsyncUserId(input),
        displayName: "Alex Tan",
        timezone: "Asia/Tokyo",
      },
      inbox: {
        title: "Relationship inbox",
        conversations: asyncConversationRecords.map(asyncInboxItem),
      },
      sideEffects: asyncNoSideEffects,
      provenance: {
        ...asyncConversationProvenance,
        evidenceIds: [
          ...record.connection.evidenceIds,
          ...record.draftReply.evidenceIds,
        ],
      },
    }),
  };
}

function stagePayloadFor(input: {
  actionId: string | null;
  record: AsyncConversationRecord;
}): AsyncConversationStagePayload | null {
  const nextAction =
    input.actionId === null
      ? input.record.nextActions[0]
      : input.record.nextActions.find(
          (action) => action.actionId === input.actionId,
        );

  if (!nextAction) {
    return null;
  }

  const draftReply: AsyncConversationDraftReply = input.record.draftReply;

  return {
    state: "staged",
    stage: {
      actionId: nextAction.actionId,
      conversationId: input.record.selectedThread.conversationId,
      status: "staged_local_preview",
      previewBody: draftReply.body,
      noSideEffectStatement:
        "No external message, notification, calendar entry, saved record, or network side effect occurred.",
      sourceContextLabel: nextAction.sourceContextLabel,
      stagedAt: "2026-07-08T09:30:00+09:00",
    },
    draftReply,
    nextAction,
    sideEffects: asyncNoSideEffects,
    provenance: {
      ...asyncConversationProvenance,
      evidenceIds: draftReply.evidenceIds,
      sourceLabel: "Mock staged asynchronous conversation action",
    },
  };
}

function normalizeAsyncActionId(
  input: AsyncConversationStageActionInput,
): string | null {
  const value = input.actionId;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asyncTrimmed(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function asyncSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || "new";
}

// 从确认后的消息草稿构建一个新的本地 staged 对话线程。
// 首条消息 = 草稿正文，发送方为当前用户，deliveryState=staged 本地预览；
// 不发送、不通知、不写日历、不落库、不联网。id/时间戳按输入确定性派生。
function createFromDraftPayload(
  input: AsyncConversationCreateFromDraftInput,
): AsyncConversationCreateResult {
  const subject = asyncTrimmed(input.subject);
  const body = asyncTrimmed(input.body);

  if (!subject || !body) {
    return asyncFailure("ASYNC_CONVERSATION_DRAFT_CONTEXT_REQUIRED");
  }

  const participantName = asyncTrimmed(input.participantName) || "New contact";
  const organization = asyncTrimmed(input.organization);
  const contactId =
    asyncTrimmed(input.contactId) || `contact:${asyncSlug(participantName)}`;
  const requestedStagedAt = asyncTrimmed(input.stagedAt);
  const stagedAt =
    requestedStagedAt && Number.isFinite(Date.parse(requestedStagedAt))
      ? new Date(requestedStagedAt).toISOString()
      : "2026-07-09T09:00:00+09:00";
  const liveSuffix = requestedStagedAt
    ? `-${asyncSlug(stagedAt)}`
    : "";
  const conversationId = `conversation:new:${asyncSlug(`${participantName}-${subject}`)}${liveSuffix}`;
  const sourceLabel =
    asyncTrimmed(input.sourceLabel) ||
    "Staged from a reviewed message draft";
  const sourceContextLabels = [sourceLabel];
  const evidenceId = `evidence:conversation:new:${asyncSlug(subject)}`;

  const firstMessage: AsyncConversationMessage = {
    messageId: `message:new:${asyncSlug(subject)}:1`,
    senderName: "Alex Tan",
    senderRole: "orbit_user",
    body,
    occurredAt: stagedAt,
    // 首条是本地草稿快照，未发送。
    deliveryState: "local_draft_snapshot",
    sourceContextLabel: sourceLabel,
    evidenceIds: [evidenceId],
  };

  const thread: AsyncConversationThread = {
    conversationId,
    threadId: `thread:new:${asyncSlug(subject)}`,
    subject,
    correspondenceMode: "asynchronous",
    realtimeTransportEnabled: false,
    messages: [firstMessage],
    summary: `New relationship thread staged from a reviewed draft to ${participantName}.`,
    sourceContextLabels,
  };

  const inboxItem: AsyncConversationInboxItem = {
    conversationId,
    contactId,
    participantName,
    organization,
    subject,
    preview: body,
    lastCorrespondenceAt: stagedAt,
    unreadCount: 0,
    nextActionLabel: "Review the staged draft before any send",
    sourceContextLabels,
  };

  return {
    success: true,
    data: cloneAsyncPayload({
      state: "staged_created",
      thread,
      inboxItem,
      noSideEffectStatement:
        "No external message, notification, calendar entry, saved record, or network side effect occurred. The thread is a local staged preview.",
      sideEffects: asyncNoSideEffects,
      provenance: {
        ...asyncConversationProvenance,
        evidenceIds: [evidenceId],
        sourceLabel: "Mock staged conversation created from a reviewed draft",
      },
    }),
  };
}

export function createMockAsyncRelationshipConversationService(): AsyncRelationshipConversationService {
  return {
    getCorrespondenceWorkspace(input = {}): AsyncConversationWorkspaceResult {
      return asyncWorkspacePayload(input);
    },

    stageConversationAction(
      input: AsyncConversationStageActionInput,
    ): AsyncConversationStageResult {
      const record = asyncConversationById(normalizeAsyncConversationId(input));

      if (!record) {
        return asyncFailure("ASYNC_CONVERSATION_NOT_FOUND");
      }

      const stage = stagePayloadFor({
        actionId: normalizeAsyncActionId(input),
        record,
      });

      if (!stage) {
        return asyncFailure("ASYNC_CONVERSATION_ACTION_NOT_FOUND");
      }

      return {
        success: true,
        data: cloneAsyncPayload(stage),
      };
    },

    createConversationFromDraft(
      input: AsyncConversationCreateFromDraftInput,
    ): AsyncConversationCreateResult {
      return createFromDraftPayload(input);
    },
  };
}

export type {
  ChatConversationListResult,
  ChatMessageThreadResult,
  ChatSendMessageResult,
};
