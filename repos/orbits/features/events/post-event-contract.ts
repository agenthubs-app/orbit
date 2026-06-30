import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const POST_EVENT_REVIEW_FIXTURE_SOURCE =
  "fixture:features/events/post-event-contract.ts" as const;

// Post Event Review contract 描述活动结束后的新联系人复核和跟进建议。
// 它不会批量写联系人，也不会发送 follow-up，只返回待确认草稿。
export const POST_EVENT_REVIEW_ERROR_CODES = [
  "POST_EVENT_REVIEW_EVENT_ID_REQUIRED",
  "POST_EVENT_REVIEW_EVENT_NOT_FOUND",
  "POST_EVENT_REVIEW_EMPTY",
  "POST_EVENT_REVIEW_PENDING",
  "POST_EVENT_REVIEW_MOCK_FAILED",
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
  liveDatabaseReadExecuted: false;
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
  liveDatabaseWriteExecuted: false;
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
  liveDatabaseWriteExecuted: false;
  batchPersistenceExecuted: false;
}
// provenance 记录复盘流程没有 AI、网络、数据库批量写入或消息发送。

export interface PostEventReviewProvenance {
  source: typeof POST_EVENT_REVIEW_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-post-event-review-only";
  generationMethod:
    | "fixture"
    | "rule-based-empty"
    | "rule-based-pending"
    | "rule-based-confirmation"
    | "rule-based-failure";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  batchPersistenceExecuted: false;
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
  batchPersistenceExecuted: false;
  liveDatabaseWriteExecuted: false;
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

export interface PostEventContactReviewService {
  getPostEventReview: (
    input?: PostEventReviewInput,
  ) => PostEventReviewResult;
  confirmPostEventContacts: (
    input?: ConfirmPostEventContactsInput,
  ) => PostEventReviewConfirmResult;
}

const fixtureCollectedAt = "2026-06-25T21:45:00.000+09:00";

export const mockPostEventReviewSource: PostEventReviewSourceReference = {
  type: "event_import",
  id: "source:post-event-review:demo-event-1",
  label: "post-event review fixture",
  eventId: "demo-event-1",
  generatedBy: "mock-post-event-review-service",
};

export const mockPostEventReviewEvent: PostEventReviewEventSummary = {
  id: "demo-event-1",
  title: "Climate founders dinner",
  venue: "Daikanyama Founders Room",
  endedAt: "2026-06-25T21:30:00.000+09:00",
  source: mockPostEventReviewSource,
  calendarProviderRequested: false,
  liveDatabaseReadExecuted: false,
};

export const mockPostEventReviewProvenance: PostEventReviewProvenance = {
  source: POST_EVENT_REVIEW_FIXTURE_SOURCE,
  sourceLabel: "Mock post-event contact review fixture",
  evidenceIds: [
    "evidence:post-event:attendee-import",
    "evidence:post-event:encounter-note",
    "evidence:post-event:follow-up-rule",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-post-event-review-only",
  generationMethod: "fixture",
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  batchPersistenceExecuted: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyPostEventReviewProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock empty post-event review rule",
  evidenceIds: ["evidence:post-event:empty"],
  generationMethod: "rule-based-empty",
};

export const mockPendingPostEventReviewProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock pending post-event review rule",
  evidenceIds: ["evidence:post-event:attendee-import-pending"],
  generationMethod: "rule-based-pending",
};

export const mockPostEventReviewFailureProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock post-event review controlled failure rule",
  evidenceIds: ["evidence:post-event:controlled-failure"],
  generationMethod: "rule-based-failure",
};

