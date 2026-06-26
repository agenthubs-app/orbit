import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  WANT_CONNECT_ERROR_DEFINITIONS,
  type WantConnectMatch,
  type WantConnectMatchesResult,
  type WantConnectParticipant,
  type WantConnectPayload,
  type WantConnectProvenance,
  type WantConnectResult,
} from "../want-connect-contract";
import { createMockWantConnectService } from "../mock-want-connect-service";

export const ON_SITE_WANT_TO_CONNECT_MOCK_SLUG =
  "on-site-want-to-connect-mock";

const liveImplementationNotesPath =
  "features/events/on-site-want-to-connect-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.on-site-want-connect-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.on-site-want-connect-workbench .workbench-shell,
.on-site-want-connect-workbench .workbench-surface,
.on-site-want-connect-workbench .workbench-grid,
.on-site-want-connect-workbench .relationship-meta,
.on-site-want-connect-workbench .control-stack,
.on-site-want-connect-workbench .chip-row,
.on-site-want-connect-workbench .button-row,
.on-site-want-connect-workbench form {
  min-width: 0;
}

.on-site-want-connect-workbench input,
.on-site-want-connect-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.on-site-want-connect-workbench code,
.on-site-want-connect-workbench dd,
.on-site-want-connect-workbench .orbit-chip,
.on-site-want-connect-workbench .source-list li {
  overflow-wrap: anywhere;
}

.on-site-want-connect-workbench .chip-row,
.on-site-want-connect-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.on-site-want-connect-workbench .want-connect-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.on-site-want-connect-workbench .want-connect-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.on-site-want-connect-workbench .want-connect-state-matrix {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 196px), 1fr));
}

.on-site-want-connect-workbench .want-connect-state-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 0;
  padding: var(--orbit-space-sm);
}

