import type { SyncChangeKind } from "../../shared/contract/sync";

/**
 * Registry v2 (sprint 0113): every sync domain carries its own "manual".
 *
 *   ownership         how the owner of a row is decided (an owner column today;
 *                     a derived rule arrives with the first derived domain)
 *   visibilityInputs  the columns that decide *who* can see a row. Changing one
 *                     makes the row leave a device, so every writer that sets
 *                     one must be a registered owner-change handler (see
 *                     SYNC_OWNER_CHANGE_HANDLERS and features/sync/owner-guard.ts)
 *   attachments       data sent together with a row of this domain
 *   fields            the payload keys a device receives; nothing else leaves
 *   source            where rows are read from: the universal orbit_records
 *                     table or a dedicated table (a personal subspace source is
 *                     added by sprint 0118 behind the same interface)
 *
 * Domain ids match the App's LEGACY_DOMAINS so lease grants bind directly to
 * its read scopes. Sprint 0115 adds the first derived domains (the registered
 * attendee's events, EVENT_SYNC_DOMAINS); sprint 0116 adds the contacts
 * domain (CONTACT_SYNC_DOMAINS), a contact row built from four collections.
 */
export const SYNC_REGISTRY_VERSION = 2;
// 2 (sprint 0108): personal-schedule pages carry the full personal DTO and a
// recurring series' occurrence exceptions. The bump rotates every generation,
// so existing device mirrors rebuild once instead of keeping v1 payloads.
export const SYNC_DOMAIN_SCHEMA_VERSION = 2;

export type SyncOwnership =
  /** The row's owner is the value of one column. */
  | { rule: "column"; column: string }
  /**
   * The owner is computed from other rows (e.g. an event through the viewer's
   * membership). Sprint 0115: implemented for the event_derived source (its
   * reader joins the viewer's own head rows); any other source with a derived
   * owner is refused with SYNC_DOMAIN_SOURCE_UNSUPPORTED.
   */
  | { rule: "derived"; description: string }
  /**
   * Sprint 0118: the row lives in the actor's personal sub-workspace
   * (`${workspaceId}:actor:${encodeURIComponent(actorId)}`, see
   * orbitAgentChatSessionActorWorkspaceId). The workspace is the owner; the rows
   * carry no user_id. Moving a row to another workspace (or collection) would
   * leave it on the old owner's device, so the database guard refuses it.
   */
  | { rule: "personal_subspace"; description: string };

export interface SyncAttachment {
  /** Where the attached rows live. */
  collectionName: string;
  /** How an attached row finds its parent row. */
  join: string;
  /** The payload key the attached rows are sent under. */
  field: string;
}

export interface OrbitRecordsSyncSource {
  kind: "orbit_records";
  collectionName: "notes" | "tasks" | "personal_schedule_items";
  changeKind: SyncChangeKind;
}

export interface DedicatedTableSyncSource {
  kind: "dedicated_table";
  table: string;
  /** Column that identifies a row within one owner's domain (the change id). */
  recordIdColumn: string;
  /** Maps each sent field to its column. Every column must be a plain identifier. */
  columns: Readonly<Record<string, string>>;
}

/**
 * A table whose rows decide who owns a derived row (sprint 0115). The owner
 * column and the identity columns are the visibility inputs: moving a head
 * row to another actor, event or workspace would leave a copy on the old
 * owner's device, so the database guard (owner-guard.ts) refuses it and the
 * owner audit scans every statement that sets one of them.
 */
export interface DerivedOwnerTable {
  table: string;
  ownerColumn: string;
  identityColumns: readonly string[];
}

/**
 * Derived event source (sprint 0115): one row per event the viewer has a
 * membership or admission application for, read from the dedicated event
 * tables (features/sync/event-domain-reader.ts). A row's revision is the
 * greatest sync_revision of the rows it is built from, so a change to any of
 * them resends it; a row that stops being visible (cancelled, rejected, a
 * newer unreleased publication) is sent as a delete, because the owner head
 * stays with the viewer and takes a new revision.
 */
