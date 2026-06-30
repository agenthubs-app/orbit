import {
  AGENT_ACTION_QUEUE_ERROR_DEFINITIONS,
  type AgentActionDecision,
  type AgentActionDecisionInput,
  type AgentActionDecisionPayload,
  type AgentActionDecisionResult,
  type AgentActionQueueErrorCode,
  type AgentActionQueueFailure,
  type AgentActionQueueItem,
  type AgentActionQueueListInput,
  type AgentActionQueuePayload,
  type AgentActionQueueProvenance,
  type AgentActionQueueResult,
  type AgentActionQueueScenario,
  type AgentActionSourceReference,
  type AgentActionType,
} from "../contract";
import type {
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
} from "../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { MockRuntimeFixtures } from "../../../shared/mock/fixtures";
import type { AgentActionQueueService } from "../service";

interface LocalRemoteAgentActionGraph {
  actions: readonly AgentActionDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  generatedAt: string;
}

interface AgentActionLocalRemoteRepository {
  readAgentActionGraph: () => LocalRemoteAgentActionGraph;
  updateDecision: (
    actionId: string,
    decision: AgentActionDecision,
  ) => LocalRemoteAgentActionGraph;
}

interface HybridAgentActionQueueServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: AgentActionLocalRemoteRepository;
}

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

function localRemoteSource(): string {
  return `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`;
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

function actionTypeFor(action: AgentActionDTO): AgentActionType {
  switch (action.type) {
    case "schedule_reminder":
      return "event_reminder";
    case "prepare_intro":
      return "post_event_followup";
    case "summarize_context":
      return "dormant_activation";
    case "draft_message":
    default:
      return "message_draft_suggestion";
  }
}

function sourceForAction(action: AgentActionDTO): AgentActionSourceReference {
  const supportedTypes = new Set<AgentActionSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "chat_summary",
    "agent_action",
    "system",
  ]);
  const type = supportedTypes.has(
    action.source.type as AgentActionSourceReference["type"],
  )
    ? (action.source.type as AgentActionSourceReference["type"])
    : "system";

  return {
    type,
    id: action.source.id,
    label: action.source.label ?? "Hybrid local remote agent action source",
    providerRecordId: action.source.id,
    generatedBy: "mock-agent-action-rules",
  };
}

function evidenceOverlaps(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const rightIds = new Set(right);

  return left.some((id) => rightIds.has(id));
}

function contactForAction(
  action: AgentActionDTO,
  graph: LocalRemoteAgentActionGraph,
): ContactDTO | null {
  const matchedContact = graph.contacts.find((contact) =>
    evidenceOverlaps(action.evidenceIds, contact.evidenceIds),
  );

  if (matchedContact) {
    return matchedContact;
  }

  const matchedConnection = graph.connections.find((connection) =>
    evidenceOverlaps(action.evidenceIds, connection.evidenceIds),
  );

  return (
    graph.contacts.find((contact) => contact.id === matchedConnection?.contactId) ??
    null
  );
}

function priorityFor(action: AgentActionDTO) {
  if (action.status === "awaiting_confirmation") {
    return "high" as const;
  }

  if (action.status === "queued") {
    return "medium" as const;
  }

  return "low" as const;
}

