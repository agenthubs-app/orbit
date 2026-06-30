/**
 * 手动创建联系人 mock 的开发者面板。
 *
 * 这里展示人工输入如何变成 source-backed contact draft，
 * 并覆盖确认、空状态、pending 和受控失败路径。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS,
  type ManualContactDraft,
} from "../manual-contract";
import { createMockManualContactCreationService } from "../mock-manual-service";

export const MANUAL_CONTACT_CREATION_MOCK_SLUG =
  "manual-contact-creation-mock";

const liveImplementationNotesPath =
  "features/acquisition/manual-contact-creation-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const manualContactApiProbes = [
  {
    label: "Create manual draft",
    command: "POST /api/contact-drafts/manual",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with source, note, tags, follow-up hint, and no contact write.",
  },
  {
    label: "Confirm manual draft",
    command: "POST /api/contact-drafts/demo-manual-draft/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a source-backed candidate and contactWriteExecuted false.",
  },
  {
    label: "Blocked confirmation",
    command:
      "POST /api/contact-drafts/demo-manual-draft/confirm?scenario=blocked",
    expectedStatus: 403,
    expectation:
      "Expect 403 failure envelope with MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED context.",
  },
  {
    label: "Empty manual note",
    command: "POST /api/contact-drafts/manual?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 success envelope with no draft.",
  },
  {
    label: "Validation guard",
    command: 'POST /api/contact-drafts/manual {"note":""}',
    expectedStatus: 400,
    expectation:
      "Expect 400 failure envelope with MANUAL_CONTACT_NOTE_REQUIRED context.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contact-drafts/manual?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with MANUAL_CONTACT_CREATION_MOCK_FAILED context.",
  },
] as const;

const operatorRunbookSteps = [
  {
    label: "Read the manual note evidence",
    detail:
      "Start with the source label, note excerpt, tags, and follow-up hint before treating the draft as a relationship candidate.",
  },
  {
    label: "Confirm only after duplicate review",
    detail:
      "Check the deterministic mock-rule duplicate result, then use the confirm route to create a candidate without writing a contact.",
  },
  {
    label: "Use probe paths for failure evidence",
    detail:
      "Run empty, validation, blocked confirmation, and controlled failure probes only when collecting boundary evidence.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live provider files live under features/acquisition/manual-contact-creation-mock/.",
  "ORBIT_MANUAL_CONTACT_PROVIDER switches from mock to live.",
  "Manual notes, tags, and follow-up hints preserve source evidence.",
  "Replacement tests cover create, confirm, validation, empty, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Manual contact evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ManualDraftSummary({ draft }: { draft: ManualContactDraft }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Draft</dt>
        <dd>
          <code>{draft.id}</code> for {draft.displayName}, {draft.role} at{" "}
          {draft.organization}.
        </dd>
      </div>
      <div>
        <dt>Manual note</dt>
        <dd>{draft.note}</dd>
      </div>
      <div>
        <dt>Tags</dt>
        <dd>{draft.tags.join(", ")}</dd>
      </div>
      <div>
        <dt>Follow-up hint</dt>
        <dd>{draft.followUpHint}</dd>
      </div>
      <div>
        <dt>Duplicate lookup</dt>
        <dd>
          <code>mock-rule duplicate check</code> returns{" "}
          <code>{draft.duplicateCheck.result}</code>; external lookup stays
          false in the manual mock.
        </dd>
      </div>
    </dl>
  );
}

function RuntimeConsole({
  draft,
  nextAction,
}: {
  draft: ManualContactDraft;
  nextAction: string;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Runtime console"
      title="Manual contact operator runbook"
    >
      <dl
        className="relationship-meta"
        aria-label="Manual contact current state and next action"
      >
        <div>
          <dt>Current state</dt>
          <dd>
            <code>{draft.id}</code> is staged from {draft.source.label}; no
            contact write or live duplicate lookup has run.
          </dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>
            Review source evidence, then confirm the staged draft. Service next
            action: {nextAction}
          </dd>
        </div>
        <div>
          <dt>Primary operator action</dt>
          <dd>Confirm pending draft before any contact write.</dd>
        </div>
        <div>
          <dt>Controlled paths stay separate</dt>
          <dd>
            Empty, validation, and failure probes are below for verification;
            they are not the default operator path.
          </dd>
        </div>
      </dl>
      <dl
        className="relationship-meta"
        aria-label="Manual contact operator runbook steps"
      >
        {operatorRunbookSteps.map((step) => (
          <div key={step.label}>
            <dt>{step.label}</dt>
            <dd>{step.detail}</dd>
          </div>
        ))}
      </dl>
      <div className="chip-row" aria-label="Manual contact runtime status">
        <Chip tone="confirmation">pending confirmation</Chip>
        <Chip tone="evidence">source evidence attached</Chip>
        <Chip tone="privacy">no live write</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ManualNoteIntake({ draft }: { draft: ManualContactDraft }) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Manual note intake"
      title="Source ledger"
    >
      <p className="type-body">
        This mock captures the CONTACT_DRAFT_CREATION path as a local draft
        with source evidence before any relationship record can be written.
      </p>
      <form
        action="/api/contact-drafts/manual"
        aria-label="Mock manual contact creation form"
        className="control-stack"
        method="post"
      >
        <Field
          label="Source"
          helper="Manual source context stays with the draft."
        >
          <input
            name="source"
            readOnly
            type="text"
            value={draft.source.label}
          />
        </Field>
        <Field label="Note" helper="The note is the primary evidence excerpt.">
          <textarea name="note" readOnly value={draft.note} />
        </Field>
        <Field label="Tags" helper="Tags stay as operator-provided context.">
          <input name="tags" readOnly type="text" value={draft.tags.join(", ")} />
        </Field>
        <Field
          label="Follow-up hint"
          helper="The hint suggests the next sensible action."
        >
          <input
            name="followUpHint"
            readOnly
            type="text"
            value={draft.followUpHint}
          />
        </Field>
        <button className="primary-action" type="submit">
          Stage manual draft
        </button>
      </form>
      <div className="chip-row" aria-label="Manual contact guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="confirmation">explicit confirmation</Chip>
        <Chip tone="privacy">mock only</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Manual contact adversarial API probe actions"
    >
      <p className="type-body">
        Browser-submit these POST probes to collect real envelopes from the
        Next route handlers.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/manual?scenario=empty"
          aria-label="Run empty manual contact API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/manual"
          aria-label="Run validation manual contact API probe"
          method="post"
        >
          <input name="note" type="hidden" defaultValue="" />
          <button className="secondary-action" type="submit">
            Run validation probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/manual?scenario=failure"
          aria-label="Run controlled failure manual contact API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/demo-manual-draft/confirm?scenario=blocked"
          aria-label="Run blocked confirmation manual contact API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run blocked confirmation probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function ManualContactCreationMockDemo() {
  const manualService = createMockManualContactCreationService();
  const successState = manualService.createManualContactDraft();
  const emptyState = manualService.createManualContactDraft({
    scenario: "empty",
  });
  const pendingState = manualService.createManualContactDraft({
    scenario: "pending",
  });
  const failureState = manualService.createManualContactDraft({
    scenario: "failure",
  });
  const confirmedState = manualService.confirmManualContactDraft({
    draftId: "demo-manual-draft",
  });
  const successPayload = successState.success ? successState.data : null;
  const successDraft = successPayload?.draft ?? null;

  return (
    <WorkbenchFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Manual contact creation mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for turning an operator&apos;s manual source
            note into a typed contact draft with tags, follow-up guidance,
            provenance, and explicit confirmation before any live write.
          </p>
        </header>

        {successPayload && successDraft && (
          <RuntimeConsole
            draft={successDraft}
            nextAction={successPayload.nextAction}
          />
        )}

        {successDraft && <ManualNoteIntake draft={successDraft} />}

        <section
          className="workbench-grid"
          aria-label="Manual contact creation states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={MANUAL_CONTACT_CREATION_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && successDraft && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ManualDraftSummary draft={successDraft} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No manual note" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Draft</dt>
                    <dd>No manual contact draft is staged.</dd>
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

          <WorkbenchSurface eyebrow="Confirmation needed" title="Pending state">
            {pendingState.success && pendingState.data.draft && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <ManualDraftSummary draft={pendingState.data.draft} />
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
          eyebrow="Explicit confirmation"
          title="Confirm without writing a contact"
        >
          {confirmedState.success && (
            <>
              <p className="type-body">
                Confirmation returns a candidate for the future contact service.
                The mock keeps <code>contactWriteExecuted</code> and{" "}
                <code>duplicateLookupExecuted</code> false.
              </p>
              <dl className="relationship-meta">
                <div>
                  <dt>Candidate</dt>
                  <dd>
                    <code>{confirmedState.data.contactCandidate.candidateId}</code>{" "}
                    is ready after evidence review.
                  </dd>
                </div>
                <div>
                  <dt>Created evidence</dt>
                  <dd>
                    <code>{confirmedState.data.createdEvidence.evidenceId}</code>{" "}
                    records the mock confirmation.
                  </dd>
                </div>
              </dl>
              <form
                action="/api/contact-drafts/demo-manual-draft/confirm"
                aria-label="Confirm manual contact draft"
                method="post"
              >
                <button className="primary-action" type="submit">
                  Confirm manual draft
                </button>
              </form>
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Manual contact routes use shared envelopes"
        >
          <p className="type-body">
            These probes cover the creation, confirmation, empty, validation,
            blocked confirmation, and controlled failure paths without leaving
            the manual mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Creation failure mapping</dt>
              <dd>
                <code>
                  {
                    MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS
                      .MANUAL_CONTACT_CREATION_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Manual contact API probes"
          >
            {manualContactApiProbes.map((probe) => (
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
          title="Replacement notes stay with the manual capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Live provider files</dt>
              <dd>
                <code style={pathWrapStyle}>
                  features/acquisition/manual-contact-creation-mock/live-service.ts
                </code>{" "}
                replaces the mock only after source evidence and confirmation
                tests are ready.
              </dd>
            </div>
            <div>
              <dt>Switch and env</dt>
              <dd>
                <code>ORBIT_MANUAL_CONTACT_PROVIDER</code> switches from mock
                to live and must fail closed when configuration is missing.
              </dd>
            </div>
          </dl>
          <dl
            className="relationship-meta"
            aria-label="Manual contact live handoff evidence excerpts"
          >
            <div>
              <dt>Live handoff evidence excerpts</dt>
              <dd>
                These excerpts mirror the replacement document for evaluator
                checks.
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
