import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EVENT_GOAL_READINESS_ERROR_DEFINITIONS,
  type EventGoalReadinessPayload,
  type EventGoalReadinessProvenance,
  type EventGoalSuggestion,
  type EventReadinessChecklistItem,
} from "../goal-contract";
import { createMockEventGoalAndReadinessService } from "../mock-goal-service";

export const EVENT_GOAL_AND_READINESS_MOCK_SLUG =
  "event-goal-and-readiness-mock";

const liveImplementationNotesPath =
  "features/events/event-goal-and-readiness-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.event-goal-readiness-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.event-goal-readiness-workbench .workbench-shell,
.event-goal-readiness-workbench .workbench-surface,
.event-goal-readiness-workbench .workbench-grid,
.event-goal-readiness-workbench .relationship-meta,
.event-goal-readiness-workbench .control-stack,
.event-goal-readiness-workbench .chip-row,
.event-goal-readiness-workbench .button-row,
.event-goal-readiness-workbench form {
  min-width: 0;
}

.event-goal-readiness-workbench input,
.event-goal-readiness-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.event-goal-readiness-workbench code,
.event-goal-readiness-workbench dd,
.event-goal-readiness-workbench .orbit-chip,
.event-goal-readiness-workbench .source-list li {
  overflow-wrap: anywhere;
}

.event-goal-readiness-workbench .chip-row,
.event-goal-readiness-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.event-goal-readiness-workbench .goal-readiness-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.event-goal-readiness-workbench .goal-readiness-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 168px), 1fr));
}

