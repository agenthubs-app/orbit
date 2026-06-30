import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
  buildDashboardAggregateSummary,
  type DashboardAggregateErrorCode,
  type DashboardAggregateFailure,
  type DashboardAggregateInput,
  type DashboardAggregatePayload,
  type DashboardAggregateProvenance,
  type DashboardAggregateResult,
  type DashboardAggregateScenario,
  type DashboardAggregateSourceReference,
  type DashboardAggregateSummaryInput,
  type DashboardAggregateSummaryResult,
  type DashboardDormantContact,
  type DashboardFollowupTask,
  type DashboardHighValueRelationship,
  type DashboardNewContact,
  type DashboardRecentActivity,
} from "../contract";
import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { DashboardAggregateService } from "../service";

interface LocalRemoteDashboardGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  events: readonly EventDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  tasks: readonly TaskDTO[];
}

interface DashboardLocalRemoteRepository {
  readDashboardGraph: () => LocalRemoteDashboardGraph;
}

interface HybridDashboardAggregateServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: DashboardLocalRemoteRepository;
}

const supportedScenarios = new Set<DashboardAggregateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function localRemoteSource(): string {
  return `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`;
}

function normalizeScenario(
  scenario?:
    | DashboardAggregateInput["scenario"]
    | DashboardAggregateSummaryInput["scenario"],
): DashboardAggregateScenario {
  if (scenario && supportedScenarios.has(scenario as DashboardAggregateScenario)) {
    return scenario as DashboardAggregateScenario;
  }

  return "success";
}

function normalizedActivityLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function evidenceIdsFor(graph: LocalRemoteDashboardGraph): readonly string[] {
  const evidenceIds = [
    ...graph.contacts.flatMap((contact) => contact.evidenceIds),
    ...graph.connections.flatMap((connection) => connection.evidenceIds),
    ...graph.events.flatMap((event) => event.evidenceIds),
    ...graph.tasks.flatMap((task) => task.evidenceIds),
  ];

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:dashboard-local-remote-empty"];
}

function provenanceFor(
  graph: LocalRemoteDashboardGraph,
  sourceLabel: string,
): DashboardAggregateProvenance {
  return {
    source: localRemoteSource(),
    sourceLabel,
    evidenceIds: evidenceIdsFor(graph),
    collectedAt: graph.generatedAt,
    privacy: "demo-dashboard-aggregate-only",
    generationMethod: "local-remote-store-query",
    liveAnalyticsQueryExecuted: false,
    productionAggregateReadExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function sourceForContact(contact: ContactDTO): DashboardAggregateSourceReference {
  const supportedTypes = new Set<DashboardAggregateSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "chat_summary",
    "system",
  ]);
  const type = supportedTypes.has(
    contact.source.type as DashboardAggregateSourceReference["type"],
  )
    ? (contact.source.type as DashboardAggregateSourceReference["type"])
    : "system";

  return {
    type,
    id: contact.source.id,
    label: contact.source.label ?? "Hybrid local remote contact source",
    providerRecordId: contact.source.id,
    generatedBy: "mock-dashboard-aggregate-rules",
  };
}

function toNewContact(contact: ContactDTO): DashboardNewContact {
  const source = sourceForContact(contact);

  return {
    contactId: contact.id,
    name: contact.displayName,
    organization: contact.organization ?? "",
    sourceLabel: source.label,
    source,
    evidenceIds: contact.evidenceIds,
  };
}

function contactById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

function priorityScore(connection: ConnectionDTO): number {
  return Math.round(
    connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      Math.min(95, 60 + connection.valueTypes.length * 10),
  );
}

function firstDashboardValueType(
  connection: ConnectionDTO,
): DashboardHighValueRelationship["valueType"] {
  if (connection.valueTypes.includes("commercial_opportunity")) {
    return "commercial_opportunity";
  }

  if (connection.valueTypes.includes("referral_path")) {
    return "referral_path";
  }

  return "strategic_fit";
}

