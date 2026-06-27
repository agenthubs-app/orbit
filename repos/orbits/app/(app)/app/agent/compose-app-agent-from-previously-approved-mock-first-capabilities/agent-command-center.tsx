/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import type {
  AgentActionDecisionResult,
  AgentActionQueueItem,
  AgentActionQueueResult,
} from "../../../../../features/agent/contract";
import type {
  AgentAutonomyLevelBoundary,
  AgentAutonomySettingsResult,
} from "../../../../../features/agent/settings-contract";
import type {
  ExternalActionAuditResult,
  ExternalActionNoOpResult,
  ExternalActionSandboxAction,
} from "../../../../../features/agent/external-action-contract";
import type {
  ReminderScheduleNotificationResult,
  NotificationQueueEntry,
} from "../../../../../features/notifications/contract";
import type {
  ConfirmationRequirement,
  ConfirmationRequirementResult,
} from "../../../../../features/permissions/confirmation-contract";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { createAppAgentRouteServices } from "./agent-service-factory";

const appAgentStyles = `
.app-agent-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
}

.orbit-app-shell:has(.app-agent-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-agent-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-agent-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-agent-route,
.app-agent-route .workbench-surface,
.app-agent-route .relationship-meta,
.app-agent-route .chip-row,
.app-agent-route .agent-ledger,
.app-agent-route .agent-grid,
.app-agent-route .agent-review-form,
.app-agent-route .agent-action-result,
.app-agent-route .agent-state-links {
  min-width: 0;
}

.app-agent-route .relationship-name,
.app-agent-route .type-body,
.app-agent-route .type-caption,
.app-agent-route .relationship-meta dd,
.app-agent-route .orbit-chip,
.app-agent-route .agent-action-result span,
.app-agent-route .agent-action-result strong,
.app-agent-route .agent-state-links a {
  overflow-wrap: anywhere;
}

.app-agent-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 132px), 1fr));
}

.app-agent-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-agent-route .agent-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-agent-route .agent-ledger,
.app-agent-route .agent-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.app-agent-route .agent-ledger div,
.app-agent-route .agent-card,
.app-agent-route .agent-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-agent-route .agent-ledger strong {
  display: block;
  font-size: 1.55rem;
  line-height: 1.05;
}

.app-agent-route .agent-card,
.app-agent-route .agent-review-form,
.app-agent-route .agent-action-result {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-agent-route .agent-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-agent-route .agent-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-agent-route .agent-review-form {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-agent-route .agent-review-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  max-width: 100%;
  white-space: normal;
}

.app-agent-route .agent-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-agent-route .agent-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}
`;

const routeStateChecks = [
  {
    href: "/app/agent?scenario=empty",
    label: bilingualText("没有可用动作", "No agent actions"),
  },
  {
    href: "/app/agent?scenario=pending",
    label: bilingualText("等待复核", "Waiting for review"),
  },
  {
    href: "/app/agent?scenario=failure",
    label: bilingualText("Agent 不可用", "Agent unavailable"),
  },
] as const;

type AppAgentSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";

interface AppAgentCommandCenterProps {
  searchParams?: AppAgentSearchParams;
}

