import {
  FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS,
  type FollowupTask,
  type FollowupTaskGenerationErrorCode,
  type FollowupTaskGenerationFailure,
  type FollowupTaskGenerationGenerateInput,
  type FollowupTaskGenerationListInput,
  type FollowupTaskGenerationPayload,
  type FollowupTaskGenerationProvenance,
  type FollowupTaskGenerationResult,
  type FollowupTaskGenerationScenario,
  type FollowupTaskGenerationSourceReference,
  type FollowupTaskTrigger,
} from "../contract";
import {
  filterFollowupTasks,
  followupConnectionForTask,
  followupContactForTask,
  followupDaysUntil,
  followupPriorityFor,
  followupTriggerKindFor,
  normalizeFollowupTaskGenerationScenario,
} from "../task-generation-projection";
import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { FollowupTaskGenerationService } from "../service";

interface LocalRemoteFollowupGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  tasks: readonly TaskDTO[];
}

interface FollowupLocalRemoteRepository {
  readFollowupGraph: () => LocalRemoteFollowupGraph;
}

interface HybridFollowupTaskGenerationServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: FollowupLocalRemoteRepository;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function localRemoteSource(): string {
  return `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`;
}

function sourceForTask(task: TaskDTO): FollowupTaskGenerationSourceReference {
  const supportedTypes = new Set<FollowupTaskGenerationSourceReference["type"]>(
    ["manual", "event_import", "calendar_signal", "email_signal", "system"],
  );
  const type = supportedTypes.has(
    task.source.type as FollowupTaskGenerationSourceReference["type"],
  )
    ? (task.source.type as FollowupTaskGenerationSourceReference["type"])
    : "system";

  return {
    type,
    id: task.source.id,
    label: task.source.label ?? "Hybrid local remote followup task source",
    providerRecordId: task.source.id,
    generatedBy: "mock-followup-rules",
  };
}

function evidenceSummary(
  evidenceIds: readonly string[],
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>,
): string {
  return (
    evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId)?.summary)
      .find((summary): summary is string => Boolean(summary?.trim())) ??
    "Hybrid local remote task evidence is available for review."
  );
}

