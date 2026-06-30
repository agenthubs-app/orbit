import type { SourceReferenceDTO, SourceType } from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";

// Acquisition 主 contract 描述“联系人草稿队列”的统一形状。
// 不同来源（手动、名片、QR、活动、外部联系人、邮件日历、推荐）最后都会汇入草稿，
// 但草稿只代表待确认候选人，不等于已经写入联系人库。
export const CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES = [
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
] as const satisfies readonly SourceType[];

export const CONTACT_ACQUISITION_DRAFT_ERROR_CODES = [
  "CONTACT_DRAFT_NOT_FOUND",
  "CONTACT_DRAFT_ALREADY_CONFIRMED",
  "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
  "CONTACT_DRAFT_PIPELINE_FAILED",
] as const;

export type ContactAcquisitionDraftSourceType =
  (typeof CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES)[number];

export type ContactAcquisitionDraftErrorCode =
  (typeof CONTACT_ACQUISITION_DRAFT_ERROR_CODES)[number];

export type ContactAcquisitionDraftScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ContactDraftConfirmationScenario =
  | "success"
  | "failure"
  | "blocked";

export type ContactAcquisitionDraftState = "success" | "empty" | "pending";

export type ContactDraftStatus = "pending_confirmation" | "confirmed";

export type ContactDraftConfirmationState = "pending" | "confirmed";

export type ContactDraftConfidence = "high" | "medium" | "low";

// 列表输入只控制草稿队列状态；确认输入必须带 draftId 和操作者信息。
export interface ContactAcquisitionDraftInput {
  scenario?: ContactAcquisitionDraftScenario | string | null;
}

export interface ContactDraftConfirmationInput {
  draftId: string;
  actorLabel?: string | null;
  scenario?: ContactDraftConfirmationScenario | string | null;
}

export interface ContactAcquisitionDraftErrorDefinition {
  code: ContactAcquisitionDraftErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 主草稿管线的失败都停在本地 mock 边界，不触发 OCR、导入、AI 或通知重试。
export const CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS = {
  CONTACT_DRAFT_NOT_FOUND: {
    code: "CONTACT_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock contact acquisition draft matches that id.",
    recovery:
      "Keep the relationship graph unchanged and return the missing draft failure envelope.",
  },
  CONTACT_DRAFT_ALREADY_CONFIRMED: {
    code: "CONTACT_DRAFT_ALREADY_CONFIRMED",
    appCode: "CONFLICT",
    message: "That mock contact acquisition draft has already been confirmed.",
    recovery:
      "Refresh the draft queue before confirming another source-backed contact candidate.",
  },
  CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED: {
    code: "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "The mock contact acquisition draft cannot be confirmed in this controlled scenario.",
    recovery:
      "Keep the draft pending and show the operator why confirmation is blocked.",
  },
  CONTACT_DRAFT_PIPELINE_FAILED: {
    code: "CONTACT_DRAFT_PIPELINE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock contact acquisition draft pipeline is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live OCR, QR, import, email, calendar, storage, AI, or notification work.",
  },
} as const satisfies Record<
  ContactAcquisitionDraftErrorCode,
  ContactAcquisitionDraftErrorDefinition
>;

export type ContactDraftSourceReference = SourceReferenceDTO & {
  type: ContactAcquisitionDraftSourceType;
  label: string;
};

// provenance 说明草稿来源和生成方式，供 UI 展示“为什么推荐加入这个人”。
export interface ContactAcquisitionDraftProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-contact-acquisition-drafts-only";
  generationMethod: "fixture" | "rule-based-contact-draft";
}

export interface ContactDraftEvidence {
  evidenceId: string;
  source: ContactDraftSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-pipeline";
}

// confirmation 是草稿进入真实联系人写入前的人工复核门。
export interface ContactDraftConfirmation {
  required: true;
  state: ContactDraftConfirmationState;
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

// ContactAcquisitionDraft 是跨来源统一的候选联系人 DTO。
export interface ContactAcquisitionDraft {
  id: string;
  status: ContactDraftStatus;
  source: ContactDraftSourceReference;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  suggestedNextAction: string;
  confidence: ContactDraftConfidence;
  createdAt: string;
  confirmation: ContactDraftConfirmation;
  evidence: readonly ContactDraftEvidence[];
  provenance: ContactAcquisitionDraftProvenance;
}

// payload 返回当前草稿队列；每条 draft 都带证据和复核状态。
export interface ContactAcquisitionDraftPayload {
  state: ContactAcquisitionDraftState;
  drafts: readonly ContactAcquisitionDraft[];
  summary: string;
  provenance: ContactAcquisitionDraftProvenance;
  nextAction: string;
}

// ContactDraftCandidate 是确认后准备写入的联系人候选，但这里仍不执行写入。
export interface ContactDraftCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  source: ContactDraftSourceReference;
  evidenceIds: readonly string[];
  readyForContactWrite: true;
  contactWriteExecuted: false;
}

// confirmation payload 会生成 contactCandidate，但仍显式标记 contactWriteExecuted=false。
export interface ContactDraftConfirmationPayload {
  state: "confirmed";
  confirmedDraft: ContactAcquisitionDraft;
  contactCandidate: ContactDraftCandidate;
  createdEvidence: ContactDraftEvidence;
  confirmedAt: string;
  provenance: ContactAcquisitionDraftProvenance;
  nextAction: string;
}

export interface ContactAcquisitionDraftSuccess {
  success: true;
  data: ContactAcquisitionDraftPayload;
}

export interface ContactDraftConfirmationSuccess {
  success: true;
  data: ContactDraftConfirmationPayload;
}

export interface ContactAcquisitionDraftFailure {
  success: false;
  error: ContactAcquisitionDraftErrorDefinition & {
    state: "failure";
    provenance: ContactAcquisitionDraftProvenance;
    evidenceIds: readonly string[];
  };
}

export type ContactAcquisitionDraftResult =
  | ContactAcquisitionDraftSuccess
  | ContactAcquisitionDraftFailure;

export type ContactDraftConfirmationResult =
  | ContactDraftConfirmationSuccess
  | ContactAcquisitionDraftFailure;
