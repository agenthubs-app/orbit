import type {
  AgentActionDecisionResult,
  AgentActionQueueItem,
  AgentActionQueueResult,
} from "../../../../../features/agent/contract";
import type { AgentActionQueueServiceResult } from "../../../../../features/agent/service";
import type {
  AgentAutonomySettingsResult,
} from "../../../../../features/agent/settings-contract";
import type {
  ExternalActionAuditResult,
} from "../../../../../features/agent/external-action-contract";
import type {
  NotificationQueueEntry,
  ReminderScheduleNotificationResult,
} from "../../../../../features/notifications/contract";
import type { ReminderScheduleNotificationServiceResult } from "../../../../../features/notifications/service";
import type {
  ConfirmationRequirementResult,
} from "../../../../../features/permissions/confirmation-contract";
import { createAppAgentRouteServices } from "./agent-service-factory";

export type AppAgentSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppAgentRouteScenario = "empty" | "pending" | "failure";

type RouteStateResult =
  | AgentActionQueueResult
  | AgentAutonomySettingsResult
  | ConfirmationRequirementResult
  | ExternalActionAuditResult
  | ReminderScheduleNotificationResult;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

export interface AppAgentEvidenceViewModel {
  id: string;
  label: string;
}

export interface AppAgentRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidence: readonly AppAgentEvidenceViewModel[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppAgentRouteScenario;
}

export interface AppAgentActionViewModel {
  contactName: string;
  dueLabel: string;
  evidence: readonly AppAgentEvidenceViewModel[];
  organization: string;
  priorityLabel: string;
  reason: string;
  recommendedAction: string;
  title: string;
}

export interface AppAgentSettingsViewModel {
  label: string;
  reviewControl: string;
}

export interface AppAgentConfirmationViewModel {
  evidence: readonly AppAgentEvidenceViewModel[];
  guardReason: string;
  label: string;
  question: string;
  summary: string;
  targetLabel: string;
}

export interface AppAgentSandboxViewModel {
  evidence: readonly AppAgentEvidenceViewModel[];
  followupRationale: string;
  requestedEffect: string;
  targetLabel: string;
}

export interface AppAgentNotificationViewModel {
  channelLabel: string;
  evidence: readonly AppAgentEvidenceViewModel[];
  queueEntryId: string;
  scheduledFor: string;
  title: string;
}

export interface AppAgentActionResultViewModel {
  reviewedActionTitle: string;
  stopped: boolean;
}

export interface AppAgentWorkspaceViewModel {
  action: AppAgentActionViewModel;
  actionResult: AppAgentActionResultViewModel | null;
  confirmation: AppAgentConfirmationViewModel;
  ledger: {
    actionCount: number;
    confirmationCount: number;
    notificationCount: number;
    settingsLevel: string;
  };
  notification: AppAgentNotificationViewModel;
  sandbox: AppAgentSandboxViewModel;
  settings: AppAgentSettingsViewModel;
}

export type AppAgentRouteViewModel =
  | {
      state: "success";
      workspace: AppAgentWorkspaceViewModel;
    }
  | {
      state: "route-state";
      routeState: AppAgentRouteStateViewModel;
    };

function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

function readSearchParam(
  searchParams: AppAgentSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppAgentSearchParams | undefined,
): AppAgentRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function isRouteStateFailure(result: RouteStateResult): result is RouteStateFailure {
  return result.success === false;
}

function evidenceIdsForResult(result: RouteStateResult): readonly string[] {
  if (result.success === true) {
    return result.data.provenance.evidenceIds;
  }

  return result.error.evidenceIds;
}

function firstFailure(results: readonly RouteStateResult[]): RouteStateFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

async function resolveAgentActionResult<TResult>(
  result: AgentActionQueueServiceResult<TResult>,
): Promise<TResult> {
  return await result;
}

