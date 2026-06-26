import {
  APP_BOOTSTRAP_ERROR_DEFINITIONS,
  mockAppBootstrapFailureProvenance,
  mockAppBootstrapFixture,
  mockEmptyAppBootstrapFixture,
  mockPendingAppBootstrapFixture,
  type AppBootstrapErrorCode,
  type AppBootstrapFailure,
  type AppBootstrapInput,
  type AppBootstrapPayload,
  type AppBootstrapResult,
  type AppBootstrapScenario,
} from "./contract";
import type { AppBootstrapService } from "./service";

const supportedScenarios = new Set<AppBootstrapScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: AppBootstrapPayload): AppBootstrapResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(code: AppBootstrapErrorCode): AppBootstrapFailure {
  const definition = APP_BOOTSTRAP_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAppBootstrapFailureProvenance,
      evidenceIds: mockAppBootstrapFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: AppBootstrapInput["scenario"],
): AppBootstrapScenario {
  if (scenario && supportedScenarios.has(scenario as AppBootstrapScenario)) {
    return scenario as AppBootstrapScenario;
  }

  return "success";
}

function normalizedTaskLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function scenarioResult(
  scenario: AppBootstrapScenario,
): AppBootstrapResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyAppBootstrapFixture);
    case "pending":
      return success(mockPendingAppBootstrapFixture);
    case "failure":
      return failure("APP_BOOTSTRAP_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function applyTaskLimit(
  payload: AppBootstrapPayload,
  taskLimit?: number | null,
): AppBootstrapPayload {
  const limit = normalizedTaskLimit(taskLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    pendingTasks: payload.pendingTasks.slice(0, limit),
    provenance: {
      ...payload.provenance,
      sourceLabel: "Mock app bootstrap task limit rule",
      generationMethod: "rule-based-task-limit",
    },
  };
}

export function createMockAppBootstrapService(): AppBootstrapService {
  return {
    getAppBootstrap(input = {}): AppBootstrapResult {
      const result = scenarioResult(normalizeScenario(input.scenario));

      if (result) {
        return result;
      }

      return success(applyTaskLimit(mockAppBootstrapFixture, input.taskLimit));
    },
  };
}

export type {
  AppBootstrapResult,
  AppBootstrapService,
};
