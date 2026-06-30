import {
  NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS,
  mockEmptyNetworkDistributionAnalyticsFixture,
  mockEmptyNetworkGapAnalysisFixture,
  mockNetworkDistributionAnalyticsFailureProvenance,
  mockNetworkDistributionAnalyticsFixture,
  mockNetworkGapAnalysisFixture,
  mockPendingNetworkDistributionAnalyticsFixture,
  mockPendingNetworkGapAnalysisFixture,
  type NetworkDistributionAnalyticsErrorCode,
  type NetworkDistributionAnalyticsFailure,
  type NetworkDistributionAnalyticsInput,
  type NetworkDistributionAnalyticsPayload,
  type NetworkDistributionAnalyticsResult,
  type NetworkDistributionAnalyticsScenario,
  type NetworkDistributionAnalyticsService,
  type NetworkGapAnalysisPayload,
  type NetworkGapAnalysisResult,
} from "./distribution-contract";

const supportedScenarios = new Set<NetworkDistributionAnalyticsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// Network distribution mock 只在 fixture 之间切换，模拟 dashboard 的成功/空/等待/失败状态。
// 它不重新计算真实网络指标，所有 payload 都来自 contract fixture。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function distributionsSuccess(
  data: NetworkDistributionAnalyticsPayload,
): NetworkDistributionAnalyticsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function gapsSuccess(data: NetworkGapAnalysisPayload): NetworkGapAnalysisResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: NetworkDistributionAnalyticsErrorCode,
): NetworkDistributionAnalyticsFailure {
  // dashboard 子分析失败统一带上 mock provenance，方便 API envelope 解释错误来源。
  const definition = NETWORK_DISTRIBUTION_ANALYTICS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockNetworkDistributionAnalyticsFailureProvenance,
      evidenceIds: mockNetworkDistributionAnalyticsFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: NetworkDistributionAnalyticsInput["scenario"],
): NetworkDistributionAnalyticsScenario {
  // 只允许 contract 支持的 scenario；未知值回到默认 success。
  if (
    scenario &&
    supportedScenarios.has(scenario as NetworkDistributionAnalyticsScenario)
  ) {
    return scenario as NetworkDistributionAnalyticsScenario;
  }

  return "success";
}

function distributionsScenarioResult(
  scenario: NetworkDistributionAnalyticsScenario,
): NetworkDistributionAnalyticsResult {
  // distribution 和 gaps 共用 scenario 语义，但返回不同 payload shape。
  switch (scenario) {
    case "empty":
      return distributionsSuccess(mockEmptyNetworkDistributionAnalyticsFixture);
    case "pending":
      return distributionsSuccess(mockPendingNetworkDistributionAnalyticsFixture);
    case "failure":
      return failure("NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED");
    case "success":
    default:
      return distributionsSuccess(mockNetworkDistributionAnalyticsFixture);
  }
}

function gapsScenarioResult(
  scenario: NetworkDistributionAnalyticsScenario,
): NetworkGapAnalysisResult {
  switch (scenario) {
    case "empty":
      return gapsSuccess(mockEmptyNetworkGapAnalysisFixture);
    case "pending":
      return gapsSuccess(mockPendingNetworkGapAnalysisFixture);
    case "failure":
      return failure("NETWORK_DISTRIBUTION_ANALYTICS_MOCK_FAILED");
    case "success":
    default:
      return gapsSuccess(mockNetworkGapAnalysisFixture);
  }
}

export function createMockNetworkDistributionAnalyticsService(): NetworkDistributionAnalyticsService {
  return {
    getDistributions(input = {}): NetworkDistributionAnalyticsResult {
      // 返回网络分布分析 fixture。
      return distributionsScenarioResult(normalizeScenario(input.scenario));
    },

    getNetworkGaps(input = {}): NetworkGapAnalysisResult {
      // 返回网络缺口分析 fixture。
      return gapsScenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  NetworkDistributionAnalyticsResult,
  NetworkDistributionAnalyticsService,
  NetworkGapAnalysisResult,
};