type RouteStateResult =
  | AgentActionQueueResult
  | AgentAutonomySettingsResult
  | ConfirmationRequirementResult
  | ExternalActionAuditResult
  | ReminderScheduleNotificationResult;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/agent",
      label: bilingualText("显示可用 Agent 工作区", "Show ready agent workspace"),
    },
    {
      href: "/app/agent?action=review-top-agent-action",
      label: bilingualText("预览 Agent 复核", "Preview agent review"),
    },
  ],
  failure: [
    {
      href: "/app/agent",
      label: bilingualText("重新加载 Agent 工作区", "Reload agent workspace"),
    },
    {
      href: "/app/agent?scenario=pending",
      label: bilingualText("检查复核状态", "Check review status"),
    },
  ],
  pending: [
    {
      href: "/app/agent",
      label: bilingualText(
        "返回可用 Agent 工作区",
        "Return to ready agent workspace",
      ),
    },
  ],
};

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
): RouteScenario | null {
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

function uniqueEvidenceIds(results: readonly RouteStateResult[]): string[] {
  return Array.from(
    new Set(results.flatMap((result) => evidenceIdsForResult(result))),
  );
}

function firstFailure(results: readonly RouteStateResult[]): RouteStateFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/agent?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({ scenario }: { scenario: RouteScenario }) {
  return (
    <nav
      aria-label="Agent route recovery actions"
      className="agent-state-links agent-recovery-actions"
      data-side-effects="none"
    >
      {routeRecoveryActions[scenario].map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

function stateCopy(scenario: RouteScenario) {
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

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 5).map((evidenceId) => (
        <span
          className="orbit-chip orbit-chip-evidence"
          data-evidence-id={evidenceId}
          key={evidenceId}
        >
          {evidenceLabel(evidenceId)}
        </span>
      ))}
    </div>
  );
}

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const services = createAppAgentRouteServices();
  const actionResult = services.agentActionService.listActions({ scenario });
  const settingsResult = services.settingsService.getSettings({ scenario });
  const confirmationResult =
    services.confirmationService.listConfirmationRequirements({ scenario });
  const sandboxResult = services.sandboxService.listAuditRecords({ scenario });
  const notificationResult = services.notificationService.listNotifications({
    scenario,
  });
  const results = [
    actionResult,
    settingsResult,
    confirmationResult,
    sandboxResult,
    notificationResult,
  ] as const;
  const copy = stateCopy(scenario);
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <RouteStateMarker scenario={scenario}>
      <div
        data-error-code={failure?.success === false ? failure.error.code : undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("下一步", "Agent")} title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Agent status details" className="relationship-meta">
            <div>
              <dt>{bilingualText("Orbit 已知", "What Orbit knows")}</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>{bilingualText("当前状态", "Current status")}</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>{bilingualText("安全检查", "Safety check")}</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>{bilingualText("下一步", "Next step")}</dt>
              <dd>{copy.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips evidenceIds={evidenceIds} label="Agent state evidence" />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions scenario={scenario} />
    </RouteStateMarker>
  );
}

function AgentLedger({
  actionCount,
  confirmationCount,
  notificationCount,
  settingsLevel,
}: {
  actionCount: number;
  confirmationCount: number;
  notificationCount: number;
  settingsLevel: string;
}) {
  return (
    <dl
      aria-label="App agent composed summary"
      className="relationship-meta agent-ledger"
    >
      <div>
        <dt>{bilingualText("动作队列", "Action queue")}</dt>
        <dd>
          <strong>{actionCount}</strong>
          {bilingualText(
            `${actionCount} 个关系动作已准备`,
            `${formatCount(actionCount, "relationship action")} ready`,
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("自主设置", "Autonomy setting")}</dt>
        <dd>
          <strong>{settingsLevel}</strong>
          {bilingualText(
            "所有外部影响都需要复核",
            "all outside effects require review",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("确认保护", "Confirmation guard")}</dt>
        <dd>
          <strong>{confirmationCount}</strong>
          {bilingualText(
            `${confirmationCount} 个审批项已暂存`,
            `${formatCount(confirmationCount, "approval item")} staged`,
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("通知队列", "Notification queue")}</dt>
        <dd>
          <strong>{notificationCount}</strong>
          {bilingualText(
            `${notificationCount} 个发送检查已暂缓`,
            `${formatCount(notificationCount, "delivery check")} held`,
          )}
        </dd>
      </div>
    </dl>
  );
}

function AgentReviewForm() {
  return (
    <form
      action="/app/agent"
      aria-label="Review top agent action preview"
      className="agent-review-form"
      method="get"
    >
      <div>
        <p className="type-caption">
          {bilingualText("核心 Agent 动作", "Core agent action")}
        </p>
        <h3 className="relationship-name">
          {bilingualText("复核最高优先级动作", "Review top agent action")}
        </h3>
        <p className="type-body">
          {bilingualText(
            "任何内容到达外部账号前，先检查 Maya 跟进、确认需求、发送保护和提醒队列。",
            "Check the Maya follow-up, confirmation need, send guard, and reminder queue before anything reaches an outside account.",
          )}
        </p>
      </div>
      <input name="action" type="hidden" value="review-top-agent-action" />
      <button type="submit">
        {bilingualText("复核最高优先级动作", "Review top agent action")}
      </button>
    </form>
  );
}

function AgentActionResult({
  agentDecision,
  sandboxResult,
  selectedAction,
}: {
  agentDecision: AgentActionDecisionResult;
  sandboxResult: ExternalActionNoOpResult;
  selectedAction: AgentActionQueueItem;
}) {
  const reviewStopped =
    agentDecision.success === false || sandboxResult.success === false;

  if (reviewStopped) {
    return (
      <div
        aria-label="App agent local action result"
        className="agent-action-result"
        data-action-evidence="agent-review-top-action-local-preview"
        data-agent-result="agent-review-top-action-preview"
        data-side-effects="none"
      >
        <strong>
          {bilingualText(
            "Agent 复核无法准备本地预览",
            "Agent review could not prepare the local preview",
          )}
        </strong>
        <span>{bilingualText("已记录确认：否", "Confirmation recorded: no")}</span>
        <span>{bilingualText("消息已发送：否", "Message sent: no")}</span>
        <span>
          {bilingualText("通知已送达：无", "Notifications delivered: none")}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label="App agent local action result"
      className="agent-action-result"
      data-action-evidence="agent-review-top-action-local-preview"
      data-agent-result="agent-review-top-action-preview"
      data-side-effects="none"
    >
      <strong>
        {bilingualText(
          "Agent 复核已准备：给 Maya Chen 发送可靠性备忘",
          "Agent review ready: Send reliability memo to Maya Chen",
        )}
      </strong>
      <span>
        {bilingualText("已复核动作", "Reviewed action")}: {selectedAction.title}
      </span>
      <span>{bilingualText("已记录确认：否", "Confirmation recorded: no")}</span>
      <span>
        {bilingualText(
          "外部沙盒结果：无操作预览",
          "External sandbox result: no-op preview",
        )}
      </span>
      <span>{bilingualText("消息已发送：否", "Message sent: no")}</span>
      <span>
        {bilingualText("通知已送达：无", "Notifications delivered: none")}
      </span>
    </div>
  );
}

function ActionCard({ action }: { action: AgentActionQueueItem }) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("建议的关系动作", "Recommended relationship move")}
        </p>
        <h3 className="relationship-name">
          {bilingualText(
            "给 Maya Chen 发送可靠性备忘",
            "Send reliability memo to Maya Chen",
          )}
        </h3>
        <p className="type-body">{action.recommendedAction}</p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("联系人", "Contact")}</dt>
          <dd>
            {action.contactName}, {action.organization}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("优先级", "Priority")}</dt>
          <dd>{priorityLabel(action.priority)}</dd>
        </div>
        <div>
          <dt>{bilingualText("为什么现在", "Why now")}</dt>
          <dd>{action.reason}</dd>
        </div>
        <div>
          <dt>{bilingualText("复核窗口", "Review window")}</dt>
          <dd>{action.dueLabel}</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={action.evidenceIds} label="Agent action evidence" />
    </article>
  );
}

