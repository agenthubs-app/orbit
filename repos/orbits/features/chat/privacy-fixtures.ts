import {
  type ChatAnalysisDeletionState,
  type ChatAnalysisOptInState,
  type ChatPrivacyControlsPayload,
  type ChatPrivacyControlsProvenance,
  type ChatPrivacyControlsSourceReference,
  type ChatPrivateNote,
  type ChatSensitiveShareConfirmation,
} from "./privacy-contract";

export const CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE =
  "fixture:features/chat/privacy-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:57:00.000Z";
const demoConversationId = "demo-conversation-privacy-1";

const mockOnlyExecutionFlags = {
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionDataDeletionExecuted: false,
  productionPrivacyAuditLogWritten: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
} as const;

function source(input: {
  type: ChatPrivacyControlsSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ChatPrivacyControlsSourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-chat-privacy-controls-rules",
  };
}

const mayaPrivacySource = source({
  type: "chat_summary",
  id: "source:chat-privacy:maya:controls",
  label: "Maya chat privacy controls evidence",
  providerRecordId: demoConversationId,
});

const localPrivacyGuardSource = source({
  type: "system",
  id: "source:chat-privacy:local-privacy-confirmation",
  label: "Local chat privacy confirmation guard",
  providerRecordId: "mock-privacy-guard:chat-controls",
});

