/**
 * 活动推荐与 opening line mock 的开发者面板。
 *
 * 这里展示推荐参会者、匹配信号和生成开场白，帮助验证活动前破冰工作流。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_RECOMMENDATION_ERROR_DEFINITIONS,
  type EventAttendeeRecommendation,
  type EventOpeningLinePayload,
  type EventOpeningLineResult,
  type EventRecommendationMatchSignal,
  type EventRecommendationsPayload,
  type EventRecommendationsResult,
} from "../contract";
import { createMockEventRecommendationService } from "../mock-service";

export const EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG =
  "event-recommendation-and-opening-line-mock";

const liveImplementationNotesPath =
  "features/recommendations/event-recommendation-and-opening-line-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

function requireSynchronousMockResult<TResult>(
  result: TResult | Promise<TResult>,
): TResult {
  if (typeof (result as { then?: unknown }).then === "function") {
    throw new Error(
      "Mock event recommendation debug view requires synchronous mock results.",
    );
  }

  return result as TResult;
}

const responsiveWorkbenchStyles = `
.event-recommendation-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-recommendation-workbench .workbench-shell,
.event-recommendation-workbench .workbench-surface,
.event-recommendation-workbench .workbench-grid,
.event-recommendation-workbench .relationship-meta,
.event-recommendation-workbench .control-stack,
.event-recommendation-workbench .chip-row,
.event-recommendation-workbench .button-row,
.event-recommendation-workbench form {
  min-width: 0;
}

.event-recommendation-workbench input,
.event-recommendation-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-recommendation-workbench code,
.event-recommendation-workbench dd,
.event-recommendation-workbench .orbit-chip,
.event-recommendation-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-recommendation-workbench .chip-row,
.event-recommendation-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 150px), max-content)
  );
}

.event-recommendation-workbench .recommendation-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 176px), 1fr));
}

.event-recommendation-workbench .recommendation-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 168px), 1fr));
}

.event-recommendation-workbench .recommendation-checkpoint-grid div,
.event-recommendation-workbench .recommendation-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const eventRecommendationApiProbes = [
  {
    label: "Rank event attendees",
    command: "GET /api/recommendations/event/demo-event-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic ranked attendees and match signals.",
  },
  {
    label: "Compose opening line",
    command: "POST /api/recommendations/event/demo-event-1/opening-line",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a source-backed opening line for the selected attendee.",
  },
  {
    label: "Empty recommendations",
    command: "GET /api/recommendations/event/demo-event-1?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local attendees are ready for ranking.",
  },
  {
    label: "Pending recommendations",
    command: "GET /api/recommendations/event/demo-event-1?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while local attendee review is incomplete.",
  },
  {
    label: "Controlled failure",
    command:
      "POST /api/recommendations/event/demo-event-1/opening-line?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_RECOMMENDATION_MOCK_FAILED context.",
  },
  {
    label: "Missing event",
    command: "GET /api/recommendations/event/missing-event",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with EVENT_RECOMMENDATION_EVENT_NOT_FOUND context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/recommendations/event-recommendation-and-opening-line-mock/.",
  "ORBIT_EVENT_RECOMMENDATION_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires a ranking provider, opening-line generation provider, and approved event attendee evidence.",
  "Every live recommendation, match signal, and opening line keeps source evidence, privacy limits, and provenance.",
  "Replacement tests cover ranking success, opening-line composition, empty, pending, missing event, missing attendee, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event recommendation evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function RankedRecommendations({
  recommendations,
}: {
  recommendations: readonly EventAttendeeRecommendation[];
}) {
  return (
    <dl className="relationship-meta">
      {recommendations.map((recommendation) => (
        <div key={recommendation.recommendationId}>
          <dt>
            #{recommendation.rank} {recommendation.attendee.displayName}
          </dt>
          <dd>
            {recommendation.attendee.role} at{" "}
            {recommendation.attendee.organization}. Score{" "}
            {recommendation.score}. {recommendation.recommendedAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MatchSignalList({
  signals,
}: {
  signals: readonly EventRecommendationMatchSignal[];
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
  payload: EventRecommendationsPayload;
}) {
  const vectorSearch = payload.provenance.vectorSearchExecuted;
  const modelCalls = payload.provenance.aiProviderRequested;
  const rankingProvider = payload.provenance.rankingProviderRequested;
  const databaseQueries = payload.provenance.databaseQueryExecuted;

  return (
    <dl
      aria-label="Mock-only event recommendation execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Vector search</dt>
        <dd>
          <code>{String(vectorSearch)}</code>
        </dd>
      </div>
      <div>
        <dt>Model calls</dt>
        <dd>
          <code>{String(modelCalls)}</code>
        </dd>
      </div>
      <div>
        <dt>Ranking provider</dt>
        <dd>
          <code>{String(rankingProvider)}</code>
        </dd>
      </div>
      <div>
        <dt>Database queries</dt>
        <dd>
          <code>{String(databaseQueries)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  openingLinePayload,
  payload,
}: {
  openingLinePayload: EventOpeningLinePayload;
  payload: EventRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: ranked attendees, match signals, and the opening line
        come from local fixtures and deterministic rules.
      </p>
      <dl
        aria-label="Event recommendation operator checkpoint"
        className="relationship-meta recommendation-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.title} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Top attendee</dt>
          <dd>
            {topRecommendation.attendee.displayName} at{" "}
            {topRecommendation.attendee.organization}.
          </dd>
        </div>
        <div>
          <dt>Ranked attendees</dt>
          <dd>{payload.recommendations.length} local recommendations.</dd>
        </div>
        <div>
          <dt>Opening line</dt>
          <dd>{openingLinePayload.openingLine.text}</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            vector search {String(payload.provenance.vectorSearchExecuted)};
            model calls {String(payload.provenance.aiProviderRequested)}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function StateMatrix({
  emptyPayload,
  failureCode,
  pendingPayload,
  successPayload,
}: {
  emptyPayload: EventRecommendationsPayload;
  failureCode: string;
  pendingPayload: EventRecommendationsPayload;
  successPayload: EventRecommendationsPayload;
}) {
  return (
    <WorkbenchSurface elevated eyebrow="State matrix" title="Scan states first">
      <dl
        aria-label="Event recommendation state matrix"
        className="relationship-meta recommendation-state-matrix"
      >
        <div>
          <dt>Success: {successPayload.recommendations.length} ranked attendees</dt>
          <dd>{successPayload.nextAction}</dd>
        </div>
        <div>
          <dt>Empty: no attendees ready</dt>
          <dd>{emptyPayload.nextAction}</dd>
        </div>
        <div>
          <dt>Pending: recommendations paused</dt>
          <dd>{pendingPayload.nextAction}</dd>
        </div>
        <div>
          <dt>Failure: controlled error</dt>
          <dd>
            <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function OpeningLineComposer() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Opening-line composer"
      title="Compose a source-backed opener"
    >
      <p className="type-body">
        This form posts to the route handler that uses the recommendation mock
        service. It selects a ranked attendee and returns a local opening line.
      </p>
      <form
        action="/api/recommendations/event/demo-event-1/opening-line"
        aria-label="Mock event opening-line form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field
          label="Attendee"
          helper="Only ranked fixture attendees are supported."
        >
          <select name="attendeeId" defaultValue="attendee:mina-park">
            <option value="attendee:mina-park">Mina Park</option>
            <option value="attendee:leo-grant">Leo Grant</option>
            <option value="attendee:sam-rivera">Sam Rivera</option>
          </select>
        </Field>
        <Field label="Style" helper="Handled by deterministic local rules.">
          <select name="style" defaultValue="warm_context">
            <option value="warm_context">Warm context</option>
            <option value="context_question">Context question</option>
            <option value="post_event_follow_up">Post-event follow-up</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Compose mock line
        </button>
      </form>
      <div className="chip-row" aria-label="Event recommendation guardrails">
        <Chip tone="evidence">fixture evidence</Chip>
        <Chip tone="privacy">no external profile lookup</Chip>
        <Chip tone="confirmation">review before outreach</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Event recommendation API probe actions"
    >
      <p className="type-body">
        These probes exercise ranking, opening-line composition, empty,
        pending, and controlled failure paths inside the mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/recommendations/event/demo-event-1"
          aria-label="Run event recommendation API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run ranking probe
          </button>
        </form>
        <form
          action="/api/recommendations/event/demo-event-1/opening-line"
          aria-label="Run event opening-line API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run line probe
          </button>
        </form>
        <form
          action="/api/recommendations/event/demo-event-1?scenario=empty"
          aria-label="Run empty event recommendation API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/recommendations/event/demo-event-1?scenario=pending"
          aria-label="Run pending event recommendation API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/recommendations/event/demo-event-1/opening-line?scenario=failure"
          aria-label="Run controlled failure event opening-line API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run failure probe
          </button>
        </form>
        <form
          action="/api/recommendations/event/missing-event"
          aria-label="Run missing event recommendation API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run missing-event probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function EventRecommendationOpeningLineMockDemo() {
  const recommendationService = createMockEventRecommendationService();
  const successState = requireSynchronousMockResult<EventRecommendationsResult>(
    recommendationService.listEventRecommendations({
      eventId: "demo-event-1",
    }),
  );
  const openingLineState =
    requireSynchronousMockResult<EventOpeningLineResult>(
      recommendationService.composeOpeningLine({
        attendeeId: "attendee:mina-park",
        eventId: "demo-event-1",
      }),
    );
  const emptyState = requireSynchronousMockResult<EventRecommendationsResult>(
    recommendationService.listEventRecommendations({
      eventId: "demo-event-1",
      scenario: "empty",
    }),
  );
  const pendingState = requireSynchronousMockResult<EventRecommendationsResult>(
    recommendationService.listEventRecommendations({
      eventId: "demo-event-1",
      scenario: "pending",
    }),
  );
  const failureState = requireSynchronousMockResult<EventOpeningLineResult>(
    recommendationService.composeOpeningLine({
      eventId: "demo-event-1",
      scenario: "failure",
    }),
  );
  const successPayload = successState.success ? successState.data : null;
  const openingLinePayload = openingLineState.success
    ? openingLineState.data
    : null;
  const emptyPayload = emptyState.success ? emptyState.data : null;
  const pendingPayload = pendingState.success ? pendingState.data : null;
  const failureCode =
    failureState.success === false
      ? failureState.error.code
      : "EVENT_RECOMMENDATION_MOCK_FAILED";

  return (
    <WorkbenchFrame className="event-recommendation-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event recommendation and opening-line mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for ranking event attendees, explaining match
            signals, and composing source-backed opening lines before live
            ranking or generation providers exist.
          </p>
        </header>

        {successPayload && openingLinePayload && (
          <OperatorCheckpoint
            openingLinePayload={openingLinePayload}
            payload={successPayload}
          />
        )}

        {successPayload && emptyPayload && pendingPayload && (
          <StateMatrix
            emptyPayload={emptyPayload}
            failureCode={failureCode}
            pendingPayload={pendingPayload}
            successPayload={successPayload}
          />
        )}

        <OpeningLineComposer />

        <section
          className="workbench-grid"
          aria-label="Event recommendation states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Event</dt>
                    <dd>
                      {successPayload.event.title} at{" "}
                      {successPayload.event.venue}.
                    </dd>
                  </div>
                  <div>
                    <dt>Ranked recommendations</dt>
                    <dd>
                      {successPayload.recommendations.length} attendees ranked
                      by local rules.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No attendees ready" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Ranked recommendations</dt>
                    <dd>No attendee recommendations are shown.</dd>
                  </div>
                  <div>
                    <dt>Opening lines</dt>
                    <dd>No opening lines are composed in this empty state.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Local review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Recommendation state</dt>
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
          eyebrow="Ranked recommendations"
          title="Attendee order explains why to approach"
        >
          {successPayload && (
            <>
              <p className="type-body">
                Ranking is deterministic and event-grounded. Each attendee
                carries reasons, match signals, opening-line draft, and
                provenance.
              </p>
              <RankedRecommendations
                recommendations={successPayload.recommendations}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Match signals"
          title="Signals replace vector ranking in the mock"
        >
          {successPayload && (
            <>
              <MatchSignalList
                signals={successPayload.recommendations[0].matchSignals}
              />
              <p className="privacy-note">
                The mock sets vector search, ranking provider, model, database,
                email, calendar, and notification execution flags to false.
              </p>
              <MockOnlyExecutionChecks payload={successPayload} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Opening-line preview"
          title="Line stays attached to recommendation evidence"
        >
          {openingLinePayload && (
            <>
              <p className="type-body">{openingLinePayload.summary}</p>
              <dl className="relationship-meta">
                <div>
                  <dt>Attendee</dt>
                  <dd>
                    {openingLinePayload.recommendation.attendee.displayName}
                  </dd>
                </div>
                <div>
                  <dt>Opening line</dt>
                  <dd>{openingLinePayload.openingLine.text}</dd>
                </div>
                <div>
                  <dt>Generation</dt>
                  <dd>
                    <code>{openingLinePayload.openingLine.generatedBy}</code>
                  </dd>
                </div>
              </dl>
              <EvidenceChips
                evidenceIds={openingLinePayload.openingLine.evidenceIds}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Recommendation routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover attendee ranking and opening-line
            composition. Empty and controlled failure probes document
            non-success states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_RECOMMENDATION_ERROR_DEFINITIONS
                      .EVENT_RECOMMENDATION_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Event recommendation API probes"
          >
            {eventRecommendationApiProbes.map((probe) => (
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
          title="Replacement notes stay with recommendations"
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
                <code>ORBIT_EVENT_RECOMMENDATION_PROVIDER</code>
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