export interface EventDerivedSyncSource {
  kind: "event_derived";
  view: "registrations" | "registered-events" | "published-results";
  ownerTables: readonly DerivedOwnerTable[];
  /** Every table whose sync_revision moves a row; each carries sync_revision under the commit-order lock (EVENT_SYNC_REVISION_TABLES). */
  revisionTables: readonly string[];
  /** Tables read without a revision: immutable versions reached through a head in revisionTables. */
  immutableTables: readonly string[];
}

/**
 * Contact graph source (sprint 0116): one row per contact the owner holds
 * (orbit_records contacts, user_id = owner), sent together with its
 * relationships (connections), the owner's detail state and the sources
 * (evidence) the contact and its relationships cite — every one of them owned
 * by the same user_id. A row's revision is the greatest sync_revision of the
 * rows it is built from, so an edit to any of them resends it; a soft-deleted
 * contact is sent as a delete (features/sync/contact-domain-reader.ts).
 */
export interface ContactGraphSyncSource {
  kind: "contact_graph";
  collectionName: "contacts";
  /** The primary collection and every attachment collection; all are owner guarded and take the commit-order lock. */
  collections: readonly string[];
}

/**
 * Dashboard graph source (sprint 0117): one row per stored record of the
 * actor's six dashboard graph collections (user_id = owner; a contact whose
 * payload accountId names another account is not in the owner's graph). A row's
 * revision is the record's own sync_revision; a soft-deleted record, or a
 * contact that leaves the owner's account, is sent as a delete. The payload is
 * the projection the server's own graph read selects (a source row carries only
 * its record time), so the device computes the dashboard with the server's code
 * on the same records (features/sync/dashboard-graph-reader.ts,
 * shared/compute/dashboard-graph.ts).
 */
export interface DashboardGraphSyncSource {
  kind: "dashboard_graph";
  /** Every collection the rows come from; all are owner guarded and take the commit-order lock. */
  collections: readonly string[];
}

/**
 * Inbox source (sprint 0118): one row per stored typed notification of the
 * actor (orbit_records inboxNotifications, user_id = owner). The server decides
 * at read time whether a notification's sources are still available (a deleted
 * contact, a cancelled appointment, a revoked request...). A device copy cannot
 * see that, so the sync path writes the decision back onto the row
 * (features/sync/inbox-domain-reader.ts, reconcileInboxSourceStates): a changed
 * decision is a new sync revision, and a row whose sources are no longer
 * available is sent without its content.
 */
export interface InboxRecordsSyncSource {
  kind: "inbox_records";
  collectionName: "inboxNotifications";
}

/**
 * Personal sub-workspace source (sprint 0118, reserved by 0113): rows in the
 * actor's own sub-workspace, optionally joined with base-workspace rows the
 * actor owns (user_id). `view` picks the reader
 * (features/sync/ai-session-domain-reader.ts).
 */
export interface PersonalSubspaceSyncSource {
  kind: "personal_subspace";
  view: "ai-sessions" | "ai-session-messages";
  /** Collections read from the personal sub-workspace; the sub-workspace is the owner. */
  subspaceCollections: readonly string[];
  /** Base-workspace collections owned by user_id that a row is built from (their sync_revision moves the row). */
  ownedCollections: readonly string[];
}

export type SyncDomainSource = OrbitRecordsSyncSource | DedicatedTableSyncSource | EventDerivedSyncSource | ContactGraphSyncSource | DashboardGraphSyncSource | InboxRecordsSyncSource | PersonalSubspaceSyncSource;

export interface SyncDomainDefinition {
  domainId: string;
  /**
   * "device": leased to accounts and mirrored by the App. "probe": test-only,
   * never leased (tests construct a read service with it explicitly).
   */
  exposure: "device" | "probe";
  ownership: SyncOwnership;
  visibilityInputs: readonly string[];
  attachments: readonly SyncAttachment[];
  fields: readonly string[];
  source: SyncDomainSource;
}

const OWNER_COLUMN = { rule: "column", column: "user_id" } as const;

