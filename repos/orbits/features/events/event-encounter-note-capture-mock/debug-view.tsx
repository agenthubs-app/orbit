import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS,
  type EventEncounterEvidencePayload,
  type EventEncounterNotePayload,
  type EventEncounterNoteProvenance,
  type EventEncounterNoteResult,
  type EventEncounterParticipant,
} from "../encounter-contract";
import { createMockEventEncounterNoteService } from "../mock-encounter-service";

export const EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG =
  "event-encounter-note-capture-mock";

const liveImplementationNotesPath =
  "features/events/event-encounter-note-capture-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.event-encounter-note-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-encounter-note-workbench .workbench-shell,
.event-encounter-note-workbench .workbench-surface,
.event-encounter-note-workbench .workbench-grid,
.event-encounter-note-workbench .relationship-meta,
.event-encounter-note-workbench .control-stack,
.event-encounter-note-workbench .chip-row,
.event-encounter-note-workbench .button-row,
.event-encounter-note-workbench form {
  min-width: 0;
}

.event-encounter-note-workbench input,
.event-encounter-note-workbench textarea,
.event-encounter-note-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-encounter-note-workbench code,
.event-encounter-note-workbench dd,
.event-encounter-note-workbench .orbit-chip,
.event-encounter-note-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-encounter-note-workbench .chip-row,
.event-encounter-note-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.event-encounter-note-workbench .encounter-note-checkpoint-grid,
.event-encounter-note-workbench .encounter-note-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.event-encounter-note-workbench .encounter-note-checkpoint-grid div,
.event-encounter-note-workbench .encounter-note-state-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.event-encounter-note-workbench .encounter-note-state-matrix {
  display: grid;
  gap: var(--orbit-space-sm);
}

.event-encounter-note-workbench .encounter-note-state-card {
  display: grid;
  gap: var(--orbit-space-sm);
}

