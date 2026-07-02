import type {
  FollowupTask,
  FollowupTaskGenerationResult,
  FollowupTaskPriority,
  FollowupTaskTriggerKind,
} from "../../../../../features/followups/contract";
import type { FollowupTaskGenerationServiceResult } from "../../../../../features/followups/service";
import type {
  MessageDraft,
  MessageDraftChannel,
  MessageDraftGeneratorResult,
  MessageDraftStatus,
} from "../../../../../features/followups/message-draft-contract";
import type {
  NotificationQueueChannel,
  NotificationQueueEntry,
  NotificationQueueStatus,
  ReminderPriority,
  ReminderScheduleNotificationPayload,
  ReminderScheduleNotificationResult,
  ScheduledReminder,
} from "../../../../../features/notifications/contract";
import type { ReminderScheduleNotificationServiceResult } from "../../../../../features/notifications/service";
import { createAppFollowupsRouteServices } from "./followups-service-factory";

export type AppFollowupsSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppFollowupsRouteScenario = "empty" | "pending" | "failure";

type RouteStateResult =
  | FollowupTaskGenerationResult
  | MessageDraftGeneratorResult
  | ReminderScheduleNotificationResult;
type RouteStateSuccess = Extract<RouteStateResult, { success: true }>;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

export interface AppFollowupsRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppFollowupsRouteScenario;
}

export interface AppFollowupsLedgerViewModel {
  draftCount: number;
  dueTodayCount: number;
  reminderCount: number;
  taskCount: number;
}

export interface AppFollowupsPriorityViewModel {
  contactName: string;
  draftReadiness: string;
  dueSentence: string;
  organization: string;
  rationale: string;
  recommendedAction: string;
  sourceLabel: string;
  title: string;
  triggerKindLabel: string;
}

export interface AppFollowupsWorkflowCardViewModel {
  body: string;
  due: string;
  evidenceIds: readonly string[];
  id: string;
  recordIds: readonly string[];
  relationship: string;
  reviewStatus: string;
  sourceContext: string;
  stepLabel: string;
  title: string;
}

export interface AppFollowupsQueueEntryViewModel {
  ariaLabel: string;
  body: string;
  channelLabel: string;
  evidenceIds: readonly string[];
  id: string;
  reason: string;
  recordIds: readonly string[];
  reviewStatus: string;
  statusLabel: string;
  title: string;
}

export interface AppFollowupsReminderQueueViewModel {
  entries: readonly AppFollowupsQueueEntryViewModel[];
  evidenceIds: readonly string[];
}

export interface AppFollowupsActionResultViewModel {
  draftSubject: string;
  draftWindow: string;
  evidenceIds: readonly string[];
  messageSent: boolean;
  notificationDelivered: boolean;
  reminderDueLabel: string;
  reminderTitle: string;
  schedulerChanged: boolean;
  selectedTitle: string;
  state: "success" | "empty";
}

export interface AppFollowupsSuccessViewModel {
  actionResult: AppFollowupsActionResultViewModel | null;
  ledger: AppFollowupsLedgerViewModel;
  priority: AppFollowupsPriorityViewModel | null;
  reminderQueue: AppFollowupsReminderQueueViewModel;
  workflowCards: readonly AppFollowupsWorkflowCardViewModel[];
}

export type AppFollowupsRouteViewModel =
  | {
      state: "route-state";
      routeState: AppFollowupsRouteStateViewModel;
    }
  | {
      state: "success";
      workspace: AppFollowupsSuccessViewModel;
    };

function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

function readSearchParam(
  searchParams: AppFollowupsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppFollowupsSearchParams | undefined,
): AppFollowupsRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function isRouteStateSuccess(result: RouteStateResult): result is RouteStateSuccess {
  return result.success === true;
}

function isRouteStateFailure(result: RouteStateResult): result is RouteStateFailure {
  return result.success === false;
}

function evidenceIdsForResult(result: RouteStateResult): readonly string[] {
  if (isRouteStateSuccess(result)) {
    return result.data.provenance.evidenceIds;
  }

  if (isRouteStateFailure(result)) {
    return result.error.evidenceIds;
  }

  return [];
}

async function resolveFollowupTaskGenerationResult(
  result: FollowupTaskGenerationServiceResult<FollowupTaskGenerationResult>,
): Promise<FollowupTaskGenerationResult> {
  return await result;
}

