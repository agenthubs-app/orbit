import type { ContactCardDTO, ContactCardSummaryDTO } from "./contact-card-page";

/**
 * Sprint 0116 (offline 1b): one row of the contacts sync domain as the device
 * stores it. The server builds every field from its own contact list SQL and
 * detail read; the device lists and searches its copy with the rules in
 * shared/api-schema/contact-local-directory.ts.
 */
export interface ContactSyncSearch {
  /** The server's search text before lowering (name, role, organization, location, profile, relationship, next action, tags, values, cited source summaries). */
  text: string;
  /** Microsecond UTC order keys (fixed width, so they sort as text). */
  occurredAt: string;
  updatedAt: string;
  /** Set when the server list refuses this contact (e.g. two owned relationships); it is counted in the summary but never listed. */
  error: string | null;
}

export interface ContactSyncPayload {
  /** The contact's record id (the sync change id). */
  id: string;
  /** The server's list card; null when it fails the page schema. */
  card: ContactCardDTO | null;
  /** The detail state's tags (the list's tag filter and facet). */
  tags: string[];
  search: ContactSyncSearch;
  /** The contact detail read (GET /api/contacts/:id data) without provenance and write flags; null when the server refuses it. */
  detail: Record<string, unknown> | null;
}

export interface LocalContactDirectoryQuery {
  query?: string | null;
  sourceFilters?: readonly string[] | null;
  statusFilters?: readonly string[] | null;
  tagFilters?: readonly string[] | null;
  valueFilters?: readonly string[] | null;
  /** R11a tabs and 絞り込み (same meaning as GET /api/contacts/page). */
  goalRelated?: boolean | null;
  needsFollowUp?: boolean | null;
  industryFilters?: readonly string[] | null;
  regionFilters?: readonly string[] | null;
  metFilters?: readonly string[] | null;
  densityFilters?: readonly string[] | null;
  /** R11a merge inputs the device holds: the cached goal-related ids and the contacts with an open follow-up (task mirror). */
  goalRelatedIds?: readonly string[] | null;
  followUpContactIds?: readonly string[] | null;
  /** R11a: the first instant of the current Tokyo month (addedThisMonth); omitted → addedThisMonth is not counted. */
  monthStart?: string | null;
}
