/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import type {
  ContactListItem,
  ContactsListSearchFilterInput,
  ContactsListSearchPayload,
  ContactsListSearchResult,
} from "../../../../../features/contacts/contract";
import { Chip, Field, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";
import { createAppContactsListSearchAndFilterService } from "./contacts-service-factory";

const appContactsStyles = `
.app-contacts-route {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-contacts-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-contacts-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-contacts-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-contacts-route,
.app-contacts-route .workbench-surface,
.app-contacts-route .relationship-meta,
.app-contacts-route .chip-row,
.app-contacts-route .contacts-ledger,
.app-contacts-route .contacts-filter-grid,
.app-contacts-route .contacts-card-grid,
.app-contacts-route .contacts-queue-grid {
  min-width: 0;
}

.app-contacts-route .contacts-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-contacts-route .contacts-ledger,
.app-contacts-route .contacts-filter-grid,
.app-contacts-route .contacts-card-grid,
.app-contacts-route .contacts-queue-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-route .contacts-queue-card,
.app-contacts-route .contacts-ledger div,
.app-contacts-route .contacts-card,
.app-contacts-route .contacts-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-route .contacts-queue {
  border-left: 4px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-queue-card {
  border-top: 3px solid var(--orbit-color-primary);
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-contacts-route .contacts-card,
.app-contacts-route .contacts-action-result {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-card header {
  display: grid;
  gap: 6px;
}

.app-contacts-route .contacts-person-link,
.app-contacts-route .contacts-detail-link {
  color: var(--orbit-color-text);
  font-weight: 800;
  text-decoration-color: var(--orbit-color-primary);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.app-contacts-route .contacts-detail-link {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  line-height: 1.3;
  padding: 7px 10px;
  width: fit-content;
}

.app-contacts-route details {
  border-top: 1px solid var(--orbit-color-border);
  padding-top: var(--orbit-space-xs);
}

.app-contacts-route summary {
  color: var(--orbit-color-muted);
  cursor: pointer;
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.app-contacts-route .contacts-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-search-form,
.app-contacts-route .contacts-review-form {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-review-form {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-route .contacts-search-form button,
.app-contacts-route .contacts-review-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

.app-contacts-route .contacts-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contacts-route .contacts-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  padding: 6px 10px;
  text-decoration: none;
}

.app-contacts-route .contacts-recovery-actions {
  align-items: center;
}
`;

const routeStateChecks = [
  {
    href: "/app/contacts?scenario=empty",
    label: "No contacts found",
  },
  {
    href: "/app/contacts?scenario=pending",
    label: "Still checking sources",
  },
  {
    href: "/app/contacts?scenario=failure",
    label: "List unavailable",
  },
] as const;

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/contacts",
      label: "Show all sourced contacts",
    },
    {
      href: "/app/contacts?query=storage",
      label: "Try storage filter",
    },
  ],
  failure: [
    {
      href: "/app/contacts",
      label: "Reload contacts list",
    },
    {
      href: "/app/contacts?scenario=pending",
      label: "Check source status",
    },
  ],
  pending: [
    {
      href: "/app/contacts",
      label: "Return to available contacts",
    },
  ],
};

const contactsActionSafetySummary =
  "OUTSIDE ACCOUNTS CONTACTED: none / CONTACT RECORD CHANGED: no / MESSAGE SENT: no / NOTIFICATION SENT: no / SEARCH INDEX READ: no / DATABASE QUERY EXECUTED: no";

type AppContactsSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type SourceType = ContactListItem["source"]["type"];
type StatusType = ContactListItem["status"];
type ValueType = ContactListItem["value"]["valueTypes"][number];

export interface AppContactsCommandCenterProps {
  searchParams?: AppContactsSearchParams;
}

