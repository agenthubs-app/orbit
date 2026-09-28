import {
  DASHBOARD_AGGREGATE_ERROR_DEFINITIONS,
  DASHBOARD_SHORT_LIST_LIMIT,
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
  type DashboardRelationshipAssetTotals,
} from "./dashboard-contract";
import type {
  DashboardGraphConnection as ConnectionDTO,
  DashboardGraphContact as ContactDTO,
  DashboardGraphTask as TaskDTO,
  LiveDashboardGraph,
} from "./dashboard-graph";
import type { NetworkDistributionReadModel, NetworkGapCore } from "./dashboard-distribution";
import type { OpportunityCore } from "./dashboard-opportunity";
import { compareText, parseTimestamp } from "./compute-text";

// Sprint 0117 (dashboard D3): the dashboard aggregate (totals, short lists,
// recent activity) and its summary, moved from features/dashboard/
// aggregate-projection.ts, summary.ts and live-service.ts into the shared
// directory. The server's graph oracle and the App's device computation run
// this code; the server's SQL read model (0101) is compared with it.

export interface DashboardAggregateService {
  getDashboardAggregate: (
    input?: DashboardAggregateInput,
  ) => DashboardAggregateResult | Promise<DashboardAggregateResult>;
  getDashboardSummary: (
    input?: DashboardAggregateSummaryInput,
  ) => DashboardAggregateSummaryResult | Promise<DashboardAggregateSummaryResult>;
}

/** Thrown by a SQL reader whose data needs the full-graph ordering (the service falls back to the graph). */
export class DashboardSummaryRequiresGraphFallback extends Error {
  constructor() {
    super("Dashboard summary activity strings require the full graph ordering fallback");
    this.name = "DashboardSummaryRequiresGraphFallback";
  }
}

/** Gaps and opportunities cached per relationship-graph version (sprint 0102). */
export interface DashboardAnalysisSnapshot {
  graphVersion: string;
  gaps: NetworkGapCore;
  opportunities: OpportunityCore;
}

// ---- aggregate projection ----
const supportedScenarios = new Set<DashboardAggregateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

export function normalizeDashboardAggregateScenario(
  scenario?: string | null,
): DashboardAggregateScenario {
  if (scenario && supportedScenarios.has(scenario as DashboardAggregateScenario)) {
    return scenario as DashboardAggregateScenario;
  }

  return "success";
}

export function normalizeDashboardActivityLimit(
  limit?: number | null,
): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

export function dashboardContactsById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

export function dashboardPriorityScore(connection: ConnectionDTO): number {
  return Math.round(
    connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      Math.min(95, 60 + connection.valueTypes.length * 10),
  );
}

