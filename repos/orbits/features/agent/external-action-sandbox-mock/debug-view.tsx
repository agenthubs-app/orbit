import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ExternalActionAuditRecord,
  ExternalActionNoOpPayload,
  ExternalActionRelationshipContext,
  ExternalActionSandboxAction,
  ExternalActionSandboxPayload,
  ExternalActionSandboxProvenance,
} from "../external-action-contract";
import { createMockExternalActionSandboxService } from "../mock-external-action-sandbox";

export const EXTERNAL_ACTION_SANDBOX_MOCK_SLUG =
  "external-action-sandbox-mock";

const liveImplementationNotesPath =
  "features/agent/external-action-sandbox-mock/LIVE_IMPLEMENTATION.md";

const responsiveWorkbenchStyles = `
.external-action-sandbox-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.external-action-sandbox-workbench .workbench-shell,
.external-action-sandbox-workbench .workbench-surface,
.external-action-sandbox-workbench .workbench-grid,
.external-action-sandbox-workbench .relationship-meta,
.external-action-sandbox-workbench .chip-row,
.external-action-sandbox-workbench .external-action-grid,
.external-action-sandbox-workbench .external-action-state-matrix,
.external-action-sandbox-workbench .external-action-boundary-grid,
.external-action-sandbox-workbench .external-action-scenario-grid,
.external-action-sandbox-workbench .external-action-audit-list {
  min-width: 0;
}

.external-action-sandbox-workbench .external-action-relationship-context {
  display: grid;
  gap: 5px;
  margin: var(--orbit-space-sm) 0;
}

.external-action-sandbox-workbench .external-action-relationship-context div {
  min-width: 0;
}

.external-action-sandbox-workbench .external-action-relationship-context dt {
  color: var(--orbit-color-muted);
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
}

.external-action-sandbox-workbench .external-action-relationship-context dd {
  margin: 0;
}

.external-action-sandbox-workbench code,
.external-action-sandbox-workbench dd,
.external-action-sandbox-workbench .orbit-chip,
.external-action-sandbox-workbench .external-action-audit-list li {
  overflow-wrap: anywhere;
}

.external-action-sandbox-workbench .external-action-grid,
.external-action-sandbox-workbench .external-action-state-matrix,
.external-action-sandbox-workbench .external-action-boundary-grid,
.external-action-sandbox-workbench .external-action-scenario-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.external-action-sandbox-workbench .external-action-card,
.external-action-sandbox-workbench .external-action-state-matrix div,
.external-action-sandbox-workbench .external-action-boundary-grid div,
.external-action-sandbox-workbench .external-action-scenario-control {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.external-action-sandbox-workbench .external-action-card {
  border-left: 3px solid var(--orbit-color-confirmation);
}

.external-action-sandbox-workbench .external-action-card strong {
  display: block;
  font-size: 1.2rem;
  line-height: 1.2;
}

.external-action-sandbox-workbench .external-action-scenario-control {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.external-action-sandbox-workbench .external-action-scenario-control form {
  margin: 0;
}

.external-action-sandbox-workbench .external-action-scenario-action {
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

.external-action-sandbox-workbench .external-action-scenario-action:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}

.external-action-sandbox-workbench .external-action-audit-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.external-action-sandbox-workbench .external-action-audit-list li {
  color: var(--orbit-color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.external-action-sandbox-workbench .external-action-audit-list .external-action-audit-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}
`;

const actionTypeLabels = {
  send_message: "No-op send message",
  create_calendar_event: "No-op create calendar event",
  deliver_notification: "No-op notification delivery",
} as const;

const apiProbes = [
  {
    command: "POST /api/sandbox/external-actions/send-message",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a local no-op send message and a side-effect audit record.",
    label: "Send message no-op",
  },
  {
    command: "GET /api/sandbox/external-actions/audit",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with no-op send, calendar, and notification audit records.",
    label: "Audit records",
  },
  {
    command: "GET /api/sandbox/external-actions/audit?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no confirmed action has entered the sandbox.",
    label: "Empty audit",
  },
  {
    command:
      "POST /api/sandbox/external-actions/send-message?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EXTERNAL_ACTION_SANDBOX_MOCK_FAILED context.",
    label: "Controlled failure",
  },
] as const;

