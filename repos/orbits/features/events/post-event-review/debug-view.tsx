/**
 * 活动后联系人复核 mock 的开发者面板。
 *
 * 面板展示活动后待确认联系人、复核结果和 confirm payload，避免自动写入联系人。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  type PostEventReviewConfirmResult,
  type PostEventReviewConfirmPayload,
  type PostEventReviewContact,
  type PostEventReviewPayload,
  type PostEventReviewProvenance,
  type PostEventReviewResult,
} from "./contract";
import { createMockPostEventContactReviewService } from "./mock-service";

export const POST_EVENT_CONTACT_REVIEW_MOCK_SLUG =
  "post-event-review";

const liveImplementationNotesPath =
  "features/events/post-event-review/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.post-event-review-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.post-event-review-workbench .workbench-shell,
.post-event-review-workbench .workbench-surface,
.post-event-review-workbench .workbench-grid,
.post-event-review-workbench .relationship-meta,
.post-event-review-workbench .control-stack,
.post-event-review-workbench .chip-row,
.post-event-review-workbench .button-row,
.post-event-review-workbench form {
  min-width: 0;
}

.post-event-review-workbench input,
.post-event-review-workbench textarea,
.post-event-review-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.post-event-review-workbench code,
.post-event-review-workbench dd,
.post-event-review-workbench .orbit-chip,
.post-event-review-workbench .source-list li {
  overflow-wrap: anywhere;
}

.post-event-review-workbench .chip-row,
.post-event-review-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 152px), max-content)
  );
}

.post-event-review-workbench .post-event-checkpoint-grid,
.post-event-review-workbench .post-event-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
}

.post-event-review-workbench .post-event-checkpoint-grid div,
.post-event-review-workbench .post-event-state-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.post-event-review-workbench .post-event-state-matrix {
  display: grid;
  gap: var(--orbit-space-sm);
}

.post-event-review-workbench .post-event-state-card {
  display: grid;
  gap: var(--orbit-space-sm);
}

.post-event-review-workbench .post-event-state-card h3 {
  font-size: 0.95rem;
  margin: 0;
}

.post-event-review-workbench .post-event-operator-sequence {
  margin-top: var(--orbit-space-md);
}

.post-event-review-workbench .post-event-operator-sequence h3 {
  font-size: 0.95rem;
  margin: 0 0 var(--orbit-space-sm);
}

.post-event-review-workbench .post-event-operator-sequence ol {
  display: grid;
  gap: var(--orbit-space-sm);
  margin: 0;
  padding-left: 1.25rem;
}

.post-event-review-workbench .post-event-operator-sequence li {
  padding-left: var(--orbit-space-xs);
}
`;

const postEventReviewApiProbes = [
  {
    label: "Review post-event contacts",
    command: "GET /api/events/demo-event-1/post-event",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic new-contact summaries, tags, and follow-up suggestions.",
  },
  {
    label: "Confirm reviewed contacts",
    command: "POST /api/events/demo-event-1/post-event/confirm",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with confirmation preview and no batch persistence.",
  },
  {
    label: "Empty review",
    command: "GET /api/events/demo-event-1/post-event?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local post-event contacts are ready.",
  },
  {
    label: "Pending confirmation guard",
    command:
      "POST /api/events/demo-event-1/post-event/confirm?scenario=pending",
    expectedStatus: 409,
    expectation:
      "Expect 409 failure envelope while the attendee import review is pending.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/events/demo-event-1/post-event?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope without retrying providers, storage, sends, or model work.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/events/post-event-review/.",
  "ORBIT_POST_EVENT_REVIEW_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires event roster, encounter note, summarization, tagging, follow-up suggestion, and persistence providers.",
  "Every live post-event summary, tag, follow-up suggestion, and confirmation keeps source evidence and provenance.",
  "Replacement tests cover success, empty, pending, missing event, provider failure, privacy review, and confirmation paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Post-event review evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ContactReviewList({
  contacts,
}: {
  contacts: readonly PostEventReviewContact[];
}) {
  return (
    <dl className="relationship-meta">
      {contacts.map((contact) => (
        <div key={contact.contactDraftId}>
          <dt>{contact.displayName}</dt>
          <dd>
            {contact.role} at {contact.organization}.{" "}
            {contact.summary.headline}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ContactTagChips({
  contacts,
}: {
  contacts: readonly PostEventReviewContact[];
}) {
  const tags = contacts.flatMap((contact) => contact.tags);

  return (
    <div className="chip-row" aria-label="Post-event review tags">
      {tags.map((tag) => (
        <Chip key={tag.tagId} tone="primary">
          {tag.label}
        </Chip>
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  provenance,
}: {
  provenance: PostEventReviewProvenance;
}) {
  return (
    <dl
      aria-label="Mock-only post-event review execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Model work</dt>
        <dd>
          <code>{String(provenance.aiProviderRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>
          <code>{String(provenance.externalNetworkRequested)}</code>
        </dd>
      </div>
      <div>
        <dt>Database read</dt>
        <dd>
          <code>{String(provenance.liveDatabaseReadExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>Batch persistence</dt>
        <dd>
          <code>{String(provenance.batchPersistenceExecuted)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: PostEventReviewPayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: the post-event contact summaries, tags, and follow-up
        suggestions come from deterministic local fixtures.
      </p>
      <dl
        aria-label="Post-event review operator checkpoint"
        className="relationship-meta post-event-checkpoint-grid"
      >
        <div>
          <dt>Event</dt>
          <dd>
            {payload.event.title} <code>{payload.event.id}</code>
          </dd>
        </div>
        <div>
          <dt>New contacts</dt>
          <dd>{payload.contacts.length} contacts awaiting review</dd>
        </div>
        <div>
          <dt>Review id</dt>
          <dd>
            <code>{payload.reviewId}</code>
          </dd>
        </div>
        <div>
          <dt>Persistence guard</dt>
          <dd>
            batch persistence{" "}
            {String(payload.provenance.batchPersistenceExecuted)}
          </dd>
        </div>
      </dl>
      <div
        aria-label="Operator sequence"
        className="post-event-operator-sequence"
      >
        <h3>Operator sequence</h3>
        <ol className="type-body">
          <li>
            <strong>Scan event source context</strong> and verify the event id,
            review id, and source-backed evidence before reading details.
          </li>
          <li>
            <strong>Compare state matrix</strong> to confirm success, empty,
            pending, and failure behavior all come from the mock service.
          </li>
          <li>
            <strong>Confirm preview only</strong>; no batch persistence,
            provider calls, external sends, notifications, or model execution
            are allowed in this sprint.
          </li>
        </ol>
      </div>
    </WorkbenchSurface>
  );
}

function StateComparison({
  emptyState,
  failureState,
  pendingState,
  successState,
}: {
  emptyState: PostEventReviewResult;
  failureState: PostEventReviewResult;
  pendingState: PostEventReviewResult;
  successState: PostEventReviewResult;
}) {
  const rows = [
    {
      label: "Success",
      result:
        successState.success === true
          ? "Contacts ready"
          : successState.error.code,
      detail:
        successState.success === true
          ? successState.data.summary
          : successState.error.message,
    },
    {
      label: "Empty",
      result:
        emptyState.success === true ? "No new contacts" : emptyState.error.code,
      detail:
        emptyState.success === true
          ? emptyState.data.nextAction
          : emptyState.error.message,
    },
    {
      label: "Pending",
      result:
        pendingState.success === true
          ? "Import review pending"
          : pendingState.error.code,
      detail:
        pendingState.success === true
          ? pendingState.data.nextAction
          : pendingState.error.message,
    },
    {
      label: "Failure",
      result:
        failureState.success === true
          ? "Unexpected success"
          : "Controlled failure",
      detail:
        failureState.success === true
          ? failureState.data.summary
          : failureState.error.recovery,
    },
  ] as const;

  return (
    <WorkbenchSurface
      elevated
      eyebrow="State matrix"
      title="Compare mock outcomes before drilling in"
    >
      <p className="type-body">
        Compare success, empty, pending, and failure outcomes from the mock
        service before reading the detailed panels.
      </p>
      <div
        aria-label="Post-event contact review state comparison"
        className="post-event-state-matrix"
        role="list"
      >
        {rows.map((row) => (
          <article
            className="post-event-state-card"
            key={row.label}
            role="listitem"
          >
            <h3>{row.label}</h3>
            <dl className="relationship-meta">
              <div>
                <dt>Result</dt>
                <dd>{row.result}</dd>
              </div>
              <div>
                <dt>Operator check</dt>
                <dd>{row.detail}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function ReviewControlForm() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Local event fixture"
      title="Review post-event contacts"
    >
      <p className="type-body">
        This form requests the route handler that uses the post-event review
        mock service. Confirming records remains a preview until a live
        provider and confirmation guard are approved.
      </p>
      <form
        action="/api/events/demo-event-1/post-event"
        aria-label="Mock post-event contact review form"
        className="control-stack"
        method="get"
      >
        <Field label="Event id" helper="The demo route uses a local fixture.">
          <input name="eventId" readOnly type="text" value="demo-event-1" />
        </Field>
        <Field
          label="Scenario"
          helper="Leave success selected for the stable review payload."
        >
          <select name="scenario" defaultValue="success">
            <option value="success">success</option>
            <option value="empty">empty</option>
            <option value="pending">pending</option>
            <option value="failure">failure</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Review contacts
        </button>
      </form>
      <div className="chip-row" aria-label="Post-event review guardrails">
        <Chip tone="evidence">source-backed contacts</Chip>
        <Chip tone="privacy">event-only review</Chip>
        <Chip tone="confirmation">confirm before external action</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Post-event contact review API probe actions"
    >
      <p className="type-body">
        These probes exercise review, confirmation, empty, pending, and
        controlled failure paths inside the mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/events/demo-event-1/post-event"
          aria-label="Run post-event review API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run review probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/post-event/confirm"
          aria-label="Run post-event contact confirmation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run confirm probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/post-event?scenario=empty"
          aria-label="Run empty post-event review API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/post-event/confirm?scenario=pending"
          aria-label="Run pending post-event confirmation API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/events/demo-event-1/post-event?scenario=failure"
          aria-label="Run controlled failure post-event review API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

function ConfirmationPanel({
  confirmation,
}: {
  confirmation: PostEventReviewConfirmPayload;
}) {
  return (
    <>
      <p className="type-body">{confirmation.summary}</p>
      <dl className="relationship-meta">
        {confirmation.confirmedContacts.map((contact) => (
          <div key={contact.contactId}>
            <dt>{contact.displayName}</dt>
            <dd>
              <code>{contact.contactId}</code> batch persistence{" "}
              {String(contact.batchPersistenceExecuted)}.
            </dd>
          </div>
        ))}
      </dl>
      <EvidenceChips evidenceIds={confirmation.provenance.evidenceIds} />
    </>
  );
}

export function PostEventContactReviewMockDemo() {
  const postEventReviewService = createMockPostEventContactReviewService();
  const successState = postEventReviewService.getPostEventReview({
    eventId: "demo-event-1",
  }) as PostEventReviewResult;
  const confirmState = postEventReviewService.confirmPostEventContacts({
    contactDraftIds: ["draft:post-event:priya", "draft:post-event:marcus"],
    eventId: "demo-event-1",
  }) as PostEventReviewConfirmResult;
  const emptyState = postEventReviewService.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "empty",
  }) as PostEventReviewResult;
  const pendingState = postEventReviewService.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "pending",
  }) as PostEventReviewResult;
  const failureState = postEventReviewService.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "failure",
  }) as PostEventReviewResult;
  const successPayload = successState.success ? successState.data : null;
  const confirmPayload = confirmState.success ? confirmState.data : null;

  return (
    <WorkbenchFrame className="post-event-review-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Post-event contact review mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for reviewing event-sourced new contacts,
            summaries, tags, and follow-up suggestions without storage,
            external actions, provider calls, or model execution.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <StateComparison
          emptyState={emptyState}
          failureState={failureState}
          pendingState={pendingState}
          successState={successState}
        />

        <ReviewControlForm />

        <section
          className="workbench-grid"
          aria-label="Post-event contact review states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={POST_EVENT_CONTACT_REVIEW_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ContactReviewList contacts={successPayload.contacts} />
                <ContactTagChips contacts={successPayload.contacts} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No contacts" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Contacts</dt>
                    <dd>{emptyState.data.contacts.length} contacts ready</dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{emptyState.data.nextAction}</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Import review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Contacts</dt>
                    <dd>{pendingState.data.contacts.length} contacts ready</dd>
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
          eyebrow="Review details"
          title="Summaries, tags, and follow-up suggestions"
        >
          {successPayload && (
            <>
              {successPayload.contacts.map((contact) => (
                <article className="relationship-record" key={contact.contactDraftId}>
                  <h3>{contact.displayName}</h3>
                  <p className="type-body">{contact.summary.context}</p>
                  <dl className="relationship-meta">
                    <div>
                      <dt>Why now</dt>
                      <dd>{contact.summary.whyNow}</dd>
                    </div>
                    <div>
                      <dt>Follow-up suggestion</dt>
                      <dd>{contact.followUpSuggestion.messageDraft}</dd>
                    </div>
                    <div>
                      <dt>External send</dt>
                      <dd>
                        {String(
                          contact.followUpSuggestion
                            .externalMessageSendRequested,
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
              <MockOnlyExecutionChecks provenance={successPayload.provenance} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Confirmation" title="Confirmation preview">
          {confirmPayload && <ConfirmationPanel confirmation={confirmPayload} />}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API probes"
          title="Declared route probes and expected envelopes"
        >
          <ApiProbeActions />
          <dl className="relationship-meta">
            {postEventReviewApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{probe.command}</code> expects {probe.expectedStatus}.{" "}
                  {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the capability"
        >
          <p className="type-body">
            The live implementation notes stay inside the capability root so
            the switch from deterministic fixtures to providers is auditable.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Live notes</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch</dt>
              <dd>
                <code>ORBIT_POST_EVENT_REVIEW_PROVIDER</code> selects the live
                provider after replacement tests exist.
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
                {liveHandoffEvidenceExcerpts.map((excerpt) => (
                  <span key={excerpt}>{excerpt} </span>
                ))}
              </dd>
            </div>
          </dl>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
