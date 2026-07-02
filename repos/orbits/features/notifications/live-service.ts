import {
  REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS,
  type GroupedLowPriorityReminder,
  type NotificationQueueChannel,
  type NotificationQueueEntry,
  type ReminderFrequency,
  type ReminderPriority,
  type ReminderScheduleNotificationErrorCode,
  type ReminderScheduleNotificationFailure,
  type ReminderScheduleNotificationGenerateInput,
  type ReminderScheduleNotificationListInput,
  type ReminderScheduleNotificationPayload,
  type ReminderScheduleNotificationProvenance,
  type ReminderScheduleNotificationResult,
  type ReminderScheduleNotificationScenario,
  type ReminderScheduleNotificationSourceReference,
  type ScheduledReminder,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  NotificationDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type { ReminderScheduleNotificationService } from "./service";

export interface LiveReminderNotificationGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  notifications: readonly NotificationDTO[];
  tasks: readonly TaskDTO[];
}

type LiveReminderScheduleNotificationProviderResult<TResult> =
  | Promise<TResult>
  | TResult;

export interface LiveReminderScheduleNotificationProvider {
  source: string;
  sourceLabel: string;
  readReminderNotificationGraph: () => LiveReminderScheduleNotificationProviderResult<LiveReminderNotificationGraph>;
}

export interface LiveReminderScheduleNotificationServiceOptions {
  provider?: LiveReminderScheduleNotificationProvider | null;
}

const supportedScenarios = new Set<ReminderScheduleNotificationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedFrequencies = new Set<ReminderFrequency>([
  "once",
  "daily",
  "weekly",
  "monthly",
]);

const supportedPriorities = new Set<ReminderPriority>([
  "high",
  "normal",
  "low",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?:
    | ReminderScheduleNotificationListInput["scenario"]
    | ReminderScheduleNotificationGenerateInput["scenario"],
): ReminderScheduleNotificationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ReminderScheduleNotificationScenario)
  ) {
    return scenario as ReminderScheduleNotificationScenario;
  }

  return "success";
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function normalizedDueWithinDays(dueWithinDays?: number | null): number | null {
  if (!Number.isFinite(dueWithinDays ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(dueWithinDays as number));
}

function selectedFrequencies(
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
): readonly ReminderFrequency[] | null {
  if ("frequencies" in input && Array.isArray(input.frequencies)) {
    const frequencies = input.frequencies.filter(
      (frequency): frequency is ReminderFrequency =>
        supportedFrequencies.has(frequency as ReminderFrequency),
    );

    return frequencies.length > 0 ? frequencies : null;
  }

  if (
    "frequency" in input &&
    supportedFrequencies.has(input.frequency as ReminderFrequency)
  ) {
    return [input.frequency as ReminderFrequency];
  }

  return null;
}

function selectedPriority(
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
): ReminderPriority | null {
  if (
    "priority" in input &&
    supportedPriorities.has(input.priority as ReminderPriority)
  ) {
    return input.priority as ReminderPriority;
  }

  return null;
}

function evidenceForNotification(
  notification: NotificationDTO,
  graph: LiveReminderNotificationGraph,
): RelationshipEvidenceDTO | null {
  return (
    graph.evidence.find((evidence) =>
      notification.evidenceIds.includes(evidence.id),
    ) ?? null
  );
}

function taskIdFromEvidence(
  evidence: RelationshipEvidenceDTO | null,
): string | null {
  return evidence?.summary.match(/task_\d+/)?.[0] ?? null;
}

function contactIdFromTitle(title: string): string | null {
  return title.match(/contact_\d+/)?.[0] ?? null;
}

function taskForNotification(
  notification: NotificationDTO,
  graph: LiveReminderNotificationGraph,
): TaskDTO | null {
  const taskId = taskIdFromEvidence(evidenceForNotification(notification, graph));

  if (taskId) {
    const task = graph.tasks.find((item) => item.id === taskId);

    if (task) {
      return task;
    }
  }

  const contactId = contactIdFromTitle(notification.title);

  return (
    graph.tasks.find((task) => task.title === notification.title) ??
    graph.tasks.find((task) => task.contactId === contactId) ??
    null
  );
}

function contactForTask(
  task: TaskDTO | null,
  graph: LiveReminderNotificationGraph,
  notification: NotificationDTO,
): ContactDTO | null {
  if (task?.contactId) {
    const contact = graph.contacts.find((item) => item.id === task.contactId);

    if (contact) {
      return contact;
    }
  }

  const contactId = contactIdFromTitle(notification.title);

  return graph.contacts.find((contact) => contact.id === contactId) ?? null;
}

function connectionForTask(
  task: TaskDTO | null,
  graph: LiveReminderNotificationGraph,
): ConnectionDTO | null {
  if (task?.connectionId) {
    const connection = graph.connections.find(
      (item) => item.id === task.connectionId,
    );

    if (connection) {
      return connection;
    }
  }

  if (task?.contactId) {
    return (
      graph.connections.find(
        (connection) => connection.contactId === task.contactId,
      ) ?? null
    );
  }

  return null;
}

function sourceForNotification(
  notification: NotificationDTO,
): ReminderScheduleNotificationSourceReference {
  const supportedTypes = new Set<ReminderScheduleNotificationSourceReference["type"]>([
    "calendar_signal",
    "email_signal",
    "event_import",
    "manual",
    "system",
  ]);
  const type = supportedTypes.has(
    notification.source.type as ReminderScheduleNotificationSourceReference["type"],
  )
    ? (notification.source.type as ReminderScheduleNotificationSourceReference["type"])
    : "system";

  return {
    type,
    id: notification.source.id,
    label:
      notification.source.label ??
      "Live reminder schedule notification source",
    providerRecordId: notification.source.id,
    generatedBy: "live-store-query",
  };
}

function dueAtFor(notification: NotificationDTO, task: TaskDTO | null): string {
  return notification.scheduledFor ?? task?.dueAt ?? notification.createdAt;
}

function daysUntil(dueAt: string, generatedAt: string): number {
  const dueTime = new Date(dueAt).getTime();
  const baseTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(baseTime)) {
    return 7;
  }

  return Math.max(0, Math.ceil((dueTime - baseTime) / 86_400_000));
}

