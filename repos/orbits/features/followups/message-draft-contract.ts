import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Message Draft Generator contract 描述跟进消息草稿的生成和编辑流程。
// 草稿只供用户复核；mock/live 的具体数据和执行策略由各自实现提供。

export const MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS = [
  "greeting",
  "follow_up",
  "appointment",
  "introduction_request",
  "invitation",
  "thank_you",
] as const;

export const MESSAGE_DRAFT_GENERATOR_ERROR_CODES = [
  "MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED",
  "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND",
  "MESSAGE_DRAFT_GENERATOR_EMPTY",
  "MESSAGE_DRAFT_GENERATOR_PENDING",
  "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
] as const;

export type MessageDraftKind =
  (typeof MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS)[number];

export type MessageDraftGeneratorErrorCode =
  (typeof MESSAGE_DRAFT_GENERATOR_ERROR_CODES)[number];

export type MessageDraftGeneratorScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type MessageDraftGeneratorState = "success" | "empty" | "pending";

export type MessageDraftStatus =
  | "draft"
  | "held_for_review"
  | "ready_for_confirmation"
  | "revised";

export type MessageDraftChannel =
  | "email"
  | "linkedin"
  | "calendar_note"
  | "internal_note";

// create 输入描述要生成什么草稿；update 输入描述用户如何修改/复核现有草稿。
export interface MessageDraftGeneratorCreateInput {
  scenario?: MessageDraftGeneratorScenario | string | null;
  draftKind?: MessageDraftKind | string | null;
  recipientName?: string | null;
  organization?: string | null;
  contextNote?: string | null;
  channel?: MessageDraftChannel | string | null;
}

export interface MessageDraftGeneratorUpdateInput {
  draftId?: string | null;
  scenario?: MessageDraftGeneratorScenario | string | null;
  status?: MessageDraftStatus | string | null;
  userEdits?: string | null;
  reviewerLabel?: string | null;
}

export interface MessageDraftGeneratorService {
  createDraft: (
    input?: MessageDraftGeneratorCreateInput,
  ) => MessageDraftGeneratorResult;
  updateDraft: (
    input: MessageDraftGeneratorUpdateInput,
  ) => MessageDraftGeneratorResult;
}

export interface MessageDraftGeneratorErrorDefinition {
  code: MessageDraftGeneratorErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 草稿失败定义确保缺上下文、pending 或失败时不触发 live AI/send channel。
export const MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS = {
  MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED: {
    code: "MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A message draft id is required before updating a draft fixture.",
    recovery:
      "Keep draft update controls disabled until a known local draft fixture is selected.",
  },
  MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND: {
    code: "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock message draft fixture matches that draft id.",
    recovery:
      "Render the missing-draft envelope and avoid querying AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  MESSAGE_DRAFT_GENERATOR_EMPTY: {
    code: "MESSAGE_DRAFT_GENERATOR_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock message draft can be generated because no source-backed relationship context is available.",
    recovery:
      "Add relationship context, contact evidence, or source notes before generating a message draft.",
  },
  MESSAGE_DRAFT_GENERATOR_PENDING: {
    code: "MESSAGE_DRAFT_GENERATOR_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock message draft generator is waiting for a local confirmation guard.",
    recovery:
      "Render the pending state and do not call AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  MESSAGE_DRAFT_GENERATOR_MOCK_FAILED: {
    code: "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock message draft generator boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
} as const satisfies Record<
  MessageDraftGeneratorErrorCode,
  MessageDraftGeneratorErrorDefinition
>;

export type MessageDraftGeneratorSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "referral"
    | "chat_summary"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-message-draft-rules";
};

// audit 告诉 UI 该草稿必须复核来源证据。
export interface MessageDraftAudit {
  sourceLabel: string;
  providerBoundary: "AI false, external send false, persistence false";
  verificationAction: "Review source evidence";
}

// MessageDraft 是可编辑草稿；sendActionRequiresConfirmation=true 表示不能自动发送。
export interface MessageDraft {
  draftId: string;
  kind: MessageDraftKind;
  channel: MessageDraftChannel;
  status: MessageDraftStatus;
  recipientName: string;
  organization: string;
  subject: string;
  body: string;
  relationshipContext: string;
  recommendedSendWindow: string;
  rationale: string;
  source: MessageDraftGeneratorSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-message-draft-rules";
  audit: MessageDraftAudit;
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
  productionAuditLogWriteExecuted: false;
}

// provenance 汇总草稿生成方法和所有未触发的外部能力。
export interface MessageDraftGeneratorProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-message-draft-generator-only";
  generationMethod:
    | "fixture"
    | "rule-based-draft-generation"
    | "rule-based-update"
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
  productionAuditLogWriteExecuted: false;
}

export interface MessageDraftGeneratorPayload {
  state: MessageDraftGeneratorState;
  drafts: readonly MessageDraft[];
  summary: string;
  provenance: MessageDraftGeneratorProvenance;
  nextAction: string;
}

export interface MessageDraftGeneratorSuccess {
  success: true;
  data: MessageDraftGeneratorPayload;
}

export interface MessageDraftGeneratorFailure {
  success: false;
  error: MessageDraftGeneratorErrorDefinition & {
    state: "failure";
    provenance: MessageDraftGeneratorProvenance;
    evidenceIds: readonly string[];
  };
}

export type MessageDraftGeneratorResult =
  | MessageDraftGeneratorSuccess
  | MessageDraftGeneratorFailure;

export function messageDraftGeneratorFailureToAppError(
  failure: MessageDraftGeneratorFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function messageDraftGeneratorFailureContext(
  failure: MessageDraftGeneratorFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    messageDraftGeneratorErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock message draft generator failure came from deterministic fixture rules.",
    service: "message-draft-generator-mock",
  };
}
