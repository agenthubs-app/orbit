/**
 * 活动价值推荐 mock 的开发者面板。
 *
 * 面板展示本地评分后的活动推荐和 accept 结果，不创建真实日历或通知。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  EventValueRecommendation,
  EventValueRecommendationServiceResult,
  EventValueRecommendationSignal,
  EventValueRecommendationsPayload,
} from "../event-value-contract";
import { createMockEventValueRecommendationService } from "../mock-event-value-service";

export const EVENT_VALUE_RECOMMENDATION_MOCK_SLUG =
  "event-value-recommendation-mock";

const liveImplementationNotesPath =
  "features/recommendations/event-value-recommendation-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.event-value-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-value-workbench .workbench-shell,
.event-value-workbench .workbench-surface,
.event-value-workbench .workbench-grid,
.event-value-workbench .relationship-meta,
.event-value-workbench .chip-row,
.event-value-workbench .event-value-state-matrix {
  min-width: 0;
}

.event-value-workbench code,
.event-value-workbench dd,
.event-value-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.event-value-workbench .event-value-checkpoint-grid,
.event-value-workbench .event-value-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 176px), 1fr));
}

.event-value-workbench .event-value-checkpoint-grid div,
.event-value-workbench .event-value-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

export const EVENT_VALUE_RECOMMENDATION_API_PROBES = [
  {
    label: "Recommended events",
    method: "GET",
    path: "/api/recommendations/events",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic event value recommendations.",
  },
  {
    label: "Accept top event",
    method: "POST",
    path: "/api/recommendations/events/demo-event-1/accept",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a local mock accept action.",
  },
  {
    label: "Empty recommendations",
    method: "GET",
    path: "/api/recommendations/events?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when local profile filters match no event fixtures.",
  },
  {
    label: "Pending recommendations",
    method: "GET",
    path: "/api/recommendations/events?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while local calendar-fit review remains unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/recommendations/events?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_VALUE_RECOMMENDATION_MOCK_FAILED context.",
  },
  {
    label: "Missing event",
    method: "POST",
    path: "/api/recommendations/events/missing-event/accept",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND context.",
  },
] as const;

function apiProbeCommand(
  probe: (typeof EVENT_VALUE_RECOMMENDATION_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/recommendations/event-value-recommendation-mock/.",
  "ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires a calendar availability provider and event discovery feed provider.",
  "Every live event value recommendation keeps profile evidence, source provenance, and privacy limits.",
  "Replacement tests cover success, empty, pending, controlled failure, missing event, and accept-action paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event value recommendation evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function RankedEventValues({
  recommendations,
}: {
  recommendations: readonly EventValueRecommendation[];
}) {
  return (
    <dl className="relationship-meta">
      {recommendations.map((recommendation) => (
        <div key={recommendation.eventId}>
          <dt>
            {recommendation.title} <code>{recommendation.eventId}</code>
          </dt>
          <dd>
            Score {recommendation.valueScore}.{" "}
            {recommendation.attendeeDensity} relevant attendees in{" "}
            {recommendation.location}. {recommendation.recommendedAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SignalList({
  signals,
}: {
  signals: readonly EventValueRecommendationSignal[];
}) {
  return (
    <dl className="relationship-meta">
      {signals.map((signal) => (
        <div key={signal.signalId}>
          <dt>{signal.label}</dt>
          <dd>
            {signal.detail} Weight {signal.weight}.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: EventValueRecommendationsPayload;
}) {
  return (
    <dl
      aria-label="Mock-only event value execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>calendar sync</dt>
        <dd>
          <code>{String(payload.provenance.calendarAvailabilitySynced)}</code>
        </dd>
      </div>
      <div>
        <dt>event discovery feed</dt>
        <dd>
          <code>
            {String(payload.provenance.liveEventDiscoveryFeedRequested)}
          </code>
        </dd>
      </div>
      <div>
        <dt>database query</dt>
        <dd>
          <code>{String(payload.provenance.databaseQueryExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>model call</dt>
        <dd>
          <code>{String(payload.provenance.aiProviderRequested)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: EventValueRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: event value recommendations are ranked from profile
        goal, location, industry preference, attendee density, and calendar fit
        using only local fixtures.
      </p>
      <dl
        aria-label="Event value recommendation operator checkpoint"
        className="relationship-meta event-value-checkpoint-grid"
      >
        <div>
          <dt>Profile goal</dt>
          <dd>{payload.profile.goal}</dd>
        </div>
        <div>
          <dt>Top event</dt>
          <dd>
            {topRecommendation.title} <code>{topRecommendation.eventId}</code>
          </dd>
        </div>
        <div>
          <dt>buyer urgency</dt>
          <dd>{topRecommendation.signals[0].label}</dd>
        </div>
        <div>
          <dt>Calendar boundary</dt>
          <dd>calendar sync false</dd>
        </div>
        <div>
          <dt>Discovery boundary</dt>
          <dd>event discovery feed false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={topRecommendation.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: EventValueRecommendationsPayload;
  failureCode: string;
  pending: EventValueRecommendationsPayload;
  success: EventValueRecommendationsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Event value recommendation state matrix"
        className="relationship-meta event-value-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.recommendations.length} event recommendations</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: no matching events</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: calendar fit review</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Failure: controlled error <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay successful envelopes; controlled failures
        are explicit service-unavailable envelopes.
      </p>
      <EvidenceChips
        evidenceIds={[
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

function requireSyncEventValueResult<TResult>(
  result: EventValueRecommendationServiceResult<TResult>,
): TResult {
  if (result instanceof Promise) {
    throw new Error("Event value mock debug view requires a synchronous mock service.");
  }

  return result;
}

export function EventValueRecommendationMockDemo() {
  const service = createMockEventValueRecommendationService();
  const successResult = requireSyncEventValueResult(
    service.listRecommendedEvents(),
  );
  const emptyResult = requireSyncEventValueResult(
    service.listRecommendedEvents({ scenario: "empty" }),
  );
  const pendingResult = requireSyncEventValueResult(
    service.listRecommendedEvents({ scenario: "pending" }),
  );
  const failureResult = requireSyncEventValueResult(
    service.listRecommendedEvents({ scenario: "failure" }),
  );
  const acceptResult = requireSyncEventValueResult(
    service.acceptRecommendedEvent({
      eventId: "demo-event-1",
    }),
  );

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="event-value-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Event value recommendation mock</h1>
            <p className="workbench-intro">
              The deterministic event value recommendation fixtures did not
              load, so the dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED";
  const acceptSummary =
    acceptResult.success === true
      ? acceptResult.data.summary
      : "Accept recommendation action is unavailable in this mock state.";
  const topRecommendation = successResult.data.recommendations[0];

  return (
    <WorkbenchFrame className="event-value-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event value recommendation mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the event value recommendation
            boundary. It ranks local event fixtures against profile intent,
            location, industry preference, attendee density, and calendar fit.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Event value recommendation capability details"
        >
          <WorkbenchSurface elevated eyebrow="Ranked event values" title="Recommended events">
            <p className="type-body">{successResult.data.summary}</p>
            <RankedEventValues recommendations={successResult.data.recommendations} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Profile fit signals" title={topRecommendation.title}>
            <SignalList signals={topRecommendation.signals} />
            <MockOnlyExecutionChecks payload={successResult.data} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Accept recommendation action" title="Local action sandbox">
            <p className="type-body">{acceptSummary}</p>
            <dl className="relationship-meta">
              <div>
                <dt>Accepted event</dt>
                <dd>
                  <code>
                    {acceptResult.success === true
                      ? acceptResult.data.acceptedEvent.eventId
                      : "not-accepted"}
                  </code>
                </dd>
              </div>
              <div>
                <dt>External action</dt>
                <dd>No network, calendar, notification, or database write.</dd>
              </div>
            </dl>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {EVENT_VALUE_RECOMMENDATION_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Replacement notes">
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch mechanism</dt>
              <dd>
                <code>ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER</code> remains
                documented before any live service is wired.
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