function toHighValueRelationships(
  graph: LocalRemoteDashboardGraph,
): readonly DashboardHighValueRelationship[] {
  const contactsById = contactById(graph.contacts);

  return graph.connections
    .filter((connection) => priorityScore(connection) >= 70)
    .map((connection) => {
      const contact = contactsById.get(connection.contactId);

      return {
        connectionId: connection.id,
        contactName: contact?.displayName ?? "Hybrid local remote contact",
        organization: contact?.organization ?? "",
        valueType: firstDashboardValueType(connection),
        priorityScore: priorityScore(connection),
        reason: connection.summary,
        evidenceIds: connection.evidenceIds,
      };
    });
}

function dueLabel(task: TaskDTO, generatedAt: string): string {
  if (!task.dueAt) {
    return "No due date";
  }

  const dueTime = new Date(task.dueAt).getTime();
  const baseTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(baseTime)) {
    return "Due this week";
  }

  const days = Math.ceil((dueTime - baseTime) / 86_400_000);

  if (days <= 0) {
    return "Due today";
  }

  if (days === 1) {
    return "Due tomorrow";
  }

  return `Due in ${days} days`;
}

function toPendingFollowups(
  graph: LocalRemoteDashboardGraph,
): readonly DashboardFollowupTask[] {
  const contactsById = contactById(graph.contacts);

  return graph.tasks
    .filter((task) => task.status === "open" || task.status === "scheduled")
    .map((task) => {
      const contact = task.contactId
        ? contactsById.get(task.contactId)
        : undefined;

      return {
        taskId: task.id,
        contactName: contact?.displayName ?? "Hybrid local remote contact",
        dueLabel: dueLabel(task, graph.generatedAt),
        recommendedAction: task.title,
        evidenceIds: task.evidenceIds,
      };
    });
}

function toDormantContacts(
  graph: LocalRemoteDashboardGraph,
): readonly DashboardDormantContact[] {
  return graph.contacts
    .filter((contact) => contact.stage === "nurture")
    .map((contact) => ({
      contactId: contact.id,
      contactName: contact.displayName,
      organization: contact.organization ?? "",
      lastTouchpointDays: 30,
      suggestedAction:
        "Review local remote database evidence before restarting this relationship.",
      evidenceIds: contact.evidenceIds,
    }));
}

function toRecentActivity(
  graph: LocalRemoteDashboardGraph,
): readonly DashboardRecentActivity[] {
  const contactActivities = graph.contacts.map((contact) => ({
    activityId: `activity:dashboard:contact:${contact.id}`,
    type: "new_contact" as const,
    label: `${contact.displayName} added to the hybrid local remote database`,
    occurredAt: contact.createdAt,
    sourceLabel: contact.source.label ?? "Hybrid local remote contact source",
    evidenceIds: contact.evidenceIds,
  }));
  const taskActivities = graph.tasks.map((task) => ({
    activityId: `activity:dashboard:task:${task.id}`,
    type: "followup_due" as const,
    label: task.title,
    occurredAt: task.updatedAt,
    sourceLabel: task.source.label ?? "Hybrid local remote task source",
    evidenceIds: task.evidenceIds,
  }));

  return [...contactActivities, ...taskActivities].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}

function applyActivityLimit(
  payload: DashboardAggregatePayload,
  activityLimit?: number | null,
): DashboardAggregatePayload {
  const limit = normalizedActivityLimit(activityLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    recentActivity: payload.recentActivity.slice(0, limit),
  };
}

