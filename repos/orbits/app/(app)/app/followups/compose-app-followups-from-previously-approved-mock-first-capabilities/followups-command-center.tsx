/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import type {
  FollowupTask,
  FollowupTaskGenerationPayload,
  FollowupTaskGenerationResult,
  FollowupTaskPriority,
  FollowupTaskTriggerKind,
} from "../../../../../features/followups/contract";
import type {
  MessageDraft,
  MessageDraftChannel,
  MessageDraftGeneratorPayload,
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
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { createAppFollowupsRouteServices } from "./followups-service-factory";

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

type AppFollowupsSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";

interface AppFollowupsCommandCenterProps {
  searchParams?: AppFollowupsSearchParams;
}

type RouteStateResult =
  | FollowupTaskGenerationResult
  | MessageDraftGeneratorResult
  | ReminderScheduleNotificationResult;
type RouteStateSuccess = Extract<RouteStateResult, { success: true }>;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

const routeRecoveryActions: Record<
  RouteScenario,
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

const followupsPrivacyCopy =
  "No saved record, calendar or scheduler change, email or message send, notification delivery, automated writing call, or outside network request is made from this page.";

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
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
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

function draftStatusLabel(status: MessageDraftStatus): string {
  const labels: Record<MessageDraftStatus, string> = {
    draft: "Draft",
    held_for_review: "Held for review",
    ready_for_confirmation: "Ready for confirmation",
    revised: "Revised",
  };

  return labels[status];
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

function draftChannelLabel(channel: MessageDraftChannel): string {
  const labels: Record<MessageDraftChannel, string> = {
    calendar_note: "Calendar note",
    email: "Email",
    internal_note: "Internal note",
    linkedin: "LinkedIn",
  };

  return labels[channel];
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

function RouteRecoveryActions({ scenario }: { scenario: RouteScenario }) {
  return (
    <nav
      aria-label="Follow-ups route recovery actions"
      className="followups-state-links followups-recovery-actions"
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

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const services = createAppFollowupsRouteServices();
  const taskResult = services.taskService.listTasks({ scenario });
  const draftResult = services.draftService.createDraft({ scenario });
  const notificationResult = services.notificationService.listNotifications({
    scenario,
  });
  const results = [taskResult, draftResult, notificationResult] as const;
  const copy = stateCopy(scenario);
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <RouteStateMarker scenario={scenario}>
      <div
        data-error-code={failure?.success === false ? failure.error.code : undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("跟进", "Follow-ups")} title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Follow-up status details" className="relationship-meta">
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
          <EvidenceChips evidenceIds={evidenceIds} label="Follow-up state evidence" />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions scenario={scenario} />
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
  drafts,
  notifications,
  tasks,
}: {
  drafts: MessageDraftGeneratorPayload;
  notifications: ReminderScheduleNotificationPayload;
  tasks: FollowupTaskGenerationPayload;
}) {
  const dueToday = notifications.reminders.filter(
    (reminder) => reminder.dueInDays === 0,
  ).length;

  return (
    <dl
      aria-label="App follow-ups composed summary"
      className="relationship-meta followups-ledger"
    >
      <div>
        <dt>{bilingualText("任务", "Tasks")}</dt>
        <dd>
          <strong>{tasks.tasks.length}</strong>
          {bilingualText("有来源跟进", "source-backed follow-ups")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("草稿", "Drafts")}</dt>
        <dd>
          <strong>{drafts.drafts.length}</strong>
          {bilingualText("可复核消息", "reviewable message")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("提醒", "Reminders")}</dt>
        <dd>
          <strong>{notifications.reminders.length}</strong>
          {bilingualText("已安排复核项", "scheduled review items")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("今天到期", "Due today")}</dt>
        <dd>
          <strong>{dueToday}</strong>
          {bilingualText("高关注项", "high-attention item")}
        </dd>
      </div>
    </dl>
  );
}

function PromisePrioritySurface({
  draft,
  task,
}: {
  draft: MessageDraft | null;
  task: FollowupTask | null;
}) {
  if (!task) {
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
          For {task.contactName} at {task.organization}
        </p>
        <h3 className="relationship-name">
          {bilingualText(`已选择承诺 ${task.title}`, `Selected promise ${task.title}`)}
        </h3>
        <p className="type-body">{task.recommendedAction}</p>
      </div>
      <dl aria-label="Current promise priority details" className="relationship-meta">
        <div>
          <dt>{bilingualText("为什么现在重要", "Why it matters now")}</dt>
          <dd>{task.rationale}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源触发", "Source trigger")}</dt>
          <dd>
            {triggerKindLabel(task.triggerKind)} from {task.source.label}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("草稿准备度", "Draft readiness")}</dt>
          <dd>{draftReadinessLabel(draft)}</dd>
        </div>
        <div>
          <dt>{bilingualText("提醒时间", "Reminder timing")}</dt>
          <dd>{dueSentenceLabel(task.dueInDays)}</dd>
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

function FollowupTaskCard({ task }: { task: FollowupTask }) {
  return (
    <article
      aria-label={`Follow-up task for ${task.contactName}`}
      className="followups-card"
    >
      <header>
        <p className="type-caption">{triggerKindLabel(task.triggerKind)}</p>
        <h3 className="relationship-name">{task.title}</h3>
        <p className="type-caption">
          {task.contactName} · {task.organization} · Due {dueLabel(task.dueInDays)}
        </p>
      </header>
      <p className="type-body">{task.recommendedAction}</p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("优先级", "Priority")}</dt>
          <dd>{priorityLabel(task.priority)}</dd>
        </div>
        <div>
          <dt>{bilingualText("为什么重要", "Why this matters")}</dt>
          <dd>{task.rationale}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源", "Source")}</dt>
          <dd>{task.source.label}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={task.evidenceIds}
        label={`${task.contactName} follow-up evidence`}
      />
    </article>
  );
}

function MessageDraftCard({ draft }: { draft: MessageDraft }) {
  return (
    <article
      aria-label={`Message draft for ${draft.recipientName}`}
      className="followups-card"
    >
      <header>
        <p className="type-caption">
          {draftChannelLabel(draft.channel)} · {draftStatusLabel(draft.status)}
        </p>
        <h3 className="relationship-name">{draft.subject}</h3>
        <p className="type-caption">
          {draft.recipientName} · {draft.organization} · {draft.recommendedSendWindow}
        </p>
      </header>
      <p className="type-body">{draft.body}</p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("关系上下文", "Relationship context")}</dt>
          <dd>{draft.relationshipContext}</dd>
        </div>
        <div>
          <dt>{bilingualText("确认", "Confirmation")}</dt>
          <dd>
            {draft.sendActionRequiresConfirmation
              ? bilingualText("发送前需要", "Required before send")
              : bilingualText("不需要", "Not required")}
          </dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={draft.evidenceIds}
        label={`${draft.recipientName} draft evidence`}
      />
    </article>
  );
}

function ReminderCard({ reminder }: { reminder: ScheduledReminder }) {
  return (
    <article
      aria-label={`Reminder for ${reminder.contactName}`}
      className="followups-card"
    >
      <header>
        <p className="type-caption">{priorityLabel(reminder.priority)} reminder</p>
        <h3 className="relationship-name">{reminder.title}</h3>
        <p className="type-caption">
          {reminder.contactName} · {reminder.organization} · {reminder.recommendedWindow}
        </p>
      </header>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("到期", "Due")}</dt>
          <dd>{dueLabel(reminder.dueInDays)}</dd>
        </div>
        <div>
          <dt>{bilingualText("频率", "Frequency")}</dt>
          <dd>{reminder.frequency}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源", "Source")}</dt>
          <dd>{reminder.source.label}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={reminder.evidenceIds}
        label={`${reminder.contactName} reminder evidence`}
      />
    </article>
  );
}

function QueueEntryCard({
  entry,
  reminder,
}: {
  entry: NotificationQueueEntry;
  reminder: ScheduledReminder | null;
}) {
  return (
    <article
      aria-label={`Reminder queue entry for ${reminder?.contactName ?? entry.channel}`}
      className="followups-card"
    >
      <header>
        <p className="type-caption">{queueChannelLabel(entry.channel)}</p>
        <h3 className="relationship-name">{queueEntryLabel(entry, reminder)}</h3>
        <p className="type-caption">{queueStatusLabel(entry.status)}</p>
      </header>
      <p className="type-body">
        {bilingualText(
          `${queueSourceContext(entry, reminder)} 会留在承诺流程中等待复核。`,
          `${queueSourceContext(entry, reminder)} stays with the promise workflow for review.`,
        )}
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("复核状态", "Review status")}</dt>
          <dd>{queueReviewStatusLabel(entry.status)}</dd>
        </div>
        <div>
          <dt>{bilingualText("发送状态", "Delivery state")}</dt>
          <dd>{bilingualText("复核前暂缓", "Held until review")}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={entry.evidenceIds}
        label={`${entry.queueEntryId} evidence`}
        recordIds={[entry.queueEntryId]}
      />
      <details className="followups-evidence-details">
        <summary>{bilingualText("队列来源详情", "Queue source details")}</summary>
        <p className="type-caption">{productCopy(entry.reason)}</p>
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
  draft,
  notification,
  task,
}: {
  draft: MessageDraft | null;
  notification: ReminderScheduleNotificationPayload;
  task: FollowupTask | null;
}) {
  if (!task) {
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

  const topReminder = notification.reminders[0] ?? null;
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
          `完成预览已准备：${task.title}`,
          `Completion preview ready: ${task.title}`,
        )}
      </strong>
      <span>
        {bilingualText("已选择承诺", "Selected promise")}: {task.title}
      </span>
      <span>
        {bilingualText("草稿上下文", "Draft context")}:{" "}
        {draft?.subject ?? bilingualText("未选择草稿", "No draft selected")} ·{" "}
        {draft?.recommendedSendWindow ?? bilingualText("无发送窗口", "no send window")}
      </span>
      <span>
        {bilingualText("提醒上下文", "Reminder context")}:{" "}
        {topReminder?.title ?? bilingualText("未选择提醒", "No reminder selected")} ·{" "}
        {topReminder
          ? bilingualText(`到期 ${dueLabel(topReminder.dueInDays)}`, `due ${dueLabel(topReminder.dueInDays)}`)
          : bilingualText("未定时", "not timed")}
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
        {schedulerChanged
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>
        {bilingualText("已发送消息", "Messages sent")}:{" "}
        {messageSent
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>
        {bilingualText("已送达通知", "Notifications delivered")}:{" "}
        {notificationDelivered
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
        evidenceIds={task.evidenceIds}
        label={`${task.contactName} completion preview evidence`}
      />
    </div>
  );
}

function SuccessBoundary({
  draft,
  drafts,
  notifications,
  searchParams,
  task,
  tasks,
}: {
  draft: MessageDraft | null;
  drafts: MessageDraftGeneratorPayload;
  notifications: ReminderScheduleNotificationPayload;
  searchParams: AppFollowupsSearchParams | undefined;
  task: FollowupTask | null;
  tasks: FollowupTaskGenerationPayload;
}) {
  const actionRequested =
    readSearchParam(searchParams, "action") === "complete-top-followup";

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
        <PromisePrioritySurface draft={draft} task={task} />
        <FollowupsLedger
          drafts={drafts}
          notifications={notifications}
          tasks={tasks}
        />
        <CompletionActionForm />
        {actionRequested && (
          <ActionResult
            draft={draft}
            notification={notifications}
            task={task}
          />
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
  children,
  due,
  evidenceIds,
  relationship,
  reviewStatus,
  sourceContext,
  stepLabel,
  title,
}: {
  children?: ReactNode;
  due: string;
  evidenceIds: readonly string[];
  relationship: string;
  reviewStatus: string;
  sourceContext: string;
  stepLabel: string;
  title: string;
}) {
  return (
    <article className="followups-workflow-card">
      <header>
        <p className="type-caption">{stepLabel}</p>
        <h3 className="relationship-name">{title}</h3>
      </header>
      {children}
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("关系", "Relationship")}</dt>
          <dd>{relationship}</dd>
        </div>
        <div>
          <dt>{bilingualText("时间", "Timing")}</dt>
          <dd>{due}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源上下文", "Source context")}</dt>
          <dd>{sourceContext}</dd>
        </div>
        <div>
          <dt>{bilingualText("复核状态", "Review status")}</dt>
          <dd>{reviewStatus}</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={evidenceIds} label={`${title} evidence`} />
    </article>
  );
}

function FollowupReviewSection({
  drafts,
  notifications,
  tasks,
}: {
  drafts: MessageDraftGeneratorPayload;
  notifications: ReminderScheduleNotificationPayload;
  tasks: FollowupTaskGenerationPayload;
}) {
  const task = tasks.tasks[0] ?? null;
  const draft = drafts.drafts[0] ?? null;
  const reminder = notifications.reminders[0] ?? null;
  const queueEntry = notifications.notificationQueue[0] ?? null;

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
        {task && (
          <PromiseWorkflowCard
            due={dueSentenceLabel(task.dueInDays)}
            evidenceIds={task.evidenceIds}
            relationship={`${task.contactName} · ${task.organization}`}
            reviewStatus={bilingualText("本地复核暂缓", "Held for local review")}
            sourceContext={task.source.label}
            stepLabel={bilingualText("待判断任务", "Task to decide")}
            title={task.title}
          >
            <p className="type-body">{task.recommendedAction}</p>
          </PromiseWorkflowCard>
        )}
        {draft && (
          <PromiseWorkflowCard
            due={draft.recommendedSendWindow}
            evidenceIds={draft.evidenceIds}
            relationship={`${draft.recipientName} · ${draft.organization}`}
            reviewStatus={draftReadinessLabel(draft)}
            sourceContext={draft.relationshipContext}
            stepLabel={bilingualText("待复核消息草稿", "Message draft to review")}
            title={draft.subject}
          >
            <p className="type-body">{draft.body}</p>
          </PromiseWorkflowCard>
        )}
        {reminder && (
          <PromiseWorkflowCard
            due={dueSentenceLabel(reminder.dueInDays)}
            evidenceIds={reminder.evidenceIds}
            relationship={`${reminder.contactName} · ${reminder.organization}`}
            reviewStatus={bilingualText("本地复核暂缓", "Held for local review")}
            sourceContext={reminder.source.label}
            stepLabel={bilingualText("保持可见的提醒", "Reminder to keep visible")}
            title={reminder.title}
          >
            <p className="type-body">{reminder.recommendedWindow}</p>
          </PromiseWorkflowCard>
        )}
        {queueEntry && (
          <PromiseWorkflowCard
            due={
              reminder
                ? dueSentenceLabel(reminder.dueInDays)
                : bilingualText("未定时", "Not timed")
            }
            evidenceIds={queueEntry.evidenceIds}
            relationship={
              reminder
                ? `${reminder.contactName} · ${reminder.organization}`
                : bilingualText("已选择关系", "Selected relationship")
            }
            reviewStatus={queueReviewStatusLabel(queueEntry.status)}
            sourceContext={queueSourceContext(queueEntry, reminder)}
            stepLabel={bilingualText(
              "发送前队列暂缓",
              "Queue hold before delivery",
            )}
            title={queueEntryLabel(queueEntry, reminder)}
          >
            <p className="type-body">
              {bilingualText(
                "承诺和消息复核完成前，发送会保持暂存。",
                "Delivery stays staged until the promise and message are reviewed.",
              )}
            </p>
            <EvidenceChips
              evidenceIds={[]}
              label={`${queueEntry.queueEntryId} queue record`}
              recordIds={[queueEntry.queueEntryId]}
            />
          </PromiseWorkflowCard>
        )}
      </div>
    </WorkbenchSurface>
  );
}

