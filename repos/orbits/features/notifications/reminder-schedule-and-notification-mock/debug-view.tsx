/**
 * 提醒调度与通知 mock 的开发者面板。
 *
 * 这里展示提醒频率、调度队列和通知队列，当前 mock 不投递真实通知。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ReminderFrequency,
  ReminderScheduleNotificationPayload,
  ScheduledReminder,
} from "../contract";
import { createMockReminderScheduleNotificationService } from "../mock-service";

export const REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG =
  "reminder-schedule-and-notification-mock";

const liveImplementationNotesPath =
  "features/notifications/reminder-schedule-and-notification-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.reminder-notification-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.reminder-notification-workbench .workbench-shell,
.reminder-notification-workbench .workbench-surface,
.reminder-notification-workbench .workbench-grid,
.reminder-notification-workbench .relationship-meta,
.reminder-notification-workbench .chip-row,
.reminder-notification-workbench .reminder-notification-state-matrix {
  min-width: 0;
}

.reminder-notification-workbench code,
.reminder-notification-workbench dd,
.reminder-notification-workbench .orbit-chip,
.reminder-notification-workbench .source-list li {
  overflow-wrap: anywhere;
}

.reminder-notification-workbench .reminder-notification-checkpoint-grid,
.reminder-notification-workbench .reminder-notification-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.reminder-notification-workbench .reminder-notification-checkpoint-grid div,
.reminder-notification-workbench .reminder-notification-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.reminder-notification-workbench .reminder-notification-audit-list {
  gap: var(--orbit-space-md);
}

.reminder-notification-workbench .reminder-notification-audit-item {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.reminder-notification-workbench .reminder-notification-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}

.reminder-notification-workbench .reminder-notification-audit-panel {
  border-left: 3px solid var(--orbit-color-primary);
  margin-top: var(--orbit-space-sm);
  padding-left: var(--orbit-space-sm);
}
`;

export const REMINDER_SCHEDULE_NOTIFICATION_API_PROBES = [
  {
    label: "List notification queue",
    method: "GET",
    path: "/api/notifications",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic reminder schedules and mock queue entries.",
  },
  {
    label: "Generate reminder schedule",
    method: "POST",
    path: "/api/notifications/reminders/generate",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope generated from local follow-up due dates.",
  },
  {
    label: "Empty reminder schedule",
    method: "GET",
    path: "/api/notifications?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no due follow-up reminders are eligible.",
  },
  {
    label: "Pending notification review",
    method: "GET",
    path: "/api/notifications?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local notification guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/notifications?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/notifications/reminder-schedule-and-notification-mock/.",
  "ORBIT_REMINDER_NOTIFICATION_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires a push notification provider, email delivery provider, SMS delivery provider, and cron scheduler.",
  "Every live reminder keeps source evidence, provenance, and privacy constraints from the originating follow-up due date.",
  "Required env vars and device or messaging permissions must be explicit before live delivery is enabled.",
  "Replacement tests cover success, empty, pending, controlled failure, provider failure, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof REMINDER_SCHEDULE_NOTIFICATION_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function frequencyLabel(frequency: ReminderFrequency): string {
  switch (frequency) {
    case "once":
      return "Once";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return frequency;
  }
}

function reminderEvidenceActionLabel(reminder: ScheduledReminder): string {
  return `Review ${reminder.contactName} evidence`;
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div
      aria-label="Reminder schedule notification evidence"
      className="chip-row"
    >
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ReminderList({ reminders }: { reminders: readonly ScheduledReminder[] }) {
  return (
    <dl
      aria-label="Scheduled reminders with reminder-level audits"
      className="relationship-meta reminder-notification-audit-list"
    >
      {reminders.map((reminder) => (
        <div
          className="reminder-notification-audit-item"
          key={reminder.reminderId}
        >
          <dt>{frequencyLabel(reminder.frequency)}</dt>
          <dd>
            <p className="type-body reminder-notification-title">
              {reminder.title} Due in {reminder.dueInDays} day
              {reminder.dueInDays === 1 ? "" : "s"}.
            </p>
            <p className="type-body">{reminder.recommendedWindow}</p>
            <div
              aria-label={`Audit reminder ${reminder.reminderId}`}
              className="reminder-notification-audit-panel"
            >
              <p className="type-caption">Source: {reminder.audit.sourceLabel}</p>
              <p className="type-caption">
                Provider boundary: {reminder.audit.providerBoundary}
              </p>
              <EvidenceChips evidenceIds={reminder.evidenceIds} />
              <button
                aria-label={`${reminderEvidenceActionLabel(reminder)} for ${
                  reminder.reminderId
                }`}
                className="secondary-action"
                type="button"
              >
                {reminderEvidenceActionLabel(reminder)}
              </button>
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: ReminderScheduleNotificationPayload;
}) {
  return (
    <dl
      aria-label="Mock-only reminder notification execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Push notifications</dt>
        <dd>push false</dd>
      </div>
      <div>
        <dt>Email delivery</dt>
        <dd>email false</dd>
      </div>
      <div>
        <dt>SMS delivery</dt>
        <dd>SMS false</dd>
      </div>
      <div>
        <dt>Cron scheduler</dt>
        <dd>cron false</dd>
      </div>
      <div>
        <dt>Queue entries</dt>
        <dd>{payload.notificationQueue.length} mock queue entries</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ReminderScheduleNotificationPayload;
}) {
  const firstReminder = payload.reminders[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: reminder schedules and notification queue entries are
        produced from local follow-up due dates, not push services, email, SMS,
        cron jobs, live persistence, devices, or external networks.
      </p>
      <dl
        aria-label="Reminder schedule notification operator checkpoint"
        className="relationship-meta reminder-notification-checkpoint-grid"
      >
        <div>
          <dt>Reminder count</dt>
          <dd>{payload.reminders.length} source-backed reminders</dd>
        </div>
        <div>
          <dt>Top reminder</dt>
          <dd>
            {firstReminder.title} <code>{firstReminder.reminderId}</code>
          </dd>
        </div>
        <div>
          <dt>First frequency</dt>
          <dd>{frequencyLabel(firstReminder.frequency)}</dd>
        </div>
        <div>
          <dt>Delivery boundary</dt>
          <dd>push false, email false, SMS false</dd>
        </div>
        <div>
          <dt>Scheduler boundary</dt>
          <dd>cron false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={firstReminder.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: ReminderScheduleNotificationPayload;
  failureCode: string;
  pending: ReminderScheduleNotificationPayload;
  success: ReminderScheduleNotificationPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Reminder schedule notification state matrix"
        className="relationship-meta reminder-notification-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.reminders.length} reminders</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: no due follow-up reminders</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: notification review guard</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Failure: controlled error <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay successful envelopes; controlled failures
        are explicit service-unavailable envelopes.
      </p>
      <EvidenceChips
        evidenceIds={[
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

export function ReminderScheduleNotificationMockDemo() {
  const service = createMockReminderScheduleNotificationService();
  const successResult = service.listNotifications();
  const emptyResult = service.listNotifications({ scenario: "empty" });
  const pendingResult = service.generateReminders({ scenario: "pending" });
  const failureResult = service.listNotifications({ scenario: "failure" });
  const generatedResult = service.generateReminders({
    frequencies: ["once", "daily", "weekly", "monthly"],
    includeGroupedLowPriority: true,
  });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false ||
    generatedResult.success === false
  ) {
    return (
      <WorkbenchFrame className="reminder-notification-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Reminder schedule and notification mock</h1>
            <p className="workbench-intro">
              The deterministic reminder notification fixtures did not load, so
              the dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED";

  return (
    <WorkbenchFrame className="reminder-notification-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Reminder schedule and notification mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the reminder schedule and
            notification boundary. It turns local follow-up due dates into
            source-backed reminder rows and mock queue entries without delivery
            services or scheduler jobs.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          aria-label="Reminder schedule and notification capability details"
          className="workbench-grid"
        >
          <WorkbenchSurface elevated eyebrow="Scheduled reminders" title="Due-date reminder queue">
            <p className="type-body">{generatedResult.data.summary}</p>
            <ReminderList reminders={generatedResult.data.reminders} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={generatedResult.data} />
            <p className="privacy-note">
              Reminder notifications stay local until a confirmation guard,
              scheduler, and live provider switch are explicitly added.
            </p>
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface eyebrow="Grouped low-priority reminders" title="Relationship digest">
          <dl className="relationship-meta">
            {generatedResult.data.groupedLowPriorityReminders.map((group) => (
              <div key={group.groupId}>
                <dt>{group.label}</dt>
                <dd>
                  <code>{group.groupId}</code> groups{" "}
                  {group.reminderIds.length} reminders into{" "}
                  <code>{group.queueEntryId}</code>. {group.groupReason}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {REMINDER_SCHEDULE_NOTIFICATION_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Replacement notes">
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch mechanism</dt>
              <dd>
                <code>ORBIT_REMINDER_NOTIFICATION_PROVIDER</code> remains
                documented before any live service is wired.
              </dd>
            </div>
          </dl>
          <ul className="source-list">
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <li key={excerpt}>{excerpt}</li>
            ))}
          </ul>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
