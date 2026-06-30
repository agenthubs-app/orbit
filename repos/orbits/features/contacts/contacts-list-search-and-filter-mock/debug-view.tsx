/**
 * 联系人列表搜索和筛选 mock 的开发者面板。
 *
 * 这里展示 query、标签、来源、价值和状态筛选如何影响本地联系人列表。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import {
  CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS,
  type ContactListItem,
  type ContactsListSearchPayload,
  type ContactsListSearchProvenance,
} from "../contract";
import { createMockContactsListSearchAndFilterService } from "../mock-service";

export const CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG =
  "contacts-list-search-and-filter-mock";

const liveImplementationNotesPath =
  "features/contacts/contacts-list-search-and-filter-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.contacts-list-search-filter-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.contacts-list-search-filter-workbench .workbench-shell,
.contacts-list-search-filter-workbench .workbench-surface,
.contacts-list-search-filter-workbench .workbench-grid,
.contacts-list-search-filter-workbench .relationship-meta,
.contacts-list-search-filter-workbench .control-stack,
.contacts-list-search-filter-workbench .chip-row,
.contacts-list-search-filter-workbench .button-row,
.contacts-list-search-filter-workbench form {
  min-width: 0;
}

.contacts-list-search-filter-workbench input,
.contacts-list-search-filter-workbench select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.contacts-list-search-filter-workbench code,
.contacts-list-search-filter-workbench dd,
.contacts-list-search-filter-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.contacts-list-search-filter-workbench .chip-row,
.contacts-list-search-filter-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.contacts-list-search-filter-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.contacts-list-search-filter-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.contacts-list-search-filter-workbench .contact-evidence-list {
  display: grid;
  gap: var(--orbit-space-md);
}

.contacts-list-search-filter-workbench .contact-evidence-row {
  border-top: 1px solid var(--orbit-color-border);
  min-width: 0;
  padding-top: var(--orbit-space-md);
}

.contacts-list-search-filter-workbench .contact-evidence-row:first-child {
  border-top: 0;
  padding-top: 0;
}
`;

const contactsApiProbes = [
  {
    label: "List contacts",
    command: "GET /api/contacts",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source-backed contact list rows.",
  },
  {
    label: "Search contacts",
    command: "POST /api/contacts/search",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with local text search results.",
  },
  {
    label: "Filtered list",
    command:
      "GET /api/contacts?tag=topic:storage-pilots&source=manual&status=needs_follow_up",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a rule-filtered contact result.",
  },
  {
    label: "Empty contacts list",
    command: "GET /api/contacts?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no contact rows.",
  },
  {
    label: "Pending contacts list",
    command: "GET /api/contacts?scenario=pending",
    expectedStatus: 200,
    expectation: "Expect 200 pending envelope while fixture review waits.",
  },
  {
    label: "Controlled failure",
    command: "POST /api/contacts/search?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/contacts/contacts-list-search-and-filter-mock/.",
  "ORBIT_CONTACTS_PROVIDER switches from mock to live.",
  "Live replacement wires a search indexing service and contact database queries behind the same service interface.",
  "Contact list rows preserve source evidence, relationship context, value scoring, and follow-up rationale.",
  "Replacement tests cover list, search, tag/source/value/status filters, empty, pending, unsupported filter, and provider failure paths.",
] as const;

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Contacts list evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ContactSummary({ contacts }: { contacts: readonly ContactListItem[] }) {
  return (
    <dl className="relationship-meta">
      {contacts.map((contact) => (
        <div key={contact.id}>
          <dt>{contact.displayName}</dt>
          <dd>
            {contact.role} at {contact.organization}.{" "}
            {contact.relationshipContext} Next: {contact.nextAction}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function readableSourceType(sourceType: ContactListItem["source"]["type"]) {
  switch (sourceType) {
    case "business_card_ocr":
      return "Business card OCR";
    case "calendar_signal":
      return "Calendar signal";
    case "email_signal":
      return "Email signal";
    case "event_import":
      return "Event import";
    case "external_contacts":
      return "External contacts";
    case "manual":
      return "Manual note";
    case "qr_scan":
      return "QR scan";
    case "referral":
      return "Referral";
    default:
      return sourceType;
  }
}

function ContactEvidenceRows({
  contacts,
}: {
  contacts: readonly ContactListItem[];
}) {
  return (
    <div className="contact-evidence-list">
      {contacts.map((contact) => (
        <article
          aria-label={`Contact row evidence for ${contact.displayName}`}
          className="relationship-record contact-evidence-row"
          key={contact.id}
        >
          <header>
            <p className="type-caption">
              {`Contact row evidence for ${contact.displayName}`}
            </p>
            <h3 className="relationship-name">{contact.displayName}</h3>
            <p className="type-caption">
              {contact.role} at {contact.organization}
            </p>
          </header>
          <dl className="relationship-meta">
            <div>
              <dt>Source</dt>
              <dd>Source: {readableSourceType(contact.source.type)}</dd>
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
              <dt>Relationship value</dt>
              <dd>
                Value score: {contact.value.score}. {contact.value.rationale}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Status: {contact.status}</dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>Next action: {contact.nextAction}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function TagChips({ contacts }: { contacts: readonly ContactListItem[] }) {
  const tags = Array.from(new Set(contacts.flatMap((contact) => contact.tags)));

  return (
    <div className="chip-row" aria-label="Contacts list tag filters">
      {tags.map((tag) => (
        <Chip key={tag} tone="confirmation">
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  contacts,
  provenance,
}: {
  contacts: readonly ContactListItem[];
  provenance: ContactsListSearchProvenance;
}) {
  const searchIndex =
    provenance.searchIndexReadExecuted === false &&
    contacts.every((contact) => contact.searchIndexReadExecuted === false)
      ? "false"
      : "unexpected true";
  const databaseQueries =
    provenance.databaseQueryExecuted === false &&
    contacts.every((contact) => contact.databaseQueryExecuted === false)
      ? "false"
      : "unexpected true";
  const providerRequests =
    provenance.externalNetworkRequested === false &&
    provenance.aiProviderRequested === false &&
    contacts.every(
      (contact) =>
        contact.externalNetworkRequested === false &&
        contact.aiProviderRequested === false &&
        contact.calendarProviderRequested === false &&
        contact.emailProviderRequested === false &&
        contact.notificationDelivered === false,
    )
      ? "false"
      : "unexpected true";

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Search index</dt>
        <dd>
          <code>{searchIndex}</code>
        </dd>
      </div>
      <div>
        <dt>Database queries</dt>
        <dd>
          <code>{databaseQueries}</code>
        </dd>
      </div>
      <div>
        <dt>External requests</dt>
        <dd>
          <code>{providerRequests}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ContactsListSearchPayload;
}) {
  const searchIndex =
    payload.provenance.searchIndexReadExecuted === false ? "false" : "true";
  const databaseQueries =
    payload.provenance.databaseQueryExecuted === false ? "false" : "true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Search and filters are fixture-backed"
    >
      <p className="type-body">
        Scan this first: contact rows carry source evidence, relationship
        context, value scoring, and follow-up rationale while live execution
        flags remain false.
      </p>
      <dl
        aria-label="Contacts list operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Contacts represented</dt>
          <dd>{payload.contacts.length} source-backed contacts.</dd>
        </div>
        <div>
          <dt>Filters represented</dt>
          <dd>
            Tags, sources, relationship value, and status filters are exposed
            from the contract.
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            search index {searchIndex}; database queries {databaseQueries}.
          </dd>
        </div>
        <div>
          <dt>Verifier note</dt>
          <dd>
            Browser smoke should judge API envelopes and rendered states; live
            search and persistence stay outside this mock.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function ContactsSearchPanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Relationship workspace"
      title="Search contacts with source context"
    >
      <p className="type-body">
        This boundary uses deterministic fixtures and local rules to search the
        contact list by name, organization, relationship context, tags, value,
        source, and status.
      </p>
      <form
        action="/api/contacts"
        aria-label="Mock contacts list filter form"
        className="control-stack"
        method="get"
      >
        <Field label="Search" helper="Local fixture search only.">
          <input
            name="query"
            placeholder="Try storage or venture ecosystem"
            type="search"
          />
        </Field>
        <Field label="Source" helper="No live contact store is read.">
          <select name="source" defaultValue="">
            <option value="">All sources</option>
            <option value="manual">Manual note</option>
            <option value="external_contacts">External contacts</option>
            <option value="email_signal">Email signal</option>
            <option value="event_import">Event import</option>
          </select>
        </Field>
        <Field label="Status" helper="Relationship operating status.">
          <select name="status" defaultValue="">
            <option value="">All statuses</option>
            <option value="needs_follow_up">Needs follow-up</option>
            <option value="active">Active</option>
            <option value="nurture">Nurture</option>
          </select>
        </Field>
        <button className="primary-action" type="submit">
          Search contact list
        </button>
      </form>
      <div className="chip-row" aria-label="Contacts list guardrails">
        <Chip tone="evidence">source evidence</Chip>
        <Chip tone="privacy">no live persistence</Chip>
        <Chip tone="confirmation">follow-up context</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Contacts list search and filter API probe actions"
    >
      <p className="type-body">
        These probes exercise list, search, filtered, empty, pending, and
        controlled failure paths inside the contacts list search and filter mock
        boundary.
      </p>
      <div className="button-row">
        <form action="/api/contacts" aria-label="Run contacts list API probe" method="get">
          <button className="secondary-action" type="submit">
            Run list probe
          </button>
        </form>
        <form
          action="/api/contacts"
          aria-label="Run empty contacts list API probe"
          method="get"
        >
          <input name="scenario" type="hidden" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contacts"
          aria-label="Run pending contacts list API probe"
          method="get"
        >
          <input name="scenario" type="hidden" value="pending" />
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contacts/search?scenario=failure"
          aria-label="Run controlled failure contacts search API probe"
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

export function ContactsListSearchAndFilterMockDemo() {
  const contactsService = createMockContactsListSearchAndFilterService();
  const successState = contactsService.listContacts();
  const filteredState = contactsService.searchContacts({
    tagFilters: ["topic:storage-pilots"],
    valueFilters: ["commercial_opportunity"],
  });
  const emptyState = contactsService.listContacts({ scenario: "empty" });
  const pendingState = contactsService.listContacts({ scenario: "pending" });
  const failureState = contactsService.searchContacts({ scenario: "failure" });
  const successPayload = successState.success ? successState.data : null;
  const filteredPayload = filteredState.success ? filteredState.data : null;

  return (
    <WorkbenchFrame className="contacts-list-search-filter-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Contacts list search and filter mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for reviewing who Orbit knows, why the
            relationship exists, which context created it, and what follow-up
            action is sensible before live search or persistence exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <ContactsSearchPanel />

        <section
          className="workbench-grid"
          aria-label="Contacts list search and filter states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG}
            title="Success state"
          >
            {successPayload && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Contacts represented</dt>
                    <dd>{successPayload.contacts.length} contacts.</dd>
                  </div>
                  <div>
                    <dt>Available filters</dt>
                    <dd>
                      {successPayload.availableFilters.tags.length} tags,{" "}
                      {successPayload.availableFilters.sources.length} sources,{" "}
                      {successPayload.availableFilters.values.length} values,
                      and{" "}
                      {successPayload.availableFilters.statuses.length} statuses.
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
                    <dt>Contacts</dt>
                    <dd>No contact rows are available for review.</dd>
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
                    <dt>Search status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Contacts</dt>
                    <dd>List rendering waits for local fixture review.</dd>
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
          eyebrow="Relationship rows"
          title="Contact list rows stay explainable"
        >
          {successPayload && (
            <>
              <p className="type-body">
                Each contact keeps source, evidence, relationship context, value
                scoring, status, and a next action beside the row.
              </p>
              <TagChips contacts={successPayload.contacts} />
              <ContactEvidenceRows contacts={successPayload.contacts} />
              <ContactSummary contacts={successPayload.contacts} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Filtered review"
          title="Rule-based filters are deterministic"
        >
          {filteredPayload && (
            <>
              <p className="type-body">{filteredPayload.summary}</p>
              <div className="chip-row" aria-label="Selected value filters">
                <Chip tone="confirmation">topic:storage-pilots</Chip>
                <Chip tone="confirmation">referral_path</Chip>
                <Chip tone="confirmation">commercial_opportunity</Chip>
              </div>
              <ContactSummary contacts={filteredPayload.contacts} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No live lookup happens in the mock"
        >
          {successPayload && (
            <>
              <p className="privacy-note">
                The mock sets search index reads, database queries, external
                network requests, AI calls, calendar/email requests, and
                notifications to false.
              </p>
              <MockOnlyExecutionChecks
                contacts={successPayload.contacts}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Contact routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover contact list and search routes. Empty and
            controlled failure probes document non-success product states
            without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    CONTACTS_LIST_SEARCH_FILTER_ERROR_DEFINITIONS
                      .CONTACTS_LIST_SEARCH_FILTER_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Contacts list search and filter API probes"
          >
            {contactsApiProbes.map((probe) => (
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
          <div className="chip-row" aria-label="Contacts live handoff excerpts">
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