function provenanceFor(input: {
  actions: readonly AgentActionDTO[];
  collectedAt: string;
  sourceLabel: string;
}): AgentActionQueueProvenance {
  const evidenceIds = input.actions.flatMap((action) => action.evidenceIds);

  return {
    source: localRemoteSource(),
    sourceLabel: input.sourceLabel,
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : ["evidence:agent-action-local-remote-empty"],
    collectedAt: input.collectedAt,
    privacy: "demo-agent-action-queue-only",
    generationMethod: "local-remote-store-query",
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function titleFor(action: AgentActionDTO): string {
  switch (action.type) {
    case "schedule_reminder":
      return "Review local reminder suggestion";
    case "prepare_intro":
      return "Review local introduction suggestion";
    case "summarize_context":
      return "Review local relationship summary";
    case "draft_message":
    default:
      return "Review local message draft suggestion";
  }
}

function toQueueItem(
  action: AgentActionDTO,
  graph: LocalRemoteAgentActionGraph,
): AgentActionQueueItem {
  const contact = contactForAction(action, graph);
  const provenance = provenanceFor({
    actions: [action],
    collectedAt: graph.generatedAt,
    sourceLabel: "Hybrid local remote agent action",
  });

  return {
    actionId: action.id,
    actionType: actionTypeFor(action),
    title: titleFor(action),
    contactName: contact?.displayName ?? "Hybrid local remote contact",
    organization: contact?.organization ?? "",
    priority: priorityFor(action),
    recommendedAction:
      action.source.label ?? "Review this source-backed local agent action.",
    reason:
      "This agent action was loaded from the hybrid local remote database.",
    dueLabel: "Review before external execution",
    confirmationRequired: action.confirmationRequired,
    sourceRefs: [sourceForAction(action)],
    evidenceIds: action.evidenceIds,
    provenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function filteredActions(
  actions: readonly AgentActionQueueItem[],
  input: AgentActionQueueListInput,
): readonly AgentActionQueueItem[] {
  if (!supportedActionTypes.has(input.actionType as AgentActionType)) {
    return actions;
  }

  return actions.filter((action) => action.actionType === input.actionType);
}

function payloadFor(
  graph: LocalRemoteAgentActionGraph,
  input: AgentActionQueueListInput = {},
): AgentActionQueuePayload {
  const actions = filteredActions(
    graph.actions.map((action) => toQueueItem(action, graph)),
    input,
  );

  return {
    state: actions.length > 0 ? "success" : "empty",
    actions,
    summary:
      actions.length > 0
        ? `${actions.length} agent actions were loaded from the hybrid local remote database.`
        : "No agent actions matched the hybrid local remote database query.",
    provenance: provenanceFor({
      actions: graph.actions,
      collectedAt: graph.generatedAt,
      sourceLabel: "Hybrid local remote agent action queue",
    }),
    nextAction:
      actions.length > 0
        ? "Review action evidence before approving any external side effect."
        : "Add agent actions to the local remote database before queue testing.",
  };
}

function queueSuccess(data: AgentActionQueuePayload): AgentActionQueueResult {
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

function failure(
  code: AgentActionQueueErrorCode,
  graph: LocalRemoteAgentActionGraph,
): AgentActionQueueFailure {
  const definition = AGENT_ACTION_QUEUE_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    actions: [],
    collectedAt: graph.generatedAt,
    sourceLabel: "Hybrid local remote agent action queue failure",
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

function scenarioResult(
  graph: LocalRemoteAgentActionGraph,
  scenario: AgentActionQueueScenario,
): AgentActionQueueResult | null {
  switch (scenario) {
    case "empty":
      return queueSuccess({
        ...payloadFor(graph),
        actions: [],
        state: "empty",
        summary: "The hybrid local remote agent action queue returned no rows.",
      });
    case "pending":
      return queueSuccess({
        ...payloadFor(graph),
        actions: [],
        state: "pending",
        summary:
          "The hybrid local remote agent action queue is waiting for seed review.",
      });
    case "failure":
      return failure("AGENT_ACTION_QUEUE_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function decisionPayload(
  graph: LocalRemoteAgentActionGraph,
  action: AgentActionDTO,
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionPayload {
  const item = toQueueItem(action, graph);

  return {
    state: "success",
    actionId: action.id,
    actionTitle: item.title,
    decision,
    actorLabel: input.actorLabel?.trim() || "Hybrid local operator",
    decidedAt: graph.generatedAt,
    confirmationRequired: action.confirmationRequired,
    externalSideEffectExecuted: false,
    autonomousExecutionStarted: false,
    evidenceIds: action.evidenceIds,
    provenance: provenanceFor({
      actions: [action],
      collectedAt: graph.generatedAt,
      sourceLabel: "Hybrid local remote agent action decision",
    }),
    nextAction:
      "Keep the decision in the local remote database until a live execution provider is explicitly connected.",
  };
}

function createAgentActionLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): AgentActionLocalRemoteRepository {
  function graphFromState(state: MockRuntimeFixtures): LocalRemoteAgentActionGraph {
    return {
      actions: state.agentActions,
      connections: state.connections,
      contacts: state.contacts,
      generatedAt: state.generatedAt,
    };
  }

  return {
    readAgentActionGraph() {
      return graphFromState(database.getState());
    },
    updateDecision(actionId, decision) {
      return graphFromState(
        database.updateState((draft) => {
          draft.agentActions = draft.agentActions.map((action) =>
            action.id === actionId
              ? {
                  ...action,
                  status: decision === "accepted" ? "approved" : "rejected",
                  updatedAt: draft.generatedAt,
                }
              : action,
          );
        }),
      );
    },
  };
}

export function createHybridAgentActionQueueService(
  options: HybridAgentActionQueueServiceOptions = {},
): AgentActionQueueService {
  const repository =
    options.repository ?? createAgentActionLocalRemoteRepository(options.database);

  return {
    listActions(input = {}): AgentActionQueueResult {
      const graph = repository.readAgentActionGraph();
      const scenario = scenarioResult(graph, normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return queueSuccess(payloadFor(graph, input));
    },

    acceptAction(input): AgentActionDecisionResult {
      return decisionResult(repository, "accepted", input);
    },

    dismissAction(input): AgentActionDecisionResult {
      return decisionResult(repository, "dismissed", input);
    },
  };
}

function decisionResult(
  repository: AgentActionLocalRemoteRepository,
  decision: AgentActionDecision,
  input: AgentActionDecisionInput,
): AgentActionDecisionResult {
  const graph = repository.readAgentActionGraph();

  if (normalizeScenario(input.scenario) === "failure") {
    return failure("AGENT_ACTION_QUEUE_MOCK_FAILED", graph);
  }

  const actionId = input.actionId?.trim() ?? "";

  if (!actionId) {
    return failure("AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED", graph);
  }

  const action = graph.actions.find((item) => item.id === actionId);

  if (!action) {
    return failure("AGENT_ACTION_QUEUE_ACTION_NOT_FOUND", graph);
  }

  const nextGraph = repository.updateDecision(actionId, decision);
  const nextAction =
    nextGraph.actions.find((item) => item.id === actionId) ?? action;

  return decisionSuccess(decisionPayload(nextGraph, nextAction, decision, input));
}
