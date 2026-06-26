import {
  CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS,
  type CapabilityDebugDashboardErrorCode,
} from "./error-codes";
import {
  capabilityDebugDashboardEmptyFixture,
  capabilityDebugDashboardFailureProvenance,
  capabilityDebugDashboardFixture,
  capabilityDebugDashboardPendingFixture,
} from "./fixtures";
import type {
  CapabilityDebugDashboardPayload,
  CapabilityDebugDashboardScenario,
} from "./contract";
import type {
  CapabilityDebugDashboardFailure,
  CapabilityDebugDashboardInput,
  CapabilityDebugDashboardResult,
  CapabilityDebugDashboardService,
} from "./service";

const supportedScenarios = new Set<CapabilityDebugDashboardScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  data: CapabilityDebugDashboardPayload,
): CapabilityDebugDashboardResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: CapabilityDebugDashboardErrorCode,
): CapabilityDebugDashboardFailure {
  const definition = CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: capabilityDebugDashboardFailureProvenance,
      evidenceIds: capabilityDebugDashboardFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: CapabilityDebugDashboardInput["scenario"],
): CapabilityDebugDashboardScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as CapabilityDebugDashboardScenario)
  ) {
    return scenario as CapabilityDebugDashboardScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: CapabilityDebugDashboardScenario,
): CapabilityDebugDashboardResult {
  switch (scenario) {
    case "empty":
      return success(capabilityDebugDashboardEmptyFixture);
    case "pending":
      return success(capabilityDebugDashboardPendingFixture);
    case "failure":
      return failure("CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED");
    case "success":
    default:
      return success(capabilityDebugDashboardFixture);
  }
}

export function createMockCapabilityDebugDashboardService(): CapabilityDebugDashboardService {
  return {
    getDashboard(input = {}) {
      return scenarioResult(normalizeScenario(input.scenario));
    },
  };
}

export type {
  CapabilityDebugDashboardResult,
  CapabilityDebugDashboardService,
};