async function resolveReminderScheduleNotificationResult(
  result: ReminderScheduleNotificationServiceResult<ReminderScheduleNotificationResult>,
): Promise<ReminderScheduleNotificationResult> {
  return await result;
}

function uniqueEvidenceIds(results: readonly RouteStateResult[]): string[] {
  return Array.from(
    new Set(results.flatMap((result) => evidenceIdsForResult(result))),
  );
}

function firstFailure(results: readonly RouteStateResult[]): RouteStateFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

function priorityLabel(priority: FollowupTaskPriority | ReminderPriority): string {
  const labels: Record<FollowupTaskPriority | ReminderPriority, string> = {
    high: "High",
    low: "Low",
    normal: "Normal",
    nurture: "Nurture",
    this_week: "This week",
    today: "Today",
  };

  return labels[priority];
}

function triggerKindLabel(triggerKind: FollowupTaskTriggerKind): string {
  const labels: Record<FollowupTaskTriggerKind, string> = {
    dormant_relationship: "Dormant relationship",
    event_encounter: "Event encounter",
    new_connection: "New connection",
    promised_action: "Promised action",
  };

  return labels[triggerKind];
}

function draftReadinessLabel(draft: MessageDraft | null): string {
  if (!draft) {
    return "No draft selected";
  }

  const labels: Record<MessageDraftStatus, string> = {
    draft: "Draft awaiting review",
    held_for_review: "Held for review",
    ready_for_confirmation: "Ready for confirmation",
    revised: "Revised draft awaiting review",
  };

  return labels[draft.status];
}

function queueChannelLabel(channel: NotificationQueueChannel): string {
  const labels: Record<NotificationQueueChannel, string> = {
    email: "Email",
    in_app: "In-app",
    push: "Push",
    sms: "SMS",
  };

  return labels[channel];
}

function queueStatusLabel(status: NotificationQueueStatus): string {
  return status === "mock_grouped" ? "Grouped for review" : "Queued for review";
}

function queueReviewStatusLabel(status: NotificationQueueStatus): string {
  return status === "mock_grouped"
    ? "Grouped for local review"
    : "Held for local review";
}

function dueLabel(dueInDays: number): string {
  if (dueInDays === 0) {
    return "today";
  }

  if (dueInDays === 1) {
    return "tomorrow";
  }

  return `in ${dueInDays} days`;
}

function dueSentenceLabel(dueInDays: number): string {
  const label = dueLabel(dueInDays);

  return `Due ${label}`;
}

function queueEntryLabel(
  entry: NotificationQueueEntry,
  reminder: ScheduledReminder | null,
): string {
  const recipient = reminder?.contactName ?? "the selected relationship";

  return `${queueChannelLabel(entry.channel)} reminder for ${recipient}`;
}

function queueSourceContext(
  entry: NotificationQueueEntry,
  reminder: ScheduledReminder | null,
): string {
  const recipient = reminder?.contactName ?? "selected relationship";

  return `${recipient} ${queueChannelLabel(entry.channel).toLowerCase()} reminder hold`;
}

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\bfixtures?\b/gi, "source record"],
  [/\bmock\b/gi, "review"],
  [/\bproviders?\b/gi, "connections"],
  [/\bboundary\b/gi, "check"],
  [/\broute\b/gi, "page"],
  [/\blive\b/gi, "connected"],
  [/\bmodel calls?\b/gi, "automated calls"],
  [/\bvector\b/gi, "search"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\bdatabases?\b/gi, "saved records"],
];

function productCopy(value: string): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

const routeRecoveryActions: Record<
  AppFollowupsRouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/contacts/new",
      label: bilingualText("添加关系来源", "Add a relationship source"),
    },
    {
      href: "/app/followups",
      label: bilingualText("显示可用跟进", "Show ready follow-ups"),
    },
  ],
  failure: [
    {
      href: "/app/followups",
      label: bilingualText("重新加载跟进", "Reload follow-ups"),
    },
    {
      href: "/app/followups?scenario=pending",
      label: bilingualText("检查来源状态", "Check source status"),
    },
  ],
  pending: [
    {
      href: "/app/followups",
      label: bilingualText("返回可用跟进", "Return to ready follow-ups"),
    },
  ],
};

