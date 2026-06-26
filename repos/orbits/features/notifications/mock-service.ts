import {
  REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS,
  type GroupedLowPriorityReminder,
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
  type ScheduledReminder,
} from "./contract";
import {
  mockEmptyReminderScheduleNotificationFixture,
  mockGroupedLowPriorityReminders,
  mockNotificationQueueEntries,
  mockPendingReminderScheduleNotificationFixture,
  mockReminderFrequencies,
  mockReminderScheduleNotificationFailureProvenance,
  mockReminderScheduleNotificationFixture,
  mockReminderScheduleNotificationProvenance,
  mockScheduledReminders,
} from "./fixtures";
import type { ReminderScheduleNotificationService } from "./service";

const supportedScenarios = new Set<ReminderScheduleNotificationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const reminderPriorities = new Set<ReminderPriority>([
  "high",
  "normal",
  "low",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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
): ReminderScheduleNotificationFailure {
  const definition = REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockReminderScheduleNotificationFailureProvenance,
      evidenceIds:
        mockReminderScheduleNotificationFailureProvenance.evidenceIds,
    },
  };
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

function isFrequency(value: unknown): value is ReminderFrequency {
  return (
    typeof value === "string" &&
    mockReminderFrequencies.includes(value as ReminderFrequency)
  );
}

function isPriority(value: unknown): value is ReminderPriority {
  return typeof value === "string" && reminderPriorities.has(value as ReminderPriority);
}

function frequenciesForInput(
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
): readonly ReminderFrequency[] | null {
  if ("frequencies" in input && Array.isArray(input.frequencies)) {
    const frequencies = input.frequencies.filter(isFrequency);

    return frequencies.length > 0 ? frequencies : null;
  }

  if ("frequency" in input && isFrequency(input.frequency)) {
    return [input.frequency];
  }

  return null;
}

function selectedReminders(
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
): readonly ScheduledReminder[] {
  const frequencies = frequenciesForInput(input);
  const limit = normalizedLimit(input.limit);
  const dueWithinDays =
    "dueWithinDays" in input
      ? normalizedDueWithinDays(input.dueWithinDays)
      : null;
  const includeGroupedLowPriority =
    !("includeGroupedLowPriority" in input) ||
    input.includeGroupedLowPriority !== false;
  const priority =
    "priority" in input && isPriority(input.priority) ? input.priority : null;
  const reminders = mockScheduledReminders.filter((reminder) => {
    const matchesFrequency =
      !frequencies || frequencies.includes(reminder.frequency);
    const matchesPriority = !priority || reminder.priority === priority;
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

  if (limit === null) {
    return reminders;
  }

  return reminders.slice(0, limit);
}

function uniqueEvidenceIds(reminders: readonly ScheduledReminder[]): readonly string[] {
  if (reminders.length === 0) {
    return ["evidence:notification-empty"];
  }

  return [...new Set(reminders.flatMap((reminder) => reminder.evidenceIds))];
}

function selectedGroups(
  reminders: readonly ScheduledReminder[],
): readonly GroupedLowPriorityReminder[] {
  const reminderIds = new Set(reminders.map((reminder) => reminder.reminderId));

  return mockGroupedLowPriorityReminders
    .map((group) => ({
      ...group,
      reminderIds: group.reminderIds.filter((reminderId) =>
        reminderIds.has(reminderId),
      ),
      evidenceIds: group.evidenceIds.filter((evidenceId) =>
        reminders.some((reminder) => reminder.evidenceIds.includes(evidenceId)),
      ),
    }))
    .filter((group) => group.reminderIds.length > 0);
}

function selectedQueueEntries(
  reminders: readonly ScheduledReminder[],
): readonly NotificationQueueEntry[] {
  const reminderIds = new Set(reminders.map((reminder) => reminder.reminderId));

  return mockNotificationQueueEntries
    .map((queueEntry) => ({
      ...queueEntry,
      reminderIds: queueEntry.reminderIds.filter((reminderId) =>
        reminderIds.has(reminderId),
      ),
      evidenceIds: queueEntry.evidenceIds.filter((evidenceId) =>
        reminders.some((reminder) => reminder.evidenceIds.includes(evidenceId)),
      ),
    }))
    .filter((queueEntry) => queueEntry.reminderIds.length > 0);
}

function provenanceForReminders(input: {
  reminders: readonly ScheduledReminder[];
  sourceLabel: string;
  generationMethod: ReminderScheduleNotificationProvenance["generationMethod"];
}): ReminderScheduleNotificationProvenance {
  return {
    ...mockReminderScheduleNotificationProvenance,
    evidenceIds: uniqueEvidenceIds(input.reminders),
    sourceLabel: input.sourceLabel,
    generationMethod: input.generationMethod,
  };
}

function buildPayload(
  input: ReminderScheduleNotificationListInput | ReminderScheduleNotificationGenerateInput,
  sourceLabel: string,
): ReminderScheduleNotificationPayload {
  const reminders = selectedReminders(input);
  const groups = selectedGroups(reminders);
  const notificationQueue = selectedQueueEntries(reminders);
  const hasReminders = reminders.length > 0;

  return {
    ...mockReminderScheduleNotificationFixture,
    state: hasReminders ? "success" : "empty",
    reminders,
    groupedLowPriorityReminders: groups,
    notificationQueue,
    summary: hasReminders
      ? "Local reminder rules produced due-date reminders and mock notification queue entries without providers or cron jobs."
      : "The local reminder rule produced no due follow-up reminders.",
    provenance: provenanceForReminders({
      reminders,
      sourceLabel,
      generationMethod: "rule-based-reminder-schedule",
    }),
    nextAction: hasReminders
      ? "Review reminder evidence before enabling any live delivery channel."
      : "Add a sourced follow-up due date before generating notification queue entries.",
  };
}

function scenarioResult(
  scenario: ReminderScheduleNotificationScenario,
): ReminderScheduleNotificationResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyReminderScheduleNotificationFixture);
    case "pending":
      return success(mockPendingReminderScheduleNotificationFixture);
    case "failure":
      return failure("REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

export function createMockReminderScheduleNotificationService(): ReminderScheduleNotificationService {
  return {
    listNotifications(input = {}): ReminderScheduleNotificationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(buildPayload(input, "Mock notification queue list rule"));
    },

    generateReminders(input = {}): ReminderScheduleNotificationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(
        buildPayload(input, "Mock reminder schedule generation rule"),
      );
    },
  };
}

export type { ReminderScheduleNotificationResult };
