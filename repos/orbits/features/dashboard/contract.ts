import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Dashboard contract 是首页跨模块聚合的只读 DTO。
// 它汇总联系人、关系价值、跟进、沉睡联系人和近期活动，不执行 live analytics。
export const DASHBOARD_AGGREGATE_ERROR_CODES = [
  "DASHBOARD_AGGREGATE_MOCK_FAILED",
] as const;

export type DashboardAggregateErrorCode =
  (typeof DASHBOARD_AGGREGATE_ERROR_CODES)[number];

export type DashboardAggregateScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type DashboardAggregateState = "success" | "empty" | "pending";

export type DashboardRecentActivityType =
  | "new_contact"
  | "high_value"
  | "followup_due"
  | "dormant";

// aggregate input 允许限制近期活动数量；summary input 用于轻量概览。
export interface DashboardAggregateInput {
  scenario?: DashboardAggregateScenario | string | null;
  activityLimit?: number | null;
}

export interface DashboardAggregateSummaryInput {
  scenario?: DashboardAggregateScenario | string | null;
}

// Dashboard 目前只有 controlled failure，一旦失败也必须停在 mock 边界。
export interface DashboardAggregateErrorDefinition {
  code: DashboardAggregateErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const DASHBOARD_AGGREGATE_ERROR_DEFINITIONS = {
  DASHBOARD_AGGREGATE_MOCK_FAILED: {
    code: "DASHBOARD_AGGREGATE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock dashboard aggregate boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the dashboard aggregate mock failure state and do not run live analytics queries, production materialized aggregates, databases, providers, devices, or external networks.",
  },
} as const satisfies Record<
  DashboardAggregateErrorCode,
  DashboardAggregateErrorDefinition
>;

export type DashboardAggregateSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "chat_summary"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-dashboard-aggregate-rules";
};

// 以下 aggregate 类型对应首页区块，按 UI 信息架构组织而不是按底层表组织。
export interface DashboardRelationshipAssetTotals {
  contacts: number;
  connections: number;
  evidenceBackedRelationships: number;
  eventsRepresented: number;
}

export interface DashboardNewContact {
  contactId: string;
  name: string;
  organization: string;
  sourceLabel: string;
  source: DashboardAggregateSourceReference;
  evidenceIds: readonly string[];
}

export interface DashboardNewContactsAggregate {
  count: number;
  windowLabel: string;
  contacts: readonly DashboardNewContact[];
}

export interface DashboardHighValueRelationship {
  connectionId: string;
  contactName: string;
  organization: string;
  valueType: "strategic_fit" | "commercial_opportunity" | "referral_path";
  priorityScore: number;
  reason: string;
  evidenceIds: readonly string[];
}

export interface DashboardFollowupTask {
  taskId: string;
  contactName: string;
  dueLabel: string;
  recommendedAction: string;
  evidenceIds: readonly string[];
}

export interface DashboardPendingFollowupsAggregate {
  count: number;
  tasks: readonly DashboardFollowupTask[];
}

export interface DashboardDormantContact {
  contactId: string;
  contactName: string;
  organization: string;
  lastTouchpointDays: number;
  suggestedAction: string;
  evidenceIds: readonly string[];
}

export interface DashboardDormantContactsAggregate {
  count: number;
  contacts: readonly DashboardDormantContact[];
}

export interface DashboardRecentActivity {
  activityId: string;
  type: DashboardRecentActivityType;
  label: string;
  occurredAt: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
}

// provenance 是 dashboard 聚合的安全账本；当前没有真实分析查询或数据库读写。
export interface DashboardAggregateProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-dashboard-aggregate-only";
  generationMethod:
    | "fixture"
    | "rule-based-summary"
    | "rule-based-state"
    | "rule-based-activity-limit"
    | "local-remote-store-query";
  liveAnalyticsQueryExecuted: false;
  productionAggregateReadExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: boolean;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

// 完整聚合 payload 供首页主视图使用。
export interface DashboardAggregatePayload {
  state: DashboardAggregateState;
  relationshipAssetTotals: DashboardRelationshipAssetTotals;
  newContacts: DashboardNewContactsAggregate;
  highValueCount: number;
  highValueRelationships: readonly DashboardHighValueRelationship[];
  pendingFollowups: DashboardPendingFollowupsAggregate;
  dormantContacts: DashboardDormantContactsAggregate;
  recentActivity: readonly DashboardRecentActivity[];
  summary: string;
  provenance: DashboardAggregateProvenance;
  nextAction: string;
}

// summary metric 是更小的读模型，适合顶部指标或导航摘要。
export interface DashboardSummaryMetric {
  id:
    | "relationship-assets"
    | "new-contacts"
    | "high-value"
    | "pending-followups"
    | "dormant-contacts";
  label: string;
  value: number;
  evidenceIds: readonly string[];
}

// summary payload 只保留指标和近期活动，避免轻量 UI 依赖完整 aggregate。
export interface DashboardAggregateSummaryPayload {
  state: DashboardAggregateState;
  metrics: readonly DashboardSummaryMetric[];
  recentActivity: readonly DashboardRecentActivity[];
  summary: string;
  provenance: DashboardAggregateProvenance;
  nextAction: string;
}

export interface DashboardAggregateSuccess {
  success: true;
  data: DashboardAggregatePayload;
}

export interface DashboardAggregateSummarySuccess {
  success: true;
  data: DashboardAggregateSummaryPayload;
}

export interface DashboardAggregateFailure {
  success: false;
  error: DashboardAggregateErrorDefinition & {
    state: "failure";
    provenance: DashboardAggregateProvenance;
    evidenceIds: readonly string[];
  };
}

export type DashboardAggregateResult =
  | DashboardAggregateSuccess
  | DashboardAggregateFailure;

export type DashboardAggregateSummaryResult =
  | DashboardAggregateSummarySuccess
  | DashboardAggregateFailure;

export function dashboardAggregateFailureToAppError(
  failure: DashboardAggregateFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function dashboardAggregateFailureContext(
  failure: DashboardAggregateFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    dashboardAggregateErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock dashboard aggregate failure came from deterministic fixture rules.",
    service: "dashboard-aggregate-mock",
  };
}
