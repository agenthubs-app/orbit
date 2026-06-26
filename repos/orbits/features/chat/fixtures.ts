import type {
  ChatConversationListPayload,
  ChatConversationMockProvenance,
  ChatConversationSummary,
  ChatMessage,
  ChatMessageThreadPayload,
  ChatSendMessagePayload,
  ChatSendMessageState,
  ChatSourceReference,
} from "./contract";
import { CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE } from "./contract";

const fixtureCollectedAt = "2026-06-25T23:50:00.000Z";

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

function source(input: {
  type: ChatSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ChatSourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-chat-conversation-rules",
  };
}

export const chatBreakfastSource = source({
  type: "manual",
  id: "source:chat:maya:breakfast-note",
  label: "Tokyo climate operator breakfast note",
  providerRecordId: "note:tokyo-climate-breakfast:maya",
});

export const chatPilotTimingSource = source({
  type: "chat_summary",
  id: "source:chat:maya:pilot-timing-summary",
  label: "Pilot timing follow-up",
  providerRecordId: "chat-summary:maya:pilot-timing",
});

export const chatCaseStudySource = source({
  type: "event_import",
  id: "source:chat:diego:case-study-roster",
  label: "SaaS operator roundtable roster",
  providerRecordId: "event:saas-operator-roundtable:diego",
});

export const chatLocalSendSource = source({
  type: "system",
  id: "source:chat:local-send-rule",
  label: "Local mock send rule",
  providerRecordId: "mock-send-rule:chat-conversation",
});

export const readySendMessageState: ChatSendMessageState = {
  status: "ready",
  canSendInMock: true,
  reason:
    "The mock can record a local message preview, but live delivery still requires explicit confirmation before provider wiring.",
  confirmationRequiredBeforeLiveSend: true,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalSendRequested: false,
};

export const pendingSendMessageState: ChatSendMessageState = {
  status: "pending_confirmation",
  canSendInMock: false,
  reason:
    "The local chat transport handshake fixture is pending, so message controls stay read-only.",
  confirmationRequiredBeforeLiveSend: true,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalSendRequested: false,
};

export const blockedSendMessageState: ChatSendMessageState = {
  status: "blocked",
  canSendInMock: false,
  reason:
    "A source-backed one-to-one chat context is required before recording mock messages.",
  confirmationRequiredBeforeLiveSend: true,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalSendRequested: false,
};

export const mockChatConversations: readonly ChatConversationSummary[] = [
  {
    conversationId: "demo-conversation-1",
    status: "needs_followup",
    title: "Pilot timing follow-up",
    participantContactId: "demo-contact-maya",
    participantName: "Maya Chen",
    organization: "Kumo Grid",
    lastMessagePreview:
      "Let's compare pilot windows after the operator breakfast.",
    lastMessageAt: "2026-06-25T10:35:00.000Z",
    unreadCount: 1,
    oneToOneContext: {
      contactId: "demo-contact-maya",
      participantName: "Maya Chen",
      organization: "Kumo Grid",
      relationshipStage: "active_collaboration",
      relationshipReason:
        "Met at the Tokyo climate operator breakfast and discussed grid storage pilot readiness.",
      latestContext:
        "Maya asked for a pilot timing comparison after the breakfast conversation.",
      recommendedFollowup:
        "Send the two-window pilot comparison and ask which operator questions matter most.",
      source: chatBreakfastSource,
      evidenceIds: [
        "evidence:chat:maya:breakfast",
        "evidence:chat:maya:pilot-timing",
      ],
    },
    source: chatPilotTimingSource,
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    ...mockOnlyExecutionFlags,
  },
  {
    conversationId: "demo-conversation-2",
    status: "active",
    title: "Case study request",
    participantContactId: "demo-contact-diego",
    participantName: "Diego Rivera",
    organization: "Northstar SaaS",
    lastMessagePreview:
      "Diego asked for the Japanese expansion case study from the roundtable.",
    lastMessageAt: "2026-06-24T15:15:00.000Z",
    unreadCount: 0,
    oneToOneContext: {
      contactId: "demo-contact-diego",
      participantName: "Diego Rivera",
      organization: "Northstar SaaS",
      relationshipStage: "active_collaboration",
      relationshipReason:
        "Connected through the SaaS operator roundtable and a concrete case-study request.",
      latestContext:
        "Diego wants a short case study before next week's regional planning meeting.",
      recommendedFollowup:
        "Share the case study and offer a 20-minute working session.",
      source: chatCaseStudySource,
      evidenceIds: [
        "evidence:chat:diego:roundtable",
        "evidence:chat:diego:case-study",
      ],
    },
    source: chatCaseStudySource,
    evidenceIds: [
      "evidence:chat:diego:roundtable",
      "evidence:chat:diego:case-study",
    ],
    ...mockOnlyExecutionFlags,
  },
] as const;

