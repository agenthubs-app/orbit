import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  AppBootstrapAgentAction,
  AppBootstrapPayload,
  AppBootstrapPendingTask,
  AppBootstrapProvenance,
  AppBootstrapUpcomingEvent,
} from "../contract";
import { createMockAppBootstrapService } from "../mock-service";

export const APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG =
  "app-bootstrap-mock-aggregator";

const liveImplementationNotesPath =
  "features/bootstrap/app-bootstrap-mock-aggregator/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.app-bootstrap-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.app-bootstrap-workbench .workbench-shell,
.app-bootstrap-workbench .workbench-surface,
.app-bootstrap-workbench .workbench-grid,
.app-bootstrap-workbench .relationship-meta,
.app-bootstrap-workbench .chip-row,
.app-bootstrap-workbench .app-bootstrap-metric-grid,
.app-bootstrap-workbench .app-bootstrap-state-matrix,
.app-bootstrap-workbench .app-bootstrap-state-inspectors,
.app-bootstrap-workbench .app-bootstrap-boundary-grid,
.app-bootstrap-workbench .app-bootstrap-list {
  min-width: 0;
}

.app-bootstrap-workbench code,
.app-bootstrap-workbench dd,
.app-bootstrap-workbench .orbit-chip,
.app-bootstrap-workbench .source-list li {
  overflow-wrap: anywhere;
}

.app-bootstrap-workbench .app-bootstrap-metric-grid,
.app-bootstrap-workbench .app-bootstrap-state-matrix,
.app-bootstrap-workbench .app-bootstrap-boundary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.app-bootstrap-workbench .app-bootstrap-metric-card,
.app-bootstrap-workbench .app-bootstrap-state-matrix div,
.app-bootstrap-workbench .app-bootstrap-boundary-grid div,
.app-bootstrap-workbench .app-bootstrap-list-item {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-bootstrap-workbench .app-bootstrap-metric-card strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
}

