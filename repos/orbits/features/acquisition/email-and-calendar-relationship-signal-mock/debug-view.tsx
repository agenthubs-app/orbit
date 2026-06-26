import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS,
  type EmailCalendarRelationshipSignal,
  type EmailCalendarSignalPayload,
  type EmailCalendarSignalProvenance,
} from "../email-calendar-contract";
import { createMockEmailCalendarSignalService } from "../mock-email-calendar-service";

export const EMAIL_CALENDAR_SIGNAL_MOCK_SLUG =
  "email-and-calendar-relationship-signal-mock";

const liveImplementationNotesPath =
  "features/acquisition/email-and-calendar-relationship-signal-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.email-calendar-signal-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.email-calendar-signal-workbench .workbench-shell,
.email-calendar-signal-workbench .workbench-surface,
.email-calendar-signal-workbench .workbench-grid,
.email-calendar-signal-workbench .relationship-meta,
.email-calendar-signal-workbench .control-stack,
.email-calendar-signal-workbench .chip-row,
.email-calendar-signal-workbench .button-row,
.email-calendar-signal-workbench form {
  min-width: 0;
}

.email-calendar-signal-workbench input,
.email-calendar-signal-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.email-calendar-signal-workbench code,
.email-calendar-signal-workbench dd,
.email-calendar-signal-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.email-calendar-signal-workbench .chip-row,
.email-calendar-signal-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.email-calendar-signal-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.email-calendar-signal-workbench .probe-result-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 204px), 1fr));
}

