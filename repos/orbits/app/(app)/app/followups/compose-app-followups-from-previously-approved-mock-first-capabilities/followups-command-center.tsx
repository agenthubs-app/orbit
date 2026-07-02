/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  loadAppFollowupsRouteViewModel,
  type AppFollowupsActionResultViewModel,
  type AppFollowupsLedgerViewModel,
  type AppFollowupsPriorityViewModel,
  type AppFollowupsQueueEntryViewModel,
  type AppFollowupsReminderQueueViewModel,
  type AppFollowupsRouteScenario,
  type AppFollowupsRouteStateViewModel,
  type AppFollowupsSearchParams,
  type AppFollowupsSuccessViewModel,
  type AppFollowupsWorkflowCardViewModel,
} from "./followups-route-view-model";

const appFollowupsStyles = `
.app-followups-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
}

.orbit-app-shell:has(.app-followups-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-followups-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-followups-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-followups-route,
.app-followups-route .workbench-surface,
.app-followups-route .relationship-meta,
.app-followups-route .chip-row,
.app-followups-route .followups-rail,
.app-followups-route .followups-ledger,
.app-followups-route .followups-card-grid,
.app-followups-route .followups-evidence-details,
.app-followups-route .followups-priority-grid,
.app-followups-route .followups-workflow-list,
.app-followups-route .followups-action-form,
.app-followups-route .followups-action-result {
  min-width: 0;
}

.app-followups-route .relationship-name,
.app-followups-route .type-body,
.app-followups-route .type-caption,
.app-followups-route .relationship-meta dd,
.app-followups-route .orbit-chip,
.app-followups-route .followups-state-links a,
.app-followups-route .followups-action-result span,
.app-followups-route .followups-action-result strong {
  overflow-wrap: anywhere;
}

.app-followups-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
}

.app-followups-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-followups-route .followups-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-followups-route .followups-priority-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.35fr) minmax(min(100%, 260px), 0.65fr);
}

.app-followups-route .followups-rail {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: var(--orbit-space-sm);
  padding-left: var(--orbit-space-md);
}

.app-followups-route .followups-ledger,
.app-followups-route .followups-card-grid,
.app-followups-route .followups-workflow-list {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 204px), 1fr));
}

.app-followups-route .followups-ledger div,
.app-followups-route .followups-card,
.app-followups-route .followups-workflow-card,
.app-followups-route .followups-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-followups-route .followups-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-followups-route .followups-card,
.app-followups-route .followups-workflow-card,
.app-followups-route .followups-action-result,
.app-followups-route .followups-action-form {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-followups-route .followups-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-followups-route .followups-workflow-card {
  border-left: 3px solid var(--orbit-color-primary);
}

.app-followups-route .followups-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-followups-route .followups-evidence-details {
  border-top: 1px solid var(--orbit-color-border);
  padding-top: var(--orbit-space-xs);
}

.app-followups-route .followups-evidence-details summary {
  cursor: pointer;
  font: inherit;
}

.app-followups-route .followups-action-form {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-followups-route .followups-privacy-boundary {
  border-left: 3px solid var(--orbit-color-evidence);
  margin: 0;
  padding-left: var(--orbit-space-sm);
}

.app-followups-route .followups-action-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  max-width: 100%;
  white-space: normal;
}

.app-followups-route .followups-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-followups-route .followups-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}

.app-followups-route .followups-recovery-actions {
  align-items: center;
}

@media (max-width: 760px) {
  .app-followups-route .followups-priority-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

const routeStateChecks = [
  {
    href: "/app/followups?scenario=empty",
    label: bilingualText("没有可用跟进", "No follow-ups ready"),
  },
  {
    href: "/app/followups?scenario=pending",
    label: bilingualText("仍在检查证据", "Still checking evidence"),
  },
  {
    href: "/app/followups?scenario=failure",
    label: bilingualText("跟进不可用", "Follow-ups unavailable"),
  },
] as const;

type RouteScenario = AppFollowupsRouteScenario;

interface AppFollowupsCommandCenterProps {
  searchParams?: AppFollowupsSearchParams;
}

const followupsPrivacyCopy =
  "No saved record, calendar or scheduler change, email or message send, notification delivery, automated writing call, or outside network request is made from this page.";

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/followups?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({
  actions,
}: {
  actions: AppFollowupsRouteStateViewModel["recoveryActions"];
}) {
  return (
    <nav
      aria-label="Follow-ups route recovery actions"
      className="followups-state-links followups-recovery-actions"
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

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppFollowupsRouteStateViewModel;
}) {
  return (
    <RouteStateMarker scenario={routeState.scenario}>
      <div
        data-error-code={routeState.errorCode ?? undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("跟进", "Follow-ups")} title={routeState.copy.title}>
          <p className="type-body">{routeState.copy.description}</p>
          <dl aria-label="Follow-up status details" className="relationship-meta">
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
          <EvidenceChips evidenceIds={routeState.evidenceIds} label="Follow-up state evidence" />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions actions={routeState.recoveryActions} />
    </RouteStateMarker>
  );
}

function EvidenceChips({
  evidenceIds,
  label,
  recordIds = [],
}: {
  evidenceIds: readonly string[];
  label: string;
  recordIds?: readonly string[];
}) {
  const displayedIds = [...recordIds, ...evidenceIds].slice(0, 5);

  return (
    <details className="followups-evidence-details">
      <summary>{bilingualText("证据详情", "Evidence details")}</summary>
      <div aria-label={label} className="chip-row">
        {displayedIds.map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceId}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function FollowupsLedger({
  ledger,
}: {
  ledger: AppFollowupsLedgerViewModel;
}) {
  return (
    <dl
      aria-label="App follow-ups composed summary"
      className="relationship-meta followups-ledger"
    >
      <div>
        <dt>{bilingualText("任务", "Tasks")}</dt>
        <dd>
          <strong>{ledger.taskCount}</strong>
          {bilingualText("有来源跟进", "source-backed follow-ups")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("草稿", "Drafts")}</dt>
        <dd>
          <strong>{ledger.draftCount}</strong>
          {bilingualText("可复核消息", "reviewable message")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("提醒", "Reminders")}</dt>
        <dd>
          <strong>{ledger.reminderCount}</strong>
          {bilingualText("已安排复核项", "scheduled review items")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("今天到期", "Due today")}</dt>
        <dd>
          <strong>{ledger.dueTodayCount}</strong>
          {bilingualText("高关注项", "high-attention item")}
        </dd>
      </div>
    </dl>
  );
}

function PromisePrioritySurface({
  priority,
}: {
  priority: AppFollowupsPriorityViewModel | null;
}) {
  if (!priority) {
    return (
      <div className="followups-priority-grid">
        <div>
          <p className="type-caption">
            {bilingualText("未选择承诺", "No promise selected")}
          </p>
          <h3 className="relationship-name">
            {bilingualText(
              "先选择有来源的跟进",
              "Select a sourced follow-up first",
            )}
          </h3>
          <p className="type-body">
            {bilingualText(
              "承诺需要关系、来源上下文、草稿和提醒时间，之后才能复核。",
              "A promise needs a relationship, source context, draft, and reminder timing before it can be reviewed.",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="followups-priority-grid">
      <div>
        <p className="type-caption">
          For {priority.contactName} at {priority.organization}
        </p>
        <h3 className="relationship-name">
          {bilingualText(`已选择承诺 ${priority.title}`, `Selected promise ${priority.title}`)}
        </h3>
        <p className="type-body">{priority.recommendedAction}</p>
      </div>
      <dl aria-label="Current promise priority details" className="relationship-meta">
        <div>
          <dt>{bilingualText("为什么现在重要", "Why it matters now")}</dt>
          <dd>{priority.rationale}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源触发", "Source trigger")}</dt>
          <dd>
            {priority.triggerKindLabel} from {priority.sourceLabel}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("草稿准备度", "Draft readiness")}</dt>
          <dd>{priority.draftReadiness}</dd>
        </div>
        <div>
          <dt>{bilingualText("提醒时间", "Reminder timing")}</dt>
          <dd>{priority.dueSentence}</dd>
        </div>
        <div>
          <dt>{bilingualText("安全下一步", "Next safe action")}</dt>
          <dd>
            {bilingualText(
              "标记完成前，先复核草稿跟进。",
              "Review the drafted follow-through before marking anything complete.",
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function QueueEntryCard({
  entry,
}: {
  entry: AppFollowupsQueueEntryViewModel;
}) {
  return (
    <article
      aria-label={entry.ariaLabel}
      className="followups-card"
    >
      <header>
        <p className="type-caption">{entry.channelLabel}</p>
        <h3 className="relationship-name">{entry.title}</h3>
        <p className="type-caption">{entry.statusLabel}</p>
      </header>
      <p className="type-body">{entry.body}</p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("复核状态", "Review status")}</dt>
          <dd>{entry.reviewStatus}</dd>
        </div>
        <div>
          <dt>{bilingualText("发送状态", "Delivery state")}</dt>
          <dd>{bilingualText("复核前暂缓", "Held until review")}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={entry.evidenceIds}
        label={`${entry.id} evidence`}
        recordIds={entry.recordIds}
      />
      <details className="followups-evidence-details">
        <summary>{bilingualText("队列来源详情", "Queue source details")}</summary>
        <p className="type-caption">{entry.reason}</p>
      </details>
    </article>
  );
}

function CompletionActionForm() {
  return (
    <form
      action="/app/followups"
      aria-label="Complete top follow-up preview"
      className="followups-action-form"
      method="get"
    >
      <div>
        <p className="type-caption">
          {bilingualText("安全下一步", "Next safe action")}
        </p>
        <h3 className="relationship-name">
          {bilingualText("复核承诺完成", "Review promise completion")}
        </h3>
        <p className="type-body">
          {bilingualText(
            "预览哪些内容会被标记完成，以及哪些内容仍会暂存等待复核。",
            "Preview what would be marked complete and what remains staged for review.",
          )}
        </p>
      </div>
      <input name="action" type="hidden" value="complete-top-followup" />
      <button type="submit">
        {bilingualText("复核承诺完成", "Review promise completion")}
      </button>
    </form>
  );
}

function ActionResult({
  result,
}: {
  result: AppFollowupsActionResultViewModel;
}) {
  if (result.state === "empty") {
    return (
      <div
        aria-label="App follow-ups local action result"
        className="followups-action-result"
        data-action-evidence="followups-complete-top-task-local-preview"
        data-side-effects="none"
        data-task-result="followups-complete-top-task-preview"
      >
        <strong>
          {bilingualText(
            "完成预览已准备：未选择跟进",
            "Completion preview ready: no follow-up selected",
          )}
        </strong>
        <span>{bilingualText("已选择承诺：无", "Selected promise: none")}</span>
        <span>
          {bilingualText(
            "仍在本地暂存：承诺复核、草稿复核、提醒复核、队列暂缓",
            "Still staged locally: promise review, draft review, reminder review, queue hold",
          )}
        </span>
        <span>{bilingualText("日历更改：无", "Calendar changes: none")}</span>
        <span>{bilingualText("调度器更改：无", "Scheduler changes: none")}</span>
        <span>{bilingualText("已发送消息：无", "Messages sent: none")}</span>
        <span>
          {bilingualText("已送达通知：无", "Notifications delivered: none")}
        </span>
        <span>{bilingualText("已保存记录更改：无", "Saved records changed: none")}</span>
        <span>
          {bilingualText("自动写作调用：无", "Automated writing calls: none")}
        </span>
        <span>
          {bilingualText("外部网络请求：无", "Outside network requests: none")}
        </span>
        <span>{bilingualText("已记录完成：否", "Completion recorded: no")}</span>
      </div>
    );
  }

  return (
    <div
      aria-label="App follow-ups local action result"
      className="followups-action-result"
      data-action-evidence="followups-complete-top-task-local-preview"
      data-side-effects="none"
      data-task-result="followups-complete-top-task-preview"
    >
      <strong>
        {bilingualText(
          `完成预览已准备：${result.selectedTitle}`,
          `Completion preview ready: ${result.selectedTitle}`,
        )}
      </strong>
      <span>
        {bilingualText("已选择承诺", "Selected promise")}: {result.selectedTitle}
      </span>
      <span>
        {bilingualText("草稿上下文", "Draft context")}:{" "}
        {result.draftSubject} · {result.draftWindow}
      </span>
      <span>
        {bilingualText("提醒上下文", "Reminder context")}:{" "}
        {result.reminderTitle} · {result.reminderDueLabel}
      </span>
      <span>
        {bilingualText(
          "仍在本地暂存：承诺复核、草稿复核、提醒复核、队列暂缓",
          "Still staged locally: promise review, draft review, reminder review, queue hold",
        )}
      </span>
      <span>{bilingualText("日历更改：无", "Calendar changes: none")}</span>
      <span>
        {bilingualText("调度器更改", "Scheduler changes")}:{" "}
        {result.schedulerChanged
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>
        {bilingualText("已发送消息", "Messages sent")}:{" "}
        {result.messageSent
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>
        {bilingualText("已送达通知", "Notifications delivered")}:{" "}
        {result.notificationDelivered
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>{bilingualText("已保存记录更改：无", "Saved records changed: none")}</span>
      <span>
        {bilingualText("自动写作调用：无", "Automated writing calls: none")}
      </span>
      <span>
        {bilingualText("外部网络请求：无", "Outside network requests: none")}
      </span>
      <span>{bilingualText("已记录完成：否", "Completion recorded: no")}</span>
      <EvidenceChips
        evidenceIds={result.evidenceIds}
        label={`${result.selectedTitle} completion preview evidence`}
      />
    </div>
  );
}

function SuccessBoundary({
  workspace,
}: {
  workspace: AppFollowupsSuccessViewModel;
}) {
  return (
    <div data-state-boundary="app-followups-success">
      <WorkbenchSurface
        className="followups-command"
        elevated
        eyebrow={bilingualText("跟进", "Follow-ups")}
        title={bilingualText("要守住的承诺", "Promise to keep next")}
      >
        <p className="type-body">
          {bilingualText(
            "先判断这是不是现在该兑现的承诺，再打开更大的任务队列。",
            "Decide whether this is the promise to keep before opening the broader task queue.",
          )}
        </p>
        <p className="type-caption followups-privacy-boundary">
          {followupsPrivacyCopy}
        </p>
        <PromisePrioritySurface priority={workspace.priority} />
        <FollowupsLedger ledger={workspace.ledger} />
        <CompletionActionForm />
        {workspace.actionResult && (
          <ActionResult result={workspace.actionResult} />
        )}
        <div aria-label="App follow-ups source states">
          <h3 className="relationship-name">
            {bilingualText("来源状态路径", "Source status paths")}
          </h3>
          <p className="type-body">
            {bilingualText(
              "来源证据为空、仍在解析或不可用时，打开同一复核。",
              "Open the same review when source evidence is empty, still resolving, or unavailable.",
            )}
          </p>
          <nav className="followups-state-links">
            {routeStateChecks.map((stateCheck) => (
              <a href={stateCheck.href} key={stateCheck.href}>
                {stateCheck.label}
              </a>
            ))}
          </nav>
        </div>
        <details className="followups-evidence-details">
          <summary>{bilingualText("标签详情", "Label details")}</summary>
          <p className="type-caption">
            {bilingualText("跟进命令中心", "Follow-up command center")}
          </p>
        </details>
      </WorkbenchSurface>
    </div>
  );
}

function PromiseWorkflowCard({
  card,
}: {
  card: AppFollowupsWorkflowCardViewModel;
}) {
  return (
    <article className="followups-workflow-card">
      <header>
        <p className="type-caption">{card.stepLabel}</p>
        <h3 className="relationship-name">{card.title}</h3>
      </header>
      <p className="type-body">{card.body}</p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("关系", "Relationship")}</dt>
          <dd>{card.relationship}</dd>
        </div>
        <div>
          <dt>{bilingualText("时间", "Timing")}</dt>
          <dd>{card.due}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源上下文", "Source context")}</dt>
          <dd>{card.sourceContext}</dd>
        </div>
        <div>
          <dt>{bilingualText("复核状态", "Review status")}</dt>
          <dd>{card.reviewStatus}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={card.evidenceIds}
        label={`${card.title} evidence`}
        recordIds={card.recordIds}
      />
    </article>
  );
}

function FollowupReviewSection({
  cards,
}: {
  cards: readonly AppFollowupsWorkflowCardViewModel[];
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("可复核", "Ready for review")}
      title={bilingualText("承诺流程", "Promise workflow")}
    >
      <p className="type-body">
        {bilingualText(
          "先把任务、草稿、提醒和发送暂缓看成同一条承诺到发送路径，再检查队列其余部分。",
          "Read the task, draft, reminder, and delivery hold as one promise-to-send path before checking the rest of the queue.",
        )}
      </p>
      <div className="followups-workflow-list">
        {cards.map((card) => (
          <PromiseWorkflowCard card={card} key={card.id} />
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function ReminderQueueSection({
  reminderQueue,
}: {
  reminderQueue: AppFollowupsReminderQueueViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("提醒队列", "Reminder queue")}
      title={bilingualText("发送前复核", "Review before delivery")}
    >
      <p className="type-body">
        {bilingualText(
          "选择任何未来发送步骤前，先检查提醒时间和关系上下文。",
          "Check reminder timing and relationship context before choosing any future delivery step.",
        )}
      </p>
      <div className="followups-card-grid">
        {reminderQueue.entries.map((entry) => (
          <QueueEntryCard entry={entry} key={entry.id} />
        ))}
      </div>
      <EvidenceChips
        evidenceIds={reminderQueue.evidenceIds}
        label="App follow-ups reminder evidence"
      />
    </WorkbenchSurface>
  );
}

export async function AppFollowupsCommandCenter({
  searchParams,
}: AppFollowupsCommandCenterProps) {
  const viewModel = await loadAppFollowupsRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <div className="app-followups-route">
        <style>{appFollowupsStyles}</style>
        <RouteStateBoundary routeState={viewModel.routeState} />
      </div>
    );
  }

  return (
    <div className="app-followups-route">
      <style>{appFollowupsStyles}</style>
      <SuccessBoundary workspace={viewModel.workspace} />
      <FollowupReviewSection cards={viewModel.workspace.workflowCards} />
      <ReminderQueueSection reminderQueue={viewModel.workspace.reminderQueue} />
    </div>
  );
}