/** The orbit_records device domains (sprints 0075–0108). */
export const RECORD_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "notes",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [],
    fields: ["id", "accountId", "ownerUserId", "title", "body", "version", "createdAt", "updatedAt", "manualContactIds", "contactIds", "eventIds", "mentions"],
    source: { kind: "orbit_records", collectionName: "notes", changeKind: "note" },
  },
  {
    domainId: "tasks",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [],
    fields: [
      "id", "accountId", "ownerUserId", "title", "status", "category", "priority", "source", "createdAt", "updatedAt",
      "notes", "location", "plannedDate", "dueAt", "relatedContactId", "relatedEventId", "relatedMeetingId",
      "relatedConversationId", "suggestionId", "sourceNoteId", "sourceNoteVersion", "completedAt", "completedBy", "completionSource",
    ],
    source: { kind: "orbit_records", collectionName: "tasks", changeKind: "task" },
  },
  {
    domainId: "personal-schedule",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [
      { collectionName: "personal_schedule_occurrence_exceptions", join: "source_id = series record_id, same owner", field: "occurrenceExceptions" },
    ],
    fields: [
      "id", "accountId", "ownerUserId", "title", "kind", "category", "state", "sourceId", "startsAt", "createdAt", "updatedAt",
      "endsAt", "location", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "recurrence", "reminderMinutes",
      "details", "contactId", "eventId", "meetingId", "evidenceIds", "occurrenceExceptions",
    ],
    source: { kind: "orbit_records", collectionName: "personal_schedule_items", changeKind: "personal_schedule" },
  },
];

/**
 * Sprint 0116 (offline 1b): the account's contacts. The payload is what the
 * App's contact screens read: the list card (the server's own card SQL), the
 * detail state's tags and the search text for the device's local search
 * (shared/contract/contact-local-directory.ts), and the contact detail (the
 * server's detail read, without provenance or write flags). No record metadata
 * (provider, source rows, capture internals) leaves the server.
 */
export const CONTACT_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "contacts",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [
      { collectionName: "connections", join: "payload.contactId = contact payload.id, same user_id (and payload.accountId)", field: "card, detail, search" },
      { collectionName: "contact_detail_states", join: "payload.contactId = contact payload.id, same user_id (payload.actorId = owner)", field: "tags, detail" },
      { collectionName: "evidence", join: "payload.id cited by the contact's or its connections' payload.evidenceIds, same user_id; an uncited, owner-less or foreign row is never sent", field: "detail, search" },
    ],
    fields: ["id", "card", "tags", "search", "detail"],
    source: { kind: "contact_graph", collectionName: "contacts", collections: ["contacts", "connections", "contact_detail_states", "evidence"] },
  },
];

/**
 * Sprint 0117 (dashboard D3): the account's relationship graph as the
 * dashboard reads it, so the App computes the dashboard and the contacts
 * analysis on the device. The universal-table events collection (per user_id)
 * joins the sync collections here; it is not the dedicated event tables the
 * 0115 event domains read.
 */
export const DASHBOARD_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "dashboard-graph",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [],
    fields: ["collection", "recordId", "occurredAt", "updatedAt", "data"],
    source: { kind: "dashboard_graph", collections: ["connections", "contact_detail_states", "contacts", "events", "evidence", "tasks"] },
  },
];

/** The inbox fields a device receives: the notification without its owner id, plus the server's source decision. */
export const INBOX_DEVICE_FIELDS = [
  "id", "revision", "kind", "origin", "semanticKey", "title", "reason", "object", "sources", "target", "actions", "occurredAt", "updatedAt",
  "readAt", "dueAt", "scheduledFor", "expiresAt", "disposition", "legacyId", "createdTaskId", "copy", "sourceState",
] as const;

/**
 * Sprint 0118 (offline 3a): the account's typed inbox. Every notification row
 * of the actor, history included, so the inbox list, its detail, the history
 * filter and the unread badge read the device copy.
 */
export const INBOX_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "inbox-notifications",
    exposure: "device",
    ownership: OWNER_COLUMN,
    visibilityInputs: ["user_id", "collection_name"],
    attachments: [],
    fields: INBOX_DEVICE_FIELDS,
    source: { kind: "inbox_records", collectionName: "inboxNotifications" },
  },
];

