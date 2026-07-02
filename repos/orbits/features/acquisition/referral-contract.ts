import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Referral Recommendation contract 描述来自推荐人/社区/投资人介绍的联系人候选。
// 当前不做多跳社交图发现，也不会自动向朋友的朋友发起触达。
export const REFERRAL_SOURCE_KINDS = [
  "founder_referral",
  "investor_intro",
  "community_referral",
] as const;

export type ReferralSourceKind = (typeof REFERRAL_SOURCE_KINDS)[number];

export const REFERRAL_RECOMMENDATION_ERROR_CODES = [
  "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
  "REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED",
  "REFERRAL_SOURCE_NOT_SUPPORTED",
  "REFERRAL_RECOMMENDATION_NOT_FOUND",
  "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
  "REFERRAL_RECOMMENDATION_PENDING",
  "REFERRAL_RECOMMENDATION_MOCK_FAILED",
] as const;

export type ReferralRecommendationErrorCode =
  (typeof REFERRAL_RECOMMENDATION_ERROR_CODES)[number];

export type ReferralRecommendationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ReferralRecommendationConfirmScenario =
  | "success"
  | "pending"
  | "blocked"
  | "failure";

export type ReferralRecommendationState = "success" | "empty" | "pending";
export type ReferralRecommendationConfidence = "high" | "medium" | "low";

// sourceKind 选择推荐来源类型；确认输入指定要转成草稿的 recommendationId。
export interface ReferralRecommendationInput {
  sourceKind?: ReferralSourceKind | string | null;
  scenario?: ReferralRecommendationScenario | string | null;
}

export interface RecommendedContactConfirmInput {
  recommendationId: string;
  actorLabel?: string | null;
  scenario?: ReferralRecommendationConfirmScenario | string | null;
}

export interface ReferralRecommendationErrorDefinition {
  code: ReferralRecommendationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 推荐错误定义覆盖来源不支持、推荐缺失、确认缺失、pending 和受控失败。
export const REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS = {
  REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED: {
    code: "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live referral recommendation store is not configured.",
    recovery:
      "Configure the shared live record store before reading live referral recommendations, or switch this capability back to mock mode.",
  },
  REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED: {
    code: "REFERRAL_RECOMMENDATION_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live referral recommendation boundary failed.",
    recovery:
      "Surface the live referral failure without writing contacts, sending outreach, discovering a social graph, or retrying external providers.",
  },
  REFERRAL_SOURCE_NOT_SUPPORTED: {
    code: "REFERRAL_SOURCE_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message:
      "That mock referral source is not supported by this sprint boundary.",
    recovery:
      "Use founder referral, investor intro, or community referral fixtures only.",
  },
  REFERRAL_RECOMMENDATION_NOT_FOUND: {
    code: "REFERRAL_RECOMMENDATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock recommended contact matches that id.",
    recovery:
      "Keep the recommendation queue unchanged and return the missing recommendation failure envelope.",
  },
  REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED: {
    code: "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
    appCode: "FORBIDDEN",
    message:
      "The mock recommended contact requires explicit user confirmation before it becomes a contact draft.",
    recovery:
      "Keep the recommendation pending until the operator confirms the referred contact.",
  },
  REFERRAL_RECOMMENDATION_PENDING: {
    code: "REFERRAL_RECOMMENDATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock referral recommendation is waiting for local recommender review.",
    recovery:
      "Render the pending state and avoid confirming recommended contacts until the fixture is ready.",
  },
  REFERRAL_RECOMMENDATION_MOCK_FAILED: {
    code: "REFERRAL_RECOMMENDATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock referral recommendation boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying social graph discovery, outreach, databases, AI, email, calendar, devices, or notification work.",
  },
} as const satisfies Record<
  ReferralRecommendationErrorCode,
  ReferralRecommendationErrorDefinition
>;

export type ReferralSourceReference = SourceReferenceDTO & {
  type: "referral";
  label: string;
  sourceKind: ReferralSourceKind;
  referralId: string;
};

// provenance 明确没有执行社交图探索、自动触达、设备/日历/邮件读取。
export interface ReferralRecommendationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-referral-recommendations-only"
    | "live-referral-recommendations";
  generationMethod:
    | "fixture"
    | "live-store-confirmation"
    | "live-store-query"
    | "rule-based-referral-recommendation";
  liveDatabaseReadExecuted?: boolean;
  multiHopSocialGraphDiscoveryExecuted: false;
  automaticFriendOfFriendOutreachExecuted: false;
  externalNetworkRequested: false;
  deviceContactReadExecuted: false;
  calendarReadExecuted: false;
  emailReadExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  notificationDelivered: false;
}

// source summary 描述推荐来源规模和是否请求了 provider，同样保持 mock-only。
export interface ReferralSourceSummary {
  kind: ReferralSourceKind;
  label: string;
  recommenderCount: number;
  source: ReferralSourceReference;
  externalNetworkRequested: false;
  automaticOutreachExecuted: false;
  providerSyncRequested: false;
}

