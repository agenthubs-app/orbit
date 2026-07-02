import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
  type DashboardAggregateErrorCode,
  type DashboardAggregateFailure,
  type DashboardAggregateInput,
  type DashboardAggregatePayload,
  type DashboardAggregateProvenance,
  type DashboardAggregateResult,
  type DashboardAggregateScenario,
  type DashboardAggregateSourceReference,
  type DashboardAggregateSummaryInput,
  type DashboardAggregateSummaryPayload,
  type DashboardAggregateSummaryResult,
  type DashboardDormantContact,
  type DashboardFollowupTask,
  type DashboardHighValueRelationship,
  type DashboardNewContact,
  type DashboardRecentActivity,
} from "./contract";
import { buildDashboardAggregateSummary } from "./fixtures";
import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type { DashboardAggregateService } from "./service";
import type { LiveDashboardGraph } from "./storage/dashboard-live-record-provider";

type LiveDashboardAggregateProviderResult<TResult> = Promise<TResult> | TResult;

export interface LiveDashboardAggregateProvider {
  source: string;
  sourceLabel: string;
  readDashboardGraph: () => LiveDashboardAggregateProviderResult<LiveDashboardGraph>;
}

export interface LiveDashboardAggregateServiceOptions {
  provider?: LiveDashboardAggregateProvider | null;
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

function evidenceIdsFor(graph: LiveDashboardGraph): readonly string[] {
  const evidenceIds = [
    ...graph.contacts.flatMap((contact) => contact.evidenceIds),
    ...graph.connections.flatMap((connection) => connection.evidenceIds),
    ...graph.events.flatMap((event) => event.evidenceIds),
    ...graph.tasks.flatMap((task) => task.evidenceIds),
  ];

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:dashboard-live-store-empty"];
}

function provenanceFor(
  graph: LiveDashboardGraph,
  provider: LiveDashboardAggregateProvider,
  sourceLabel = provider.sourceLabel,
): DashboardAggregateProvenance {
  return {
    source: provider.source,
    sourceLabel,
    evidenceIds: evidenceIdsFor(graph),
    collectedAt: graph.generatedAt,
    privacy: "live-dashboard-aggregate",
    generationMethod: "live-store-query",
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

function unconfiguredProvenance(): DashboardAggregateProvenance {
  return {
    source: "live-record-store:dashboard:unconfigured",
    sourceLabel: "Unconfigured Dashboard live store",
    evidenceIds: ["evidence:dashboard-live-store-unconfigured"],
    collectedAt: new Date(0).toISOString(),
    privacy: "live-dashboard-aggregate",
    generationMethod: "live-store-query",
    liveAnalyticsQueryExecuted: false,
    productionAggregateReadExecuted: false,
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
    label: contact.source.label ?? "Live dashboard contact source",
    providerRecordId: contact.source.id,
    generatedBy: "live-store-query",
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
  graph: LiveDashboardGraph,
): readonly DashboardHighValueRelationship[] {
  const contactsById = contactById(graph.contacts);

  return graph.connections
    .filter((connection) => priorityScore(connection) >= 70)
    .map((connection) => {
      const contact = contactsById.get(connection.contactId);

      return {
        connectionId: connection.id,
        contactName: contact?.displayName ?? "Live relationship contact",
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
  graph: LiveDashboardGraph,
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
        contactName: contact?.displayName ?? "Live relationship contact",
        dueLabel: dueLabel(task, graph.generatedAt),
        recommendedAction: task.title,
        evidenceIds: task.evidenceIds,
      };
    });
}

function toDormantContacts(
  graph: LiveDashboardGraph,
): readonly DashboardDormantContact[] {
  return graph.contacts
    .filter((contact) => contact.stage === "nurture")
    .map((contact) => ({
      contactId: contact.id,
      contactName: contact.displayName,
      organization: contact.organization ?? "",
      lastTouchpointDays: 30,
      suggestedAction:
        "Review live relationship evidence before restarting this relationship.",
      evidenceIds: contact.evidenceIds,
    }));
}

function toRecentActivity(
  graph: LiveDashboardGraph,
): readonly DashboardRecentActivity[] {
  const contactActivities = graph.contacts.map((contact) => ({
    activityId: `activity:dashboard:contact:${contact.id}`,
    type: "new_contact" as const,
    label: `${contact.displayName} added to the live relationship database`,
    occurredAt: contact.createdAt,
    sourceLabel: contact.source.label ?? "Live contact source",
    evidenceIds: contact.evidenceIds,
  }));
  const taskActivities = graph.tasks.map((task) => ({
    activityId: `activity:dashboard:task:${task.id}`,
    type: "followup_due" as const,
    label: task.title,
    occurredAt: task.updatedAt,
    sourceLabel: task.source.label ?? "Live task source",
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
  graph: LiveDashboardGraph,
  provider: LiveDashboardAggregateProvider,
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
      windowLabel: "Live relationship database",
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
      "Live dashboard aggregate was computed from shared remote relationship records.",
    provenance: provenanceFor(graph, provider),
    nextAction:
      "Use the source-backed live dashboard aggregate for agent workflow testing.",
  };
}

function aggregateSuccess(data: DashboardAggregatePayload): DashboardAggregateResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function summarySuccess(
  data: DashboardAggregatePayload,
): DashboardAggregateSummaryResult {
  const summary = buildDashboardAggregateSummary(data);

  return {
    success: true,
    data: clonePayload<DashboardAggregateSummaryPayload>({
      ...summary,
      summary:
        data.state === "success"
          ? "Rule-based summary of the live dashboard aggregate."
          : data.summary,
      provenance: {
        ...summary.provenance,
        source: data.provenance.source,
        sourceLabel: `${data.provenance.sourceLabel} summary`,
        privacy: data.provenance.privacy,
        databaseReadExecuted: data.provenance.databaseReadExecuted,
      },
    }),
  };
}

function failure(
  code: DashboardAggregateErrorCode,
  provenance: DashboardAggregateProvenance,
): DashboardAggregateFailure {
  const definition = DASHBOARD_AGGREGATE_ERROR_DEFINITIONS[code];

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
  graph: LiveDashboardGraph,
  provider: LiveDashboardAggregateProvider,
  state: "empty" | "pending",
): DashboardAggregatePayload {
  return {
    ...aggregatePayload(
      { ...graph, contacts: [], connections: [], events: [], tasks: [] },
      provider,
    ),
    state,
    summary:
      state === "pending"
        ? "The live dashboard aggregate is waiting for relationship record review."
        : "The live dashboard aggregate returned no relationship rows.",
  };
}

function scenarioAggregateResult(
  graph: LiveDashboardGraph,
  provider: LiveDashboardAggregateProvider,
  scenario: DashboardAggregateScenario,
): DashboardAggregateResult | null {
  switch (scenario) {
    case "empty":
      return aggregateSuccess(emptyPayload(graph, provider, "empty"));
    case "pending":
      return aggregateSuccess(emptyPayload(graph, provider, "pending"));
    case "failure":
      return failure(
        "DASHBOARD_AGGREGATE_LIVE_FAILED",
        provenanceFor(graph, provider, "Live dashboard controlled failure"),
      );
    case "success":
    default:
      return null;
  }
}

async function aggregateFor(
  provider: LiveDashboardAggregateProvider | null,
  input: DashboardAggregateInput = {},
): Promise<DashboardAggregateResult> {
  if (!provider) {
    return failure(
      "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(),
    );
  }

  const graph = await provider.readDashboardGraph();
  const scenario = scenarioAggregateResult(
    graph,
    provider,
    normalizeScenario(input.scenario),
  );

  if (scenario) {
    return scenario;
  }

  return aggregateSuccess(
    applyActivityLimit(aggregatePayload(graph, provider), input.activityLimit),
  );
}

async function summaryFor(
  provider: LiveDashboardAggregateProvider | null,
  input: DashboardAggregateSummaryInput = {},
): Promise<DashboardAggregateSummaryResult> {
  const aggregate = await aggregateFor(provider, input);

  if (aggregate.success === false) {
    return aggregate;
  }

  return summarySuccess(aggregate.data);
}

export function createLiveDashboardAggregateService({
  provider = null,
}: LiveDashboardAggregateServiceOptions = {}): DashboardAggregateService {
  return {
    getDashboardAggregate(input = {}) {
      return aggregateFor(provider, input);
    },

    getDashboardSummary(input = {}) {
      return summaryFor(provider, input);
    },
  };
}