function stateCopy(scenario: AppFollowupsRouteScenario) {
  if (scenario === "empty") {
    return {
      description: bilingualText(
        "复核任务、草稿和提醒前，先添加有来源的关系触发点。",
        "Add a sourced relationship trigger before reviewing tasks, drafts, and reminders.",
      ),
      emptyState: bilingualText(
        "还没有关系触发点具备足够来源证据可供跟进复核。",
        "No relationship trigger has enough source evidence for follow-up review.",
      ),
      guardrail: bilingualText(
        "Orbit 不能从空关系队列创建任务、消息、提醒或保存记录。",
        "Orbit cannot create tasks, messages, reminders, or saved records from an empty relationship queue.",
      ),
      nextStep: bilingualText(
        "添加关系来源；有来源触发点存在后会显示可用跟进。",
        "Add a relationship source; ready follow-ups appear after a sourced trigger exists.",
      ),
      purpose: bilingualText(
        "没有有来源的关系动作时，仍让跟进复核保持可用。",
        "Keep follow-up review useful when no sourced relationship action is available.",
      ),
      title: bilingualText("没有可用跟进", "No follow-ups are ready"),
    };
  }

  if (scenario === "pending") {
    return {
      description: bilingualText(
        "来源证据准备好之前，任务、草稿和提醒复核会保持暂停。",
        "Task, draft, and reminder review stays paused until source evidence is ready.",
      ),
      emptyState: bilingualText(
        "来源证据仍在检查时，跟进记录保持隐藏。",
        "Follow-up records stay hidden while source evidence is still being checked.",
      ),
      guardrail: bilingualText(
        "复核等待期间，Orbit 不会保存记录、安排提醒、发送消息或投递通知。",
        "Orbit will not save records, schedule reminders, send messages, or deliver notifications while review is pending.",
      ),
      nextStep: bilingualText(
        "来源证据可用后返回可用跟进。",
        "Return to ready follow-ups after source evidence is available.",
      ),
      purpose: bilingualText(
        "保持跟进工作可见，但不暴露未完成建议。",
        "Keep follow-up work visible without exposing an unfinished recommendation.",
      ),
      title: bilingualText(
        "跟进仍在检查来源证据",
        "Follow-ups are still checking source evidence",
      ),
    };
  }

  return {
    description: bilingualText(
      "来源证据检查期间，跟进任务、草稿和提醒暂不可用。",
      "Follow-up tasks, drafts, and reminders are unavailable while source evidence is checked.",
    ),
    emptyState: bilingualText(
      "来源证据恢复前，跟进复核不可用。",
      "The follow-up review is unavailable until source evidence recovers.",
    ),
    guardrail: bilingualText(
      "不可用期间，Orbit 不会保存记录、安排提醒、发送消息或投递通知。",
      "Orbit will not save records, schedule reminders, send messages, or deliver notifications while this is unavailable.",
    ),
    nextStep: bilingualText(
      "采取动作前重新加载跟进。",
      "Reload follow-ups before taking action.",
    ),
    purpose: bilingualText(
      "有来源的跟进上下文不可用时，显示可见恢复路径。",
      "Show a visible recovery path when source-backed follow-up context is unavailable.",
    ),
    title: bilingualText("跟进无法加载", "Follow-ups could not load"),
  };
}

function routeStateViewModel(input: {
  results?: readonly RouteStateResult[];
  scenario: AppFollowupsRouteScenario;
}): AppFollowupsRouteStateViewModel {
  const results = input.results ?? [];
  const failure = firstFailure(results);

  return {
    copy: stateCopy(input.scenario),
    errorCode: failure?.success === false ? failure.error.code : null,
    evidenceIds: uniqueEvidenceIds(results),
    recoveryActions: routeRecoveryActions[input.scenario],
    scenario: input.scenario,
  };
}

function priorityViewModel(
  task: FollowupTask | null,
  draft: MessageDraft | null,
): AppFollowupsPriorityViewModel | null {
  if (!task) {
    return null;
  }

  return {
    contactName: task.contactName,
    draftReadiness: draftReadinessLabel(draft),
    dueSentence: dueSentenceLabel(task.dueInDays),
    organization: task.organization,
    rationale: task.rationale,
    recommendedAction: task.recommendedAction,
    sourceLabel: task.source.label,
    title: task.title,
    triggerKindLabel: triggerKindLabel(task.triggerKind),
  };
}