export const mockChatPrivacyControlsProvenance: ChatPrivacyControlsProvenance =
  {
    source: CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE,
    sourceLabel: "Mock chat privacy controls fixture",
    evidenceIds: [
      "evidence:chat-privacy:maya:analysis-opt-in",
      "evidence:chat-privacy:maya:private-note-hidden",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-chat-privacy-controls-only",
    generationMethod: "fixture",
    ...mockOnlyExecutionFlags,
  };

export const mockChatPrivacyControlsFailureProvenance: ChatPrivacyControlsProvenance =
  {
    ...mockChatPrivacyControlsProvenance,
    sourceLabel: "Controlled chat privacy controls mock failure",
    evidenceIds: ["evidence:chat-privacy:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const optedInState: ChatAnalysisOptInState = {
  enabled: true,
  status: "opted_in",
  confirmationRequiredToDisable: true,
  source: mayaPrivacySource,
  evidenceIds: ["evidence:chat-privacy:maya:analysis-opt-in"],
  generatedBy: "mock-chat-privacy-controls-rules",
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionPrivacyAuditLogWritten: false,
};

const availableDeletionState: ChatAnalysisDeletionState = {
  status: "available",
  source: mayaPrivacySource,
  evidenceIds: ["evidence:chat-privacy:maya:analysis-delete-available"],
  generatedBy: "mock-chat-privacy-controls-rules",
  productionDataDeletionExecuted: false,
  productionPrivacyAuditLogWritten: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
};

const hiddenPrivateNotes: readonly ChatPrivateNote[] = [
  {
    noteId: "private-note:chat-privacy:maya:pricing-boundary",
    conversationId: demoConversationId,
    visibility: "hidden",
    bodyRedacted: true,
    redactedPreview: "[private note hidden from AI analysis and share preview]",
    source: mayaPrivacySource,
    evidenceIds: ["evidence:chat-privacy:maya:private-note-hidden"],
    generatedBy: "mock-chat-privacy-controls-rules",
    visibleToAiAnalysis: false,
    visibleInSharePreview: false,
    aiProviderRequested: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
  },
];

const requiredShareConfirmation: ChatSensitiveShareConfirmation = {
  confirmationRequired: true,
  status: "required",
  canShareWithoutConfirmation: false,
  source: mayaPrivacySource,
  evidenceIds: ["evidence:chat-privacy:maya:sensitive-share-confirmation"],
  generatedBy: "mock-chat-privacy-controls-rules",
  externalActionExecuted: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionPrivacyAuditLogWritten: false,
};

export const mockChatPrivacyControlsFixture: ChatPrivacyControlsPayload = {
  state: "success",
  conversationId: demoConversationId,
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  analysisOptIn: optedInState,
  analysisDeletion: availableDeletionState,
  privateNotes: hiddenPrivateNotes,
  sensitiveShareConfirmation: requiredShareConfirmation,
  provenance: mockChatPrivacyControlsProvenance,
  nextAction:
    "Review analysis opt-in, hidden private notes, deletion availability, and sensitive-share confirmation before exposing chat context to AI or external actions.",
};

export const mockEmptyChatPrivacyControlsFixture: ChatPrivacyControlsPayload = {
  ...mockChatPrivacyControlsFixture,
  state: "empty",
  analysisOptIn: {
    ...optedInState,
    enabled: false,
    status: "opted_out",
  },
  analysisDeletion: {
    ...availableDeletionState,
    status: "available",
    evidenceIds: ["evidence:chat-privacy:empty"],
  },
  privateNotes: [],
  sensitiveShareConfirmation: {
    ...requiredShareConfirmation,
    evidenceIds: ["evidence:chat-privacy:empty"],
  },
  provenance: {
    ...mockChatPrivacyControlsProvenance,
    sourceLabel: "Empty chat privacy controls fixture",
    evidenceIds: ["evidence:chat-privacy:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add a source-backed chat conversation before rendering AI analysis, private-note, deletion, or sensitive-share controls.",
};

export const mockPendingChatPrivacyControlsFixture: ChatPrivacyControlsPayload =
  {
    ...mockChatPrivacyControlsFixture,
    state: "pending",
    analysisOptIn: {
      ...optedInState,
      enabled: true,
      status: "pending_confirmation",
      source: localPrivacyGuardSource,
      evidenceIds: [
        "evidence:chat-privacy:pending-local-privacy-confirmation",
      ],
    },
    analysisDeletion: {
      ...availableDeletionState,
      status: "pending",
      source: localPrivacyGuardSource,
      evidenceIds: [
        "evidence:chat-privacy:pending-local-privacy-confirmation",
      ],
    },
    sensitiveShareConfirmation: {
      ...requiredShareConfirmation,
      status: "pending_confirmation",
      source: localPrivacyGuardSource,
      evidenceIds: [
        "evidence:chat-privacy:pending-local-privacy-confirmation",
      ],
    },
    provenance: {
      ...mockChatPrivacyControlsProvenance,
      sourceLabel: "Pending chat privacy controls fixture",
      evidenceIds: [
        "evidence:chat-privacy:pending-local-privacy-confirmation",
      ],
      generationMethod: "rule-based-state",
    },
    nextAction:
      "Resolve the local privacy confirmation before changing analysis opt-in, deleting analysis, or preparing a sensitive share preview.",
  };

export const mockChatPrivacyControlsToggleOffFixture: ChatPrivacyControlsPayload =
  {
    ...mockChatPrivacyControlsFixture,
    analysisOptIn: {
      ...optedInState,
      enabled: false,
      status: "opted_out",
      evidenceIds: ["evidence:chat-privacy:maya:analysis-opt-out"],
      liveDatabaseWriteExecuted: false,
      productionPrivacyAuditLogWritten: false,
    },
    provenance: {
      ...mockChatPrivacyControlsProvenance,
      evidenceIds: ["evidence:chat-privacy:maya:analysis-opt-out"],
      generationMethod: "rule-based-analysis-toggle",
      liveDatabaseWriteExecuted: false,
      productionPrivacyAuditLogWritten: false,
    },
    nextAction:
      "Mock analysis opt-out recorded locally; live analysis settings, deletion workers, and privacy audit logs were not called.",
  };

export const mockChatPrivacyControlsToggleOnFixture: ChatPrivacyControlsPayload =
  {
    ...mockChatPrivacyControlsFixture,
    analysisOptIn: {
      ...optedInState,
      enabled: true,
      status: "opted_in",
      evidenceIds: ["evidence:chat-privacy:maya:analysis-opt-in"],
    },
    provenance: {
      ...mockChatPrivacyControlsProvenance,
      generationMethod: "rule-based-analysis-toggle",
    },
  };

export const mockChatPrivacyAnalysisDeletedFixture: ChatPrivacyControlsPayload =
  {
    ...mockChatPrivacyControlsFixture,
    analysisDeletion: {
      ...availableDeletionState,
      status: "deleted_mock_only",
      deletedInMock: true,
      evidenceIds: ["evidence:chat-privacy:maya:analysis-deleted-mock"],
      productionDataDeletionExecuted: false,
      productionPrivacyAuditLogWritten: false,
    },
    provenance: {
      ...mockChatPrivacyControlsProvenance,
      evidenceIds: ["evidence:chat-privacy:maya:analysis-deleted-mock"],
      generationMethod: "rule-based-analysis-deletion",
      productionDataDeletionExecuted: false,
      productionPrivacyAuditLogWritten: false,
    },
    nextAction:
      "Mock analysis deletion state recorded; production deletion workers and privacy audit logs were not called.",
  };

export const mockChatPrivacySensitiveShareConfirmedFixture: ChatPrivacyControlsPayload =
  {
    ...mockChatPrivacyControlsFixture,
    sensitiveShareConfirmation: {
      ...requiredShareConfirmation,
      confirmationRequired: true,
      status: "confirmed_mock_only",
      canShareWithoutConfirmation: false,
      evidenceIds: ["evidence:chat-privacy:maya:sensitive-share-confirmed"],
      externalActionExecuted: false,
    },
    provenance: {
      ...mockChatPrivacyControlsProvenance,
      evidenceIds: ["evidence:chat-privacy:maya:sensitive-share-confirmed"],
      generationMethod: "rule-based-sensitive-share",
    },
    nextAction:
      "Sensitive share confirmation was acknowledged in mock mode only; no external action was executed.",
  };