function tag(input: {
  tagId: string;
  label: string;
  reason: string;
  evidenceIds: readonly string[];
}): PostEventReviewTag {
  return {
    ...input,
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function summary(input: {
  summaryId: string;
  headline: string;
  context: string;
  whyNow: string;
  evidenceIds: readonly string[];
}): PostEventContactSummary {
  return {
    ...input,
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function followUp(input: {
  suggestionId: string;
  urgency: PostEventFollowUpSuggestion["urgency"];
  messageDraft: string;
  rationale: string;
  evidenceIds: readonly string[];
}): PostEventFollowUpSuggestion {
  return {
    ...input,
    channel: "email",
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    externalMessageSendRequested: false,
    notificationDelivered: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    aiProviderRequested: false,
  };
}

export const mockPostEventReviewContacts: readonly PostEventReviewContact[] = [
  {
    contactDraftId: "draft:post-event:priya",
    displayName: "Priya Shah",
    organization: "Solace Battery",
    role: "CEO",
    metAt: "Climate founders dinner",
    relationshipContext:
      "Priya asked for a storage pilot introduction after the panel.",
    status: "needs_review",
    source: mockPostEventReviewSource,
    evidenceIds: [
      "evidence:post-event:attendee-import",
      "evidence:post-event:encounter-note",
    ],
    summary: summary({
      summaryId: "summary:post-event:priya",
      headline: "Priya needs a storage pilot founder introduction.",
      context:
        "The encounter note says Priya offered deployment constraints and asked for an introduction.",
      whyNow:
        "The request came directly after the dinner while event context is still fresh.",
      evidenceIds: [
        "evidence:post-event:attendee-import",
        "evidence:post-event:encounter-note",
      ],
    }),
    tags: [
      tag({
        tagId: "tag:post-event:storage-pilot",
        label: "storage pilot",
        reason: "Derived from Priya's stated deployment request.",
        evidenceIds: ["evidence:post-event:encounter-note"],
      }),
      tag({
        tagId: "tag:post-event:founder-intro",
        label: "founder intro",
        reason: "The sensible next action is an introduction path.",
        evidenceIds: ["evidence:post-event:follow-up-rule"],
      }),
    ],
    followUpSuggestion: followUp({
      suggestionId: "follow-up:post-event:priya",
      urgency: "today",
      messageDraft:
        "Priya, good meeting you at the dinner. I can make the storage pilot introduction if the deployment constraints you mentioned are still the right starting point.",
      rationale:
        "A same-day recap keeps the event context, requested intro, and evidence together.",
      evidenceIds: [
        "evidence:post-event:encounter-note",
        "evidence:post-event:follow-up-rule",
      ],
    }),
    liveDatabaseWriteExecuted: false,
    batchPersistenceExecuted: false,
  },
  {
    contactDraftId: "draft:post-event:marcus",
    displayName: "Marcus Lee",
    organization: "GridBridge",
    role: "Partnerships",
    metAt: "Climate founders dinner",
    relationshipContext:
      "Marcus offered to compare operator intro paths for climate storage buyers.",
    status: "needs_review",
    source: mockPostEventReviewSource,
    evidenceIds: [
      "evidence:post-event:attendee-import",
      "evidence:post-event:operator-intro",
    ],
    summary: summary({
      summaryId: "summary:post-event:marcus",
      headline: "Marcus can help qualify operator introduction paths.",
      context:
        "The roster note links Marcus to buyer qualification and partnership routing.",
      whyNow:
        "The follow-up should happen while he remembers the operator intro conversation.",
      evidenceIds: [
        "evidence:post-event:attendee-import",
        "evidence:post-event:operator-intro",
      ],
    }),
    tags: [
      tag({
        tagId: "tag:post-event:operator-path",
        label: "operator path",
        reason: "Marcus mentioned introduction routing.",
        evidenceIds: ["evidence:post-event:operator-intro"],
      }),
      tag({
        tagId: "tag:post-event:buyer-context",
        label: "buyer context",
        reason: "The conversation centered on buyer qualification.",
        evidenceIds: ["evidence:post-event:attendee-import"],
      }),
    ],
    followUpSuggestion: followUp({
      suggestionId: "follow-up:post-event:marcus",
      urgency: "this_week",
      messageDraft:
        "Marcus, I appreciated the operator path context. Could we compare the buyer intro route you mentioned against Priya's storage pilot need?",
      rationale:
        "The follow-up joins the event attendee import with the operator-path note.",
      evidenceIds: [
        "evidence:post-event:operator-intro",
        "evidence:post-event:follow-up-rule",
      ],
    }),
    liveDatabaseWriteExecuted: false,
    batchPersistenceExecuted: false,
  },
] as const;

export const mockPostEventReviewFixture: PostEventReviewPayload = {
  state: "success",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: mockPostEventReviewContacts,
  summary:
    "Two new contacts are ready for post-event review with summaries, tags, and follow-up suggestions from local fixtures.",
  provenance: mockPostEventReviewProvenance,
  nextAction:
    "Review each new contact, confirm the useful records, then draft follow-up copy from the preserved evidence.",
};

export const mockEmptyPostEventReviewFixture: PostEventReviewPayload = {
  state: "empty",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: [],
  summary: "No imported or encountered contacts are ready for review.",
  provenance: mockEmptyPostEventReviewProvenance,
  nextAction:
    "Import attendees or capture encounter notes before confirming post-event contacts.",
};

export const mockPendingPostEventReviewFixture: PostEventReviewPayload = {
  state: "pending",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: [],
  summary:
    "The post-event review is waiting for local attendee import and encounter note review.",
  provenance: mockPendingPostEventReviewProvenance,
  nextAction:
    "Wait for local import review before generating summaries, tags, follow-up suggestions, or confirmation actions.",
};

export const mockPostEventReviewConfirmFixture: PostEventReviewConfirmPayload = {
  state: "confirmed",
  event: mockPostEventReviewEvent,
  eventId: "demo-event-1",
  reviewId: "post-event-review:demo-event-1",
  confirmedContacts: mockPostEventReviewContacts.map((contact) => ({
    contactId:
      contact.contactDraftId === "draft:post-event:priya"
        ? "contact:priya-shah"
        : "contact:marcus-lee",
    contactDraftId: contact.contactDraftId,
    displayName: contact.displayName,
    tags: contact.tags.map((contactTag) => contactTag.label),
    followUpSuggestion: contact.followUpSuggestion,
    source: contact.source,
    evidenceIds: contact.evidenceIds,
    batchPersistenceExecuted: false,
    liveDatabaseWriteExecuted: false,
    notificationDelivered: false,
    externalMessageSendRequested: false,
  })),
  summary:
    "The selected post-event contacts were confirmed inside the mock boundary without batch persistence.",
  provenance: {
    ...mockPostEventReviewProvenance,
    sourceLabel: "Mock post-event confirmation rule",
    evidenceIds: ["evidence:post-event:confirmation-preview"],
    generationMethod: "rule-based-confirmation",
  },
  nextAction:
    "Route any follow-up send through a separate confirmation guard before external action execution.",
};

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
    service: "post-event-contact-review-mock",
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
