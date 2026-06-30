import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const CHAT_WRITING_ASSIST_FIXTURE_SOURCE =
  "fixture:features/chat/assist-contract.ts" as const;
// Chat Writing Assist contract 描述聊天文案辅助的结果协议。
// mock/live 的具体生成策略和数据由各自实现提供。

export const CHAT_WRITING_ASSIST_KINDS = [
  "polite_rewrite",
  "follow_up_draft",
  "appointment_suggestion",
  "quick_greeting",
] as const;

export const CHAT_WRITING_ASSIST_ERROR_CODES = [
  "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
  "CHAT_WRITING_ASSIST_EMPTY",
  "CHAT_WRITING_ASSIST_PENDING",
  "CHAT_WRITING_ASSIST_MOCK_FAILED",
] as const;

export const CHAT_WRITING_ASSIST_DEFAULT_SOURCE_TEXT =
  "send me the pilot timing thing" as const;

export type ChatWritingAssistKind =
  (typeof CHAT_WRITING_ASSIST_KINDS)[number];

export type ChatWritingAssistErrorCode =
  (typeof CHAT_WRITING_ASSIST_ERROR_CODES)[number];

export type ChatWritingAssistScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatWritingAssistState = "success" | "empty" | "pending";
// 输入既可以来自已有会话，也可以来自用户给出的 sourceText/contextNote。

export interface ChatWritingAssistInput {
  scenario?: ChatWritingAssistScenario | string | null;
  conversationId?: string | null;
  participantName?: string | null;
  organization?: string | null;
  sourceText?: string | null;
  contextNote?: string | null;
  preferredWindow?: string | null;
}

export interface ChatWritingAssistService {
  rewritePolitely: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistResult;
  draftFollowup: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistResult;
  suggestAppointment: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistResult;
  createQuickGreeting: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistResult;
}

export interface ChatWritingAssistErrorDefinition {
  code: ChatWritingAssistErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}
// 写作辅助失败时必须停在本地，不能补调用 live AI 或发送通道。

export const CHAT_WRITING_ASSIST_ERROR_DEFINITIONS = {
  CHAT_WRITING_ASSIST_INPUT_REQUIRED: {
    code: "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A non-empty chat source text or relationship context is required before the mock writing assist can respond.",
    recovery:
      "Keep writing assist controls disabled until local chat text, relationship context, or source evidence is present.",
  },
  CHAT_WRITING_ASSIST_EMPTY: {
    code: "CHAT_WRITING_ASSIST_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock chat writing assist can be generated because no source-backed chat context is available.",
    recovery:
      "Add relationship context, chat evidence, or source notes before generating chat writing assistance.",
  },
  CHAT_WRITING_ASSIST_PENDING: {
    code: "CHAT_WRITING_ASSIST_PENDING",
    appCode: "CONFLICT",
    message:
      "The chat writing assist mock boundary is waiting on a local writing guard.",
    recovery:
      "Render the pending state and do not call AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  CHAT_WRITING_ASSIST_MOCK_FAILED: {
    code: "CHAT_WRITING_ASSIST_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat writing assist mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
} as const satisfies Record<
  ChatWritingAssistErrorCode,
  ChatWritingAssistErrorDefinition
>;

export type ChatWritingAssistSourceReference = SourceReferenceDTO & {
  type: "manual" | "event_import" | "email_signal" | "calendar_signal" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-writing-assist-rules";
};
// audit 提醒 UI：生成结果只是草稿，需要人工复核。

export interface ChatWritingAssistAudit {
  sourceLabel: string;
  providerBoundary: "AI false, external send false, persistence false";
  verificationAction: `Review ${string}`;
}
// Suggestion 是可编辑草稿；sendActionRequiresConfirmation=true 表示不能直接发送。

export interface ChatWritingAssistSuggestion {
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
  generatedBy: "mock-chat-writing-assist-rules";
  audit: ChatWritingAssistAudit;
  sendActionRequiresConfirmation: true;
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionMessageStorageRequested: false;
  productionAuditLogWriteExecuted: false;
}
// provenance 记录草稿生成方法和所有未触发的外部能力。

export interface ChatWritingAssistProvenance {
  source: typeof CHAT_WRITING_ASSIST_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-chat-writing-assist-only";
  generationMethod:
    | "fixture"
    | "rule-based-politeness-rewrite"
    | "rule-based-follow-up-draft"
    | "rule-based-appointment-suggestion"
    | "rule-based-quick-greeting"
    | "rule-based-state";
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionMessageStorageRequested: false;
  productionAuditLogWriteExecuted: false;
}

export interface ChatWritingAssistPayload {
  state: ChatWritingAssistState;
  assists: readonly ChatWritingAssistSuggestion[];
  summary: string;
  provenance: ChatWritingAssistProvenance;
  nextAction: string;
}

export interface ChatWritingAssistSuccess {
  success: true;
  data: ChatWritingAssistPayload;
}

export interface ChatWritingAssistFailure {
  success: false;
  error: ChatWritingAssistErrorDefinition & {
    state: "failure";
    provenance: ChatWritingAssistProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatWritingAssistResult =
  | ChatWritingAssistSuccess
  | ChatWritingAssistFailure;

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

const localWritingGuardSource = source({
  type: "system",
  id: "source:chat-assist:local-writing-guard",
  label: "Local chat writing guard",
  providerRecordId: "mock-writing-guard:chat-assist",
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

export function chatWritingAssistFailureToAppError(
  failure: ChatWritingAssistFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatWritingAssistFailureContext(
  failure: ChatWritingAssistFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatWritingAssistErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock chat writing assist failure came from deterministic fixture rules.",
    service: "chat-writing-assist-mock",
  };
}
