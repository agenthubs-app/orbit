import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE =
  "fixture:features/chat/privacy-contract.ts" as const;

export const CHAT_PRIVACY_CONTROLS_ERROR_CODES = [
  "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
  "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
  "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
  "CHAT_PRIVACY_EMPTY",
  "CHAT_PRIVACY_PENDING",
  "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
  "CHAT_PRIVACY_MOCK_FAILED",
] as const;

export type ChatPrivacyControlsErrorCode =
  (typeof CHAT_PRIVACY_CONTROLS_ERROR_CODES)[number];

export type ChatPrivacyControlsScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatPrivacyControlsState = "success" | "empty" | "pending";

export interface ChatPrivacyControlsInput {
  conversationId?: string | null;
  scenario?: ChatPrivacyControlsScenario | string | null;
}

export interface ChatAnalysisOptInInput extends ChatPrivacyControlsInput {
  enabled?: boolean | null;
}

export interface ChatSensitiveShareInput extends ChatPrivacyControlsInput {
  confirmed?: boolean | null;
}

export interface ChatPrivacyControlsService {
  getPrivacyControls: (
    input?: ChatPrivacyControlsInput,
  ) => ChatPrivacyControlsResult;
  setAnalysisOptIn: (
    input: ChatAnalysisOptInInput,
  ) => ChatPrivacyControlsResult;
  requestAnalysisDeletion: (
    input?: ChatPrivacyControlsInput,
  ) => ChatPrivacyControlsResult;
  prepareSensitiveShare: (
    input: ChatSensitiveShareInput,
  ) => ChatPrivacyControlsResult;
}

export interface ChatPrivacyControlsErrorDefinition {
  code: ChatPrivacyControlsErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS = {
  CHAT_PRIVACY_CONVERSATION_ID_REQUIRED: {
    code: "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A chat conversation id is required before privacy controls can be evaluated.",
    recovery:
      "Keep privacy controls disabled until a known source-backed chat conversation is selected.",
  },
  CHAT_PRIVACY_CONVERSATION_NOT_FOUND: {
    code: "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "No mock chat privacy controls fixture matches that conversation id.",
    recovery:
      "Render the missing-conversation envelope and avoid live chat storage, deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED: {
    code: "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A boolean analysis opt-in value is required before the mock can update privacy controls.",
    recovery:
      "Render validation feedback and do not write live analysis settings, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_EMPTY: {
    code: "CHAT_PRIVACY_EMPTY",
    appCode: "CONFLICT",
    message:
      "No chat privacy controls can be rendered because no source-backed chat conversation is available.",
    recovery:
      "Add a source-backed chat conversation before rendering AI analysis, private-note, deletion, or sensitive-share controls.",
  },
  CHAT_PRIVACY_PENDING: {
    code: "CHAT_PRIVACY_PENDING",
    appCode: "CONFLICT",
    message:
      "The chat privacy controls mock boundary is waiting on a local privacy confirmation.",
    recovery:
      "Render the pending state and keep all privacy controls local; do not call live deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED: {
    code: "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
    appCode: "FORBIDDEN",
    message:
      "Sensitive chat context requires explicit confirmation before any share preview can proceed.",
    recovery:
      "Route the attempted share through a confirmation guard and keep private notes hidden until the user confirms.",
  },
  CHAT_PRIVACY_MOCK_FAILED: {
    code: "CHAT_PRIVACY_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat privacy controls mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
} as const satisfies Record<
  ChatPrivacyControlsErrorCode,
  ChatPrivacyControlsErrorDefinition
>;

export type ChatPrivacyControlsSourceReference = SourceReferenceDTO & {
  type: "manual" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-privacy-controls-rules";
};

export interface ChatAnalysisOptInState {
  enabled: boolean;
  status: "opted_in" | "opted_out" | "pending_confirmation";
  confirmationRequiredToDisable: true;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionPrivacyAuditLogWritten: false;
}

export interface ChatAnalysisDeletionState {
  status: "available" | "pending" | "deleted_mock_only";
  deletedInMock?: true;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules";
  productionDataDeletionExecuted: false;
  productionPrivacyAuditLogWritten: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

export interface ChatPrivateNote {
  noteId: string;
  conversationId: string;
  visibility: "hidden";
  bodyRedacted: true;
  redactedPreview: string;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules";
  visibleToAiAnalysis: false;
  visibleInSharePreview: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
}

export interface ChatSensitiveShareConfirmation {
  confirmationRequired: boolean;
  status: "required" | "pending_confirmation" | "confirmed_mock_only";
  canShareWithoutConfirmation: false;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules";
  externalActionExecuted: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionPrivacyAuditLogWritten: false;
}

export interface ChatPrivacyControlsProvenance {
  source: typeof CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-chat-privacy-controls-only";
  generationMethod:
    | "fixture"
    | "rule-based-analysis-toggle"
    | "rule-based-analysis-deletion"
    | "rule-based-sensitive-share"
    | "rule-based-state";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionDataDeletionExecuted: false;
  productionPrivacyAuditLogWritten: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

export interface ChatPrivacyControlsPayload {
  state: ChatPrivacyControlsState;
  conversationId: string;
  participantName: string;
  organization: string;
  analysisOptIn: ChatAnalysisOptInState;
  analysisDeletion: ChatAnalysisDeletionState;
  privateNotes: readonly ChatPrivateNote[];
  sensitiveShareConfirmation: ChatSensitiveShareConfirmation;
  provenance: ChatPrivacyControlsProvenance;
  nextAction: string;
}

export interface ChatPrivacyControlsSuccess {
  success: true;
  data: ChatPrivacyControlsPayload;
}

export interface ChatPrivacyControlsFailure {
  success: false;
  error: ChatPrivacyControlsErrorDefinition & {
    state: "failure";
    provenance: ChatPrivacyControlsProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatPrivacyControlsResult =
  | ChatPrivacyControlsSuccess
  | ChatPrivacyControlsFailure;

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

export function chatPrivacyControlsFailureToAppError(
  failure: ChatPrivacyControlsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatPrivacyControlsFailureContext(
  failure: ChatPrivacyControlsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatPrivacyControlsErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock chat privacy controls failure came from deterministic fixture rules.",
    service: "chat-privacy-controls-mock",
  };
}
