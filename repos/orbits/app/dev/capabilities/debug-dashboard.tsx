import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS,
  CAPABILITY_DEBUG_DASHBOARD_SLUG,
  type CapabilityDebugDashboardApiProbe,
  type CapabilityDebugDashboardPayload,
  type CapabilityDebugDashboardProvenance,
  type CapabilityDebugDashboardResetControl,
  type CapabilityDebugDashboardScenarioLink,
  type CapabilityDebugDashboardStateProbe,
} from "./capability-debug-dashboard/contract";
import { createMockCapabilityDebugDashboardService } from "./capability-debug-dashboard/mock-service";

export { CAPABILITY_DEBUG_DASHBOARD_SLUG };

const liveImplementationNotesPath =
  "app/dev/capabilities/capability-debug-dashboard/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.capability-debug-dashboard-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.capability-debug-dashboard-workbench .workbench-shell,
.capability-debug-dashboard-workbench .workbench-surface,
.capability-debug-dashboard-workbench .workbench-grid,
.capability-debug-dashboard-workbench .relationship-meta,
.capability-debug-dashboard-workbench .chip-row,
.capability-debug-dashboard-workbench .debug-dashboard-metric-grid,
.capability-debug-dashboard-workbench .debug-dashboard-state-matrix,
.capability-debug-dashboard-workbench .debug-dashboard-link-grid,
.capability-debug-dashboard-workbench .debug-dashboard-probe-grid,
.capability-debug-dashboard-workbench .debug-dashboard-boundary-grid {
  min-width: 0;
}

.capability-debug-dashboard-workbench code,
.capability-debug-dashboard-workbench dd,
.capability-debug-dashboard-workbench .orbit-chip,
.capability-debug-dashboard-workbench .debug-dashboard-link-card {
  overflow-wrap: anywhere;
}

.capability-debug-dashboard-workbench .debug-dashboard-metric-grid,
.capability-debug-dashboard-workbench .debug-dashboard-state-matrix,
.capability-debug-dashboard-workbench .debug-dashboard-link-grid,
.capability-debug-dashboard-workbench .debug-dashboard-probe-grid,
.capability-debug-dashboard-workbench .debug-dashboard-boundary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.capability-debug-dashboard-workbench .debug-dashboard-metric-card,
.capability-debug-dashboard-workbench .debug-dashboard-state-matrix div,
.capability-debug-dashboard-workbench .debug-dashboard-link-card,
.capability-debug-dashboard-workbench .debug-dashboard-probe-grid div,
.capability-debug-dashboard-workbench .debug-dashboard-boundary-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.capability-debug-dashboard-workbench .debug-dashboard-metric-card,
.capability-debug-dashboard-workbench .debug-dashboard-link-card {
  border-left: 3px solid var(--orbit-color-evidence);
}

.capability-debug-dashboard-workbench .debug-dashboard-metric-card strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
}

.capability-debug-dashboard-workbench .debug-dashboard-link-card {
  color: var(--orbit-color-muted);
  display: grid;
  gap: 6px;
  line-height: 1.45;
  text-decoration: none;
}

.capability-debug-dashboard-workbench .debug-dashboard-link-card:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}