async function resolveReminderScheduleNotificationResult(
  result: ReminderScheduleNotificationServiceResult<ReminderScheduleNotificationResult>,
): Promise<ReminderScheduleNotificationResult> {
  return await result;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function labelFromIdentifier(identifier: string): string {
  return titleCase(
    identifier
      .split(":")
      .slice(1)
      .join(" ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function evidenceLabel(evidenceId: string): string {
  const label = labelFromIdentifier(evidenceId);

  return label ? `${label} evidence` : "Relationship evidence";
}

function evidenceViewModels(evidenceIds: readonly string[]): AppAgentEvidenceViewModel[] {
  return Array.from(new Set(evidenceIds)).map((id) => ({
    id,
    label: evidenceLabel(id),
  }));
}

function priorityLabel(priority: AgentActionQueueItem["priority"]): string {
  const labels: Record<AgentActionQueueItem["priority"], string> = {
    high: "High",
    low: "Low",
    medium: "Medium",
  };

  return labels[priority];
}

function channelLabel(channel: NotificationQueueEntry["channel"]): string {
  const labels: Record<NotificationQueueEntry["channel"], string> = {
    email: "Email",
    in_app: "In-app",
    push: "Push",
    sms: "SMS",
  };

  return labels[channel];
}

function notificationQueueLabel(queueEntry: NotificationQueueEntry): string {
  const reminderLabel = queueEntry.reminderIds[0]
    ? labelFromIdentifier(queueEntry.reminderIds[0])
    : labelFromIdentifier(queueEntry.queueEntryId);

  return reminderLabel ? `${reminderLabel} reminder` : "Queued reminder";
}

function userReviewControlCopy(operatorControl: string): string {
  return operatorControl
    .replace(/^The operator reviews\b/i, "You review")
    .replace(/\bconfirms\b/g, "confirm")
    .replace(/\bthe operator\b/gi, "you")
    .replace(/\boperator\b/gi, "user");
}

function stateCopy(scenario: AppAgentRouteScenario) {
  if (scenario === "empty") {
    return {
      description: bilingualText(
        "先添加有来源的关系线索，再复核 Agent 动作、自主设置、确认、沙盒检查和通知队列。",
        "Add a sourced relationship cue before reviewing agent actions, autonomy settings, confirmations, sandbox checks, and notification queues.",
      ),
      emptyState: bilingualText(
        "还没有 Agent 动作具备足够关系上下文可供复核。",
        "No agent action has enough relationship context for review.",
      ),
      guardrail: bilingualText(
        "空关系集合不能准备发送检查、审批步骤或提醒队列。",
        "Orbit cannot prepare a send check, approval step, or reminder queue from an empty relationship set.",
      ),
      nextStep: bilingualText(
        "联系人、活动、跟进或提醒存在后再返回。",
        "Return after a contact, event, follow-up, or reminder exists.",
      ),
      purpose: bilingualText(
        "没有有来源的关系动作时，仍保持 Agent 复核可理解。",
        "Keep agent review useful when no sourced relationship action is available.",
      ),
      title: bilingualText("没有可复核的 Agent 动作", "No agent actions are ready"),
    };
  }

  if (scenario === "pending") {
    return {
      description: bilingualText(
        "确认、来源证据和发送限制仍在检查时，Agent 工作会保持暂停。",
        "Agent work stays paused while confirmations, source evidence, and delivery limits are checked.",
      ),
      emptyState: bilingualText(
        "确认复核准备好之前，Agent 动作保持隐藏。",
        "Agent actions stay hidden until the confirmation review is ready.",
      ),
      guardrail: bilingualText(
        "复核等待期间，Orbit 不会发送消息、修改日历、发送提醒或保存关系更新。",
        "Orbit will not send messages, change calendars, deliver reminders, or save relationship updates while review is pending.",
      ),
      nextStep: bilingualText(
        "复核可用后返回可用 Agent 工作区。",
        "Return to the ready agent workspace after review is available.",
      ),
      purpose: bilingualText(
        "保持待处理 Agent 工作可见，但不暴露未完成的关系建议。",
        "Keep pending agent work visible without exposing unfinished relationship guidance.",
      ),
      title: bilingualText(
        "Agent 复核正在等待确认",
        "Agent review is waiting for confirmation",
      ),
    };
  }

  return {
    description: bilingualText(
      "来源证据检查期间，Agent 动作、设置、确认、沙盒检查和通知队列暂不可用。",
      "Agent actions, settings, confirmations, sandbox checks, and notification queue entries are unavailable while source evidence is checked.",
    ),
    emptyState: bilingualText(
      "来源证据恢复前，Agent 工作区不可用。",
      "The agent workspace is unavailable until source evidence recovers.",
    ),
    guardrail: bilingualText(
      "不可用期间，Orbit 不会发送消息、修改日历、发送提醒或保存关系更新。",
      "Orbit will not send messages, change calendars, deliver reminders, or save relationship updates while this is unavailable.",
    ),
    nextStep: bilingualText(
      "采取动作前重新加载 Agent 工作区。",
      "Reload the agent workspace before taking action.",
    ),
    purpose: bilingualText(
      "Agent 复核上下文不可用时，显示可见恢复路径。",
      "Show a visible recovery path when agent review context is unavailable.",
    ),
    title: bilingualText("Agent 工作区无法加载", "Agent workspace could not load"),
  };
}

function routeRecoveryActions(
  scenario: AppAgentRouteScenario,
): readonly { href: string; label: string }[] {
  if (scenario === "empty") {
    return [
      {
        href: "/app/agent",
        label: bilingualText("显示可用 Agent 工作区", "Show ready agent workspace"),
      },
      {
        href: "/app/agent?action=review-top-agent-action",
        label: bilingualText("预览 Agent 复核", "Preview agent review"),
      },
    ];
  }

  if (scenario === "pending") {
    return [
      {
        href: "/app/agent",
        label: bilingualText(
          "返回可用 Agent 工作区",
          "Return to ready agent workspace",
        ),
      },
    ];
  }

  return [
    {
      href: "/app/agent",
      label: bilingualText("重新加载 Agent 工作区", "Reload agent workspace"),
    },
    {
      href: "/app/agent?scenario=pending",
      label: bilingualText("检查复核状态", "Check review status"),
    },
  ];
}

async function loadRouteStateViewModel(
  scenario: AppAgentRouteScenario,
): Promise<AppAgentRouteStateViewModel> {
  const services = createAppAgentRouteServices();
  const results = await Promise.all([
    resolveAgentActionResult<AgentActionQueueResult>(
      services.agentActionService.listActions({ scenario }),
    ),
    services.settingsService.getSettings({ scenario }),
    services.confirmationService.listConfirmationRequirements({ scenario }),
    services.sandboxService.listAuditRecords({ scenario }),
    resolveReminderScheduleNotificationResult(
      services.notificationService.listNotifications({ scenario }),
    ),
  ]);
  const failure = firstFailure(results);

  return {
    copy: stateCopy(scenario),
    errorCode: failure?.success === false ? failure.error.code : null,
    evidence: evidenceViewModels(
      results.flatMap((result) => evidenceIdsForResult(result)),
    ),
    recoveryActions: routeRecoveryActions(scenario),
    scenario,
  };
}

export async function loadAppAgentRouteViewModel(
  searchParams?: AppAgentSearchParams,
): Promise<AppAgentRouteViewModel> {
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return {
      state: "route-state",
      routeState: await loadRouteStateViewModel(requestedScenario),
    };
  }

  const services = createAppAgentRouteServices();
  const actionsResult = await resolveAgentActionResult<AgentActionQueueResult>(
    services.agentActionService.listActions(),
  );
  const settingsResult = services.settingsService.getSettings();
  const confirmationResult =
    services.confirmationService.listConfirmationRequirements();
  const sandboxAuditResult = services.sandboxService.listAuditRecords();
  const notificationResult = await resolveReminderScheduleNotificationResult(
    services.notificationService.listNotifications(),
  );

  if (
    actionsResult.success === false ||
    settingsResult.success === false ||
    confirmationResult.success === false ||
    sandboxAuditResult.success === false ||
    notificationResult.success === false
  ) {
    return {
      state: "route-state",
      routeState: await loadRouteStateViewModel("failure"),
    };
  }

  const selectedAction =
    actionsResult.data.actions.find(
      (action) => action.contactName === "Maya Chen",
    ) ?? actionsResult.data.actions[0];
  const selectedSetting =
    settingsResult.data.levels.find(
      (level) => level.level === settingsResult.data.currentLevel,
    ) ?? settingsResult.data.levels[0];
  const selectedConfirmation =
    confirmationResult.data.requirements.find(
      (requirement) => requirement.action.kind === "send-message",
    ) ?? confirmationResult.data.requirements[0];
  const selectedSandboxAction =
    sandboxAuditResult.data.actions.find(
      (action) => action.actionType === "send_message",
    ) ?? sandboxAuditResult.data.actions[0];
  const selectedQueueEntry = notificationResult.data.notificationQueue[0];

  if (
    !selectedAction ||
    !selectedSetting ||
    !selectedConfirmation ||
    !selectedSandboxAction ||
    !selectedQueueEntry
  ) {
    return {
      state: "route-state",
      routeState: await loadRouteStateViewModel("empty"),
    };
  }

  const shouldPreviewAction =
    readSearchParam(searchParams, "action") === "review-top-agent-action";
  const agentDecision = shouldPreviewAction
    ? await resolveAgentActionResult<AgentActionDecisionResult>(
        services.agentActionService.acceptAction({
          actionId: selectedAction.actionId,
          actorLabel: "Orbit user",
        }),
      )
    : null;
  const sandboxResult = shouldPreviewAction
    ? services.sandboxService.sendMessage({
        actionId: selectedSandboxAction.actionId,
        actorLabel: "Orbit user",
        targetLabel: selectedAction.contactName,
      })
    : null;

  return {
    state: "success",
    workspace: {
      action: {
        contactName: selectedAction.contactName,
        dueLabel: selectedAction.dueLabel,
        evidence: evidenceViewModels(selectedAction.evidenceIds),
        organization: selectedAction.organization,
        priorityLabel: priorityLabel(selectedAction.priority),
        reason: selectedAction.reason,
        recommendedAction: selectedAction.recommendedAction,
        title: selectedAction.title,
      },
      actionResult:
        agentDecision && sandboxResult
          ? {
              reviewedActionTitle: selectedAction.title,
              stopped:
                agentDecision.success === false || sandboxResult.success === false,
            }
          : null,
      confirmation: {
        evidence: evidenceViewModels(
          selectedConfirmation.evidence.map((item) => item.evidenceId),
        ),
        guardReason: selectedConfirmation.guardReason,
        label: selectedConfirmation.action.label,
        question: selectedConfirmation.confirmationQuestion,
        summary: selectedConfirmation.action.summary,
        targetLabel: selectedConfirmation.action.targetLabel,
      },
      ledger: {
        actionCount: actionsResult.data.actions.length,
        confirmationCount: confirmationResult.data.requirements.length,
        notificationCount: notificationResult.data.notificationQueue.length,
        settingsLevel: selectedSetting.label,
      },
      notification: {
        channelLabel: channelLabel(selectedQueueEntry.channel),
        evidence: evidenceViewModels(selectedQueueEntry.evidenceIds),
        queueEntryId: selectedQueueEntry.queueEntryId,
        scheduledFor: selectedQueueEntry.scheduledFor,
        title: notificationQueueLabel(selectedQueueEntry),
      },
      sandbox: {
        evidence: evidenceViewModels(selectedSandboxAction.evidenceIds),
        followupRationale:
          selectedSandboxAction.relationshipContext.followupRationale,
        requestedEffect: selectedSandboxAction.requestedEffect,
        targetLabel: selectedSandboxAction.targetLabel,
      },
      settings: {
        label: selectedSetting.label,
        reviewControl: userReviewControlCopy(selectedSetting.operatorControl),
      },
    },
  };
}
