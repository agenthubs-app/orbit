import {
  type ChatWritingAssistAudit,
  type ChatWritingAssistKind,
  type ChatWritingAssistPayload,
  type ChatWritingAssistProvenance,
  type ChatWritingAssistSourceReference,
  type ChatWritingAssistSuggestion,
} from "./assist-contract";

export const CHAT_WRITING_ASSIST_FIXTURE_SOURCE =
  "fixture:features/chat/assist-fixtures.ts" as const;

export const CHAT_WRITING_ASSIST_DEFAULT_SOURCE_TEXT =
  "send me the pilot timing thing" as const;

const fixtureCollectedAt = "2026-06-25T23:58:00.000Z";

const mockOnlyExecutionFlags = {
  aiProviderRequested: false,
  externalSendRequested: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionMessageStorageRequested: false,
  productionAuditLogWriteExecuted: false,
} as const;

function source(input: {
  type: ChatWritingAssistSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ChatWritingAssistSourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-chat-writing-assist-rules",
  };
}

const mayaPilotTimingSource = source({
  type: "chat_summary",
  id: "source:chat-assist:maya:pilot-timing",
  label: "Maya pilot timing chat evidence",
  providerRecordId: "chat-summary:maya:pilot-timing",
});

const diegoCaseStudySource = source({
  type: "event_import",
  id: "source:chat-assist:diego:case-study",
  label: "Diego case study chat evidence",
  providerRecordId: "event:saas-operator-roundtable:diego",
});

function auditFor(
  sourceReference: ChatWritingAssistSourceReference,
): ChatWritingAssistAudit {
  return {
    sourceLabel: sourceReference.label,
    providerBoundary: "AI false, external send false, persistence false",
    verificationAction: `Review ${sourceReference.label}`,
  };
}

function assist(input: {
  assistId: string;
  kind: ChatWritingAssistKind;
  label: string;
  conversationId: string;
  participantName: string;
  organization: string;
  originalText: string;
  suggestedText: string;
  rationale: string;
  source: ChatWritingAssistSourceReference;
  evidenceIds: readonly string[];
}): ChatWritingAssistSuggestion {
  return {
    ...input,
    generatedBy: "mock-chat-writing-assist-rules",
    audit: auditFor(input.source),
    sendActionRequiresConfirmation: true,
    ...mockOnlyExecutionFlags,
  };
}

export const mockChatWritingAssists: readonly ChatWritingAssistSuggestion[] = [
  assist({
    assistId: "demo-chat-assist-rewrite",
    kind: "polite_rewrite",
    label: "Polite rewrite",
    conversationId: "demo-conversation-1",
    participantName: "Maya Chen",
    organization: "Kumo Grid",
    originalText: CHAT_WRITING_ASSIST_DEFAULT_SOURCE_TEXT,
    suggestedText:
      "Hi Maya, thanks for the breakfast conversation. I will send the pilot timing comparison with the operator-readiness notes attached.",
    rationale:
      "Keeps the reply direct while making the ask warmer and source-backed.",
    source: mayaPilotTimingSource,
    evidenceIds: [
      "evidence:chat-assist:rewrite",
      "evidence:chat:maya:pilot-timing",
    ],
  }),
  assist({
    assistId: "demo-chat-assist-followup",
    kind: "follow_up_draft",
    label: "Follow-up draft",
    conversationId: "demo-conversation-1",
    participantName: "Maya Chen",
    organization: "Kumo Grid",
    originalText:
      "Maya asked for the pilot timing comparison after breakfast.",
    suggestedText:
      "Hi Maya, following up from breakfast: I pulled together the two pilot timing windows and the operator questions we discussed. Which window would be most useful for your team to review first?",
    rationale:
      "Turns the relationship context into a concrete next message without sending it.",
    source: mayaPilotTimingSource,
    evidenceIds: [
      "evidence:chat-assist:followup",
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
  }),
  assist({
    assistId: "demo-chat-assist-appointment",
    kind: "appointment_suggestion",
    label: "Appointment suggestion",
    conversationId: "demo-conversation-2",
    participantName: "Diego Rivera",
    organization: "Northstar SaaS",
    originalText:
      "Diego wants a short case study before next week's regional planning meeting.",
    suggestedText:
      "Would Tuesday afternoon work for a 20-minute working session on the Japanese expansion case study?",
    rationale:
      "Suggests a meeting window while keeping calendar access outside the mock boundary.",
    source: diegoCaseStudySource,
    evidenceIds: [
      "evidence:chat-assist:appointment",
      "evidence:chat:diego:case-study",
    ],
  }),
  assist({
    assistId: "demo-chat-assist-greeting",
    kind: "quick_greeting",
    label: "Quick greeting",
    conversationId: "demo-conversation-1",
    participantName: "Maya Chen",
    organization: "Kumo Grid",
    originalText: "Start a warm chat greeting.",
    suggestedText:
      "Hi Maya, good to reconnect after the operator breakfast with Kumo Grid.",
    rationale:
      "Creates a low-friction opener from known relationship context.",
    source: mayaPilotTimingSource,
    evidenceIds: [
      "evidence:chat-assist:greeting",
      "evidence:chat:maya:breakfast",
    ],
  }),
] as const;

export const mockChatWritingAssistProvenance: ChatWritingAssistProvenance = {
  source: CHAT_WRITING_ASSIST_FIXTURE_SOURCE,
  sourceLabel: "Mock chat writing assist fixture",
  evidenceIds: [
    "evidence:chat-assist:rewrite",
    "evidence:chat-assist:followup",
    "evidence:chat-assist:appointment",
    "evidence:chat-assist:greeting",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-chat-writing-assist-only",
  generationMethod: "fixture",
  ...mockOnlyExecutionFlags,
};

export const mockChatWritingAssistFailureProvenance: ChatWritingAssistProvenance =
  {
    ...mockChatWritingAssistProvenance,
    sourceLabel: "Controlled chat writing assist mock failure",
    evidenceIds: ["evidence:chat-assist:controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockChatWritingAssistFixture: ChatWritingAssistPayload = {
  state: "success",
  assists: mockChatWritingAssists,
  summary:
    "Local rules prepared polite rewrite, follow-up draft, appointment suggestion, and quick greeting assists from source-backed chat context.",
  provenance: mockChatWritingAssistProvenance,
  nextAction:
    "Review source evidence and confirmation requirements before any external send action.",
};

export const mockEmptyChatWritingAssistFixture: ChatWritingAssistPayload = {
  state: "empty",
  assists: [],
  summary:
    "No chat writing assists are available because no source-backed chat context is present.",
  provenance: {
    ...mockChatWritingAssistProvenance,
    sourceLabel: "Empty chat writing assist fixture",
    evidenceIds: ["evidence:chat-assist:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add relationship context, chat evidence, or source notes before generating chat writing assistance.",
};

export const mockPendingChatWritingAssistFixture: ChatWritingAssistPayload = {
  state: "pending",
  assists: [],
  summary:
    "Chat writing assist fixtures are waiting on a local writing guard state.",
  provenance: {
    ...mockChatWritingAssistProvenance,
    sourceLabel: "Pending chat writing assist fixture",
    evidenceIds: ["evidence:chat-assist:pending-local-writing-guard"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local writing guard before showing assist suggestions.",
};