function priorityFor(dueInDays: number): ReminderPriority {
  if (dueInDays <= 2) {
    return "high";
  }

  if (dueInDays <= 7) {
    return "normal";
  }

  return "low";
}

function frequencyFor(dueInDays: number): ReminderFrequency {
  if (dueInDays <= 2) {
    return "once";
  }

  if (dueInDays <= 7) {
    return "daily";
  }

  if (dueInDays <= 30) {
    return "weekly";
  }

  return "monthly";
}

function recommendedWindowFor(priority: ReminderPriority): string {
  switch (priority) {
    case "high":
      return "Review before the scheduled in-app reminder";
    case "normal":
      return "Review during the next relationship follow-up block";
    case "low":
    default:
      return "Keep grouped in the relationship reminder digest";
  }
}

function evidenceIdsForReminder(
  notification: NotificationDTO,
  task: TaskDTO | null,
): readonly string[] {
  return [...new Set([...notification.evidenceIds, ...(task?.evidenceIds ?? [])])];
}

function toReminder(
  notification: NotificationDTO,
  graph: LiveReminderNotificationGraph,
): ScheduledReminder {
  const task = taskForNotification(notification, graph);
  const contact = contactForTask(task, graph, notification);
  const connection = connectionForTask(task, graph);
  const dueAt = dueAtFor(notification, task);
  const dueInDays = daysUntil(dueAt, graph.generatedAt);
  const priority = priorityFor(dueInDays);
  const source = sourceForNotification(notification);

  return {
    reminderId: notification.id,
    followupTaskId: task?.id ?? notification.id,
    connectionId: task?.connectionId ?? connection?.id ?? "",
    contactName: contact?.displayName ?? "Live generated relationship contact",
    organization: contact?.organization ?? "",
    title: notification.title,
    dueAt,
    dueInDays,
    frequency: frequencyFor(dueInDays),
    priority,
    groupedLowPriority: priority === "low",
    recommendedWindow: recommendedWindowFor(priority),
    source,
    evidenceIds: evidenceIdsForReminder(notification, task),
    audit: {
      sourceLabel: source.label,
      providerBoundary:
        "push false, email false, SMS false, cron false, persistence false",
      verificationAction: "Review reminder evidence",
    },
    generatedBy: "live-store-query",
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };
}

function channelFor(notification: NotificationDTO): NotificationQueueChannel {
  switch (notification.channel) {
    case "email":
      return "email";
    case "in_app":
      return "in_app";
    case "calendar":
    case "system":
    default:
      return "in_app";
  }
}

function queueReason(notification: NotificationDTO): string {
  if (notification.channel === "calendar" || notification.channel === "system") {
    return `${notification.channel} notification is represented as an in-app review queue entry; no provider received a job.`;
  }

  return `${notification.channel} notification was loaded from live storage for review only; no provider received a job.`;
}

