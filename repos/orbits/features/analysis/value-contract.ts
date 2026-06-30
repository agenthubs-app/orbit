import type { AppErrorCode } from "../../shared/errors/app-error";

// Relationship Value contract 描述单条关系的价值评分和下一步建议。
// 当前评分来自 mock/rule，不调用外部 scoring、AI 或数据库写入。
export const RELATIONSHIP_VALUE_TYPES = [
  "strategic_intro",
  "event_follow_up",
  "community_bridge",
  "low_context",
] as const;

export type RelationshipValueType = (typeof RELATIONSHIP_VALUE_TYPES)[number];

export const RELATIONSHIP_VALUE_PRIORITY_BANDS = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

export type RelationshipValuePriorityBand =
  (typeof RELATIONSHIP_VALUE_PRIORITY_BANDS)[number];

export const RELATIONSHIP_VALUE_ERROR_CODES = [
  "RELATIONSHIP_VALUE_NOT_FOUND",
  "RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY",
  "RELATIONSHIP_VALUE_RECOMPUTE_PENDING",
  "RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED",
] as const;

export type RelationshipValueErrorCode =
  (typeof RELATIONSHIP_VALUE_ERROR_CODES)[number];

export type RelationshipValueScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type RelationshipValueState = "success" | "empty" | "pending";

// 错误定义区分关系缺失、重算请求非法、pending 和受控失败。
export interface RelationshipValueErrorDefinition {
  code: RelationshipValueErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const RELATIONSHIP_VALUE_ERROR_DEFINITIONS = {
  RELATIONSHIP_VALUE_NOT_FOUND: {
    code: "RELATIONSHIP_VALUE_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "That mock connection is not available for relationship value scoring.",
    recovery:
      "Use demo-connection-1 or choose an explicit empty-state scenario before scoring relationship value.",
  },
  RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY: {
    code: "RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY",
    appCode: "VALIDATION_ERROR",
    message:
      "The mock relationship value recompute request body must be valid JSON.",
    recovery:
      "Send a JSON object with connectionId and optional evidenceIds fields.",
  },
  RELATIONSHIP_VALUE_RECOMPUTE_PENDING: {
    code: "RELATIONSHIP_VALUE_RECOMPUTE_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock relationship value recompute is waiting for fixture review.",
    recovery:
      "Render the pending recompute state and avoid live ranking, persistence, or delivery work.",
  },
  RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED: {
    code: "RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock relationship value scoring boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry external scoring, database, AI, calendar, email, device, or notification work.",
  },
} as const satisfies Record<
  RelationshipValueErrorCode,
  RelationshipValueErrorDefinition
>;

export interface RelationshipValueSourceEvidence {
  evidenceId: string;
  label: string;
  sourceType: "event_import" | "manual" | "email_signal";
  contribution:
    | "met_at_event"
    | "business_context"
    | "decision_window"
    | "follow_up_urgency";
  capturedAt: string;
}

export interface RelationshipValuePriorityFactor {
  label: string;
  points: number;
  evidenceIds: readonly string[];
}

// PriorityScore 把分数、档位和加分因子拆开，便于 UI 解释评分来源。
export interface RelationshipValuePriorityScore {
  value: number;
  band: RelationshipValuePriorityBand;
  calculation: string;
  factors: readonly RelationshipValuePriorityFactor[];
}

export interface RelationshipValueRationale {
  summary: string;
  evidence: readonly RelationshipValueSourceEvidence[];
  limitations: readonly string[];
}

export interface RelationshipValueSuggestedNextAction {
  label: string;
  dueWindow: string;
  channel: "email" | "event_follow_up" | "manual_note";
  confidence: "high" | "medium" | "low";
  reason: string;
}

// RelationshipValueAssessment 是最终价值评估结果，不代表已创建任务。
export interface RelationshipValueAssessment {
  id: string;
  connectionId: string;
  contactId: string;
  contactDisplayName: string;
  relationshipValueType: RelationshipValueType;
  priorityScore: RelationshipValuePriorityScore;
  rationale: RelationshipValueRationale;
  suggestedNextAction: RelationshipValueSuggestedNextAction;
  sourceEvidenceIds: readonly string[];
  scoredAt: string;
  createdBy: "mock-relationship-value-scoring-service";
}

// provenance 记录评分没有触发真实数据库、AI、日历、邮件或通知。
export interface RelationshipValueProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-relationship-value-only";
  generationMethod: "fixture" | "rule-based";
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// lookup 和 recompute 输入分开；recompute 允许指定参与重算的 evidenceIds。
export interface RelationshipValueLookupInput {
  connectionId: string;
  scenario?: RelationshipValueScenario | string | null;
}

export interface RelationshipValueRecomputeInput
  extends RelationshipValueLookupInput {
  evidenceIds?: readonly string[] | null;
}

export interface RelationshipValuePayload {
  state: RelationshipValueState;
  assessment: RelationshipValueAssessment | null;
  summary: string;
  provenance: RelationshipValueProvenance;
  nextAction: string;
}

export interface RelationshipValueSuccess {
  success: true;
  data: RelationshipValuePayload;
}

export interface RelationshipValueFailure {
  success: false;
  error: RelationshipValueErrorDefinition & {
    state: "failure";
    provenance: RelationshipValueProvenance;
    evidenceIds: readonly string[];
  };
}

export type RelationshipValueFailureForCode<
  TCode extends RelationshipValueErrorCode,
> = Omit<RelationshipValueFailure, "error"> & {
  error: RelationshipValueFailure["error"] & {
    code: TCode;
  };
};

export type RelationshipValueInvalidBodyFailure =
  RelationshipValueFailureForCode<"RELATIONSHIP_VALUE_RECOMPUTE_INVALID_BODY">;

export type RelationshipValueResult =
  | RelationshipValueSuccess
  | RelationshipValueFailure;

export interface RelationshipValueScoringService {
  getRelationshipValue: (
    input: RelationshipValueLookupInput,
  ) => RelationshipValueResult;
  recomputeRelationshipValue: (
    input: RelationshipValueRecomputeInput,
  ) => RelationshipValueResult;
  invalidRecomputeBody: () => RelationshipValueInvalidBodyFailure;
}
