/**
 * Capability debug dashboard 的 mock service。
 *
 * service 根据 scenario 返回 success/empty/pending/failure fixture，
 * 用来测试开发者面板的所有状态，不触达任何生产工具。
 */
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
  // 返回 clone 防止 UI 或测试修改共享 fixture。
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
  // 只接受 contract 中声明过的 scenario，未知输入默认回到 success。
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
  // dashboard 的所有状态都由 fixture 决定；failure 是受控错误 envelope。
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
  // 对外只暴露读取 dashboard 的方法，保持 dev 面板服务边界很窄。
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