function toTask(
  task: TaskDTO,
  graph: LocalRemoteFollowupGraph,
): FollowupTask {
  const contactsById = new Map(graph.contacts.map((contact) => [contact.id, contact]));
  const connectionsById = new Map(
    graph.connections.map((connection) => [connection.id, connection]),
  );
  const evidenceById = new Map(
    graph.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const contact = followupContactForTask(task, contactsById);
  const connection = followupConnectionForTask(task, connectionsById);
  const dueInDays = followupDaysUntil(task.dueAt, graph.generatedAt);
  const source = sourceForTask(task);

  return {
    taskId: task.id,
    title: task.title,
    triggerKind: followupTriggerKindFor(task),
    priority: followupPriorityFor(dueInDays),
    dueAt: task.dueAt,
    dueInDays,
    connectionId: task.connectionId ?? connection?.id ?? "",
    contactName: contact?.displayName ?? "Hybrid local remote contact",
    organization: contact?.organization ?? "",
    recommendedAction: task.title,
    rationale: connection?.summary ?? evidenceSummary(task.evidenceIds, evidenceById),
    source,
    evidenceIds: task.evidenceIds,
    generatedBy: "mock-followup-rules",
    audit: {
      sourceLabel: source.label,
      providerBoundary: "scheduler false, AI false, persistence false",
      verificationAction: "Verify evidence",
    },
    backgroundSchedulerRequested: false,
    liveTaskPersistenceRequested: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
  };
}

function toTrigger(
  task: FollowupTask,
  graph: LocalRemoteFollowupGraph,
): FollowupTaskTrigger {
  return {
    triggerId: `trigger:hybrid:${task.taskId}`,
    kind: task.triggerKind,
    label: task.triggerKind.replace(/_/g, " "),
    detail: task.rationale,
    occurredAt: graph.generatedAt,
    connectionId: task.connectionId,
    contactName: task.contactName,
    organization: task.organization,
    source: task.source,
    evidenceIds: task.evidenceIds,
    backgroundSchedulerRequested: false,
    liveDatabaseReadExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
  };
}

function evidenceIdsFor(tasks: readonly FollowupTask[]): readonly string[] {
  const evidenceIds = tasks.flatMap((task) => task.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:followups-local-remote-empty"];
}

function provenanceFor(input: {
  collectedAt: string;
  sourceLabel: string;
  tasks: readonly FollowupTask[];
}): FollowupTaskGenerationProvenance {
  return {
    source: localRemoteSource(),
    sourceLabel: input.sourceLabel,
    evidenceIds: evidenceIdsFor(input.tasks),
    collectedAt: input.collectedAt,
    privacy: "demo-followup-task-generation-only",
    generationMethod: "local-remote-store-query",
    backgroundSchedulerRequested: false,
    liveTaskPersistenceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function payloadFor(
  graph: LocalRemoteFollowupGraph,
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
  sourceLabel: string,
): FollowupTaskGenerationPayload {
  const allTasks = graph.tasks.map((task) => toTask(task, graph));
  const tasks = filterFollowupTasks(allTasks, input);
  const triggers = tasks.map((task) => toTrigger(task, graph));

  return {
    state: tasks.length > 0 ? "success" : "empty",
    triggers,
    tasks,
    summary:
      tasks.length > 0
        ? `${tasks.length} followup tasks were loaded from the hybrid local remote database.`
        : "No followup tasks matched the hybrid local remote database query.",
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      sourceLabel,
      tasks,
    }),
    nextAction:
      tasks.length > 0
        ? "Review task evidence before any reminder, message, or external action."
        : "Add tasks to the local remote database or clear task filters.",
  };
}

function success(
  data: FollowupTaskGenerationPayload,
): FollowupTaskGenerationResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: FollowupTaskGenerationErrorCode,
  collectedAt: string,
): FollowupTaskGenerationFailure {
  const definition = FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    collectedAt,
    sourceLabel: "Hybrid local remote followup task failure",
    tasks: [],
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
  graph: LocalRemoteFollowupGraph,
  scenario: FollowupTaskGenerationScenario,
): FollowupTaskGenerationResult | null {
  switch (scenario) {
    case "empty":
      return success({
        ...payloadFor(graph, {}, "Hybrid local remote empty followup task state"),
        state: "empty",
        tasks: [],
        triggers: [],
        summary: "The hybrid local remote followup task database returned no rows.",
      });
    case "pending":
      return success({
        ...payloadFor(graph, {}, "Hybrid local remote pending followup task state"),
        state: "pending",
        tasks: [],
        triggers: [],
        summary:
          "The hybrid local remote followup task database is waiting for seed review.",
      });
    case "failure":
      return failure("FOLLOWUP_TASK_GENERATION_MOCK_FAILED", graph.generatedAt);
    case "success":
    default:
      return null;
  }
}

function createFollowupLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): FollowupLocalRemoteRepository {
  return {
    readFollowupGraph() {
      const state = database.getState();

      return {
        connections: state.connections,
        contacts: state.contacts,
        evidence: state.evidence,
        generatedAt: state.generatedAt,
        tasks: state.tasks,
      };
    },
  };
}

export function createHybridFollowupTaskGenerationService(
  options: HybridFollowupTaskGenerationServiceOptions = {},
): FollowupTaskGenerationService {
  const repository =
    options.repository ?? createFollowupLocalRemoteRepository(options.database);

  return {
    listTasks(input = {}): FollowupTaskGenerationResult {
      const graph = repository.readFollowupGraph();
      const scenario = scenarioResult(
        graph,
        normalizeFollowupTaskGenerationScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return success(payloadFor(graph, input, "Hybrid local remote followup task list"));
    },

    generateTasks(input = {}): FollowupTaskGenerationResult {
      const graph = repository.readFollowupGraph();
      const scenario = scenarioResult(
        graph,
        normalizeFollowupTaskGenerationScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor(graph, input, "Hybrid local remote followup task generation"),
      );
    },
  };
}
