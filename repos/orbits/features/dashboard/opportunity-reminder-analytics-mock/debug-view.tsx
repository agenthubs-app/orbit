import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  CurrentGoalMatch,
  DormantHighValueContact,
  HighPriorityOpportunity,
  OpportunityReminderAnalyticsPayload,
  OpportunityReminderAnalyticsProvenance,
  OpportunityReminderAnalyticsSourceReference,
  OpportunityReminderRecomputePayload,
  SuggestedContactReason,
} from "../opportunity-contract";
import { createMockOpportunityReminderAnalyticsService } from "../mock-opportunity-service";

export const OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG =
  "opportunity-reminder-analytics-mock";

const liveImplementationNotesPath =
  "features/dashboard/opportunity-reminder-analytics-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.opportunity-reminder-analytics-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.opportunity-reminder-analytics-workbench .workbench-shell,
.opportunity-reminder-analytics-workbench .workbench-surface,
.opportunity-reminder-analytics-workbench .workbench-grid,
.opportunity-reminder-analytics-workbench .relationship-meta,
.opportunity-reminder-analytics-workbench .chip-row,
.opportunity-reminder-analytics-workbench .opportunity-card-grid,
.opportunity-reminder-analytics-workbench .opportunity-state-matrix,
.opportunity-reminder-analytics-workbench .opportunity-boundary-grid,
.opportunity-reminder-analytics-workbench .opportunity-scenario-grid,
.opportunity-reminder-analytics-workbench .source-list {
  min-width: 0;
}

.opportunity-reminder-analytics-workbench code,
.opportunity-reminder-analytics-workbench dd,
.opportunity-reminder-analytics-workbench .orbit-chip,
.opportunity-reminder-analytics-workbench .source-list li {
  overflow-wrap: anywhere;
}

.opportunity-reminder-analytics-workbench .opportunity-card-grid,
.opportunity-reminder-analytics-workbench .opportunity-state-matrix,
.opportunity-reminder-analytics-workbench .opportunity-boundary-grid,
.opportunity-reminder-analytics-workbench .opportunity-scenario-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.opportunity-reminder-analytics-workbench .opportunity-card,
.opportunity-reminder-analytics-workbench .opportunity-state-matrix div,
.opportunity-reminder-analytics-workbench .opportunity-boundary-grid div,
.opportunity-reminder-analytics-workbench .opportunity-scenario-control {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.opportunity-reminder-analytics-workbench .opportunity-card {
  border-left: 3px solid var(--orbit-color-evidence);
}

.opportunity-reminder-analytics-workbench .opportunity-card strong {
  display: block;
  font-size: 1.85rem;
  line-height: 1;
}

.opportunity-reminder-analytics-workbench .opportunity-scenario-control {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.opportunity-reminder-analytics-workbench .opportunity-scenario-control form {
  margin: 0;
}

.opportunity-reminder-analytics-workbench .opportunity-scenario-action {
  align-items: center;
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-size: 0.86rem;
  font-weight: 700;
  justify-content: center;
  line-height: 1.35;
  min-height: 40px;
  padding: 8px 10px;
  text-align: center;
  text-decoration: none;
  width: 100%;
}

.opportunity-reminder-analytics-workbench .opportunity-scenario-action:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary-strong);
}

