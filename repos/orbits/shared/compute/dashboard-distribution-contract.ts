import type { SourceReferenceContract as SourceReferenceDTO } from "../contract/source";
import type { IndustryIdCode } from "../contract/industries";
import type { RelationshipTier, RelationshipTierGroup } from "../contract/relationship-strength";
import type { DashboardAppErrorCode } from "./dashboard-contract";

// Sprint 0117 (dashboard D3): moved from features/dashboard/distribution-contract.ts into the shared directory
// (shared/compute, copied to the App by npm run sync:contract). The server
// file re-exports it and keeps only its server-side error mapping.

// Network Distribution Analytics contract 描述 dashboard 的网络分布和缺口分析。
// 当前使用 fixture/rule，不运行图算法、embedding search 或 live analytics job。
export const NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES = [
  "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
  "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED",
  "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED",
  "NETWORK_STRUCTURE_BUCKET_NOT_FOUND",
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
  appCode: DashboardAppErrorCode;
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
  NETWORK_STRUCTURE_BUCKET_NOT_FOUND: {
    code: "NETWORK_STRUCTURE_BUCKET_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "That network structure group is not available for this actor.",
    recovery: "Refresh the analysis and choose a visible structure group.",
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

/**
 * W0047（R-1）：按 relationship_strengths 缓存（只由关系时间线推出）分组的档位分布。dormant 单独成组且优先；
 * 四组人数之和 = 有缓存行的联系人数（缺行的联系人不计入任何档）。`contactIds` 是图顺序的短名单
 * （DASHBOARD_SHORT_LIST_LIMIT 条）。与既有 relationshipStrengthDistribution 相互独立。
 */
export interface RelationshipTierDistributionBucket {
  tier: RelationshipTierGroup;
  relationshipCount: number;
  percentage: number;
  contactIds: readonly string[];
}

/** 一位联系人的档位（读模型行的投影），图路径的输入。 */
export interface RelationshipTierAssignment {
  contactId: string;
  tier: RelationshipTier;
  dormant: boolean;
}

export interface NetworkDistributionAnalyticsPayload {
  state: NetworkDistributionAnalyticsState;
  industryDistribution: readonly IndustryDistributionBucket[];
  valueTypeDistribution: readonly ValueTypeDistributionBucket[];
  relationshipStrengthDistribution: readonly RelationshipStrengthDistributionBucket[];
  /** W0047：新增可选字段；缓存为空时为空数组（旧客户端忽略）。 */
  relationshipTierDistribution?: readonly RelationshipTierDistributionBucket[];
  structureDistributions: NetworkStructureDistributions;
  summary: string;
  provenance: NetworkDistributionAnalyticsProvenance;
  nextAction: string;
}

export type NetworkStructureDimensionId =
  | "industry"
  | "location"
  | "role"
  | "relationship";

export interface NetworkStructureDistributionBucket {
  bucketId: string;
  label: string;
  contactCount: number;
  percentage: number;
  evidenceIds: readonly string[];
  missingData: boolean;
  primaryIndustryId?: IndustryIdCode | undefined;
}

export type NetworkStructureDistributions = Readonly<
  Record<
    NetworkStructureDimensionId,
    readonly NetworkStructureDistributionBucket[]
  >
>;

export interface NetworkStructureDetailInput
  extends NetworkDistributionAnalyticsInput {
  bucketId: string;
  dimension: NetworkStructureDimensionId | string;
}

export interface NetworkStructureDetailContact {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  location: string;
  relationshipStrength: NetworkRelationshipStrength;
  tags: readonly string[];
}

export interface NetworkStructureDetailPayload {
  state: "success" | "empty";
  dimension: NetworkStructureDimensionId;
  bucket: NetworkStructureDistributionBucket;
  totalContactCount: number;
  relationshipQuality: readonly {
    id: NetworkRelationshipStrength;
    label: string;
    contactCount: number;
    percentage: number;
  }[];
  commonTags: readonly { label: string; contactCount: number }[];
  insight: string;
  contacts: readonly NetworkStructureDetailContact[];
  provenance: NetworkDistributionAnalyticsProvenance;
}

export interface NetworkStructureDetailSuccess {
  success: true;
  data: NetworkStructureDetailPayload;
}

export type NetworkStructureDetailResult =
  | NetworkStructureDetailSuccess
  | NetworkDistributionAnalyticsFailure;

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
  getStructureDetail: (
    input: NetworkStructureDetailInput,
  ) => NetworkDistributionAnalyticsServiceResult<NetworkStructureDetailResult>;
}
