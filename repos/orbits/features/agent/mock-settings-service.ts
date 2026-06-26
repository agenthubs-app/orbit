import {
  AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS,
  type AgentAutonomyLevel,
  type AgentAutonomySettingsErrorCode,
  type AgentAutonomySettingsFailure,
  type AgentAutonomySettingsInput,
  type AgentAutonomySettingsPayload,
  type AgentAutonomySettingsResult,
  type AgentAutonomySettingsScenario,
  type AgentAutonomySettingsService,
  type AgentAutonomySettingsUpdateInput,
  type AgentAutonomySettingsUpdatePayload,
  type AgentAutonomySettingsUpdateResult,
  mockAgentAutonomySettingsFailureProvenance,
  mockAgentAutonomySettingsFixture,
  mockEmptyAgentAutonomySettingsFixture,
  mockPendingAgentAutonomySettingsFixture,
  mockUpdatedHighAgentAutonomySettingsFixture,
  mockUpdatedLowAgentAutonomySettingsFixture,
  mockUpdatedMediumAgentAutonomySettingsFixture,
} from "./settings-contract";

const supportedScenarios = new Set<AgentAutonomySettingsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedLevels = new Set<AgentAutonomyLevel>([
  "low",
  "medium",
  "high",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function settingsSuccess(
  data: AgentAutonomySettingsPayload,
): AgentAutonomySettingsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function updateSuccess(
  data: AgentAutonomySettingsUpdatePayload,
): AgentAutonomySettingsUpdateResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: AgentAutonomySettingsErrorCode,
): AgentAutonomySettingsFailure {
  const definition = AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAgentAutonomySettingsFailureProvenance,
      evidenceIds: mockAgentAutonomySettingsFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | AgentAutonomySettingsInput["scenario"]
    | AgentAutonomySettingsUpdateInput["scenario"],
): AgentAutonomySettingsScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as AgentAutonomySettingsScenario)
  ) {
    return scenario as AgentAutonomySettingsScenario;
  }

  return "success";
}

function isAutonomyLevel(value: unknown): value is AgentAutonomyLevel {
  return (
    typeof value === "string" &&
    supportedLevels.has(value as AgentAutonomyLevel)
  );
}

function getSettingsResult(
  input: AgentAutonomySettingsInput,
): AgentAutonomySettingsResult {
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return settingsSuccess(mockEmptyAgentAutonomySettingsFixture);
    case "pending":
      return settingsSuccess(mockPendingAgentAutonomySettingsFixture);
    case "failure":
      return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
    case "success":
    default:
      return settingsSuccess(mockAgentAutonomySettingsFixture);
  }
}

function updateFixtureForLevel(
  level: AgentAutonomyLevel,
): AgentAutonomySettingsUpdatePayload {
  switch (level) {
    case "low":
      return mockUpdatedLowAgentAutonomySettingsFixture;
    case "high":
      return mockUpdatedHighAgentAutonomySettingsFixture;
    case "medium":
    default:
      return mockUpdatedMediumAgentAutonomySettingsFixture;
  }
}

function updateSettingsResult(
  input: AgentAutonomySettingsUpdateInput,
): AgentAutonomySettingsUpdateResult {
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
  }

  if (!isAutonomyLevel(input.requestedLevel)) {
    return failure("AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL");
  }

  const base = updateFixtureForLevel(input.requestedLevel);

  return updateSuccess({
    ...base,
    actorLabel: input.actorLabel?.trim() || base.actorLabel,
  });
}

export function createMockAgentAutonomySettingsService(): AgentAutonomySettingsService {
  return {
    getSettings(input = {}): AgentAutonomySettingsResult {
      return getSettingsResult(input);
    },

    updateSettings(input): AgentAutonomySettingsUpdateResult {
      return updateSettingsResult(input);
    },
  };
}

export type {
  AgentAutonomySettingsInput,
  AgentAutonomySettingsResult,
  AgentAutonomySettingsService,
  AgentAutonomySettingsUpdateInput,
  AgentAutonomySettingsUpdateResult,
};
