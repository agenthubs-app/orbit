import {
  AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS,
  type AgentAutonomyLevel,
  type AgentAutonomySettingsErrorCode,
  type AgentAutonomySettingsFailure,
  type AgentAutonomySettingsInput,
  type AgentAutonomySettingsPayload,
  type AgentAutonomySettingsProvenance,
  type AgentAutonomySettingsResult,
  type AgentAutonomySettingsScenario,
  type AgentAutonomySettingsService,
  type AgentAutonomySettingsUpdateInput,
  type AgentAutonomySettingsUpdatePayload,
  type AgentAutonomySettingsUpdateResult,
} from "./settings-contract";
import {
  mockAgentAutonomyConfirmationRules,
  mockAgentAutonomySettingsFixture,
  mockAgentAutonomySettingsProvenance,
  mockAgentAutonomyLevels,
  mockEmptyAgentAutonomySettingsFixture,
  mockPendingAgentAutonomySettingsFixture,
  mockUpdatedHighAgentAutonomySettingsFixture,
  mockUpdatedLowAgentAutonomySettingsFixture,
  mockUpdatedMediumAgentAutonomySettingsFixture,
} from "./settings-fixtures";

const supportedScenarios = new Set<AgentAutonomySettingsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedLevels = new Set<AgentAutonomyLevel>(["low", "medium", "high"]);
const LIVE_AGENT_AUTONOMY_SETTINGS_SOURCE =
  "live-policy:features/agent/live-settings-service.ts";

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function liveProvenance(
  input: Pick<AgentAutonomySettingsProvenance, "evidenceIds" | "collectedAt"> & {
    generationMethod: AgentAutonomySettingsProvenance["generationMethod"];
    sourceLabel: string;
  },
): AgentAutonomySettingsProvenance {
  return {
    ...mockAgentAutonomySettingsProvenance,
    source: LIVE_AGENT_AUTONOMY_SETTINGS_SOURCE,
    sourceLabel: input.sourceLabel,
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "live-agent-autonomy-settings-policy",
    generationMethod: input.generationMethod,
  };
}

function payloadWithLiveProvenance(
  payload: AgentAutonomySettingsPayload,
  sourceLabel: string,
): AgentAutonomySettingsPayload {
  const cloned = clonePayload(payload);

  return {
    ...cloned,
    summary: cloned.summary.replace(/^Mock/, "Live policy"),
    provenance: liveProvenance({
      collectedAt: cloned.provenance.collectedAt,
      evidenceIds: cloned.provenance.evidenceIds,
      generationMethod: "live-policy",
      sourceLabel,
    }),
  };
}

function updateWithLiveProvenance(
  payload: AgentAutonomySettingsUpdatePayload,
  actorLabel?: string | null,
): AgentAutonomySettingsUpdatePayload {
  const cloned = clonePayload(payload);

  return {
    ...cloned,
    actorLabel: actorLabel?.trim() || cloned.actorLabel,
    confirmationRules: mockAgentAutonomyConfirmationRules.filter(
      (rule) => rule.level === cloned.requestedLevel,
    ),
    provenance: liveProvenance({
      collectedAt: cloned.provenance.collectedAt,
      evidenceIds: cloned.provenance.evidenceIds,
      generationMethod: "live-policy-update",
      sourceLabel: "Live agent autonomy settings policy update",
    }),
  };
}

function failure(
  code: AgentAutonomySettingsErrorCode,
): AgentAutonomySettingsFailure {
  const definition = AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS[code];
  const provenance = liveProvenance({
    collectedAt: mockAgentAutonomySettingsProvenance.collectedAt,
    evidenceIds: ["evidence:agent-autonomy:live-policy-failure"],
    generationMethod: "live-policy",
    sourceLabel: "Live agent autonomy settings policy failure",
  });

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
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

export function createLiveAgentAutonomySettingsService(): AgentAutonomySettingsService {
  return {
    getSettings(input = {}): AgentAutonomySettingsResult {
      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return {
            success: true,
            data: payloadWithLiveProvenance(
              mockEmptyAgentAutonomySettingsFixture,
              "Live empty agent autonomy policy",
            ),
          };
        case "pending":
          return {
            success: true,
            data: payloadWithLiveProvenance(
              mockPendingAgentAutonomySettingsFixture,
              "Live pending agent autonomy policy",
            ),
          };
        case "failure":
          return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
        case "success":
        default:
          return {
            success: true,
            data: {
              ...payloadWithLiveProvenance(
                mockAgentAutonomySettingsFixture,
                "Live agent autonomy safety policy",
              ),
              levels: mockAgentAutonomyLevels,
            },
          };
      }
    },

    updateSettings(input): AgentAutonomySettingsUpdateResult {
      if (normalizeScenario(input.scenario) === "failure") {
        return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
      }

      if (!isAutonomyLevel(input.requestedLevel)) {
        return failure("AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL");
      }

      return {
        success: true,
        data: updateWithLiveProvenance(
          updateFixtureForLevel(input.requestedLevel),
          input.actorLabel,
        ),
      };
    },
  };
}
