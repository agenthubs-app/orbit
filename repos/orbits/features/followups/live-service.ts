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
  type FollowupTaskPriority,
  type FollowupTaskTrigger,
  type FollowupTaskTriggerKind,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type { FollowupTaskGenerationService } from "./service";
import type { LiveFollowupGraph } from "./storage/followup-live-record-provider";

type LiveFollowupTaskProviderResult<TResult> = Promise<TResult> | TResult;

export interface LiveFollowupTaskProvider {
  source: string;
  sourceLabel: string;
  readFollowupGraph: (
    actorId: string,
  ) => LiveFollowupTaskProviderResult<LiveFollowupGraph>;
}

export interface LiveFollowupTaskGenerationServiceOptions {
  provider?: LiveFollowupTaskProvider | null;
}

const supportedScenarios = new Set<FollowupTaskGenerationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTriggerKinds = new Set<FollowupTaskTriggerKind>([
  "new_connection",
  "event_encounter",
  "promised_action",
  "dormant_relationship",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?:
    | FollowupTaskGenerationListInput["scenario"]
    | FollowupTaskGenerationGenerateInput["scenario"],
): FollowupTaskGenerationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as FollowupTaskGenerationScenario)
  ) {
    return scenario as FollowupTaskGenerationScenario;
  }

  return "success";
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function triggerKindFor(task: TaskDTO): FollowupTaskTriggerKind {
  switch (task.source.type) {
    case "event_import":
      return "event_encounter";
    case "calendar_signal":
      return "dormant_relationship";
    case "agent_action":
    case "email_signal":
      return "promised_action";
    case "manual":
    default:
      return "new_connection";
  }
}

function selectedTriggerKinds(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): readonly FollowupTaskTriggerKind[] | null {
  if ("triggerKinds" in input && Array.isArray(input.triggerKinds)) {
    const kinds = input.triggerKinds.filter((kind): kind is FollowupTaskTriggerKind =>
      supportedTriggerKinds.has(kind as FollowupTaskTriggerKind),
    );

    return kinds.length > 0 ? kinds : null;
  }

  if (
    "triggerKind" in input &&
    input.triggerKind &&
    supportedTriggerKinds.has(input.triggerKind as FollowupTaskTriggerKind)
  ) {
    return [input.triggerKind as FollowupTaskTriggerKind];
  }

  return null;
}

function connectionIdFor(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): string | null {
  if (!("connectionId" in input)) {
    return null;
  }

  return input.connectionId?.trim() || null;
}

function sourceForTask(task: TaskDTO): FollowupTaskGenerationSourceReference {
  const supportedTypes = new Set<FollowupTaskGenerationSourceReference["type"]>(
    [
      "agent_action",
      "calendar_signal",
      "email_signal",
      "event_import",
      "manual",
      "system",
    ],
  );
  const type = supportedTypes.has(
    task.source.type as FollowupTaskGenerationSourceReference["type"],
  )
    ? (task.source.type as FollowupTaskGenerationSourceReference["type"])
    : "system";

  return {
    type,
    id: task.source.id,
    label: task.source.label ?? "Live followup task source",
    providerRecordId: task.source.id,
    generatedBy: "live-store-query",
  };
}

function contactForTask(
  task: TaskDTO,
  contactsById: ReadonlyMap<string, ContactDTO>,
): ContactDTO | null {
  return task.contactId ? contactsById.get(task.contactId) ?? null : null;
}

function connectionForTask(
  task: TaskDTO,
  connectionsById: ReadonlyMap<string, ConnectionDTO>,
): ConnectionDTO | null {
  return task.connectionId ? connectionsById.get(task.connectionId) ?? null : null;
}

function evidenceSummary(
  evidenceIds: readonly string[],
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>,
): string {
  return (
    evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId)?.summary)
      .find((summary): summary is string => Boolean(summary?.trim())) ??
    "Live task evidence is available for review."
  );
}

function daysUntil(dueAt: string | undefined, generatedAt: string): number {
  if (!dueAt) {
    return 7;
  }

  const dueTime = new Date(dueAt).getTime();
  const baseTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(baseTime)) {
    return 7;
  }

  return Math.max(0, Math.ceil((dueTime - baseTime) / 86_400_000));
}

function priorityFor(dueInDays: number): FollowupTaskPriority {
  if (dueInDays <= 1) {
    return "today";
  }

  if (dueInDays <= 7) {
    return "this_week";
  }

  return "nurture";
}

