import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  DashboardAggregatePayload,
  DashboardAggregateProvenance,
  DashboardDormantContact,
  DashboardFollowupTask,
  DashboardHighValueRelationship,
  DashboardNewContact,
  DashboardRecentActivity,
} from "../contract";
import { createMockDashboardAggregateService } from "../mock-service";

export const DASHBOARD_AGGREGATE_MOCK_SLUG = "dashboard-aggregate-mock";

const liveImplementationNotesPath =
  "features/dashboard/dashboard-aggregate-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.dashboard-aggregate-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.dashboard-aggregate-workbench .workbench-shell,
.dashboard-aggregate-workbench .workbench-surface,
.dashboard-aggregate-workbench .workbench-grid,
.dashboard-aggregate-workbench .relationship-meta,
.dashboard-aggregate-workbench .chip-row,
.dashboard-aggregate-workbench .dashboard-aggregate-metric-grid,
.dashboard-aggregate-workbench .dashboard-aggregate-state-matrix,
.dashboard-aggregate-workbench .dashboard-aggregate-activity-list {
  min-width: 0;
}

.dashboard-aggregate-workbench code,
.dashboard-aggregate-workbench dd,
.dashboard-aggregate-workbench .orbit-chip,
.dashboard-aggregate-workbench .source-list li {
  overflow-wrap: anywhere;
}

.dashboard-aggregate-workbench .dashboard-aggregate-metric-grid,
.dashboard-aggregate-workbench .dashboard-aggregate-state-matrix,
.dashboard-aggregate-workbench .dashboard-aggregate-boundary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.dashboard-aggregate-workbench .dashboard-aggregate-metric-card,
.dashboard-aggregate-workbench .dashboard-aggregate-state-matrix div,
.dashboard-aggregate-workbench .dashboard-aggregate-boundary-grid div,
.dashboard-aggregate-workbench .dashboard-aggregate-activity-item {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.dashboard-aggregate-workbench .dashboard-aggregate-metric-card strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
}

.dashboard-aggregate-workbench .dashboard-aggregate-activity-list {
  display: grid;
  gap: var(--orbit-space-sm);
}

