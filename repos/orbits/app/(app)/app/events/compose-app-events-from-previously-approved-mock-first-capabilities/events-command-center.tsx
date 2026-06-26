/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type {
  EventListPayload,
  EventListResult,
  EventRecord,
  ImportedEventRecord,
} from "../../../../../features/events/contract";
import type {
  EventGoalReadinessPayload,
  EventGoalReadinessResult,
  EventReadinessChecklistItem,
} from "../../../../../features/events/goal-contract";
import type {
  EventAttendeeRecommendation,
  EventRecommendationsPayload,
  EventRecommendationsResult,
} from "../../../../../features/recommendations/contract";
import type {
  EventValueRecommendation,
  EventValueRecommendationAcceptanceResult,
  EventValueRecommendationsPayload,
  EventValueRecommendationsResult,
} from "../../../../../features/recommendations/event-value-contract";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  createAppEventsRouteServices,
  type AppEventsRouteServices,
} from "./events-service-factory";

const appEventsStyles = `
.app-events-route,
.app-events-route-state {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-events-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-events-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-events-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-events-route,
.app-events-route-state,
.app-events-route .workbench-surface,
.app-events-route .relationship-meta,
.app-events-route .chip-row,
.app-events-route .events-ledger,
.app-events-route .events-priority-grid,
.app-events-route .events-preparation-signals,
.app-events-route .events-card-grid,
.app-events-route .events-action-result,
.app-events-route-state .events-recovery-actions {
  min-width: 0;
}

.app-events-route .events-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-events-route .events-ledger,
.app-events-route .events-card-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-events-route .events-priority-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr);
}

.app-events-route .events-ledger div,
.app-events-route .events-card,
.app-events-route .events-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-events-route .events-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-events-route .events-card,
.app-events-route .events-action-result {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-events-route .events-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-events-route .events-preparation-signals {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-events-route .events-preparation-signals h2 {
  font-family: var(--orbit-font-display);
  font-size: 1.4rem;
  margin: 0;
}

.app-events-route .events-card h3,
.app-events-route .events-current-priority h3 {
  margin: 0;
}

.app-events-route .events-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-events-route-state .events-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-events-route .events-action-link,
.app-events-route .events-detail-link,
.app-events-route-state .events-recovery-actions a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-weight: 700;
  justify-self: start;
  line-height: 1.3;
  padding: 6px 10px;
  text-decoration: none;
}

.app-events-route .events-action-link,
.app-events-route .events-detail-link {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

@media (max-width: 760px) {
  .app-events-route .events-priority-grid {
    grid-template-columns: 1fr;
  }
}
`;

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/events",
      label: "Show sourced events",
    },
    {
      href: "/app/events?action=accept-top-event",
      label: "Preview top event action",
    },
  ],
  failure: [
    {
      href: "/app/events",
      label: "Reload events",
    },
    {
      href: "/app/events?scenario=pending",
      label: "Check readiness status",
    },
  ],
  pending: [
    {
      href: "/app/events",
      label: "Return to ready events",
    },
  ],
};

type AppEventsSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type RouteResult =
  | EventListResult
  | EventRecommendationsResult
  | EventValueRecommendationsResult
  | EventGoalReadinessResult;

interface RouteFailure {
  code: string;
  message: string;
  recovery: string;
  evidenceIds?: readonly string[];
}

export interface AppEventsCommandCenterProps {
  searchParams?: AppEventsSearchParams;
}

