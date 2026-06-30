/**
 * 联系人详情标签/状态 mock 的开发者面板。
 *
 * 面板展示联系人详情、可编辑标签、状态、备注和最近互动更新结果。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  CONTACT_DETAIL_STATUS_OPTIONS,
  CONTACT_DETAIL_TAG_OPTIONS,
  CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS,
  type ContactDetail,
  type ContactDetailTagStatusPayload,
  type ContactDetailTagStatusProvenance,
} from "../detail-contract";
import { createMockContactDetailTagStatusService } from "../mock-detail-service";

export const CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG =
  "contact-detail-tag-and-status-mock";

const liveImplementationNotesPath =
  "features/contacts/contact-detail-tag-and-status-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.contact-detail-tag-status-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.contact-detail-tag-status-workbench .workbench-shell,
.contact-detail-tag-status-workbench .workbench-surface,
.contact-detail-tag-status-workbench .workbench-grid,
.contact-detail-tag-status-workbench .relationship-meta,
.contact-detail-tag-status-workbench .control-stack,
.contact-detail-tag-status-workbench .chip-row,
.contact-detail-tag-status-workbench .button-row,
.contact-detail-tag-status-workbench form {
  min-width: 0;
}

.contact-detail-tag-status-workbench input,
.contact-detail-tag-status-workbench select,
.contact-detail-tag-status-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.contact-detail-tag-status-workbench code,
.contact-detail-tag-status-workbench dd,
.contact-detail-tag-status-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.contact-detail-tag-status-workbench .chip-row,
.contact-detail-tag-status-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.contact-detail-tag-status-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.contact-detail-tag-status-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.contact-detail-tag-status-workbench .contact-detail-evidence-list {
  display: grid;
  gap: var(--orbit-space-md);
}

.contact-detail-tag-status-workbench .contact-detail-evidence-row {
  border-top: 1px solid var(--orbit-color-border);
  min-width: 0;
  padding-top: var(--orbit-space-md);
}

.contact-detail-tag-status-workbench .contact-detail-evidence-row:first-child {
  border-top: 0;
  padding-top: 0;
}
`;

const contactDetailApiProbes = [
  {
    label: "Read contact detail",
    command: "GET /api/contacts/demo-contact-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with tags, status, notes, last interaction metadata, and provenance.",
  },
  {
    label: "Patch contact detail",
    command: "PATCH /api/contacts/demo-contact-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic tag, status, note, and last interaction changes.",
  },
  {
    label: "Empty detail",
    command: "GET /api/contacts/demo-contact-1?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no selected contact detail.",
  },
  {
    label: "Pending detail",
    command: "GET /api/contacts/demo-contact-1?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope while fixture review waits.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/contacts/demo-contact-1?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/contacts/contact-detail-tag-and-status-mock/.",
  "ORBIT_CONTACT_DETAIL_PROVIDER switches from mock to live.",
  "Live replacement wires a contact persistence service and production audit log behind the same service interface.",
  "Contact detail keeps tags, status, notes, last interaction metadata, source evidence, and provenance together.",
  "Replacement tests cover detail read, tag edit, status change, note update, malformed update bodies, empty, pending, update-pending conflict, validation, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Contact detail evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function TagChips({ contact }: { contact: ContactDetail }) {
  return (
    <div className="chip-row" aria-label="Contact detail tags">
      {contact.tags.map((tag) => (
        <Chip key={tag} tone="confirmation">
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function ContactDetailSummary({ contact }: { contact: ContactDetail }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Contact</dt>
        <dd>
          {contact.displayName}, {contact.role} at {contact.organization}.
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>Status: {contact.status}</dd>
      </div>
      <div>
        <dt>Last interaction</dt>
        <dd>Last interaction: {contact.lastInteraction.summary}</dd>
      </div>
      <div>
        <dt>Next action</dt>
        <dd>Next action: {contact.nextAction}</dd>
      </div>
    </dl>
  );
}

function ContactDetailEvidenceRows({ contact }: { contact: ContactDetail }) {
  return (
    <div className="contact-detail-evidence-list">
      <article
        aria-label={`Contact detail evidence for ${contact.displayName}`}
        className="relationship-record contact-detail-evidence-row"
      >
        <header>
          <p className="type-caption">
            {`Contact detail evidence for ${contact.displayName}`}
          </p>
          <h3 className="relationship-name">{contact.displayName}</h3>
          <p className="type-caption">
            {contact.role} at {contact.organization}
          </p>
        </header>
        <dl className="relationship-meta">
          <div>
            <dt>Source</dt>
            <dd>Source: {contact.source.label}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>
              Evidence:{" "}
              {contact.evidence
                .map((evidence) => evidence.evidenceId)
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Status: {contact.status}</dd>
          </div>
          <div>
            <dt>Last interaction</dt>
            <dd>Last interaction: {contact.lastInteraction.summary}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

function MockOnlyExecutionChecks({
  contact,
  provenance,
}: {
  contact: ContactDetail;
  provenance: ContactDetailTagStatusProvenance;
}) {
  const databaseReads =
    provenance.databaseReadExecuted === false &&
    contact.databaseReadExecuted === false
      ? "false"
      : "unexpected true";
  const auditLogWrites =
    provenance.productionAuditLogWriteExecuted === false &&
    contact.productionAuditLogWriteExecuted === false
      ? "false"
      : "unexpected true";
  const persistenceWrites =
    provenance.databaseWriteExecuted === false &&
    contact.databaseWriteExecuted === false &&
    contact.tagWriteExecuted === false &&
    contact.statusWriteExecuted === false &&
    contact.noteWriteExecuted === false
      ? "false"
      : "unexpected true";

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Database reads</dt>
        <dd>
          <code>{databaseReads}</code>
        </dd>
      </div>
      <div>
        <dt>Audit log writes</dt>
        <dd>
          <code>{auditLogWrites}</code>
        </dd>
      </div>
      <div>
        <dt>Persistence writes</dt>
        <dd>
          <code>{persistenceWrites}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ContactDetailTagStatusPayload;
}) {
  const contact = payload.contact;
  const databaseReads =
    payload.provenance.databaseReadExecuted === false ? "false" : "true";
  const auditLogWrites =
    payload.provenance.productionAuditLogWriteExecuted === false
      ? "false"
      : "true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Detail edits stay fixture-backed"
    >
      <p className="type-body">
        Scan this first: the detail panel keeps source evidence beside tags,
        status, notes, and last interaction metadata while persistence and audit
        execution flags remain false.
      </p>
      <dl
        aria-label="Contact detail operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Contact represented</dt>
          <dd>{contact ? contact.displayName : "No contact selected"}.</dd>
        </div>
        <div>
          <dt>Edit controls represented</dt>
          <dd>
            {CONTACT_DETAIL_TAG_OPTIONS.length} tags and{" "}
            {CONTACT_DETAIL_STATUS_OPTIONS.length} statuses are exposed from the
            contract.
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            database reads {databaseReads}; audit log writes {auditLogWrites}.
          </dd>
        </div>
        <div>
          <dt>Verifier note</dt>
          <dd>
            Browser smoke should judge API envelopes and rendered states; live
            persistence stays outside this mock.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ContactDetailEditPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Relationship workspace"
      title="Edit contact tags and status with context"
    >
      <p className="type-body">
        This boundary applies deterministic local rules to a fixture contact so
        the detail panel can show tag editing, status changes, notes, and last
        interaction metadata before live persistence exists.
      </p>
      <form
        action="/api/contacts/demo-contact-1"
        aria-label="Mock contact detail tag and status edit form"
        className="control-stack"
        method="post"
      >
        <Field label="Status" helper="No live contact store is written.">
          <select name="status" defaultValue="active">
            <option value="active">Active</option>
            <option value="needs_follow_up">Needs follow-up</option>
            <option value="nurture">Nurture</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <Field label="Add tag" helper="Local fixture tag options only.">
          <select name="addTags" defaultValue="topic:venture-ecosystem">
            <option value="topic:venture-ecosystem">
              topic:venture-ecosystem
            </option>
            <option value="topic:storage-pilots">topic:storage-pilots</option>
            <option value="priority:warm-follow-up">
              priority:warm-follow-up
            </option>
          </select>
        </Field>
        <Field label="Note" helper="Stored only in the deterministic response.">
          <textarea
            name="note"
            defaultValue="Confirmed partner review context before changing status."
            rows={3}
          />
        </Field>
        <button className="primary-action" type="submit">
          Preview mock update
        </button>
      </form>
      <div className="chip-row" aria-label="Contact detail guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="privacy">no live persistence</Chip>
        <Chip tone="confirmation">status context</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Contact detail tag and status API probe actions"
    >
      <p className="type-body">
        These probes exercise detail read, deterministic patch, empty, pending,
        and controlled failure paths inside the contact detail tag and status
        mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run contact detail API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run detail probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run empty contact detail API probe"
          method="get"
        >
          <input name="scenario" type="hidden" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run pending contact detail API probe"
          method="get"
        >
          <input name="scenario" type="hidden" value="pending" />
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1?scenario=failure"
          aria-label="Run controlled failure contact detail API probe"
          method="get"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function ContactDetailTagAndStatusMockDemo() {
  const contactDetailService = createMockContactDetailTagStatusService();
  const successState = contactDetailService.getContactDetail({
    contactId: "demo-contact-1",
  });
  const updatedState = contactDetailService.updateContactDetail({
    addTags: ["topic:venture-ecosystem"],
    contactId: "demo-contact-1",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-06-25T18:45:00.000Z",
      summary: "Operator confirmed the venture ecosystem follow-up path.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Confirmed partner review context before changing status.",
    },
    removeTags: ["event:climate-founders-dinner"],
    status: "active",
  });
  const emptyState = contactDetailService.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "empty",
  });
  const pendingState = contactDetailService.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "pending",
  });
  const failureState = contactDetailService.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "failure",
  });
  const successPayload = successState.success ? successState.data : null;
  const updatedPayload = updatedState.success ? updatedState.data : null;

  return (
    <WorkbenchFrame className="contact-detail-tag-status-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Contact detail tag and status mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for understanding one relationship, why it
            exists, what context created it, and which tag, status, note, or
            last-interaction update is sensible before live persistence exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <ContactDetailEditPanel />

        <section
          className="workbench-grid"
          aria-label="Contact detail tag and status states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG}
            title="Success state"
          >
            {successPayload?.contact && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ContactDetailSummary contact={successPayload.contact} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No selected contact" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Contact</dt>
                    <dd>No contact detail is selected.</dd>
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
                    <dt>Detail status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Contact</dt>
                    <dd>Detail rendering waits for local fixture review.</dd>
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
          eyebrow="Detail evidence"
          title="Relationship detail stays explainable"
        >
          {successPayload?.contact && (
            <>
              <p className="type-body">
                The selected contact keeps tags, status, notes, last interaction
                metadata, source, evidence ids, and a next action together.
              </p>
              <TagChips contact={successPayload.contact} />
              <ContactDetailEvidenceRows contact={successPayload.contact} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock edit"
          title="Rule-based tag and status changes are deterministic"
        >
          {updatedPayload?.contact && (
            <>
              <p className="type-body">{updatedPayload.updateSummary}</p>
              <div className="chip-row" aria-label="Updated contact tags">
                {updatedPayload.contact.tags.map((tag) => (
                  <Chip key={tag} tone="confirmation">
                    {tag}
                  </Chip>
                ))}
              </div>
              <ContactDetailSummary contact={updatedPayload.contact} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No live persistence happens in the mock"
        >
          {successPayload?.contact && (
            <>
              <p className="privacy-note">
                The mock sets contact persistence writes, production audit log
                writes, external network requests, AI calls, calendar/email
                requests, and notifications to false.
              </p>
              <MockOnlyExecutionChecks
                contact={successPayload.contact}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Contact detail route uses shared envelopes"
        >
          <p className="type-body">
            The declared probes cover detail read and patch routes. Empty,
            pending, validation, and controlled failure probes document
            non-success product states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS
                      .CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Contact detail tag and status API probes"
          >
            {contactDetailApiProbes.map((probe) => (
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
                Live service and provider files, switch mechanism, required
                env vars and permissions, privacy and provenance constraints,
                and replacement tests are documented before live providers are
                wired.
              </dd>
            </div>
          </dl>
          <div
            className="chip-row"
            aria-label="Contact detail live handoff excerpts"
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
