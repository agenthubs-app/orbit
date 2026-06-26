import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { failure, success } from "../../../shared/api/envelope";
import {
  RELATIONSHIP_VALUE_ERROR_DEFINITIONS,
  type RelationshipValueAssessment,
  type RelationshipValuePayload,
  type RelationshipValueProvenance,
  type RelationshipValueResult,
  type RelationshipValueSourceEvidence,
} from "../value-contract";
import {
  createMockRelationshipValueScoringService,
  relationshipValueFailureContext,
  relationshipValueFailureToAppError,
} from "../mock-value-service";

export const RELATIONSHIP_VALUE_SCORING_MOCK_SLUG =
  "relationship-value-scoring-mock";

const liveImplementationNotesPath =
  "features/analysis/relationship-value-scoring-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.relationship-value-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.relationship-value-workbench .workbench-shell,
.relationship-value-workbench .workbench-surface,
.relationship-value-workbench .workbench-grid,
.relationship-value-workbench .relationship-meta,
.relationship-value-workbench .control-stack,
.relationship-value-workbench .chip-row,
.relationship-value-workbench .button-row,
.relationship-value-workbench form {
  min-width: 0;
}

.relationship-value-workbench input,
.relationship-value-workbench select,
.relationship-value-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.relationship-value-workbench code,
.relationship-value-workbench dd,
.relationship-value-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.relationship-value-workbench .value-score {
  align-items: center;
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  display: grid;
  gap: var(--orbit-space-xs);
  justify-items: start;
  padding: var(--orbit-space-md);
}

.relationship-value-workbench .value-score strong {
  font-size: clamp(2.25rem, 5vw, 4rem);
  line-height: 1;
}

.relationship-value-workbench .value-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.relationship-value-workbench .relationship-value-evidence {
  display: grid;
  gap: var(--orbit-space-sm);
}

.relationship-value-workbench .relationship-value-evidence article {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: var(--orbit-space-xs);
  padding-left: var(--orbit-space-sm);
}

.relationship-value-workbench .response-preview-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}

.relationship-value-workbench .response-preview-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 0;
  padding: var(--orbit-space-md);
}

