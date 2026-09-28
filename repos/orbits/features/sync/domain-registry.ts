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
 * its read scopes. Workspace-wide domains (contacts, events…) are not
 * registered yet: their visibility is derived, and each arrives with its own
 * manual from sprint 0115 on.
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
   * membership). Declared so a manual can say so; the read service refuses it
   * until the first derived domain implements its query.
   */
  | { rule: "derived"; description: string };

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

export type SyncDomainSource = OrbitRecordsSyncSource | DedicatedTableSyncSource;

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

export const SYNC_DOMAINS: readonly SyncDomainDefinition[] = [
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

/** Every declared manual, leased or not: the owner/identity audit covers all of them. */
export const DECLARED_SYNC_DOMAINS: readonly SyncDomainDefinition[] = [...SYNC_DOMAINS, EVENT_MEMBERSHIP_PROBE_DOMAIN];

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

/** orbit_records collections whose owner is a visibility input: the domains' own and their attachments. */
export function ownerGuardedCollections(domains: readonly SyncDomainDefinition[] = DECLARED_SYNC_DOMAINS): string[] {
  const names = new Set<string>();
  for (const domain of domains) {
    if (domain.source.kind !== "orbit_records") continue;
    names.add(domain.source.collectionName);
    for (const attachment of domain.attachments) names.add(attachment.collectionName);
  }
  return [...names].sort();
}