const PERSONAL_SUBSPACE_OWNERSHIP = {
  rule: "personal_subspace",
  description: "orbit_agent_chat_sessions / orbit_agent_chat_messages rows in the actor's personal sub-workspace (workspace_id = `${workspaceId}:actor:${encodeURIComponent(actorId)}`); the session's organization row is owned by user_id = actor in the base workspace.",
} as const;
/** How many of an opened session's latest messages a device receives when it starts holding the session. */
export const AI_SESSION_MESSAGE_DEVICE_WINDOW = 50;
/** How many opened sessions a device may name in one messages page request (it keeps the most recently opened). */
export const AI_SESSION_OPENED_LIMIT = 20;

/**
 * Sprint 0118 (AI B3): the AI session list and the messages of the sessions a
 * device has opened. The list row is the session row joined with the actor's
 * organization row (pinned, custom title, group). Messages are sent only for
 * the sessions the device names (the ones it opened), starting from the latest
 * AI_SESSION_MESSAGE_DEVICE_WINDOW of each; cards are not synced (the App keeps
 * the cards of its last online page read).
 */
export const AI_SESSION_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "ai-sessions",
    exposure: "device",
    ownership: PERSONAL_SUBSPACE_OWNERSHIP,
    visibilityInputs: ["workspace_id", "collection_name"],
    attachments: [
      { collectionName: "orbit_agent_chat_session_organizations", join: "payload.sessionId = session record_id, base workspace, user_id = actor", field: "organization" },
    ],
    fields: ["id", "title", "firstUserText", "lastMessagePreview", "createdAt", "updatedAt", "messageCount", "messageRevision", "organization"],
    source: { kind: "personal_subspace", view: "ai-sessions", subspaceCollections: ["orbit_agent_chat_sessions"], ownedCollections: ["orbit_agent_chat_session_organizations"] },
  },
  {
    domainId: "ai-session-messages",
    exposure: "device",
    ownership: PERSONAL_SUBSPACE_OWNERSHIP,
    visibilityInputs: ["workspace_id", "collection_name"],
    attachments: [],
    fields: ["sessionId", "id", "role", "text", "references", "index", "createdAt"],
    source: { kind: "personal_subspace", view: "ai-session-messages", subspaceCollections: ["orbit_agent_chat_messages", "orbit_agent_chat_sessions"], ownedCollections: [] },
  },
];

const EVENT_OWNER_TABLES: readonly DerivedOwnerTable[] = [
  { table: "event_ops_membership_heads", ownerColumn: "actor_id", identityColumns: ["workspace_id", "event_id"] },
  { table: "event_ops_admission_application_heads", ownerColumn: "actor_id", identityColumns: ["workspace_id", "event_id"] },
];
const EVENT_OWNERSHIP = {
  rule: "derived",
  description: "The viewer's own event_ops_membership_heads / event_ops_admission_application_heads row (actor_id = viewer) for the event. A cancelled membership or a rejected application keeps its owner and takes a new revision, so the device hears about it.",
} as const;
/** The attendee-visible public profile of a participant (the operations response's publicParticipant). */
export const EVENT_PUBLIC_PARTICIPANT_FIELDS = ["company", "displayName", "experienceHighlight", "industry", "languages", "needs", "offers", "participantId", "role", "topics"] as const;

/**
 * Sprint 0115 (offline 1a): the registered attendee's event day. Registered in
 * the order the App binds them; the organizer's and staff views (admin
 * workspace, check-in roster, generations) are never a sync domain.
 */