function toQueueEntry(input: {
  notification: NotificationDTO;
  reminder: ScheduledReminder;
}): NotificationQueueEntry {
  return {
    queueEntryId: input.notification.id,
    reminderIds: [input.reminder.reminderId],
    channel: channelFor(input.notification),
    status:
      input.reminder.groupedLowPriority && input.notification.status === "pending"
        ? "live_grouped"
        : "live_queued",
    scheduledFor: input.reminder.dueAt,
    reason: queueReason(input.notification),
    evidenceIds: input.reminder.evidenceIds,
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };
}

function compareReminders(left: ScheduledReminder, right: ScheduledReminder): number {
  return left.reminderId.localeCompare(right.reminderId);
}

function filterReminders(
  reminders: readonly ScheduledReminder[],
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
): readonly ScheduledReminder[] {
  const frequencies = selectedFrequencies(input);
  const priority = selectedPriority(input);
  const limit = normalizedLimit(input.limit);
  const dueWithinDays =
    "dueWithinDays" in input
      ? normalizedDueWithinDays(input.dueWithinDays)
      : null;
  const includeGroupedLowPriority =
    !("includeGroupedLowPriority" in input) ||
    input.includeGroupedLowPriority !== false;
  const filtered = reminders.filter((reminder) => {
    const matchesFrequency =
      frequencies === null || frequencies.includes(reminder.frequency);
    const matchesPriority = priority === null || reminder.priority === priority;
    const matchesDueWindow =
      dueWithinDays === null || reminder.dueInDays <= dueWithinDays;
    const matchesGroupedPolicy =
      includeGroupedLowPriority || !reminder.groupedLowPriority;

    return (
      matchesFrequency &&
      matchesPriority &&
      matchesDueWindow &&
      matchesGroupedPolicy
    );
  });

  return limit === null ? filtered : filtered.slice(0, limit);
}

function lowPriorityGroup(
  reminders: readonly ScheduledReminder[],
): readonly GroupedLowPriorityReminder[] {
  const groupedReminders = reminders.filter(
    (reminder) => reminder.groupedLowPriority,
  );

  if (groupedReminders.length === 0) {
    return [];
  }

  return [
    {
      groupId: "group:live-reminders:low-priority-relationship-digest",
      label: "Live grouped low-priority reminders",
      frequency: "weekly",
      priority: "low",
      reminderIds: groupedReminders.map((reminder) => reminder.reminderId),
      queueEntryId: "queue:live-notification:relationship-digest",
      groupReason:
        "Low-priority live reminder records stay grouped in Orbit until a confirmed delivery provider is added.",
      evidenceIds: [...new Set(groupedReminders.flatMap((item) => item.evidenceIds))],
      pushNotificationRequested: false,
      emailDeliveryRequested: false,
      smsDeliveryRequested: false,
      cronJobRequested: false,
      externalNetworkRequested: false,
    },
  ];
}

function evidenceIdsFor(reminders: readonly ScheduledReminder[]): readonly string[] {
  const evidenceIds = reminders.flatMap((reminder) => reminder.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:reminder-notification-live-store-empty"];
}

function provenanceFor(input: {
  collectedAt: string;
  generationMethod: ReminderScheduleNotificationProvenance["generationMethod"];
  provider: LiveReminderScheduleNotificationProvider | null;
  readExecuted: boolean;
  reminders: readonly ScheduledReminder[];
  sourceLabel?: string;
}): ReminderScheduleNotificationProvenance {
  return {
    source:
      input.provider?.source ??
      "live-record-store:reminder-schedule-notification:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Reminder notification live store is not configured",
    evidenceIds: evidenceIdsFor(input.reminders),
    collectedAt: input.collectedAt,
    privacy: "live-reminder-schedule-notification-preview",
    generationMethod: input.generationMethod,
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseReadExecuted: input.readExecuted,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };
}

function payloadFor(input: {
  generationMethod: ReminderScheduleNotificationProvenance["generationMethod"];
  graph: LiveReminderNotificationGraph;
  provider: LiveReminderScheduleNotificationProvider;
  request: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput;
  sourceLabel: string;
}): ReminderScheduleNotificationPayload {
  const reminders = filterReminders(
    input.graph.notifications
      .map((notification) => toReminder(notification, input.graph))
      .sort(compareReminders),
    input.request,
  );
  const notificationById = new Map(
    input.graph.notifications.map((notification) => [
      notification.id,
      notification,
    ]),
  );
  const notificationQueue = reminders.flatMap((reminder) => {
    const notification = notificationById.get(reminder.reminderId);

    return notification ? [toQueueEntry({ notification, reminder })] : [];
  });

  return {
    state: reminders.length > 0 ? "success" : "empty",
    reminders,
    groupedLowPriorityReminders: lowPriorityGroup(reminders),
    notificationQueue,
    summary:
      reminders.length > 0
        ? `${reminders.length} reminder notifications were loaded from shared live storage for review.`
        : "No live reminder notifications matched the current filters.",
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      generationMethod: input.generationMethod,
      provider: input.provider,
      readExecuted: true,
      reminders,
      sourceLabel: input.sourceLabel,
    }),
    nextAction:
      reminders.length > 0
        ? "Review reminder evidence inside Orbit before enabling any delivery provider."
        : "Seed source-backed notifications or clear reminder filters.",
  };
}