export const mockChatMessages: readonly ChatMessage[] = [
  {
    messageId: "demo-message-1",
    conversationId: "demo-conversation-1",
    senderRole: "contact",
    senderName: "Maya Chen",
    body:
      "The breakfast discussion on operator readiness was useful. Can you send the pilot timing comparison you mentioned?",
    createdAt: "2026-06-25T10:20:00.000Z",
    deliveryState: "mock_received",
    source: chatBreakfastSource,
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    ...mockOnlyExecutionFlags,
  },
  {
    messageId: "demo-message-2",
    conversationId: "demo-conversation-1",
    senderRole: "orbit_user",
    senderName: "Alex Tan",
    body:
      "Yes. I will compare the two pilot timing windows and keep the notes tied to the operator questions from breakfast.",
    createdAt: "2026-06-25T10:35:00.000Z",
    deliveryState: "mock_recorded_locally",
    source: chatPilotTimingSource,
    evidenceIds: [
      "evidence:chat:maya:pilot-timing",
      "evidence:chat:mock-reply",
    ],
    ...mockOnlyExecutionFlags,
  },
  {
    messageId: "demo-message-3",
    conversationId: "demo-conversation-2",
    senderRole: "contact",
    senderName: "Diego Rivera",
    body:
      "Could you send the Japanese expansion case study before our regional planning meeting?",
    createdAt: "2026-06-24T15:15:00.000Z",
    deliveryState: "mock_received",
    source: chatCaseStudySource,
    evidenceIds: [
      "evidence:chat:diego:roundtable",
      "evidence:chat:diego:case-study",
    ],
    ...mockOnlyExecutionFlags,
  },
] as const;

export const mockChatConversationProvenance: ChatConversationMockProvenance = {
  source: CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE,
  sourceLabel: "Mock chat conversation fixture",
  evidenceIds: [
    "evidence:chat:maya:breakfast",
    "evidence:chat:maya:pilot-timing",
    "evidence:chat:diego:case-study",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-chat-conversation-only",
  generationMethod: "fixture",
  ...mockOnlyExecutionFlags,
};

export const mockChatConversationFailureProvenance: ChatConversationMockProvenance =
  {
    ...mockChatConversationProvenance,
    sourceLabel: "Controlled chat conversation mock failure",
    evidenceIds: ["evidence:chat:controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockChatConversationListFixture: ChatConversationListPayload = {
  state: "success",
  conversations: mockChatConversations,
  summary:
    "Two one-to-one chat conversations are available from local relationship context fixtures.",
  provenance: mockChatConversationProvenance,
  nextAction:
    "Open a thread, review source evidence, and keep live delivery behind confirmation.",
};

export const mockEmptyChatConversationFixture: ChatConversationListPayload = {
  state: "empty",
  conversations: [],
  summary:
    "No chat conversations are available because no one-to-one relationship context is present.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Empty chat conversation fixture",
    evidenceIds: ["evidence:chat:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add relationship context or source evidence before rendering chat conversations.",
};

export const mockPendingChatConversationFixture: ChatConversationListPayload = {
  state: "pending",
  conversations: [],
  summary:
    "Chat conversation fixtures are waiting on a local transport handshake state.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Pending chat conversation fixture",
    evidenceIds: ["evidence:chat:pending-local-transport"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local transport handshake fixture before showing chat messages.",
};

export const mockChatThreadFixture: ChatMessageThreadPayload = {
  state: "success",
  conversation: mockChatConversations[0],
  messages: mockChatMessages.filter(
    (message) => message.conversationId === "demo-conversation-1",
  ),
  sendMessageState: readySendMessageState,
  oneToOneContext: mockChatConversations[0].oneToOneContext,
  summary:
    "The Maya Chen thread keeps every message attached to relationship evidence and local mock provenance.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Mock chat thread fixture",
    generationMethod: "rule-based-thread",
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
  },
  nextAction:
    "Draft a local reply only after reviewing the source evidence and live-send confirmation requirement.",
};

export const mockEmptyChatThreadFixture: ChatMessageThreadPayload = {
  state: "empty",
  conversation: mockChatConversations[0],
  messages: [],
  sendMessageState: blockedSendMessageState,
  oneToOneContext: mockChatConversations[0].oneToOneContext,
  summary:
    "No source-backed messages exist yet for this one-to-one chat context.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Empty chat thread fixture",
    evidenceIds: ["evidence:chat:empty-thread"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Attach source evidence before recording the first local mock message.",
};

export const mockPendingChatThreadFixture: ChatMessageThreadPayload = {
  state: "pending",
  conversation: mockChatConversations[0],
  messages: [],
  sendMessageState: pendingSendMessageState,
  oneToOneContext: mockChatConversations[0].oneToOneContext,
  summary:
    "The local chat thread is pending while the transport handshake fixture resolves.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Pending chat thread fixture",
    evidenceIds: ["evidence:chat:pending-local-transport"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Keep send controls disabled until the local pending state resolves.",
};

const pendingLocalMessage: ChatMessage = {
  messageId: "demo-message-pending",
  conversationId: "demo-conversation-1",
  senderRole: "orbit_user",
  senderName: "Alex Tan",
  body: "Pending local mock message.",
  createdAt: "2026-06-25T23:55:00.000Z",
  deliveryState: "not_sent",
  source: chatLocalSendSource,
  evidenceIds: ["evidence:chat:pending-local-transport"],
  ...mockOnlyExecutionFlags,
};

export const mockPendingChatSendFixture: ChatSendMessagePayload = {
  state: "pending",
  conversationId: "demo-conversation-1",
  message: pendingLocalMessage,
  messages: mockChatThreadFixture.messages,
  sendMessageState: pendingSendMessageState,
  oneToOneContext: mockChatConversations[0].oneToOneContext,
  summary:
    "The mock send action is pending and has not written production message storage.",
  provenance: {
    ...mockChatConversationProvenance,
    sourceLabel: "Pending chat send fixture",
    evidenceIds: ["evidence:chat:pending-local-transport"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local pending state before recording another mock message.",
};
