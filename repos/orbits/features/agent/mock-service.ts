import {
  AGENT_ACTION_QUEUE_ERROR_DEFINITIONS,
  type AgentActionDecision,
  type AgentActionDecisionInput,
  type AgentActionDecisionPayload,
  type AgentActionDecisionResult,
  type AgentActionQueueErrorCode,
  type AgentActionQueueFailure,
  type AgentActionQueueListInput,
  type AgentActionQueuePayload,
  type AgentActionQueueResult,
  type AgentActionQueueScenario,
  type AgentActionType,
} from "./contract";
import {
  mockAcceptedAgentActionFixture,
  mockAgentActionQueueFailureProvenance,
  mockAgentActionQueueFixture,
  mockAgentActions,
  mockDismissedAgentActionFixture,
  mockEmptyAgentActionQueueFixture,
  mockPendingAgentActionQueueFixture,
} from "./fixtures";
import type { AgentActionQueueService } from "./service";

const supportedScenarios = new Set<AgentActionQueueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedActionTypes = new Set<AgentActionType>([
  "event_reminder",
  "post_event_followup",
  "dormant_activation",
  "message_draft_suggestion",
  "appointment_suggestion",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function queueSuccess(
  data: AgentActionQueuePayload,
): AgentActionQueueResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function decisionSuccess(
  data: AgentActionDecisionPayload,
): AgentActionDecisionResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(code: AgentActionQueueErrorCode): AgentActionQueueFailure {
  const definition = AGENT_ACTION_QUEUE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAgentActionQueueFailureProvenance,
      evidenceIds: mockAgentActionQueueFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | AgentActionQueueListInput["scenario"]
    | AgentActionDecisionInput["scenario"],
): AgentActionQueueScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as AgentActionQueueScenario)
  ) {
    return scenario as AgentActionQueueScenario;
  }

  return "success";
}

function isActionType(value: unknown): value is AgentActionType {
  return (
    typeof value === "string" &&
    supportedActionTypes.has(value as AgentActionType)
  );
}

function filteredFixture(input: AgentActionQueueListInput): AgentActionQueuePayload {
  if (!isActionType(input.actionType)) {
    return mockAgentActionQueueFixture;
  }

  const actions = mockAgentActions.filter(
    (action) => action.actionType === input.actionType,
  );

  if (actions.length === 0) {
    return mockEmptyAgentActionQueueFixture;
  }

  return {
    ...mockAgentActionQueueFixture,
    actions,
    summary: `Local agent action rules returned ${input.actionType} suggestions without running autonomous jobs or live providers.`,
  };
}

function listScenarioResult(
  input: AgentActionQueueListInput,
): AgentActionQueueResult {
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return queueSuccess(mockEmptyAgentActionQueueFixture);
    case "pending":
      return queueSuccess(mockPendingAgentActionQueueFixture);
    case "failure":
      return failure("AGENT_ACTION_QUEUE_MOCK_FAILED");
    case "success":
    default:
      return queueSuccess(filteredFixture(input));
  }
}

function actionExists(actionId: string): boolean {
  return mockAgentActions.some((action) => action.actionId === actionId);
}

function decisionPayload(
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionPayload {
  const base =
    decision === "accepted"
      ? mockAcceptedAgentActionFixture
      : mockDismissedAgentActionFixture;

  return {
    ...base,
    actorLabel: input.actorLabel?.trim() || base.actorLabel,
  };
}

function decisionResult(
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionResult {
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("AGENT_ACTION_QUEUE_MOCK_FAILED");
  }

  if (!input.actionId) {
    return failure("AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED");
  }

  if (!actionExists(input.actionId)) {
    return failure("AGENT_ACTION_QUEUE_ACTION_NOT_FOUND");
  }

  return decisionSuccess(decisionPayload(decision, input));
}

export function createMockAgentActionQueueService(): AgentActionQueueService {
  return {
    listActions(input = {}): AgentActionQueueResult {
      return listScenarioResult(input);
    },

    acceptAction(input): AgentActionDecisionResult {
      return decisionResult("accepted", input);
    },

    dismissAction(input): AgentActionDecisionResult {
      return decisionResult("dismissed", input);
    },
  };
}

export type {
  AgentActionDecisionResult,
  AgentActionQueueResult,
  AgentActionQueueService,
};
