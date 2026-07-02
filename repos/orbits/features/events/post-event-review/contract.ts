import type { ApiErrorContext } from "../../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";

// Post Event Review contract 描述活动结束后的新联系人复核和跟进建议。
// 它不会批量写联系人，也不会发送 follow-up，只返回待确认草稿。
export const POST_EVENT_REVIEW_ERROR_CODES = [
  "POST_EVENT_REVIEW_EVENT_ID_REQUIRED",
  "POST_EVENT_REVIEW_EVENT_NOT_FOUND",
  "POST_EVENT_REVIEW_EMPTY",
  "POST_EVENT_REVIEW_PENDING",
  "POST_EVENT_REVIEW_MOCK_FAILED",
  "POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED",
] as const;

export type PostEventReviewErrorCode =
  (typeof POST_EVENT_REVIEW_ERROR_CODES)[number];

export type PostEventReviewScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";
export type PostEventReviewState = "success" | "empty" | "pending";

// review input 读取活动复盘；confirm input 选择要确认的联系人草稿。
export interface PostEventReviewInput {
  eventId?: string | null;
  scenario?: PostEventReviewScenario | string | null;
}

export interface ConfirmPostEventContactsInput {
  eventId?: string | null;
  contactDraftIds?: readonly string[] | null;
  scenario?: PostEventReviewScenario | string | null;
}

export interface PostEventReviewErrorDefinition {
  code: PostEventReviewErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// post-event 错误定义确保导入未完成或无联系人时不启动批量持久化。
export const POST_EVENT_REVIEW_ERROR_DEFINITIONS = {
  POST_EVENT_REVIEW_EVENT_ID_REQUIRED: {
    code: "POST_EVENT_REVIEW_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before reviewing post-event contacts.",
    recovery:
      "Keep the post-event review surface empty until a known local event fixture is selected.",
  },
  POST_EVENT_REVIEW_EVENT_NOT_FOUND: {
    code: "POST_EVENT_REVIEW_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock post-event review fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid databases, calendar, email, notification, network, or model work.",
  },
  POST_EVENT_REVIEW_EMPTY: {
    code: "POST_EVENT_REVIEW_EMPTY",
    appCode: "VALIDATION_ERROR",
    message: "The mock post-event review has no new contacts to confirm.",
    recovery:
      "Render the empty new-contact review without AI, external actions, or batch persistence.",
  },
  POST_EVENT_REVIEW_PENDING: {
    code: "POST_EVENT_REVIEW_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock post-event review is waiting for the local attendee import to finish.",
    recovery:
      "Render the pending state without starting batch persistence, contact writes, provider calls, notifications, calendar access, email access, or model work.",
  },
  POST_EVENT_REVIEW_MOCK_FAILED: {
    code: "POST_EVENT_REVIEW_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock post-event contact review boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry databases, calendar, email, notification, network, batch persistence, or model work.",
  },
  POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED: {
    code: "POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live post-event review store is not configured.",
    recovery:
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using live post-event reviews.",
  },
} as const satisfies Record<
  PostEventReviewErrorCode,
  PostEventReviewErrorDefinition
>;

export type PostEventReviewSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  generatedBy: "mock-post-event-review-service";
};

// EventSummary 是复盘所属活动摘要，不代表读取真实日历。
export interface PostEventReviewEventSummary {
  id: string;
  title: string;
  venue: string;
  endedAt: string;
  source: PostEventReviewSourceReference;
  calendarProviderRequested: false;
  liveDatabaseReadExecuted: boolean;
}

// Tag 和 ContactSummary 解释活动后新联系人为什么值得复核。
export interface PostEventReviewTag {
  tagId: string;
  label: string;
  reason: string;
  source: PostEventReviewSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-post-event-rules";
  aiProviderRequested: false;
  liveDatabaseWriteExecuted: boolean;
}

export interface PostEventContactSummary {
  summaryId: string;
  headline: string;
  context: string;
  whyNow: string;
  source: PostEventReviewSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-post-event-rules";
  aiProviderRequested: false;
  externalNetworkRequested: false;
}

// FollowUpSuggestion 是可编辑草稿，不会自动发送邮件。
export interface PostEventFollowUpSuggestion {
  suggestionId: string;
  channel: "email";
  urgency: "today" | "this_week";
  messageDraft: string;
  rationale: string;
  source: PostEventReviewSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-post-event-rules";
  externalMessageSendRequested: false;
  notificationDelivered: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  aiProviderRequested: false;
}