export const EVENT_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
  {
    domainId: "event-registrations",
    exposure: "device",
    ownership: EVENT_OWNERSHIP,
    visibilityInputs: ["actor_id", "workspace_id", "event_id"],
    attachments: [],
    fields: ["eventId", "membershipStatus", "admissionStatus"],
    source: { kind: "event_derived", view: "registrations", ownerTables: EVENT_OWNER_TABLES, revisionTables: ["event_ops_membership_heads", "event_ops_admission_application_heads"], immutableTables: [] },
  },
  {
    domainId: "registered-events",
    exposure: "device",
    ownership: EVENT_OWNERSHIP,
    visibilityInputs: ["actor_id", "workspace_id", "event_id"],
    attachments: [],
    fields: [
      "eventId", "participantId", "title", "description", "venue", "timeZone", "startsAt", "endsAt", "lifecycleState",
      "checkInOpensAt", "eventStartsAt", "eventEndsAt", "profileEditDeadlineAt", "resultsAvailableAt", "roundOneStartsAt", "roundTwoStartsAt",
    ],
    source: {
      kind: "event_derived", view: "registered-events", ownerTables: EVENT_OWNER_TABLES,
      revisionTables: ["event_ops_membership_heads", "event_ops_admission_application_heads", "event_ops_events", "event_ops_configuration_heads"],
      immutableTables: ["event_ops_configurations"],
    },
  },
  {
    domainId: "event-published-results",
    exposure: "device",
    ownership: EVENT_OWNERSHIP,
    visibilityInputs: ["actor_id", "workspace_id", "event_id"],
    attachments: [],
    fields: ["eventId", "generationId", "publishedAt", "resultsAvailableAt", "me", "directory", "directoryComplete", "recommendations", "roundOneTable", "roundTwoTable"],
    source: {
      kind: "event_derived", view: "published-results", ownerTables: EVENT_OWNER_TABLES,
      revisionTables: ["event_ops_membership_heads", "event_ops_admission_application_heads", "event_ops_publication_heads"],
      immutableTables: ["event_ops_publications"],
    },
  },
];

export const EVENT_SYNC_DOMAIN_IDS: readonly string[] = EVENT_SYNC_DOMAINS.map((domain) => domain.domainId);

/**
 * Probe domain (sprint 0113, SC-04): proves the dedicated-table source end to
 * end on the real event tables. Never leased; not visible to any account.
 * Sprint 0115 replaces it with the real event domains.
 */
export const EVENT_MEMBERSHIP_PROBE_DOMAIN: SyncDomainDefinition = {
  domainId: "probe-event-memberships",
  exposure: "probe",
  ownership: { rule: "column", column: "actor_id" },
  visibilityInputs: ["actor_id"],
  attachments: [],
  fields: ["eventId", "status", "membershipVersion", "updatedAt"],
  source: {
    kind: "dedicated_table",
    table: "event_ops_membership_heads",
    recordIdColumn: "event_id",
    columns: { eventId: "event_id", status: "status", membershipVersion: "membership_version", updatedAt: "updated_at" },
  },
};

/** Every device domain, leased to each authorized account. */
export const SYNC_DOMAINS: readonly SyncDomainDefinition[] = [...RECORD_SYNC_DOMAINS, ...CONTACT_SYNC_DOMAINS, ...EVENT_SYNC_DOMAINS, ...DASHBOARD_SYNC_DOMAINS, ...INBOX_SYNC_DOMAINS, ...AI_SESSION_SYNC_DOMAINS];

/** Every declared manual, leased or not: the owner/identity audit covers all of them. */
export const DECLARED_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [...SYNC_DOMAINS, EVENT_MEMBERSHIP_PROBE_DOMAIN];

/** Dedicated tables whose owner/identity columns are visibility inputs of a derived domain (guarded in the database, audited statically). */
export function derivedOwnerTables(domains: readonly SyncDomainDefinition[] = DECLARED_SYNC_DOMAINS): DerivedOwnerTable[] {
  const found = new Map<string, DerivedOwnerTable>();
  for (const domain of domains) {
    if (domain.source.kind !== "event_derived") continue;
    for (const owner of domain.source.ownerTables) found.set(owner.table, owner);
  }
  return [...found.values()].sort((left, right) => left.table.localeCompare(right.table));
}