export interface ReferralRecommendationEvidence {
  evidenceId: string;
  source: ReferralSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy:
    | "live-referral-recommendation-service"
    | "mock-referral-recommendation-service";
}

// RecommenderContext 解释推荐路径和信任信号，帮助用户判断是否采纳推荐。
export interface RecommenderContext {
  recommenderId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipToUser: string;
  warmPath: string;
  trustSignal: string;
  source: ReferralSourceReference;
  evidenceIds: readonly string[];
  externalNetworkDiscoveryExecuted: false;
  automaticOutreachExecuted: false;
}

export interface RecommendedContactConfirmation {
  required: true;
  state: "pending" | "confirmed";
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

export interface RecommendedContact {
  id: string;
  displayName: string;
  role: string;
  organization: string;
  sourceKind: ReferralSourceKind;
  recommender: RecommenderContext;
  relationshipContext: string;
  reasonForRecommendation: string;
  suggestedNextAction: string;
  introductionPath: string;
  confidence: ReferralRecommendationConfidence;
  confirmation: RecommendedContactConfirmation;
  source: ReferralSourceReference;
  evidenceIds: readonly string[];
  evidence: readonly ReferralRecommendationEvidence[];
  provenance: ReferralRecommendationProvenance;
  readyForReview: true;
  multiHopSocialGraphDiscoveryExecuted: false;
  automaticFriendOfFriendOutreachExecuted: false;
  externalNetworkRequested: false;
  contactWriteExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  notificationDelivered: false;
}

export interface ReferralContactDraft {
  id: string;
  recommendationId: string;
  displayName: string;
  role: string;
  organization: string;
  sourceKind: ReferralSourceKind;
  recommender: RecommenderContext;
  relationshipContext: string;
  suggestedNextAction: string;
  confidence: ReferralRecommendationConfidence;
  source: ReferralSourceReference;
  evidence: readonly ReferralRecommendationEvidence[];
  provenance: ReferralRecommendationProvenance;
  confirmationRequired: true;
  userConfirmed: false;
  readyForReview: true;
  contactWriteExecuted: false;
  externalActionExecuted: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
}

export interface UserConfirmedRecommendedContact {
  id: string;
  recommendationId: string;
  displayName: string;
  role: string;
  organization: string;
  sourceKind: ReferralSourceKind;
  recommender: RecommenderContext;
  confirmedAt: string;
  confirmedBy: string;
  userConfirmed: true;
  source: ReferralSourceReference;
  evidence: readonly ReferralRecommendationEvidence[];
  provenance: ReferralRecommendationProvenance;
  nextAction: string;
  contactWriteExecuted: false;
  externalOutreachExecuted: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
}

export interface ReferralRecommendationPayload {
  state: ReferralRecommendationState;
  referralSources: readonly ReferralSourceSummary[];
  recommendations: readonly RecommendedContact[];
  contactDrafts: readonly ReferralContactDraft[];
  summary: string;
  provenance: ReferralRecommendationProvenance;
  nextAction: string;
}

export interface RecommendedContactConfirmationPayload {
  state: "confirmed";
  confirmedContact: UserConfirmedRecommendedContact;
  createdEvidence: ReferralRecommendationEvidence;
  confirmedAt: string;
  confirmedBy: string;
  provenance: ReferralRecommendationProvenance;
  nextAction: string;
  contactWriteExecuted: false;
  externalActionExecuted: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
}

export interface ReferralRecommendationSuccess {
  success: true;
  data: ReferralRecommendationPayload;
}

export interface RecommendedContactConfirmationSuccess {
  success: true;
  data: RecommendedContactConfirmationPayload;
}

export interface ReferralRecommendationFailure {
  success: false;
  error: ReferralRecommendationErrorDefinition & {
    state: "failure";
    provenance: ReferralRecommendationProvenance;
    evidenceIds: readonly string[];
  };
}

export type ReferralRecommendationResult =
  | ReferralRecommendationSuccess
  | ReferralRecommendationFailure;

export type RecommendedContactConfirmationResult =
  | RecommendedContactConfirmationSuccess
  | ReferralRecommendationFailure;

export type ReferralRecommendationServiceResult<TResult> =
  | Promise<TResult>
  | TResult;

export interface ReferralRecommendationService {
  createReferralContactDrafts: (
    input?: ReferralRecommendationInput,
  ) => ReferralRecommendationServiceResult<ReferralRecommendationResult>;
  confirmRecommendedContact: (
    input: RecommendedContactConfirmInput,
  ) => ReferralRecommendationServiceResult<RecommendedContactConfirmationResult>;
}

export function referralRecommendationFailureToAppError(
  failure: ReferralRecommendationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function referralRecommendationFailureContext(
  failure: ReferralRecommendationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive =
    failure.error.provenance.privacy === "live-referral-recommendations";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLive
      ? "Live referral recommendation failure came from the shared live record store boundary."
      : "Mock referral recommendation failure came from deterministic fixture rules.",
    referralRecommendationErrorCode: failure.error.code,
    service: isLive
      ? "referral-recommendation-live"
      : "referral-and-recommended-contact-confirm-mock",
  };
}