const scenarioExerciseControls = [
  {
    actionLabel: "Run message no-op",
    expectedStatus: 200,
    method: "POST",
    path: "/api/sandbox/external-actions/send-message",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Open audit records",
    expectedStatus: 200,
    method: "GET",
    path: "/api/sandbox/external-actions/audit",
    state: "success",
    type: "link",
  },
  {
    actionLabel: "Open empty audit",
    expectedStatus: 200,
    method: "GET",
    path: "/api/sandbox/external-actions/audit?scenario=empty",
    state: "empty",
    type: "link",
  },
  {
    actionLabel: "Run failure no-op",
    expectedStatus: 503,
    method: "POST",
    path: "/api/sandbox/external-actions/send-message?scenario=failure",
    state: "failure",
    type: "form",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="External action sandbox evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function AuditRecords({
  auditRecords,
}: {
  auditRecords: readonly ExternalActionAuditRecord[];
}) {
  return (
    <ul
      className="external-action-audit-list"
      aria-label="Side-effect audit records"
    >
      {auditRecords.map((record) => (
        <li key={record.auditId}>
          <span className="external-action-audit-label">
            Side-effect audit records
          </span>
          <code>{record.auditId}</code>; {record.actionType}; no-op{" "}
          {String(record.noOp)}; side effect{" "}
          {String(record.sideEffectExecuted)}
          <RelationshipContextBlock context={record.relationshipContext} />
        </li>
      ))}
    </ul>
  );
}

function RelationshipContextBlock({
  context,
}: {
  context: ExternalActionRelationshipContext;
}) {
  return (
    <dl
      className="external-action-relationship-context"
      aria-label={`${context.contactLabel} relationship provenance`}
    >
      <div>
        <dt>Event</dt>
        <dd>{context.eventLabel}</dd>
      </div>
      <div>
        <dt>Connection origin</dt>
        <dd>{context.connectionOrigin}</dd>
      </div>
      <div>
        <dt>Follow-up rationale</dt>
        <dd>{context.followupRationale}</dd>
      </div>
      <div>
        <dt>Source context</dt>
        <dd>
          {context.sourceContextIds.map((sourceContextId) => (
            <code key={sourceContextId}>{sourceContextId}</code>
          ))}
        </dd>
      </div>
    </dl>
  );
}

function ActionCard({ action }: { action: ExternalActionSandboxAction }) {
  return (
    <article className="external-action-card">
      <p className="surface-eyebrow">{actionTypeLabels[action.actionType]}</p>
      <strong>{action.label}</strong>
      <p>{action.targetLabel}</p>
      <RelationshipContextBlock context={action.relationshipContext} />
      <p>{action.requestedEffect}</p>
      <p>{action.suppressedEffect}</p>
      <div className="chip-row">
        <Chip tone="confirmation">
          confirmation {String(action.confirmationRequired)}
        </Chip>
        <Chip tone="privacy">no-op {String(action.noOp)}</Chip>
        <Chip tone="neutral">{action.providerKind}</Chip>
      </div>
      <EvidenceChips evidenceIds={action.evidenceIds} />
    </article>
  );
}