function success(
  data: ReminderScheduleNotificationPayload,
): ReminderScheduleNotificationResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ReminderScheduleNotificationErrorCode,
  input: {
    collectedAt?: string;
    provider: LiveReminderScheduleNotificationProvider | null;
    readExecuted: boolean;
    sourceLabel?: string;
  },
): ReminderScheduleNotificationFailure {
  const definition = REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    collectedAt: input.collectedAt ?? new Date(0).toISOString(),
    generationMethod: "live-store-query",
    provider: input.provider,
    readExecuted: input.readExecuted,
    reminders: [],
    sourceLabel: input.sourceLabel ?? "Live reminder notification failure",
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
  input: {
    graph: LiveReminderNotificationGraph;
    provider: LiveReminderScheduleNotificationProvider;
    request: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput;
    scenario: ReminderScheduleNotificationScenario;
  },
): ReminderScheduleNotificationResult | null {
  switch (input.scenario) {
    case "empty":
      return success({
        ...payloadFor({
          generationMethod: "live-store-query",
          graph: input.graph,
          provider: input.provider,
          request: input.request,
          sourceLabel: input.provider.sourceLabel,
        }),
        groupedLowPriorityReminders: [],
        notificationQueue: [],
        reminders: [],
        state: "empty",
        summary: "The live reminder notification store returned no rows.",
      });
    case "pending":
      return success({
        ...payloadFor({
          generationMethod: "live-store-query",
          graph: input.graph,
          provider: input.provider,
          request: input.request,
          sourceLabel: input.provider.sourceLabel,
        }),
        groupedLowPriorityReminders: [],
        notificationQueue: [],
        reminders: [],
        state: "pending",
        summary:
          "The live reminder notification store is waiting for source review.",
      });
    case "failure":
      return failure("REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED", {
        collectedAt: input.graph.generatedAt,
        provider: input.provider,
        readExecuted: true,
        sourceLabel: "Live reminder notification controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

async function graphOrFailure(
  provider: LiveReminderScheduleNotificationProvider | null,
): Promise<LiveReminderNotificationGraph | ReminderScheduleNotificationFailure> {
  if (!provider) {
    return failure("REMINDER_SCHEDULE_NOTIFICATION_LIVE_STORE_UNCONFIGURED", {
      provider,
      readExecuted: false,
      sourceLabel: "Reminder notification live store is not configured",
    });
  }

  return provider.readReminderNotificationGraph();
}

function isFailure(
  value: LiveReminderNotificationGraph | ReminderScheduleNotificationFailure,
): value is ReminderScheduleNotificationFailure {
  return "success" in value && value.success === false;
}

export function createLiveReminderScheduleNotificationService({
  provider = null,
}: LiveReminderScheduleNotificationServiceOptions = {}): ReminderScheduleNotificationService {
  return {
    async listNotifications(
      input: ReminderScheduleNotificationListInput = {},
    ): Promise<ReminderScheduleNotificationResult> {
      const graph = await graphOrFailure(provider);

      if (isFailure(graph)) {
        return graph;
      }

      const liveProvider = provider as LiveReminderScheduleNotificationProvider;
      const scenario = scenarioResult({
        graph,
        provider: liveProvider,
        request: input,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor({
          generationMethod: "live-store-query",
          graph,
          provider: liveProvider,
          request: input,
          sourceLabel: liveProvider.sourceLabel,
        }),
      );
    },

    async generateReminders(
      input: ReminderScheduleNotificationGenerateInput = {},
    ): Promise<ReminderScheduleNotificationResult> {
      const graph = await graphOrFailure(provider);

      if (isFailure(graph)) {
        return graph;
      }

      const liveProvider = provider as LiveReminderScheduleNotificationProvider;
      const scenario = scenarioResult({
        graph,
        provider: liveProvider,
        request: input,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      return success(
        payloadFor({
          generationMethod: "live-reminder-schedule",
          graph,
          provider: liveProvider,
          request: input,
          sourceLabel: "Live reminder schedule generation",
        }),
      );
    },
  };
}