export function dashboardValueType(
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

export function dashboardDueLabel(task: TaskDTO, generatedAt: string): string {
  if (!task.dueAt) {
    return "No due date";
  }

  const dueTime = parseTimestamp(task.dueAt);
  const baseTime = parseTimestamp(generatedAt);

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

export function applyDashboardActivityLimit(
  payload: DashboardAggregatePayload,
  activityLimit?: number | null,
): DashboardAggregatePayload {
  const limit = normalizeDashboardActivityLimit(activityLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    recentActivity: payload.recentActivity.slice(0, limit),
  };
}

/** Recent activity is a short list: at most DASHBOARD_SHORT_LIST_LIMIT items. */
export function dashboardShortListActivityLimit(activityLimit?: number | null): number {
  const limit = normalizeDashboardActivityLimit(activityLimit);
  return limit === null
    ? DASHBOARD_SHORT_LIST_LIMIT
    : Math.min(limit, DASHBOARD_SHORT_LIST_LIMIT);
}

// ---- summary ----
export function buildDashboardAggregateSummary(
  payload: DashboardAggregatePayload,
): DashboardAggregateSummaryPayload {
  return {
    state: payload.state,
    metrics: [
      {
        id: "relationship-assets",
        label: "Relationship assets",
        value: payload.relationshipAssetTotals.contacts,
        evidenceIds: payload.provenance.evidenceIds,
      },
      {
        id: "new-contacts",
        label: "New contacts",
        value: payload.newContacts.count,
        evidenceIds: payload.newContacts.contacts.flatMap(
          (contact) => contact.evidenceIds,
        ),
      },
      {
        id: "high-value",
        label: "High-value relationships",
        value: payload.highValueCount,
        evidenceIds: payload.highValueRelationships.flatMap(
          (relationship) => relationship.evidenceIds,
        ),
      },
      {
        id: "pending-followups",
        label: "Pending followups",
        value: payload.pendingFollowups.count,
        evidenceIds: payload.pendingFollowups.tasks.flatMap(
          (task) => task.evidenceIds,
        ),
      },
      {
        id: "dormant-contacts",
        label: "Dormant contacts",
        value: payload.dormantContacts.count,
        evidenceIds: payload.dormantContacts.contacts.flatMap(
          (contact) => contact.evidenceIds,
        ),
      },
    ],
    recentActivity: payload.recentActivity.slice(0, 3),
    summary:
      payload.state === "success"
        ? "Rule-based summary of the local dashboard aggregate fixture."
        : payload.summary,
    provenance: {
      ...payload.provenance,
      sourceLabel: "Mock dashboard aggregate summary rule",
      generationMethod: "rule-based-summary",
    },
    nextAction: payload.nextAction,
  };
}

// ---- aggregate service ----
/** Everything a dashboard aggregate response needs; every list is already short. */
export interface DashboardAggregateReadModel {
  generatedAt: string;
  relationshipAssetTotals: DashboardRelationshipAssetTotals;
  newContactsCount: number;
  highValueCount: number;
  pendingFollowupCount: number;
  dormantContactCount: number;
  provenanceEvidenceIds: readonly string[];
  newContacts: readonly DashboardNewContact[];
  highValueRelationships: readonly DashboardHighValueRelationship[];
  pendingFollowups: readonly DashboardFollowupTask[];
  dormantContacts: readonly DashboardDormantContact[];
  recentActivity: readonly DashboardRecentActivity[];
}

export interface DashboardContactRoleCount {
  role: string;
  count: number;
}

type LiveDashboardAggregateProviderResult<TResult> = Promise<TResult> | TResult;

export interface LiveDashboardAggregateProvider {
  source: string;
  sourceLabel: string;
  readDashboardGraph: () => LiveDashboardAggregateProviderResult<LiveDashboardGraph>;
  readDashboardGraphForAccount?: (
    accountId: string,
  ) => LiveDashboardAggregateProviderResult<LiveDashboardGraph>;
  /** Sprint 0101: totals and short lists computed in SQL (no full-graph read). */
  readDashboardAggregateForAccount?: (
    accountId: string,
    input: { activityLimit: number },
  ) => Promise<DashboardAggregateReadModel>;
  /** Trimmed non-empty contact roles with their counts (contacts analysis). */
  readContactRoleCountsForAccount?: (
    accountId: string,
  ) => Promise<readonly DashboardContactRoleCount[]>;
  /** Sprint 0101: grouped distribution rows computed in SQL. */
  readNetworkDistributionReadModelForAccount?: (
    accountId: string,
  ) => Promise<NetworkDistributionReadModel>;
  /**
   * Sprint 0102: the actor's relationship-graph version (one small aggregate
   * query), or null when the database has no sync_revision column.
   */
  readDashboardGraphVersionForAccount?: (accountId: string) => Promise<string | null>;
  /** Sprint 0102: gaps and opportunities cached per graph version; null without a version. */
  readDashboardAnalysisSnapshotForAccount?: (
    accountId: string,
  ) => Promise<DashboardAnalysisSnapshot | null>;
  /** Internal read-model capability; it must not widen the public dashboard DTO. */
  readDashboardSummaryForAccount?: (
    accountId: string,
    scenario?: DashboardAggregateScenario,
  ) => LiveDashboardAggregateProviderResult<DashboardAggregateSummaryResult>;
}

export interface LiveDashboardAggregateServiceOptions {
  provider?: LiveDashboardAggregateProvider | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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
  model: Pick<DashboardAggregateReadModel, "generatedAt" | "provenanceEvidenceIds">,
  provider: LiveDashboardAggregateProvider,
  sourceLabel = provider.sourceLabel,
): DashboardAggregateProvenance {
  return {
    source: provider.source,
    sourceLabel,
    evidenceIds: model.provenanceEvidenceIds,
    collectedAt: model.generatedAt,
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
    collectedAt: "1970-01-01T00:00:00.000Z",
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

function toHighValueRelationships(
  graph: LiveDashboardGraph,
): readonly DashboardHighValueRelationship[] {
  const contactsById = dashboardContactsById(graph.contacts);

  return graph.connections
    .filter((connection) => dashboardPriorityScore(connection) >= 70)
    .map((connection) => {
      const contact = contactsById.get(connection.contactId);

      return {
        connectionId: connection.id,
        contactName: contact?.displayName ?? "Live relationship contact",
        organization: contact?.organization ?? "",
        valueType: dashboardValueType(connection),
        priorityScore: dashboardPriorityScore(connection),
        reason: connection.summary,
        evidenceIds: connection.evidenceIds,
      };
    });
}

function toPendingFollowups(
  graph: LiveDashboardGraph,
): readonly DashboardFollowupTask[] {
  const contactsById = dashboardContactsById(graph.contacts);

  return graph.tasks
    .filter((task) => task.status === "open" || task.status === "scheduled")
    .map((task) => {
      const contact = task.contactId
        ? contactsById.get(task.contactId)
        : undefined;

      return {
        taskId: task.id,
        contactName: contact?.displayName ?? "Live relationship contact",
        dueLabel: dashboardDueLabel(task, graph.generatedAt),
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
    compareText(right.occurredAt, left.occurredAt),
  );
}

/** Full-graph (JS) read model: the original list rules, cut to short lists. */
export function dashboardAggregateReadModelFromGraph(
  graph: LiveDashboardGraph,
  activityLimit?: number | null,
): DashboardAggregateReadModel {
  const newContacts = graph.contacts.map(toNewContact);
  const highValueRelationships = toHighValueRelationships(graph);
  const pendingFollowupTasks = toPendingFollowups(graph);
  const dormantContacts = toDormantContacts(graph);

  return {
    generatedAt: graph.generatedAt,
    relationshipAssetTotals: {
      contacts: graph.contacts.length,
      connections: graph.connections.length,
      evidenceBackedRelationships: graph.connections.filter(
        (connection) => connection.evidenceIds.length > 0,
      ).length,
      eventsRepresented: graph.events.length,
    },
    newContactsCount: newContacts.length,
    highValueCount: highValueRelationships.length,
    pendingFollowupCount: pendingFollowupTasks.length,
    dormantContactCount: dormantContacts.length,
    provenanceEvidenceIds: evidenceIdsFor(graph).slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    newContacts: newContacts.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    highValueRelationships: highValueRelationships.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    pendingFollowups: pendingFollowupTasks.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    dormantContacts: dormantContacts.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    recentActivity: toRecentActivity(graph).slice(
      0,
      dashboardShortListActivityLimit(activityLimit),
    ),
  };
}

function emptyReadModel(generatedAt: string): DashboardAggregateReadModel {
  return {
    generatedAt,
    relationshipAssetTotals: {
      contacts: 0,
      connections: 0,
      evidenceBackedRelationships: 0,
      eventsRepresented: 0,
    },
    newContactsCount: 0,
    highValueCount: 0,
    pendingFollowupCount: 0,
    dormantContactCount: 0,
    provenanceEvidenceIds: ["evidence:dashboard-live-store-empty"],
    newContacts: [],
    highValueRelationships: [],
    pendingFollowups: [],
    dormantContacts: [],
    recentActivity: [],
  };
}

function aggregatePayload(
  model: DashboardAggregateReadModel,
  provider: LiveDashboardAggregateProvider,
): DashboardAggregatePayload {
  return {
    state: model.relationshipAssetTotals.contacts > 0 ? "success" : "empty",
    relationshipAssetTotals: model.relationshipAssetTotals,
    newContacts: {
      count: model.newContactsCount,
      windowLabel: "Live relationship database",
      contacts: model.newContacts,
    },
    highValueCount: model.highValueCount,
    highValueRelationships: model.highValueRelationships,
    pendingFollowups: {
      count: model.pendingFollowupCount,
      tasks: model.pendingFollowups,
    },
    dormantContacts: {
      count: model.dormantContactCount,
      contacts: model.dormantContacts,
    },
    recentActivity: model.recentActivity,
    summary:
      "Live dashboard aggregate was computed from shared remote relationship records.",
    provenance: provenanceFor(model, provider),
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
  const built = buildDashboardAggregateSummary(data);
  const summary = {
    ...built,
    metrics: built.metrics.map((metric) => ({
      ...metric,
      evidenceIds: metric.evidenceIds.slice(0, DASHBOARD_SHORT_LIST_LIMIT),
    })),
  };

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
  model: DashboardAggregateReadModel,
  provider: LiveDashboardAggregateProvider,
  state: "empty" | "pending",
): DashboardAggregatePayload {
  return {
    ...aggregatePayload(emptyReadModel(model.generatedAt), provider),
    state,
    summary:
      state === "pending"
        ? "The live dashboard aggregate is waiting for relationship record review."
        : "The live dashboard aggregate returned no relationship rows.",
  };
}

function scenarioAggregateResult(
  model: DashboardAggregateReadModel,
  provider: LiveDashboardAggregateProvider,
  scenario: DashboardAggregateScenario,
): DashboardAggregateResult | null {
  switch (scenario) {
    case "empty":
      return aggregateSuccess(emptyPayload(model, provider, "empty"));
    case "pending":
      return aggregateSuccess(emptyPayload(model, provider, "pending"));
    case "failure":
      return failure(
        "DASHBOARD_AGGREGATE_LIVE_FAILED",
        provenanceFor(model, provider, "Live dashboard controlled failure"),
      );
    case "success":
    default:
      return null;
  }
}

async function readAggregateModel(
  provider: LiveDashboardAggregateProvider,
  actorId: string,
  activityLimit?: number | null,
): Promise<DashboardAggregateReadModel> {
  if (provider.readDashboardAggregateForAccount) {
    try {
      return await provider.readDashboardAggregateForAccount(actorId, {
        activityLimit: dashboardShortListActivityLimit(activityLimit),
      });
    } catch (error) {
      if (!(error instanceof DashboardSummaryRequiresGraphFallback)) throw error;
    }
  }
  const graph = provider.readDashboardGraphForAccount
    ? await provider.readDashboardGraphForAccount(actorId)
    : await provider.readDashboardGraph();
  return dashboardAggregateReadModelFromGraph(graph, activityLimit);
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

  const actorId = input.actorId?.trim();

  if (!actorId) {
    return failure(
      "DASHBOARD_AGGREGATE_ACTOR_REQUIRED",
      unconfiguredProvenance(),
    );
  }

  const model = await readAggregateModel(provider, actorId, input.activityLimit);
  const scenario = scenarioAggregateResult(
    model,
    provider,
    normalizeDashboardAggregateScenario(input.scenario),
  );

  if (scenario) {
    return scenario;
  }

  return aggregateSuccess(aggregatePayload(model, provider));
}

async function summaryFor(
  provider: LiveDashboardAggregateProvider | null,
  input: DashboardAggregateSummaryInput = {},
): Promise<DashboardAggregateSummaryResult> {
  if (!provider) {
    return failure(
      "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(),
    );
  }

  const actorId = input.actorId?.trim();

  if (!actorId) {
    return failure(
      "DASHBOARD_AGGREGATE_ACTOR_REQUIRED",
      unconfiguredProvenance(),
    );
  }

  if (provider.readDashboardSummaryForAccount) {
    return provider.readDashboardSummaryForAccount(
      actorId,
      normalizeDashboardAggregateScenario(input.scenario),
    );
  }

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