function readSearchParam(
  searchParams: AppContactsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readSearchParamList(
  searchParams: AppContactsSearchParams | undefined,
  key: string,
): readonly string[] {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean)),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function readRouteScenario(
  searchParams: AppContactsSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function readContactsInput(
  searchParams: AppContactsSearchParams | undefined,
): ContactsListSearchFilterInput {
  return {
    query: readSearchParam(searchParams, "query"),
    sourceFilters: readSearchParamList(searchParams, "source"),
    statusFilters: readSearchParamList(searchParams, "status"),
    tagFilters: readSearchParamList(searchParams, "tag"),
    valueFilters: readSearchParamList(searchParams, "value"),
  };
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function evidenceFromContactsResult(
  result: ContactsListSearchResult,
): string[] {
  if (result.success === false) {
    return [result.error.code];
  }

  return Array.from(result.data.provenance.evidenceIds);
}

function sourceLabel(sourceType: SourceType): string {
  const labels: Record<SourceType, string> = {
    business_card_ocr: "Business card OCR",
    calendar_signal: "Calendar signal",
    email_signal: "Email signal",
    event_import: "Event import",
    external_contacts: "External contacts",
    manual: "Manual note",
    qr_scan: "QR scan",
    referral: "Referral",
  };

  return labels[sourceType];
}

function statusLabel(status: StatusType): string {
  const labels: Record<StatusType, string> = {
    active: "Active",
    archived: "Archived",
    needs_follow_up: "Needs follow-up",
    nurture: "Nurture",
  };

  return labels[status];
}

function valueLabel(valueType: ValueType): string {
  const labels: Record<ValueType, string> = {
    commercial_opportunity: "Commercial opportunity",
    community_context: "Community context",
    knowledge_exchange: "Knowledge exchange",
    referral_path: "Referral path",
    strategic_fit: "Strategic fit",
  };

  return labels[valueType];
}

function listSummary(payload: ContactsListSearchPayload): string {
  if (payload.contacts.length === 0) {
    return "No source-backed contacts matched the current local search and filter rules.";
  }

  if (
    payload.appliedFilters.query ||
    payload.provenance.generationMethod ===
      "rule-based-contacts-list-search-filter"
  ) {
    return `${formatCount(payload.contacts.length, "source-backed contact")} matched the current local search and filter rules.`;
  }

  return `${formatCount(payload.contacts.length, "source-backed contact")} are available from manual, external, email, and event evidence.`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function externalServicesContacted(contact: ContactListItem): boolean {
  return (
    contact.externalNetworkRequested ||
    contact.aiProviderRequested ||
    contact.calendarProviderRequested ||
    contact.emailProviderRequested ||
    contact.notificationDelivered
  );
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 5).map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ValueChips({ contact }: { contact: ContactListItem }) {
  return (
    <div
      aria-label={`${contact.displayName} relationship value tags`}
      className="chip-row"
    >
      {contact.value.valueTypes.map((valueType) => (
        <Chip key={`${contact.id}:${valueType}`} tone="confirmation">
          {valueLabel(valueType)}
        </Chip>
      ))}
    </div>
  );
}

function contactDetailHref(contact: ContactListItem): string {
  if (contact.displayName === "Kenji Watanabe") {
    return "/app/contacts/demo-contact-1";
  }

  return `/app/contacts/${contact.id.replace(/^contact:/, "")}`;
}

function humanList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function relationshipValueSummary(contact: ContactListItem): string {
  return `${humanList(contact.value.valueTypes.map(valueLabel))}. ${
    contact.value.rationale
  }`;
}

function relationshipContextCopy(contact: ContactListItem): string {
  return contact.relationshipContext.replace(
    "climate founders dinner",
    "Climate founders dinner",
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/contacts?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({ scenario }: { scenario: RouteScenario }) {
  return (
    <nav
      aria-label="Contacts route recovery actions"
      className="contacts-state-links contacts-recovery-actions"
      data-side-effects="none"
    >
      {routeRecoveryActions[scenario].map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const contactsService = createAppContactsListSearchAndFilterService();

  if (scenario === "empty") {
    const emptyState = contactsService.listContacts({ scenario: "empty" });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="Clear the search and filters, or add a contact with source evidence before reviewing follow-up."
          emptyState="No source-backed contact rows are ready for review."
          evidence={evidenceFromContactsResult(emptyState)}
          eyebrow="No contacts"
          guardrail="Orbit cannot create contacts, tasks, messages, or merges from an empty list."
          nextStep={
            emptyState.success
              ? "Clear the search and filters, or add a contact with source evidence before reviewing follow-up."
              : "Reload contacts before reviewing the list."
          }
          purpose="Keep the contacts page useful when no relationship row is reviewable."
          title="No contacts match this view"
        />
        <RouteRecoveryActions scenario={scenario} />
      </RouteStateMarker>
    );
  }

  if (scenario === "pending") {
    const pendingState = contactsService.listContacts({ scenario: "pending" });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="Contact rows stay hidden until their source evidence is ready."
          emptyState="Contact rows stay hidden until source evidence is ready."
          evidence={evidenceFromContactsResult(pendingState)}
          eyebrow="Checking sources"
          guardrail="Checking contacts cannot read a search index, query a database, send messages, or deliver notifications."
          nextStep="Wait for sourced contacts before taking action."
          purpose="Keep the contacts page visible while search and filter state resolves."
          title="Checking contact sources"
        />
        <RouteRecoveryActions scenario={scenario} />
      </RouteStateMarker>
    );
  }

  const failureState = contactsService.searchContacts({ scenario: "failure" });

  return (
    <RouteStateMarker scenario={scenario}>
      <StateView
        description="Contacts list search and filter is unavailable while local source evidence is being checked."
        emptyState="No contact, task, message, notification, database, or outside account changed."
        evidence={
          failureState.success === false
            ? [firstEvidence(failureState.error.evidenceIds)]
            : ["contacts-expected-failure-not-returned"]
        }
        eyebrow="Needs retry"
        guardrail="Retry keeps search, storage, email, calendar, AI, notification, and messaging disconnected."
        nextStep="Reload the contacts list before reviewing follow-up actions."
        purpose="Show a contacts recovery state without side effects."
        title="Contacts could not load"
      />
      <RouteRecoveryActions scenario={scenario} />
    </RouteStateMarker>
  );
}

function ContactsLedger({ payload }: { payload: ContactsListSearchPayload }) {
  const needsFollowUp = payload.contacts.filter(
    (contact) => contact.status === "needs_follow_up",
  ).length;

  return (
    <dl
      aria-label="App contacts composed list summary"
      className="relationship-meta contacts-ledger"
    >
      <div>
        <dt>Known people</dt>
        <dd>
          <strong>{payload.contacts.length}</strong>
          source-backed contacts
        </dd>
      </div>
      <div>
        <dt>Source filters</dt>
        <dd>{formatCount(payload.availableFilters.sources.length, "source")}</dd>
      </div>
      <div>
        <dt>Value tags</dt>
        <dd>{formatCount(payload.availableFilters.values.length, "value tag")}</dd>
      </div>
      <div>
        <dt>Needs attention</dt>
        <dd>{formatCount(needsFollowUp, "contact")}</dd>
      </div>
    </dl>
  );
}

function ContactsSearchForm({ payload }: { payload: ContactsListSearchPayload }) {
  return (
    <form
      action="/app/contacts"
      aria-label="App contacts search and filter form"
      className="contacts-search-form"
      method="get"
    >
      <div className="contacts-filter-grid">
        <Field label="Search" helper="Name, company, context, next action, or tag.">
          <input
            defaultValue={payload.appliedFilters.query}
            name="query"
            placeholder="Try storage or venture ecosystem"
            type="search"
          />
        </Field>
        <Field label="Source" helper="Keep source context beside each person.">
          <select
            defaultValue={payload.appliedFilters.sourceFilters[0] ?? ""}
            name="source"
          >
            <option value="">All sources</option>
            {payload.availableFilters.sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" helper="Relationship operating state.">
          <select
            defaultValue={payload.appliedFilters.statusFilters[0] ?? ""}
            name="status"
          >
            <option value="">All statuses</option>
            {payload.availableFilters.statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button type="submit">Search contact list</button>
    </form>
  );
}

function ContactCard({ contact }: { contact: ContactListItem }) {
  return (
    <article
      aria-label={`Contact relationship row for ${contact.displayName}`}
      className="contacts-card"
    >
      <header>
        <p className="type-caption">{sourceLabel(contact.source.type)}</p>
        <h3 className="relationship-name">{contact.displayName}</h3>
        <p className="type-caption">
          {contact.role} at {contact.organization} · {contact.location}
        </p>
        <a className="contacts-detail-link" href={contactDetailHref(contact)}>
          Open relationship workspace
        </a>
      </header>
      <p className="type-body">{relationshipContextCopy(contact)}</p>
      <dl className="relationship-meta">
        <div>
          <dt>Source context</dt>
          <dd>{sourceLabel(contact.source.type)}</dd>
        </div>
        <div>
          <dt>Relationship status</dt>
          <dd>{statusLabel(contact.status)}</dd>
        </div>
        <div>
          <dt>Relationship value</dt>
          <dd>{relationshipValueSummary(contact)}</dd>
        </div>
        <div>
          <dt>Next safe action</dt>
          <dd>{contact.nextAction}</dd>
        </div>
      </dl>
      <ValueChips contact={contact} />
      <details>
        <summary>Contact evidence details</summary>
        <div aria-label={`${contact.displayName} source tags`} className="chip-row">
          {contact.tags.map((tag) => (
            <Chip key={`${contact.id}:${tag}`} tone="primary">
              {tag}
            </Chip>
          ))}
        </div>
        <EvidenceChips
          evidenceIds={contact.evidence.map((evidence) => evidence.evidenceId)}
          label={`${contact.displayName} contact evidence`}
        />
      </details>
    </article>
  );
}

function ReviewActionResult({
  payload,
  searchParams,
}: {
  payload: ContactsListSearchPayload;
  searchParams: AppContactsSearchParams | undefined;
}) {
  const actionRequested =
    readSearchParam(searchParams, "action") === "review-filtered-contact";

  if (!actionRequested) {
    return null;
  }

  const reviewedContact = payload.contacts[0] ?? null;

  if (!reviewedContact) {
    return (
      <div
        aria-label="App contacts local action result"
        className="contacts-action-result"
        data-action-evidence="contacts-filtered-review-local-preview"
        data-side-effects="none"
        data-task-result="contacts-filtered-review-preview"
      >
        <strong>Filtered review ready: no matching contact</strong>
        <span>Clear the filters before reviewing a relationship action.</span>
        <span>{contactsActionSafetySummary}</span>
        <span>Contact record changed: no</span>
        <span>Message sent: no</span>
        <span>Notification sent: no</span>
        <span>Search index read: no</span>
        <span>Database query executed: no</span>
        <span>Outside services contacted: none</span>
      </div>
    );
  }

  return (
    <div
      aria-label="App contacts local action result"
      className="contacts-action-result"
      data-action-evidence="contacts-filtered-review-local-preview"
      data-side-effects="none"
      data-task-result="contacts-filtered-review-preview"
    >
      <strong>Filtered review ready: {reviewedContact.displayName}</strong>
      <span>{reviewedContact.nextAction}</span>
      <span>{contactsActionSafetySummary}</span>
      <span>Contact record changed: no</span>
      <span>Message sent: no</span>
      <span>Notification sent: no</span>
      <span>
        Search index read: {reviewedContact.searchIndexReadExecuted ? "yes" : "no"}
      </span>
      <span>
        Database query executed:{" "}
        {reviewedContact.databaseQueryExecuted ? "yes" : "no"}
      </span>
      <span>
        Outside services contacted:{" "}
        {externalServicesContacted(reviewedContact) ? "review required" : "none"}
      </span>
      <details>
        <summary>Action source details</summary>
        <span>
          Source evidence:{" "}
          {firstEvidence(reviewedContact.evidence.map((evidence) => evidence.evidenceId))}
        </span>
      </details>
    </div>
  );
}

function AttentionQueueCard({ contact }: { contact: ContactListItem }) {
  return (
    <article
      aria-label={`Current relationship review for ${contact.displayName}`}
      className="contacts-queue-card"
    >
      <div>
        <p className="type-caption">Who needs attention now</p>
        <h3 className="relationship-name">
          <a className="contacts-person-link" href={contactDetailHref(contact)}>
            {contact.displayName}
          </a>
        </h3>
        <p className="type-caption">
          {contact.role} at {contact.organization} · {contact.location}
        </p>
      </div>
      <p className="type-body">Why Kenji matters now: {contact.value.rationale}</p>
      <p className="type-body">
        Source context: {sourceLabel(contact.source.type)} from{" "}
        {relationshipContextCopy(contact)}
      </p>
      <p className="type-body">Next safe action: {contact.nextAction}</p>
    </article>
  );
}

function RelationshipReviewQueue({
  payload,
  searchParams,
}: {
  payload: ContactsListSearchPayload;
  searchParams: AppContactsSearchParams | undefined;
}) {
  const attentionContacts = payload.contacts.filter(
    (contact) => contact.status === "needs_follow_up",
  );
  const queueContacts =
    attentionContacts.length > 0 ? attentionContacts : payload.contacts.slice(0, 1);

  return (
    <WorkbenchSurface
      className="contacts-queue"
      elevated
      eyebrow="People"
      title="Relationship review queue"
    >
      <p className="type-body">
        Start with the person who needs attention now, the reason this
        relationship matters, the source context that created it, and the next
        safe action to prepare.
      </p>
      <div className="contacts-queue-grid">
        {queueContacts.map((contact) => (
          <AttentionQueueCard contact={contact} key={contact.id} />
        ))}
      </div>
      <ContactsLedger payload={payload} />
      <ReviewActionResult payload={payload} searchParams={searchParams} />
    </WorkbenchSurface>
  );
}

function ReviewActionForm() {
  return (
    <form
      action="/app/contacts"
      className="contacts-review-form"
      method="get"
    >
      <div>
        <p className="type-caption">Core contacts action</p>
        <h3 className="relationship-name">Preview a filtered relationship review</h3>
        <p className="type-body">
          This prepares one sourced contact for follow-up review, then stops
          before any contact write, search index read, message, task, or outside
          account change.
        </p>
      </div>
      <input name="action" type="hidden" value="review-filtered-contact" />
      <input name="query" type="hidden" value="storage" />
      <input name="tag" type="hidden" value="topic:storage-pilots" />
      <input name="value" type="hidden" value="commercial_opportunity" />
      <button type="submit">Preview filtered review</button>
    </form>
  );
}

function SuccessBoundary({
  payload,
  searchParams,
}: {
  payload: ContactsListSearchPayload;
  searchParams: AppContactsSearchParams | undefined;
}) {
  return (
    <div data-state-boundary="app-contacts-success">
      <span hidden>Contacts relationship console</span>
      <RelationshipReviewQueue payload={payload} searchParams={searchParams} />
    </div>
  );
}

function SecondaryControls({ payload }: { payload: ContactsListSearchPayload }) {
  return (
    <WorkbenchSurface eyebrow="Controls" title="Find another relationship">
      <ContactsSearchForm payload={payload} />
      <ReviewActionForm />
      <div aria-label="App contacts list health states">
        <h3 className="relationship-name">List health</h3>
        <p className="type-body">
          Check how contacts behaves when the list is empty, still resolving,
          or unavailable.
        </p>
        <nav className="contacts-state-links">
          {routeStateChecks.map((stateCheck) => (
            <a href={stateCheck.href} key={stateCheck.href}>
              {stateCheck.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="privacy-note">
        No search index, database, email, calendar, AI, notification,
        messaging, or external network is contacted from this route.
      </p>
    </WorkbenchSurface>
  );
}

function ContactsListSection({ payload }: { payload: ContactsListSearchPayload }) {
  return (
    <WorkbenchSurface eyebrow="People" title="People in this review">
      <p className="type-body">{listSummary(payload)}</p>
      <div className="contacts-card-grid">
        {payload.contacts.map((contact) => (
          <ContactCard contact={contact} key={contact.id} />
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function FilterVocabulary({ payload }: { payload: ContactsListSearchPayload }) {
  return (
    <WorkbenchSurface eyebrow="Filters" title="Search, source, and value vocabulary">
      <p className="type-body">
        Use these labels to narrow the review without changing contacts or
        contacting outside accounts.
      </p>
      <div aria-label="App contacts value filter labels" className="chip-row">
        {payload.availableFilters.values.map((value) => (
          <Chip key={value.value} tone={value.selected ? "primary" : "confirmation"}>
            {value.label}
          </Chip>
        ))}
      </div>
      <div aria-label="App contacts source filter labels" className="chip-row">
        {payload.availableFilters.sources.map((source) => (
          <Chip key={source.value} tone={source.selected ? "primary" : "privacy"}>
            {source.label}
          </Chip>
        ))}
      </div>
      <details>
        <summary>List evidence details</summary>
        <EvidenceChips
          evidenceIds={payload.provenance.evidenceIds}
          label="App contacts list evidence"
        />
      </details>
    </WorkbenchSurface>
  );
}

export function AppContactsCommandCenter({
  searchParams,
}: AppContactsCommandCenterProps) {
  const contactsService = createAppContactsListSearchAndFilterService();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return (
      <div className="app-contacts-route">
        <style>{appContactsStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const input = readContactsInput(searchParams);
  const actionRequested =
    readSearchParam(searchParams, "action") === "review-filtered-contact";
  const result = actionRequested
    ? contactsService.searchContacts(input)
    : contactsService.listContacts(input);

  if (result.success === false) {
    return (
      <div className="app-contacts-route">
        <style>{appContactsStyles}</style>
        <StateView
          description="The contacts page could not compose the local contacts list search and filter state."
          emptyState="A contacts filter or list boundary returned an unexpected state."
          evidence={[result.error.code, firstEvidence(result.error.evidenceIds)]}
          eyebrow="Contacts"
          guardrail="No external action can run when contacts composition fails."
          nextStep="Inspect GET /api/contacts."
          purpose="Stop contacts review when source evidence cannot be composed."
          title="Contacts relationship console could not load"
        />
      </div>
    );
  }

  return (
    <div className="app-contacts-route">
      <style>{appContactsStyles}</style>
      <SuccessBoundary payload={result.data} searchParams={searchParams} />
      <ContactsListSection payload={result.data} />
      <SecondaryControls payload={result.data} />
      <FilterVocabulary payload={result.data} />
    </div>
  );
}