function actionResultViewModel(
  task: FollowupTask | null,
  draft: MessageDraft | null,
  notifications: ReminderScheduleNotificationPayload,
): AppFollowupsActionResultViewModel {
  if (!task) {
    return {
      draftSubject: "",
      draftWindow: "",
      evidenceIds: [],
      messageSent: false,
      notificationDelivered: false,
      reminderDueLabel: "",
      reminderTitle: "",
      schedulerChanged: false,
      selectedTitle: "",
      state: "empty",
    };
  }

  const topReminder = notifications.reminders[0] ?? null;
  const messageSent = Boolean(
    draft?.externalSendRequested ||
      draft?.emailProviderRequested ||
      draft?.externalNetworkRequested,
  );
  const schedulerChanged = Boolean(
    task.backgroundSchedulerRequested ||
      topReminder?.cronJobRequested ||
      topReminder?.liveDatabaseWriteExecuted,
  );
  const notificationDelivered = Boolean(
    task.notificationDelivered ||
      draft?.notificationDelivered ||
      topReminder?.pushNotificationRequested ||
      topReminder?.emailDeliveryRequested ||
      topReminder?.smsDeliveryRequested,
  );

  return {
    draftSubject: draft?.subject ?? bilingualText("未选择草稿", "No draft selected"),
    draftWindow: draft?.recommendedSendWindow ?? bilingualText("无发送窗口", "no send window"),
    evidenceIds: task.evidenceIds,
    messageSent,
    notificationDelivered,
    reminderDueLabel: topReminder
      ? bilingualText(`到期 ${dueLabel(topReminder.dueInDays)}`, `due ${dueLabel(topReminder.dueInDays)}`)
      : bilingualText("未定时", "not timed"),
    reminderTitle:
      topReminder?.title ?? bilingualText("未选择提醒", "No reminder selected"),
    schedulerChanged,
    selectedTitle: task.title,
    state: "success",
  };
}

function workflowCardsViewModel(input: {
  draft: MessageDraft | null;
  notifications: ReminderScheduleNotificationPayload;
  task: FollowupTask | null;
}): AppFollowupsWorkflowCardViewModel[] {
  const reminder = input.notifications.reminders[0] ?? null;
  const queueEntry = input.notifications.notificationQueue[0] ?? null;
  const cards: AppFollowupsWorkflowCardViewModel[] = [];

  if (input.task) {
    cards.push({
      body: input.task.recommendedAction,
      due: dueSentenceLabel(input.task.dueInDays),
      evidenceIds: input.task.evidenceIds,
      id: input.task.taskId,
      recordIds: [],
      relationship: `${input.task.contactName} · ${input.task.organization}`,
      reviewStatus: bilingualText("本地复核暂缓", "Held for local review"),
      sourceContext: input.task.source.label,
      stepLabel: bilingualText("待判断任务", "Task to decide"),
      title: input.task.title,
    });
  }

  if (input.draft) {
    cards.push({
      body: input.draft.body,
      due: input.draft.recommendedSendWindow,
      evidenceIds: input.draft.evidenceIds,
      id: input.draft.draftId,
      recordIds: [],
      relationship: `${input.draft.recipientName} · ${input.draft.organization}`,
      reviewStatus: draftReadinessLabel(input.draft),
      sourceContext: input.draft.relationshipContext,
      stepLabel: bilingualText("待复核消息草稿", "Message draft to review"),
      title: input.draft.subject,
    });
  }

  if (reminder) {
    cards.push({
      body: reminder.recommendedWindow,
      due: dueSentenceLabel(reminder.dueInDays),
      evidenceIds: reminder.evidenceIds,
      id: reminder.reminderId,
      recordIds: [],
      relationship: `${reminder.contactName} · ${reminder.organization}`,
      reviewStatus: bilingualText("本地复核暂缓", "Held for local review"),
      sourceContext: reminder.source.label,
      stepLabel: bilingualText("保持可见的提醒", "Reminder to keep visible"),
      title: reminder.title,
    });
  }

  if (queueEntry) {
    cards.push({
      body: bilingualText(
        "承诺和消息复核完成前，发送会保持暂存。",
        "Delivery stays staged until the promise and message are reviewed.",
      ),
      due: reminder
        ? dueSentenceLabel(reminder.dueInDays)
        : bilingualText("未定时", "Not timed"),
      evidenceIds: queueEntry.evidenceIds,
      id: queueEntry.queueEntryId,
      recordIds: [queueEntry.queueEntryId],
      relationship: reminder
        ? `${reminder.contactName} · ${reminder.organization}`
        : bilingualText("已选择关系", "Selected relationship"),
      reviewStatus: queueReviewStatusLabel(queueEntry.status),
      sourceContext: queueSourceContext(queueEntry, reminder),
      stepLabel: bilingualText(
        "发送前队列暂缓",
        "Queue hold before delivery",
      ),
      title: queueEntryLabel(queueEntry, reminder),
    });
  }

  return cards;
}

