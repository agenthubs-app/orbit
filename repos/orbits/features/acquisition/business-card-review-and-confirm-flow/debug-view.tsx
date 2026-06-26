import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS,
  type BusinessCardReviewDraft,
} from "../business-card-review-contract";
import { createMockBusinessCardReviewService } from "../mock-business-card-review-service";

export const BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG =
  "business-card-review-and-confirm-flow";

const draftId = "demo-business-card-draft";
const liveImplementationNotesPath =
  "features/acquisition/business-card-review-and-confirm-flow/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.business-card-review-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.business-card-review-workbench .workbench-shell,
.business-card-review-workbench .workbench-surface,
.business-card-review-workbench .workbench-grid,
.business-card-review-workbench .relationship-meta,
.business-card-review-workbench .review-field-form,
.business-card-review-workbench .review-field-grid,
.business-card-review-workbench .chip-row,
.business-card-review-workbench .button-row {
  min-width: 0;
}

.business-card-review-workbench code,
.business-card-review-workbench dd,
.business-card-review-workbench input,
.business-card-review-workbench .orbit-chip,
.business-card-review-workbench .source-list li {
  overflow-wrap: anywhere;
}

.business-card-review-workbench .review-field-form {
  display: grid;
  gap: var(--orbit-space-md);
}

.business-card-review-workbench .review-field-grid {
  display: grid;
  gap: var(--orbit-space-sm);
}

.business-card-review-workbench .review-field-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-sm);
}

.business-card-review-workbench .review-field-source {
  display: grid;
  gap: 4px;
}

.business-card-review-workbench .review-field-source span {
  color: var(--orbit-color-primary-strong);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.3;
  text-transform: uppercase;
}

