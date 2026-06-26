import type { ApiErrorContext } from "../api/envelope";
import type { FeatureMode } from "../config/feature-mode";
import { AppError, type AppErrorCode } from "../errors/app-error";
import { cloneMockState } from "./state-store";
import {
  DEFAULT_MOCK_SCENARIO_ID,
  MOCK_DATA_SCENARIO_SERVICE,
  MOCK_SCENARIO_FIXTURE_SOURCE,
  type MockScenarioFixture,
  type MockScenarioId,
  getMockScenarioFixture,
} from "./scenarios";

export const MOCK_RESET_FIXTURE_SOURCE = "fixture:shared/mock/reset.ts";

export const MOCK_RESET_ERROR_CODES = [
  "MOCK_RESET_SCENARIO_NOT_FOUND",
  "MOCK_RESET_CONTROLLED_FAILURE",
] as const;

export type MockResetErrorCode = (typeof MOCK_RESET_ERROR_CODES)[number];

export const MOCK_RESET_ERROR_DEFINITIONS: Record<
  MockResetErrorCode,
  {
    appCode: AppErrorCode;
    message: string;
    recovery: string;
  }
> = {
  MOCK_RESET_SCENARIO_NOT_FOUND: {
    appCode: "NOT_FOUND",
    message: "The requested mock reset scenario is not registered.",
    recovery:
      "Reset without a scenario id or choose a scenario returned by GET /api/mock/scenarios.",
  },
  MOCK_RESET_CONTROLLED_FAILURE: {
    appCode: "SERVICE_UNAVAILABLE",
    message: "The mock data reset is pinned to a controlled failure scenario.",
    recovery:
      "Choose a non-error scenario before requesting a mock data reset.",
  },
};

export interface MockResetInput {
  scenarioId?: string | null;
}

export interface MockResetProvenance {
  source: typeof MOCK_RESET_FIXTURE_SOURCE;
  scenarioSource: typeof MOCK_SCENARIO_FIXTURE_SOURCE;
  generationMethod: "rule-based-reset";
  evidenceIds: readonly string[];
  productionSeedManagementReplaced: true;
  persistentUserScenarioStorageReplaced: true;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

export interface MockResetSummary {
  type: "mock-data-reset";
  seedManagement: "deterministic-fixture-restore";
  persistentStorage: "no-persistent-user-scenario-storage";
  externalServicesTouched: false;
}

export interface MockResetPayload {
  activeScenarioId: MockScenarioId;
  selectedScenario: MockScenarioFixture;
  reset: MockResetSummary;
  provenance: MockResetProvenance;
}

export interface MockResetFailure {
  success: false;
  error: {
    code: MockResetErrorCode;
    appCode: AppErrorCode;
    message: string;
    recovery: string;
    provenance: MockResetProvenance;
  };
}

export type MockResetResult =
  | {
      success: true;
      data: MockResetPayload;
    }
  | MockResetFailure;

export interface MockDataResetService {
  resetMockData: (input?: MockResetInput) => MockResetResult;
}

function createResetProvenance(evidenceIds: readonly string[]): MockResetProvenance {
  return {
    source: MOCK_RESET_FIXTURE_SOURCE,
    scenarioSource: MOCK_SCENARIO_FIXTURE_SOURCE,
    generationMethod: "rule-based-reset",
    evidenceIds,
    productionSeedManagementReplaced: true,
    persistentUserScenarioStorageReplaced: true,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function success(data: MockResetPayload): MockResetResult {
  return {
    success: true,
    data: cloneMockState(data),
  };
}

function failure(code: MockResetErrorCode): MockResetFailure {
  const definition = MOCK_RESET_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      code,
      appCode: definition.appCode,
      message: definition.message,
      recovery: definition.recovery,
      provenance: createResetProvenance(["evidence_mock_reset_failure"]),
    },
  };
}

export function mockResetFailureToAppError(result: MockResetFailure): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function mockResetFailureContext(
  result: MockResetFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: "developer-admin",
    mode,
    mockResetErrorCode: result.error.code,
    privacy: "no-relationship-data",
    provenance: "Mock reset failure came from deterministic fixture rules.",
    service: MOCK_DATA_SCENARIO_SERVICE,
  };
}

function requestedScenarioId(input?: MockResetInput): string {
  return input?.scenarioId?.trim() || DEFAULT_MOCK_SCENARIO_ID;
}

export function createMockDataResetService(): MockDataResetService {
  return {
    resetMockData(input = {}) {
      const scenario = getMockScenarioFixture(requestedScenarioId(input));

      if (!scenario) {
        return failure("MOCK_RESET_SCENARIO_NOT_FOUND");
      }

      if (scenario.state === "failure") {
        return failure("MOCK_RESET_CONTROLLED_FAILURE");
      }

      return success({
        activeScenarioId: scenario.id,
        selectedScenario: {
          ...scenario,
          selected: true,
        },
        reset: {
          type: "mock-data-reset",
          seedManagement: "deterministic-fixture-restore",
          persistentStorage: "no-persistent-user-scenario-storage",
          externalServicesTouched: false,
        },
        provenance: createResetProvenance(["evidence_mock_reset_restore"]),
      });
    },
  };
}
