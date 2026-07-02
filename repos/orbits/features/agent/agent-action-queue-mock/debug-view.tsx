/**
 * Agent 动作队列 mock 的开发者面板。
 *
 * 面板展示待确认的建议动作、来源、风险和 accept/dismiss 结果；
 * 所有动作都停留在本地审计层，不执行外部副作用。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  AgentActionQueueItem,
  AgentActionQueuePayload,
  AgentActionQueueProvenance,
  AgentActionQueueResult,
  AgentActionSourceReference,
} from "../contract";
import type { AgentActionQueueServiceResult } from "../service";
import { createMockAgentActionQueueService } from "../mock-service";

export const AGENT_ACTION_QUEUE_MOCK_SLUG = "agent-action-queue-mock";

const liveImplementationNotesPath =
  "features/agent/agent-action-queue-mock/LIVE_IMPLEMENTATION.md";

const responsiveWorkbenchStyles = `
.agent-action-queue-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.agent-action-queue-workbench .workbench-shell,
.agent-action-queue-workbench .workbench-surface,
.agent-action-queue-workbench .workbench-grid,
.agent-action-queue-workbench .relationship-meta,
.agent-action-queue-workbench .chip-row,
.agent-action-queue-workbench .agent-action-grid,
.agent-action-queue-workbench .agent-state-matrix,
.agent-action-queue-workbench .agent-boundary-grid,
.agent-action-queue-workbench .agent-scenario-grid,
.agent-action-queue-workbench .agent-source-list {
  min-width: 0;
}

.agent-action-queue-workbench code,
.agent-action-queue-workbench dd,
.agent-action-queue-workbench .orbit-chip,
.agent-action-queue-workbench .agent-source-list li {
  overflow-wrap: anywhere;
}

.agent-action-queue-workbench .agent-action-grid,
.agent-action-queue-workbench .agent-state-matrix,
.agent-action-queue-workbench .agent-boundary-grid,
.agent-action-queue-workbench .agent-scenario-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.agent-action-queue-workbench .agent-action-card,
.agent-action-queue-workbench .agent-state-matrix div,
.agent-action-queue-workbench .agent-boundary-grid div,
.agent-action-queue-workbench .agent-scenario-control {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.agent-action-queue-workbench .agent-action-card {
  border-left: 3px solid var(--orbit-color-confirmation);
}

.agent-action-queue-workbench .agent-action-card strong {
  display: block;
  font-size: 1.35rem;
  line-height: 1.1;
}

.agent-action-queue-workbench .agent-scenario-control {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.agent-action-queue-workbench .agent-scenario-control form {
  margin: 0;
}

.agent-action-queue-workbench .agent-scenario-action {
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

.agent-action-queue-workbench .agent-scenario-action:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}

.agent-action-queue-workbench .agent-source-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.agent-action-queue-workbench .agent-source-list li {
  color: var(--orbit-color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.agent-action-queue-workbench .agent-source-list .agent-source-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}
`;

const actionTypeLabels = {
  event_reminder: "Event reminders",
  post_event_followup: "Post-event followups",
  dormant_activation: "Dormant activation",
  message_draft_suggestion: "Message draft suggestions",
  appointment_suggestion: "Appointment suggestions",
} as const;

const agentApiProbes = [
  {
    command: "GET /api/agent/actions",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with event reminders, post-event followups, dormant activation, message draft suggestions, and appointment suggestions.",
    label: "List actions",
  },
  {
    command: "POST /api/agent/actions/demo-action-1/accept",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a local accepted decision and no external side effect.",
    label: "Accept action",
  },
  {
    command: "POST /api/agent/actions/demo-action-1/dismiss",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a local dismissed decision and no external side effect.",
    label: "Dismiss action",
  },
  {
    command: "GET /api/agent/actions?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no source-backed agent action context is available.",
    label: "Empty actions",
  },
  {
    command: "POST /api/agent/actions/demo-action-1/accept?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with AGENT_ACTION_QUEUE_MOCK_FAILED context.",
    label: "Controlled failure",
  },
] as const;

const scenarioExerciseControls = [
  {
    actionLabel: "Open success queue",
    expectedStatus: 200,
    method: "GET",
    path: "/api/agent/actions",
    state: "success",
    type: "link",
  },
  {
    actionLabel: "Open empty queue",
    expectedStatus: 200,
    method: "GET",
    path: "/api/agent/actions?scenario=empty",
    state: "empty",
    type: "link",
  },
  {
    actionLabel: "Accept demo action",
    expectedStatus: 200,
    method: "POST",
    path: "/api/agent/actions/demo-action-1/accept",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Dismiss demo action",
    expectedStatus: 200,
    method: "POST",
    path: "/api/agent/actions/demo-action-1/dismiss",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Run failure accept",
    expectedStatus: 503,
    method: "POST",
    path: "/api/agent/actions/demo-action-1/accept?scenario=failure",
    state: "failure",
    type: "form",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Agent action queue evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceReferences({
  sourceRefs,
}: {
  sourceRefs: readonly AgentActionSourceReference[];
}) {
  return (
    <ul
      className="agent-source-list"
      aria-label="Agent action queue source references"
    >
      {sourceRefs.map((sourceRef) => (
        <li key={sourceRef.id}>
          <span className="agent-source-label">{sourceRef.label}</span>
          source type <code>{sourceRef.type}</code>; provider record{" "}
          <code>{sourceRef.providerRecordId}</code>
        </li>
      ))}
    </ul>
  );
}

function ActionCard({ action }: { action: AgentActionQueueItem }) {
  return (
    <article className="agent-action-card">
      <p className="surface-eyebrow">{actionTypeLabels[action.actionType]}</p>
      <strong>{action.title}</strong>
      <p>
        {action.contactName} at {action.organization}
      </p>
      <p>{action.recommendedAction}</p>
      <p>{action.reason}</p>
      <div className="chip-row">
        <Chip tone="confirmation">
          confirmation {String(action.confirmationRequired)}
        </Chip>
        <Chip tone="neutral">{action.priority}</Chip>
        <Chip tone="primary">{action.dueLabel}</Chip>
      </div>
      <EvidenceChips evidenceIds={action.evidenceIds} />
      <SourceReferences sourceRefs={action.sourceRefs} />
    </article>
  );
}

function StateCard({
  label,
  payload,
}: {
  label: string;
  payload: AgentActionQueuePayload;
}) {
  return (
    <div>
      <h3>{label}</h3>
      <p>
        state <code>{payload.state}</code>
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
  provenance: AgentActionQueueProvenance;
}) {
  const checks = [
    ["autonomous execution", provenance.autonomousExecutionStarted],
    ["external side effects", provenance.externalSideEffectExecuted],
    ["external network", provenance.externalNetworkRequested],
    ["database reads", provenance.liveDatabaseReadExecuted],
    ["database writes", provenance.liveDatabaseWriteExecuted],
    ["AI provider", provenance.aiProviderRequested],
    ["email", provenance.emailProviderRequested],
    ["calendar", provenance.calendarProviderRequested],
    ["notification provider", provenance.notificationProviderRequested],
    ["device", provenance.deviceRequested],
  ] as const;

  return (
    <div
      className="workbench-grid agent-boundary-grid"
      aria-label="Agent action queue provider boundary"
    >
      {checks.map(([label, value]) => (
        <div key={label}>
          <strong>
            {label} {String(value)}
          </strong>
          <p>All Sprint 49 mock paths stay local and deterministic.</p>
        </div>
      ))}
    </div>
  );
}

function ApiProbeList() {
  return (
    <div className="workbench-grid agent-state-matrix">
      {agentApiProbes.map((probe) => (
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
      className="workbench-grid agent-scenario-grid"
      id="agent-action-queue-scenario-controls"
      aria-label="Agent action queue scenario exercise controls"
    >
      {scenarioExerciseControls.map((control) => (
        <div className="agent-scenario-control" key={control.path}>
          <h3>{control.actionLabel}</h3>
          <p>
            {control.method} <code>{control.path}</code>
          </p>
          <p>
            state <code>{control.state}</code>; expected status{" "}
            {control.expectedStatus}
          </p>
          {control.type === "link" ? (
            <a className="agent-scenario-action" href={control.path}>
              {control.actionLabel}
            </a>
          ) : (
            <form action={control.path} method="post">
              <button className="agent-scenario-action" type="submit">
                {control.actionLabel}
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function requireSyncAgentActionQueueResult(
  result: AgentActionQueueServiceResult<AgentActionQueueResult>,
): AgentActionQueueResult {
  if (isPromiseLike(result)) {
    throw new Error(
      "The agent action queue mock demo only supports synchronous mock services.",
    );
  }

  return result;
}

export function AgentActionQueueMockDemo() {
  const agentService = createMockAgentActionQueueService();
  const successResult = requireSyncAgentActionQueueResult(
    agentService.listActions(),
  );
  const emptyResult = requireSyncAgentActionQueueResult(
    agentService.listActions({ scenario: "empty" }),
  );
  const pendingResult = requireSyncAgentActionQueueResult(
    agentService.listActions({ scenario: "pending" }),
  );
  const failureResult = requireSyncAgentActionQueueResult(
    agentService.listActions({ scenario: "failure" }),
  );

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return null;
  }

  return (
    <WorkbenchFrame className="agent-action-queue-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability</p>
          <h1>Agent action queue mock</h1>
          <p className="workbench-intro">
            Deterministic provider-free queue for event reminders, post-event
            followups, dormant activation, draft suggestions, and appointment
            suggestions.{" "}
            <a href="#agent-action-queue-scenario-controls">
              Scenario controls
            </a>
          </p>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow="Mock capability"
          title="Agent action queue mock"
        >
          <div
            className="relationship-meta"
            aria-label="Agent action queue operator checkpoint"
          >
            <span>Runtime switch ORBIT_MODULE_MODE=live</span>
            <span>Live notes {liveImplementationNotesPath}</span>
            <span>{successResult.data.provenance.sourceLabel}</span>
          </div>
          <p>{successResult.data.summary}</p>
          <BoundaryMatrix provenance={successResult.data.provenance} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Success state" title="Queued actions">
          <div className="workbench-grid agent-action-grid">
            {successResult.data.actions.map((action) => (
              <ActionCard action={action} key={action.actionId} />
            ))}
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="State matrix" title="Probe states">
          <div className="workbench-grid agent-state-matrix">
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
