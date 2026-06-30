/**
 * 活动 CRUD 与导入 mock 的开发者面板。
 *
 * 面板展示活动列表、详情、手动创建和导入记录，不写真实日历或远程活动源。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS,
  type EventCrudImportProvenance,
  type EventRecord,
  type ImportedEventRecord,
  type ManualEventCreationPayload,
} from "../contract";
import { createMockEventCrudAndImportService } from "../mock-service";

export const EVENT_CRUD_AND_IMPORT_MOCK_SLUG =
  "event-crud-and-import-mock";

const liveImplementationNotesPath =
  "features/events/event-crud-and-import-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.event-crud-import-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-crud-import-workbench .workbench-shell,
.event-crud-import-workbench .workbench-surface,
.event-crud-import-workbench .workbench-grid,
.event-crud-import-workbench .relationship-meta,
.event-crud-import-workbench .control-stack,
.event-crud-import-workbench .chip-row,
.event-crud-import-workbench .button-row,
.event-crud-import-workbench form {
  min-width: 0;
}

.event-crud-import-workbench input,
.event-crud-import-workbench select,
.event-crud-import-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-crud-import-workbench code,
.event-crud-import-workbench dd,
.event-crud-import-workbench .orbit-chip,
.event-crud-import-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-crud-import-workbench .chip-row,
.event-crud-import-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.event-crud-import-workbench .event-ledger-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.event-crud-import-workbench .event-ledger-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const eventApiProbes = [
  {
    label: "List event records",
    command: "GET /api/events",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with calendar, organizer, and manual event fixtures.",
  },
  {
    label: "Create manual event",
    command: "POST /api/events",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with a deterministic manual event record.",
  },
  {
    label: "Empty manual form",
    command: "POST /api/events (empty form)",
    expectedStatus: 400,
    expectation:
      "Expect 400 validation envelope when title and source note are blank.",
  },
  {
    label: "Reload success state",
    command: "GET /api/events after non-success probe",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the original deterministic fixtures.",
  },
  {
    label: "Read event detail",
    command: "GET /api/events/demo-event-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source metadata and evidence ids.",
  },
  {
    label: "Empty event list",
    command: "GET /api/events?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no local event rows.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/events?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENTS_IMPORT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/event-crud-and-import-mock/.",
  "ORBIT_EVENT_IMPORT_PROVIDER switches from mock fixtures to live providers.",
  "Live replacement requires calendar sync credentials, organizer feed permission, and live event database access.",
  "Every live event keeps source metadata, evidence ids, privacy limits, and provenance.",
  "Replacement tests cover list, create, detail, empty, pending, validation, missing event, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event CRUD evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function EventSummary({ events }: { events: readonly EventRecord[] }) {
  return (
    <dl className="relationship-meta">
      {events.map((event) => (
        <div key={event.id}>
          <dt>{event.title}</dt>
          <dd>
            <code>{event.status}</code> from {event.sourceMetadata.label}.{" "}
            {event.relationshipContext}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ImportedRecordSummary({
  records,
}: {
  records: readonly ImportedEventRecord[];
}) {
  return (
    <dl className="relationship-meta">
      {records.map((record) => (
        <div key={record.id}>
          <dt>{record.title}</dt>
          <dd>
            <code>{record.externalRecordId}</code> mapped{" "}
            {record.fieldMapping.join(", ")} from{" "}
            {record.sourceMetadata.label}.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  events,
  provenance,
}: {
  events: readonly EventRecord[];
  provenance: EventCrudImportProvenance;
}) {
  const calendarBlocked =
    provenance.calendarSyncRequested === false &&
    events.every((event) => event.calendarProviderRequested === false);
  const organizerBlocked =
    provenance.organizerFeedRequested === false &&
    events.every((event) => event.organizerFeedRequested === false);
  const databaseWritesBlocked =
    provenance.liveDatabaseWriteExecuted === false &&
    events.every((event) => event.liveDatabaseWriteExecuted === false);
  const notificationsBlocked =
    provenance.notificationDelivered === false &&
    events.every((event) => event.notificationDelivered === false);

  return (
    <dl
      aria-label="Mock-only event execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Calendar provider</dt>
        <dd>
          <code>{calendarBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
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
        <dt>Notifications</dt>
        <dd>
          <code>{notificationsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
  manualCreation,
}: {
  payload: {
    events: readonly EventRecord[];
    importedRecords: readonly ImportedEventRecord[];
    provenance: EventCrudImportProvenance;
  };
  manualCreation: ManualEventCreationPayload;
}) {
  const calendarSync = payload.provenance.calendarSyncRequested;
  const organizerFeeds = payload.provenance.organizerFeedRequested;
  const databaseWrites = payload.provenance.liveDatabaseWriteExecuted;

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the event ledger shows manual creation, imported
        event records, source metadata, and explicit false flags for work that
        must stay outside the mock.
      </p>
      <dl
        aria-label="Event CRUD operator checkpoint"
        className="relationship-meta event-ledger-grid"
      >
        <div>
          <dt>Manual creation</dt>
          <dd>
            {manualCreation.event.title}{" "}
            <code>{manualCreation.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Imported records</dt>
          <dd>{payload.importedRecords.length} local import records.</dd>
        </div>
        <div>
          <dt>Source metadata</dt>
          <dd>
            {payload.events
              .map((event) => event.sourceMetadata.captureMethod)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            calendar sync {String(calendarSync)}; organizer feeds{" "}
            {String(organizerFeeds)}; database writes{" "}
            {String(databaseWrites)}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ManualEventCreationPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Manual event creation"
      title="Stage a local event"
    >
      <p className="type-body">
        The form posts to the route handler that uses the mock service. It
        stages a deterministic event record with an operator source note,
        without touching calendars, organizer systems, live databases, or
        notifications.
      </p>
      <form
        action="/api/events"
        aria-label="Mock manual event creation form"
        className="control-stack"
        method="post"
      >
        <Field label="Event title" helper="A title is required for manual events.">
          <input name="title" type="text" defaultValue="Founder investor salon" />
        </Field>
        <Field label="Venue" helper="Local fixture value only.">
          <input name="venue" type="text" defaultValue="Orbit relationship room" />
        </Field>
        <Field
          label="Source note"
          helper="Capture why this event belongs in Orbit before staging it."
        >
          <textarea
            name="sourceNote"
            rows={3}
            defaultValue="Operator met the host at a founder dinner and wants the context preserved."
          />
        </Field>
        <button className="primary-action" type="submit">
          Stage manual event
        </button>
      </form>
      <div className="chip-row" aria-label="Manual event creation guardrails">
        <Chip tone="evidence">source note required</Chip>
        <Chip tone="privacy">no calendar write</Chip>
        <Chip tone="confirmation">review before live sync</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div className="control-stack" aria-label="Event CRUD API probe actions">
      <p className="type-body">
        These probes exercise event list, manual creation, empty-form
        validation, detail, empty, reload, and controlled failure paths inside
        the event CRUD and import mock boundary.
      </p>
      <div className="button-row">
        <form action="/api/events" aria-label="Run event list API probe" method="get">
          <button className="secondary-action" type="submit">
            Run list probe
          </button>
        </form>
        <form
          action="/api/events"
          aria-label="Run manual event creation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run create probe
          </button>
        </form>
        <form
          action="/api/events"
          aria-label="Run empty manual event form probe"
          method="post"
        >
          <input name="title" type="hidden" value="" />
          <input name="sourceNote" type="hidden" value="" />
          <button className="secondary-action" type="submit">
            Run empty form probe
          </button>
        </form>
        <form
          action="/api/events"
          aria-label="Reload event success state after probes"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Reload success state
          </button>
        </form>
        <form
          action="/api/events?scenario=empty"
          aria-label="Run empty event list API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events?scenario=failure"
          aria-label="Run controlled failure event API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function EventCrudAndImportMockDemo() {
  const eventService = createMockEventCrudAndImportService();
  const listState = eventService.listEvents();
  const manualCreationState = eventService.createEvent();
  const emptyState = eventService.listEvents({ scenario: "empty" });
  const pendingState = eventService.listEvents({ scenario: "pending" });
  const failureState = eventService.listEvents({ scenario: "failure" });
  const listPayload = listState.success ? listState.data : null;
  const manualCreationPayload = manualCreationState.success
    ? manualCreationState.data
    : null;

  return (
    <WorkbenchFrame className="event-crud-import-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event CRUD and import mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for listing imported event records, staging
            manual events, and reading event detail before live calendar sync,
            organizer feeds, or event database writes exist.
          </p>
        </header>

        {listPayload && manualCreationPayload && (
          <OperatorCheckpoint
            payload={listPayload}
            manualCreation={manualCreationPayload}
          />
        )}

        <ManualEventCreationPanel />

        <section className="workbench-grid" aria-label="Event CRUD states">
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_CRUD_AND_IMPORT_MOCK_SLUG}
            title="Success state"
          >
            {listPayload && (
              <>
                <p className="type-body">{listPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Events</dt>
                    <dd>{listPayload.events.length} event records.</dd>
                  </div>
                  <div>
                    <dt>Imported event records</dt>
                    <dd>
                      {listPayload.importedRecords.length} imported records
                      from local fixtures.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips evidenceIds={listPayload.provenance.evidenceIds} />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No event rows" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Events</dt>
                    <dd>No events are available for review.</dd>
                  </div>
                  <div>
                    <dt>Imports</dt>
                    <dd>No calendar or organizer fixture rows are staged.</dd>
                  </div>
                </dl>
                <EvidenceChips evidenceIds={emptyState.data.provenance.evidenceIds} />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Import review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>State</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
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
          eyebrow="Imported event records"
          title="Calendar sync fixture and Organizer feed fixture"
        >
          {listPayload && (
            <>
              <p className="type-body">
                Imported rows preserve provider record ids and field mappings
                without making calendar sync or organizer feed requests.
              </p>
              <ImportedRecordSummary records={listPayload.importedRecords} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Event ledger"
          title="Source metadata stays attached"
        >
          {listPayload && (
            <>
              <EventSummary events={listPayload.events} />
              <p className="privacy-note">
                The mock sets calendar provider, organizer feed, live database,
                external network, AI, email, and notification flags to false.
              </p>
              <MockOnlyExecutionChecks
                events={listPayload.events}
                provenance={listPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Event routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover event list, manual creation, and event
            detail routes. Empty and controlled failure probes document
            non-success states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS
                      .EVENTS_IMPORT_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl className="relationship-meta" aria-label="Event CRUD API probes">
            {eventApiProbes.map((probe) => (
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
          title="Replacement notes stay with the event capability"
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
                <code>ORBIT_EVENT_IMPORT_PROVIDER</code>
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
