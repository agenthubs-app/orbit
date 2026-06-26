import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS,
  type BusinessCardContactDraft,
} from "../business-card-contract";
import { createMockBusinessCardScanOcrService } from "../mock-business-card-service";

export const BUSINESS_CARD_SCAN_OCR_MOCK_SLUG =
  "business-card-scan-ocr-mock";

const liveImplementationNotesPath =
  "features/acquisition/business-card-scan-ocr-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.business-card-ocr-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.business-card-ocr-workbench .workbench-shell,
.business-card-ocr-workbench .workbench-surface,
.business-card-ocr-workbench .workbench-grid,
.business-card-ocr-workbench .relationship-meta,
.business-card-ocr-workbench .control-stack,
.business-card-ocr-workbench .chip-row,
.business-card-ocr-workbench .button-row,
.business-card-ocr-workbench form {
  min-width: 0;
}

.business-card-ocr-workbench input,
.business-card-ocr-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.business-card-ocr-workbench code,
.business-card-ocr-workbench dd,
.business-card-ocr-workbench .orbit-chip,
.business-card-ocr-workbench .source-list li {
  overflow-wrap: anywhere;
}

.business-card-ocr-workbench .chip-row,
.business-card-ocr-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 120px), max-content)
  );
}
`;

const businessCardApiProbes = [
  {
    label: "Scan business card",
    command: "POST /api/contact-drafts/business-card/scan",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with capture, OCR extraction, and extracted contact draft.",
  },
  {
    label: "Read extracted draft",
    command: "GET /api/contact-drafts/demo-business-card-draft",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the staged Hana Sato business card draft.",
  },
  {
    label: "Empty image",
    command: "POST /api/contact-drafts/business-card/scan?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no draft.",
  },
  {
    label: "Pending OCR",
    command: "POST /api/contact-drafts/business-card/scan?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope with no draft.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contact-drafts/business-card/scan?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with BUSINESS_CARD_SCAN_OCR_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/business-card-scan-ocr-mock/.",
  "ORBIT_BUSINESS_CARD_SCAN_PROVIDER switches from mock to live.",
  "Live replacement requires camera permission, OCR provider, and storage bucket controls.",
  "Replacement tests cover scan, lookup, empty, pending, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Business card OCR evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function DraftSummary({ draft }: { draft: BusinessCardContactDraft }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Extracted contact draft</dt>
        <dd>
          <code>{draft.id}</code> for {draft.displayName}, {draft.role} at{" "}
          {draft.organization}.
        </dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{draft.email}</dd>
      </div>
      <div>
        <dt>Phone</dt>
        <dd>{draft.phone}</dd>
      </div>
      <div>
        <dt>Contact write</dt>
        <dd>
          <code>contactWriteExecuted</code> stays{" "}
          <code>{String(draft.contactWriteExecuted)}</code> until explicit
          confirmation.
        </dd>
      </div>
    </dl>
  );
}

function CardCapturePanel() {
  return (
    <WorkbenchSurface elevated eyebrow="Card image capture" title="Mock input">
      <p className="type-body">
        This mock treats the card image as a deterministic fixture or local text
        payload. It records capture metadata without touching a device, storage,
        OCR provider, model extraction, or database.
      </p>
      <form
        action="/api/contact-drafts/business-card/scan"
        aria-label="Mock business card scan form"
        className="control-stack"
        method="post"
      >
        <Field
          label="Image text"
          helper="Local fixture text stands in for a captured card image."
        >
          <textarea
            name="imageText"
            readOnly
            value={
              "Hana Sato\nHead of Robotics Partnerships\nAki Robotics\nhana.sato@akirobotics.example\n+81-3-5555-0198"
            }
          />
        </Field>
        <Field
          label="Image name"
          helper="The mock never uploads this image."
        >
          <input
            name="imageName"
            readOnly
            type="text"
            value="hana-sato-aki-robotics-card.jpg"
          />
        </Field>
        <button className="primary-action" type="submit">
          Scan business card
        </button>
      </form>
      <div className="chip-row" aria-label="Business card scan guardrails">
        <Chip tone="evidence">fixture capture</Chip>
        <Chip tone="privacy">no image upload</Chip>
        <Chip tone="confirmation">draft review required</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Business card OCR API probe actions"
    >
      <p className="type-body">
        Submit these probes only when collecting boundary evidence for the mock
        card scan routes.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/business-card/scan?scenario=empty"
          aria-label="Run empty business card scan API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/business-card/scan?scenario=pending"
          aria-label="Run pending business card scan API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/business-card/scan?scenario=failure"
          aria-label="Run controlled failure business card scan API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function BusinessCardScanOcrMockDemo() {
  const scanService = createMockBusinessCardScanOcrService();
  const successState = scanService.scanBusinessCard();
  const emptyState = scanService.scanBusinessCard({ scenario: "empty" });
  const pendingState = scanService.scanBusinessCard({ scenario: "pending" });
  const failureState = scanService.scanBusinessCard({ scenario: "failure" });
  const successPayload = successState.success ? successState.data : null;
  const successDraft = successPayload?.draft ?? null;

  return (
    <WorkbenchFrame className="business-card-ocr-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Business card scan OCR mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for card image capture, OCR extraction, and an
            extracted contact draft before any live upload, OCR, AI, or contact
            write can run.
          </p>
        </header>

        <CardCapturePanel />

        <section className="workbench-grid" aria-label="Business card OCR states">
          <WorkbenchSurface
            elevated
            eyebrow={BUSINESS_CARD_SCAN_OCR_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && successDraft && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <DraftSummary draft={successDraft} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Unreadable card" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>OCR extraction</dt>
                    <dd>{emptyState.data.ocr.status}</dd>
                  </div>
                  <div>
                    <dt>Draft</dt>
                    <dd>No extracted contact draft is staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="OCR queue" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Capture</dt>
                    <dd>
                      <code>{pendingState.data.capture.captureId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>OCR extraction</dt>
                    <dd>{pendingState.data.ocr.status}</dd>
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
          eyebrow="OCR extraction"
          title="Extracted fields stay reviewable"
        >
          {successPayload && successDraft && (
            <>
              <p className="type-body">
                Raw OCR text and extracted fields stay attached to the draft so
                the operator can confirm the source evidence before any live
                contact write.
              </p>
              <dl className="relationship-meta">
                <div>
                  <dt>Raw text</dt>
                  <dd>{successPayload.ocr.rawText}</dd>
                </div>
                <div>
                  <dt>Extracted contact draft</dt>
                  <dd>
                    <code>{successDraft.id}</code> remains pending confirmation.
                  </dd>
                </div>
              </dl>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Business card scan routes use shared envelopes"
        >
          <p className="type-body">
            These probes cover the scan, lookup, empty, pending, and controlled
            failure paths without leaving the OCR mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS
                      .BUSINESS_CARD_SCAN_OCR_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Business card scan OCR API probes"
          >
            {businessCardApiProbes.map((probe) => (
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
          title="Replacement notes stay with the card scan capability"
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
                <code>ORBIT_BUSINESS_CARD_SCAN_PROVIDER</code>
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