function reminderQueueViewModel(
  notifications: ReminderScheduleNotificationPayload,
): AppFollowupsReminderQueueViewModel {
  return {
    entries: notifications.notificationQueue.slice(0, 4).map((entry) => {
      const reminder =
        notifications.reminders.find((scheduledReminder) =>
          entry.reminderIds.includes(scheduledReminder.reminderId),
        ) ?? null;

      return {
        ariaLabel: `Reminder queue entry for ${reminder?.contactName ?? entry.channel}`,
        body: bilingualText(
          `${queueSourceContext(entry, reminder)} 会留在承诺流程中等待复核。`,
          `${queueSourceContext(entry, reminder)} stays with the promise workflow for review.`,
        ),
        channelLabel: queueChannelLabel(entry.channel),
        evidenceIds: entry.evidenceIds,
        id: entry.queueEntryId,
        reason: productCopy(entry.reason),
        recordIds: [entry.queueEntryId],
        reviewStatus: queueReviewStatusLabel(entry.status),
        statusLabel: queueStatusLabel(entry.status),
        title: queueEntryLabel(entry, reminder),
      };
    }),
    evidenceIds: notifications.provenance.evidenceIds,
  };
}

function successViewModel(input: {
  action: string | null;
  draft: MessageDraft | null;
  notifications: ReminderScheduleNotificationPayload;
  task: FollowupTask | null;
  taskResult: RouteStateSuccess & { data: { tasks: readonly FollowupTask[] } };
  draftResult: RouteStateSuccess & { data: { drafts: readonly MessageDraft[] } };
}): AppFollowupsSuccessViewModel {
  const actionRequested = input.action === "complete-top-followup";

  return {
    actionResult: actionRequested
      ? actionResultViewModel(input.task, input.draft, input.notifications)
      : null,
    ledger: {
      draftCount: input.draftResult.data.drafts.length,
      dueTodayCount: input.notifications.reminders.filter(
        (reminder) => reminder.dueInDays === 0,
      ).length,
      reminderCount: input.notifications.reminders.length,
      taskCount: input.taskResult.data.tasks.length,
    },
    priority: priorityViewModel(input.task, input.draft),
    reminderQueue: reminderQueueViewModel(input.notifications),
    workflowCards: workflowCardsViewModel({
      draft: input.draft,
      notifications: input.notifications,
      task: input.task,
    }),
  };
}

export async function loadAppFollowupsRouteViewModel(
  searchParams?: AppFollowupsSearchParams,
): Promise<AppFollowupsRouteViewModel> {
  const services = createAppFollowupsRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    const taskResult = await resolveFollowupTaskGenerationResult(
      services.taskService.listTasks({ scenario: requestedScenario }),
    );
    const draftResult = services.draftService.createDraft({
      scenario: requestedScenario,
    });
    const notificationResult = await resolveReminderScheduleNotificationResult(
      services.notificationService.listNotifications({
        scenario: requestedScenario,
      }),
    );

    return {
      routeState: routeStateViewModel({
        results: [taskResult, draftResult, notificationResult],
        scenario: requestedScenario,
      }),
      state: "route-state",
    };
  }

  const taskResult = await resolveFollowupTaskGenerationResult(
    services.taskService.listTasks(),
  );

  if (taskResult.success === false) {
    return {
      routeState: routeStateViewModel({
        results: [taskResult],
        scenario: "failure",
      }),
      state: "route-state",
    };
  }

  const topTask = taskResult.data.tasks[0] ?? null;
  const draftResult = services.draftService.createDraft({
    contextNote: topTask?.recommendedAction,
    draftKind: "follow_up",
    organization: topTask?.organization,
    recipientName: topTask?.contactName,
  });
  const notificationResult = await resolveReminderScheduleNotificationResult(
    services.notificationService.listNotifications({
      limit: 4,
    }),
  );

  if (draftResult.success === false || notificationResult.success === false) {
    return {
      routeState: routeStateViewModel({
        results: [taskResult, draftResult, notificationResult],
        scenario: "failure",
      }),
      state: "route-state",
    };
  }

  return {
    state: "success",
    workspace: successViewModel({
      action: readSearchParam(searchParams, "action"),
      draft: draftResult.data.drafts[0] ?? null,
      draftResult,
      notifications: notificationResult.data,
      task: topTask,
      taskResult,
    }),
  };
}
