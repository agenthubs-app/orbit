/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  loadAppAgentRouteViewModel,
  type AppAgentActionResultViewModel,
  type AppAgentActionViewModel,
  type AppAgentConfirmationViewModel,
  type AppAgentEvidenceViewModel,
  type AppAgentNotificationViewModel,
  type AppAgentRouteScenario,
  type AppAgentRouteStateViewModel,
  type AppAgentSandboxViewModel,
  type AppAgentSearchParams,
  type AppAgentSettingsViewModel,
} from "./agent-route-view-model";

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

interface AppAgentCommandCenterProps {
  searchParams?: AppAgentSearchParams;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: AppAgentRouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/agent?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({
  actions,
}: {
  actions: AppAgentRouteStateViewModel["recoveryActions"];
}) {
  return (
    <nav
      aria-label="Agent route recovery actions"
      className="agent-state-links agent-recovery-actions"
      data-side-effects="none"
    >
      {actions.map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

function EvidenceChips({
  evidence,
  label,
}: {
  evidence: readonly AppAgentEvidenceViewModel[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidence.slice(0, 5).map((item) => (
        <span
          className="orbit-chip orbit-chip-evidence"
          data-evidence-id={item.id}
          key={item.id}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppAgentRouteStateViewModel;
}) {
  return (
    <RouteStateMarker scenario={routeState.scenario}>
      <div
        data-error-code={routeState.errorCode ?? undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("下一步", "Agent")} title={routeState.copy.title}>
          <p className="type-body">{routeState.copy.description}</p>
          <dl aria-label="Agent status details" className="relationship-meta">
            <div>
              <dt>{bilingualText("Orbit 已知", "What Orbit knows")}</dt>
              <dd>{routeState.copy.purpose}</dd>
            </div>
            <div>
              <dt>{bilingualText("当前状态", "Current status")}</dt>
              <dd>{routeState.copy.emptyState}</dd>
            </div>
            <div>
              <dt>{bilingualText("安全检查", "Safety check")}</dt>
              <dd>{routeState.copy.guardrail}</dd>
            </div>
            <div>
              <dt>{bilingualText("下一步", "Next step")}</dt>
              <dd>{routeState.copy.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips evidence={routeState.evidence} label="Agent state evidence" />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions actions={routeState.recoveryActions} />
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
  result,
}: {
  result: AppAgentActionResultViewModel;
}) {
  if (result.stopped) {
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
        {bilingualText("已复核动作", "Reviewed action")}: {result.reviewedActionTitle}
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

function ActionCard({ action }: { action: AppAgentActionViewModel }) {
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
          <dd>{action.priorityLabel}</dd>
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
      <EvidenceChips evidence={action.evidence} label="Agent action evidence" />
    </article>
  );
}

function SettingsCard({ settings }: { settings: AppAgentSettingsViewModel }) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("自主设置", "Autonomy setting")}
        </p>
        <h3 className="relationship-name">{settings.label}</h3>
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
          <dd>{settings.reviewControl}</dd>
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
  confirmation: AppAgentConfirmationViewModel;
}) {
  return (
    <article className="agent-card">
      <div>
        <p className="type-caption">
          {bilingualText("确认保护", "Confirmation guard")}
        </p>
        <h3 className="relationship-name">{confirmation.label}</h3>
        <p className="type-body">{confirmation.summary}</p>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("确认问题", "Question")}</dt>
          <dd>{confirmation.question}</dd>
        </div>
        <div>
          <dt>{bilingualText("目标", "Target")}</dt>
          <dd>{confirmation.targetLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("安全说明", "Safety note")}</dt>
          <dd>{confirmation.guardReason}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidence={confirmation.evidence}
        label="Confirmation evidence"
      />
    </article>
  );
}

function SandboxCard({
  action,
}: {
  action: AppAgentSandboxViewModel;
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
          <dd>{action.followupRationale}</dd>
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
      <EvidenceChips evidence={action.evidence} label="Send check evidence" />
    </article>
  );
}

function NotificationCard({
  queueEntry,
}: {
  queueEntry: AppAgentNotificationViewModel;
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
        <h3 className="relationship-name">{queueEntry.title}</h3>
        <p className="type-body">
          {bilingualText(
            `${queueEntry.channelLabel} 提醒会在发送前等待复核。`,
            `${queueEntry.channelLabel} reminder is held for review before delivery.`,
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
        evidence={queueEntry.evidence}
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
  const viewModel = loadAppAgentRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <>
        <style>{appAgentStyles}</style>
        <div className="app-agent-route">
          <RouteStateBoundary routeState={viewModel.routeState} />
        </div>
      </>
    );
  }

  const workspace = viewModel.workspace;

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
            actionCount={workspace.ledger.actionCount}
            confirmationCount={workspace.ledger.confirmationCount}
            notificationCount={workspace.ledger.notificationCount}
            settingsLevel={workspace.ledger.settingsLevel}
          />
          <AgentReviewForm />
          {workspace.actionResult && (
            <AgentActionResult result={workspace.actionResult} />
          )}
        </WorkbenchSurface>

        <div className="agent-grid">
          <ActionCard action={workspace.action} />
          <SettingsCard settings={workspace.settings} />
          <ConfirmationCard confirmation={workspace.confirmation} />
          <SandboxCard action={workspace.sandbox} />
          <NotificationCard queueEntry={workspace.notification} />
        </div>

        <RouteStateLinks />
      </div>
    </>
  );
}
