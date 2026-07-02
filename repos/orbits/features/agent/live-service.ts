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
} from "./contract";
import type {
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import type { AgentActionQueueService } from "./service";

export interface LiveAgentActionGraph {
  actions: readonly AgentActionDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  matchRecommendations: readonly MatchRecommendationDTO[];
  networkPeople: readonly NetworkPersonDTO[];
}

export interface LiveAgentActionQueueProvider {
  source: string;
  sourceLabel: string;
  readAgentActionGraph: () => LiveAgentActionGraph | Promise<LiveAgentActionGraph>;
  updateAgentActionDecision: (input: {
    actionId: string;
    decidedAt: string;
    decision: AgentActionDecision;
  }) => LiveAgentActionGraph | Promise<LiveAgentActionGraph>;
}

interface LiveAgentActionQueueServiceOptions {
  now?: () => string;
  provider: LiveAgentActionQueueProvider | null;
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
    label: action.source.label ?? "Live generated agent action source",
    providerRecordId: action.source.id,
    generatedBy: "live-store-query",
  };
}

function evidenceOverlaps(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const rightIds = new Set(right);

  return left.some((id) => rightIds.has(id));
}

function evidenceForAction(
  action: AgentActionDTO,
  graph: LiveAgentActionGraph,
): RelationshipEvidenceDTO | null {
  return (
    graph.evidence.find((evidence) => action.evidenceIds.includes(evidence.id)) ??
    null
  );
}

function recommendationIdFromEvidence(
  evidence: RelationshipEvidenceDTO | null,
): string | null {
  return evidence?.summary.match(/recommendation_\d+/)?.[0] ?? null;
}

function recommendationForAction(
  action: AgentActionDTO,
  graph: LiveAgentActionGraph,
): MatchRecommendationDTO | null {
  const recommendationId = recommendationIdFromEvidence(
    evidenceForAction(action, graph),
  );

  if (recommendationId) {
    const matchedRecommendation = graph.matchRecommendations.find(
      (recommendation) => recommendation.id === recommendationId,
    );

    if (matchedRecommendation) {
      return matchedRecommendation;
    }
  }

  return (
    graph.matchRecommendations.find((recommendation) =>
      evidenceOverlaps(recommendation.evidenceIds, action.evidenceIds),
    ) ?? null
  );
}

function contactForRecommendation(
  recommendation: MatchRecommendationDTO | null,
  graph: LiveAgentActionGraph,
): ContactDTO | NetworkPersonDTO | null {
  if (!recommendation) {
    return null;
  }

  if (recommendation.contactId) {
    const contact = graph.contacts.find(
      (item) => item.id === recommendation.contactId,
    );

    if (contact) {
      return contact;
    }
  }

  if (recommendation.connectionId) {
    const connection = graph.connections.find(
      (item) => item.id === recommendation.connectionId,
    );
    const contact = graph.contacts.find(
      (item) => item.id === connection?.contactId,
    );

    if (contact) {
      return contact;
    }
  }

  if (recommendation.targetPersonId) {
    return (
      graph.contacts.find(
        (item) => item.personId === recommendation.targetPersonId,
      ) ??
      graph.networkPeople.find(
        (item) => item.id === recommendation.targetPersonId,
      ) ??
      null
    );
  }

  return null;
}

function contactForAction(
  action: AgentActionDTO,
  graph: LiveAgentActionGraph,
): ContactDTO | NetworkPersonDTO | null {
  const matchedRecommendation = recommendationForAction(action, graph);
  const recommendationContact = contactForRecommendation(
    matchedRecommendation,
    graph,
  );

  if (recommendationContact) {
    return recommendationContact;
  }

  const contact = graph.contacts.find((item) =>
    evidenceOverlaps(item.evidenceIds, action.evidenceIds),
  );

  if (contact) {
    return contact;
  }

  const connection = graph.connections.find((item) =>
    evidenceOverlaps(item.evidenceIds, action.evidenceIds),
  );

  return (
    graph.contacts.find((item) => item.id === connection?.contactId) ?? null
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
  generationMethod?: AgentActionQueueProvenance["generationMethod"];
  provider: LiveAgentActionQueueProvider | null;
  sourceLabel?: string;
  writeExecuted?: boolean;
}): AgentActionQueueProvenance {
  const evidenceIds = input.actions.flatMap((action) => action.evidenceIds);

  return {
    source: input.provider?.source ?? "live-record-store:agent-action-queue:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Agent action queue live storage is not configured",
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : ["evidence:agent-action-queue-live-empty"],
    collectedAt: input.collectedAt,
    privacy: "live-agent-action-queue-preview",
    generationMethod: input.generationMethod ?? "live-store-query",
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: input.provider !== null,
    liveDatabaseWriteExecuted: input.writeExecuted ?? false,
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
      return "Review live event reminder";
    case "prepare_intro":
      return "Review live introduction follow-up";
    case "summarize_context":
      return "Review live dormant relationship context";
    case "draft_message":
    default:
      return "Review live message draft suggestion";
  }
}