.app-bootstrap-workbench .app-bootstrap-list {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-bootstrap-workbench .app-bootstrap-list-item {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-bootstrap-workbench .app-bootstrap-state-inspectors {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-bootstrap-workbench .app-bootstrap-state-inspector {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 3px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-bootstrap-workbench .app-bootstrap-state-inspector summary {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: var(--orbit-space-sm);
  justify-content: space-between;
}
`;

const appBootstrapApiProbes = [
  {
    label: "App bootstrap",
    command: "GET /api/app/bootstrap",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary.",
  },
  {
    label: "Empty bootstrap",
    command: "GET /api/app/bootstrap?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no sourced relationships are available.",
  },
  {
    label: "Pending bootstrap",
    command: "GET /api/app/bootstrap?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local aggregate refresh is unresolved.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/app/bootstrap?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with APP_BOOTSTRAP_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/bootstrap/app-bootstrap-mock-aggregator/.",
  "ORBIT_APP_BOOTSTRAP_PROVIDER switches deterministic fixtures to live providers.",
  "Live providers replace mock first-screen aggregation with server-side personalization and live database aggregation.",
  "Calendar permission, email permission, and notification permission are required before those signals affect the bootstrap.",
  "privacy and provenance stay attached to every first-screen aggregate field.",
  "replacement tests cover success, empty, pending, controlled failure, and mock provider guards.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="App bootstrap evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function MetricCards({ payload }: { payload: AppBootstrapPayload }) {
  const metrics = [
    {
      label: "Connection summary",
      value: payload.connectionSummary.totalContacts,
      detail: `${payload.connectionSummary.totalConnections} connections, ${payload.connectionSummary.evidenceBackedConnections} evidence-backed`,
    },
    {
      label: "Pending tasks",
      value: payload.pendingTasks.length,
      detail: `${payload.dashboardSummary.pendingFollowups} followups in the dashboard summary`,
    },
    {
      label: "Top agent actions",
      value: payload.topAgentActions.length,
      detail: `${payload.topAgentActions.filter((action) => action.confirmationRequired).length} require confirmation`,
    },
    {
      label: "Dashboard summary",
      value: payload.dashboardSummary.relationshipAssets,
      detail: `${payload.dashboardSummary.highValueRelationships} high-value relationships`,
    },
    {
      label: "Notification summary",
      value: payload.notificationSummary.unreadCount,
      detail: `${payload.notificationSummary.pendingDeliveryCount} pending deliveries`,
    },
  ] as const;

  return (
    <div
      aria-label="App bootstrap metric cards"
      className="workbench-grid app-bootstrap-metric-grid"
    >
      {metrics.map((metric) => (
        <article className="app-bootstrap-metric-card" key={metric.label}>
          <span className="type-caption">{metric.label}</span>
          <strong>{metric.value}</strong>
          <p className="type-body">{metric.detail}</p>
        </article>
      ))}
    </div>
  );
}

function EventList({ events }: { events: readonly AppBootstrapUpcomingEvent[] }) {
  return (
    <div aria-label="App bootstrap upcoming events" className="app-bootstrap-list">
      {events.map((event) => (
        <article className="app-bootstrap-list-item" key={event.eventId}>
          <p className="type-caption">{event.locationLabel}</p>
          <h3 className="relationship-name">{event.title}</h3>
          <p className="type-body">
            {event.startsAt} - {event.readinessLabel}
          </p>
          <p className="type-body">{event.goal}</p>
          <EvidenceChips evidenceIds={event.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function TaskList({ tasks }: { tasks: readonly AppBootstrapPendingTask[] }) {
  return (
    <dl className="relationship-meta" aria-label="App bootstrap pending tasks">
      {tasks.map((task) => (
        <div key={task.taskId}>
          <dt>
            {task.title} <code>{task.dueLabel}</code>
          </dt>
          <dd>
            {task.contactName}: {task.recommendedAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AgentActionList({
  actions,
}: {
  actions: readonly AppBootstrapAgentAction[];
}) {
  return (
    <dl className="relationship-meta" aria-label="App bootstrap top agent actions">
      {actions.map((action) => (
        <div key={action.actionId}>
          <dt>
            {action.title} <code>{action.actionType}</code>
          </dt>
          <dd>
            {action.recommendedAction} Confirmation required{" "}
            {String(action.confirmationRequired)}.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: AppBootstrapProvenance;
}) {
  return (
    <dl
      className="relationship-meta app-bootstrap-boundary-grid"
      aria-label="App bootstrap mock-only execution checks"
    >
      <div>
        <dt>Personalization</dt>
        <dd>
          server-side personalization{" "}
          {String(provenance.serverSidePersonalizationExecuted)}
        </dd>
      </div>
      <div>
        <dt>Live aggregation</dt>
        <dd>
          live database aggregation{" "}
          {String(provenance.liveDatabaseAggregationExecuted)}
        </dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>external network requested {String(provenance.externalNetworkRequested)}</dd>
      </div>
      <div>
        <dt>Database reads</dt>
        <dd>database reads {String(provenance.databaseReadExecuted)}</dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>database writes {String(provenance.databaseWriteExecuted)}</dd>
      </div>
      <div>
        <dt>AI provider</dt>
        <dd>AI provider requested {String(provenance.aiProviderRequested)}</dd>
      </div>
      <div>
        <dt>Email and calendar</dt>
        <dd>
          email {String(provenance.emailProviderRequested)}; calendar{" "}
          {String(provenance.calendarProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          notification provider requested{" "}
          {String(provenance.notificationProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Device APIs</dt>
        <dd>device requested {String(provenance.deviceRequested)}</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({ payload }: { payload: AppBootstrapPayload }) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="App bootstrap stays evidence-backed"
    >
      <p className="type-body">
        Scan this first: the aggregate combines first-screen account, profile,
        upcoming events, connection summary, pending tasks, top agent actions,
        dashboard summary, permission summary, and notification summary from
        deterministic local fixtures.
      </p>
      <dl
        aria-label="App bootstrap operator checkpoint"
        className="relationship-meta app-bootstrap-boundary-grid"
      >
        <div>
          <dt>State</dt>
          <dd>
            <code>{payload.state}</code>
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{payload.account?.workspaceName ?? "No workspace"}</dd>
        </div>
        <div>
          <dt>Profile</dt>
          <dd>{payload.profile?.displayName ?? "No profile"}</dd>
        </div>
        <div>
          <dt>Upcoming events</dt>
          <dd>{payload.upcomingEvents.length} local events</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={payload.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: AppBootstrapPayload;
  failureCode: string;
  pending: AppBootstrapPayload;
  success: AppBootstrapPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="App bootstrap state matrix"
        className="relationship-meta app-bootstrap-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.connectionSummary.totalContacts} contacts</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: {empty.summary}</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: {pending.nextAction}</dd>
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
        use a service-unavailable envelope.
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

function StateInspectors({
  empty,
  failureAppCode,
  failureCode,
  failureEvidenceIds,
  failureMessage,
  pending,
  success,
}: {
  empty: AppBootstrapPayload;
  failureAppCode: string;
  failureCode: string;
  failureEvidenceIds: readonly string[];
  failureMessage: string;
  pending: AppBootstrapPayload;
  success: AppBootstrapPayload;
}) {
  const successStates = [
    {
      label: "Inspect success bootstrap",
      status: 200,
      command: "GET /api/app/bootstrap",
      envelope: "success envelope",
      state: success.state,
      summary: success.summary,
      nextAction: success.nextAction,
      counts: `${success.upcomingEvents.length} events, ${success.pendingTasks.length} tasks, ${success.topAgentActions.length} agent actions`,
      evidenceIds: success.provenance.evidenceIds,
      open: true,
    },
    {
      label: "Inspect empty bootstrap",
      status: 200,
      command: "GET /api/app/bootstrap?scenario=empty",
      envelope: "success envelope",
      state: empty.state,
      summary: empty.summary,
      nextAction: empty.nextAction,
      counts: `${empty.upcomingEvents.length} events, ${empty.pendingTasks.length} tasks, ${empty.topAgentActions.length} agent actions`,
      evidenceIds: empty.provenance.evidenceIds,
      open: false,
    },
    {
      label: "Inspect pending bootstrap",
      status: 200,
      command: "GET /api/app/bootstrap?scenario=pending",
      envelope: "success envelope",
      state: pending.state,
      summary: pending.summary,
      nextAction: pending.nextAction,
      counts: `${pending.upcomingEvents.length} events, ${pending.pendingTasks.length} tasks, ${pending.topAgentActions.length} agent actions`,
      evidenceIds: pending.provenance.evidenceIds,
      open: false,
    },
  ] as const;

  return (
    <WorkbenchSurface
      eyebrow="State inspectors"
      title="Inspect each bootstrap state"
    >
      <div
        aria-label="App bootstrap state inspectors"
        className="app-bootstrap-state-inspectors"
      >
        {successStates.map((state) => (
          <details
            className="app-bootstrap-state-inspector"
            key={state.command}
            open={state.open}
          >
            <summary>
              <span>{state.label}</span>
              <code>
                {state.status} {state.envelope}
              </code>
            </summary>
            <dl className="relationship-meta">
              <div>
                <dt>API probe</dt>
                <dd>
                  <code style={pathWrapStyle}>{state.command}</code>
                </dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{state.state}</dd>
              </div>
              <div>
                <dt>Aggregate counts</dt>
                <dd>{state.counts}</dd>
              </div>
              <div>
                <dt>Summary</dt>
                <dd>{state.summary}</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>{state.nextAction}</dd>
              </div>
            </dl>
            <EvidenceChips evidenceIds={state.evidenceIds} />
          </details>
        ))}

        <details className="app-bootstrap-state-inspector">
          <summary>
            <span>Inspect failure bootstrap</span>
            <code>503 failure envelope</code>
          </summary>
          <dl className="relationship-meta">
            <div>
              <dt>API probe</dt>
              <dd>
                <code style={pathWrapStyle}>
                  GET /api/app/bootstrap?scenario=failure
                </code>
              </dd>
            </div>
            <div>
              <dt>Controlled code</dt>
              <dd>
                <code>{failureCode}</code>
              </dd>
            </div>
            <div>
              <dt>App error</dt>
              <dd>
                <code>{failureAppCode}</code>
              </dd>
            </div>
            <div>
              <dt>Message</dt>
              <dd>{failureMessage}</dd>
            </div>
          </dl>
          <EvidenceChips evidenceIds={failureEvidenceIds} />
        </details>
      </div>
    </WorkbenchSurface>
  );
}

export function AppBootstrapMockAggregatorDemo() {
  const bootstrapService = createMockAppBootstrapService();
  const successResult = bootstrapService.getAppBootstrap();
  const emptyResult = bootstrapService.getAppBootstrap({ scenario: "empty" });
  const pendingResult = bootstrapService.getAppBootstrap({ scenario: "pending" });
  const failureResult = bootstrapService.getAppBootstrap({
    scenario: "failure",
  });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="app-bootstrap-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>App bootstrap mock aggregator</h1>
            <p className="workbench-intro">
              The deterministic app bootstrap fixtures did not load, so this dev
              surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "APP_BOOTSTRAP_MOCK_FAILED";
  const failureAppCode =
    failureResult.success === false
      ? failureResult.error.appCode
      : "SERVICE_UNAVAILABLE";
  const failureMessage =
    failureResult.success === false
      ? failureResult.error.message
      : "The app bootstrap mock aggregator is pinned to a controlled failure scenario.";
  const failureEvidenceIds =
    failureResult.success === false
      ? failureResult.error.evidenceIds
      : ["failure-bootstrap-1"];

  return (
    <WorkbenchFrame className="app-bootstrap-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>App bootstrap mock aggregator</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the first-screen bootstrap boundary.
            The page reads the mock service for success, empty, pending, and
            failure states before any live personalization or aggregate provider
            exists.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="App bootstrap capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG}
            title="Success state"
          >
            <p className="type-body">{successResult.data.summary}</p>
            <MetricCards payload={successResult.data} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks provenance={successResult.data.provenance} />
            <p className="privacy-note">
              App bootstrap data stays local until the documented provider
              switch and replacement tests are added.
            </p>
          </WorkbenchSurface>
        </section>

        <section
          className="workbench-grid"
          aria-label="App bootstrap relationship details"
        >
          <WorkbenchSurface eyebrow="First-screen account" title="Account context">
            <dl className="relationship-meta">
              <div>
                <dt>{successResult.data.account?.workspaceName}</dt>
                <dd>
                  {successResult.data.account?.role} in{" "}
                  {successResult.data.account?.timezone}
                </dd>
              </div>
            </dl>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Profile summary" title={successResult.data.profile?.displayName ?? "Profile"}>
            <p className="type-body">{successResult.data.profile?.headline}</p>
            <p className="type-body">
              {successResult.data.profile?.relationshipGoal}
            </p>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Upcoming events" title="Event readiness">
            <EventList events={successResult.data.upcomingEvents} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Connection summary" title="Relationship asset totals">
            <dl className="relationship-meta">
              <div>
                <dt>Evidence-backed connections</dt>
                <dd>
                  {successResult.data.connectionSummary.evidenceBackedConnections}
                </dd>
              </div>
              <div>
                <dt>Dormant contacts</dt>
                <dd>{successResult.data.connectionSummary.dormantContacts}</dd>
              </div>
            </dl>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Pending tasks" title="Recommended relationship work">
            <TaskList tasks={successResult.data.pendingTasks} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Top agent actions" title="Action queue preview">
            <AgentActionList actions={successResult.data.topAgentActions} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Permission summary" title="Staged authorization">
            <dl className="relationship-meta">
              <div>
                <dt>Granted</dt>
                <dd>{successResult.data.permissionSummary.grantedPermissions.join(", ")}</dd>
              </div>
              <div>
                <dt>Staged</dt>
                <dd>{successResult.data.permissionSummary.stagedPermissions.join(", ")}</dd>
              </div>
            </dl>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Notification summary" title="Delivery preview">
            <p className="type-body">
              {successResult.data.notificationSummary.latestNotification}
            </p>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <StateInspectors
          empty={emptyResult.data}
          failureAppCode={failureAppCode}
          failureCode={failureCode}
          failureEvidenceIds={failureEvidenceIds}
          failureMessage={failureMessage}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Declared probes"
        >
          <dl
            className="relationship-meta"
            aria-label="App bootstrap API probe details"
          >
            {appBootstrapApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code> returns{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes"
        >
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
                <code>ORBIT_APP_BOOTSTRAP_PROVIDER</code> remains documented
                before live bootstrap providers are wired.
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
