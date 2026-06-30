import type { AppErrorCode } from "../../shared/errors/app-error";

export const RELATIONSHIP_VALUE_FIXTURE_SOURCE =
  "fixture:features/analysis/value-contract.ts" as const;

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

const fixtureCollectedAt = "2026-06-25T19:30:00.000Z";
const fixtureScoredAt = "2026-06-25T19:35:00.000Z";

export const mockRelationshipValueEvidence = [
  {
    evidenceId: "evidence:connection-climate-dinner",
    label: "Climate founders dinner",
    sourceType: "event_import",
    contribution: "met_at_event",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-storage-pilot",
    label: "Storage pilot note",
    sourceType: "manual",
    contribution: "business_context",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-email-context",
    label: "Partner review email context",
    sourceType: "email_signal",
    contribution: "decision_window",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
  {
    evidenceId: "evidence:connection-follow-up",
    label: "Follow-up path identified",
    sourceType: "manual",
    contribution: "follow_up_urgency",
    capturedAt: "2026-06-25T19:05:00.000Z",
  },
] as const satisfies readonly RelationshipValueSourceEvidence[];

export const mockRelationshipValueProvenance: RelationshipValueProvenance = {
  source: RELATIONSHIP_VALUE_FIXTURE_SOURCE,
  sourceLabel: "Mock relationship value scoring fixture",
  evidenceIds: mockRelationshipValueEvidence.map((evidence) => evidence.evidenceId),
  collectedAt: fixtureCollectedAt,
  privacy: "demo-relationship-value-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyRelationshipValueProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock empty relationship value rule",
    evidenceIds: ["evidence:relationship-value-empty"],
    generationMethod: "rule-based",
  };

export const mockPendingRelationshipValueProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock pending relationship value rule",
    evidenceIds: ["evidence:relationship-value-pending"],
    generationMethod: "rule-based",
  };

export const mockRelationshipValueFailureProvenance: RelationshipValueProvenance =
  {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock relationship value controlled failure rule",
    evidenceIds: ["evidence:relationship-value-controlled-failure"],
    generationMethod: "rule-based",
  };

export const mockRelationshipValueAssessment: RelationshipValueAssessment = {
  id: "relationship-value:demo-connection-1",
  connectionId: "demo-connection-1",
  contactId: "contact:kenji-watanabe",
  contactDisplayName: "Kenji Watanabe",
  relationshipValueType: "strategic_intro",
  priorityScore: {
    value: 93,
    band: "critical",
    calculation:
      "deterministic fixture rule: base 74 + strategic context 11 + follow-up urgency 8",
    factors: [
      {
        label: "Clear operator-introduction fit",
        points: 11,
        evidenceIds: [
          "evidence:connection-storage-pilot",
          "evidence:connection-email-context",
        ],
      },
      {
        label: "Time-sensitive follow-up path",
        points: 8,
        evidenceIds: ["evidence:connection-follow-up"],
      },
    ],
  },
  rationale: {
    summary:
      "Kenji has high relationship value because the storage pilot operator intro is explicit, timely, and backed by event plus email context.",
    evidence: mockRelationshipValueEvidence,
    limitations: [
      "The mock score cannot observe live replies, calendar activity, or delivery outcomes.",
    ],
  },
  suggestedNextAction: {
    label: "Send the storage pilot operator introduction",
    dueWindow: "before Friday partner review",
    channel: "email",
    confidence: "high",
    reason:
      "The evidence says Kenji asked for an operator introduction and the follow-up window is still open.",
  },
  sourceEvidenceIds: mockRelationshipValueEvidence.map(
    (evidence) => evidence.evidenceId,
  ),
  scoredAt: fixtureScoredAt,
  createdBy: "mock-relationship-value-scoring-service",
};

export const mockRecomputedRelationshipValueAssessment: RelationshipValueAssessment =
  {
    ...mockRelationshipValueAssessment,
    id: "relationship-value:demo-connection-1:recomputed",
    priorityScore: {
      value: 88,
      band: "high",
      calculation:
        "deterministic fixture rule: base 72 + evidence 10 + action urgency 6",
      factors: [
        {
          label: "Selected evidence confirms business context",
          points: 10,
          evidenceIds: [
            "evidence:connection-storage-pilot",
            "evidence:connection-follow-up",
          ],
        },
        {
          label: "Suggested action remains time-sensitive",
          points: 6,
          evidenceIds: ["evidence:connection-follow-up"],
        },
      ],
    },
    rationale: {
      ...mockRelationshipValueAssessment.rationale,
      summary:
        "The recompute keeps Kenji high priority because selected evidence still supports a timely operator introduction.",
      evidence: mockRelationshipValueEvidence.filter((evidence) =>
        [
          "evidence:connection-storage-pilot",
          "evidence:connection-follow-up",
        ].includes(evidence.evidenceId),
      ),
    },
    sourceEvidenceIds: [
      "evidence:connection-storage-pilot",
      "evidence:connection-follow-up",
    ],
    scoredAt: "2026-06-25T19:40:00.000Z",
  };

export const mockRelationshipValueScoringFixture: RelationshipValuePayload = {
  state: "success",
  assessment: mockRelationshipValueAssessment,
  summary:
    "Kenji Watanabe is a critical relationship value candidate for a source-backed operator introduction.",
  provenance: mockRelationshipValueProvenance,
  nextAction: "Send the storage pilot operator introduction.",
};

export const mockRecomputedRelationshipValueFixture: RelationshipValuePayload = {
  state: "success",
  assessment: mockRecomputedRelationshipValueAssessment,
  summary:
    "The deterministic recompute keeps Kenji Watanabe in the high-priority band.",
  provenance: {
    ...mockRelationshipValueProvenance,
    sourceLabel: "Mock relationship value recompute rule",
    evidenceIds: mockRecomputedRelationshipValueAssessment.sourceEvidenceIds,
    generationMethod: "rule-based",
  },
  nextAction: "Use the selected evidence before sending the introduction.",
};

export const mockEmptyRelationshipValueScoringFixture: RelationshipValuePayload =
  {
    state: "empty",
    assessment: null,
    summary: "No mock relationship value can be scored without evidence.",
    provenance: mockEmptyRelationshipValueProvenance,
    nextAction:
      "Select a mock connection with evidence before scoring relationship value.",
  };

export const mockPendingRelationshipValueScoringFixture: RelationshipValuePayload =
  {
    state: "pending",
    assessment: null,
    summary:
      "Relationship value scoring is waiting for local fixture review before a priority score is exposed.",
    provenance: mockPendingRelationshipValueProvenance,
    nextAction:
      "Wait for mock evidence review before recomputing relationship value.",
  };