.on-site-want-connect-workbench .want-connect-state-card h3 {
  font-size: 0.95rem;
  margin: 0;
}
`;

const wantConnectApiProbes = [
  {
    label: "Record want-to-connect intent",
    command: "POST /api/events/demo-event-1/want-to-connect",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic local intent and mutual interest.",
  },
  {
    label: "Read mutual-interest matches",
    command: "GET /api/events/demo-event-1/matches",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the match success notice fixture.",
  },
  {
    label: "Empty match list",
    command: "GET /api/events/demo-event-1/matches?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope with no mutual-interest matches.",
  },
  {
    label: "Pending target interest",
    command:
      "POST /api/events/demo-event-1/want-to-connect?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the target attendee has not confirmed interest.",
  },
  {
    label: "Controlled failure",
    command:
      "POST /api/events/demo-event-1/want-to-connect?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with WANT_CONNECT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/on-site-want-to-connect-mock/.",
  "ORBIT_WANT_CONNECT_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires a real-time presence provider, peer notification provider, and external messaging sandbox.",
  "Every live intent, mutual-interest match, and success notice keeps source evidence and provenance.",
  "Replacement tests cover intent creation, matches, empty, pending, missing event, missing target, provider failure, and confirmation-gated messaging.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="On-site want-to-connect evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ParticipantSummary({
  participants,
}: {
  participants: readonly WantConnectParticipant[];
}) {
  return (
    <dl className="relationship-meta">
      {participants.map((participant) => (
        <div key={participant.contactId}>
          <dt>{participant.displayName}</dt>
          <dd>
            {participant.role} at {participant.organization}.{" "}
            {participant.onSiteContext}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MatchSummary({ matches }: { matches: readonly WantConnectMatch[] }) {
  return (
    <dl className="relationship-meta">
      {matches.map((match) => (
        <div key={match.matchId}>
          <dt>{match.successNotice.title}</dt>
          <dd>
            {match.participantNames.join(" and ")}.{" "}
            {match.successNotice.message}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
  provenance,
}: {
  payload: WantConnectPayload;
  provenance: WantConnectProvenance;
}) {
  const presenceBlocked =
    provenance.realtimePresenceRequested === false &&
    payload.event.realtimePresenceRequested === false &&
    payload.participants.every(
      (participant) => participant.realtimePresenceRequested === false,
    ) &&
    (payload.intent === null ||
      payload.intent.realtimePresenceRequested === false) &&
    payload.mutualInterest.realtimePresenceRequested === false;
  const peerNotificationsBlocked =
    provenance.peerNotificationDelivered === false &&
    payload.participants.every(
      (participant) => participant.peerNotificationDelivered === false,
    ) &&
    (payload.intent === null ||
      payload.intent.peerNotificationDelivered === false) &&
    payload.mutualInterest.peerNotificationDelivered === false &&
    (payload.matchNotice === null ||
      payload.matchNotice.peerNotificationDelivered === false);
  const externalMessagesBlocked =
    provenance.externalMessageSent === false &&
    payload.participants.every(
      (participant) => participant.externalMessageSent === false,
    ) &&
    (payload.intent === null || payload.intent.externalMessageSent === false) &&
    payload.mutualInterest.externalMessageSent === false &&
    (payload.matchNotice === null ||
      payload.matchNotice.externalMessageSent === false);

  return (
    <dl
      aria-label="Mock-only on-site want-to-connect execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Real-time presence</dt>
        <dd>
          <code>{presenceBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Peer notifications</dt>
        <dd>
          <code>{peerNotificationsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>External messaging</dt>
        <dd>
          <code>{externalMessagesBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: WantConnectPayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: want-to-connect intent, mutual interest, and the match
        success notice all come from local event fixtures.
      </p>
      <dl
        aria-label="On-site want-to-connect operator checkpoint"
        className="relationship-meta want-connect-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.name} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Mutual interest</dt>
          <dd>
            <code>{payload.mutualInterest.state}</code> by local fixture rule.
          </dd>
        </div>
        <div>
          <dt>Match success notice</dt>
          <dd>{payload.matchNotice?.title ?? "No notice ready"}.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            real-time presence {String(payload.provenance.realtimePresenceRequested)};
            peer notifications{" "}
            {String(payload.provenance.peerNotificationDelivered)}; external
            messaging {String(payload.provenance.externalMessageSent)}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function StateComparison({
  successState,
  emptyState,
  pendingState,
  failureState,
}: {
  successState: WantConnectResult;
  emptyState: WantConnectMatchesResult;
  pendingState: WantConnectResult;
  failureState: WantConnectResult;
}) {
  const rows = [
    {
      label: "Success",
      result:
        successState.success === true ? "Ready notice" : successState.error.code,
      detail: successState.success === true
        ? successState.data.matchNotice?.title ?? "No notice"
        : successState.error.message,
    },
    {
      label: "Empty",
      result:
        emptyState.success === true ? "No match yet" : emptyState.error.code,
      detail: emptyState.success === true
        ? emptyState.data.nextAction
        : emptyState.error.message,
    },
    {
      label: "Pending",
      result: pendingState.success === true
        ? "Waiting on target"
        : pendingState.error.code,
      detail: pendingState.success === true
        ? pendingState.data.nextAction
        : pendingState.error.message,
    },
    {
      label: "Failure",
      result:
        failureState.success === true
          ? "Unexpected success"
          : "Controlled failure",
      detail: failureState.success === true
        ? failureState.data.summary
        : failureState.error.recovery,
    },
  ] as const;

  return (
    <WorkbenchSurface
      elevated
      eyebrow="State matrix"
      title="Compare mock outcomes before drilling in"
    >
      <p className="type-body">
        Compare success, empty, pending, and failure outcomes from the mock
        service before reading the detailed panels.
      </p>
      <div
        aria-label="On-site want-to-connect state comparison"
        className="want-connect-state-matrix"
        role="list"
      >
        {rows.map((row) => (
          <article
            className="want-connect-state-card"
            key={row.label}
            role="listitem"
          >
            <h3>{row.label}</h3>
            <dl className="relationship-meta">
              <div>
                <dt>Result</dt>
                <dd>{row.result}</dd>
              </div>
              <div>
                <dt>Operator check</dt>
                <dd>{row.detail}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function IntentForm() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Local event fixture"
      title="Record want-to-connect intent"
    >
      <p className="type-body">
        This form posts to the route handler that uses the on-site
        want-to-connect mock service. The target attendee stays inside the
        deterministic fixture until a live provider is approved.
      </p>
      <form
        action="/api/events/demo-event-1/want-to-connect"
        aria-label="Mock on-site want-to-connect intent form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field
          label="Target attendee"
          helper="Local rules use Priya for mutual interest and Aiko for pending."
        >
          <select name="targetContactId" defaultValue="contact:priya-shah">
            <option value="contact:priya-shah">Priya Shah</option>
            <option value="contact:aiko-mori">Aiko Mori</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Record intent
        </button>
      </form>
      <div className="chip-row" aria-label="On-site want-to-connect guardrails">
        <Chip tone="evidence">local mutual-interest fixture</Chip>
        <Chip tone="privacy">event-only context</Chip>
        <Chip tone="confirmation">confirm before message</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="On-site want-to-connect API probe actions"
    >
      <p className="type-body">
        These probes exercise intent creation, match listing, empty, pending,
        and controlled failure paths inside the mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/events/demo-event-1/want-to-connect"
          aria-label="Run on-site want-to-connect intent API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run intent probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/matches"
          aria-label="Run on-site want-to-connect matches API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run matches probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/matches?scenario=empty"
          aria-label="Run empty on-site want-to-connect API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/want-to-connect?scenario=pending"
          aria-label="Run pending on-site want-to-connect API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/want-to-connect?scenario=failure"
          aria-label="Run controlled failure on-site want-to-connect API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function OnSiteWantToConnectMockDemo() {
  const wantConnectService = createMockWantConnectService();
  const successState = wantConnectService.createWantToConnectIntent({
    eventId: "demo-event-1",
    targetContactId: "contact:priya-shah",
  });
  const matchesState = wantConnectService.listMatches({
    eventId: "demo-event-1",
  });
  const emptyState = wantConnectService.listMatches({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pendingState = wantConnectService.createWantToConnectIntent({
    eventId: "demo-event-1",
    scenario: "pending",
    targetContactId: "contact:aiko-mori",
  });
  const failureState = wantConnectService.createWantToConnectIntent({
    eventId: "demo-event-1",
    scenario: "failure",
    targetContactId: "contact:priya-shah",
  });
  const successPayload = successState.success ? successState.data : null;
  const matchesPayload = matchesState.success ? matchesState.data : null;

  return (
    <WorkbenchFrame className="on-site-want-connect-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>On-site want-to-connect mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for recording in-room want-to-connect intent,
            checking deterministic mutual interest, and preparing a match
            success notice without live presence or message delivery.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <StateComparison
          emptyState={emptyState}
          failureState={failureState}
          pendingState={pendingState}
          successState={successState}
        />

        <IntentForm />

        <section
          className="workbench-grid"
          aria-label="On-site want-to-connect states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={ON_SITE_WANT_TO_CONNECT_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Intent</dt>
                    <dd>
                      <code>{successPayload.intent?.intentId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Mutual interest</dt>
                    <dd>{successPayload.mutualInterest.rule}.</dd>
                  </div>
                  <div>
                    <dt>Match success notice</dt>
                    <dd>{successPayload.matchNotice?.message}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No mutual interest" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Matches</dt>
                    <dd>No match success notices are ready.</dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{emptyState.data.nextAction}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Target review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Target attendee</dt>
                    <dd>Aiko Mori</dd>
                  </div>
                  <div>
                    <dt>Mutual interest</dt>
                    <dd>
                      <code>{pendingState.data.mutualInterest.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{pendingState.data.nextAction}</dd>
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
          eyebrow="Local participants"
          title="Participants carry event context and evidence"
        >
          {successPayload && (
            <>
              <p className="type-body">
                Participant rows are deterministic fixture records. They are
                not presence subscriptions and do not deliver peer updates.
              </p>
              <ParticipantSummary participants={successPayload.participants} />
              <MockOnlyExecutionChecks
                payload={successPayload}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Match success notice"
          title="Mutual interest stays reviewable before action"
        >
          {matchesPayload && (
            <>
              <MatchSummary matches={matchesPayload.matches} />
              <p className="privacy-note">
                The mock sets real-time presence, peer notification, external
                messaging, database, calendar, email, notification, and model
                execution flags to false.
              </p>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="On-site want-to-connect routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover intent creation and match read routes.
            Empty and controlled failure probes document non-success states
            without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {WANT_CONNECT_ERROR_DEFINITIONS.WANT_CONNECT_MOCK_FAILED.code}
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="On-site want-to-connect API probes"
          >
            {wantConnectApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
                  <br />
                  {probe.expectation}
                  <br />
                  Expected status: {probe.expectedStatus}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the on-site event capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch</dt>
              <dd>
                <code>ORBIT_WANT_CONNECT_PROVIDER</code>
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