.dashboard-aggregate-workbench .dashboard-aggregate-activity-item {
  border-left: 3px solid var(--orbit-color-evidence);
}
`;

const dashboardAggregateApiProbes = [
  {
    label: "Dashboard aggregate",
    command: "GET /api/dashboard",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with relationship asset totals, new contacts, high-value count, pending followups, dormant contacts, and recent activity.",
  },
  {
    label: "Dashboard summary",
    command: "GET /api/dashboard/summary",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the rule-based summary metrics.",
  },
  {
    label: "Empty dashboard aggregate",
    command: "GET /api/dashboard?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no sourced relationships are available.",
  },
  {
    label: "Pending dashboard aggregate",
    command: "GET /api/dashboard?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the fixture refresh is unresolved.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/dashboard?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with DASHBOARD_AGGREGATE_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/dashboard/dashboard-aggregate-mock/.",
  "ORBIT_DASHBOARD_AGGREGATE_PROVIDER switches mock fixtures to live providers.",
  "Live providers replace fixture totals with approved analytics queries and materialized aggregate reads.",
  "Calendar permission and email permission are required before those signals can affect the aggregate.",
  "privacy and provenance stay attached to every dashboard aggregate metric.",
  "replacement tests cover success, empty, pending, controlled failure, and mock provider guards.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Dashboard aggregate evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function MetricCards({ payload }: { payload: DashboardAggregatePayload }) {
  const metrics = [
    {
      label: "Relationship asset totals",
      value: payload.relationshipAssetTotals.contacts,
      detail: `${payload.relationshipAssetTotals.connections} connections, ${payload.relationshipAssetTotals.evidenceBackedRelationships} evidence-backed`,
    },
    {
      label: "New contacts",
      value: payload.newContacts.count,
      detail: payload.newContacts.windowLabel,
    },
    {
      label: "High-value relationships",
      value: payload.highValueCount,
      detail: `${payload.highValueRelationships.length} highlighted relationships`,
    },
    {
      label: "Pending followups",
      value: payload.pendingFollowups.count,
      detail: `${payload.pendingFollowups.tasks.length} visible tasks`,
    },
    {
      label: "Dormant contacts",
      value: payload.dormantContacts.count,
      detail: `${payload.dormantContacts.contacts.length} sample contacts`,
    },
  ] as const;

  return (
    <div
      aria-label="Dashboard aggregate metric cards"
      className="workbench-grid dashboard-aggregate-metric-grid"
    >
      {metrics.map((metric) => (
        <article className="dashboard-aggregate-metric-card" key={metric.label}>
          <span className="type-caption">{metric.label}</span>
          <strong>{metric.value}</strong>
          <p className="type-body">{metric.detail}</p>
        </article>
      ))}
    </div>
  );
}

function NewContactList({
  contacts,
}: {
  contacts: readonly DashboardNewContact[];
}) {
  return (
    <dl className="relationship-meta" aria-label="Dashboard new contacts">
      {contacts.map((contact) => (
        <div key={contact.contactId}>
          <dt>{contact.name}</dt>
          <dd>
            {contact.organization} from {contact.sourceLabel}. Evidence{" "}
            <code>{contact.evidenceIds.join(", ")}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HighValueList({
  relationships,
}: {
  relationships: readonly DashboardHighValueRelationship[];
}) {
  return (
    <dl
      className="relationship-meta"
      aria-label="Dashboard high-value relationships"
    >
      {relationships.map((relationship) => (
        <div key={relationship.connectionId}>
          <dt>
            {relationship.contactName}{" "}
            <code>{relationship.priorityScore}</code>
          </dt>
          <dd>
            {relationship.organization}: {relationship.reason}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FollowupList({ tasks }: { tasks: readonly DashboardFollowupTask[] }) {
  return (
    <dl className="relationship-meta" aria-label="Dashboard pending followups">
      {tasks.map((task) => (
        <div key={task.taskId}>
          <dt>
            {task.contactName} <code>{task.dueLabel}</code>
          </dt>
          <dd>{task.recommendedAction}</dd>
        </div>
      ))}
    </dl>
  );
}

function DormantList({
  contacts,
}: {
  contacts: readonly DashboardDormantContact[];
}) {
  return (
    <dl className="relationship-meta" aria-label="Dashboard dormant contacts">
      {contacts.map((contact) => (
        <div key={contact.contactId}>
          <dt>
            {contact.contactName} <code>{contact.lastTouchpointDays} days</code>
          </dt>
          <dd>
            {contact.organization}: {contact.suggestedAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentActivityList({
  activity,
}: {
  activity: readonly DashboardRecentActivity[];
}) {
  return (
    <div
      aria-label="Dashboard recent activity"
      className="dashboard-aggregate-activity-list"
    >
      {activity.map((item) => (
        <article
          className="dashboard-aggregate-activity-item"
          key={item.activityId}
        >
          <p className="type-caption">{item.sourceLabel}</p>
          <h3 className="relationship-name">{item.label}</h3>
          <p className="type-body">
            <code>{item.type}</code> at {item.occurredAt}
          </p>
          <EvidenceChips evidenceIds={item.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: DashboardAggregateProvenance;
}) {
  return (
    <dl
      className="relationship-meta dashboard-aggregate-boundary-grid"
      aria-label="Dashboard aggregate mock-only execution checks"
    >
      <div>
        <dt>Live analytics</dt>
        <dd>
          live analytics queries {String(provenance.liveAnalyticsQueryExecuted)}
        </dd>
      </div>
      <div>
        <dt>Materialized aggregates</dt>
        <dd>
          production materialized aggregates{" "}
          {String(provenance.productionAggregateReadExecuted)}
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

function OperatorCheckpoint({ payload }: { payload: DashboardAggregatePayload }) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Dashboard aggregate stays evidence-backed"
    >
      <p className="type-body">
        Scan this first: the aggregate combines relationship asset totals, new
        contacts, high-value count, pending followups, dormant contacts, and
        recent activity from deterministic local fixtures.
      </p>
      <dl
        aria-label="Dashboard aggregate operator checkpoint"
        className="relationship-meta dashboard-aggregate-boundary-grid"
      >
        <div>
          <dt>State</dt>
          <dd>
            <code>{payload.state}</code>
          </dd>
        </div>
        <div>
          <dt>Relationship assets</dt>
          <dd>{payload.relationshipAssetTotals.contacts} contacts</dd>
        </div>
        <div>
          <dt>Evidence-backed</dt>
          <dd>
            {payload.relationshipAssetTotals.evidenceBackedRelationships}{" "}
            relationships
          </dd>
        </div>
        <div>
          <dt>Recent activity</dt>
          <dd>{payload.recentActivity.length} local events</dd>
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
  empty: DashboardAggregatePayload;
  failureCode: string;
  pending: DashboardAggregatePayload;
  success: DashboardAggregatePayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Dashboard aggregate state matrix"
        className="relationship-meta dashboard-aggregate-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.relationshipAssetTotals.contacts} contacts</dd>
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

export function DashboardAggregateMockDemo() {
  const dashboardService = createMockDashboardAggregateService();
  const successResult = dashboardService.getDashboardAggregate();
  const summaryResult = dashboardService.getDashboardSummary();
  const emptyResult = dashboardService.getDashboardAggregate({
    scenario: "empty",
  });
  const pendingResult = dashboardService.getDashboardAggregate({
    scenario: "pending",
  });
  const failureResult = dashboardService.getDashboardAggregate({
    scenario: "failure",
  });

  if (
    successResult.success === false ||
    summaryResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="dashboard-aggregate-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Dashboard aggregate mock</h1>
            <p className="workbench-intro">
              The deterministic dashboard aggregate fixtures did not load, so
              this dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "DASHBOARD_AGGREGATE_MOCK_FAILED";

  return (
    <WorkbenchFrame className="dashboard-aggregate-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Dashboard aggregate mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the dashboard aggregate boundary.
            The page reads the mock service for success, empty, pending, and
            failure states before any live analytics provider exists.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Dashboard aggregate capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={DASHBOARD_AGGREGATE_MOCK_SLUG}
            title="Success state"
          >
            <p className="type-body">{successResult.data.summary}</p>
            <MetricCards payload={successResult.data} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks provenance={successResult.data.provenance} />
            <p className="privacy-note">
              Dashboard aggregate data stays local until the documented provider
              switch and replacement tests are added.
            </p>
          </WorkbenchSurface>
        </section>

        <section
          className="workbench-grid"
          aria-label="Dashboard aggregate relationship details"
        >
          <WorkbenchSurface eyebrow="Relationship acquisition" title="New contacts">
            <NewContactList contacts={successResult.data.newContacts.contacts} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Relationship priority" title="High-value relationships">
            <HighValueList
              relationships={successResult.data.highValueRelationships}
            />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Relationship work" title="Pending followups">
            <FollowupList tasks={successResult.data.pendingFollowups.tasks} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Relationship recency" title="Dormant contacts">
            <DormantList contacts={successResult.data.dormantContacts.contacts} />
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface eyebrow="Timeline" title="Recent activity">
          <RecentActivityList activity={successResult.data.recentActivity} />
        </WorkbenchSurface>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <WorkbenchSurface eyebrow="Summary route" title="Rule-based summary">
          <p className="type-body">{summaryResult.data.summary}</p>
          <dl className="relationship-meta">
            {summaryResult.data.metrics.map((metric) => (
              <div key={metric.id}>
                <dt>{metric.label}</dt>
                <dd>
                  {metric.value} from {metric.evidenceIds.length} evidence ids
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Declared probes"
        >
          <dl
            className="relationship-meta"
            aria-label="Dashboard aggregate API probe details"
          >
            {dashboardAggregateApiProbes.map((probe) => (
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
                <code>ORBIT_DASHBOARD_AGGREGATE_PROVIDER</code> remains
                documented before live aggregate providers are wired.
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
