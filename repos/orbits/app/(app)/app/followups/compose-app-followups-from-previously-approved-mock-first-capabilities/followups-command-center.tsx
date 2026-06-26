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
    label: "No follow-ups ready",
  },
  {
    href: "/app/followups?scenario=pending",
    label: "Still checking evidence",
  },
  {
    href: "/app/followups?scenario=failure",
    label: "Follow-ups unavailable",
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
      label: "Add a relationship source",
    },
    {
      href: "/app/followups",
      label: "Show ready follow-ups",
    },
  ],
  failure: [
    {
      href: "/app/followups",
      label: "Reload follow-ups",
    },
    {
      href: "/app/followups?scenario=pending",
      label: "Check source status",
    },
  ],
  pending: [
    {
      href: "/app/followups",
      label: "Return to ready follow-ups",
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
      description:
        "Add a sourced relationship trigger before reviewing tasks, drafts, and reminders.",
      emptyState:
        "No relationship trigger has enough source evidence for follow-up review.",
      guardrail:
        "Orbit cannot create tasks, messages, reminders, or saved records from an empty relationship queue.",
      nextStep:
        "Add a relationship source; ready follow-ups appear after a sourced trigger exists.",
      purpose:
        "Keep follow-up review useful when no sourced relationship action is available.",
      title: "No follow-ups are ready",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "Task, draft, and reminder review stays paused until source evidence is ready.",
      emptyState:
        "Follow-up records stay hidden while source evidence is still being checked.",
      guardrail:
        "Orbit will not save records, schedule reminders, send messages, or deliver notifications while review is pending.",
      nextStep: "Return to ready follow-ups after source evidence is available.",
      purpose:
        "Keep follow-up work visible without exposing an unfinished recommendation.",
      title: "Follow-ups are still checking source evidence",
    };
  }

  return {
    description:
      "Follow-up tasks, drafts, and reminders are unavailable while source evidence is checked.",
    emptyState:
      "The follow-up review is unavailable until source evidence recovers.",
    guardrail:
      "Orbit will not save records, schedule reminders, send messages, or deliver notifications while this is unavailable.",
    nextStep: "Reload follow-ups before taking action.",
    purpose:
      "Show a visible recovery path when source-backed follow-up context is unavailable.",
    title: "Follow-ups could not load",
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
        <WorkbenchSurface elevated eyebrow="Follow-ups" title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Follow-up status details" className="relationship-meta">
            <div>
              <dt>What Orbit knows</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>Safety check</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>Next step</dt>
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
      <summary>Evidence details</summary>
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
        <dt>Tasks</dt>
        <dd>
          <strong>{tasks.tasks.length}</strong>
          source-backed follow-ups
        </dd>
      </div>
      <div>
        <dt>Drafts</dt>
        <dd>
          <strong>{drafts.drafts.length}</strong>
          reviewable message
        </dd>
      </div>
      <div>
        <dt>Reminders</dt>
        <dd>
          <strong>{notifications.reminders.length}</strong>
          scheduled review items
        </dd>
      </div>
      <div>
        <dt>Due today</dt>
        <dd>
          <strong>{dueToday}</strong>
          high-attention item
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
          <p className="type-caption">No promise selected</p>
          <h3 className="relationship-name">Select a sourced follow-up first</h3>
          <p className="type-body">
            A promise needs a relationship, source context, draft, and reminder
            timing before it can be reviewed.
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
        <h3 className="relationship-name">Selected promise {task.title}</h3>
        <p className="type-body">{task.recommendedAction}</p>
      </div>
      <dl aria-label="Current promise priority details" className="relationship-meta">
        <div>
          <dt>Why it matters now</dt>
          <dd>{task.rationale}</dd>
        </div>
        <div>
          <dt>Source trigger</dt>
          <dd>
            {triggerKindLabel(task.triggerKind)} from {task.source.label}
          </dd>
        </div>
        <div>
          <dt>Draft readiness</dt>
          <dd>{draftReadinessLabel(draft)}</dd>
        </div>
        <div>
          <dt>Reminder timing</dt>
          <dd>{dueSentenceLabel(task.dueInDays)}</dd>
        </div>
        <div>
          <dt>Next safe action</dt>
          <dd>Review the drafted follow-through before marking anything complete.</dd>
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
          <dt>Priority</dt>
          <dd>{priorityLabel(task.priority)}</dd>
        </div>
        <div>
          <dt>Why this matters</dt>
          <dd>{task.rationale}</dd>
        </div>
        <div>
          <dt>Source</dt>
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
          <dt>Relationship context</dt>
          <dd>{draft.relationshipContext}</dd>
        </div>
        <div>
          <dt>Confirmation</dt>
          <dd>{draft.sendActionRequiresConfirmation ? "Required before send" : "Not required"}</dd>
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
          <dt>Due</dt>
          <dd>{dueLabel(reminder.dueInDays)}</dd>
        </div>
        <div>
          <dt>Frequency</dt>
          <dd>{reminder.frequency}</dd>
        </div>
        <div>
          <dt>Source</dt>
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
        {queueSourceContext(entry, reminder)} stays with the promise workflow
        for review.
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>Review status</dt>
          <dd>{queueReviewStatusLabel(entry.status)}</dd>
        </div>
        <div>
          <dt>Delivery state</dt>
          <dd>Held until review</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={entry.evidenceIds}
        label={`${entry.queueEntryId} evidence`}
        recordIds={[entry.queueEntryId]}
      />
      <details className="followups-evidence-details">
        <summary>Queue source details</summary>
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
        <p className="type-caption">Next safe action</p>
        <h3 className="relationship-name">Review promise completion</h3>
        <p className="type-body">
          Preview what would be marked complete and what remains staged for
          review.
        </p>
      </div>
      <input name="action" type="hidden" value="complete-top-followup" />
      <button type="submit">Review promise completion</button>
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
        <strong>Completion preview ready: no follow-up selected</strong>
        <span>Selected promise: none</span>
        <span>Still staged locally: promise review, draft review, reminder review, queue hold</span>
        <span>Calendar changes: none</span>
        <span>Scheduler changes: none</span>
        <span>Messages sent: none</span>
        <span>Notifications delivered: none</span>
        <span>Saved records changed: none</span>
        <span>Automated writing calls: none</span>
        <span>Outside network requests: none</span>
        <span>Completion recorded: no</span>
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
      <strong>Completion preview ready: {task.title}</strong>
      <span>Selected promise: {task.title}</span>
      <span>
        Draft context: {draft?.subject ?? "No draft selected"} ·{" "}
        {draft?.recommendedSendWindow ?? "no send window"}
      </span>
      <span>
        Reminder context: {topReminder?.title ?? "No reminder selected"} ·{" "}
        {topReminder ? `due ${dueLabel(topReminder.dueInDays)}` : "not timed"}
      </span>
      <span>
        Still staged locally: promise review, draft review, reminder review, queue hold
      </span>
      <span>Calendar changes: none</span>
      <span>Scheduler changes: {schedulerChanged ? "review required" : "none"}</span>
      <span>Messages sent: {messageSent ? "review required" : "none"}</span>
      <span>
        Notifications delivered: {notificationDelivered ? "review required" : "none"}
      </span>
      <span>Saved records changed: none</span>
      <span>Automated writing calls: none</span>
      <span>Outside network requests: none</span>
      <span>Completion recorded: no</span>
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
        eyebrow="Follow-ups"
        title="Promise to keep next"
      >
        <p className="type-body">
          Decide whether this is the promise to keep before opening the broader
          task queue.
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
          <h3 className="relationship-name">Source status paths</h3>
          <p className="type-body">
            Open the same review when source evidence is empty, still resolving,
            or unavailable.
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
          <summary>Label details</summary>
          <p className="type-caption">Follow-up command center</p>
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
          <dt>Relationship</dt>
          <dd>{relationship}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{due}</dd>
        </div>
        <div>
          <dt>Source context</dt>
          <dd>{sourceContext}</dd>
        </div>
        <div>
          <dt>Review status</dt>
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
    <WorkbenchSurface eyebrow="Ready for review" title="Promise workflow">
      <p className="type-body">
        Read the task, draft, reminder, and delivery hold as one promise-to-send
        path before checking the rest of the queue.
      </p>
      <div className="followups-workflow-list">
        {task && (
          <PromiseWorkflowCard
            due={dueSentenceLabel(task.dueInDays)}
            evidenceIds={task.evidenceIds}
            relationship={`${task.contactName} · ${task.organization}`}
            reviewStatus="Held for local review"
            sourceContext={task.source.label}
            stepLabel="Task to decide"
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
            stepLabel="Message draft to review"
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
            reviewStatus="Held for local review"
            sourceContext={reminder.source.label}
            stepLabel="Reminder to keep visible"
            title={reminder.title}
          >
            <p className="type-body">{reminder.recommendedWindow}</p>
          </PromiseWorkflowCard>
        )}
        {queueEntry && (
          <PromiseWorkflowCard
            due={reminder ? dueSentenceLabel(reminder.dueInDays) : "Not timed"}
            evidenceIds={queueEntry.evidenceIds}
            relationship={
              reminder
                ? `${reminder.contactName} · ${reminder.organization}`
                : "Selected relationship"
            }
            reviewStatus={queueReviewStatusLabel(queueEntry.status)}
            sourceContext={queueSourceContext(queueEntry, reminder)}
            stepLabel="Queue hold before delivery"
            title={queueEntryLabel(queueEntry, reminder)}
          >
            <p className="type-body">
              Delivery stays staged until the promise and message are reviewed.
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
    <WorkbenchSurface eyebrow="Reminder queue" title="Review before delivery">
      <p className="type-body">
        Check reminder timing and relationship context before choosing any
        future delivery step.
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
      <WorkbenchSurface elevated eyebrow="Follow-ups" title="Follow-ups could not load">
        <p className="type-body">
          Follow-up tasks, drafts, and reminders are unavailable while source
          evidence is checked.
        </p>
        <dl aria-label="Follow-up status details" className="relationship-meta">
          <div>
            <dt>Current status</dt>
            <dd>Review is paused until the source-backed follow-up data returns.</dd>
          </div>
          <div>
            <dt>Safety check</dt>
            <dd>No saved record, message, reminder, or notification changed.</dd>
          </div>
          <div>
            <dt>Error</dt>
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
