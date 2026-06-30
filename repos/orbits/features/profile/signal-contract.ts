import type { AppErrorCode } from "../../shared/errors/app-error";

// Profile Signal Review contract 描述从聊天、活动、联系人信号中生成的 profile 更新建议。
// 建议需要用户接受；默认不会自动写入用户资料。
export const PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_CODES = [
  "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND",
  "PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED",
  "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED",
] as const;

export type ProfileSignalReviewQueueErrorCode =
  (typeof PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_CODES)[number];

export type ProfileSignalSourceKind = "chat" | "activity" | "contact";

export type ProfileSignalReviewQueueScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ProfileSignalReviewQueueState = "success" | "empty" | "pending";

export type ProfileSignalSuggestionStatus =
  | "pending"
  | "accepted"
  | "dismissed";

export type ProfileSignalConfidence = "high" | "medium" | "low";

export type ProfileSignalProfileField =
  | "headline"
  | "homeMarket"
  | "relationshipGoal"
  | "targetRelationshipTypes"
  | "preferredFollowUpWindow"
  | "preferredIntroChannels";

export type ProfileSignalProfilePatch = Partial<
  Record<ProfileSignalProfileField, string | readonly string[]>
>;

// queue 输入只控制场景；具体 suggestion 通过 id 接受。
export interface ProfileSignalReviewQueueInput {
  scenario?: ProfileSignalReviewQueueScenario | string | null;
}

export interface ProfileSignalReviewQueueErrorDefinition {
  code: ProfileSignalReviewQueueErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 信号错误定义确保找不到或已处理时不会修改 profile。
export const PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS = {
  PROFILE_SIGNAL_SUGGESTION_NOT_FOUND: {
    code: "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock profile update suggestion matches that id.",
    recovery:
      "Keep the profile unchanged and return the missing suggestion failure envelope.",
  },
  PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED: {
    code: "PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED",
    appCode: "CONFLICT",
    message: "That mock profile update suggestion has already been resolved.",
    recovery:
      "Refresh the review queue before accepting or dismissing another suggestion.",
  },
  PROFILE_SIGNAL_REVIEW_QUEUE_FAILED: {
    code: "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock profile signal review queue is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying a live AI, email, calendar, database, or notification provider.",
  },
} as const satisfies Record<
  ProfileSignalReviewQueueErrorCode,
  ProfileSignalReviewQueueErrorDefinition
>;

export interface ProfileSignalReviewQueueProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-profile-signals-only";
  generationMethod: "fixture" | "rule-based-signal-match";
}

// Evidence 解释建议来自哪段聊天、活动或联系人资料。
export interface ProfileSignalEvidence {
  evidenceId: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
  excerpt: string;
  collectedAt: string;
}

// ProfileUpdateSuggestion 是待复核建议，status 表示是否已经接受/忽略。
export interface ProfileUpdateSuggestion {
  id: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
  targetProfileField: ProfileSignalProfileField;
  currentValue: string | readonly string[];
  suggestedValue: string | readonly string[];
  rationale: string;
  confidence: ProfileSignalConfidence;
  status: ProfileSignalSuggestionStatus;
  createdAt: string;
  evidence: readonly ProfileSignalEvidence[];
  provenance: ProfileSignalReviewQueueProvenance;
}

export interface ProfileSignalReviewQueuePayload {
  state: ProfileSignalReviewQueueState;
  suggestions: readonly ProfileUpdateSuggestion[];
  summary: string;
  provenance: ProfileSignalReviewQueueProvenance;
  nextAction: string;
}

// 接受建议后返回 profilePatch，但真正保存仍由 profile service/页面流程处理。
export interface ProfileSignalSuggestionAcceptedPayload {
  state: "accepted";
  acceptedSuggestion: ProfileUpdateSuggestion;
  profilePatch: ProfileSignalProfilePatch;
  appliedFields: readonly ProfileSignalProfileField[];
  acceptedAt: string;
  provenance: ProfileSignalReviewQueueProvenance;
  nextAction: string;
}

export interface ProfileSignalReviewQueueSuccess {
  success: true;
  data: ProfileSignalReviewQueuePayload;
}

export interface ProfileSignalSuggestionAcceptedSuccess {
  success: true;
  data: ProfileSignalSuggestionAcceptedPayload;
}

export interface ProfileSignalReviewQueueFailure {
  success: false;
  error: ProfileSignalReviewQueueErrorDefinition & {
    state: "failure";
    provenance: ProfileSignalReviewQueueProvenance;
    evidenceIds: readonly string[];
  };
}

export type ProfileSignalReviewQueueResult =
  | ProfileSignalReviewQueueSuccess
  | ProfileSignalReviewQueueFailure;

export type ProfileSignalSuggestionAcceptResult =
  | ProfileSignalSuggestionAcceptedSuccess
  | ProfileSignalReviewQueueFailure;

export interface ProfileSignalReviewQueueService {
  listUpdateSuggestions: (
    input?: ProfileSignalReviewQueueInput,
  ) => ProfileSignalReviewQueueResult;
  acceptUpdateSuggestion: (
    id: string,
  ) => ProfileSignalSuggestionAcceptResult;
}