function toTask(task: TaskDTO, graph: LiveFollowupGraph): FollowupTask {
  const contactsById = new Map(graph.contacts.map((contact) => [contact.id, contact]));
  const connectionsById = new Map(
    graph.connections.map((connection) => [connection.id, connection]),
  );
  const evidenceById = new Map(
    graph.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const contact = contactForTask(task, contactsById);
  const connection = connectionForTask(task, connectionsById);
  const dueInDays = daysUntil(task.dueAt, graph.generatedAt);
  const source = sourceForTask(task);

  return {
    taskId: task.id,
    title: task.title,
    triggerKind: triggerKindFor(task),
    priority: priorityFor(dueInDays),
    dueAt: task.dueAt,
    dueInDays,
    connectionId: task.connectionId ?? connection?.id ?? "",
    contactName: contact?.displayName ?? "Live contact",
    organization: contact?.organization ?? "",
    recommendedAction: task.title,
    rationale: connection?.summary ?? evidenceSummary(task.evidenceIds, evidenceById),
    source,
    evidenceIds: task.evidenceIds,
    generatedBy: "live-store-query",
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

function relationshipDueInDays(connection: ConnectionDTO): number {
  switch (connection.stage) {
    case "needs_follow_up":
      return 1;
    case "reviewing":
      return 3;
    case "active":
    case "captured":
      return 7;
    case "nurture":
      return 14;
    case "archived":
    default:
      return 30;
  }
}

function relationshipTriggerKind(
  connection: ConnectionDTO,
): FollowupTaskTriggerKind {
  if (connection.stage === "nurture") {
    return "dormant_relationship";
  }

  return connection.suggestedActions?.length
    ? "promised_action"
    : "new_connection";
}

function relationshipSuggestions(
  graph: LiveFollowupGraph,
  storedTasks: readonly FollowupTask[],
): readonly FollowupTask[] {
  const storedConnectionIds = new Set(
    storedTasks.map((task) => task.connectionId).filter(Boolean),
  );
  const contactsById = new Map(
    graph.contacts.map((contact) => [contact.id, contact]),
  );

  return graph.connections
    .filter(
      (connection) =>
        connection.stage !== "archived" &&
        !storedConnectionIds.has(connection.id),
    )
    .flatMap((connection) => {
      const contact = contactsById.get(connection.contactId);
      const recommendedAction =
        contact?.nextAction?.text ?? connection.suggestedActions?.[0]?.trim();

      if (!contact || !recommendedAction) {
        return [];
      }

      const dueInDays = relationshipDueInDays(connection);
      const evidenceIds = [
        ...new Set([
          ...(contact.nextAction?.evidenceId
            ? [contact.nextAction.evidenceId]
            : []),
          ...connection.evidenceIds,
        ]),
      ];
      const source: FollowupTaskGenerationSourceReference = {
        type: "system",
        id: `relationship-suggestion:${connection.id}`,
        label: "Derived from saved relationship evidence",
        providerRecordId: connection.id,
        generatedBy: "live-store-query",
      };

      return [
        {
          taskId: `relationship-suggestion:${connection.id}`,
          title: recommendedAction,
          triggerKind: relationshipTriggerKind(connection),
          priority: priorityFor(dueInDays),
          dueInDays,
          connectionId: connection.id,
          contactName: contact.displayName,
          organization: contact.organization ?? "",
          recommendedAction,
          rationale: contact.nextAction?.reason ?? connection.summary,
          source,
          evidenceIds,
          generatedBy: "live-store-query",
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
        },
      ];
    });
}

function toTrigger(
  task: FollowupTask,
  graph: LiveFollowupGraph,
): FollowupTaskTrigger {
  return {
    triggerId: `trigger:live:${task.taskId}`,
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
    liveDatabaseReadExecuted: true,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
  };
}

function filterTasks(
  tasks: readonly FollowupTask[],
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): readonly FollowupTask[] {
  const kinds = selectedTriggerKinds(input);
  const connectionId = connectionIdFor(input);
  const limit = normalizedLimit(input.limit);
  const filtered = tasks.filter((task) => {
    const matchesKind = kinds ? kinds.includes(task.triggerKind) : true;
    const matchesConnection = connectionId
      ? task.connectionId === connectionId
      : true;

    return matchesKind && matchesConnection;
  });

  return limit === null ? filtered : filtered.slice(0, limit);
}

function compareTasks(left: FollowupTask, right: FollowupTask): number {
  const dueDifference = left.dueInDays - right.dueInDays;

  if (dueDifference !== 0) {
    return dueDifference;
  }

  return left.taskId.localeCompare(right.taskId);
}

function evidenceIdsFor(tasks: readonly FollowupTask[]): readonly string[] {
  const evidenceIds = tasks.flatMap((task) => task.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:followups-live-store-empty"];
}

function provenanceFor(input: {
  collectedAt: string;
  databaseReadExecuted: boolean;
  provider?: LiveFollowupTaskProvider | null;
  tasks: readonly FollowupTask[];
}): FollowupTaskGenerationProvenance {
  return {
    source: input.provider?.source ?? "live-record-store:followups:unconfigured",
    sourceLabel:
      input.provider?.sourceLabel ?? "Unconfigured followup live store",
    evidenceIds: evidenceIdsFor(input.tasks),
    collectedAt: input.collectedAt,
    privacy: "live-followup-task-generation",
    generationMethod: "live-store-query",
    backgroundSchedulerRequested: false,
    liveTaskPersistenceRequested: false,
    liveDatabaseReadExecuted: input.databaseReadExecuted,
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

function payloadFor(input: {
  graph: LiveFollowupGraph;
  provider: LiveFollowupTaskProvider;
  request: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput;
  sourceLabel: string;
}): FollowupTaskGenerationPayload {
  const storedTasks = input.graph.tasks.map((task) => toTask(task, input.graph));
  const allTasks = [
    ...storedTasks,
    ...relationshipSuggestions(input.graph, storedTasks),
  ].sort(compareTasks);
  const tasks = filterTasks(allTasks, input.request);
  const triggers = tasks.map((task) => toTrigger(task, input.graph));

  return {
    state: tasks.length > 0 ? "success" : "empty",
    triggers,
    tasks,
    summary:
      tasks.length > 0
        ? `${tasks.length} source-backed followup suggestions were loaded from live relationship data.`
        : "No source-backed followup suggestions matched the live relationship query.",
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      databaseReadExecuted: true,
      provider: input.provider,
      tasks,
    }),
    nextAction:
      tasks.length > 0
        ? "Review task evidence before any reminder, message, or external action."
        : "Add a relationship next action, a suggested action, or a source-backed task.",
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
  provenance: FollowupTaskGenerationProvenance,
): FollowupTaskGenerationFailure {
  const definition = FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS[code];

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

function unconfiguredFailure(): FollowupTaskGenerationFailure {
  return failure(
    "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
    provenanceFor({
      collectedAt: new Date(0).toISOString(),
      databaseReadExecuted: false,
      tasks: [],
    }),
  );
}

function scenarioResult(
  graph: LiveFollowupGraph,
  provider: LiveFollowupTaskProvider,
  scenario: FollowupTaskGenerationScenario,
): FollowupTaskGenerationResult | null {
  switch (scenario) {
    case "empty":
      return success({
        ...payloadFor({
          graph,
          provider,
          request: {},
          sourceLabel: provider.sourceLabel,
        }),
        state: "empty",
        tasks: [],
        triggers: [],
        summary: "The live followup task store returned no rows.",
      });
    case "pending":
      return success({
        ...payloadFor({
          graph,
          provider,
          request: {},
          sourceLabel: provider.sourceLabel,
        }),
        state: "pending",
        tasks: [],
        triggers: [],
        summary: "The live followup task store is waiting for data review.",
      });
    case "failure":
      return failure(
        "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
        provenanceFor({
          collectedAt: graph.generatedAt,
          databaseReadExecuted: true,
          provider,
          tasks: [],
        }),
      );
    case "success":
    default:
      return null;
  }
}

async function graphOrFailure(
  provider: LiveFollowupTaskProvider | null,
  actorId?: string | null,
): Promise<FollowupTaskGenerationFailure | LiveFollowupGraph> {
  const normalizedActorId = actorId?.trim();
  if (!normalizedActorId) {
    return failure(
      "FOLLOWUP_TASK_GENERATION_ACTOR_REQUIRED",
      provenanceFor({
        collectedAt: new Date(0).toISOString(),
        databaseReadExecuted: false,
        provider,
        tasks: [],
      }),
    );
  }

  if (!provider) {
    return unconfiguredFailure();
  }

  return provider.readFollowupGraph(normalizedActorId);
}

function isFailure(
  value: FollowupTaskGenerationFailure | LiveFollowupGraph,
): value is FollowupTaskGenerationFailure {
  return "success" in value && value.success === false;
}

export function createLiveFollowupTaskGenerationService({
  provider = null,
}: LiveFollowupTaskGenerationServiceOptions = {}): FollowupTaskGenerationService {
  return {
    async generateTasks(
      input: FollowupTaskGenerationGenerateInput = {},
    ): Promise<FollowupTaskGenerationResult> {
      const graph = await graphOrFailure(provider, input.actorId);

      if (isFailure(graph)) {
        return graph;
      }

      const scenario = scenarioResult(
        graph,
        provider as LiveFollowupTaskProvider,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor({
          graph,
          provider: provider as LiveFollowupTaskProvider,
          request: input,
          sourceLabel: provider?.sourceLabel ?? "Followup live task generation",
        }),
      );
    },

    async listTasks(
      input: FollowupTaskGenerationListInput = {},
    ): Promise<FollowupTaskGenerationResult> {
      const graph = await graphOrFailure(provider, input.actorId);

      if (isFailure(graph)) {
        return graph;
      }

      const scenario = scenarioResult(
        graph,
        provider as LiveFollowupTaskProvider,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor({
          graph,
          provider: provider as LiveFollowupTaskProvider,
          request: input,
          sourceLabel: provider?.sourceLabel ?? "Followup live task list",
        }),
      );
    },
  };
}
