/**
 * 活动参会者导入 mock 的开发者面板。
 *
 * 这里展示 roster 导入、联系人草稿和 provenance，帮助验证活动来源如何进入联系人获取流程。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS,
  type EventAttendeeContactDraft,
  type EventAttendeeImportPayload,
  type EventAttendeeImportProvenance,
  type EventAttendeeImportResult,
  type EventAttendeeRecord,
  type EventAttendeeRosterResult,
} from "../event-attendee-contract";
import { createMockEventAttendeeImportService } from "../mock-event-attendee-import-service";

export const EVENT_ATTENDEE_IMPORT_MOCK_SLUG = "event-attendee-import-mock";

const liveImplementationNotesPath =
  "features/acquisition/event-attendee-import-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

function requireSynchronousMockResult<TResult>(
  result: TResult | Promise<TResult>,
): TResult {
  if (typeof (result as { then?: unknown }).then === "function") {
    throw new Error("Mock attendee import debug view requires synchronous mock results.");
  }

  return result as TResult;
}

const responsiveWorkbenchStyles = `
.event-attendee-import-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-attendee-import-workbench .workbench-shell,
.event-attendee-import-workbench .workbench-surface,
.event-attendee-import-workbench .workbench-grid,
.event-attendee-import-workbench .relationship-meta,
.event-attendee-import-workbench .control-stack,
.event-attendee-import-workbench .chip-row,
.event-attendee-import-workbench .button-row,
.event-attendee-import-workbench form {
  min-width: 0;
}

.event-attendee-import-workbench input,
.event-attendee-import-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-attendee-import-workbench code,
.event-attendee-import-workbench dd,
.event-attendee-import-workbench .orbit-chip,
.event-attendee-import-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-attendee-import-workbench .chip-row,
.event-attendee-import-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.event-attendee-import-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.event-attendee-import-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const eventAttendeeApiProbes = [
  {
    label: "Import attendee drafts",
    command: "POST /api/contact-drafts/event-attendees/import",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with attendee-sourced contact drafts and relationship status labels.",
  },
  {
    label: "Read attendee roster",
    command: "GET /api/events/demo-event-1/attendees",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the deterministic local attendee roster.",
  },
  {
    label: "Empty roster import",
    command:
      "POST /api/contact-drafts/event-attendees/import?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no staged drafts.",
  },
  {
    label: "Pending roster review",
    command:
      "POST /api/contact-drafts/event-attendees/import?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope with no staged drafts.",
  },
  {
    label: "Controlled failure",
    command:
      "POST /api/contact-drafts/event-attendees/import?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_ATTENDEE_IMPORT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/event-attendee-import-mock/.",
  "ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER switches from mock to live.",
  "Live replacement requires organizer attendee feed credentials and explicit import permissions.",
  "Bulk database import remains behind review, provenance, and confirmation tests.",
  "Replacement tests cover roster read, import, empty, pending, missing event, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event attendee import evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function RelationshipStatusChips({
  attendees,
}: {
  attendees: readonly EventAttendeeRecord[];
}) {
  return (
    <div className="chip-row" aria-label="Relationship status labels">
      {attendees.map((attendee) => (
        <Chip key={attendee.attendeeId} tone="confirmation">
          {attendee.relationshipStatus.label}
        </Chip>
      ))}
    </div>
  );
}

function AttendeeSummary({
  attendees,
}: {
  attendees: readonly EventAttendeeRecord[];
}) {
  return (
    <dl className="relationship-meta">
      {attendees.map((attendee) => (
        <div key={attendee.attendeeId}>
          <dt>{attendee.displayName}</dt>
          <dd>
            {attendee.role} at {attendee.organization}.{" "}
            {attendee.relationshipStatus.label}:{" "}
            {attendee.relationshipStatus.rationale}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DraftSummary({
  drafts,
}: {
  drafts: readonly EventAttendeeContactDraft[];
}) {
  return (
    <dl className="relationship-meta">
      {drafts.map((draft) => (
        <div key={draft.id}>
          <dt>{draft.relationshipStatus.label}</dt>
          <dd>
            <code>{draft.id}</code> for {draft.displayName}, {draft.role} at{" "}
            {draft.organization}. <code>contactWriteExecuted</code> and{" "}
            <code>bulkDatabaseImportExecuted</code> remain{" "}
            <code>{String(draft.contactWriteExecuted)}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  drafts,
  provenance,
}: {
  drafts: readonly EventAttendeeContactDraft[];
  provenance: EventAttendeeImportProvenance;
}) {
  const allContactWritesBlocked = drafts.every(
    (draft) => draft.contactWriteExecuted === false,
  );
  const allNotificationsBlocked = drafts.every(
    (draft) => draft.notificationDelivered === false,
  );
  const allBulkImportsBlocked =
    provenance.bulkDatabaseImportExecuted === false &&
    drafts.every((draft) => draft.bulkDatabaseImportExecuted === false);

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Organizer feed request</dt>
        <dd>
          <code>{String(provenance.organizerFeedRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>Contact writes</dt>
        <dd>
          <code>{allContactWritesBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          <code>{allNotificationsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Bulk database imports</dt>
        <dd>
          <code>{allBulkImportsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: EventAttendeeImportPayload;
}) {
  const relationshipLabels = Array.from(
    new Set(
      payload.contactDrafts.map((draft) => draft.relationshipStatus.label),
    ),
  ).join(", ");
  const contactWrites = payload.contactDrafts.every(
    (draft) => draft.contactWriteExecuted === false,
  )
    ? "false"
    : "unexpected true";
  const notifications = payload.contactDrafts.every(
    (draft) => draft.notificationDelivered === false,
  )
    ? "false"
    : "unexpected true";
  const bulkImports =
    payload.provenance.bulkDatabaseImportExecuted === false &&
    payload.contactDrafts.every(
      (draft) => draft.bulkDatabaseImportExecuted === false,
    )
      ? "false"
      : "unexpected true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the fixture stages event-sourced relationship drafts,
        keeps external execution false, and leaves every detailed state below
        for probe evidence.
      </p>
      <dl
        aria-label="Event attendee operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.name} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Drafts staged</dt>
          <dd>{payload.contactDrafts.length} attendee drafts.</dd>
        </div>
        <div>
          <dt>Relationship labels</dt>
          <dd>{relationshipLabels}</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            organizer feed {String(payload.provenance.organizerFeedRequested)};
            contact writes {contactWrites}; notifications {notifications};
            bulk imports {bulkImports}.
          </dd>
        </div>
        <div>
          <dt>Verifier note</dt>
          <dd>
            Browser smoke should judge API envelopes and rendered states;
            development live-reload diagnostics stay outside the mock boundary.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function RosterImportPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Organizer roster fixture"
      title="Local attendee import"
    >
      <p className="type-body">
        This boundary reads a deterministic attendee roster fixture and stages
        potential contact drafts without requesting organizer systems, bulk
        importing records, or notifying anyone.
      </p>
      <form
        action="/api/contact-drafts/event-attendees/import"
        aria-label="Mock event attendee import form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field
          label="Status filter"
          helper="Local rules can filter by relationship status."
        >
          <select name="relationshipStatusFilter" defaultValue="">
            <option value="">All attendee labels</option>
            <option value="new_potential_contact">New potential contact</option>
            <option value="known_contact">Known contact</option>
            <option value="priority_follow_up">Priority follow-up</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Stage attendee drafts
        </button>
      </form>
      <div className="chip-row" aria-label="Event attendee import guardrails">
        <Chip tone="evidence">fixture roster</Chip>
        <Chip tone="privacy">no organizer feed</Chip>
        <Chip tone="confirmation">review before write</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Event attendee import API probe actions"
    >
      <p className="type-body">
        These probes exercise roster import, empty, pending, and controlled
        failure paths inside the event attendee import mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/event-attendees/import"
          aria-label="Run event attendee import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run import probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/event-attendees/import?scenario=empty"
          aria-label="Run empty event attendee import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/event-attendees/import?scenario=pending"
          aria-label="Run pending event attendee import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/event-attendees/import?scenario=failure"
          aria-label="Run controlled failure event attendee import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function EventAttendeeImportMockDemo() {
  const attendeeService = createMockEventAttendeeImportService();
  const rosterState = requireSynchronousMockResult<EventAttendeeRosterResult>(
    attendeeService.listEventAttendees({
      eventId: "demo-event-1",
    }),
  );
  const successState = requireSynchronousMockResult<EventAttendeeImportResult>(
    attendeeService.importEventAttendees({
      eventId: "demo-event-1",
    }),
  );
  const emptyState = requireSynchronousMockResult<EventAttendeeImportResult>(
    attendeeService.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "empty",
    }),
  );
  const pendingState = requireSynchronousMockResult<EventAttendeeImportResult>(
    attendeeService.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "pending",
    }),
  );
  const failureState = requireSynchronousMockResult<EventAttendeeImportResult>(
    attendeeService.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "failure",
    }),
  );
  const rosterPayload = rosterState.success ? rosterState.data : null;
  const successPayload = successState.success ? successState.data : null;

  return (
    <WorkbenchFrame className="event-attendee-import-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event attendee import mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for turning event attendees into
            source-backed potential contact drafts with relationship status
            labels before any live organizer feed or bulk import path exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <RosterImportPanel />

        <section
          className="workbench-grid"
          aria-label="Event attendee import states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_ATTENDEE_IMPORT_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Event</dt>
                    <dd>
                      {successPayload.event.name} at{" "}
                      {successPayload.event.venue}
                    </dd>
                  </div>
                  <div>
                    <dt>Potential contact drafts</dt>
                    <dd>{successPayload.contactDrafts.length} drafts staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No roster rows" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Attendees</dt>
                    <dd>No attendees are available for review.</dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>No attendee-sourced contact drafts are staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Roster review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Import status</dt>
                    <dd>
                      <code>{pendingState.data.event.importStatus}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>Draft staging waits for local roster review.</dd>
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
          eyebrow="Relationship status labels"
          title="The roster explains who needs review"
        >
          {rosterPayload && (
            <>
              <p className="type-body">
                Each attendee carries a label, rationale, source, and evidence
                ids so import review starts from event context instead of an
                anonymous contact list.
              </p>
              <RelationshipStatusChips attendees={rosterPayload.attendees} />
              <AttendeeSummary attendees={rosterPayload.attendees} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Potential contact drafts"
          title="No contact write happens in the mock"
        >
          {successPayload && (
            <>
              <DraftSummary drafts={successPayload.contactDrafts} />
              <p className="privacy-note">
                The mock sets organizer feed, external lookup, contact write,
                notification, and bulk database import flags to false.
              </p>
              <MockOnlyExecutionChecks
                drafts={successPayload.contactDrafts}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Event attendee routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover attendee import and attendee roster read
            routes. Empty and controlled failure probes document non-success
            product states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS
                      .EVENT_ATTENDEE_IMPORT_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Event attendee import API probes"
          >
            {eventAttendeeApiProbes.map((probe) => (
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
          title="Replacement notes stay with the event attendee capability"
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
                <code>ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER</code>
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