.business-card-review-workbench .review-field-source strong {
  color: var(--orbit-color-text);
  font-size: 0.95rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.business-card-review-workbench .review-field-form input {
  width: 100%;
}

.business-card-review-workbench .review-route-command {
  align-self: center;
  color: var(--orbit-color-muted);
  font-family: var(--orbit-font-mono);
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}

@media (min-width: 760px) {
  .business-card-review-workbench .review-field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;

const reviewApiProbes = [
  {
    label: "Review card fields",
    command: "PATCH /api/contact-drafts/demo-business-card-draft",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with reviewed fields and no contact write.",
  },
  {
    label: "Confirm reviewed card",
    command: "POST /api/contact-drafts/demo-business-card-draft/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a contact candidate and contactWriteExecuted false.",
  },
  {
    label: "Empty review",
    command: "PATCH /api/contact-drafts/demo-business-card-draft?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no review draft.",
  },
  {
    label: "Pending confirmation",
    command:
      "POST /api/contact-drafts/demo-business-card-draft/confirm?scenario=pending",
    expectedStatus: 409,
    expectation:
      "Expect 409 failure envelope with BUSINESS_CARD_REVIEW_PENDING context.",
  },
  {
    label: "Controlled failure",
    command:
      "PATCH /api/contact-drafts/demo-business-card-draft?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with BUSINESS_CARD_REVIEW_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Provider adapters live under features/acquisition/business-card-review-and-confirm-flow/providers/.",
  "ORBIT_BUSINESS_CARD_REVIEW_PROVIDER switches the review boundary from mock to live.",
  "Human review stays between OCR extraction and contact creation.",
  "Replacement tests cover review, confirm, privacy, and debug states.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Business card review evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ReviewFieldRows({ draft }: { draft: BusinessCardReviewDraft }) {
  return (
    <dl className="relationship-meta">
      {Object.values(draft.extractedFields).map((field) => (
        <div key={field.field}>
          <dt>{field.label}</dt>
          <dd>
            {field.reviewedValue || field.value}{" "}
            <code>{field.reviewState}</code>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function OperatorReviewForm({ draft }: { draft: BusinessCardReviewDraft }) {
  return (
    <form
      action={`/api/contact-drafts/${draft.id}`}
      aria-label="Correct extracted business card fields"
      className="review-field-form"
      data-api-method="PATCH"
    >
      <p className="type-caption">Correct extracted fields</p>
      <p className="type-body" id="business-card-review-form-note">
        Original extraction stays visible beside every operator correction. The
        PATCH route accepts these named fields under <code>reviewedFields</code>
        {" "}and returns reviewed evidence without creating a contact.
      </p>
      <div
        aria-label="Per-field business card correction controls"
        className="review-field-grid"
        role="list"
      >
        {Object.values(draft.extractedFields).map((field) => {
          const helperId = `business-card-review-${field.field}-helper`;
          const inputType =
            field.field === "email"
              ? "email"
              : field.field === "phone"
                ? "tel"
                : "text";

          return (
            <div className="review-field-card" key={field.field} role="listitem">
              <div className="review-field-source">
                <span>Original extraction</span>
                <strong>{field.value}</strong>
              </div>
              <Field
                helper={`Operator correction. Confidence ${field.confidence}; evidence ${field.evidenceId}.`}
                label={`${field.label} correction`}
              >
                <input
                  aria-describedby={helperId}
                  defaultValue={field.value}
                  name={`reviewedFields.${field.field}`}
                  readOnly
                  type={inputType}
                />
              </Field>
              <small className="type-caption" id={helperId}>
                Payload key <code>reviewedFields.{field.field}</code> keeps this
                source-backed field inside the review boundary.
              </small>
              <div className="chip-row">
                <Chip>{field.reviewState}</Chip>
                <Chip tone="evidence">source-backed</Chip>
              </div>
            </div>
          );
        })}
      </div>
      <input name="reviewerLabel" type="hidden" defaultValue="Demo reviewer" />
      <div className="button-row">
        <button
          aria-describedby="business-card-review-form-note"
          className="primary-action"
          type="button"
        >
          Accept or edit fields
        </button>
        <code className="review-route-command">
          PATCH /api/contact-drafts/{draft.id}
        </code>
      </div>
    </form>
  );
}

function ReviewSummary({ draft }: { draft: BusinessCardReviewDraft }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Review draft</dt>
        <dd>
          <code>{draft.id}</code> for {draft.displayName}, {draft.role} at{" "}
          {draft.organization}.
        </dd>
      </div>
      <div>
        <dt>Contact write</dt>
        <dd>
          <code>contactWriteExecuted</code> stays{" "}
          <code>{String(draft.contactWriteExecuted)}</code>;{" "}
          <code>databaseWriteExecuted</code> stays{" "}
          <code>{String(draft.databaseWriteExecuted)}</code>.
        </dd>
      </div>
      <div>
        <dt>Providers</dt>
        <dd>
          OCR, AI, persistence, and notification flags stay false in this mock.
        </dd>
      </div>
    </dl>
  );
}

function ConfirmationAction() {
  return (
    <div
      className="button-row"
      aria-label="Business card review confirmation action"
    >
      <form action={`/api/contact-drafts/${draftId}/confirm`} method="post">
        <button className="primary-action" type="submit">
          Confirm reviewed card
        </button>
      </form>
    </div>
  );
}

export function BusinessCardReviewAndConfirmFlowDemo() {
  const reviewService = createMockBusinessCardReviewService();
  const successState = reviewService.getReviewDraft({ draftId });
  const reviewedState = reviewService.updateReviewDraft({ draftId });
  const confirmedState = reviewService.confirmReviewedDraft({ draftId });
  const emptyState = reviewService.getReviewDraft({
    draftId,
    scenario: "empty",
  });
  const pendingState = reviewService.getReviewDraft({
    draftId,
    scenario: "pending",
  });
  const failureState = reviewService.getReviewDraft({
    draftId,
    scenario: "failure",
  });
  const successPayload = successState.success ? successState.data : null;
  const successDraft = successPayload?.reviewDraft ?? null;
  const reviewedPayload = reviewedState.success ? reviewedState.data : null;
  const reviewedDraft = reviewedPayload?.reviewDraft ?? null;
  const confirmedPayload = confirmedState.success ? confirmedState.data : null;

  return (
    <WorkbenchFrame className="business-card-review-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Business card review and confirm flow</h1>
          <p className="workbench-intro">
            Mock-first boundary for checking extracted card fields before a
            contact candidate can leave acquisition. No contact write runs
            during review.
          </p>
        </header>

        <WorkbenchSurface elevated eyebrow="Human checkpoint" title="Review extracted fields">
          <p className="type-body">
            The OCR draft becomes useful only after a person accepts or edits the
            extracted fields. This mock keeps that decision separate from contact
            creation.
          </p>
          {successDraft && (
            <>
              <OperatorReviewForm draft={successDraft} />
              <ReviewFieldRows draft={successDraft} />
              <EvidenceChips
                evidenceIds={successDraft.provenance.evidenceIds}
              />
            </>
          )}
        </WorkbenchSurface>

        <section
          className="workbench-grid"
          aria-label="Business card review states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG}
            title="Success state"
          >
            {successPayload && successDraft && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ReviewSummary draft={successDraft} />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No OCR draft" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Review draft</dt>
                    <dd>No extracted card fields are ready for review.</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{emptyState.data.provenance.sourceLabel}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Review needed" title="Pending state">
            {pendingState.success && pendingState.data.reviewDraft && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <ReviewFieldRows draft={pendingState.data.reviewDraft} />
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
          eyebrow="Operator confirmation"
          title="Confirm reviewed card"
        >
          {reviewedPayload && reviewedDraft && confirmedPayload && (
            <>
              <p className="type-body">
                Reviewed fields can produce a contact candidate, but the mock
                still does not write the contact record.
              </p>
              <ReviewSummary draft={reviewedDraft} />
              <dl className="relationship-meta">
                <div>
                  <dt>Confirmed candidate</dt>
                  <dd>
                    <code>
                      {confirmedPayload.contactCandidate.candidateId}
                    </code>{" "}
                    is ready for the downstream contact service with{" "}
                    <code>contactWriteExecuted</code>{" "}
                    <code>
                      {String(
                        confirmedPayload.contactCandidate.contactWriteExecuted,
                      )}
                    </code>
                    .
                  </dd>
                </div>
                <div>
                  <dt>Confirmation evidence</dt>
                  <dd>
                    <code>{confirmedPayload.createdEvidence.evidenceId}</code>{" "}
                    records the reviewed-card confirmation.
                  </dd>
                </div>
              </dl>
              <div className="chip-row" aria-label="Business card review guardrails">
                <Chip tone="confirmation">human review first</Chip>
                <Chip tone="privacy">mock only</Chip>
                <Chip tone="evidence">source-backed fields</Chip>
              </div>
              <ConfirmationAction />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Review routes use shared envelopes"
        >
          <p className="type-body">
            These probes cover review, confirmation, empty, pending, and
            controlled failure envelopes inside the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS
                      .BUSINESS_CARD_REVIEW_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
            {reviewApiProbes.map((probe) => (
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
          title="Replacement notes stay with the review capability"
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
                <code>ORBIT_BUSINESS_CARD_REVIEW_PROVIDER</code>
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Live handoff evidence excerpts"
          >
            <div>
              <dt>Live handoff evidence excerpts</dt>
              <dd>
                These excerpts mirror the replacement document for evaluator
                evidence.
              </dd>
            </div>
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <div key={excerpt}>
                <dt>Excerpt</dt>
                <dd>{excerpt}</dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