.event-goal-readiness-workbench .goal-readiness-checkpoint-grid div,
.event-goal-readiness-workbench .goal-readiness-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const eventGoalReadinessApiProbes = [
  {
    label: "Set event goal",
    command: "PUT /api/events/demo-event-1/goal",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a deterministic accepted goal and readiness state.",
  },
  {
    label: "Read readiness",
    command: "GET /api/events/demo-event-1/readiness",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with suggested goals, checklist, and preparation state.",
  },
  {
    label: "Empty readiness",
    command: "GET /api/events/demo-event-1/readiness?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local goal has been selected.",
  },
  {
    label: "Pending readiness",
    command: "GET /api/events/demo-event-1/readiness?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while local preparation review is incomplete.",
  },
  {
    label: "Controlled failure",
    command: "PUT /api/events/demo-event-1/goal?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EVENT_GOAL_READINESS_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/event-goal-and-readiness-mock/.",
  "ORBIT_EVENT_GOAL_READINESS_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires an AI goal generation provider, calendar conflict access, and event database permissions.",
  "Every live goal and readiness item keeps source evidence, privacy limits, and provenance.",
  "Replacement tests cover goal suggestions, goal setting, readiness read, empty, pending, validation, missing event, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Event goal readiness evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SuggestedGoalSummary({
  goals,
}: {
  goals: readonly EventGoalSuggestion[];
}) {
  return (
    <dl className="relationship-meta">
      {goals.map((goal) => (
        <div key={goal.goalId}>
          <dt>{goal.label}</dt>
          <dd>
            {goal.intent} {goal.rationale}
          </dd>
        </div>
      ))}
    </dl>
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
          <dt>{item.label}</dt>
          <dd>
            <code>{item.status}</code> by {item.owner}. {item.rationale}
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
  payload: EventGoalReadinessPayload;
  provenance: EventGoalReadinessProvenance;
}) {
  const modelBlocked =
    provenance.aiProviderRequested === false &&
    payload.goal?.aiProviderRequested === false &&
    payload.suggestedGoals.every((goal) => goal.aiProviderRequested === false) &&
    payload.readinessChecklist.every((item) => item.aiProviderRequested === false);
  const calendarBlocked =
    provenance.calendarProviderRequested === false &&
    payload.event.calendarProviderRequested === false &&
    payload.preparationState.calendarConflictCheck.calendarProviderRequested ===
      false &&
    payload.preparationState.calendarConflictCheck.liveCalendarRequested ===
      false;
  const databaseWritesBlocked =
    provenance.liveDatabaseWriteExecuted === false &&
    payload.goal?.liveDatabaseWriteExecuted === false &&
    payload.event.liveDatabaseWriteExecuted === false;
  const notificationsBlocked =
    provenance.notificationDelivered === false &&
    payload.preparationState.notificationDelivered === false;

  return (
    <dl
      aria-label="Mock-only event goal readiness execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Model calls</dt>
        <dd>
          <code>{modelBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Calendar provider</dt>
        <dd>
          <code>{calendarBlocked ? "false" : "unexpected true"}</code>
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

function OperatorCheckpoint({ payload }: { payload: EventGoalReadinessPayload }) {
  const pendingItems = payload.readinessChecklist.filter(
    (item) => item.status === "pending",
  ).length;
  const modelBlocked = payload.provenance.aiProviderRequested;
  const calendarBlocked = payload.provenance.calendarProviderRequested;

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: goal suggestions, selected event goal, readiness
        checklist, and pre-event preparation state all come from local rules.
      </p>
      <dl
        aria-label="Event goal readiness operator checkpoint"
        className="relationship-meta goal-readiness-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.title} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>Selected goal</dt>
          <dd>{payload.goal?.intent}</dd>
        </div>
        <div>
          <dt>Readiness score</dt>
          <dd>{payload.preparationState.readinessScore}% ready.</dd>
        </div>
        <div>
          <dt>Pending items</dt>
          <dd>{pendingItems} checklist item needs operator review.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            model calls {String(modelBlocked)}; calendar provider{" "}
            {String(calendarBlocked)}.
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
  emptyPayload: EventGoalReadinessPayload;
  failureCode: string;
  pendingPayload: EventGoalReadinessPayload;
  successPayload: EventGoalReadinessPayload;
}) {
  return (
    <WorkbenchSurface elevated eyebrow="State matrix" title="Scan states first">
      <dl
        aria-label="Event goal readiness state matrix"
        className="relationship-meta goal-readiness-state-matrix"
      >
        <div>
          <dt>
            Success: {successPayload.preparationState.readinessScore}% ready
          </dt>
          <dd>
            {successPayload.readinessChecklist.length} local checklist items.
          </dd>
        </div>
        <div>
          <dt>Empty: no goal selected</dt>
          <dd>{emptyPayload.nextAction}</dd>
        </div>
        <div>
          <dt>
            Pending: {pendingPayload.preparationState.readinessScore}% ready
          </dt>
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

function GoalSettingPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Local goal setter"
      title="Set a mock event goal"
    >
      <p className="type-body">
        This form posts to the route handler that uses the event goal and
        readiness mock service. It accepts a local goal and recomputes readiness
        without touching live calendars or model services.
      </p>
      <form
        action="/api/events/demo-event-1/goal"
        aria-label="Mock event goal form"
        className="control-stack"
        method="post"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field
          label="Event goal"
          helper="Stored only in the deterministic mock response."
        >
          <input
            name="goalText"
            type="text"
            defaultValue="Meet two climate operators who can validate storage-pilot partnerships."
          />
        </Field>
        <Field
          label="Suggested goal"
          helper="The selected suggestion chooses local evidence ids."
        >
          <select
            name="selectedSuggestionId"
            defaultValue="goal-suggestion:operator-intros"
          >
            <option value="goal-suggestion:operator-intros">
              Meet two climate operators
            </option>
            <option value="goal-suggestion:storage-pilot">
              Storage pilot validation
            </option>
            <option value="goal-suggestion:investor-context">
              Investor context mapping
            </option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Set mock goal
        </button>
      </form>
      <div className="chip-row" aria-label="Event goal readiness guardrails">
        <Chip tone="evidence">fixture evidence</Chip>
        <Chip tone="privacy">local preparation only</Chip>
        <Chip tone="confirmation">review before follow-up</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Event goal readiness API probe actions"
    >
      <p className="type-body">
        These probes exercise event goal setting, readiness read, empty,
        pending, and controlled failure paths inside the mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/events/demo-event-1/goal"
          aria-label="Run event goal API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run goal probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/readiness"
          aria-label="Run event readiness API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run readiness probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/readiness?scenario=empty"
          aria-label="Run empty event readiness API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/readiness?scenario=pending"
          aria-label="Run pending event readiness API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/goal?scenario=failure"
          aria-label="Run controlled failure event goal API probe"
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

export function EventGoalAndReadinessMockDemo() {
  const goalService = createMockEventGoalAndReadinessService();
  const readinessState = goalService.getReadiness({
    eventId: "demo-event-1",
  });
  const suggestionState = goalService.suggestGoals({
    eventId: "demo-event-1",
  });
  const goalSetState = goalService.setGoal({
    eventId: "demo-event-1",
    goalText:
      "Meet two climate operators who can validate storage-pilot partnerships.",
  });
  const emptyState = goalService.getReadiness({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pendingState = goalService.getReadiness({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failureState = goalService.setGoal({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const readinessPayload = readinessState.success ? readinessState.data : null;
  const suggestionPayload = suggestionState.success ? suggestionState.data : null;
  const goalSetPayload = goalSetState.success ? goalSetState.data : null;
  const emptyPayload = emptyState.success ? emptyState.data : null;
  const pendingPayload = pendingState.success ? pendingState.data : null;
  const failureCode =
    failureState.success === false
      ? failureState.error.code
      : "EVENT_GOAL_READINESS_MOCK_FAILED";

  return (
    <WorkbenchFrame className="event-goal-readiness-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Event goal and readiness mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for event goal setting, suggested goals,
            readiness checklist, and pre-event preparation state before live
            planning providers exist.
          </p>
        </header>

        {readinessPayload && <OperatorCheckpoint payload={readinessPayload} />}

        {readinessPayload && emptyPayload && pendingPayload && (
          <StateMatrix
            emptyPayload={emptyPayload}
            failureCode={failureCode}
            pendingPayload={pendingPayload}
            successPayload={readinessPayload}
          />
        )}

        <GoalSettingPanel />

        <section
          className="workbench-grid"
          aria-label="Event goal readiness states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EVENT_GOAL_AND_READINESS_MOCK_SLUG}
            title="Success state"
          >
            {readinessPayload && (
              <>
                <p className="type-body">{readinessPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Event</dt>
                    <dd>
                      {readinessPayload.event.title} at{" "}
                      {readinessPayload.event.venue}.
                    </dd>
                  </div>
                  <div>
                    <dt>Readiness checklist</dt>
                    <dd>
                      {readinessPayload.readinessChecklist.length} local items.
                    </dd>
                  </div>
                  <div>
                    <dt>Pre-event preparation</dt>
                    <dd>
                      {readinessPayload.preparationState.nextPreparationStep}
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={readinessPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No selected goal" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Suggested goals</dt>
                    <dd>No goal suggestions are shown in this empty state.</dd>
                  </div>
                  <div>
                    <dt>Readiness checklist</dt>
                    <dd>No checklist items are composed yet.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Preparation review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Brief status</dt>
                    <dd>
                      <code>
                        {pendingState.data.preparationState.relationshipBriefStatus}
                      </code>
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
          eyebrow="Suggested goals"
          title="Goal options explain the relationship intent"
        >
          {suggestionPayload && (
            <>
              <p className="type-body">
                Suggested goals are deterministic local rules keyed by event
                evidence and relationship focus, not generated by live services.
              </p>
              <SuggestedGoalSummary goals={suggestionPayload.suggestedGoals} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Readiness checklist"
          title="Preparation state stays source-backed"
        >
          {readinessPayload && (
            <>
              <ReadinessChecklist items={readinessPayload.readinessChecklist} />
              <p className="privacy-note">
                The mock sets model, calendar, database, email, and
                notification execution flags to false.
              </p>
              <MockOnlyExecutionChecks
                payload={readinessPayload}
                provenance={readinessPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Accepted goal preview"
          title="Goal setting recomputes readiness locally"
        >
          {goalSetPayload && (
            <>
              <p className="type-body">{goalSetPayload.summary}</p>
              <dl className="relationship-meta">
                <div>
                  <dt>Accepted goal</dt>
                  <dd>{goalSetPayload.acceptedGoalText}</dd>
                </div>
                <div>
                  <dt>Selected suggestion</dt>
                  <dd>
                    <code>{goalSetPayload.goal.selectedSuggestionId}</code>
                  </dd>
                </div>
              </dl>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Event goal routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover event goal setting and readiness reads.
            Empty and controlled failure probes document non-success states
            without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EVENT_GOAL_READINESS_ERROR_DEFINITIONS
                      .EVENT_GOAL_READINESS_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Event goal readiness API probes"
          >
            {eventGoalReadinessApiProbes.map((probe) => (
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
          title="Replacement notes stay with the event goal capability"
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
                <code>ORBIT_EVENT_GOAL_READINESS_PROVIDER</code>
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