function StateCard({
  label,
  payload,
}: {
  label: string;
  payload: ExternalActionSandboxPayload;
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

function NoOpResultCard({ payload }: { payload: ExternalActionNoOpPayload }) {
  return (
    <div>
      <h3>{payload.label}</h3>
      <p>
        provider request issued <code>{String(payload.providerRequestIssued)}</code>
      </p>
      <p>
        external side effect{" "}
        <code>{String(payload.externalSideEffectExecuted)}</code>
      </p>
      <p>
        audit <code>{payload.auditRecord.auditId}</code>
      </p>
      <RelationshipContextBlock context={payload.relationshipContext} />
    </div>
  );
}

function BoundaryMatrix({
  provenance,
}: {
  provenance: ExternalActionSandboxProvenance;
}) {
  const checks = [
    ["message provider", provenance.messageProviderRequested],
    ["calendar provider", provenance.calendarProviderRequested],
    ["email provider", provenance.emailProviderRequested],
    ["notification provider", provenance.notificationProviderRequested],
    ["push delivery", provenance.pushProviderRequested],
    ["external network", provenance.externalNetworkRequested],
    ["database reads", provenance.databaseReadExecuted],
    ["database writes", provenance.databaseWriteExecuted],
    ["AI provider", provenance.aiProviderRequested],
    ["device", provenance.deviceRequested],
  ] as const;

  return (
    <div
      className="workbench-grid external-action-boundary-grid"
      aria-label="External action sandbox provider boundary"
    >
      {checks.map(([label, value]) => (
        <div key={label}>
          <strong>
            {label} {String(value)}
          </strong>
          <p>All Sprint 51 external action paths stay local and deterministic.</p>
        </div>
      ))}
    </div>
  );
}

function ApiProbeList() {
  return (
    <div className="workbench-grid external-action-state-matrix">
      {apiProbes.map((probe) => (
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
      className="workbench-grid external-action-scenario-grid"
      id="external-action-sandbox-scenario-controls"
      aria-label="External action sandbox scenario exercise controls"
    >
      {scenarioExerciseControls.map((control) => (
        <div className="external-action-scenario-control" key={control.path}>
          <h3>{control.actionLabel}</h3>
          <p>
            {control.method} <code>{control.path}</code>
          </p>
          <p>
            state <code>{control.state}</code>; expected status{" "}
            {control.expectedStatus}
          </p>
          {control.type === "link" ? (
            <a className="external-action-scenario-action" href={control.path}>
              {control.actionLabel}
            </a>
          ) : (
            <form action={control.path} method="post">
              <button className="external-action-scenario-action" type="submit">
                {control.actionLabel}
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function ExternalActionSandboxMockDemo() {
  const service = createMockExternalActionSandboxService();
  const successResult = service.listAuditRecords();
  const emptyResult = service.listAuditRecords({ scenario: "empty" });
  const pendingResult = service.listAuditRecords({ scenario: "pending" });
  const failureResult = service.sendMessage({ scenario: "failure" });
  const messageResult = service.sendMessage();
  const calendarResult = service.createCalendarEvent();
  const notificationResult = service.deliverNotification();

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false ||
    messageResult.success === false ||
    calendarResult.success === false ||
    notificationResult.success === false
  ) {
    return null;
  }

  return (
    <WorkbenchFrame className="external-action-sandbox-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability</p>
          <h1>External action sandbox mock</h1>
          <p className="workbench-intro">
            Deterministic no-op boundary for participant-facing message sends,
            calendar writes, notification delivery, and side-effect audit
            records.{" "}
            <a href="#external-action-sandbox-scenario-controls">
              Scenario controls
            </a>
          </p>
        </header>

        <WorkbenchSurface
          elevated
          eyebrow="Mock capability"
          title="External action sandbox mock"
        >
          <div
            className="relationship-meta"
            aria-label="External action sandbox operator checkpoint"
          >
            <span>Provider switch ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER</span>
            <span>Live notes {liveImplementationNotesPath}</span>
            <span>{successResult.data.provenance.sourceLabel}</span>
          </div>
          <p>{successResult.data.summary}</p>
          <BoundaryMatrix provenance={successResult.data.provenance} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Success state" title="No-op actions">
          <div className="workbench-grid external-action-grid">
            {successResult.data.actions.map((action) => (
              <ActionCard action={action} key={action.actionId} />
            ))}
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="No-op results" title="Suppressed provider calls">
          <div className="workbench-grid external-action-state-matrix">
            <NoOpResultCard payload={messageResult.data} />
            <NoOpResultCard payload={calendarResult.data} />
            <NoOpResultCard payload={notificationResult.data} />
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Audit" title="Side-effect audit records">
          <AuditRecords auditRecords={successResult.data.auditRecords} />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="State matrix" title="Probe states">
          <div className="workbench-grid external-action-state-matrix">
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
