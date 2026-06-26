import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS,
  type ExternalContactCandidate,
  type ExternalContactDraft,
  type ExternalContactsImportPayload,
  type ExternalContactsImportProvenance,
  type ExternalContactsSourceSummary,
} from "../external-import-contract";
import { createMockExternalContactsImportService } from "../mock-external-import-service";

export const EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG =
  "external-contacts-import-mock";

const liveImplementationNotesPath =
  "features/acquisition/external-contacts-import-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.external-contacts-import-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.external-contacts-import-workbench .workbench-shell,
.external-contacts-import-workbench .workbench-surface,
.external-contacts-import-workbench .workbench-grid,
.external-contacts-import-workbench .relationship-meta,
.external-contacts-import-workbench .control-stack,
.external-contacts-import-workbench .chip-row,
.external-contacts-import-workbench .button-row,
.external-contacts-import-workbench form {
  min-width: 0;
}

.external-contacts-import-workbench input,
.external-contacts-import-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.external-contacts-import-workbench code,
.external-contacts-import-workbench dd,
.external-contacts-import-workbench .orbit-chip,
.external-contacts-import-workbench .source-list li {
  overflow-wrap: anywhere;
}

.external-contacts-import-workbench .chip-row,
.external-contacts-import-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.external-contacts-import-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.external-contacts-import-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}
`;

const externalContactsApiProbes = [
  {
    label: "Import external drafts",
    command: "POST /api/contact-drafts/external/import",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source-backed external contact drafts.",
  },
  {
    label: "Read external candidates",
    command: "GET /api/contact-drafts/external/candidates",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with phone, Google Contacts, CSV, and customer-list candidates.",
  },
  {
    label: "Empty external candidates",
    command: "GET /api/contact-drafts/external/candidates?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no source candidates.",
  },
  {
    label: "Empty external import",
    command: "POST /api/contact-drafts/external/import?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no staged drafts.",
  },
  {
    label: "Pending external import",
    command: "POST /api/contact-drafts/external/import?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope with no staged drafts.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contact-drafts/external/import?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED context.",
  },
  {
    label: "Controlled candidate failure",
    command: "GET /api/contact-drafts/external/candidates?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/acquisition/external-contacts-import-mock/.",
  "ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER switches from mock to live.",
  "Live replacement requires phone address book, Google Contacts, CSV, and existing customer-list permissions.",
  "Contact writes remain behind review, provenance, and confirmation tests.",
  "Replacement tests cover candidates, import, empty, pending, unsupported source, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="External contacts import evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceCoverageChips({
  sources,
}: {
  sources: readonly ExternalContactsSourceSummary[];
}) {
  return (
    <div className="chip-row" aria-label="Source coverage">
      {sources.map((source) => (
        <Chip key={source.kind} tone="confirmation">
          {source.label}
        </Chip>
      ))}
    </div>
  );
}

function CandidateSummary({
  candidates,
}: {
  candidates: readonly ExternalContactCandidate[];
}) {
  return (
    <dl className="relationship-meta">
      {candidates.map((candidate) => (
        <div key={candidate.candidateId}>
          <dt>{candidate.displayName}</dt>
          <dd>
            {candidate.role} at {candidate.organization}.{" "}
            {candidate.relationshipContext}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DraftSummary({
  drafts,
}: {
  drafts: readonly ExternalContactDraft[];
}) {
  return (
    <dl className="relationship-meta">
      {drafts.map((draft) => (
        <div key={draft.id}>
          <dt>{draft.displayName}</dt>
          <dd>
            <code>{draft.id}</code> from <code>{draft.sourceKind}</code>.{" "}
            <code>contactWriteExecuted</code>,{" "}
            <code>providerSyncRequested</code>, and{" "}
            <code>productionImportJobEnqueued</code> remain{" "}
            <code>{String(draft.contactWriteExecuted)}</code>.
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  drafts,
  provenance,
}: {
  drafts: readonly ExternalContactDraft[];
  provenance: ExternalContactsImportProvenance;
}) {
  const allProviderSyncBlocked =
    provenance.googleContactsSyncExecuted === false &&
    drafts.every((draft) => draft.providerSyncRequested === false);
  const allContactWritesBlocked =
    provenance.databaseWriteExecuted === false &&
    drafts.every((draft) => draft.contactWriteExecuted === false);
  const allProductionJobsBlocked = drafts.every(
    (draft) => draft.productionImportJobEnqueued === false,
  );

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Phone address book read</dt>
        <dd>
          <code>{String(provenance.phoneAddressBookReadExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>Google Contacts sync</dt>
        <dd>
          <code>{allProviderSyncBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>CSV scale parse</dt>
        <dd>
          <code>{String(provenance.csvParsedAtScale)}</code>
        </dd>
      </div>
      <div>
        <dt>Customer-list job</dt>
        <dd>
          <code>{String(provenance.customerListJobExecuted)}</code>
        </dd>
      </div>
      <div>
        <dt>Contact writes</dt>
        <dd>
          <code>{allContactWritesBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
      <div>
        <dt>Production jobs</dt>
        <dd>
          <code>{allProductionJobsBlocked ? "false" : "unexpected true"}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ExternalContactsImportPayload;
}) {
  const sourceLabels = payload.sources.map((source) => source.label).join(", ");
  const providerSync =
    payload.provenance.googleContactsSyncExecuted === false &&
    payload.contactDrafts.every((draft) => draft.providerSyncRequested === false)
      ? "false"
      : "unexpected true";
  const contactWrites = payload.contactDrafts.every(
    (draft) => draft.contactWriteExecuted === false,
  )
    ? "false"
    : "unexpected true";
  const productionJobs = payload.contactDrafts.every(
    (draft) => draft.productionImportJobEnqueued === false,
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
        Scan this first: the fixture covers phone, Google Contacts, CSV, and
        customer-list candidates while every live execution flag remains false.
      </p>
      <dl
        aria-label="External contacts operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Sources</dt>
          <dd>{sourceLabels}</dd>
        </div>
        <div>
          <dt>Drafts staged</dt>
          <dd>{payload.contactDrafts.length} external drafts.</dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            provider sync {providerSync}; contact writes {contactWrites};
            production jobs {productionJobs}.
          </dd>
        </div>
        <div>
          <dt>Verifier note</dt>
          <dd>
            Browser smoke should judge API envelopes and rendered states;
            device, provider, parser, and job execution stay outside the mock.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ExternalImportPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Phone address book fixture"
      title="Local external import"
    >
      <p className="type-body">
        This boundary reads deterministic source fixtures and stages potential
        contact drafts without reading a device address book, syncing a provider,
        parsing large files, or starting a production import job.
      </p>
      <form
        action="/api/contact-drafts/external/import"
        aria-label="Mock external contacts import form"
        className="control-stack"
        method="post"
      >
        <Field label="Source" helper="The demo route uses local fixtures.">
          <select name="sourceKind" defaultValue="">
            <option value="">All external sources</option>
            <option value="phone">Phone contacts</option>
            <option value="google_contacts">Google Contacts</option>
            <option value="csv">CSV upload</option>
            <option value="existing_customer_list">
              Existing customer list
            </option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Stage external drafts
        </button>
      </form>
      <div className="chip-row" aria-label="External contacts import guardrails">
        <Chip tone="evidence">fixture sources</Chip>
        <Chip tone="privacy">no provider sync</Chip>
        <Chip tone="confirmation">review before write</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="External contacts import API probe actions"
    >
      <p className="type-body">
        These probes exercise candidates, import, empty, pending, and controlled
        failure paths inside the external contacts import mock boundary.
      </p>
      <div className="button-row">
        <form
          action="/api/contact-drafts/external/import"
          aria-label="Run external contacts import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run import probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/external/import?scenario=empty"
          aria-label="Run empty external contacts import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/external/import?scenario=pending"
          aria-label="Run pending external contacts import API probe"
          method="post"
        >
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contact-drafts/external/import?scenario=failure"
          aria-label="Run controlled failure external contacts import API probe"
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

export function ExternalContactsImportMockDemo() {
  const externalService = createMockExternalContactsImportService();
  const candidatesState = externalService.listExternalContactCandidates();
  const successState = externalService.importExternalContacts();
  const emptyState = externalService.importExternalContacts({
    scenario: "empty",
  });
  const pendingState = externalService.importExternalContacts({
    scenario: "pending",
  });
  const failureState = externalService.importExternalContacts({
    scenario: "failure",
  });
  const candidatesPayload = candidatesState.success
    ? candidatesState.data
    : null;
  const successPayload = successState.success ? successState.data : null;

  return (
    <WorkbenchFrame className="external-contacts-import-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>External contacts import mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for turning phone, Google Contacts, CSV, and
            existing customer-list candidates into source-backed contact drafts
            before any live provider or production import path exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <ExternalImportPanel />

        <section
          className="workbench-grid"
          aria-label="External contacts import states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Sources</dt>
                    <dd>{successPayload.sources.length} sources represented.</dd>
                  </div>
                  <div>
                    <dt>Potential contact drafts</dt>
                    <dd>{successPayload.contactDrafts.length} drafts staged.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No source rows" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Candidates</dt>
                    <dd>No external contacts are available for review.</dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>No external contact drafts are staged.</dd>
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
                    <dt>Import status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>Draft staging waits for local source review.</dd>
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
          eyebrow="Source coverage"
          title="External sources remain explainable"
        >
          {candidatesPayload && (
            <>
              <p className="type-body">
                Each candidate carries source, evidence, and relationship
                context so import review starts from why the connection exists.
              </p>
              <SourceCoverageChips sources={candidatesPayload.sources} />
              <CandidateSummary candidates={candidatesPayload.candidates} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Potential contact drafts"
          title="No contact write happens in the mock"
        >
          {successPayload && (
            <>
              <DraftSummary drafts={successPayload.contactDrafts} />
              <p className="privacy-note">
                The mock sets provider sync, phone reads, CSV scale parsing,
                customer-list jobs, contact writes, notifications, and database
                writes to false.
              </p>
              <MockOnlyExecutionChecks
                drafts={successPayload.contactDrafts}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="External contact routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover external import and candidate read routes.
            Empty and controlled failure probes document non-success product
            states without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS
                      .EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="External contacts import API probes"
          >
            {externalContactsApiProbes.map((probe) => (
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
          title="Replacement notes stay with the external import capability"
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
                <code>ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER</code>
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
