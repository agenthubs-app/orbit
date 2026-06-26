import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  AgentAutonomyLevelBoundary,
  AgentAutonomyRelationshipWorkflowProtection,
  AgentAutonomySettingsPayload,
  AgentAutonomySettingsProvenance,
} from "../settings-contract";
import { createMockAgentAutonomySettingsService } from "../mock-settings-service";

export const AGENT_AUTONOMY_SETTINGS_MOCK_SLUG =
  "agent-autonomy-settings-mock";

const liveImplementationNotesPath =
  "features/agent/agent-autonomy-settings-mock/LIVE_IMPLEMENTATION.md";

const responsiveWorkbenchStyles = `
.agent-autonomy-settings-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.agent-autonomy-settings-workbench .workbench-shell,
.agent-autonomy-settings-workbench .workbench-surface,
.agent-autonomy-settings-workbench .workbench-grid,
.agent-autonomy-settings-workbench .relationship-meta,
.agent-autonomy-settings-workbench .chip-row,
.agent-autonomy-settings-workbench .agent-autonomy-level-grid,
.agent-autonomy-settings-workbench .agent-autonomy-state-matrix,
.agent-autonomy-settings-workbench .agent-autonomy-boundary-grid,
.agent-autonomy-settings-workbench .agent-autonomy-scenario-grid,
.agent-autonomy-settings-workbench .agent-autonomy-workflow-grid,
.agent-autonomy-settings-workbench .agent-autonomy-rule-list {
  min-width: 0;
}

.agent-autonomy-settings-workbench code,
.agent-autonomy-settings-workbench dd,
.agent-autonomy-settings-workbench .orbit-chip,
.agent-autonomy-settings-workbench .agent-autonomy-workflow-card,
.agent-autonomy-settings-workbench .agent-autonomy-rule-list li {
  overflow-wrap: anywhere;
}

.agent-autonomy-settings-workbench .agent-autonomy-level-grid,
.agent-autonomy-settings-workbench .agent-autonomy-state-matrix,
.agent-autonomy-settings-workbench .agent-autonomy-boundary-grid,
.agent-autonomy-settings-workbench .agent-autonomy-scenario-grid,
.agent-autonomy-settings-workbench .agent-autonomy-workflow-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
}

.agent-autonomy-settings-workbench .agent-autonomy-level-card,
.agent-autonomy-settings-workbench .agent-autonomy-state-matrix div,
.agent-autonomy-settings-workbench .agent-autonomy-boundary-grid div,
.agent-autonomy-settings-workbench .agent-autonomy-scenario-control,
.agent-autonomy-settings-workbench .agent-autonomy-workflow-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.agent-autonomy-settings-workbench .agent-autonomy-level-card {
  border-left: 3px solid var(--orbit-color-primary);
}

.agent-autonomy-settings-workbench .agent-autonomy-workflow-card {
  border-left: 3px solid var(--orbit-color-evidence);
}

.agent-autonomy-settings-workbench .agent-autonomy-level-card strong {
  display: block;
  font-size: 1.25rem;
  line-height: 1.15;
}

.agent-autonomy-settings-workbench .agent-autonomy-rule-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.agent-autonomy-settings-workbench .agent-autonomy-rule-list li {
  color: var(--orbit-color-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.agent-autonomy-settings-workbench .agent-autonomy-rule-list .agent-autonomy-rule-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}

.agent-autonomy-settings-workbench .agent-autonomy-scenario-control {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.agent-autonomy-settings-workbench .agent-autonomy-scenario-control form {
  margin: 0;
}

.agent-autonomy-settings-workbench .agent-autonomy-scenario-action {
  align-items: center;
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 700;
  justify-content: center;
  line-height: 1.35;
  min-height: 40px;
  padding: 8px 10px;
  text-align: center;
  text-decoration: none;
  width: 100%;
}

.agent-autonomy-settings-workbench .agent-autonomy-scenario-action:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}
`;

const agentSettingsApiProbes = [
  {
    command: "GET /api/agent/settings",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with low, medium, and high autonomy boundaries.",
    label: "Read settings",
  },
  {
    command: "PUT /api/agent/settings",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope for a deterministic local level update with no external side effects.",
    label: "Save settings",
  },
  {
    command: "GET /api/agent/settings?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local autonomy setting has been selected.",
    label: "Empty settings",
  },
  {
    command: "PUT /api/agent/settings?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with AGENT_AUTONOMY_SETTINGS_MOCK_FAILED context.",
    label: "Controlled failure",
  },
] as const;

