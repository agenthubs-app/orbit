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
      return distributionsScenarioResult(normalizeScenario(input.scenario));
    },

    getNetworkGaps(input = {}): NetworkGapAnalysisResult {
      return gapsScenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  NetworkDistributionAnalyticsResult,
  NetworkDistributionAnalyticsService,
  NetworkGapAnalysisResult,
};
