/**
 * 重复联系人检测与合并 mock 的开发者面板。
 *
 * 这里展示候选重复项、匹配原因、合并预览和 apply 结果；
 * mock apply 只生成本地结果，不写真实联系人图谱。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS,
  type DuplicateDetectionMatchReason,
  type DuplicateMergeApplyPayload,
  type DuplicateMergeProvenance,
  type DuplicateMergeSuggestion,
  type DuplicateMergeSuggestionsPayload,
  type ImportedContactDuplicateCandidate,
} from "../merge-contract";
import { createMockDuplicateMergeService } from "../mock-merge-service";

export const DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG =
  "duplicate-detection-and-merge-mock";

const liveImplementationNotesPath =
  "features/acquisition/duplicate-detection-and-merge-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.duplicate-merge-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.duplicate-merge-workbench .workbench-shell,
.duplicate-merge-workbench .workbench-surface,
.duplicate-merge-workbench .workbench-grid,
.duplicate-merge-workbench .relationship-meta,
.duplicate-merge-workbench .control-stack,
.duplicate-merge-workbench .chip-row,
.duplicate-merge-workbench .button-row,
.duplicate-merge-workbench form {
  min-width: 0;
}

.duplicate-merge-workbench input,
.duplicate-merge-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.duplicate-merge-workbench code,
.duplicate-merge-workbench dd,
.duplicate-merge-workbench .orbit-chip,
.duplicate-merge-workbench .source-list li {
  overflow-wrap: anywhere;
}

.duplicate-merge-workbench .chip-row,
.duplicate-merge-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.duplicate-merge-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.duplicate-merge-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const duplicateMergeApiProbes = [
  {
    label: "Read merge suggestions",
    command: "GET /api/contact-drafts/merge-suggestions",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with duplicate candidates and merge suggestions.",
  },
  {
    label: "Apply reviewed merge",
    command:
      "POST /api/contact-drafts/merge-suggestions/demo-merge-1/apply",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a confirmation preview and no live merge write.",
  },
  {
    label: "Empty duplicate set",
    command: "GET /api/contact-drafts/merge-suggestions?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no duplicate candidates.",
  },
  {
    label: "Pending review",
    command: "GET /api/contact-drafts/merge-suggestions?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while local duplicate review waits.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/contact-drafts/merge-suggestions?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with DUPLICATE_DETECTION_MERGE_MOCK_FAILED context.",
  },
  {
    label: "Pending apply",
    command:
      "POST /api/contact-drafts/merge-suggestions/demo-merge-1/apply?scenario=pending",
    expectedStatus: 409,
    expectation:
      "Expect 409 failure envelope with DUPLICATE_MERGE_PENDING_REVIEW context.",
  },
  {
    label: "Missing suggestion",
    command:
      "POST /api/contact-drafts/merge-suggestions/missing-merge/apply",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with DUPLICATE_MERGE_SUGGESTION_NOT_FOUND context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/live-merge-service.ts and features/acquisition/storage/.",
  "ORBIT_MODULE_MODE=live switches duplicate merge from mock fixtures to shared live record storage.",
  "The current live boundary reads contactDrafts, contacts, and evidence, then returns review-only merge suggestions.",
  "Explicit confirmation returns a preview; destructive merge writes remain unimplemented.",
  "Live tests cover duplicate detection, apply preview, unconfigured storage, API envelopes, privacy, and provenance paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Duplicate merge evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function MatchReasonChips({
  reasons,
}: {
  reasons: readonly DuplicateDetectionMatchReason[];
}) {
  return (
    <div className="chip-row" aria-label="Duplicate match reasons">
      {reasons.map((reason) => (
        <Chip key={reason} tone="confirmation">
          {reason}
        </Chip>
      ))}
    </div>
  );
}

function CandidateSummary({
  candidates,
}: {
  candidates: readonly ImportedContactDuplicateCandidate[];
}) {
  return (
    <dl className="relationship-meta">
      {candidates.map((candidate) => (
        <div key={candidate.candidateId}>
          <dt>{candidate.importedContactName}</dt>
          <dd>
            Imported draft <code>{candidate.importedDraftId}</code> matches{" "}
            {candidate.existingContactName} at{" "}
            {candidate.existingOrganization}. {candidate.relationshipContext}
            <MatchReasonChips reasons={candidate.matchReasons} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SuggestionSummary({
  suggestions,
}: {
  suggestions: readonly DuplicateMergeSuggestion[];
}) {
  return (
    <dl className="relationship-meta">
      {suggestions.map((suggestion) => (
        <div key={suggestion.id}>
          <dt>{suggestion.id}</dt>
          <dd>
            {suggestion.summary}{" "}
            <code>destructiveMergeExecuted</code>,{" "}
            <code>databaseWriteExecuted</code>, and{" "}
            <code>contactWriteExecuted</code> remain{" "}
            <code>{String(suggestion.destructiveMergeExecuted)}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: DuplicateMergeSuggestionsPayload;
}) {
  const noDestructiveMerge =
    payload.provenance.destructiveMergeExecuted === false &&
    payload.mergeSuggestions.every(
      (suggestion) => suggestion.destructiveMergeExecuted === false,
    );
  const noDatabaseWrites =
    payload.provenance.databaseWriteExecuted === false &&
    payload.mergeSuggestions.every(
      (suggestion) => suggestion.databaseWriteExecuted === false,
    );
  const noImportedWrites =
    payload.provenance.importedContactWriteExecuted === false &&
    payload.duplicateCandidates.every(
      (candidate) => candidate.importedContactWriteExecuted === false,
    );

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>External lookup</dt>
        <dd>
          <code>{String(payload.provenance.externalNetworkRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>Model scoring</dt>
        <dd>
          <code>{String(payload.provenance.aiProviderRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>Email calendar read</dt>
        <dd>
          <code>{String(payload.provenance.emailCalendarReadExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>Destructive merge</dt>
        <dd>
          <code>{noDestructiveMerge ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>
          <code>{noDatabaseWrites ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Imported contact writes</dt>
        <dd>
          <code>{noImportedWrites ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: DuplicateMergeSuggestionsPayload;
}) {
  const noDestructiveMerge = payload.mergeSuggestions.every(
    (suggestion) => suggestion.destructiveMergeExecuted === false,
  )
    ? "false"
    : "unexpected true";
  const noDatabaseWrites = payload.mergeSuggestions.every(
    (suggestion) => suggestion.databaseWriteExecuted === false,
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
        Scan this first: imported contacts are compared to existing Orbit
        contacts with local fixtures, explicit confirmation, and no live merge
        write.
      </p>
      <dl
        aria-label="Duplicate merge operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Duplicate candidates</dt>
          <dd>{payload.duplicateCandidates.length} imported candidates.</dd>
        </div>
        <div>
          <dt>Merge suggestions</dt>
          <dd>{payload.mergeSuggestions.length} review suggestions.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            destructive merge {noDestructiveMerge}; database writes{" "}
            {noDatabaseWrites}.
          </dd>
        </div>
        <div>
          <dt>Verifier note</dt>
          <dd>
            Browser smoke should judge API envelopes and rendered states; live
            dedupe, storage, notification, and merge execution stay outside this
            mock.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function DuplicateMergeReviewPanel() {
  return (
    <WorkbenchSurface elevated eyebrow="Imported contact review" title="Local duplicate queue">
      <p className="type-body">
        This boundary stages duplicate candidates from imported contact drafts
        and shows merge suggestions for explicit review before any live contact
        record changes.
      </p>
      <form
        action="/api/contact-drafts/merge-suggestions/demo-merge-1/apply"
        aria-label="Mock duplicate merge apply form"
        className="control-stack"
        method="post"
      >
        <Field label="Reviewer" helper="The demo route keeps this local.">
          <input name="actorLabel" defaultValue="Verifier" />
        </Field>
        <button className="primary-action" type="submit">
          Confirm merge preview
        </button>
      </form>
      <div className="chip-row" aria-label="Duplicate merge guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="privacy">no storage write</Chip>
        <Chip tone="confirmation">confirmation required</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Duplicate detection merge API probe actions"
    >
      <p className="type-body">
        These probes exercise success, empty, pending, controlled failure,
        apply, and missing-suggestion paths inside the duplicate merge mock
        boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/merge-suggestions"
          aria-label="Run duplicate merge suggestions API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run suggestions probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/merge-suggestions/demo-merge-1/apply"
          aria-label="Run duplicate merge apply API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run apply probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/merge-suggestions"
          aria-label="Run empty duplicate merge API probe"
          method="get"
        >
          <input type="hidden" name="scenario" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/merge-suggestions"
          aria-label="Run pending duplicate merge API probe"
          method="get"
        >
          <input type="hidden" name="scenario" value="pending" />
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/merge-suggestions"
          aria-label="Run controlled failure duplicate merge API probe"
          method="get"
        >
          <input type="hidden" name="scenario" value="failure" />
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/merge-suggestions/missing-merge/apply"
          aria-label="Run missing suggestion duplicate merge API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run missing suggestion probe
          </button>
        </form>
      </div>
    </div>
  );
}

function AppliedConfirmation({
  applied,
}: {
  applied: DuplicateMergeApplyPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Applied confirmation" title="Confirmed preview">
      <p className="type-body">
        {applied.confirmedBy} confirmed <code>{applied.suggestionId}</code> for
        local review. The response returns a preview and leaves all live writes
        false.
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>Merged preview</dt>
          <dd>
            {applied.mergedContactPreview.displayName} at{" "}
            {applied.mergedContactPreview.organization}
          </dd>
        </div>
        <div>
          <dt>Execution flags</dt>
          <dd>
            merge write <code>{String(applied.mergeWriteExecuted)}</code>;
            destructive merge{" "}
            <code>{String(applied.destructiveMergeExecuted)}</code>; database
            write <code>{String(applied.databaseWriteExecuted)}</code>.
          </dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={applied.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function ProvenanceSummary({
  provenance,
}: {
  provenance: DuplicateMergeProvenance;
}) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Source</dt>
        <dd>
          <code style={pathWrapStyle}>{provenance.source}</code>
        </dd>
      </div>
      <div>
        <dt>Privacy</dt>
        <dd>{provenance.privacy}</dd>
      </div>
      <div>
        <dt>Generation</dt>
        <dd>{provenance.generationMethod}</dd>
      </div>
    </dl>
  );
}

export function DuplicateDetectionAndMergeMockDemo() {
  const mergeService = createMockDuplicateMergeService();
  const successState = mergeService.listMergeSuggestions();
  const emptyState = mergeService.listMergeSuggestions({ scenario: "empty" });
  const pendingState = mergeService.listMergeSuggestions({
    scenario: "pending",
  });
  const failureState = mergeService.listMergeSuggestions({
    scenario: "failure",
  });
  const appliedState = mergeService.applyMergeSuggestion({
    suggestionId: "demo-merge-1",
    actorLabel: "Verifier",
  });
  const successPayload = successState.success ? successState.data : null;
  const appliedPayload = appliedState.success ? appliedState.data : null;

  return (
    <WorkbenchFrame className="duplicate-merge-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Duplicate detection and merge mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for detecting duplicate imported contacts,
            proposing source-backed merge suggestions, and confirming a merge
            preview before any live destructive write exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <DuplicateMergeReviewPanel />

        <section
          className="workbench-grid"
          aria-label="Duplicate detection and merge states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Duplicate candidates</dt>
                    <dd>
                      {successPayload.duplicateCandidates.length} imported
                      contacts need review.
                    </dd>
                  </div>
                  <div>
                    <dt>Merge suggestions</dt>
                    <dd>
                      {successPayload.mergeSuggestions.length} suggestions are
                      ready.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No matches" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Duplicate candidates</dt>
                    <dd>No imported contacts match existing contacts.</dd>
                  </div>
                  <div>
                    <dt>Merge suggestions</dt>
                    <dd>No merge suggestions are staged.</dd>
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
                    <dt>Review status</dt>
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

        {successPayload && (
          <WorkbenchSurface
            eyebrow="Duplicate candidates"
            title="Imported contacts stay explainable"
          >
            <p className="type-body">
              Every candidate keeps source evidence and match reasons visible so
              review starts with why Orbit thinks two records are related.
            </p>
            <CandidateSummary candidates={successPayload.duplicateCandidates} />
          </WorkbenchSurface>
        )}

        {successPayload && (
          <WorkbenchSurface
            eyebrow="Merge suggestions"
            title="No destructive write happens in the mock"
          >
            <SuggestionSummary suggestions={successPayload.mergeSuggestions} />
            <p className="privacy-note">
              The mock sets external lookup, model scoring, email/calendar
              reads, notifications, database writes, and destructive merge
              execution to false.
            </p>
            <MockOnlyExecutionChecks payload={successPayload} />
          </WorkbenchSurface>
        )}

        {appliedPayload && <AppliedConfirmation applied={appliedPayload} />}

        {successPayload && (
          <WorkbenchSurface
            eyebrow="Provenance"
            title="Fixture source is part of the contract"
          >
            <ProvenanceSummary provenance={successPayload.provenance} />
          </WorkbenchSurface>
        )}

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Duplicate merge routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover merge suggestion read and apply routes.
            Empty, pending, missing, and controlled failure probes document
            non-success states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS
                      .DUPLICATE_DETECTION_MERGE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Duplicate detection merge API probes"
          >
            {duplicateMergeApiProbes.map((probe) => (
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
          title="Replacement notes stay with duplicate merge"
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
                <code>ORBIT_DUPLICATE_MERGE_PROVIDER</code>
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