function SettingsCard({ level }: { level: AgentAutonomyLevelBoundary }) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("自主设置", "Autonomy setting")}
        </p>
        <h3 className="relationship-name">{level.label}</h3>
        <p className="type-body">
          {bilingualText(
            "Orbit 可以在这里排列有来源的下一步，但每次发送、日程修改、提醒发送和关系更新都需要用户复核。",
            "Orbit can rank sourced next steps here, but every send, schedule change, reminder delivery, and relationship update stays behind user review.",
          )}
        </p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("复核控制", "Review control")}</dt>
          <dd>{userReviewControlCopy(level.operatorControl)}</dd>
        </div>
        <div>
          <dt>{bilingualText("外部动作复核", "External action review")}</dt>
          <dd>
            {bilingualText(
              "任何内容离开 Orbit 前都必须复核。",
              "Required before anything leaves Orbit.",
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function ConfirmationCard({
  confirmation,
}: {
  confirmation: ConfirmationRequirement;
}) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("确认保护", "Confirmation guard")}
        </p>
        <h3 className="relationship-name">{confirmation.action.label}</h3>
        <p className="type-body">{confirmation.action.summary}</p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("确认问题", "Question")}</dt>
          <dd>{confirmation.confirmationQuestion}</dd>
        </div>
        <div>
          <dt>{bilingualText("目标", "Target")}</dt>
          <dd>{confirmation.action.targetLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("安全说明", "Safety note")}</dt>
          <dd>{confirmation.guardReason}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={confirmation.evidence.map((item) => item.evidenceId)}
        label="Confirmation evidence"
      />
    </article>
  );
}

function SandboxCard({
  action,
}: {
  action: ExternalActionSandboxAction;
}) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("发送检查", "Send check")}
        </p>
        <h3 className="relationship-name">{action.targetLabel}</h3>
        <p className="type-body">{action.requestedEffect}</p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("上下文", "Context")}</dt>
          <dd>{action.relationshipContext.followupRationale}</dd>
        </div>
        <div>
          <dt>{bilingualText("结果", "Outcome")}</dt>
          <dd>
            {bilingualText(
              "这次复核不会产生外部发送。",
              "No outside send will happen from this review.",
            )}
          </dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={action.evidenceIds} label="Send check evidence" />
    </article>
  );
}

