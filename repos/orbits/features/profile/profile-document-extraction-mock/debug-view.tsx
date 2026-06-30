/**
 * Profile 文档抽取 mock 的开发者面板。
 *
 * 面板展示简历/名片抽取出的 profile draft，当前 mock 不调用真实 OCR 或写入 profile。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS } from "../extraction-contract";
import { createMockProfileDocumentExtractionService } from "../mock-extraction-service";

export const PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG =
  "profile-document-extraction-mock";

const liveImplementationNotesPath =
  "features/profile/profile-document-extraction-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const profileDocumentApiProbes = [
  {
    label: "Resume draft",
    command: "POST /api/profile/extractions/resume",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/extractions/resume",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with the demo resume draft.",
  },
  {
    label: "Business card draft",
    command: "POST /api/profile/extractions/business-card",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with the demo business-card draft.",
  },
  {
    label: "Empty resume",
    command: "POST /api/profile/extractions/resume?scenario=empty",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/extractions/resume?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with the empty draft state.",
  },
  {
    label: "Pending card review",
    command: "POST /api/profile/extractions/business-card?scenario=pending",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with the pending review state.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/profile/extractions/business-card?scenario=failure",
    curlCommand:
      "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with PROFILE_DOCUMENT_EXTRACTION_FAILED context.",
  },
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Profile document extraction evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

export function ProfileDocumentExtractionCapabilityDemo() {
  const extractionService = createMockProfileDocumentExtractionService();
  const resumeState = extractionService.extractResumeDraft();
  const businessCardState = extractionService.extractBusinessCardDraft();
  const emptyState = extractionService.extractResumeDraft({
    scenario: "empty",
  });
  const pendingState = extractionService.extractBusinessCardDraft({
    scenario: "pending",
  });
  const failureState = extractionService.extractBusinessCardDraft({
    scenario: "failure",
  });

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Profile document extraction mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for turning onboarding resume and business-card
            inputs into source-backed profile drafts without OCR, document
            parsing systems, AI calls, storage, or device access.
          </p>
        </header>

        <section
          className="workbench-grid"
          aria-label="Profile document extraction states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG}
            title="Success state"
          >
            {resumeState.success && resumeState.data.draft && (
              <>
                <p className="type-body">Resume draft</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Operator</dt>
                    <dd>{resumeState.data.draft.displayName}</dd>
                  </div>
                  <div>
                    <dt>Headline</dt>
                    <dd>{resumeState.data.draft.headline}</dd>
                  </div>
                  <div>
                    <dt>Relationship goal</dt>
                    <dd>{resumeState.data.draft.relationshipGoal}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>
                      <code>{resumeState.data.draft.confidence}</code>{" "}
                      confidence from{" "}
                      {resumeState.data.provenance.sourceLabel}.
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={resumeState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Card intake" title="Business card draft">
            {businessCardState.success && businessCardState.data.draft && (
              <>
                <p className="type-body">{businessCardState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Contact</dt>
                    <dd>
                      {businessCardState.data.draft.displayName},{" "}
                      {businessCardState.data.draft.role}
                    </dd>
                  </div>
                  <div>
                    <dt>Organization</dt>
                    <dd>{businessCardState.data.draft.organization}</dd>
                  </div>
                  <div>
                    <dt>Suggested profile fields</dt>
                    <dd>
                      {businessCardState.data.draft.suggestedProfileFields
                        .preferredIntroChannels?.join(", ")}{" "}
                      in{" "}
                      {
                        businessCardState.data.draft.suggestedProfileFields
                          .homeMarket
                      }
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={businessCardState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No document text" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Draft</dt>
                    <dd>No onboarding draft was extracted in this scenario.</dd>
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

          <WorkbenchSurface eyebrow="Manual review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Draft</dt>
                    <dd>
                      Business-card lines are held until the operator confirms
                      the source text.
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{pendingState.data.provenance.sourceLabel}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface
            eyebrow="Extraction guard"
            title="Failure state"
          >
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
          eyebrow="API exercise surface"
          title="Profile extraction routes use shared envelopes"
        >
          <p className="type-body">
            Run these probes against the dev server to verify success, empty,
            pending, and failure envelopes without leaving the mock extraction
            boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Resume extraction</dt>
              <dd>
                <code>POST /api/profile/extractions/resume</code> returns a
                source-backed onboarding draft from the demo resume fixture.
              </dd>
            </div>
            <div>
              <dt>Business-card extraction</dt>
              <dd>
                <code>POST /api/profile/extractions/business-card</code>{" "}
                returns identity and contact fields from the demo card fixture.
              </dd>
            </div>
            <div>
              <dt>Controlled failure</dt>
              <dd>
                <code>
                  {
                    PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS
                      .PROFILE_DOCUMENT_EXTRACTION_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope and includes profile document
                context.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Profile document extraction API probes"
          >
            {profileDocumentApiProbes.map((probe) => (
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
          <div
            className="chip-row"
            aria-label="Profile document extraction guardrails"
          >
            <Chip tone="privacy">mock only</Chip>
            <Chip tone="evidence">source-backed draft</Chip>
            <Chip tone="confirmation">review before use</Chip>
          </div>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the extraction capability"
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
                Live service files, the switch mechanism, required environment
                values and permissions, privacy and provenance constraints, and
                replacement tests are documented before live extraction is
                wired.
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