function dueLabelFor(action: AgentActionDTO): string {
  if (action.status === "awaiting_confirmation") {
    return "Awaiting confirmation";
  }

  if (action.status === "queued") {
    return "Queued for review";
  }

  return "Already reviewed";
}

function recommendedActionFor(
  action: AgentActionDTO,
  recommendation: MatchRecommendationDTO | null,
): string {
  return (
    recommendation?.suggestedActions[0] ??
    action.source.label ??
    "Review this source-backed live agent action before any external execution."
  );
}

function reasonFor(
  action: AgentActionDTO,
  recommendation: MatchRecommendationDTO | null,
  graph: LiveAgentActionGraph,
): string {
  return (
    recommendation?.reason ??
    evidenceForAction(action, graph)?.summary ??
    "This agent action was loaded from shared live storage."
  );
}

function toQueueItem(
  action: AgentActionDTO,
  graph: LiveAgentActionGraph,
  provider: LiveAgentActionQueueProvider,
): AgentActionQueueItem {
  const recommendation = recommendationForAction(action, graph);
  const contact = contactForAction(action, graph);
  const provenance = provenanceFor({
    actions: [action],
    collectedAt: graph.generatedAt,
    provider,
    sourceLabel: "Live agent action queue item",
  });

  return {
    actionId: action.id,
    actionType: actionTypeFor(action),
    title: titleFor(action),
    contactName: contact?.displayName ?? "Live generated relationship context",
    organization: contact?.organization ?? "",
    priority: priorityFor(action),
    recommendedAction: recommendedActionFor(action, recommendation),
    reason: reasonFor(action, recommendation, graph),
    dueLabel: dueLabelFor(action),
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
  graph: LiveAgentActionGraph,
  provider: LiveAgentActionQueueProvider,
  input: AgentActionQueueListInput = {},
): AgentActionQueuePayload {
  const sortedActions = [...graph.actions].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const actions = filteredActions(
    sortedActions.map((action) => toQueueItem(action, graph, provider)),
    input,
  );

  return {
    state: actions.length > 0 ? "success" : "empty",
    actions,
    summary:
      actions.length > 0
        ? `${actions.length} agent actions were loaded from shared live storage.`
        : "No agent actions matched the shared live storage query.",
    provenance: provenanceFor({
      actions: graph.actions,
      collectedAt: graph.generatedAt,
      provider,
      sourceLabel: "Live agent action queue",
    }),
    nextAction:
      actions.length > 0
        ? "Review action evidence before approving any external side effect."
        : "Seed agent actions into live storage before queue testing.",
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
  input: {
    graph?: LiveAgentActionGraph | null;
    provider: LiveAgentActionQueueProvider | null;
    sourceLabel?: string;
  },
): AgentActionQueueFailure {
  const definition = AGENT_ACTION_QUEUE_ERROR_DEFINITIONS[code];
  const collectedAt = input.graph?.generatedAt ?? new Date(0).toISOString();
  const provenance = provenanceFor({
    actions: [],
    collectedAt,
    provider: input.provider,
    sourceLabel: input.sourceLabel ?? "Live agent action queue failure",
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
  graph: LiveAgentActionGraph,
  provider: LiveAgentActionQueueProvider,
  scenario: AgentActionQueueScenario,
): AgentActionQueueResult | null {
  switch (scenario) {
    case "empty":
      return queueSuccess({
        ...payloadFor(graph, provider),
        actions: [],
        state: "empty",
        summary: "The live agent action queue returned no rows.",
      });
    case "pending":
      return queueSuccess({
        ...payloadFor(graph, provider),
        actions: [],
        state: "pending",
        summary:
          "The live agent action queue is waiting for source review.",
      });
    case "failure":
      return failure("AGENT_ACTION_QUEUE_MOCK_FAILED", {
        graph,
        provider,
        sourceLabel: "Live agent action queue controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

function decisionPayload(
  input: {
    action: AgentActionDTO;
    actorLabel?: string | null;
    decision: AgentActionDecision;
    graph: LiveAgentActionGraph;
    provider: LiveAgentActionQueueProvider;
  },
): AgentActionDecisionPayload {
  const item = toQueueItem(input.action, input.graph, input.provider);

  return {
    state: "success",
    actionId: input.action.id,
    actionTitle: item.title,
    decision: input.decision,
    actorLabel: input.actorLabel?.trim() || "Live operator",
    decidedAt: input.action.updatedAt,
    confirmationRequired: input.action.confirmationRequired,
    externalSideEffectExecuted: false,
    autonomousExecutionStarted: false,
    evidenceIds: input.action.evidenceIds,
    provenance: provenanceFor({
      actions: [input.action],
      collectedAt: input.graph.generatedAt,
      generationMethod: "live-store-decision",
      provider: input.provider,
      sourceLabel: "Live agent action queue decision",
      writeExecuted: true,
    }),
    nextAction:
      "Keep this decision staged in live storage until a separate confirmed execution provider is connected.",
  };
}

function findAction(
  graph: LiveAgentActionGraph,
  actionId: string,
): AgentActionDTO | null {
  return graph.actions.find((action) => action.id === actionId) ?? null;
}

async function decisionResult(
  input: {
    decision: AgentActionDecision;
    provider: LiveAgentActionQueueProvider | null;
    request: AgentActionDecisionInput;
    now: () => string;
  },
): Promise<AgentActionDecisionResult> {
  if (!input.provider) {
    return failure("AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED", {
      provider: input.provider,
      sourceLabel: "Live agent action queue store is not configured",
    });
  }

  const graph = await input.provider.readAgentActionGraph();

  if (normalizeScenario(input.request.scenario) === "failure") {
    return failure("AGENT_ACTION_QUEUE_MOCK_FAILED", {
      graph,
      provider: input.provider,
      sourceLabel: "Live agent action queue controlled failure",
    });
  }

  const actionId = input.request.actionId?.trim() ?? "";

  if (!actionId) {
    return failure("AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED", {
      graph,
      provider: input.provider,
    });
  }

  const action = findAction(graph, actionId);

  if (!action) {
    return failure("AGENT_ACTION_QUEUE_ACTION_NOT_FOUND", {
      graph,
      provider: input.provider,
    });
  }

  const nextGraph = await input.provider.updateAgentActionDecision({
    actionId,
    decidedAt: input.now(),
    decision: input.decision,
  });
  const nextAction = findAction(nextGraph, actionId) ?? {
    ...action,
    status: input.decision === "accepted" ? "approved" : "rejected",
    updatedAt: input.now(),
  };

  return decisionSuccess(
    decisionPayload({
      action: nextAction,
      actorLabel: input.request.actorLabel,
      decision: input.decision,
      graph: nextGraph,
      provider: input.provider,
    }),
  );
}

export function createLiveAgentActionQueueService({
  now = () => new Date().toISOString(),
  provider,
}: LiveAgentActionQueueServiceOptions): AgentActionQueueService {
  return {
    async listActions(input = {}): Promise<AgentActionQueueResult> {
      if (!provider) {
        return failure("AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED", {
          provider,
          sourceLabel: "Live agent action queue store is not configured",
        });
      }

      const graph = await provider.readAgentActionGraph();
      const scenario = scenarioResult(
        graph,
        provider,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return queueSuccess(payloadFor(graph, provider, input));
    },

    acceptAction(input): Promise<AgentActionDecisionResult> {
      return decisionResult({
        decision: "accepted",
        now,
        provider,
        request: input,
      });
    },

    dismissAction(input): Promise<AgentActionDecisionResult> {
      return decisionResult({
        decision: "dismissed",
        now,
        provider,
        request: input,
      });
    },
  };
}
