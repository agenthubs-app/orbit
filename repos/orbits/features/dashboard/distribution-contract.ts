import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE =
  "fixture:features/dashboard/distribution-contract.ts" as const;

// Network Distribution Analytics contract 描述 dashboard 的网络分布和缺口分析。
// 当前使用 fixture/rule，不运行图算法、embedding search 或 live analytics job。
export const NETWORK_DISTRIBUTION_ANALYTICS_ERROR_CODES = [
  "NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED",
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
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-network-distribution-analytics-rules";
};
// provenance 是分布分析的安全账本。

export interface NetworkDistributionAnalyticsProvenance {
  source: typeof NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-network-distribution-analytics-only";
  generationMethod: "fixture" | "rule-based-gap-analysis" | "rule-based-state";
  graphAlgorithmExecuted: false;
  embeddingSearchExecuted: false;
  liveAnalyticsJobExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
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

export interface NetworkDistributionAnalyticsService {
  getDistributions: (
    input?: NetworkDistributionAnalyticsInput,
  ) => NetworkDistributionAnalyticsResult;
  getNetworkGaps: (
    input?: NetworkDistributionAnalyticsInput,
  ) => NetworkGapAnalysisResult;
}

const fixtureCollectedAt = "2026-06-25T22:10:00.000+09:00";

function source(input: {
  type: NetworkDistributionAnalyticsSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): NetworkDistributionAnalyticsSourceReference {
  return {
    ...input,
    generatedBy: "mock-network-distribution-analytics-rules",
  };
}

export const mockNetworkDistributionAnalyticsProvenance: NetworkDistributionAnalyticsProvenance =
  {
    source: NETWORK_DISTRIBUTION_ANALYTICS_FIXTURE_SOURCE,
    sourceLabel: "Mock network distribution analytics fixture",
    evidenceIds: [
      "evidence:network-distribution:industry:climate",
      "evidence:network-distribution:value:commercial",
      "evidence:network-distribution:strength:strong",
      "evidence:network-gap:enterprise-buyers",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-network-distribution-analytics-only",
    generationMethod: "fixture",
    graphAlgorithmExecuted: false,
    embeddingSearchExecuted: false,
    liveAnalyticsJobExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };

export const mockNetworkDistributionAnalyticsFailureProvenance: NetworkDistributionAnalyticsProvenance =
  {
    ...mockNetworkDistributionAnalyticsProvenance,
    sourceLabel: "Mock network distribution analytics controlled failure",
    evidenceIds: ["evidence:network-distribution:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const emptyStateProvenance: NetworkDistributionAnalyticsProvenance = {
  ...mockNetworkDistributionAnalyticsProvenance,
  sourceLabel: "Mock empty network distribution analytics state",
  evidenceIds: ["evidence:network-distribution:empty-state"],
  generationMethod: "rule-based-state",
};

const pendingStateProvenance: NetworkDistributionAnalyticsProvenance = {
  ...mockNetworkDistributionAnalyticsProvenance,
  sourceLabel: "Mock pending network distribution analytics state",
  evidenceIds: ["evidence:network-distribution:pending-state"],
  generationMethod: "rule-based-state",
};

const mockIndustryDistribution: readonly IndustryDistributionBucket[] = [
  {
    bucketId: "industry:climate-infrastructure",
    label: "Climate infrastructure",
    contactCount: 14,
    percentage: 37,
    topOrganizations: ["Kumo Grid", "Helio Works", "Harbor Labs"],
    sourceRefs: [
      source({
        type: "event_import",
        id: "source:network-distribution:climate-dinner",
        label: "Climate dinner attendee roster",
        providerRecordId: "event:climate-dinner:roster",
      }),
    ],
    evidenceIds: ["evidence:network-distribution:industry:climate"],
  },
  {
    bucketId: "industry:industrial-operations",
    label: "Industrial operations",
    contactCount: 10,
    percentage: 26,
    topOrganizations: ["Northstar Fleet", "Cedar Robotics"],
    sourceRefs: [
      source({
        type: "email_signal",
        id: "source:network-distribution:northstar-thread",
        label: "Northstar procurement thread",
        providerRecordId: "email-thread:northstar:procurement",
      }),
    ],
    evidenceIds: ["evidence:network-distribution:industry:industrial"],
  },
  {
    bucketId: "industry:venture-capital",
    label: "Venture capital",
    contactCount: 8,
    percentage: 21,
    topOrganizations: ["Mori Ventures", "Orbit Seed Fund"],
    sourceRefs: [
      source({
        type: "manual",
        id: "source:network-distribution:mori-intro",
        label: "Investor intro note",
        providerRecordId: "manual-note:mori-intro",
      }),
    ],
    evidenceIds: ["evidence:network-distribution:industry:venture"],
  },
  {
    bucketId: "industry:developer-platforms",
    label: "Developer platforms",
    contactCount: 6,
    percentage: 16,
    topOrganizations: ["Buildplane", "Stackwell"],
    sourceRefs: [
      source({
        type: "chat_summary",
        id: "source:network-distribution:developer-platform-chat",
        label: "Developer platform chat summary",
        providerRecordId: "chat-summary:developer-platforms",
      }),
    ],
    evidenceIds: ["evidence:network-distribution:industry:developer-platforms"],
  },
];

const mockValueTypeDistribution: readonly ValueTypeDistributionBucket[] = [
  {
    valueType: "commercial_opportunity",
    label: "Commercial opportunity",
    relationshipCount: 13,
    percentage: 34,
    exampleConnectionIds: ["connection:maya-chen", "connection:diego-rivera"],
    evidenceIds: ["evidence:network-distribution:value:commercial"],
  },
  {
    valueType: "strategic_fit",
    label: "Strategic fit",
    relationshipCount: 10,
    percentage: 26,
    exampleConnectionIds: ["connection:mina-park", "connection:sara-ito"],
    evidenceIds: ["evidence:network-distribution:value:strategic"],
  },
  {
    valueType: "referral_path",
    label: "Referral path",
    relationshipCount: 9,
    percentage: 24,
    exampleConnectionIds: ["connection:kenji-sato"],
    evidenceIds: ["evidence:network-distribution:value:referral"],
  },
  {
    valueType: "investor_access",
    label: "Investor access",
    relationshipCount: 6,
    percentage: 16,
    exampleConnectionIds: ["connection:ren-takahashi"],
    evidenceIds: ["evidence:network-distribution:value:investor"],
  },
];

const mockRelationshipStrengthDistribution: readonly RelationshipStrengthDistributionBucket[] =
  [
    {
      strength: "strong",
      relationshipCount: 12,
      percentage: 32,
      followupRisk: "low",
      evidenceIds: ["evidence:network-distribution:strength:strong"],
    },
    {
      strength: "warm",
      relationshipCount: 17,
      percentage: 45,
      followupRisk: "moderate",
      evidenceIds: ["evidence:network-distribution:strength:warm"],
    },
    {
      strength: "weak",
      relationshipCount: 9,
      percentage: 23,
      followupRisk: "high",
      evidenceIds: ["evidence:network-distribution:strength:weak"],
    },
  ];

export const mockNetworkDistributionAnalyticsFixture: NetworkDistributionAnalyticsPayload =
  {
    state: "success",
    industryDistribution: mockIndustryDistribution,
    valueTypeDistribution: mockValueTypeDistribution,
    relationshipStrengthDistribution: mockRelationshipStrengthDistribution,
    summary:
      "Mock network distribution analytics groups sourced relationships by industry, value type, and relationship strength from deterministic local fixtures.",
    provenance: mockNetworkDistributionAnalyticsProvenance,
    nextAction:
      "Review the highlighted network gaps before changing event goals or outreach priorities.",
  };

export const mockEmptyNetworkDistributionAnalyticsFixture: NetworkDistributionAnalyticsPayload =
  {
    state: "empty",
    industryDistribution: [],
    valueTypeDistribution: [],
    relationshipStrengthDistribution: [],
    summary:
      "The local network distribution analytics mock has no sourced relationships to bucket.",
    provenance: emptyStateProvenance,
    nextAction:
      "Add sourced contacts before showing distribution analytics.",
  };

export const mockPendingNetworkDistributionAnalyticsFixture: NetworkDistributionAnalyticsPayload =
  {
    state: "pending",
    industryDistribution: [],
    valueTypeDistribution: [],
    relationshipStrengthDistribution: [],
    summary:
      "The network distribution analytics mock is waiting for local fixture review.",
    provenance: pendingStateProvenance,
    nextAction:
      "Keep distribution analytics pending until the mock fixture refresh is approved.",
  };

export const mockNetworkGapAnalysisFixture: NetworkGapAnalysisPayload = {
  state: "success",
  coverageScore: 68,
  gaps: [
    {
      gapId: "gap:enterprise-buyers",
      label: "Enterprise buyer coverage",
      gapType: "industry_underrepresented",
      severity: "high",
      currentCount: 2,
      targetCount: 8,
      recommendedAction:
        "Prioritize event introductions to enterprise operations buyers before the next climate dinner.",
      evidenceIds: ["evidence:network-gap:enterprise-buyers"],
    },
    {
      gapId: "gap:investor-access",
      label: "Investor access is concentrated",
      gapType: "value_type_underrepresented",
      severity: "medium",
      currentCount: 6,
      targetCount: 10,
      recommendedAction:
        "Ask Kenji Sato for one adjacent seed investor intro instead of broadening cold outreach.",
      evidenceIds: ["evidence:network-gap:investor-access"],
    },
    {
      gapId: "gap:strong-asia-partners",
      label: "Strong Asia-Pacific channel partners",
      gapType: "strength_underrepresented",
      severity: "medium",
      currentCount: 3,
      targetCount: 7,
      recommendedAction:
        "Move warm channel partner relationships into explicit follow-up tasks with context notes.",
      evidenceIds: ["evidence:network-gap:strong-asia-partners"],
    },
  ],
  summary:
    "Rule-based mock gap analysis flags network segments where current sourced coverage is below the target coverage threshold.",
  provenance: {
    ...mockNetworkDistributionAnalyticsProvenance,
    sourceLabel: "Mock network gap rule output",
    evidenceIds: [
      "evidence:network-gap:enterprise-buyers",
      "evidence:network-gap:investor-access",
      "evidence:network-gap:strong-asia-partners",
    ],
    generationMethod: "rule-based-gap-analysis",
  },
  nextAction:
    "Use the gap recommendations to adjust event goals and follow-up priorities.",
};

export const mockEmptyNetworkGapAnalysisFixture: NetworkGapAnalysisPayload = {
  state: "empty",
  coverageScore: 0,
  gaps: [],
  summary:
    "The local network gap analysis mock has no sourced relationships to evaluate.",
  provenance: emptyStateProvenance,
  nextAction:
    "Add sourced contacts before showing network gap recommendations.",
};

export const mockPendingNetworkGapAnalysisFixture: NetworkGapAnalysisPayload = {
  state: "pending",
  coverageScore: 0,
  gaps: [],
  summary:
    "The network gap analysis mock is waiting for local fixture review.",
  provenance: pendingStateProvenance,
  nextAction:
    "Keep network gap analysis pending until the mock fixture refresh is approved.",
};

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
    provenance:
      "Mock network distribution analytics failure came from deterministic fixture rules.",
    service: "network-distribution-analytics-mock",
  };
}