function aggregatePayload(
  graph: LocalRemoteDashboardGraph,
): DashboardAggregatePayload {
  const newContacts = graph.contacts.map(toNewContact);
  const highValueRelationships = toHighValueRelationships(graph);
  const pendingFollowupTasks = toPendingFollowups(graph);
  const dormantContacts = toDormantContacts(graph);

  return {
    state: graph.contacts.length > 0 ? "success" : "empty",
    relationshipAssetTotals: {
      contacts: graph.contacts.length,
      connections: graph.connections.length,
      evidenceBackedRelationships: graph.connections.filter(
        (connection) => connection.evidenceIds.length > 0,
      ).length,
      eventsRepresented: graph.events.length,
    },
    newContacts: {
      count: newContacts.length,
      windowLabel: "Local remote database",
      contacts: newContacts,
    },
    highValueCount: highValueRelationships.length,
    highValueRelationships,
    pendingFollowups: {
      count: pendingFollowupTasks.length,
      tasks: pendingFollowupTasks,
    },
    dormantContacts: {
      count: dormantContacts.length,
      contacts: dormantContacts,
    },
    recentActivity: toRecentActivity(graph),
    summary:
      "Hybrid dashboard aggregate was computed from local remote database tables.",
    provenance: provenanceFor(graph, "Hybrid local remote dashboard aggregate"),
    nextAction:
      "Use the source-backed local database aggregate for agent workflow testing.",
  };
}

function aggregateSuccess(
  data: DashboardAggregatePayload,
): DashboardAggregateResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function summarySuccess(
  graph: LocalRemoteDashboardGraph,
): DashboardAggregateSummaryResult {
  return {
    success: true,
    data: clonePayload(buildDashboardAggregateSummary(aggregatePayload(graph))),
  };
}

function failure(
  code: DashboardAggregateErrorCode,
  graph: LocalRemoteDashboardGraph,
): DashboardAggregateFailure {
  const definition = DASHBOARD_AGGREGATE_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor(
    graph,
    "Hybrid local remote dashboard aggregate failure",
  );

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

function emptyPayload(
  graph: LocalRemoteDashboardGraph,
  state: "empty" | "pending",
): DashboardAggregatePayload {
  return {
    ...aggregatePayload({ ...graph, contacts: [], connections: [], events: [], tasks: [] }),
    state,
    summary:
      state === "pending"
        ? "The hybrid local remote dashboard database is waiting for seed review."
        : "The hybrid local remote dashboard database returned no rows.",
  };
}

function aggregateScenarioResult(
  graph: LocalRemoteDashboardGraph,
  scenario: DashboardAggregateScenario,
): DashboardAggregateResult | null {
  switch (scenario) {
    case "empty":
      return aggregateSuccess(emptyPayload(graph, "empty"));
    case "pending":
      return aggregateSuccess(emptyPayload(graph, "pending"));
    case "failure":
      return failure("DASHBOARD_AGGREGATE_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function summaryScenarioResult(
  graph: LocalRemoteDashboardGraph,
  scenario: DashboardAggregateScenario,
): DashboardAggregateSummaryResult | null {
  const aggregate = aggregateScenarioResult(graph, scenario);

  if (!aggregate) {
    return null;
  }

  if (aggregate.success === false) {
    return aggregate;
  }

  return {
    success: true,
    data: clonePayload(buildDashboardAggregateSummary(aggregate.data)),
  };
}

function createDashboardLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): DashboardLocalRemoteRepository {
  return {
    readDashboardGraph() {
      const state = database.getState();

      return {
        connections: state.connections,
        contacts: state.contacts,
        events: state.events,
        evidence: state.evidence,
        generatedAt: state.generatedAt,
        tasks: state.tasks,
      };
    },
  };
}

export function createHybridDashboardAggregateService(
  options: HybridDashboardAggregateServiceOptions = {},
): DashboardAggregateService {
  const repository =
    options.repository ?? createDashboardLocalRemoteRepository(options.database);

  return {
    getDashboardAggregate(input = {}): DashboardAggregateResult {
      const graph = repository.readDashboardGraph();
      const scenario = aggregateScenarioResult(
        graph,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return aggregateSuccess(
        applyActivityLimit(aggregatePayload(graph), input.activityLimit),
      );
    },

    getDashboardSummary(input = {}): DashboardAggregateSummaryResult {
      const graph = repository.readDashboardGraph();
      const scenario = summaryScenarioResult(
        graph,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return summarySuccess(graph);
    },
  };
}
