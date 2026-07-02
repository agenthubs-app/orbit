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
} from "./contract";
import type { AppBootstrapService } from "./service";
import type {
  LiveAppBootstrapGraph,
  LiveAppBootstrapProfileRecord,
  LiveAppBootstrapProvider,
} from "./storage/bootstrap-live-record-provider";
import type {
  AccountDTO,
  AgentActionDTO,
  ContactDTO,
  ConnectionDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";

export interface LiveAppBootstrapServiceOptions {
  now?: () => string;
  provider?: LiveAppBootstrapProvider | null;
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

function success(data: AppBootstrapPayload): AppBootstrapResult {
  return {
    success: true,
    data: clonePayload(data),
  };
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

function unconfiguredProvenance(now: string): AppBootstrapProvenance {
  return {
    source: "live-record-store:app-bootstrap:unconfigured",
    sourceLabel: "Unconfigured Bootstrap live store",
    evidenceIds: ["evidence:app-bootstrap-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-app-bootstrap",
    generationMethod: "live-store-query",
    serverSidePersonalizationExecuted: false,
    liveDatabaseAggregationExecuted: true,
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

function failure(
  code: AppBootstrapErrorCode,
  provenance: AppBootstrapProvenance,
): AppBootstrapFailure {
  const definition = APP_BOOTSTRAP_ERROR_DEFINITIONS[code];

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

function sourceRef(
  source: SourceReferenceDTO,
  fallbackLabel: string,
): AppBootstrapSourceReference {
  return {
    ...source,
    label: source.label ?? fallbackLabel,
    providerRecordId: source.id,
    generatedBy: "live-store-query",
  };
}

function provenanceFor(
  graph: LiveAppBootstrapGraph,
  provider: LiveAppBootstrapProvider,
  sourceLabel: string,
  generationMethod: AppBootstrapProvenance["generationMethod"] =
    "live-store-query",
): AppBootstrapProvenance {
  return {
    source: provider.source,
    sourceLabel,
    evidenceIds:
      graph.evidenceIds.length > 0
        ? graph.evidenceIds
        : ["evidence:app-bootstrap-live-store-empty"],
    collectedAt: graph.generatedAt,
    privacy: "live-app-bootstrap",
    generationMethod,
    serverSidePersonalizationExecuted: false,
    liveDatabaseAggregationExecuted: true,
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

function profileForAccount(
  graph: LiveAppBootstrapGraph,
  account: AccountDTO,
): LiveAppBootstrapProfileRecord | null {
  return (
    graph.profiles.find(
      (profile) =>
        profile.id === "profile_orbit_generated_operator" &&
        profile.accountId === account.id,
    ) ??
    graph.profiles.find((profile) => profile.accountId === account.id) ??
    null
  );
}

function selectAccountAndProfile(graph: LiveAppBootstrapGraph):
  | {
      account: AccountDTO;
      profile: LiveAppBootstrapProfileRecord | null;
    }
  | null {
  const accounts = [...graph.accounts].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (const account of accounts) {
    return {
      account,
      profile: profileForAccount(graph, account),
    };
  }

  return null;
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
  graph: LiveAppBootstrapGraph,
): readonly AppBootstrapUpcomingEvent[] {
  return graph.events.map((event) => ({
    eventId: event.id,
    title: event.name,
    startsAt: event.startsAt,
    locationLabel: event.location ?? "Live storage event",
    readinessLabel: "Source-backed live event",
    goal: "Review live storage evidence before agent planning.",
    evidenceIds: event.evidenceIds,
    sourceRefs: [sourceRef(event.source, "Live event source")],
  }));
}

function pendingTasks(
  graph: LiveAppBootstrapGraph,
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
        contactName: contact?.displayName ?? "Live storage contact",
        recommendedAction: task.title,
        evidenceIds: task.evidenceIds,
        sourceRefs: [sourceRef(task.source, "Live task source")],
      };
    });
}

function actionTypeFor(action: AgentActionDTO): AppBootstrapAgentActionType {
  switch (action.type) {
    case "schedule_reminder":
      return "event_reminder";
    case "summarize_context":
      return "dormant_activation";
    case "draft_message":
    case "prepare_intro":
    default:
      return "post_event_followup";
  }
}

function topAgentActions(
  graph: LiveAppBootstrapGraph,
): readonly AppBootstrapAgentAction[] {
  return graph.actions.slice(0, 3).map((action) => ({
    actionId: action.id,
    actionType: actionTypeFor(action),
    title: action.source.label ?? "Review live agent action",
    recommendedAction:
      "Review source-backed live agent action before external execution.",
    confirmationRequired: action.confirmationRequired,
    evidenceIds: action.evidenceIds,
    sourceRefs: [sourceRef(action.source, "Live agent action")],
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

function dashboardEvidenceIds(
  graph: LiveAppBootstrapGraph,
): readonly string[] {
  const ids = [
    ...graph.contacts.flatMap((contact) => contact.evidenceIds),
    ...graph.connections.flatMap((connection) => connection.evidenceIds),
    ...graph.tasks.flatMap((task) => task.evidenceIds),
  ];

  return ids.length > 0 ? [...new Set(ids)] : graph.evidenceIds;
}

function payloadFor(
  graph: LiveAppBootstrapGraph,
  provider: LiveAppBootstrapProvider,
): AppBootstrapPayload {
  const selected = selectAccountAndProfile(graph);
  const account = selected?.account ?? null;
  const profile = selected?.profile ?? graph.profiles[0] ?? null;
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
          plan: "live-relationship-os",
          timezone: profile?.timezone ?? "UTC",
          evidenceIds: graph.evidenceIds,
          sourceRefs: [
            sourceRef(
              {
                type: "system",
                id: account.id,
                label: "Live account",
              },
              "Live account",
            ),
          ],
        }
      : null,
    profile: profile
      ? {
          profileId: profile.id,
          displayName: profile.displayName,
          headline: profile.headline ?? profile.role ?? "Relationship operator",
          relationshipGoal:
            profile.relationshipGoal ??
            "Use remote live storage for source-backed relationship workflows.",
          homeMarket: profile.homeMarket ?? profile.timezone ?? "Live storage",
          preferredFollowUpWindow:
            profile.preferredFollowUpWindow ?? "within 48 hours",
          evidenceIds: graph.evidenceIds,
          sourceRefs: [
            sourceRef(
              {
                type: "system",
                id: profile.id,
                label: "Live profile",
              },
              "Live profile",
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
        "Review staged live permissions before provider-backed actions.",
      evidenceIds: graph.permissions.flatMap((permission) => permission.evidenceIds),
    },
    notificationSummary: {
      unreadCount: notifications.length,
      pendingDeliveryCount: notifications.length,
      quietHoursActive: false,
      latestNotification:
        notifications[0]?.title ?? "No live notifications are pending.",
      evidenceIds: graph.notifications.flatMap(
        (notification) => notification.evidenceIds,
      ),
    },
    provenance: provenanceFor(graph, provider, provider.sourceLabel),
    summary:
      "Live app bootstrap assembled first-screen data from remote live storage.",
    nextAction:
      "Use this source-backed bootstrap payload for live relationship workflow testing.",
  };
}

function emptyPayload(
  graph: LiveAppBootstrapGraph,
  provider: LiveAppBootstrapProvider,
  state: "empty" | "pending",
): AppBootstrapPayload {
  return {
    ...payloadFor(
      {
        ...graph,
        actions: [],
        contacts: [],
        connections: [],
        events: [],
        notifications: [],
        permissions: [],
        tasks: [],
      },
      provider,
    ),
    state,
    summary:
      state === "pending"
        ? "The live app bootstrap is waiting for seed review."
        : "The live app bootstrap returned no rows.",
  };
}

function scenarioResult(
  graph: LiveAppBootstrapGraph,
  provider: LiveAppBootstrapProvider,
  scenario: AppBootstrapScenario,
): AppBootstrapResult | null {
  switch (scenario) {
    case "empty":
      return success(emptyPayload(graph, provider, "empty"));
    case "pending":
      return success(emptyPayload(graph, provider, "pending"));
    case "failure":
      return failure(
        "APP_BOOTSTRAP_LIVE_FAILED",
        provenanceFor(
          graph,
          provider,
          "Live app bootstrap controlled failure",
        ),
      );
    case "success":
    default:
      return null;
  }
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
    provenance: {
      ...payload.provenance,
      generationMethod: "live-store-task-limit",
    },
  };
}

async function readLiveBootstrap(
  provider: LiveAppBootstrapProvider | null,
  input: AppBootstrapInput,
  now: string,
): Promise<AppBootstrapResult> {
  if (!provider) {
    return failure(
      "APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(now),
    );
  }

  const graph = await provider.readBootstrapGraph();
  const scenario = scenarioResult(graph, provider, normalizeScenario(input.scenario));

  if (scenario) {
    return scenario;
  }

  return success(applyTaskLimit(payloadFor(graph, provider), input.taskLimit));
}

export function createLiveAppBootstrapService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveAppBootstrapServiceOptions = {}): AppBootstrapService {
  return {
    getAppBootstrap(input = {}) {
      return readLiveBootstrap(provider, input, now());
    },
  };
}