.email-calendar-signal-workbench .operator-checkpoint-grid div,
.email-calendar-signal-workbench .probe-result-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const emailCalendarApiProbes = [
  {
    label: "Read relationship signals",
    command: "GET /api/relationship-signals/email-calendar",
    expectedStatus: 200,
    envelopeSuccess: true,
    expectation:
      "Expect 200 success envelope with metadata-only email and calendar signals.",
  },
  {
    label: "Confirm calendar signal",
    command:
      "POST /api/relationship-signals/demo-calendar-signal-1/confirm",
    expectedStatus: 200,
    envelopeSuccess: true,
    expectation:
      "Expect 200 success envelope with a confirmed signal and confirmation evidence.",
  },
  {
    label: "Empty signal queue",
    command: "GET /api/relationship-signals/email-calendar?scenario=empty",
    expectedStatus: 200,
    envelopeSuccess: true,
    expectation: "Expect 200 empty envelope with no relationship signals.",
  },
  {
    label: "Pending permission review",
    command: "GET /api/relationship-signals/email-calendar?scenario=pending",
    expectedStatus: 200,
    envelopeSuccess: true,
    expectation: "Expect 200 pending envelope with no reviewable signals.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/relationship-signals/email-calendar?scenario=failure",
    expectedStatus: 503,
    envelopeSuccess: false,
    errorCode: "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED",
    expectation:
      "Expect 503 failure envelope with EMAIL_CALENDAR_SIGNAL_MOCK_FAILED context.",
  },
  {
    label: "Confirmation blocked",
    command:
      "POST /api/relationship-signals/demo-calendar-signal-1/confirm?scenario=blocked",
    expectedStatus: 403,
    envelopeSuccess: false,
    errorCode: "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
    expectation:
      "Expect 403 failure envelope until explicit confirmation is provided.",
  },
  {
    label: "Missing signal adversarial probe",
    command: "POST /api/relationship-signals/missing-signal/confirm",
    expectedStatus: 404,
    envelopeSuccess: false,
    errorCode: "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
    expectation:
      "Expect 404 failure envelope proving unknown signal ids stay inside the deterministic mock boundary.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/email-and-calendar-relationship-signal-mock/.",
  "ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER switches from mock to live.",
  "Live replacement requires Gmail, Google Calendar, and Microsoft Graph permissions.",
  "Message body ingestion stays opt-in, minimized, and provenance-linked.",
  "Replacement tests cover list, confirm, empty, pending, blocked, not-found, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Email calendar signal evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SignalSummary({
  signals,
}: {
  signals: readonly EmailCalendarRelationshipSignal[];
}) {
  return (
    <dl className="relationship-meta">
      {signals.map((signal) => (
        <div key={signal.id}>
          <dt>{signal.displayName}</dt>
          <dd>
            {signal.role} at {signal.organization}.{" "}
            {signal.relationshipContext} <code>{signal.sourceKind}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  signals,
  provenance,
}: {
  signals: readonly EmailCalendarRelationshipSignal[];
  provenance: EmailCalendarSignalProvenance;
}) {
  const providerCallsBlocked =
    provenance.gmailApiRequested === false &&
    provenance.googleCalendarApiRequested === false &&
    provenance.microsoftGraphApiRequested === false &&
    signals.every(
      (signal) =>
        signal.gmailApiRequested === false &&
        signal.googleCalendarApiRequested === false &&
        signal.microsoftGraphApiRequested === false,
    );
  const messageBodyIngestionBlocked =
    provenance.messageBodyIngested === false &&
    signals.every((signal) => signal.messageBodyIngested === false);
  const backgroundSyncBlocked =
    provenance.backgroundSyncEnqueued === false &&
    signals.every((signal) => signal.backgroundSyncEnqueued === false);

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Provider calls</dt>
        <dd>
          <code>{providerCallsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Message body ingestion</dt>
        <dd>
          <code>
            {messageBodyIngestionBlocked ? "false" : "unexpected true"}
          </code>
        </dd>
      </div>
      <div>
        <dt>Background sync</dt>
        <dd>
          <code>{backgroundSyncBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>
          <code>{String(provenance.databaseWriteExecuted)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: EmailCalendarSignalPayload;
}) {
  const sourceLabels = payload.signals
    .map((signal) => signal.source.label)
    .join(", ");
  const permissionRequired = payload.signals.every(
    (signal) => signal.permission.required === true,
  )
    ? "required"
    : "unexpected optional";
  const confirmationRequired = payload.signals.every(
    (signal) => signal.confirmation.required === true,
  )
    ? "required"
    : "unexpected optional";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: Gmail fixture, Google Calendar fixture, and Microsoft
        Graph fixture signals are metadata-only and require permission plus
        explicit user confirmation before conversion.
      </p>
      <dl
        aria-label="Email calendar signal operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Sources</dt>
          <dd>{sourceLabels}</dd>
        </div>
        <div>
          <dt>Signals available</dt>
          <dd>{payload.signals.length} relationship signals.</dd>
        </div>
        <div>
          <dt>Review gates</dt>
          <dd>
            permission {permissionRequired}; confirmation{" "}
            {confirmationRequired}.
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            message body ingestion false; background sync false; provider calls
            false.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function SignalReviewPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Metadata-only source review"
      title="Relationship signal intake"
    >
      <p className="type-body">
        This boundary derives relationship signals from deterministic email and
        calendar metadata fixtures without reading message bodies, syncing
        providers, writing contacts, or delivering notifications.
      </p>
      <form
        action="/api/relationship-signals/email-calendar"
        aria-label="Mock email calendar signal filter"
        className="control-stack"
        method="get"
      >
        <Field label="Source" helper="The demo route uses local fixtures.">
          <select name="sourceKind" defaultValue="">
            <option value="">All relationship signal sources</option>
            <option value="gmail">Gmail fixture</option>
            <option value="google_calendar">Google Calendar fixture</option>
            <option value="microsoft_graph">Microsoft Graph fixture</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Review signals
        </button>
      </form>
      <div className="chip-row" aria-label="Email calendar signal guardrails">
        <Chip tone="privacy">metadata only</Chip>
        <Chip tone="confirmation">permission required</Chip>
        <Chip tone="confirmation">confirmation required</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Email calendar signal API probe actions"
    >
      <p className="type-body">
        These probes exercise list, confirm, empty, pending, blocked,
        not-found, and controlled failure paths inside the email and calendar
        signal mock.
      </p>
      <div className="button-row">
        <form
          action="/api/relationship-signals/email-calendar"
          aria-label="Run email calendar signal list probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run list probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/demo-calendar-signal-1/confirm"
          aria-label="Run email calendar signal confirmation probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run confirm probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/email-calendar?scenario=empty"
          aria-label="Run empty email calendar signal probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/email-calendar?scenario=pending"
          aria-label="Run pending email calendar signal probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/email-calendar?scenario=failure"
          aria-label="Run failure email calendar signal probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run failure probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/demo-calendar-signal-1/confirm?scenario=blocked"
          aria-label="Run blocked email calendar signal confirmation probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run blocked probe
          </button>
        </form>
        <form
          action="/api/relationship-signals/missing-signal/confirm"
          aria-label="Run not-found email calendar signal confirmation probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run not-found probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function EmailCalendarRelationshipSignalMockDemo() {
  const service = createMockEmailCalendarSignalService();
  const successState = service.listEmailCalendarSignals();
  const emptyState = service.listEmailCalendarSignals({ scenario: "empty" });
  const pendingState = service.listEmailCalendarSignals({
    scenario: "pending",
  });
  const failureState = service.listEmailCalendarSignals({
    scenario: "failure",
  });
  const successPayload = successState.success ? successState.data : null;

  return (
    <WorkbenchFrame className="email-calendar-signal-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Email and calendar relationship signal mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for turning permission-gated email and calendar
            metadata into relationship signals before any live Gmail, Google
            Calendar, Microsoft Graph, or background sync path exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <SignalReviewPanel />

        <section
          className="workbench-grid"
          aria-label="Email calendar relationship signal states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EMAIL_CALENDAR_SIGNAL_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Signals</dt>
                    <dd>{successPayload.signals.length} signals available.</dd>
                  </div>
                  <div>
                    <dt>Review gates</dt>
                    <dd>permission required and confirmation required.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No granted source" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Signals</dt>
                    <dd>No email or calendar signals are available.</dd>
                  </div>
                  <div>
                    <dt>Permission</dt>
                    <dd>Mock permission has not produced reviewable rows.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Permission review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Signal status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Review</dt>
                    <dd>Signal review waits for local fixture permission.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Controlled failure" title="Failure state">
            {failureState.success === false && (
              <>
                <dl className="relationship-meta">
                  <div>
                    <dt>Error code</dt>
                    <dd>
                      <code>{failureState.error.code}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Message</dt>
                    <dd>{failureState.error.message}</dd>
                  </div>
                  <div>
                    <dt>Recovery</dt>
                    <dd>{failureState.error.recovery}</dd>
                  </div>
                </dl>
                <EvidenceChips evidenceIds={failureState.error.evidenceIds} />
              </>
            )}
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface
          eyebrow="Signal context"
          title="Relationship evidence stays inspectable"
        >
          {successPayload && (
            <>
              <p className="type-body">
                Each signal carries source, evidence, permission, confirmation,
                and relationship context so review starts from why the
                connection exists.
              </p>
              <SignalSummary signals={successPayload.signals} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No provider, sync, write, or notification runs"
        >
          {successPayload && (
            <>
              <p className="privacy-note">
                The mock sets Gmail API requests, Google Calendar API requests,
                Microsoft Graph API requests, background sync, message body
                ingestion, database writes, and notifications to false.
              </p>
              <MockOnlyExecutionChecks
                signals={successPayload.signals}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Relationship signal routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover list and confirmation routes. Empty,
            pending, blocked, not-found, and controlled failure probes document
            non-success states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS
                      .EMAIL_CALENDAR_SIGNAL_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <h3>Probe result matrix</h3>
          <dl
            className="relationship-meta probe-result-grid"
            aria-label="Email calendar signal API probes"
          >
            {emailCalendarApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
                  <br />
                  Expected status <code>{probe.expectedStatus}</code>;
                  envelope success {String(probe.envelopeSuccess)}.{" "}
                  {"errorCode" in probe && (
                    <>
                      Expected error <code>{probe.errorCode}</code>.{" "}
                    </>
                  )}
                  {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock to live handoff"
          title="Replacement boundary is documented"
        >
          <p className="type-body">
            The live implementation notes stay with the capability at{" "}
            <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Provider switch</dt>
              <dd>
                <code>ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER</code>
              </dd>
            </div>
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <div key={excerpt}>
                <dt>Handoff</dt>
                <dd>{excerpt}</dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