.event-encounter-note-workbench .encounter-note-state-card h3 {
  font-size: 0.95rem;
  margin: 0;
}
`;

const encounterNoteApiProbes = [
  {
    label: "Capture encounter note",
    command: "POST /api/events/demo-event-1/encounters",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with typed note, voice placeholder, summary seed, and evidence draft fixtures.",
  },
  {
    label: "Create encounter evidence",
    command:
      "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with deterministic evidence created from the encounter note.",
  },
  {
    label: "Evidence empty guard",
    command:
      "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=empty",
    expectedStatus: 400,
    expectation:
      "Expect 400 failure envelope when evidence is requested before local note content exists.",
  },
  {
    label: "Evidence pending guard",
    command:
      "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=pending",
    expectedStatus: 409,
    expectation:
      "Expect 409 failure envelope while the voice-note placeholder is waiting for review.",
  },
  {
    label: "Evidence controlled failure",
    command:
      "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope without retrying storage, network, device, or model work.",
  },
  {
    label: "Empty encounter note",
    command: "POST /api/events/demo-event-1/encounters?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local note has been captured.",
  },
  {
    label: "Voice placeholder pending",
    command: "POST /api/events/demo-event-1/encounters?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope with the voice-note placeholder and no evidence draft.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/events/demo-event-1/encounters?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_ENCOUNTER_NOTE_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/event-encounter-note-capture-mock/.",
  "ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires speech-to-text, audio upload, live note storage, and evidence persistence providers.",
  "Every live encounter note, summary seed, and evidence record keeps source evidence and provenance.",
  "Replacement tests cover note capture, evidence creation, empty, pending, missing event, missing encounter, provider failure, and privacy review paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event encounter note evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ParticipantSummary({
  participant,
}: {
  participant: EventEncounterParticipant;
}) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>{participant.displayName}</dt>
        <dd>
          {participant.role} at {participant.organization}.{" "}
          {participant.eventContext}
        </dd>
      </div>
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
  provenance,
}: {
  payload: EventEncounterNotePayload;
  provenance: EventEncounterNoteProvenance;
}) {
  const speechToTextBlocked =
    provenance.speechToTextRequested === false &&
    payload.note?.speechToTextRequested === false &&
    payload.voiceNote?.speechToTextRequested === false;
  const audioUploadBlocked =
    provenance.audioUploadRequested === false &&
    payload.encounter?.audioUploadRequested === false &&
    payload.voiceNote?.audioUploadRequested === false &&
    payload.voiceNote?.audioBlobStored === false;
  const liveNoteStorageBlocked =
    provenance.liveNoteStorageExecuted === false &&
    payload.encounter?.liveNoteStorageExecuted === false &&
    payload.note?.liveNoteStorageExecuted === false;
  const modelBlocked =
    provenance.aiProviderRequested === false &&
    payload.conversationSummarySeed?.aiProviderRequested === false &&
    payload.conversationSummarySeed?.modelProviderRequested === false;

  return (
    <dl
      aria-label="Mock-only event encounter note execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Speech capture</dt>
        <dd>speech-to-text {String(speechToTextBlocked ? false : true)}</dd>
      </div>
      <div>
        <dt>Audio handling</dt>
        <dd>audio upload {String(audioUploadBlocked ? false : true)}</dd>
      </div>
      <div>
        <dt>Storage</dt>
        <dd>live note storage {String(liveNoteStorageBlocked ? false : true)}</dd>
      </div>
      <div>
        <dt>Summary generation</dt>
        <dd>model work {String(modelBlocked ? false : true)}</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: EventEncounterNotePayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the typed note, voice-note placeholder, conversation
        summary seed, and evidence draft all come from local fixtures.
      </p>
      <dl
        aria-label="Event encounter note operator checkpoint"
        className="relationship-meta encounter-note-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.name} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Participant</dt>
          <dd>{payload.participant?.displayName ?? "No participant"}</dd>
        </div>
        <div>
          <dt>Encounter</dt>
          <dd>
            <code>{payload.encounter?.encounterId ?? "none"}</code>
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            speech-to-text {String(payload.provenance.speechToTextRequested)};
            audio upload {String(payload.provenance.audioUploadRequested)};
            live note storage{" "}
            {String(payload.provenance.liveNoteStorageExecuted)}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function StateComparison({
  emptyState,
  failureState,
  pendingState,
  successState,
}: {
  emptyState: EventEncounterNoteResult;
  failureState: EventEncounterNoteResult;
  pendingState: EventEncounterNoteResult;
  successState: EventEncounterNoteResult;
}) {
  const rows = [
    {
      label: "Success",
      result:
        successState.success === true ? "Captured note" : successState.error.code,
      detail: successState.success === true
        ? successState.data.note?.text ?? "No note"
        : successState.error.message,
    },
    {
      label: "Empty",
      result:
        emptyState.success === true ? "No encounter note" : emptyState.error.code,
      detail: emptyState.success === true
        ? emptyState.data.nextAction
        : emptyState.error.message,
    },
    {
      label: "Pending",
      result: pendingState.success === true
        ? "Voice placeholder waiting"
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
        aria-label="Event encounter note state comparison"
        className="encounter-note-state-matrix"
        role="list"
      >
        {rows.map((row) => (
          <article
            className="encounter-note-state-card"
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

function NoteCaptureForm() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Local event fixture"
      title="Capture encounter note"
    >
      <p className="type-body">
        This form posts to the route handler that uses the encounter note mock
        service. The note stays inside deterministic event fixtures until a
        live provider is approved.
      </p>
      <form
        action="/api/events/demo-event-1/encounters"
        aria-label="Mock event encounter note capture form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field label="Contact" helper="The fixture participant is Priya Shah.">
          <input name="contactId" readOnly type="text" value="contact:priya-shah" />
        </Field>
        <Field
          label="Typed note"
          helper="Voice capture is represented by a placeholder in this sprint."
        >
          <textarea
            defaultValue="Priya asked for a storage pilot introduction."
            name="noteText"
            rows={3}
          />
        </Field>
        <button className="primary-action" type="submit">
          Capture note
        </button>
      </form>
      <div className="chip-row" aria-label="Event encounter note guardrails">
        <Chip tone="evidence">typed local note</Chip>
        <Chip tone="privacy">event-only context</Chip>
        <Chip tone="confirmation">review before follow-up</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Event encounter note API probe actions"
    >
      <p className="type-body">
        These probes exercise encounter note capture, evidence creation, empty,
        pending, and controlled failure paths inside the mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/events/demo-event-1/encounters"
          aria-label="Run event encounter note capture API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run capture probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters/demo-encounter-1/evidence"
          aria-label="Run event encounter evidence API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run evidence probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=empty"
          aria-label="Run empty event encounter evidence API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run evidence empty
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=pending"
          aria-label="Run pending event encounter evidence API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run evidence pending
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=failure"
          aria-label="Run controlled failure event encounter evidence API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run evidence failure
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters?scenario=empty"
          aria-label="Run empty event encounter note API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters?scenario=pending"
          aria-label="Run pending event encounter note API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/encounters?scenario=failure"
          aria-label="Run controlled failure event encounter note API probe"
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

function EvidenceCreationPanel({
  evidence,
}: {
  evidence: EventEncounterEvidencePayload;
}) {
  return (
    <>
      <p className="type-body">{evidence.summary}</p>
      <dl className="relationship-meta">
        <div>
          <dt>Evidence id</dt>
          <dd>
            <code>{evidence.evidence.evidenceId}</code>
          </dd>
        </div>
        <div>
          <dt>Source excerpt</dt>
          <dd>{evidence.evidence.excerpt}</dd>
        </div>
        <div>
          <dt>Storage guard</dt>
          <dd>
            live database write{" "}
            {String(evidence.evidence.liveDatabaseWriteExecuted)}
          </dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={evidence.provenance.evidenceIds} />
    </>
  );
}

export function EventEncounterNoteCaptureMockDemo() {
  const encounterNoteService = createMockEventEncounterNoteService();
  const successState = encounterNoteService.createEncounterNote({
    contactId: "contact:priya-shah",
    eventId: "demo-event-1",
    noteText: "Priya asked for a storage pilot introduction.",
  });
  const evidenceState = encounterNoteService.createEncounterEvidence({
    encounterId: "demo-encounter-1",
    eventId: "demo-event-1",
  });
  const emptyState = encounterNoteService.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pendingState = encounterNoteService.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failureState = encounterNoteService.createEncounterNote({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const successPayload = successState.success ? successState.data : null;
  const evidencePayload = evidenceState.success ? evidenceState.data : null;

  return (
    <WorkbenchFrame className="event-encounter-note-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event encounter note capture mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for capturing on-site encounter notes, holding a
            voice-note placeholder, seeding a conversation summary, and creating
            evidence without device, storage, network, or model execution.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <StateComparison
          emptyState={emptyState}
          failureState={failureState}
          pendingState={pendingState}
          successState={successState}
        />

        <NoteCaptureForm />

        <section
          className="workbench-grid"
          aria-label="Event encounter note states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Encounter</dt>
                    <dd>
                      <code>{successPayload.encounter?.encounterId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Captured note</dt>
                    <dd>{successPayload.note?.text}</dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{successPayload.nextAction}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Nothing captured" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Encounter</dt>
                    <dd>No encounter note</dd>
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

          <WorkbenchSurface
            eyebrow="Voice placeholder"
            title="Pending state"
          >
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Voice-note placeholder</dt>
                    <dd>{pendingState.data.voiceNote?.placeholderText}</dd>
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
          eyebrow="Conversation context"
          title="Participant and note provenance"
        >
          {successPayload?.participant && (
            <>
              <p className="type-body">
                Participant context is a deterministic fixture. It is not an
                attendee lookup, calendar signal, email signal, or delivered
                notification.
              </p>
              <ParticipantSummary participant={successPayload.participant} />
              <MockOnlyExecutionChecks
                payload={successPayload}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Conversation summary seed"
          title="Conversation summary seed"
        >
          {successPayload?.conversationSummarySeed && (
            <>
              <p className="type-body">
                {successPayload.conversationSummarySeed.suggestedSummary}
              </p>
              <dl className="relationship-meta">
                <div>
                  <dt>Seed id</dt>
                  <dd>
                    <code>
                      {successPayload.conversationSummarySeed.seedId}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Generated by</dt>
                  <dd>{successPayload.conversationSummarySeed.generatedBy}</dd>
                </div>
                <div>
                  <dt>Model work</dt>
                  <dd>
                    {String(
                      successPayload.conversationSummarySeed.aiProviderRequested,
                    )}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Evidence creation"
          title="Evidence creation"
        >
          {evidencePayload && <EvidenceCreationPanel evidence={evidencePayload} />}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Event encounter note routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover encounter capture and evidence creation.
            Empty, pending, and controlled failure probes document non-success
            work without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_ENCOUNTER_NOTE_ERROR_DEFINITIONS
                      .EVENT_ENCOUNTER_NOTE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Event encounter note API probes"
          >
            {encounterNoteApiProbes.map((probe) => (
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
          title="Replacement notes stay with the event encounter capability"
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
                <code>ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER</code>
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
