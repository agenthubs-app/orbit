import {
  type ChatSummaryExtractionPayload,
  type ChatSummaryExtractionProvenance,
  type ChatSummaryRecord,
  type ChatSummarySourceReference,
  type ConfirmationRequiredProfileSuggestion,
  type ExtractedNeed,
  type ExtractedTask,
  type RelationshipProfileUpdate,
} from "./summary-contract";

export const CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE =
  "fixture:features/chat/summary-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:59:00.000Z";

const mockOnlyExecutionFlags = {
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
  automaticProfileMutationExecuted: false,
} as const;

function source(input: {
  type: ChatSummarySourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ChatSummarySourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-chat-summary-extraction-rules",
  };
}

const mayaPilotTimingSource = source({
  type: "manual",
  id: "source:chat-summary:maya:pilot-timing",
  label: "Maya pilot timing chat evidence",
  providerRecordId: "conversation:demo-conversation-1",
});

export const mockChatSummaryRecord: ChatSummaryRecord = {
  summaryId: "demo-chat-summary-maya-pilot",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  narrative:
    "Maya Chen asked for a pilot timing comparison tied to operator readiness questions from the Tokyo climate breakfast. The sensible follow-up is to send two pilot windows and ask which operator concern Kumo Grid wants resolved first.",
  source: mayaPilotTimingSource,
  evidenceIds: [
    "evidence:chat:maya:breakfast",
    "evidence:chat:maya:pilot-timing",
  ],
  extractedNeedIds: ["need:chat:maya:pilot-window"],
  extractedTaskIds: ["task:chat:maya:send-pilot-comparison"],
  relationshipProfileUpdateIds: [
    "profile-update:chat:maya:operator-readiness",
  ],
  confirmationRequiredSuggestionIds: [
    "profile-suggestion:chat:maya:priority-topic",
  ],
  generatedBy: "mock-chat-summary-extraction-rules",
  generationMethod: "fixture",
  ...mockOnlyExecutionFlags,
};

export const mockExtractedNeeds: readonly ExtractedNeed[] = [
  {
    needId: "need:chat:maya:pilot-window",
    conversationId: "demo-conversation-1",
    contactId: "demo-contact-maya",
    statement:
      "Maya needs an operator readiness comparison for two pilot timing windows before deciding the next review step.",
    priority: "high",
    source: mayaPilotTimingSource,
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    generatedBy: "mock-chat-summary-extraction-rules",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
];

export const mockExtractedTasks: readonly ExtractedTask[] = [
  {
    taskId: "task:chat:maya:send-pilot-comparison",
    conversationId: "demo-conversation-1",
    title: "Send Maya the pilot timing comparison",
    dueHint: "After the Tokyo climate operator breakfast follow-up",
    rationale:
      "The chat evidence asks for a concrete comparison before Kumo Grid reviews operator readiness.",
    source: mayaPilotTimingSource,
    evidenceIds: ["evidence:chat:maya:pilot-timing"],
    generatedBy: "mock-chat-summary-extraction-rules",
    notificationDelivered: false,
    liveDatabaseWriteExecuted: false,
  },
];

export const mockRelationshipProfileUpdates: readonly RelationshipProfileUpdate[] =
  [
    {
      updateId: "profile-update:chat:maya:operator-readiness",
      connectionId: "demo-connection-maya",
      field: "latestContext",
      proposedValue:
        "Maya is comparing pilot timing windows through the lens of operator readiness.",
      reason:
        "The chat summary has source evidence but the mock must not mutate the live relationship profile.",
      source: mayaPilotTimingSource,
      evidenceIds: ["evidence:chat:maya:pilot-timing"],
      autoApplied: false,
      automaticProfileMutationExecuted: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockConfirmationRequiredProfileSuggestions: readonly ConfirmationRequiredProfileSuggestion[] =
  [
    {
      suggestionId: "profile-suggestion:chat:maya:priority-topic",
      connectionId: "demo-connection-maya",
      field: "priorityTopic",
      proposedValue: "Operator readiness pilot timing",
      reason:
        "Updating a relationship profile from chat extraction requires human review.",
      guard: "profile confirmation guard",
      source: mayaPilotTimingSource,
      evidenceIds: [
        "evidence:chat:maya:breakfast",
        "evidence:chat:maya:pilot-timing",
      ],
      confirmationRequired: true,
      autoApplied: false,
      automaticProfileMutationExecuted: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockChatSummaryExtractionProvenance: ChatSummaryExtractionProvenance =
  {
    source: CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE,
    sourceLabel: "Mock chat summary and extraction fixture",
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-chat-summary-extraction-only",
    generationMethod: "fixture",
    ...mockOnlyExecutionFlags,
  };

export const mockChatSummaryExtractionFailureProvenance: ChatSummaryExtractionProvenance =
  {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Controlled chat summary and extraction mock failure",
    evidenceIds: ["evidence:chat-summary:controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockChatSummaryFixture: ChatSummaryExtractionPayload = {
  state: "success",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: mockChatSummaryRecord,
  extractedNeeds: mockExtractedNeeds,
  extractedTasks: mockExtractedTasks,
  relationshipProfileUpdates: mockRelationshipProfileUpdates,
  confirmationRequiredProfileSuggestions:
    mockConfirmationRequiredProfileSuggestions,
  provenance: mockChatSummaryExtractionProvenance,
  nextAction:
    "Review extracted needs, tasks, and profile suggestions before any profile confirmation or follow-up action.",
};

export const mockChatExtractionFixture: ChatSummaryExtractionPayload = {
  ...mockChatSummaryFixture,
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Mock chat extraction fixture",
    generationMethod: "rule-based-extraction",
  },
};

export const mockEmptyChatSummaryFixture: ChatSummaryExtractionPayload = {
  state: "empty",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: null,
  extractedNeeds: [],
  extractedTasks: [],
  relationshipProfileUpdates: [],
  confirmationRequiredProfileSuggestions: [],
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Empty chat summary fixture",
    evidenceIds: ["evidence:chat-summary:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add source-backed chat messages or relationship context before generating a summary.",
};

export const mockPendingChatExtractionFixture: ChatSummaryExtractionPayload = {
  state: "pending",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: null,
  extractedNeeds: [],
  extractedTasks: [],
  relationshipProfileUpdates: [],
  confirmationRequiredProfileSuggestions: [],
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Pending chat extraction fixture",
    evidenceIds: ["evidence:chat-summary:pending-local-extraction-guard"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local extraction guard before rendering extracted relationship signals.",
};
