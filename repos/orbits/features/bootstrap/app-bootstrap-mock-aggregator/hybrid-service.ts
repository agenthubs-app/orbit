import {
  APP_BOOTSTRAP_ERROR_DEFINITIONS,
  type AppBootstrapAgentAction,
  type AppBootstrapAgentActionType,
  type AppBootstrapErrorCode,
  type AppBootstrapFailure,
  type AppBootstrapInput,
  type AppBootstrapPayload,
  type AppBootstrapPendingTask,
  type AppBootstrapProvenance,
  type AppBootstrapResult,
  type AppBootstrapScenario,
  type AppBootstrapSourceReference,
  type AppBootstrapUpcomingEvent,
} from "../contract";
import type {
  AccountDTO,
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  NotificationDTO,
  PermissionStateDTO,
  TaskDTO,
  UserProfileDTO,
} from "../../../shared/domain/contracts";
import type { SourceReferenceDTO } from "../../../shared/domain/source-types";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { AppBootstrapService } from "../service";

interface LocalRemoteBootstrapGraph {
  accounts: readonly AccountDTO[];
  actions: readonly AgentActionDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  events: readonly EventDTO[];
  evidenceIds: readonly string[];
  generatedAt: string;
  notifications: readonly NotificationDTO[];
  permissions: readonly PermissionStateDTO[];
  profiles: readonly UserProfileDTO[];
  tasks: readonly TaskDTO[];
}

interface BootstrapLocalRemoteRepository {
  readBootstrapGraph: () => LocalRemoteBootstrapGraph;
}

interface HybridAppBootstrapServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: BootstrapLocalRemoteRepository;
}

