/**
 * 活动参会者名单 mock 的开发者面板。
 *
 * 这里展示 roster、推荐候选和导入结果，验证活动来源如何变成参会者上下文。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS,
  type EventAttendeeRosterImportResult,
  type EventAttendeeRecommendationCandidate,
  type EventAttendeeRosterResult,
  type EventAttendeeRosterImportPayload,
  type EventAttendeeRosterPayload,
  type EventAttendeeRosterProvenance,
  type EventAttendeeRosterRecord,
} from "./contract";
import { createMockEventAttendeeRosterService } from "./mock-service";

export const EVENT_ATTENDEE_ROSTER_MOCK_SLUG =
  "attendee-roster";

const liveImplementationNotesPath =
  "features/events/attendee-roster/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.event-attendee-roster-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-attendee-roster-workbench .workbench-shell,
.event-attendee-roster-workbench .workbench-surface,
.event-attendee-roster-workbench .workbench-grid,
.event-attendee-roster-workbench .relationship-meta,
.event-attendee-roster-workbench .control-stack,
.event-attendee-roster-workbench .chip-row,
.event-attendee-roster-workbench .button-row,
.event-attendee-roster-workbench form {
  min-width: 0;
}

.event-attendee-roster-workbench input,
.event-attendee-roster-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-attendee-roster-workbench code,
.event-attendee-roster-workbench dd,
.event-attendee-roster-workbench .orbit-chip,
.event-attendee-roster-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-attendee-roster-workbench .chip-row,
.event-attendee-roster-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.event-attendee-roster-workbench .roster-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.event-attendee-roster-workbench .roster-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const eventAttendeeRosterApiProbes = [
  {
    label: "Read attendee roster",
    command: "GET /api/events/demo-event-1/attendees",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the deterministic local attendee roster.",
  },
  {
    label: "Import eligible attendees",
    command: "POST /api/events/demo-event-1/attendees/import",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with eligible recommendation candidates staged by mock rules.",
  },
  {
    label: "Empty roster import",
    command:
      "POST /api/events/demo-event-1/attendees/import?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope with no roster rows or recommendation candidates.",
  },
  {
    label: "Pending roster access",
    command:
      "POST /api/events/demo-event-1/attendees/import?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while privacy-gated roster access waits for local review.",
  },
  {
    label: "Controlled failure",
    command:
      "POST /api/events/demo-event-1/attendees/import?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_ATTENDEE_ROSTER_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/attendee-roster/.",
  "ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires organizer attendee API credentials and privacy-gated roster access permission.",
  "Every live attendee keeps source evidence, known-contact markers, recommendation provenance, and privacy limits.",
  "Replacement tests cover roster read, import, empty, pending, missing event, access denied, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event attendee roster evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function TagChips({ attendees }: { attendees: readonly EventAttendeeRosterRecord[] }) {
  const tags = attendees.flatMap((attendee) => attendee.attendeeTags);

  return (
    <div className="chip-row" aria-label="Attendee tags">
      {tags.map((tag) => (
        <Chip key={`${tag.code}-${tag.label}`} tone="confirmation">
          {tag.label}
        </Chip>
      ))}
    </div>
  );
}

function AttendeeSummary({
  attendees,
}: {
  attendees: readonly EventAttendeeRosterRecord[];
}) {
  return (
    <dl className="relationship-meta">
      {attendees.map((attendee) => (
        <div key={attendee.attendeeId}>
          <dt>{attendee.displayName}</dt>
          <dd>
            {attendee.role} at {attendee.organization}.{" "}
            {attendee.knownContactMarker.isKnownContact
              ? `Known contact ${attendee.knownContactMarker.contactId}.`
              : "No known contact marker."}{" "}
            {attendee.suggestedNextAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecommendationPool({
  candidates,
}: {
  candidates: readonly EventAttendeeRecommendationCandidate[];
}) {
  return (
    <dl className="relationship-meta">
      {candidates.map((candidate) => (
        <div key={candidate.recommendationCandidateId}>
          <dt>{candidate.displayName}</dt>
          <dd>
            <code>{candidate.recommendationCandidateId}</code> from{" "}
            {candidate.organization}. {candidate.reasons.join(" ")}
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
  payload: EventAttendeeRosterImportPayload;
  provenance: EventAttendeeRosterProvenance;
}) {
  const organizerBlocked =
    provenance.organizerFeedRequested === false &&
    payload.importBatch.organizerFeedRequested === false &&
    payload.attendees.every((attendee) => attendee.organizerFeedRequested === false);
  const databaseWritesBlocked =
    provenance.liveDatabaseWriteExecuted === false &&
    payload.importBatch.liveDatabaseWriteExecuted === false &&
    payload.attendees.every((attendee) => attendee.databaseWriteExecuted === false);
  const aiBlocked =
    provenance.aiProviderRequested === false &&
    payload.importBatch.aiProviderRequested === false &&
    payload.attendees.every((attendee) => attendee.aiProviderRequested === false);
  const notificationsBlocked =
    provenance.notificationDelivered === false &&
    payload.importBatch.notificationDelivered === false &&
    payload.attendees.every((attendee) => attendee.notificationDelivered === false);

  return (
    <dl
      aria-label="Mock-only event attendee roster execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Organizer feed</dt>
        <dd>
          <code>{organizerBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Live database writes</dt>
        <dd>
          <code>{databaseWritesBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Model calls</dt>
        <dd>
          <code>{aiBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          <code>{notificationsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  roster,
  imported,
}: {
  roster: EventAttendeeRosterPayload;
  imported: EventAttendeeRosterImportPayload;
}) {
  const knownContacts = roster.knownContactMarkers.filter(
    (marker) => marker.isKnownContact,
  ).length;
  const uniqueTags = Array.from(
    new Set(roster.attendeeTags.map((tag) => tag.label)),
  ).join(", ");

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the roster exposes attendee tags, known-contact
        markers, and an eligible recommendation pool while mock execution flags
        keep external work false.
      </p>
      <dl
        aria-label="Event attendee roster operator checkpoint"
        className="relationship-meta roster-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {roster.event.name} <code>{roster.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Attendee tags</dt>
          <dd>{uniqueTags}</dd>
        </div>
        <div>
          <dt>Known contacts</dt>
          <dd>{knownContacts} roster row has a known-contact marker.</dd>
        </div>
        <div>
          <dt>Eligible recommendation pool</dt>
          <dd>
            {roster.eligibleRecommendationPool.length} candidates staged in{" "}
            <code>{imported.importBatch.id}</code>.
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            organizer feed {String(imported.importBatch.organizerFeedRequested)};
            database writes{" "}
            {String(imported.importBatch.liveDatabaseWriteExecuted)}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function RosterFilterPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Privacy-approved fixture"
      title="Filter the local roster"
    >
      <p className="type-body">
        This form posts to the route handler that uses the event attendee
        roster mock service. It filters local rows and stages eligible
        recommendation candidates without touching organizer systems.
      </p>
      <form
        action="/api/events/demo-event-1/attendees/import"
        aria-label="Mock event attendee roster import form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field label="Attendee tag" helper="Local rules can filter by tag.">
          <select name="tagFilter" defaultValue="">
            <option value="">All attendee tags</option>
            <option value="climate_operator">Climate operator</option>
            <option value="known_contact">Known contact</option>
            <option value="storage_pilot">Storage pilot</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Stage recommendation pool
        </button>
      </form>
      <div className="chip-row" aria-label="Event attendee roster guardrails">
        <Chip tone="evidence">fixture roster</Chip>
        <Chip tone="privacy">privacy-gated access</Chip>
        <Chip tone="confirmation">review before action</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Event attendee roster API probe actions"
    >
      <p className="type-body">
        These probes exercise roster read, import, empty, pending, and
        controlled failure paths inside the event attendee roster mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/events/demo-event-1/attendees"
          aria-label="Run event attendee roster API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run roster probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/attendees/import"
          aria-label="Run event attendee roster import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run import probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/attendees/import?scenario=empty"
          aria-label="Run empty event attendee roster API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/attendees/import?scenario=pending"
          aria-label="Run pending event attendee roster API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/attendees/import?scenario=failure"
          aria-label="Run controlled failure event attendee roster API probe"
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

export function EventAttendeeRosterMockDemo() {
  const rosterService = createMockEventAttendeeRosterService();
  const rosterState = rosterService.getAttendeeRoster({
    eventId: "demo-event-1",
  }) as EventAttendeeRosterResult;
  const importState = rosterService.importAttendeeRoster({
    eventId: "demo-event-1",
  }) as EventAttendeeRosterImportResult;
  const emptyState = rosterService.importAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "empty",
  }) as EventAttendeeRosterImportResult;
  const pendingState = rosterService.importAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "pending",
  }) as EventAttendeeRosterImportResult;
  const failureState = rosterService.importAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "failure",
  }) as EventAttendeeRosterImportResult;
  const rosterPayload = rosterState.success ? rosterState.data : null;
  const importPayload = importState.success ? importState.data : null;

  return (
    <WorkbenchFrame className="event-attendee-roster-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event attendee roster mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for reading privacy-approved event attendee
            rosters, tagging attendees, marking known contacts, and staging
            eligible recommendation candidates before live organizer access
            exists.
          </p>
        </header>

        {rosterPayload && importPayload && (
          <OperatorCheckpoint roster={rosterPayload} imported={importPayload} />
        )}

        <RosterFilterPanel />

        <section
          className="workbench-grid"
          aria-label="Event attendee roster states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_ATTENDEE_ROSTER_MOCK_SLUG}
            title="Success state"
          >
            {rosterPayload && (
              <>
                <p className="type-body">{rosterPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Attendees</dt>
                    <dd>{rosterPayload.attendees.length} roster rows.</dd>
                  </div>
                  <div>
                    <dt>Eligible recommendation pool</dt>
                    <dd>
                      {rosterPayload.eligibleRecommendationPool.length} mock
                      candidates.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={rosterPayload.provenance.evidenceIds}
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
                    <dt>Recommendations</dt>
                    <dd>No recommendation candidates are staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Access review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Roster access</dt>
                    <dd>
                      <code>{pendingState.data.event.rosterAccessStatus}</code>
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
          eyebrow="Attendee tags"
          title="Tags explain why each row matters"
        >
          {rosterPayload && (
            <>
              <p className="type-body">
                Tags come from deterministic roster rules so product pages can
                later show context before suggesting a follow-up action.
              </p>
              <TagChips attendees={rosterPayload.attendees} />
              <AttendeeSummary attendees={rosterPayload.attendees} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Eligible recommendation pool"
          title="Known contacts stay out of duplicate recommendations"
        >
          {importPayload && (
            <>
              <RecommendationPool
                candidates={importPayload.eligibleRecommendationPool}
              />
              <p className="privacy-note">
                The mock sets organizer feed, privacy roster access, database,
                model, calendar, email, and notification execution flags to
                false.
              </p>
              <MockOnlyExecutionChecks
                payload={importPayload}
                provenance={importPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Event attendee roster routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover attendee roster read and roster import
            routes. Empty and controlled failure probes document non-success
            states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS
                      .EVENT_ATTENDEE_ROSTER_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Event attendee roster API probes"
          >
            {eventAttendeeRosterApiProbes.map((probe) => (
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
          title="Replacement notes stay with the event roster capability"
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
                <code>ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER</code>
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
