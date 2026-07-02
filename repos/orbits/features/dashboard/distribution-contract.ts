import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Network Distribution Analytics contract 描述 dashboard 的网络分布和缺口分析。
// 当前使用 fixture/rule，不运行图算法、embedding search 或 live analytics job。
export const NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES = [
  "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
  "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED",
  "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED",
] as const;

export type NetworkDistributionAnalyticsErrorCode =
  (typeof NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES)[number];

export type NetworkDistributionAnalyticsScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type NetworkDistributionAnalyticsState =
  | "success"
  | "empty"
  | "pending";

export type NetworkRelationshipValueType =
  | "commercial_opportunity"
  | "strategic_fit"
  | "referral_path"
  | "investor_access";

export type NetworkRelationshipStrength = "strong" | "warm" | "weak";

export type NetworkGapSeverity = "high" | "medium" | "low";

// 输入只控制场景；真实分析参数后续应在这里扩展。
export interface NetworkDistributionAnalyticsInput {
  scenario?: NetworkDistributionAnalyticsScenario | string | null;
}

export interface NetworkDistributionAnalyticsErrorDefinition {
  code: NetworkDistributionAnalyticsErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// dashboard 分析失败必须停在 mock 边界，不触发后台分析或数据库读取。
export const NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS = {
  NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED: {
    code: "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock network distribution analytics boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the network distribution analytics mock failure state and do not run graph algorithms, embedding search, live analytics jobs, databases, providers, devices, or external networks.",
  },
  NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED: {
    code: "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The network distribution analytics live service returned a controlled failure state.",
    recovery:
      "Render the live network distribution failure state, keep analytics actions off, and inspect the source-backed relationship graph before retrying.",
  },
  NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED: {
    code: "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "Network distribution analytics live storage is not configured for this workspace.",
    recovery:
      "Configure the shared live record store before requesting live network distribution analytics. Do not fall back to mock data silently.",
  },
} as const satisfies Record<
  NetworkDistributionAnalyticsErrorCode,
  NetworkDistributionAnalyticsErrorDefinition
>;

export type NetworkDistributionAnalyticsSourceReference = SourceReferenceDTO & {
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
    | "mock-network-distribution-analytics-rules"
    | "live-store-query";
};

// provenance 是分布分析的安全账本。
export interface NetworkDistributionAnalyticsProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-network-distribution-analytics-only"
    | "live-network-distribution-analytics";
  generationMethod:
    | "fixture"
    | "rule-based-gap-analysis"
    | "rule-based-state"
    | "live-store-query";
  graphAlgorithmExecuted: false;
  embeddingSearchExecuted: false;
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

// 三类 bucket 分别支持行业、关系价值类型和关系强度分布图。
export interface IndustryDistributionBucket {
  bucketId: string;
  label: string;
  contactCount: number;
  percentage: number;
  topOrganizations: readonly string[];
  sourceRefs: readonly NetworkDistributionAnalyticsSourceReference[];
  evidenceIds: readonly string[];
}

export interface ValueTypeDistributionBucket {
  valueType: NetworkRelationshipValueType;
  label: string;
  relationshipCount: number;
  percentage: number;
  exampleConnectionIds: readonly string[];
  evidenceIds: readonly string[];
}

export interface RelationshipStrengthDistributionBucket {
  strength: NetworkRelationshipStrength;
  relationshipCount: number;
  percentage: number;
  followupRisk: "low" | "moderate" | "high";
  evidenceIds: readonly string[];
}

export interface NetworkDistributionAnalyticsPayload {
  state: NetworkDistributionAnalyticsState;
  industryDistribution: readonly IndustryDistributionBucket[];
  valueTypeDistribution: readonly ValueTypeDistributionBucket[];
  relationshipStrengthDistribution: readonly RelationshipStrengthDistributionBucket[];
  summary: string;
  provenance: NetworkDistributionAnalyticsProvenance;
  nextAction: string;
}

// GapAnalysisItem 描述网络覆盖缺口和推荐动作，不会自动创建任务。
export interface NetworkGapAnalysisItem {
  gapId: string;
  label: string;
  gapType:
    | "industry_underrepresented"
    | "value_type_underrepresented"
    | "strength_underrepresented";
  severity: NetworkGapSeverity;
  currentCount: number;
  targetCount: number;
  recommendedAction: string;
  evidenceIds: readonly string[];
}

export interface NetworkGapAnalysisPayload {
  state: NetworkDistributionAnalyticsState;
  coverageScore: number;
  gaps: readonly NetworkGapAnalysisItem[];
  summary: string;
  provenance: NetworkDistributionAnalyticsProvenance;
  nextAction: string;
}

export interface NetworkDistributionAnalyticsSuccess {
  success: true;
  data: NetworkDistributionAnalyticsPayload;
}

export interface NetworkGapAnalysisSuccess {
  success: true;
  data: NetworkGapAnalysisPayload;
}

export interface NetworkDistributionAnalyticsFailure {
  success: false;
  error: NetworkDistributionAnalyticsErrorDefinition & {
    state: "failure";
    provenance: NetworkDistributionAnalyticsProvenance;
    evidenceIds: readonly string[];
  };
}

export type NetworkDistributionAnalyticsResult =
  | NetworkDistributionAnalyticsSuccess
  | NetworkDistributionAnalyticsFailure;

export type NetworkGapAnalysisResult =
  | NetworkGapAnalysisSuccess
  | NetworkDistributionAnalyticsFailure;

export type NetworkDistributionAnalyticsServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface NetworkDistributionAnalyticsService {
  getDistributions: (
    input?: NetworkDistributionAnalyticsInput,
  ) => NetworkDistributionAnalyticsServiceResult<NetworkDistributionAnalyticsResult>;
  getNetworkGaps: (
    input?: NetworkDistributionAnalyticsInput,
  ) => NetworkDistributionAnalyticsServiceResult<NetworkGapAnalysisResult>;
}

export function networkDistributionAnalyticsFailureToAppError(
  failure: NetworkDistributionAnalyticsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function networkDistributionAnalyticsFailureContext(
  failure: NetworkDistributionAnalyticsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    networkDistributionAnalyticsErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "network-distribution-analytics",
  };
}
