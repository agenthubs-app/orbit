import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS,
  type ContactAcquisitionDraft,
} from "../contract";
import { createMockContactAcquisitionDraftService } from "../mock-service";

export const CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG =
  "contact-acquisition-draft-pipeline";

const liveImplementationNotesPath =
  "features/acquisition/contact-acquisition-draft-pipeline/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const operatorRunbookSteps = [
  {
    label: "Review source evidence",
    detail:
      "Start from the evidence chips and source labels before treating any draft as a relationship candidate.",
  },
  {
    label: "Confirm the staged candidate",
    detail:
      "Use the confirm route only after the operator accepts the source-backed draft.",
  },
  {
    label: "Reload the mock queue",
    detail:
      "Re-run the list route to prove the deterministic mock fixture reloads without a silent contact write.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Provider adapters live under features/acquisition/providers/.",
  "ORBIT_CONTACT_ACQUISITION_PROVIDER gates provider-backed acquisition.",
  "Operator confirmation precedes every contact write.",
  "Replacement tests cover draft list, confirm, privacy, and debug states.",
] as const;

const contactDraftApiProbes = [
  {
    label: "Draft queue",
    command: "GET /api/contact-drafts",
    curlCommand: "curl -s http://localhost:3000/api/contact-drafts",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source-backed demo contact drafts.",
  },
  {
    label: "Confirm draft",
    command: "POST /api/contact-drafts/demo-draft-1/confirm",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/contact-drafts/demo-draft-1/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a confirmed candidate and no contact write.",
  },
  {
    label: "Reload after confirmation",
    command:
      "POST /api/contact-drafts/demo-draft-1/confirm, then GET /api/contact-drafts",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/contact-drafts/demo-draft-1/confirm && curl -s http://localhost:3000/api/contact-drafts",
    expectedStatus: 200,
    expectation:
      "Expect the mock queue to reload from deterministic source fixtures, not from a silent contact write.",
  },
  {
    label: "Empty queue",
    command: "GET /api/contact-drafts?scenario=empty",
    curlCommand: "curl -s http://localhost:3000/api/contact-drafts?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with no staged drafts.",
  },
  {
    label: "Pending draft",
    command: "GET /api/contact-drafts?scenario=pending",
    curlCommand:
      "curl -s http://localhost:3000/api/contact-drafts?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with one draft waiting for confirmation.",
  },
  {
    label: "Missing draft",
    command: "POST /api/contact-drafts/missing-draft/confirm",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/contact-drafts/missing-draft/confirm",
    expectedStatus: 404,
    expectation:
      "Expect 404 failure envelope with CONTACT_DRAFT_NOT_FOUND context.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/contact-drafts?scenario=failure",
    curlCommand:
      "curl -s http://localhost:3000/api/contact-drafts?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CONTACT_DRAFT_PIPELINE_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Contact acquisition draft evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function DraftRows({ drafts }: { drafts: readonly ContactAcquisitionDraft[] }) {
  return (
    <dl className="relationship-meta">
      {drafts.map((draft) => (
        <div key={draft.id}>
          <dt>{draft.displayName}</dt>
          <dd>
            <code>{draft.id}</code> from {draft.source.label} is staged as{" "}
            <code>{draft.status}</code> with{" "}
            <code>{draft.confirmation.state}</code> confirmation.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ConfirmationRehearsal({
  draft,
}: {
  draft: ContactAcquisitionDraft;
}) {
  const [primaryEvidence] = draft.evidence;
  const draftService = createMockContactAcquisitionDraftService();
  const confirmed = draftService.confirmContactDraft({ draftId: draft.id });

  return (
    <WorkbenchSurface
      eyebrow="Operator confirmation"
      title="Confirm the draft without writing a contact"
    >
      {confirmed.success && (
        <>
          <p className="type-body">
            No contact is written until confirmation, and this mock still only
            returns a candidate for the downstream contact service.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Before confirmation</dt>
              <dd>
                <code>{draft.id}</code> remains{" "}
                <code>{draft.status}</code> with{" "}
                <code>{draft.confirmation.state}</code> confirmation until an
                operator answers: {draft.confirmation.question}
              </dd>
            </div>
            <div>
              <dt>Source context</dt>
              <dd>
                {primaryEvidence.sourceLabel}{" "}
                <code>{primaryEvidence.evidenceId}</code>:{" "}
                {primaryEvidence.excerpt}
              </dd>
            </div>
            <div>
              <dt>After confirmation</dt>
              <dd>
                <code>{confirmed.data.contactCandidate.candidateId}</code>{" "}
                is ready for the contact service while{" "}
                <code>contactWriteExecuted</code> stays{" "}
                <code>false</code>.
              </dd>
            </div>
            <div>
              <dt>Created evidence</dt>
              <dd>
                <code>{confirmed.data.createdEvidence.evidenceId}</code>{" "}
                records the mock confirmation boundary.
              </dd>
            </div>
          </dl>
          <div className="chip-row" aria-label="Contact draft guardrails">
            <Chip tone="privacy">mock only</Chip>
            <Chip tone="confirmation">operator confirmation</Chip>
            <Chip tone="evidence">source-backed candidate</Chip>
          </div>
          <form
            action="/api/contact-drafts/demo-draft-1/confirm"
            method="post"
            aria-label="Confirm demo contact draft"
          >
            <button className="primary-action" type="submit">
              Confirm draft
            </button>
          </form>
        </>
      )}
    </WorkbenchSurface>
  );
}

export function ContactAcquisitionDraftPipelineDemo() {
  const draftService = createMockContactAcquisitionDraftService();
  const successState = draftService.listContactDrafts();
  const emptyState = draftService.listContactDrafts({ scenario: "empty" });
  const pendingState = draftService.listContactDrafts({ scenario: "pending" });
  const failureState = draftService.listContactDrafts({ scenario: "failure" });
  const firstDraft = successState.success ? successState.data.drafts[0] : null;

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Contact acquisition draft pipeline</h1>
          <p className="workbench-intro">
            Mock-first boundary for staging relationship contacts from manual
            notes, business-card OCR, and referrals. Drafts stay source-aware
            and require operator confirmation before a downstream contact write
            can be attempted.
          </p>
        </header>

        <WorkbenchSurface elevated eyebrow="Fast path" title="Operator runbook">
          <p className="type-body">
            Use this pass first, then drop into the detailed state cards and API
            probes only when a boundary needs inspection.
          </p>
          <dl className="relationship-meta">
            {operatorRunbookSteps.map((step) => (
              <div key={step.label}>
                <dt>{step.label}</dt>
                <dd>{step.detail}</dd>
              </div>
            ))}
          </dl>
          <div className="chip-row" aria-label="Contact acquisition fast path">
            <Chip tone="evidence">source first</Chip>
            <Chip tone="confirmation">confirm second</Chip>
            <Chip tone="privacy">no silent write</Chip>
          </div>
        </WorkbenchSurface>

        <section
          className="workbench-grid"
          aria-label="Contact acquisition draft pipeline states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG}
            title="Success state"
          >
            {successState.success && (
              <>
                <p className="type-body">{successState.data.summary}</p>
                <DraftRows drafts={successState.data.drafts} />
                <EvidenceChips
                  evidenceIds={successState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No source event" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Draft queue</dt>
                    <dd>No sourced contact draft exists in this scenario.</dd>
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
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <DraftRows drafts={pendingState.data.drafts} />
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

        {firstDraft && <ConfirmationRehearsal draft={firstDraft} />}

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Draft routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify draft listing,
            confirmation, empty, pending, missing draft, and controlled failure
            envelopes inside the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Draft list route</dt>
              <dd>
                <code>GET /api/contact-drafts</code> returns sourced drafts
                without creating contact records.
              </dd>
            </div>
            <div>
              <dt>Confirm route</dt>
              <dd>
                <code>POST /api/contact-drafts/demo-draft-1/confirm</code>{" "}
                returns a confirmed candidate while keeping the contact write
                unexecuted.
              </dd>
            </div>
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS
                      .CONTACT_DRAFT_PIPELINE_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Contact draft API probes"
          >
            {contactDraftApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>
                  <br />
                  {probe.expectation}
                  <br />
                  Expected status: {probe.expectedStatus}
                  <br />
                  <code style={pathWrapStyle}>{probe.curlCommand}</code>
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the acquisition capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Provider files</dt>
              <dd>
                <code style={pathWrapStyle}>
                  features/acquisition/live-service.ts
                </code>{" "}
                replaces the mock only after draft list and confirmation paths
                have replacement tests.
              </dd>
            </div>
            <div>
              <dt>Switch and env</dt>
              <dd>
                Feature mode stays explicit, and live mode requires{" "}
                <code>ORBIT_CONTACT_ACQUISITION_PROVIDER</code> before any
                provider-backed source can enter the draft queue.
              </dd>
            </div>
            <div>
              <dt>Privacy and tests</dt>
              <dd>
                Replacement tests must preserve source and evidence provenance,
                prove operator confirmation precedes contact writes, and keep
                raw service errors out of API envelopes.
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
                These excerpts mirror the replacement document so evaluator
                evidence can inspect concrete handoff content without opening a
                separate artifact.
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