function NotificationCard({
  queueEntry,
}: {
  queueEntry: NotificationQueueEntry;
}) {
  return (
    <article
      className="agent-card"
      data-notification-queue-entry-id={queueEntry.queueEntryId}
    >
      <div>
        <p className="type-caption">
          {bilingualText("通知队列", "Notification queue")}
        </p>
        <h3 className="relationship-name">{notificationQueueLabel(queueEntry)}</h3>
        <p className="type-body">
          {bilingualText(
            `${channelLabel(queueEntry.channel)} 提醒会在发送前等待复核。`,
            `${channelLabel(queueEntry.channel)} reminder is held for review before delivery.`,
          )}
        </p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("计划时间", "Scheduled for")}</dt>
          <dd>{queueEntry.scheduledFor}</dd>
        </div>
        <div>
          <dt>{bilingualText("送达状态", "Delivery status")}</dt>
          <dd>{bilingualText("未送达", "Not delivered")}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={queueEntry.evidenceIds}
        label="Notification queue evidence"
      />
    </article>
  );
}

function RouteStateLinks() {
  return (
    <nav
      aria-label="Agent route state checks"
      className="agent-state-links"
      data-side-effects="none"
    >
      {routeStateChecks.map((check) => (
        <a href={check.href} key={check.href}>
          {check.label}
        </a>
      ))}
    </nav>
  );
}

export function AppAgentCommandCenter({
  searchParams,
}: AppAgentCommandCenterProps) {
  const scenario = readRouteScenario(searchParams);

  if (scenario) {
    return (
      <>
        <style>{appAgentStyles}</style>
        <div className="app-agent-route">
          <RouteStateBoundary scenario={scenario} />
        </div>
      </>
    );
  }

  const services = createAppAgentRouteServices();
  const actionsResult = services.agentActionService.listActions();
  const settingsResult = services.settingsService.getSettings();
  const confirmationResult =
    services.confirmationService.listConfirmationRequirements();
  const sandboxAuditResult = services.sandboxService.listAuditRecords();
  const notificationResult = services.notificationService.listNotifications();

  if (
    actionsResult.success === false ||
    settingsResult.success === false ||
    confirmationResult.success === false ||
    sandboxAuditResult.success === false ||
    notificationResult.success === false
  ) {
    return (
      <>
        <style>{appAgentStyles}</style>
        <div className="app-agent-route">
          <RouteStateBoundary scenario="failure" />
        </div>
      </>
    );
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
    return (
      <>
        <style>{appAgentStyles}</style>
        <div className="app-agent-route">
          <RouteStateBoundary scenario="empty" />
        </div>
      </>
    );
  }

  const action = readSearchParam(searchParams, "action");
  const shouldPreviewAction = action === "review-top-agent-action";
  const agentDecision = shouldPreviewAction
    ? services.agentActionService.acceptAction({
        actionId: selectedAction.actionId,
        actorLabel: "Orbit user",
      })
    : null;
  const sandboxResult = shouldPreviewAction
    ? services.sandboxService.sendMessage({
        actionId: selectedSandboxAction.actionId,
        actorLabel: "Orbit user",
        targetLabel: selectedAction.contactName,
      })
    : null;

  return (
    <>
      <style>{appAgentStyles}</style>
      <div className="app-agent-route" data-state-boundary="app-agent-success">
        <WorkbenchSurface
          className="agent-command"
          elevated
          eyebrow={bilingualText("下一步", "Agent")}
          title={bilingualText("下一步审核", "Agent review")}
        >
          <p className="type-body">
            {bilingualText(
              "任何动作到达外部账号前，先看关系动作、证据、审批状态、发送检查、自主设置和提醒队列。",
              "Review relationship actions with their evidence, approval state, send check, autonomy setting, and reminder queue before anything reaches an outside account.",
            )}
          </p>
          <AgentLedger
            actionCount={actionsResult.data.actions.length}
            confirmationCount={confirmationResult.data.requirements.length}
            notificationCount={notificationResult.data.notificationQueue.length}
            settingsLevel={selectedSetting.label}
          />
          <AgentReviewForm />
          {agentDecision && sandboxResult && (
            <AgentActionResult
              agentDecision={agentDecision}
              sandboxResult={sandboxResult}
              selectedAction={selectedAction}
            />
          )}
        </WorkbenchSurface>

        <div className="agent-grid">
          <ActionCard action={selectedAction} />
          <SettingsCard level={selectedSetting} />
          <ConfirmationCard confirmation={selectedConfirmation} />
          <SandboxCard action={selectedSandboxAction} />
          <NotificationCard queueEntry={selectedQueueEntry} />
        </div>

        <RouteStateLinks />
      </div>
    </>
  );
}