function readSearchParam(
  searchParams: AppEventsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppEventsSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstFailure(results: readonly RouteResult[]): RouteFailure | null {
  for (const result of results) {
    if (result.success === false) {
      return result.error;
    }
  }

  return null;
}

function anyResultState(
  results: readonly RouteResult[],
  state: "empty" | "pending",
): boolean {
  return results.some(
    (result) => result.success === true && result.data.state === state,
  );
}

function stateCopy(
  scenario: RouteScenario,
): {
  title: string;
  description: string;
  purpose: string;
  emptyState: string;
  guardrail: string;
  nextStep: string;
} {
  if (scenario === "empty") {
    return {
      description:
        "Create or import a sourced event before reviewing recommendations and readiness.",
      emptyState:
        "No event, value recommendation, attendee recommendation, or readiness record is ready.",
      guardrail:
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone from this screen.",
      nextStep:
        "Return to sourced events or add an event through the approved event workflow.",
      purpose:
        "Show event preparation only after source evidence exists.",
      title: "No event context is ready",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "Event sources, recommendation rules, and readiness checks are still being prepared.",
      emptyState:
        "Event preparation stays hidden until the current source review finishes.",
      guardrail:
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while review is pending.",
      nextStep: "Return to ready events after the source review completes.",
      purpose:
        "Keep the workspace stable while event preparation data is still loading.",
      title: "Event context is loading",
    };
  }

  return {
    description:
      "Event sources could not be loaded, so recommendations and readiness are paused.",
    emptyState:
      "The event briefing is unavailable until event sources recover.",
    guardrail:
      "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while this is unavailable.",
    nextStep: "Reload events or check readiness status before taking action.",
    purpose:
      "Show a visible recovery path when source-backed event context is unavailable.",
    title: "Events could not load",
  };
}

function RouteStateBoundary({
  failure,
  scenario,
}: {
  failure?: RouteFailure | null;
  scenario: RouteScenario;
}) {
  const copy = stateCopy(scenario);

  return (
    <div
      className="app-events-route-state"
      data-error-code={failure?.code}
      data-route-state-url={`/app/events?scenario=${scenario}`}
    >
      <style>{appEventsStyles}</style>
      <div data-state-boundary="app-events-route-state-view">
        <WorkbenchSurface elevated eyebrow="Events" title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Event status details" className="relationship-meta">
            <div>
              <dt>What Orbit knows</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>Safety check</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{copy.nextStep}</dd>
            </div>
          </dl>
          {failure?.evidenceIds && (
            <EvidenceChips
              evidenceIds={failure.evidenceIds}
              label="Event recovery evidence"
            />
          )}
        </WorkbenchSurface>
      </div>
      <nav
        aria-label="Events recovery actions"
        className="events-recovery-actions"
      >
        {routeRecoveryActions[scenario].map((action) => (
          <a key={action.href} href={action.href}>
            {action.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function eventDetailHref(event: EventRecord): string {
  return `/app/events/${encodeURIComponent(event.id)}`;
}

function relationshipValueCopy(event: EventRecord): string {
  const context = productCopy(event.relationshipContext);

  if (/storage pilot/i.test(context)) {
    return "storage pilot relationship goals.";
  }

  return context;
}

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\blocal mock decision\b/gi, "private preview"],
  [
    /\bwithout live ranking, vector, or model calls\b/gi,
    "from the approved attendee evidence",
  ],
  [/\bwithout live feeds\b/gi, "from the approved event evidence"],
  [/\bwithout live writes\b/gi, "without changing any connected account"],
  [/\blocal event records\b/gi, "event sources"],
  [/\blocal ranking rules\b/gi, "Relationship signals"],
  [/\blocal rules\b/gi, "Relationship signals"],
  [/\blocal evidence\b/gi, "Source evidence"],
  [/\bdeterministic local suggestions\b/gi, "relationship suggestions"],
  [/\bdeterministic local rule\b/gi, "readiness check"],
  [/\blocal route\b/gi, "workspace"],
  [/\bfixtures?\b/gi, "source record"],
  [/\bmanual event source records?\b/gi, "manual notes"],
  [/\bsource records has\b/gi, "source record has"],
  [/\bwriting calendars\b/gi, "changing calendars"],
  [/\bdatabases\b/gi, "saved records"],
  [/\bdatabase\b/gi, "saved record"],
  [/\bproviders?\b/gi, "connections"],
  [/\bboundary\b/gi, "check"],
  [/\broute\b/gi, "workspace"],
  [/\bmock\b/gi, "preview"],
  [/\blive\b/gi, "connected"],
  [/\bmodel calls?\b/gi, "automated calls"],
  [/\bvector\b/gi, "search"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\blocally\b/gi, "for this event"],
];

function productCopy(value: string): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

function evidenceLabel(evidenceId: string): string {
  const words = evidenceId
    .replace(/^evidence:/, "")
    .split(/[-_:]+/)
    .filter((word) => !["fixture", "mock", "local"].includes(word))
    .map((word) => {
      if (word === "rec") {
        return "recommendation";
      }

      if (word === "evt") {
        return "event";
      }

      return word;
    });

  const label = words.join(" ");

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 6).map((evidenceId) => (
        <span key={evidenceId} data-evidence-id={evidenceId}>
          <Chip tone="evidence">{evidenceLabel(evidenceId)}</Chip>
        </span>
      ))}
    </div>
  );
}

function EventLedger({
  events,
  importedRecords,
}: {
  events: readonly EventRecord[];
  importedRecords: readonly ImportedEventRecord[];
}) {
  return (
    <dl className="events-ledger">
      <div>
        <dt>Sourced events</dt>
        <dd>
          <strong>{events.length}</strong>
          {formatCount(events.length, "event")} ready for relationship prep.
        </dd>
      </div>
      <div>
        <dt>Imported records</dt>
        <dd>
          <strong>{importedRecords.length}</strong>
          Calendar and organizer records mapped into event context.
        </dd>
      </div>
      <div>
        <dt>Primary event</dt>
        <dd>
          {events[0]?.title ?? "No sourced event"}{" "}
          <code>{events[0]?.status ?? "unavailable"}</code>
        </dd>
      </div>
    </dl>
  );
}

function CurrentEventPriority({
  attendeePayload,
  eventPayload,
  readinessPayload,
}: {
  attendeePayload: EventRecommendationsPayload;
  eventPayload: EventListPayload;
  readinessPayload: EventGoalReadinessPayload;
}) {
  const currentEvent = eventPayload.events[0];
  const topAttendee = attendeePayload.recommendations[0];

  if (!currentEvent || !topAttendee) {
    return null;
  }

  const detailActionLabel = `Open ${currentEvent.title} workspace`;

  return (
    <div data-route-priority="app-events-current-event">
      <WorkbenchSurface
        className="events-current-priority"
        elevated
        eyebrow="Current event priority"
        title={`Prepare for ${currentEvent.title}`}
      >
        <div className="events-priority-grid">
          <div className="events-card">
            <h3>{currentEvent.venue}</h3>
            <p className="type-body">
              {productCopy(currentEvent.relationshipContext)}
            </p>
            <p className="type-body">
              Meet {topAttendee.attendee.displayName} there.{" "}
              {productCopy(topAttendee.recommendedAction)}
            </p>
            <a className="events-detail-link" href={eventDetailHref(currentEvent)}>
              {detailActionLabel}
            </a>
          </div>
          <dl aria-label="Current event preparation status" className="relationship-meta">
            <div>
              <dt>Who to meet</dt>
              <dd>{topAttendee.attendee.displayName}</dd>
            </div>
            <div>
              <dt>Why it matters</dt>
              <dd>{relationshipValueCopy(currentEvent)}</dd>
            </div>
            <div>
              <dt>Readiness</dt>
              <dd>Readiness {readinessPayload.preparationState.readinessScore}</dd>
            </div>
            <div>
              <dt>Next safe action</dt>
              <dd>
                {detailActionLabel} before any calendar, message, or
                saved-record action.
              </dd>
            </div>
          </dl>
        </div>
      </WorkbenchSurface>
    </div>
  );
}

function EventCards({
  events,
  readinessPayload,
  topRecommendation,
}: {
  events: readonly EventRecord[];
  readinessPayload: EventGoalReadinessPayload;
  topRecommendation: EventAttendeeRecommendation | undefined;
}) {
  return (
    <div className="events-card-grid" aria-label="Event choices">
      {events.map((event) => (
        <article
          aria-label={`Event work for ${event.title}`}
          className="events-card"
          key={event.id}
        >
          <h3>{event.title}</h3>
          <p className="type-body">
            Venue: {event.venue}. Attendee opportunity:{" "}
            {topRecommendation?.attendee.displayName ?? "review attendee roster"}.
          </p>
          <p className="type-body">
            Readiness: {readinessPayload.preparationState.readinessScore}.
            Relationship value: {relationshipValueCopy(event)}
          </p>
          <p className="type-body">
            {productCopy(event.nextAction)} {productCopy(event.recommendedPreparation)}
          </p>
          <a className="events-detail-link" href={eventDetailHref(event)}>
            Review {event.title}
          </a>
          <EvidenceChips
            evidenceIds={event.evidence.map((item) => item.evidenceId)}
            label={`${event.title} evidence`}
          />
        </article>
      ))}
    </div>
  );
}

function AttendeeRecommendationPanel({
  payload,
}: {
  payload: EventRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface eyebrow="Recommended connection" title="Who to meet">
      <p className="type-body">{productCopy(payload.summary)}</p>
      {topRecommendation && (
        <article className="events-card">
          <h3>{topRecommendation.attendee.displayName}</h3>
          <p className="type-body">
            {topRecommendation.attendee.role} at{" "}
            {topRecommendation.attendee.organization}. Score{" "}
            {topRecommendation.score}. {topRecommendation.recommendedAction}
          </p>
          <p className="type-body">{topRecommendation.openingLine.text}</p>
          <EvidenceChips
            evidenceIds={topRecommendation.evidenceIds}
            label="Top attendee recommendation evidence"
          />
        </article>
      )}
    </WorkbenchSurface>
  );
}

function EventValuePanel({
  payload,
}: {
  payload: EventValueRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface eyebrow="Event value" title="Where to spend time">
      <p className="type-body">{productCopy(payload.summary)}</p>
      {topRecommendation && (
        <article className="events-card">
          <h3>{topRecommendation.title}</h3>
          <p className="type-body">
            Score {topRecommendation.valueScore}.{" "}
            {topRecommendation.attendeeDensity} relevant attendees in{" "}
            {topRecommendation.location}. {topRecommendation.recommendedAction}
          </p>
          <EvidenceChips
            evidenceIds={topRecommendation.evidenceIds}
            label="Top event value evidence"
          />
        </article>
      )}
    </WorkbenchSurface>
  );
}

function ReadinessChecklist({
  items,
}: {
  items: readonly EventReadinessChecklistItem[];
}) {
  return (
    <dl className="relationship-meta">
      {items.map((item) => (
        <div key={item.itemId}>
          <dt>{productCopy(item.label)}</dt>
          <dd>
            <code>{item.status}</code> by {item.owner}.{" "}
            {productCopy(item.rationale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReadinessPanel({
  payload,
}: {
  payload: EventGoalReadinessPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Readiness" title="Before arrival">
      <p className="type-body">
        Readiness {payload.preparationState.readinessScore}.{" "}
        {productCopy(payload.preparationState.nextPreparationStep)}
      </p>
      <ReadinessChecklist items={payload.readinessChecklist} />
      <EvidenceChips
        evidenceIds={payload.provenance.evidenceIds}
        label="Event readiness evidence"
      />
    </WorkbenchSurface>
  );
}

function outsideServicesContacted(
  result: EventValueRecommendationAcceptanceResult,
): boolean {
  if (result.success === false) {
    return false;
  }

  return (
    result.data.action.externalNetworkRequested ||
    result.data.action.calendarProviderRequested ||
    result.data.action.notificationDelivered ||
    result.data.action.databaseWriteExecuted ||
    result.data.action.productionAuditLogWriteExecuted
  );
}

function EventActionResult({
  result,
}: {
  result: EventValueRecommendationAcceptanceResult;
}) {
  if (result.success === false) {
    return (
      <section
        className="events-action-result"
        data-side-effects="none"
        data-task-result="events-accept-top-event-preview-failed"
      >
        <h3>Event recommendation action is unavailable</h3>
        <p className="type-body">
          The workspace kept the action private and did not contact outside services.
        </p>
      </section>
    );
  }

  const outsideContacted = outsideServicesContacted(result);

  return (
    <section
      className="events-action-result"
      data-action-evidence="events-accept-top-event-local-preview"
      data-side-effects={outsideContacted ? "unexpected" : "none"}
      data-task-result="events-accept-top-event-preview"
    >
      <h3>Event recommendation accepted: {result.data.acceptedEvent.title}</h3>
      <p className="type-body">{productCopy(result.data.summary)}</p>
      <p className="type-body">
        No calendar changes, saved records, messages, or notifications were made.
        No outside services were contacted.
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>Decision</dt>
          <dd>{result.data.action.label}</dd>
        </div>
        <div>
          <dt>Calendar</dt>
          <dd>
            Calendar changes:{" "}
            {result.data.action.calendarProviderRequested ? "review" : "none"}
          </dd>
        </div>
        <div>
          <dt>Saved records</dt>
          <dd>
            Saved records:{" "}
            {result.data.action.databaseWriteExecuted ? "review" : "none"}
          </dd>
        </div>
        <div>
          <dt>Realtime presence</dt>
          <dd>Realtime presence: none</dd>
        </div>
        <div>
          <dt>Peer notifications</dt>
          <dd>Peer notifications: none</dd>
        </div>
        <div>
          <dt>External messages</dt>
          <dd>External messages: none</dd>
        </div>
        <div>
          <dt>Messages</dt>
          <dd>
            Messages and notifications: {outsideContacted ? "review" : "none"}
          </dd>
        </div>
        <div>
          <dt>Notifications</dt>
          <dd>
            Notifications:{" "}
            {result.data.action.notificationDelivered ? "review" : "none"}
          </dd>
        </div>
        <div>
          <dt>Outside network</dt>
          <dd>
            Outside network requests:{" "}
            {result.data.action.externalNetworkRequested ? "review" : "none"}
          </dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={result.data.action.evidenceIds}
        label="Event action evidence"
      />
    </section>
  );
}

function actionResultFor(
  action: string | null,
  services: AppEventsRouteServices,
  topRecommendation: EventValueRecommendation | undefined,
): EventValueRecommendationAcceptanceResult | null {
  if (action !== "accept-top-event" || !topRecommendation) {
    return null;
  }

  return services.eventValues.acceptRecommendedEvent({
    eventId: topRecommendation.eventId,
  });
}

function SuccessView({
  actionResult,
  attendeePayload,
  eventPayload,
  readinessPayload,
  valuePayload,
}: {
  actionResult: EventValueRecommendationAcceptanceResult | null;
  attendeePayload: EventRecommendationsPayload;
  eventPayload: EventListPayload;
  readinessPayload: EventGoalReadinessPayload;
  valuePayload: EventValueRecommendationsPayload;
}) {
  const topValueEvent = valuePayload.recommendations[0];

  return (
    <div className="app-events-route" data-state-boundary="app-events-success">
      <style>{appEventsStyles}</style>
      <CurrentEventPriority
        attendeePayload={attendeePayload}
        eventPayload={eventPayload}
        readinessPayload={readinessPayload}
      />

      <WorkbenchSurface
        className="events-command"
        elevated
        eyebrow="Events"
        title="Event briefing"
      >
        <p className="type-body">
          Choose a source-backed event, see who matters there, and decide what
          to prepare next.
        </p>
        <EventLedger
          events={eventPayload.events}
          importedRecords={eventPayload.importedRecords}
        />
      </WorkbenchSurface>

      <WorkbenchSurface eyebrow="Event choices" title="Event choices">
        <p className="type-body">{productCopy(eventPayload.summary)}</p>
        <EventCards
          events={eventPayload.events}
          readinessPayload={readinessPayload}
          topRecommendation={attendeePayload.recommendations[0]}
        />
      </WorkbenchSurface>

      <section aria-label="Preparation signals" className="events-preparation-signals">
        <h2>Preparation signals</h2>
        <div className="events-card-grid">
          <AttendeeRecommendationPanel payload={attendeePayload} />
          <EventValuePanel payload={valuePayload} />
          <ReadinessPanel payload={readinessPayload} />
        </div>
      </section>

      <WorkbenchSurface eyebrow="Core action" title="Preview event decision">
        <p className="type-body">
          Preview the top event decision before anything changes calendars,
          saved records, messages, or notifications.
        </p>
        <a className="events-action-link" href="/app/events?action=accept-top-event">
          Preview top event action
        </a>
        {actionResult && <EventActionResult result={actionResult} />}
        {!actionResult && topValueEvent && (
          <p className="type-body">
            Top candidate: {topValueEvent.title} with value score{" "}
            {topValueEvent.valueScore}.
          </p>
        )}
      </WorkbenchSurface>
    </div>
  );
}

export function AppEventsCommandCenter({
  searchParams,
}: AppEventsCommandCenterProps) {
  const scenario = readRouteScenario(searchParams);
  const services = createAppEventsRouteServices();
  const eventResult = services.events.listEvents({ scenario });
  const attendeeResult = services.attendeeRecommendations.listEventRecommendations({
    limit: 3,
    scenario,
  });
  const valueResult = services.eventValues.listRecommendedEvents({
    limit: 3,
    scenario,
  });
  const readinessResult = services.readiness.getReadiness({ scenario });
  const results = [
    eventResult,
    attendeeResult,
    valueResult,
    readinessResult,
  ] as const;
  const failure = firstFailure(results);

  if (failure || scenario === "failure") {
    return <RouteStateBoundary failure={failure} scenario="failure" />;
  }

  if (scenario === "empty" || anyResultState(results, "empty")) {
    return <RouteStateBoundary scenario="empty" />;
  }

  if (scenario === "pending" || anyResultState(results, "pending")) {
    return <RouteStateBoundary scenario="pending" />;
  }

  if (
    eventResult.success === false ||
    attendeeResult.success === false ||
    valueResult.success === false ||
    readinessResult.success === false
  ) {
    return <RouteStateBoundary scenario="failure" />;
  }

  const actionResult = actionResultFor(
    readSearchParam(searchParams, "action"),
    services,
    valueResult.data.recommendations[0],
  );

  return (
    <SuccessView
      actionResult={actionResult}
      attendeePayload={attendeeResult.data}
      eventPayload={eventResult.data}
      readinessPayload={readinessResult.data}
      valuePayload={valueResult.data}
    />
  );
}
