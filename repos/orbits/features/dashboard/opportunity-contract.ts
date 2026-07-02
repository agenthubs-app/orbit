import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Opportunity Reminder Analytics contract 描述 dashboard 的机会提醒和沉睡高价值联系人。
// 当前不执行预测评分、后台挖掘或 live analytics job。
export const OPPORTUNITY_REMINDER_ANALYTICS_ERROR_CODES = [
  "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED",
  "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED",
  "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED",
] as const;

export type OpportunityReminderAnalyticsErrorCode =
  (typeof OPPORTUNITY_REMINDER_ANALYTICS_ERROR_CODES)[number];

export type OpportunityReminderAnalyticsScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type OpportunityReminderAnalyticsState =
  | "success"
  | "empty"
  | "pending";

export type OpportunityPriority = "high" | "medium";

export type SuggestedContactReasonType =
  | "goal_match"
  | "dormancy"
  | "event_context"
  | "referral_path";

// 输入只控制 mock 场景；recompute 仍是本地规则结果。
export interface OpportunityReminderAnalyticsInput {
  scenario?: OpportunityReminderAnalyticsScenario | string | null;
}

export interface OpportunityReminderAnalyticsErrorDefinition {
  code: OpportunityReminderAnalyticsErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 机会提醒失败时不触发预测 scoring、后台任务或数据库读写。
export const OPPORTUNITY_REMINDER_ANALYTICS_ERROR_DEFINITIONS = {
  OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED: {
    code: "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock opportunity reminder analytics boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the opportunity reminder analytics mock failure state and do not run predictive scoring, background opportunity mining, live analytics jobs, databases, providers, devices, or external networks.",
  },
  OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED: {
    code: "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The opportunity reminder analytics live service returned a controlled failure state.",
    recovery:
      "Render the live opportunity reminder failure state, keep reminder actions off, and inspect the source-backed relationship graph before retrying.",
  },
  OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED: {
    code: "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "Opportunity reminder analytics live storage is not configured for this workspace.",
    recovery:
      "Configure the shared live record store before requesting live opportunity reminder analytics. Do not fall back to mock data silently.",
  },
} as const satisfies Record<
  OpportunityReminderAnalyticsErrorCode,
  OpportunityReminderAnalyticsErrorDefinition
>;

export type OpportunityReminderAnalyticsSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "chat_summary"
    | "referral"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy:
    | "mock-opportunity-reminder-analytics-rules"
    | "live-store-query";
};

// provenance 记录 analytics 生成方式和所有未执行的后台能力。
export interface OpportunityReminderAnalyticsProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-opportunity-reminder-analytics-only"
    | "live-opportunity-reminder-analytics";
  generationMethod:
    | "fixture"
    | "rule-based-current-goal-match"
    | "rule-based-state"
    | "rule-based-recompute"
    | "live-store-query";
  predictiveScoringExecuted: false;
  backgroundOpportunityMiningExecuted: false;
  liveAnalyticsJobExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: boolean;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

// HighPriorityOpportunity 是建议机会，不是已创建任务。
export interface HighPriorityOpportunity {
  opportunityId: string;
  contactId: string;
  contactName: string;
  organization: string;
  title: string;
  priority: OpportunityPriority;
  priorityScore: number;
  currentGoalId: string;
  reason: string;
  suggestedAction: string;
  dueLabel: string;
  sourceRefs: readonly OpportunityReminderAnalyticsSourceReference[];
  evidenceIds: readonly string[];
}

export interface DormantHighValueContact {
  contactId: string;
  contactName: string;
  organization: string;
  valueType: "commercial_opportunity" | "strategic_fit" | "referral_path";
  valueScore: number;
  lastTouchpointDays: number;
  lastTouchpointLabel: string;
  reason: string;
  suggestedAction: string;
  sourceRefs: readonly OpportunityReminderAnalyticsSourceReference[];
  evidenceIds: readonly string[];
}

// CurrentGoalMatch 解释当前关系目标和机会之间的覆盖情况。
export interface CurrentGoalMatch {
  goalId: string;
  label: string;
  targetOutcome: string;
  coverageScore: number;
  matchedOpportunityIds: readonly string[];
  missingContext: string;
  evidenceIds: readonly string[];
}

export interface SuggestedContactReason {
  reasonId: string;
  contactId: string;
  contactName: string;
  reasonType: SuggestedContactReasonType;
  reason: string;
  confidence: "high" | "medium";
  sourceRefs: readonly OpportunityReminderAnalyticsSourceReference[];
  evidenceIds: readonly string[];
}

export interface OpportunityReminderAnalyticsPayload {
  state: OpportunityReminderAnalyticsState;
  highPriorityOpportunities: readonly HighPriorityOpportunity[];
  dormantHighValueContacts: readonly DormantHighValueContact[];
  currentGoalMatches: readonly CurrentGoalMatch[];
  suggestedContactReasons: readonly SuggestedContactReason[];
  summary: string;
  provenance: OpportunityReminderAnalyticsProvenance;
  nextAction: string;
}

export interface OpportunityReminderRecomputePayload {
  state: OpportunityReminderAnalyticsState;
  recomputedAt: string;
  evaluatedContacts: number;
  generatedOpportunityCount: number;
  changedOpportunityIds: readonly string[];
  summary: string;
  provenance: OpportunityReminderAnalyticsProvenance;
  nextAction: string;
}

export interface OpportunityReminderAnalyticsSuccess {
  success: true;
  data: OpportunityReminderAnalyticsPayload;
}

export interface OpportunityReminderRecomputeSuccess {
  success: true;
  data: OpportunityReminderRecomputePayload;
}

export interface OpportunityReminderAnalyticsFailure {
  success: false;
  error: OpportunityReminderAnalyticsErrorDefinition & {
    state: "failure";
    provenance: OpportunityReminderAnalyticsProvenance;
    evidenceIds: readonly string[];
  };
}

export type OpportunityReminderAnalyticsResult =
  | OpportunityReminderAnalyticsSuccess
  | OpportunityReminderAnalyticsFailure;

export type OpportunityReminderRecomputeResult =
  | OpportunityReminderRecomputeSuccess
  | OpportunityReminderAnalyticsFailure;

export type OpportunityReminderAnalyticsServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface OpportunityReminderAnalyticsService {
  getOpportunityReminderAnalytics: (
    input?: OpportunityReminderAnalyticsInput,
  ) => OpportunityReminderAnalyticsServiceResult<OpportunityReminderAnalyticsResult>;
  recomputeOpportunityReminderAnalytics: (
    input?: OpportunityReminderAnalyticsInput,
  ) => OpportunityReminderAnalyticsServiceResult<OpportunityReminderRecomputeResult>;
}

export function opportunityReminderAnalyticsFailureToAppError(
  failure: OpportunityReminderAnalyticsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function opportunityReminderAnalyticsFailureContext(
  failure: OpportunityReminderAnalyticsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    opportunityReminderAnalyticsErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "opportunity-reminder-analytics",
  };
}