function ReminderQueueSection({
  notifications,
}: {
  notifications: ReminderScheduleNotificationPayload;
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
        {notifications.notificationQueue.slice(0, 4).map((entry) => {
          const reminder =
            notifications.reminders.find((scheduledReminder) =>
              entry.reminderIds.includes(scheduledReminder.reminderId),
            ) ?? null;

          return (
            <QueueEntryCard
              entry={entry}
              key={entry.queueEntryId}
              reminder={reminder}
            />
          );
        })}
      </div>
      <EvidenceChips
        evidenceIds={notifications.provenance.evidenceIds}
        label="App follow-ups reminder evidence"
      />
    </WorkbenchSurface>
  );
}

function CompositionFailure({
  results,
}: {
  results: readonly RouteStateResult[];
}) {
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <div data-state-boundary="shared-ui-state-view">
      <WorkbenchSurface
        elevated
        eyebrow={bilingualText("跟进", "Follow-ups")}
        title={bilingualText("跟进无法加载", "Follow-ups could not load")}
      >
        <p className="type-body">
          {bilingualText(
            "来源证据检查期间，跟进任务、草稿和提醒暂不可用。",
            "Follow-up tasks, drafts, and reminders are unavailable while source evidence is checked.",
          )}
        </p>
        <dl aria-label="Follow-up status details" className="relationship-meta">
          <div>
            <dt>{bilingualText("当前状态", "Current status")}</dt>
            <dd>
              {bilingualText(
                "有来源的跟进数据返回前，复核会保持暂停。",
                "Review is paused until the source-backed follow-up data returns.",
              )}
            </dd>
          </div>
          <div>
            <dt>{bilingualText("安全检查", "Safety check")}</dt>
            <dd>
              {bilingualText(
                "没有保存记录、消息、提醒或通知发生更改。",
                "No saved record, message, reminder, or notification changed.",
              )}
            </dd>
          </div>
          <div>
            <dt>{bilingualText("错误", "Error")}</dt>
            <dd>{failure?.success === false ? failure.error.code : "unavailable"}</dd>
          </div>
        </dl>
        <EvidenceChips evidenceIds={evidenceIds} label="Follow-up failure evidence" />
      </WorkbenchSurface>
    </div>
  );
}