const supportedScenarios = new Set<AppBootstrapScenario>([
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
  scenario?: AppBootstrapInput["scenario"],
): AppBootstrapScenario {
  if (scenario && supportedScenarios.has(scenario as AppBootstrapScenario)) {
    return scenario as AppBootstrapScenario;
  }

  return "success";
}

function normalizedTaskLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function sourceRef(
  source: SourceReferenceDTO,
  fallbackLabel: string,
): AppBootstrapSourceReference {
  return {
    ...source,
    label: source.label ?? fallbackLabel,
    providerRecordId: source.id,
    generatedBy: "mock-app-bootstrap-rules",
  };
}

function provenanceFor(
  graph: LocalRemoteBootstrapGraph,
  sourceLabel: string,
): AppBootstrapProvenance {
  return {
    source: localRemoteSource(),
    sourceLabel,
    evidenceIds:
      graph.evidenceIds.length > 0
        ? graph.evidenceIds
        : ["evidence:bootstrap-local-remote-empty"],
    collectedAt: graph.generatedAt,
    privacy: "demo-app-bootstrap-only",
    generationMethod: "local-remote-store-query",
    serverSidePersonalizationExecuted: false,
    liveDatabaseAggregationExecuted: false,
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

function contactById(
  contacts: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return new Map(contacts.map((contact) => [contact.id, contact]));
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
    return "Today";
  }

  if (days === 1) {
    return "Tomorrow";
  }

  return `In ${days} days`;
}

function upcomingEvents(
  graph: LocalRemoteBootstrapGraph,
): readonly AppBootstrapUpcomingEvent[] {
  return graph.events.map((event) => ({
    eventId: event.id,
    title: event.name,
    startsAt: event.startsAt,
    locationLabel: event.location ?? "Local remote database",
    readinessLabel: "Source-backed local event",
    goal: "Review local remote database evidence before agent planning.",
    evidenceIds: event.evidenceIds,
    sourceRefs: [sourceRef(event.source, "Hybrid local remote event source")],
  }));
}

function pendingTasks(
  graph: LocalRemoteBootstrapGraph,
): readonly AppBootstrapPendingTask[] {
  const contactsById = contactById(graph.contacts);

  return graph.tasks
    .filter((task) => task.status === "open" || task.status === "scheduled")
    .map((task) => {
      const contact = task.contactId
        ? contactsById.get(task.contactId)
        : undefined;

      return {
        taskId: task.id,
        title: task.title,
        dueLabel: dueLabel(task, graph.generatedAt),
        contactName: contact?.displayName ?? "Hybrid local remote contact",
        recommendedAction: task.title,
        evidenceIds: task.evidenceIds,
        sourceRefs: [sourceRef(task.source, "Hybrid local remote task source")],
      };
    });
}

function actionTypeFor(action: AgentActionDTO): AppBootstrapAgentActionType {
  switch (action.type) {
    case "schedule_reminder":
      return "event_reminder";
    case "summarize_context":
      return "dormant_activation";
    case "prepare_intro":
    case "draft_message":
    default:
      return "post_event_followup";
  }
}

function topAgentActions(
  graph: LocalRemoteBootstrapGraph,
): readonly AppBootstrapAgentAction[] {
  return graph.actions.slice(0, 3).map((action) => ({
    actionId: action.id,
    actionType: actionTypeFor(action),
    title: action.source.label ?? "Review local agent action",
    recommendedAction:
      "Review source-backed local agent action before external execution.",
    confirmationRequired: action.confirmationRequired,
    evidenceIds: action.evidenceIds,
    sourceRefs: [sourceRef(action.source, "Hybrid local remote agent action")],
  }));
}

function highValueConnectionCount(connections: readonly ConnectionDTO[]): number {
  return connections.filter((connection) => {
    const score =
      connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      connection.valueTypes.length * 25;

    return score >= 70;
  }).length;
}

function dashboardEvidenceIds(graph: LocalRemoteBootstrapGraph): readonly string[] {
  const ids = [
    ...graph.contacts.flatMap((contact) => contact.evidenceIds),
    ...graph.connections.flatMap((connection) => connection.evidenceIds),
    ...graph.tasks.flatMap((task) => task.evidenceIds),
  ];

  return ids.length > 0 ? [...new Set(ids)] : graph.evidenceIds;
}

function payloadFor(graph: LocalRemoteBootstrapGraph): AppBootstrapPayload {
  const account = graph.accounts[0] ?? null;
  const profile = graph.profiles[0] ?? null;
  const tasks = pendingTasks(graph);
  const highValueRelationships = highValueConnectionCount(graph.connections);
  const dormantContacts = graph.contacts.filter(
    (contact) => contact.stage === "nurture",
  ).length;
  const notifications = graph.notifications.filter(
    (notification) => notification.status === "pending",
  );

  return {
    state: account || profile || graph.contacts.length > 0 ? "success" : "empty",
    account: account
      ? {
          accountId: account.id,
          workspaceName: account.name,
          role: profile?.role ?? "Operator",
          plan: "mock-pro",
          timezone: profile?.timezone ?? "UTC",
          evidenceIds: graph.evidenceIds,
          sourceRefs: [
            sourceRef(
              {
                type: "system",
                id: account.id,
                label: "Hybrid local remote account",
              },
              "Hybrid local remote account",
            ),
          ],
        }
      : null,
    profile: profile
      ? {
          profileId: profile.id,
          displayName: profile.displayName,
          headline: profile.role ?? "Relationship operator",
          relationshipGoal:
            "Use source-backed local remote data for agent workflow testing.",
          homeMarket: profile.timezone ?? "Local",
          preferredFollowUpWindow: "within 48 hours",
          evidenceIds: graph.evidenceIds,
          sourceRefs: [
            sourceRef(
              {
                type: "system",
                id: profile.id,
                label: "Hybrid local remote profile",
              },
              "Hybrid local remote profile",
            ),
          ],
        }
      : null,
    upcomingEvents: upcomingEvents(graph),
    connectionSummary: {
      totalContacts: graph.contacts.length,
      totalConnections: graph.connections.length,
      evidenceBackedConnections: graph.connections.filter(
        (connection) => connection.evidenceIds.length > 0,
      ).length,
      highValueRelationships,
      dormantContacts,
      evidenceIds: dashboardEvidenceIds(graph),
    },
    pendingTasks: tasks,
    topAgentActions: topAgentActions(graph),
    dashboardSummary: {
      relationshipAssets: graph.contacts.length,
      newContactsThisWeek: graph.contacts.length,
      highValueRelationships,
      pendingFollowups: tasks.length,
      dormantContacts,
      evidenceIds: dashboardEvidenceIds(graph),
    },
    permissionSummary: {
      grantedPermissions: graph.permissions
        .filter((permission) => permission.state === "granted")
        .map((permission) => permission.capability),
      stagedPermissions: graph.permissions
        .filter((permission) => permission.state === "requested")
        .map((permission) => permission.capability),
      blockedPermissions: graph.permissions
        .filter(
          (permission) =>
            permission.state === "denied" || permission.state === "revoked",
        )
        .map((permission) => permission.capability),
      nextPermissionPrompt:
        "Request live permissions only after replacing the hybrid local store provider.",
      evidenceIds: graph.permissions.flatMap((permission) => permission.evidenceIds),
    },
    notificationSummary: {
      unreadCount: notifications.length,
      pendingDeliveryCount: notifications.length,
      quietHoursActive: false,
      latestNotification:
        notifications[0]?.title ?? "No local notifications are pending.",
      evidenceIds: graph.notifications.flatMap(
        (notification) => notification.evidenceIds,
      ),
    },
    provenance: provenanceFor(graph, "Hybrid local remote app bootstrap"),
    summary:
      "Hybrid app bootstrap assembled first-screen data from the local remote database.",
    nextAction:
      "Use this source-backed bootstrap payload for local agent workflow testing.",
  };
}

function applyTaskLimit(
  payload: AppBootstrapPayload,
  taskLimit?: number | null,
): AppBootstrapPayload {
  const limit = normalizedTaskLimit(taskLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    pendingTasks: payload.pendingTasks.slice(0, limit),
  };
}

function success(data: AppBootstrapPayload): AppBootstrapResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: AppBootstrapErrorCode,
  graph: LocalRemoteBootstrapGraph,
): AppBootstrapFailure {
  const definition = APP_BOOTSTRAP_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor(
    graph,
    "Hybrid local remote app bootstrap failure",
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
  graph: LocalRemoteBootstrapGraph,
  state: "empty" | "pending",
): AppBootstrapPayload {
  return {
    ...payloadFor({
      ...graph,
      actions: [],
      contacts: [],
      connections: [],
      events: [],
      notifications: [],
      permissions: [],
      tasks: [],
    }),
    state,
    summary:
      state === "pending"
        ? "The hybrid local remote app bootstrap is waiting for seed review."
        : "The hybrid local remote app bootstrap returned no rows.",
  };
}

function scenarioResult(
  graph: LocalRemoteBootstrapGraph,
  scenario: AppBootstrapScenario,
): AppBootstrapResult | null {
  switch (scenario) {
    case "empty":
      return success(emptyPayload(graph, "empty"));
    case "pending":
      return success(emptyPayload(graph, "pending"));
    case "failure":
      return failure("APP_BOOTSTRAP_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function createBootstrapLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): BootstrapLocalRemoteRepository {
  return {
    readBootstrapGraph() {
      const state = database.getState();
      const evidenceIds = state.evidence.map((evidence) => evidence.id);

      return {
        accounts: state.accounts,
        actions: state.agentActions,
        connections: state.connections,
        contacts: state.contacts,
        events: state.events,
        evidenceIds,
        generatedAt: state.generatedAt,
        notifications: state.notifications,
        permissions: state.permissions,
        profiles: state.profiles,
        tasks: state.tasks,
      };
    },
  };
}

export function createHybridAppBootstrapService(
  options: HybridAppBootstrapServiceOptions = {},
): AppBootstrapService {
  const repository =
    options.repository ?? createBootstrapLocalRemoteRepository(options.database);

  return {
    getAppBootstrap(input = {}): AppBootstrapResult {
      const graph = repository.readBootstrapGraph();
      const scenario = scenarioResult(graph, normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(applyTaskLimit(payloadFor(graph), input.taskLimit));
    },
  };
}