/**
 * A registered way a write may set a visibility input of a sync domain.
 *
 *   "reassign"     may move an owned row to another owner or out of its
 *                  collection. It must bump both owners' class version in the
 *                  same transaction (offline design, step 5). None exist: the
 *                  product has no contact handover; a revoked relationship
 *                  keeps its owner (member row "left"); a cancelled
 *                  registration keeps its owner.
 *   "first-owner"  may only give an owner-less row its first owner, in the
 *                  listed collections. It never re-owns a row, so neither the
 *                  database guard nor reassignRecordOwner accepts it; the
 *                  owner audit requires every one of its statements to be
 *                  guarded by `user_id is null`.
 */
export interface SyncOwnerChangeHandler {
  name: string;
  scope: "reassign" | "first-owner";
  collections: readonly string[];
  description: string;
}

export const SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS: readonly SyncOwnerChangeHandler[] = [
  {
    name: "owner-backfill-0114",
    scope: "first-owner",
    collections: ["contacts", "connections", "contact_detail_states", "evidence"],
    description: "Sprint 0114 owner backfill (scripts/backfill-owners.ts): gives owner-less contact rows their owner by reference or by the demo account that generated them, and gives a shared source a per-owner copy (a new row, not an owner change).",
  },
  {
    name: "demo-event-owner-reset",
    scope: "reassign",
    collections: ["events"],
    description: "Sprint 0117: the demo workspace seed (scripts/seed-demo-workspace.ts) clears the reviewed catalogue events' owners before re-applying the reviewed organizer owner plan. Events became a sync collection (dashboard graph). In the same transaction it rotates each previous owner's authorization epoch (rotateAuthorizationEpochs in features/sync/owner-guard.ts), so every device of theirs rebuilds its domains without the events it no longer owns.",
  },
];

export const SYNC_OWNER_CHANGE_HANDLERS: readonly string[] = SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS.map((handler) => handler.name);

/** Handlers allowed to change an existing owner of `collectionName` (none today). */
export function reassigningOwnerChangeHandlers(collectionName?: string): string[] {
  return SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS
    .filter((handler) => handler.scope === "reassign" && (collectionName === undefined || handler.collections.includes(collectionName)))
    .map((handler) => handler.name);
}

export function findSyncOwnerChangeHandler(name: string): SyncOwnerChangeHandler | null {
  return SYNC_OWNER_CHANGE_HANDLER_DEFINITIONS.find((handler) => handler.name === name) ?? null;
}

export function findSyncDomain(domainId: string, domains: readonly SyncDomainDefinition[] = SYNC_DOMAINS): SyncDomainDefinition | null {
  return domains.find((domain) => domain.domainId === domainId) ?? null;
}

/**
 * Sprint 0118: orbit_records collections owned by their personal sub-workspace
 * (no user_id). The database guard refuses moving one of their rows to another
 * workspace or collection unless a registered handler runs (none).
 */
export function personalSubspaceCollections(domains: readonly SyncDomainDefinition[] = DECLARED_SYNC_DOMAINS): string[] {
  const names = new Set<string>();
  for (const domain of domains) if (domain.source.kind === "personal_subspace") for (const name of domain.source.subspaceCollections) names.add(name);
  return [...names].sort();
}

/** orbit_records collections whose owner is a visibility input: the domains' own and their attachments (sprint 0116: the contact graph's four; sprint 0117: the dashboard graph's six, events included). */
export function ownerGuardedCollections(domains: readonly SyncDomainDefinition[] = DECLARED_SYNC_DOMAINS): string[] {
  const names = new Set<string>();
  for (const domain of domains) {
    if (domain.source.kind === "dashboard_graph") {
      for (const name of domain.source.collections) names.add(name);
      continue;
    }
    if (domain.source.kind === "personal_subspace") {
      // The sub-workspace rows carry no user_id (see personalSubspaceCollections); their owned base-workspace rows do.
      for (const name of domain.source.ownedCollections) names.add(name);
      continue;
    }
    if (domain.source.kind !== "orbit_records" && domain.source.kind !== "contact_graph" && domain.source.kind !== "inbox_records") continue;
    names.add(domain.source.collectionName);
    if (domain.source.kind === "contact_graph") for (const name of domain.source.collections) names.add(name);
    for (const attachment of domain.attachments) names.add(attachment.collectionName);
  }
  return [...names].sort();
}