export function AppFollowupsCommandCenter({
  searchParams,
}: AppFollowupsCommandCenterProps) {
  const services = createAppFollowupsRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return (
      <div className="app-followups-route">
        <style>{appFollowupsStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const taskResult = services.taskService.listTasks();

  if (taskResult.success === false) {
    return (
      <div className="app-followups-route">
        <style>{appFollowupsStyles}</style>
        <CompositionFailure results={[taskResult]} />
      </div>
    );
  }

  const topTask = taskResult.data.tasks[0] ?? null;
  const draftResult = services.draftService.createDraft({
    contextNote: topTask?.recommendedAction,
    draftKind: "follow_up",
    organization: topTask?.organization,
    recipientName: topTask?.contactName,
  });
  const notificationResult = services.notificationService.listNotifications({
    limit: 4,
  });

  if (draftResult.success === false || notificationResult.success === false) {
    return (
      <div className="app-followups-route">
        <style>{appFollowupsStyles}</style>
        <CompositionFailure results={[taskResult, draftResult, notificationResult]} />
      </div>
    );
  }

  const topDraft = draftResult.data.drafts[0] ?? null;

  return (
    <div className="app-followups-route">
      <style>{appFollowupsStyles}</style>
      <SuccessBoundary
        draft={topDraft}
        drafts={draftResult.data}
        notifications={notificationResult.data}
        searchParams={searchParams}
        task={topTask}
        tasks={taskResult.data}
      />
      <FollowupReviewSection
        drafts={draftResult.data}
        notifications={notificationResult.data}
        tasks={taskResult.data}
      />
      <ReminderQueueSection notifications={notificationResult.data} />
    </div>
  );
}