.capability-debug-dashboard-workbench .debug-dashboard-link-card strong {
  color: var(--orbit-color-text);
}
`;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Capability debug dashboard evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function OperatorCheckpoint({ payload }: { payload: CapabilityDebugDashboardPayload }) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Capability debug dashboard is fixture-backed"
    >
      <p className="type-body">
        The dashboard replaces production admin tools and external observability
        with local fixture links for all registered capabilities, mock
        scenarios, API probes, and reset controls.
      </p>
      <dl
        aria-label="Capability debug dashboard operator checkpoint"
        className="relationship-meta debug-dashboard-metric-grid"
      >
        <div>
          <dt>Registered mock capabilities</dt>
          <dd>{payload.capabilityLinks.length} registry links</dd>
        </div>
        <div>
          <dt>Scenario controls</dt>
          <dd>{payload.scenarioLinks.length} deterministic scenario links</dd>
        </div>
        <div>
          <dt>API probes</dt>
          <dd>{payload.apiProbes.length} declared GET probes</dd>
        </div>
        <div>
          <dt>Reset controls</dt>
          <dd>{payload.resetControls.length} fixture reset controls</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={payload.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function MetricCards({ payload }: { payload: CapabilityDebugDashboardPayload }) {
  const metrics = [
    {
      label: "Registered mock capabilities",
      value: payload.capabilityLinks.length,
      detail: "registry-backed links",
    },
    {
      label: "Scenario controls",
      value: payload.scenarioLinks.length,
      detail: "success, empty, pending, failure fixtures",
    },
    {
      label: "API probes",
      value: payload.apiProbes.length,
      detail: "stable success envelopes",
    },
    {
      label: "Reset controls",
      value: payload.resetControls.length,
      detail: "mock reset commands only",
    },
  ] as const;

  return (
    <div
      aria-label="Capability debug dashboard metric cards"
      className="workbench-grid debug-dashboard-metric-grid"
    >
      {metrics.map((metric) => (
        <article className="debug-dashboard-metric-card" key={metric.label}>
          <span className="type-caption">{metric.label}</span>
          <strong>{metric.value}</strong>
          <p className="type-body">{metric.detail}</p>
        </article>
      ))}
    </div>
  );
}

function CapabilityLinks({ payload }: { payload: CapabilityDebugDashboardPayload }) {
  return (
    <WorkbenchSurface eyebrow="Capability links" title="Registered mock capabilities">
      <div
        aria-label="Capability debug dashboard registered capability links"
        className="workbench-grid debug-dashboard-link-grid"
      >
        {payload.capabilityLinks.map((capability) => (
          <a
            className="debug-dashboard-link-card"
            href={capability.href}
            key={capability.id}
          >
            <strong>{capability.label}</strong>
            <span>
              <code>{capability.id}</code> resolves as{" "}
              <code>{capability.serviceStatus}</code> in{" "}
              <code>{capability.mode}</code> mode.
            </span>
          </a>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function MockRouteLinks({
  payload,
}: {
  payload: CapabilityDebugDashboardPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Mock surfaces" title="Dedicated capability pages">
      <div
        aria-label="Capability debug dashboard mock capability route links"
        className="workbench-grid debug-dashboard-link-grid"
      >
        {payload.mockRouteLinks.map((route) => (
          <a className="debug-dashboard-link-card" href={route.href} key={route.id}>
            <strong>{route.label}</strong>
            <span>{route.boundary}</span>
            <code>{route.href}</code>
          </a>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: CapabilityDebugDashboardPayload;
  failureCode: string;
  pending: CapabilityDebugDashboardPayload;
  success: CapabilityDebugDashboardPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Capability debug dashboard state matrix"
        className="relationship-meta debug-dashboard-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.capabilityLinks.length} capabilities linked</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: {empty.nextAction}</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: {pending.pendingReason}</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Failure: controlled error <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay successful fixture responses; controlled
        failures stay local and use explicit mock error definitions.
      </p>
    </WorkbenchSurface>
  );
}

function ScenarioLinks({
  scenarios,
}: {
  scenarios: readonly CapabilityDebugDashboardScenarioLink[];
}) {
  return (
    <WorkbenchSurface eyebrow="Scenario controls" title="Mock scenario links">
      <div
        aria-label="Capability debug dashboard scenario links"
        className="workbench-grid debug-dashboard-link-grid"
      >
        {scenarios.map((scenario) => (
          <a
            className="debug-dashboard-link-card"
            href={scenario.href}
            key={scenario.id}
          >
            <strong>{scenario.label}</strong>
            <span>
              <code>{scenario.id}</code> state <code>{scenario.state}</code>
            </span>
            <span>
              Activation target{" "}
              <code style={pathWrapStyle}>
                {scenario.activationTarget.method}{" "}
                {scenario.activationTarget.path}
              </code>{" "}
              expects {scenario.activationTarget.expectStatus}{" "}
              {scenario.activationTarget.envelope} envelope.
            </span>
            <span>{scenario.nextAction}</span>
          </a>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeList({
  probes,
  stateProbes,
}: {
  probes: readonly CapabilityDebugDashboardApiProbe[];
  stateProbes: readonly CapabilityDebugDashboardStateProbe[];
}) {
  return (
    <WorkbenchSurface eyebrow="API probes" title="Declared probe envelopes">
      <dl className="relationship-meta debug-dashboard-probe-grid">
        {probes.map((probe) => (
          <div key={probe.name}>
            <dt>{probe.label}</dt>
            <dd>
              <code style={pathWrapStyle}>
                {probe.method} {probe.path}
              </code>{" "}
              expects {probe.expectStatus} {probe.envelope} envelope.{" "}
              {probe.description}
            </dd>
          </div>
        ))}
      </dl>
      <dl
        aria-label="Capability debug dashboard state probe coverage"
        className="relationship-meta debug-dashboard-probe-grid"
      >
        {stateProbes.map((probe) => (
          <div key={probe.path}>
            <dt>{probe.label}</dt>
            <dd>
              <code style={pathWrapStyle}>
                {probe.method} {probe.path}
              </code>{" "}
              covers {probe.state} as a {probe.expectStatus} {probe.envelope}{" "}
              envelope.
            </dd>
          </div>
        ))}
      </dl>
    </WorkbenchSurface>
  );
}

function ResetControls({
  controls,
}: {
  controls: readonly CapabilityDebugDashboardResetControl[];
}) {
  return (
    <WorkbenchSurface eyebrow="Reset controls" title="Mock reset commands">
      <dl className="relationship-meta debug-dashboard-probe-grid">
        {controls.map((control) => (
          <div key={control.id}>
            <dt>{control.label}</dt>
            <dd>
              <code style={pathWrapStyle}>
                {control.method} {control.path}
              </code>{" "}
              expects {control.expectStatus}. {control.description}
            </dd>
          </div>
        ))}
      </dl>
    </WorkbenchSurface>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: CapabilityDebugDashboardProvenance;
}) {
  return (
    <WorkbenchSurface
      eyebrow="Mock-only execution"
      title="No external service participates"
    >
      <dl
        className="relationship-meta debug-dashboard-boundary-grid"
        aria-label="Capability debug dashboard provider guardrails"
      >
        <div>
          <dt>Admin tools</dt>
          <dd>
            production admin tools replaced{" "}
            {String(provenance.productionAdminToolsReplaced)}
          </dd>
        </div>
        <div>
          <dt>Observability</dt>
          <dd>
            external observability replaced{" "}
            {String(provenance.externalObservabilityReplaced)}
          </dd>
        </div>
        <div>
          <dt>External network</dt>
          <dd>
            external network requested{" "}
            {String(provenance.externalNetworkRequested)}
          </dd>
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
    </WorkbenchSurface>
  );
}

function LiveHandoff() {
  return (
    <WorkbenchSurface
      eyebrow="Mock-to-live handoff"
      title="Replacement notes stay with the capability"
    >
      <dl className="relationship-meta">
        <div>
          <dt>Handoff doc</dt>
          <dd>
            <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
          </dd>
        </div>
        <div>
          <dt>Switch variable</dt>
          <dd>
            <code>ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER</code> controls the
            future live provider switch.
          </dd>
        </div>
        <div>
          <dt>Live provider scope</dt>
          <dd>
            Live admin and observability reads require explicit environment
            variables, admin read permission, observability read permission,
            privacy review, provenance mapping, and replacement tests.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

export function CapabilityDebugDashboardDemo() {
  const dashboardService = createMockCapabilityDebugDashboardService();
  const successResult = dashboardService.getDashboard();
  const emptyResult = dashboardService.getDashboard({ scenario: "empty" });
  const pendingResult = dashboardService.getDashboard({ scenario: "pending" });
  const failureResult = dashboardService.getDashboard({ scenario: "failure" });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="capability-debug-dashboard-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Capability debug dashboard</h1>
            <p className="workbench-intro">
              The deterministic capability debug dashboard fixtures did not
              load, so this dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED";
  const failureMessage =
    failureResult.success === false
      ? failureResult.error.message
      : CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS
          .CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED.message;
  const failureEvidenceIds =
    failureResult.success === false
      ? failureResult.error.evidenceIds
      : ["evidence:debug-dashboard:controlled-failure"];

  return (
    <WorkbenchFrame className="capability-debug-dashboard-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Capability debug dashboard</h1>
          <p className="workbench-intro">
            Dev-only surface for scanning Orbit mock capability coverage. The
            page reads the mock service for success, empty, pending, and failure
            states before any live admin or observability provider exists.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />
        <MetricCards payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Capability debug dashboard capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={CAPABILITY_DEBUG_DASHBOARD_SLUG}
            title="Dashboard contract"
          >
            <p className="type-body">
              The reusable boundary exports typed fixtures, a service
              interface, a mock service factory, and explicit error definitions
              for one capability debug dashboard.
            </p>
            <div className="chip-row" aria-label="Capability debug dashboard guard chips">
              <Chip tone="evidence">fixture-backed</Chip>
              <Chip tone="confirmation">rule-based states</Chip>
              <Chip tone="privacy">provider-free</Chip>
            </div>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Controlled failure" title="Failure code">
            <dl className="relationship-meta">
              <div>
                <dt>Controlled code</dt>
                <dd>
                  <code>{failureCode}</code> {failureMessage}
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{failureEvidenceIds.join(", ")}</dd>
              </div>
            </dl>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />
        <CapabilityLinks payload={successResult.data} />
        <MockRouteLinks payload={successResult.data} />
        <ScenarioLinks scenarios={successResult.data.scenarioLinks} />
        <ApiProbeList
          probes={successResult.data.apiProbes}
          stateProbes={successResult.data.stateProbes}
        />
        <ResetControls controls={successResult.data.resetControls} />
        <MockOnlyExecutionChecks provenance={successResult.data.provenance} />
        <LiveHandoff />
      </div>
    </WorkbenchFrame>
  );
}