const scenarioExerciseControls = [
  {
    actionLabel: "Open success settings",
    expectedStatus: 200,
    method: "GET",
    path: "/api/agent/settings",
    state: "success",
    type: "link",
  },
  {
    actionLabel: "Open empty settings",
    expectedStatus: 200,
    method: "GET",
    path: "/api/agent/settings?scenario=empty",
    state: "empty",
    type: "link",
  },
  {
    actionLabel: "Stage high autonomy",
    expectedStatus: 200,
    method: "PUT",
    path: "/api/agent/settings",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Run failure update",
    expectedStatus: 503,
    method: "PUT",
    path: "/api/agent/settings?scenario=failure",
    state: "failure",
    type: "form",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Agent autonomy settings evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function LevelCard({ level }: { level: AgentAutonomyLevelBoundary }) {
  return (
    <article className="agent-autonomy-level-card">
      <p className="surface-eyebrow">{level.level} level</p>
      <strong>{level.label}</strong>
      <p>{level.boundary}</p>
      <p>{level.operatorControl}</p>
      <div className="chip-row">
        <Chip tone="confirmation">
          confirmation required before external action{" "}
          {String(level.confirmationRequiredBeforeExternalAction)}
        </Chip>
        <Chip tone="privacy">
          autonomous execution {String(level.autonomousExecutionAllowed)}
        </Chip>
        <Chip tone="neutral">
          scheduled live jobs {String(level.scheduledLiveAgentJobsAllowed)}
        </Chip>
      </div>
      <ul className="agent-autonomy-rule-list">
        {level.rules.map((rule) => (
          <li key={rule}>
            <span className="agent-autonomy-rule-label">Rule</span>
            {rule}
          </li>
        ))}
      </ul>
      <ul className="agent-autonomy-rule-list">
        {level.blockedLiveCapabilities.map((capability) => (
          <li key={capability}>
            <span className="agent-autonomy-rule-label">Blocked live path</span>
            {capability}
          </li>
        ))}
      </ul>
    </article>
  );
}

function WorkflowProtectionCard({
  workflow,
}: {
  workflow: AgentAutonomyRelationshipWorkflowProtection;
}) {
  return (
    <article className="agent-autonomy-workflow-card">
      <p className="surface-eyebrow">{workflow.workflowId}</p>
      <h3>{workflow.label}</h3>
      <p>{workflow.protectedContext}</p>
      <p>{workflow.confirmationReason}</p>
      <div className="chip-row" aria-label={`${workflow.label} blocked paths`}>
        {workflow.blockedUntilConfirmed.map((blockedPath) => (
          <Chip key={blockedPath} tone="confirmation">
            blocked {blockedPath}
          </Chip>
        ))}
      </div>
    </article>
  );
}

function StateCard({
  label,
  payload,
}: {
  label: string;
  payload: AgentAutonomySettingsPayload;
}) {
  return (
    <div>
      <h3>{label}</h3>
      <p>
        state <code>{payload.state}</code>
      </p>
      <p>
        current level <code>{payload.currentLevel ?? "none"}</code>
      </p>
      <p>{payload.summary}</p>
      <p>{payload.nextAction}</p>
      <EvidenceChips evidenceIds={payload.provenance.evidenceIds} />
    </div>
  );
}

function BoundaryMatrix({
  provenance,
}: {
  provenance: AgentAutonomySettingsProvenance;
}) {
  const checks = [
    ["autonomous execution", provenance.autonomousExecutionStarted],
    ["scheduled live jobs", provenance.scheduledLiveAgentJobRegistered],
    ["external side effects", provenance.externalSideEffectExecuted],
    ["external network", provenance.externalNetworkRequested],
    ["database reads", provenance.databaseReadExecuted],
    ["database writes", provenance.databaseWriteExecuted],
    ["AI provider", provenance.aiProviderRequested],
    ["email", provenance.emailProviderRequested],
    ["calendar", provenance.calendarProviderRequested],
    ["notification provider", provenance.notificationProviderRequested],
    ["device", provenance.deviceRequested],
  ] as const;

  return (
    <div
      className="workbench-grid agent-autonomy-boundary-grid"
      aria-label="Agent autonomy settings provider boundary"
    >
      {checks.map(([label, value]) => (
        <div key={label}>
          <strong>
            {label} {String(value)}
          </strong>
          <p>All Sprint 50 mock paths stay local and deterministic.</p>
        </div>
      ))}
    </div>
  );
}

function ApiProbeList() {
  return (
    <div className="workbench-grid agent-autonomy-state-matrix">
      {agentSettingsApiProbes.map((probe) => (
        <div key={probe.command}>
          <h3>{probe.label}</h3>
          <p>
            <code>{probe.command}</code>
          </p>
          <p>Expected status {probe.expectedStatus}</p>
          <p>{probe.expectation}</p>
        </div>
      ))}
    </div>
  );
}

function ScenarioControls() {
  return (
    <div
      className="workbench-grid agent-autonomy-scenario-grid"
      id="agent-autonomy-settings-scenario-controls"
      aria-label="Agent autonomy settings scenario exercise controls"
    >
      {scenarioExerciseControls.map((control) => (
        <div className="agent-autonomy-scenario-control" key={control.path}>
          <h3>{control.actionLabel}</h3>
          <p>
            {control.method} <code>{control.path}</code>
          </p>
          <p>
            state <code>{control.state}</code>; expected status{" "}
            {control.expectedStatus}
          </p>
          {control.type === "link" ? (
            <a className="agent-autonomy-scenario-action" href={control.path}>
              {control.actionLabel}
            </a>
          ) : (
            <form action={control.path} method="post">
              <input name="requestedLevel" type="hidden" value="high" />
              <input name="actorLabel" type="hidden" value="Mock operator" />
              <button className="agent-autonomy-scenario-action" type="submit">
                {control.actionLabel}
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function AgentAutonomySettingsMockDemo() {
  const settingsService = createMockAgentAutonomySettingsService();
  const successResult = settingsService.getSettings();
  const emptyResult = settingsService.getSettings({ scenario: "empty" });
  const pendingResult = settingsService.getSettings({ scenario: "pending" });
  const failureResult = settingsService.getSettings({ scenario: "failure" });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return null;
  }

  return (
    <WorkbenchFrame className="agent-autonomy-settings-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability</p>
          <h1>Agent autonomy settings mock</h1>
          <p className="workbench-intro">
            Deterministic provider-free settings for low, medium, and high
            agent autonomy.{" "}
            <a href="#agent-autonomy-settings-scenario-controls">
              Scenario controls
            </a>
          </p>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow="Mock capability"
          title="Agent autonomy settings mock"
        >
          <div
            className="relationship-meta"
            aria-label="Agent autonomy settings operator checkpoint"
          >
            <span>Provider switch ORBIT_AGENT_AUTONOMY_SETTINGS_PROVIDER</span>
            <span>Live notes {liveImplementationNotesPath}</span>
            <span>{successResult.data.provenance.sourceLabel}</span>
          </div>
          <p>{successResult.data.summary}</p>
          <BoundaryMatrix provenance={successResult.data.provenance} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Success state" title="Autonomy levels">
          <div className="workbench-grid agent-autonomy-level-grid">
            {successResult.data.levels.map((level) => (
              <LevelCard key={level.level} level={level} />
            ))}
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Relationship guardrails"
          title="Protected relationship workflows"
        >
          <div className="workbench-grid agent-autonomy-workflow-grid">
            {successResult.data.relationshipWorkflowProtections.map(
              (workflow) => (
                <WorkflowProtectionCard
                  key={workflow.workflowId}
                  workflow={workflow}
                />
              ),
            )}
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="State matrix" title="Probe states">
          <div className="workbench-grid agent-autonomy-state-matrix">
            <StateCard label="Success state" payload={successResult.data} />
            <StateCard label="Empty state" payload={emptyResult.data} />
            <StateCard label="Pending state" payload={pendingResult.data} />
            <div>
              <h3>Failure state</h3>
              {failureResult.success === false && (
                <>
                  <p>
                    code <code>{failureResult.error.code}</code>
                  </p>
                  <p>{failureResult.error.message}</p>
                  <EvidenceChips
                    evidenceIds={failureResult.error.evidenceIds}
                  />
                </>
              )}
            </div>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="API probes" title="Declared route probes">
          <ApiProbeList />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Exercise" title="Scenario controls">
          <ScenarioControls />
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
