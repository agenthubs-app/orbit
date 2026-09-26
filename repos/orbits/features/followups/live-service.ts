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
  type FollowupTaskTriggerKind,
} from "./contract";
import {
  filterFollowupTasks,
  followupConnectionForTask,
  followupContactForTask,
  followupDaysUntil,
  followupPriorityFor,
  followupTriggerKindFor,
  normalizeFollowupTaskGenerationScenario,
} from "./task-generation-projection";
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

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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

// 没有任何一条证据带 summary 时，这里曾经返回 "Live task evidence is available for
// review."，然后被当作跟进卡片的「理由」展示给用户：一句什么都没说明的英文兜底，
// 比留空更伤——它看起来像有依据，实际什么依据都没给。改成返回空串，由展示层
// 决定不渲染这一行，宁可少一行也不编一句。
function evidenceSummary(
  evidenceIds: readonly string[],
  evidenceById: ReadonlyMap<string, RelationshipEvidenceDTO>,
): string {
  return (
    evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId)?.summary)
      .find((summary): summary is string => Boolean(summary?.trim())) ?? ""
  );
}

function toTask(task: TaskDTO, graph: LiveFollowupGraph): FollowupTask {
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
    contactId: contact?.id ?? null,
    connectionId: task.connectionId ?? connection?.id ?? "",
    contactName: contact?.displayName ?? "未关联联系人",
    organization: contact?.organization ?? "",
    recommendedAction: task.title,
    rationale:
      connection?.summary?.trim() || evidenceSummary(task.evidenceIds, evidenceById),
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
          priority: followupPriorityFor(dueInDays),
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
  const tasks = filterFollowupTasks(allTasks, input.request);
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
        normalizeFollowupTaskGenerationScenario(input.scenario),
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
        normalizeFollowupTaskGenerationScenario(input.scenario),
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
