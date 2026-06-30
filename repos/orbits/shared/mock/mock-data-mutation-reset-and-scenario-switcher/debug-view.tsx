/**
 * Mock 数据 reset 与 scenario 切换器的开发者面板。
 *
 * 这里展示共享 mock runtime 的场景切换、重置和 provenance，帮助调试不同页面状态。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../ui/primitives";
import {
  MOCK_SCENARIO_ERROR_DEFINITIONS,
  type MockScenarioFixture,
  type MockScenarioProvenance,
  createMockScenarioService,
} from "../scenarios";
import {
  MOCK_RESET_ERROR_DEFINITIONS,
  type MockResetProvenance,
  createMockDataResetService,
} from "../reset";

export const MOCK_DATA_SCENARIO_SWITCHER_SLUG =
  "mock-data-mutation-reset-and-scenario-switcher";

const liveImplementationNotesPath =
  "shared/mock/mock-data-mutation-reset-and-scenario-switcher/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.mock-scenario-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.mock-scenario-workbench .workbench-shell,
.mock-scenario-workbench .workbench-surface,
.mock-scenario-workbench .workbench-grid,
.mock-scenario-workbench .relationship-meta,
.mock-scenario-workbench .chip-row,
.mock-scenario-workbench .mock-scenario-grid,
.mock-scenario-workbench .mock-scenario-state-matrix,
.mock-scenario-workbench .mock-scenario-probe-grid,
.mock-scenario-workbench .mock-scenario-boundary-grid {
  min-width: 0;
}

.mock-scenario-workbench code,
.mock-scenario-workbench dd,
.mock-scenario-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.mock-scenario-workbench .mock-scenario-grid,
.mock-scenario-workbench .mock-scenario-state-matrix,
.mock-scenario-workbench .mock-scenario-probe-grid,
.mock-scenario-workbench .mock-scenario-boundary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.mock-scenario-workbench .mock-scenario-card,
.mock-scenario-workbench .mock-scenario-state-matrix div,
.mock-scenario-workbench .mock-scenario-probe-grid div,
.mock-scenario-workbench .mock-scenario-boundary-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 3px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const apiProbes = [
  {
    label: "Scenario list",
    command: "GET /api/mock/scenarios",
    expectation:
      "Expect a 200 success envelope with all selectable deterministic fixtures.",
  },
  {
    label: "Activate post-event",
    command: "POST /api/mock/scenarios/post-event-demo/activate",
    expectation:
      "Expect a 200 success envelope selecting the post-event fixture without storing user state.",
  },
  {
    label: "Reset mock data",
    command: "POST /api/mock/reset",
    expectation:
      "Expect a 200 success envelope restoring the active-event fixture from local rules.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/mock/scenarios/error-demo/activate",
    expectation:
      "Expect a 503 failure envelope with MOCK_SCENARIO_CONTROLLED_FAILURE.",
  },
  {
    label: "Unknown scenario",
    command: "POST /api/mock/scenarios/unknown-scenario/activate",
    expectation:
      "Expect a 404 failure envelope with MOCK_SCENARIO_NOT_FOUND.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  {
    section: "Live service and provider files",
    detail:
      "Live files stay under shared/mock/mock-data-mutation-reset-and-scenario-switcher/.",
  },
  {
    section: "Switch mechanism",
    detail:
      "ORBIT_MOCK_SCENARIO_PROVIDER switches deterministic fixtures to live providers.",
  },
  {
    section: "Required env vars and permissions",
    detail:
      "Production seed management and stored user scenario selection replace request-scope rules.",
  },
  {
    section: "Privacy and provenance constraints",
    detail:
      "Privacy and provenance remain attached to scenario activation and reset events.",
  },
  {
    section: "Replacement tests",
    detail:
      "Replacement tests cover new user, active event, post-event, dormant network, empty account, reset, and controlled failure paths.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Mock scenario evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ScenarioGrid({
  scenarios,
}: {
  scenarios: readonly MockScenarioFixture[];
}) {
  return (
    <div className="workbench-grid mock-scenario-grid" aria-label="Mock scenarios">
      {scenarios.map((scenario) => (
        <article className="mock-scenario-card" key={scenario.id}>
          <p className="type-caption">{scenario.scenarioKind}</p>
          <h3 className="relationship-name">{scenario.label}</h3>
          <p className="type-body">{scenario.description}</p>
          <dl className="relationship-meta">
            <div>
              <dt>State</dt>
              <dd>
                <code>{scenario.state}</code>
              </dd>
            </div>
            <div>
              <dt>Graph</dt>
              <dd>
                {scenario.relationshipContext.contactCount} contacts,{" "}
                {scenario.relationshipContext.eventCount} events,{" "}
                {scenario.relationshipContext.taskCount} tasks
              </dd>
            </div>
            <div>
              <dt>Event context</dt>
              <dd>{scenario.relationshipContext.eventLabel}</dd>
            </div>
            <div>
              <dt>Evidence records</dt>
              <dd>
                {scenario.relationshipContext.evidenceCount} evidence records
              </dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>{scenario.relationshipContext.nextAction}</dd>
            </div>
          </dl>
          <EvidenceChips evidenceIds={scenario.provenance.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function StateMatrix({
  failureCode,
  scenarios,
}: {
  failureCode: string;
  scenarios: readonly MockScenarioFixture[];
}) {
  const successScenario = scenarios.find((scenario) => scenario.state === "success");
  const emptyScenario = scenarios.find((scenario) => scenario.state === "empty");
  const pendingScenario = scenarios.find((scenario) => scenario.state === "pending");

  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Mock scenario state matrix"
        className="relationship-meta mock-scenario-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>{successScenario?.label ?? "No success fixture"}</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>{emptyScenario?.label ?? "No empty fixture"}</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>{pendingScenario?.label ?? "No pending fixture"}</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Controlled code <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay deterministic fixture responses;
        controlled failures stay inside API failure envelopes.
      </p>
    </WorkbenchSurface>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: MockScenarioProvenance | MockResetProvenance;
}) {
  return (
    <dl
      className="relationship-meta mock-scenario-boundary-grid"
      aria-label="Mock scenario provider guardrails"
    >
      <div>
        <dt>Production seed manager</dt>
        <dd>
          production seed management replaced{" "}
          {String(provenance.productionSeedManagementReplaced)}
        </dd>
      </div>
      <div>
        <dt>User scenario storage</dt>
        <dd>
          persistent user scenario storage replaced{" "}
          {String(provenance.persistentUserScenarioStorageReplaced)}
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

function OperatorCheckpoint({
  activeScenarioId,
  scenario,
}: {
  activeScenarioId: string;
  scenario: MockScenarioFixture;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Scenario switcher is fixture-backed"
    >
      <p className="type-body">
        The active mock scenario is selected from deterministic fixtures and
        resets through request-scope rules before live seed management or stored
        user scenario selection exists.
      </p>
      <dl
        aria-label="Mock scenario operator checkpoint"
        className="relationship-meta mock-scenario-boundary-grid"
      >
        <div>
          <dt>Active scenario</dt>
          <dd>
            <code>{activeScenarioId}</code>
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{scenario.relationshipContext.accountLabel}</dd>
        </div>
        <div>
          <dt>Scenario state</dt>
          <dd>
            <code>{scenario.state}</code>
          </dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{scenario.relationshipContext.nextAction}</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={scenario.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function ApiProbeList() {
  return (
    <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
      <dl className="relationship-meta mock-scenario-probe-grid">
        {apiProbes.map((probe) => (
          <div key={probe.command}>
            <dt>{probe.label}</dt>
            <dd>
              <code style={pathWrapStyle}>{probe.command}</code>{" "}
              {probe.expectation}
            </dd>
          </div>
        ))}
      </dl>
    </WorkbenchSurface>
  );
}

export function MockDataScenarioSwitcherDemo() {
  const scenarioService = createMockScenarioService();
  const resetService = createMockDataResetService();
  const scenarioList = scenarioService.listScenarios();
  const postEventActivation = scenarioService.activateScenario("post-event-demo");
  const scenarioFailure = scenarioService.activateScenario("error-demo");
  const resetDefault = resetService.resetMockData();
  const resetFailure = resetService.resetMockData({ scenarioId: "error-demo" });

  if (scenarioList.success === false || resetDefault.success === false) {
    return (
      <WorkbenchFrame className="mock-scenario-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Mock data mutation reset and scenario switcher</h1>
            <p className="workbench-intro">
              The deterministic mock scenario fixtures did not load, so this
              dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const activeScenario =
    scenarioList.data.scenarios.find((scenario) => scenario.selected) ??
    scenarioList.data.scenarios[0];
  const scenarioFailureCode =
    scenarioFailure.success === false
      ? scenarioFailure.error.code
      : "MOCK_SCENARIO_CONTROLLED_FAILURE";
  const resetFailureCode =
    resetFailure.success === false
      ? resetFailure.error.code
      : "MOCK_RESET_CONTROLLED_FAILURE";
  const resetMutation =
    resetDefault.success === true ? resetDefault.data.reset : null;

  return (
    <WorkbenchFrame className="mock-scenario-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Mock data mutation reset and scenario switcher</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying deterministic mock scenario
            selection and reset behavior before live seed providers or stored
            user scenario preferences exist.
          </p>
        </header>

        <OperatorCheckpoint
          activeScenarioId={scenarioList.data.activeScenarioId}
          scenario={activeScenario}
        />

        <section
          className="workbench-grid"
          aria-label="Mock data scenario capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={MOCK_DATA_SCENARIO_SWITCHER_SLUG}
            title="Scenario selection contract"
          >
            <p className="type-body">
              The reusable boundary exports typed scenario fixtures, a service
              interface, a mock service factory, and explicit error definitions
              for new user, active event, post-event, dormant network, empty
              account, and error states.
            </p>
            <dl className="relationship-meta">
              <div>
                <dt>Post-event activation</dt>
                <dd>
                  {postEventActivation.success === true
                    ? postEventActivation.data.mutation.seedManagement
                    : postEventActivation.error.code}
                </dd>
              </div>
              <div>
                <dt>Reset rule</dt>
                <dd>
                  {resetMutation
                    ? resetMutation.seedManagement
                    : "controlled reset failure"}
                </dd>
              </div>
            </dl>
            <div className="chip-row" aria-label="Mock scenario guard chips">
              <Chip tone="evidence">fixture-backed</Chip>
              <Chip tone="confirmation">request-scope selection</Chip>
              <Chip tone="privacy">provider-free reset</Chip>
            </div>
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Controlled errors" title="Failure codes">
            <dl className="relationship-meta">
              <div>
                <dt>Scenario failure</dt>
                <dd>
                  <code>{scenarioFailureCode}</code>{" "}
                  {
                    MOCK_SCENARIO_ERROR_DEFINITIONS
                      .MOCK_SCENARIO_CONTROLLED_FAILURE.message
                  }
                </dd>
              </div>
              <div>
                <dt>Reset failure</dt>
                <dd>
                  <code>{resetFailureCode}</code>{" "}
                  {
                    MOCK_RESET_ERROR_DEFINITIONS.MOCK_RESET_CONTROLLED_FAILURE
                      .message
                  }
                </dd>
              </div>
            </dl>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          failureCode={scenarioFailureCode}
          scenarios={scenarioList.data.scenarios}
        />

        <WorkbenchSurface eyebrow="Scenario fixtures" title="Selectable mock states">
          <ScenarioGrid scenarios={scenarioList.data.scenarios} />
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No external service participates"
        >
          <MockOnlyExecutionChecks provenance={scenarioList.data.provenance} />
        </WorkbenchSurface>

        <ApiProbeList />

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
                <code>ORBIT_MOCK_SCENARIO_PROVIDER</code> controls the future
                live provider switch.
              </dd>
            </div>
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <div key={excerpt.section}>
                <dt>{excerpt.section}</dt>
                <dd>{excerpt.detail}</dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