.relationship-value-workbench .response-preview-card pre {
  background: var(--orbit-color-ink);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-canvas);
  font: inherit;
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: var(--orbit-space-sm);
  white-space: pre-wrap;
}
`;

const relationshipValueApiProbes = [
  {
    label: "Read score",
    command: "GET /api/analysis/relationship-value/demo-connection-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with relationship value type, priority score, rationale, suggested next action, and provenance.",
  },
  {
    label: "Recompute score",
    command: "POST /api/analysis/relationship-value/recompute",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic recompute output and no model call.",
  },
  {
    label: "Empty score",
    command:
      "GET /api/analysis/relationship-value/demo-connection-1?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no assessment selected.",
  },
  {
    label: "Pending score",
    command:
      "GET /api/analysis/relationship-value/demo-connection-1?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while fixture review withholds the score.",
  },
  {
    label: "Controlled failure",
    command:
      "GET /api/analysis/relationship-value/demo-connection-1?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live files live under features/analysis/relationship-value-scoring-mock/.",
  "ORBIT_RELATIONSHIP_VALUE_PROVIDER switches from mock to live.",
  "Live scoring keeps relationship value type, priority score, rationale, and suggested next action in the same contract.",
  "Replacement tests cover read, recompute, empty, pending, invalid recompute bodies, not-found, and provider-failure paths.",
] as const;

function formatPreviewObject(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Relationship value evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function EvidenceList({
  evidence,
}: {
  evidence: readonly RelationshipValueSourceEvidence[];
}) {
  return (
    <div
      aria-label="Relationship value rationale evidence"
      className="relationship-value-evidence"
    >
      {evidence.map((item) => (
        <article key={item.evidenceId}>
          <p className="type-caption">{item.contribution}</p>
          <h3 className="relationship-name">{item.label}</h3>
          <p className="type-body">Evidence: {item.evidenceId}</p>
        </article>
      ))}
    </div>
  );
}

function AssessmentSummary({
  assessment,
}: {
  assessment: RelationshipValueAssessment;
}) {
  return (
    <div className="workbench-grid value-grid">
      <div className="value-score">
        <span className="type-caption">Priority score</span>
        <strong>{assessment.priorityScore.value}</strong>
        <Chip tone="confirmation">{assessment.priorityScore.band}</Chip>
      </div>
      <dl className="relationship-meta">
        <div>
          <dt>Relationship</dt>
          <dd>{assessment.contactDisplayName}</dd>
        </div>
        <div>
          <dt>Relationship value type</dt>
          <dd>
            <code>{assessment.relationshipValueType}</code>
          </dd>
        </div>
        <div>
          <dt>Rationale</dt>
          <dd>{assessment.rationale.summary}</dd>
        </div>
        <div>
          <dt>Suggested next action</dt>
          <dd>{assessment.suggestedNextAction.label}</dd>
        </div>
      </dl>
    </div>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: RelationshipValuePayload;
}) {
  const assessment = payload.assessment;
  const databaseReads =
    payload.provenance.databaseReadExecuted === false ? "false" : "true";
  const databaseWrites =
    payload.provenance.databaseWriteExecuted === false ? "false" : "true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Value scoring stays explainable"
    >
      <p className="type-body">
        Scan this first: the score keeps value type, rationale, evidence ids,
        and next action together while database reads {databaseReads}; database
        writes {databaseWrites}.
      </p>
      <dl
        aria-label="Relationship value operator checkpoint"
        className="relationship-meta"
      >
        <div>
          <dt>Relationship value type</dt>
          <dd>{assessment?.relationshipValueType ?? "No assessment"}</dd>
        </div>
        <div>
          <dt>Priority score</dt>
          <dd>{assessment?.priorityScore.value ?? "No score"}</dd>
        </div>
        <div>
          <dt>Rationale</dt>
          <dd>{assessment?.rationale.summary ?? payload.summary}</dd>
        </div>
        <div>
          <dt>Suggested next action</dt>
          <dd>{assessment?.suggestedNextAction.label ?? payload.nextAction}</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            database reads {databaseReads}; database writes {databaseWrites}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function RecomputePanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Deterministic recompute"
      title="Preview rule-based priority updates"
    >
      <p className="type-body">
        This form posts to the mock recompute route and never leaves the local
        relationship value boundary.
      </p>
      <form
        action="/api/analysis/relationship-value/recompute"
        aria-label="Mock relationship value recompute form"
        className="control-stack"
        method="post"
      >
        <Field label="Connection id" helper="Use the deterministic demo id.">
          <input name="connectionId" defaultValue="demo-connection-1" />
        </Field>
        <Field
          label="Evidence ids"
          helper="JSON requests can select evidence; empty probe posts use the demo connection."
        >
          <textarea
            name="evidenceIds"
            defaultValue="evidence:connection-storage-pilot, evidence:connection-follow-up"
            rows={3}
          />
        </Field>
        <button className="primary-action" type="submit">
          Preview recompute
        </button>
      </form>
      <div className="chip-row" aria-label="Relationship value guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="privacy">no live scoring</Chip>
        <Chip tone="confirmation">explainable next action</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function RecomputeResponsePreviews({
  controlledFailure,
  successfulRecompute,
}: {
  controlledFailure: RelationshipValueResult;
  successfulRecompute: RelationshipValueResult;
}) {
  const successEnvelope =
    successfulRecompute.success === true
      ? success(successfulRecompute.data)
      : null;
  const failureEnvelope =
    controlledFailure.success === false
      ? failure(
          relationshipValueFailureToAppError(controlledFailure),
          relationshipValueFailureContext(controlledFailure, "mock"),
        )
      : null;

  return (
    <div
      aria-label="Deterministic relationship value recompute previews"
      className="response-preview-grid"
    >
      <article className="response-preview-card">
        <p className="type-caption">Recompute success envelope</p>
        <dl className="relationship-meta">
          <div>
            <dt>Status</dt>
            <dd>status 200</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>
              {successfulRecompute.success === true
                ? successfulRecompute.data.assessment?.priorityScore.value
                : "No score"}
            </dd>
          </div>
        </dl>
        {successEnvelope && (
          <details>
            <summary>View success response object</summary>
            <pre>{formatPreviewObject(successEnvelope)}</pre>
          </details>
        )}
      </article>

      <article className="response-preview-card">
        <p className="type-caption">Recompute controlled failure envelope</p>
        <dl className="relationship-meta">
          <div>
            <dt>Status</dt>
            <dd>status 409</dd>
          </div>
          <div>
            <dt>Failure code</dt>
            <dd>
              {controlledFailure.success === false
                ? controlledFailure.error.code
                : "No failure returned"}
            </dd>
          </div>
        </dl>
        {failureEnvelope && (
          <details>
            <summary>View failure response object</summary>
            <pre>{formatPreviewObject(failureEnvelope)}</pre>
          </details>
        )}
      </article>
    </div>
  );
}

function ApiProbeActions() {
  return (
    <div className="control-stack" aria-label="Relationship value API probes">
      <p className="type-body">
        These probes exercise read, recompute success, empty, pending, invalid
        recompute bodies, not-found, and controlled failure paths inside the
        mock boundary. Bare POST defaults to deterministic recompute output;
        malformed JSON remains the validation probe.
      </p>
      <div className="button-row">
        <form
          action="/api/analysis/relationship-value/demo-connection-1"
          aria-label="Run relationship value read probe"
        >
          <button className="secondary-action" type="submit">
            Run read probe
          </button>
        </form>
        <form
          action="/api/analysis/relationship-value/recompute"
          aria-label="Run relationship value recompute success probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run recompute success probe
          </button>
        </form>
        <form
          action="/api/analysis/relationship-value/demo-connection-1"
          aria-label="Run relationship value empty probe"
        >
          <input name="scenario" type="hidden" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/analysis/relationship-value/demo-connection-1?scenario=failure"
          aria-label="Run relationship value controlled failure probe"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: RelationshipValueProvenance;
}) {
  return (
    <dl className="relationship-meta" aria-label="Mock-only scoring checks">
      <div>
        <dt>Database reads</dt>
        <dd>
          <code>{String(provenance.databaseReadExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>
          <code>{String(provenance.databaseWriteExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>
          <code>{String(provenance.externalNetworkRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>AI execution</dt>
        <dd>
          <code>{String(provenance.aiProviderRequested)}</code>
        </dd>
      </div>
    </dl>
  );
}

export function RelationshipValueScoringMockDemo() {
  const relationshipValueService =
    createMockRelationshipValueScoringService();
  const successState = relationshipValueService.getRelationshipValue({
    connectionId: "demo-connection-1",
  });
  const recomputeState = relationshipValueService.recomputeRelationshipValue({
    connectionId: "demo-connection-1",
    evidenceIds: [
      "evidence:connection-storage-pilot",
      "evidence:connection-follow-up",
    ],
  });
  const pendingRecomputeState =
    relationshipValueService.recomputeRelationshipValue({
      connectionId: "demo-connection-1",
      scenario: "pending",
    });
  const emptyState = relationshipValueService.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "empty",
  });
  const pendingState = relationshipValueService.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "pending",
  });
  const failureState = relationshipValueService.getRelationshipValue({
    connectionId: "demo-connection-1",
    scenario: "failure",
  });
  const successPayload = successState.success ? successState.data : null;
  const successAssessment = successPayload?.assessment ?? null;
  const recomputePayload =
    recomputeState.success === true ? recomputeState.data : null;

  return (
    <WorkbenchFrame className="relationship-value-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Relationship value scoring mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for ranking why a relationship matters, which
            evidence supports the score, and what next action is sensible before
            live scoring exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <RecomputePanel />

        <section
          className="workbench-grid"
          aria-label="Relationship value scoring states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={RELATIONSHIP_VALUE_SCORING_MOCK_SLUG}
            title="Success state"
          >
            {successAssessment && (
              <>
                <p className="type-body">{successPayload?.summary}</p>
                <AssessmentSummary assessment={successAssessment} />
                <EvidenceChips evidenceIds={successAssessment.sourceEvidenceIds} />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No score selected" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Assessment</dt>
                    <dd>No relationship value score is selected.</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>
                      <code>{emptyState.data.state}</code>
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Fixture review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Score status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Assessment</dt>
                    <dd>Priority scoring waits for local fixture review.</dd>
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
          eyebrow="Relationship context"
          title="Rationale stays tied to evidence"
        >
          {successAssessment && (
            <>
              <p className="type-body">
                {successAssessment.rationale.summary}
              </p>
              <EvidenceList evidence={successAssessment.rationale.evidence} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock recompute"
          title="Rule-based scoring is deterministic"
        >
          {recomputePayload?.assessment && (
            <>
              <p className="type-body">{recomputePayload.summary}</p>
              <AssessmentSummary assessment={recomputePayload.assessment} />
              <RecomputeResponsePreviews
                controlledFailure={pendingRecomputeState}
                successfulRecompute={recomputeState}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No live work happens in the mock"
        >
          {successPayload && (
            <>
              <p className="privacy-note">
                The mock sets database reads, database writes, production audit
                log writes, external network requests, AI calls, calendar/email
                requests, and notifications to false.
              </p>
              <MockOnlyExecutionChecks provenance={successPayload.provenance} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Analysis routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover relationship value read and recompute
            routes. Empty, pending, invalid recompute bodies, not-found, and
            controlled failure probes document non-success states without
            leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    RELATIONSHIP_VALUE_ERROR_DEFINITIONS
                      .RELATIONSHIP_VALUE_SERVICE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
            <div>
              <dt>Fixture score</dt>
              <dd>
                {successAssessment?.priorityScore.value ?? 0} is exposed from
                local fixture state.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Relationship value API probe details"
          >
            {relationshipValueApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>{" "}
                  returns {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Required coverage</dt>
              <dd>
                Live service and source files, switch mechanism, required env
                vars and permissions, privacy and provenance constraints, and
                replacement tests are documented before live scoring is wired.
              </dd>
            </div>
          </dl>
          <div
            className="chip-row"
            aria-label="Relationship value live handoff excerpts"
          >
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <Chip key={excerpt} tone="privacy">
                {excerpt}
              </Chip>
            ))}
          </div>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