// PostEventReviewContact 是待复核的新联系人草稿。
export interface PostEventReviewContact {
  contactDraftId: string;
  displayName: string;
  organization: string;
  role: string;
  metAt: string;
  relationshipContext: string;
  status: "needs_review";
  source: PostEventReviewSourceReference;
  evidenceIds: readonly string[];
  summary: PostEventContactSummary;
  tags: readonly PostEventReviewTag[];
  followUpSuggestion: PostEventFollowUpSuggestion;
  liveDatabaseWriteExecuted: boolean;
  batchPersistenceExecuted: boolean;
}

// provenance 记录复盘流程没有 AI、网络、数据库批量写入或消息发送。
export interface PostEventReviewProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-post-event-review-only";
  generationMethod:
    | "fixture"
    | "rule-based-empty"
    | "rule-based-pending"
    | "rule-based-confirmation"
    | "rule-based-failure"
    | "live-store-query"
    | "live-store-confirmation";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  batchPersistenceExecuted: boolean;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface PostEventReviewPayload {
  state: PostEventReviewState;
  event: PostEventReviewEventSummary;
  reviewId: string;
  contacts: readonly PostEventReviewContact[];
  summary: string;
  provenance: PostEventReviewProvenance;
  nextAction: string;
}

export interface ConfirmedPostEventContact {
  contactId: string;
  contactDraftId: string;
  displayName: string;
  tags: readonly string[];
  followUpSuggestion: PostEventFollowUpSuggestion;
  source: PostEventReviewSourceReference;
  evidenceIds: readonly string[];
  batchPersistenceExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  notificationDelivered: false;
  externalMessageSendRequested: false;
}

export interface PostEventReviewConfirmPayload {
  state: "confirmed";
  event: PostEventReviewEventSummary;
  eventId: string;
  reviewId: string;
  confirmedContacts: readonly ConfirmedPostEventContact[];
  summary: string;
  provenance: PostEventReviewProvenance;
  nextAction: string;
}

export interface PostEventReviewSuccess {
  success: true;
  data: PostEventReviewPayload;
}

export interface PostEventReviewConfirmSuccess {
  success: true;
  data: PostEventReviewConfirmPayload;
}

export interface PostEventReviewFailure {
  success: false;
  error: PostEventReviewErrorDefinition & {
    state: "failure";
    provenance: PostEventReviewProvenance;
    evidenceIds: readonly string[];
  };
}

export type PostEventReviewResult =
  | PostEventReviewSuccess
  | PostEventReviewFailure;
export type PostEventReviewConfirmResult =
  | PostEventReviewConfirmSuccess
  | PostEventReviewFailure;

export type PostEventReviewServiceResult<TResult> = TResult | Promise<TResult>;

export interface PostEventContactReviewService {
  getPostEventReview: (
    input?: PostEventReviewInput,
  ) => PostEventReviewServiceResult<PostEventReviewResult>;
  confirmPostEventContacts: (
    input?: ConfirmPostEventContactsInput,
  ) => PostEventReviewServiceResult<PostEventReviewConfirmResult>;
}

export function postEventReviewErrorToAppError(
  errorCode: PostEventReviewErrorCode,
): AppError {
  const definition = POST_EVENT_REVIEW_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function postEventReviewFailureToAppError(
  reviewFailure: PostEventReviewFailure,
): AppError {
  return postEventReviewErrorToAppError(reviewFailure.error.code);
}

export function postEventReviewErrorContext(
  errorCode: PostEventReviewErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    postEventReviewErrorCode: errorCode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock post-event review failure came from deterministic fixture rules.",
    service: "post-event-review",
  };
}

export function postEventReviewFailureContext(
  reviewFailure: PostEventReviewFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const baseContext = postEventReviewErrorContext(
    reviewFailure.error.code,
    mode,
  );

  if (
    reviewFailure.error.code === "POST_EVENT_REVIEW_EMPTY" ||
    reviewFailure.error.code === "POST_EVENT_REVIEW_PENDING"
  ) {
    return {
      ...baseContext,
      privacy: reviewFailure.error.provenance.privacy,
      provenance: reviewFailure.error.provenance.source,
    };
  }

  return baseContext;
}