.opportunity-reminder-analytics-workbench .source-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.opportunity-reminder-analytics-workbench .source-list li {
  color: var(--orbit-color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.opportunity-reminder-analytics-workbench .source-list .source-label {
  color: var(--orbit-color-text);
  display: block;
  font-weight: 700;
}
`;

const opportunityApiProbes = [
  {
    label: "Opportunity reminders",
    command: "GET /api/dashboard/opportunities",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with high-priority opportunities, dormant high-value contacts, current-goal matching, and suggested contact reasons.",
  },
  {
    label: "Opportunity recompute",
    command: "POST /api/dashboard/opportunities/recompute",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic rule-based recompute output.",
  },
  {
    label: "Empty reminders",
    command: "GET /api/dashboard/opportunities?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no evidence-backed contacts or goals are available.",
  },
  {
    label: "Pending recompute",
    command: "POST /api/dashboard/opportunities/recompute?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local fixture refresh is unresolved.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/dashboard/opportunities/recompute?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/dashboard/opportunity-reminder-analytics-mock/.",
  "ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER switches mock fixtures to live providers.",
  "Live providers replace deterministic fixtures with approved goal, relationship, signal, and analytics reads.",
  "Privacy and provenance stay attached to every opportunity, dormant contact, goal match, and suggested reason.",
  "replacement tests cover success, empty, pending, controlled failure, and mock provider guards.",
] as const;

const scenarioExerciseControls = [
  {
    actionLabel: "Open success reminders",
    expectedStatus: 200,
    method: "GET",
    path: "/api/dashboard/opportunities",
    state: "success",
    type: "link",
  },
  {
    actionLabel: "Open empty reminders",
    expectedStatus: 200,
    method: "GET",
    path: "/api/dashboard/opportunities?scenario=empty",
    state: "empty",
    type: "link",
  },
  {
    actionLabel: "Run recompute",
    expectedStatus: 200,
    method: "POST",
    path: "/api/dashboard/opportunities/recompute",
    state: "success",
    type: "form",
  },
  {
    actionLabel: "Run pending recompute",
    expectedStatus: 200,
    method: "POST",
    path: "/api/dashboard/opportunities/recompute?scenario=pending",
    state: "pending",
    type: "form",
  },
  {
    actionLabel: "Run failure recompute",
    expectedStatus: 503,
    method: "POST",
    path: "/api/dashboard/opportunities/recompute?scenario=failure",
    state: "failure",
    type: "form",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div
      className="chip-row"
      aria-label="Opportunity reminder analytics evidence ids"
    >
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceReferences({
  sourceRefs,
}: {
  sourceRefs: readonly OpportunityReminderAnalyticsSourceReference[];
}) {
  return (
    <ul
      className="source-list"
      aria-label="Opportunity reminder analytics source references"
    >
      {sourceRefs.map((sourceRef) => (
        <li key={sourceRef.id}>
          <span className="source-label">{sourceRef.label}</span>
          source type <code>{sourceRef.type}</code>; provider record{" "}
          <code>{sourceRef.providerRecordId}</code>
        </li>
      ))}
    </ul>
  );
}

function HighPriorityOpportunityCards({
  opportunities,
}: {
  opportunities: readonly HighPriorityOpportunity[];
}) {
  return (
    <div
      aria-label="High-priority opportunities"
      className="workbench-grid opportunity-card-grid"
    >
      {opportunities.map((opportunity) => (
        <article className="opportunity-card" key={opportunity.opportunityId}>
          <span className="type-caption">
            {opportunity.priority} priority · {opportunity.dueLabel}
          </span>
          <h3 className="relationship-name">{opportunity.title}</h3>
          <strong>{opportunity.priorityScore}</strong>
          <p className="type-body">
            {opportunity.contactName}, {opportunity.organization}
          </p>
          <p className="privacy-note">{opportunity.reason}</p>
          <p className="type-body">{opportunity.suggestedAction}</p>
          <SourceReferences sourceRefs={opportunity.sourceRefs} />
          <EvidenceChips evidenceIds={opportunity.evidenceIds} />
        </article>
      ))}
    </div>
  );
}

function DormantContactList({
  contacts,
}: {
  contacts: readonly DormantHighValueContact[];
}) {
  return (
    <dl
      className="relationship-meta"
      aria-label="Dormant high-value contacts"
    >
      {contacts.map((contact) => (
        <div key={contact.contactId}>
          <dt>
            {contact.contactName} <code>{contact.valueScore}</code>
          </dt>
          <dd>
            {contact.organization}: {contact.lastTouchpointLabel}.{" "}
            {contact.suggestedAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CurrentGoalMatches({
  matches,
}: {
  matches: readonly CurrentGoalMatch[];
}) {
  return (
    <dl className="relationship-meta" aria-label="Current goal matching">
      {matches.map((match) => (
        <div key={match.goalId}>
          <dt>
            {match.label} <code>{match.coverageScore}</code>
          </dt>
          <dd>
            {match.targetOutcome} Matched opportunities{" "}
            <code>{match.matchedOpportunityIds.join(", ")}</code>.{" "}
            {match.missingContext}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SuggestedReasons({
  reasons,
}: {
  reasons: readonly SuggestedContactReason[];
}) {
  return (
    <dl className="relationship-meta" aria-label="Suggested contact reasons">
      {reasons.map((reason) => (
        <div key={reason.reasonId}>
          <dt>
            {reason.contactName} <code>{reason.reasonType}</code>
          </dt>
          <dd>{reason.reason}</dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: OpportunityReminderAnalyticsProvenance;
}) {
  return (
    <dl
      className="relationship-meta opportunity-boundary-grid"
      aria-label="Opportunity reminder analytics mock-only execution checks"
    >
      <div>
        <dt>Predictive scoring</dt>
        <dd>
          predictive scoring {String(provenance.predictiveScoringExecuted)}
        </dd>
      </div>
      <div>
        <dt>Background mining</dt>
        <dd>
          background opportunity mining{" "}
          {String(provenance.backgroundOpportunityMiningExecuted)}
        </dd>
      </div>
      <div>
        <dt>Analytics jobs</dt>
        <dd>live analytics jobs {String(provenance.liveAnalyticsJobExecuted)}</dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>external network requested {String(provenance.externalNetworkRequested)}</dd>
      </div>
      <div>
        <dt>Database reads</dt>
        <dd>database reads {String(provenance.databaseReadExecuted)}</dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>database writes {String(provenance.databaseWriteExecuted)}</dd>
      </div>
      <div>
        <dt>AI provider</dt>
        <dd>AI provider requested {String(provenance.aiProviderRequested)}</dd>
      </div>
      <div>
        <dt>Email and calendar</dt>
        <dd>
          email {String(provenance.emailProviderRequested)}; calendar{" "}
          {String(provenance.calendarProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>
          notification provider requested{" "}
          {String(provenance.notificationProviderRequested)}
        </dd>
      </div>
      <div>
        <dt>Device APIs</dt>
        <dd>device requested {String(provenance.deviceRequested)}</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  opportunities,
  recompute,
}: {
  opportunities: OpportunityReminderAnalyticsPayload;
  recompute: OpportunityReminderRecomputePayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Opportunity reminders stay deterministic"
    >
      <p className="type-body">
        Scan this first: the capability ranks opportunity reminders from local
        relationship evidence, current goals, dormancy windows, and suggested
        contact reasons. No predictive provider or background miner runs.
      </p>
      <dl
        aria-label="Opportunity reminder analytics operator checkpoint"
        className="relationship-meta opportunity-boundary-grid"
      >
        <div>
          <dt>State</dt>
          <dd>
            <code>{opportunities.state}</code>
          </dd>
        </div>
        <div>
          <dt>High-priority opportunities</dt>
          <dd>{opportunities.highPriorityOpportunities.length} reminders</dd>
        </div>
        <div>
          <dt>Dormant high-value contacts</dt>
          <dd>{opportunities.dormantHighValueContacts.length} contacts</dd>
        </div>
        <div>
          <dt>Recompute output</dt>
          <dd>{recompute.generatedOpportunityCount} opportunities generated</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={opportunities.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: OpportunityReminderAnalyticsPayload;
  failureCode: string;
  pending: OpportunityReminderRecomputePayload;
  success: OpportunityReminderAnalyticsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Opportunity reminder analytics state matrix"
        className="relationship-meta opportunity-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            Success: {success.highPriorityOpportunities.length} opportunities
            and {success.suggestedContactReasons.length} suggested reasons
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: {empty.summary}</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: {pending.nextAction}</dd>
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
        use a service-unavailable envelope.
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

function ScenarioExerciseControls() {
  return (
    <WorkbenchSurface
      eyebrow="Scenario controls"
      title="Exercise API states from this page"
    >
      <p className="type-body">
        Use these controls while checking the mock route. GET opens a JSON
        envelope; POST submits to the recompute boundary.
      </p>
      <div
        aria-label="Opportunity reminder analytics scenario exercise controls"
        className="workbench-grid opportunity-scenario-grid"
      >
        {scenarioExerciseControls.map((control) => (
          <article
            className="opportunity-scenario-control"
            key={`${control.method}:${control.path}`}
          >
            <span className="type-caption">
              {control.method} · {control.state} · {control.expectedStatus}
            </span>
            <code style={pathWrapStyle}>{control.path}</code>
            {control.type === "link" ? (
              <a className="opportunity-scenario-action" href={control.path}>
                {control.actionLabel}
              </a>
            ) : (
              <form action={control.path} method="post">
                <button className="opportunity-scenario-action" type="submit">
                  {control.actionLabel}
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
      <p className="privacy-note">
        These controls only hit the mock API envelopes documented for this
        sprint. They do not start notifications, providers, analytics jobs, or
        background mining.
      </p>
    </WorkbenchSurface>
  );
}

export function OpportunityReminderAnalyticsMockDemo() {
  const opportunityService = createMockOpportunityReminderAnalyticsService();
  const opportunitiesResult =
    opportunityService.getOpportunityReminderAnalytics();
  const recomputeResult =
    opportunityService.recomputeOpportunityReminderAnalytics();
  const emptyResult = opportunityService.getOpportunityReminderAnalytics({
    scenario: "empty",
  });
  const pendingResult =
    opportunityService.recomputeOpportunityReminderAnalytics({
      scenario: "pending",
    });
  const failureResult =
    opportunityService.recomputeOpportunityReminderAnalytics({
      scenario: "failure",
    });

  if (
    opportunitiesResult.success === false ||
    recomputeResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="opportunity-reminder-analytics-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Opportunity reminder analytics mock</h1>
            <p className="workbench-intro">
              The deterministic opportunity reminder analytics fixtures did not
              load, so this dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "OPPORTUNITY_REMINDER_ANALYTICS_MOCK_FAILED";

  return (
    <WorkbenchFrame className="opportunity-reminder-analytics-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Opportunity reminder analytics mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the opportunity reminder analytics
            boundary. The page reads the mock service for success, empty,
            pending, and failure states before predictive scoring or live
            background opportunity mining exists.
          </p>
        </header>

        <OperatorCheckpoint
          opportunities={opportunitiesResult.data}
          recompute={recomputeResult.data}
        />

        <section
          className="workbench-grid"
          aria-label="Opportunity reminder analytics capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow={OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG}
            title="High-priority opportunities"
          >
            <p className="type-body">{opportunitiesResult.data.summary}</p>
            <HighPriorityOpportunityCards
              opportunities={opportunitiesResult.data.highPriorityOpportunities}
            />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks
              provenance={opportunitiesResult.data.provenance}
            />
            <p className="privacy-note">
              Opportunity reminders stay local until the documented provider
              switch and replacement tests are added.
            </p>
          </WorkbenchSurface>
        </section>

        <section
          className="workbench-grid"
          aria-label="Opportunity reminder analytics relationship details"
        >
          <WorkbenchSurface
            eyebrow="Dormancy"
            title="Dormant high-value contacts"
          >
            <DormantContactList
              contacts={opportunitiesResult.data.dormantHighValueContacts}
            />
          </WorkbenchSurface>

          <WorkbenchSurface
            eyebrow="Goal fit"
            title="Current goal matching"
          >
            <CurrentGoalMatches
              matches={opportunitiesResult.data.currentGoalMatches}
            />
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface
          eyebrow="Contact reasons"
          title="Suggested contact reasons"
        >
          <SuggestedReasons
            reasons={opportunitiesResult.data.suggestedContactReasons}
          />
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Recompute"
          title="Rule-based recompute output"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Evaluated contacts</dt>
              <dd>{recomputeResult.data.evaluatedContacts}</dd>
            </div>
            <div>
              <dt>Changed opportunities</dt>
              <dd>
                <code>{recomputeResult.data.changedOpportunityIds.join(", ")}</code>
              </dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>{recomputeResult.data.nextAction}</dd>
            </div>
          </dl>
        </WorkbenchSurface>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={opportunitiesResult.data}
        />

        <ScenarioExerciseControls />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl
            className="relationship-meta"
            aria-label="Opportunity reminder analytics API probe details"
          >
            {opportunityApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code> returns{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes"
        >
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
                <code>ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER</code>{" "}
                remains documented before live opportunity analytics providers
                are wired.
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
