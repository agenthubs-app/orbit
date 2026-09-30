import type { ContactCardDTO, ContactCardPageDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import type { ContactSyncPayload, LocalContactDirectoryQuery } from "../api/contract/contact-local-directory";
import { localContactDirectory, localContactDirectorySummary } from "../api/schema/contact-local-directory";
import { contactCardSchema } from "../api/schema/contact-card-page";

/**
 * Sprint 0116 (offline 1b): the account's contacts from the device mirror
 * (sync domain "contacts"). Every row carries the server's own list card,
 * search text and detail read, so the list, the search and the detail are the
 * server's results for the same data (rules: api/schema/contact-local-directory).
 */
export const LOCAL_CONTACT_PAGE_SIZE = 30;

export interface LocalContactRecord { id: string; payload: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A mirror row the screens can use; malformed rows are ignored, never shown half-built. */
export function contactSyncPayload(record: LocalContactRecord): ContactSyncPayload | null {
  const payload = record.payload;
  if (!isRecord(payload) || payload.id !== record.id || !Array.isArray(payload.tags) || !isRecord(payload.search)) return null;
  const search = payload.search;
  if (typeof search.text !== "string" || typeof search.occurredAt !== "string" || typeof search.updatedAt !== "string" || (search.error !== null && typeof search.error !== "string")) return null;
  const card = payload.card === null ? null : contactCardSchema.safeParse(payload.card);
  if (card && !card.success) return null;
  return {
    id: record.id,
    card: card ? card.data as ContactCardDTO : null,
    tags: payload.tags.filter((tag): tag is string => typeof tag === "string"),
    search: { text: search.text, occurredAt: search.occurredAt, updatedAt: search.updatedAt, error: search.error as string | null },
    detail: isRecord(payload.detail) ? payload.detail : null,
  };
}

export function contactSyncPayloads(records: readonly LocalContactRecord[]): ContactSyncPayload[] {
  return records.flatMap((record) => {
    const row = contactSyncPayload(record);
    return row ? [row] : [];
  });
}

/** One page of the list (offset cursor), in the server's list order. */
export function localContactCardPage(rows: readonly ContactSyncPayload[], query: LocalContactDirectoryQuery, cursor: string | null, asOf: string): ContactCardPageDTO {
  const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const matches = localContactDirectory(rows, query);
  const items = matches.slice(offset, offset + LOCAL_CONTACT_PAGE_SIZE).flatMap((row) => (row.card ? [row.card] : []));
  const hasMore = matches.length > offset + LOCAL_CONTACT_PAGE_SIZE;
  return { items, nextCursor: hasMore ? String(offset + LOCAL_CONTACT_PAGE_SIZE) : null, hasMore, asOf };
}

export function localContactCardSummary(rows: readonly ContactSyncPayload[], query: LocalContactDirectoryQuery, asOf: string): ContactCardSummaryDTO {
  return { ...localContactDirectorySummary(rows, query), asOf };
}

/** The detail read of a contact by its contact id (the id the list card and every route use). */
export function localContactDetail(rows: readonly ContactSyncPayload[], contactId: string): Record<string, unknown> | null {
  const row = rows.find((candidate) => candidate.card?.id === contactId) ?? rows.find((candidate) => candidate.id === contactId);
  return row?.detail ?? null;
}

/** Name and organization for a linked-contact chip (notes, tasks, schedule), without a network read. */
export function localContactLabel(rows: readonly ContactSyncPayload[], contactId: string): { id: string; name: string; organization: string } | null {
  const row = rows.find((candidate) => candidate.card?.id === contactId) ?? rows.find((candidate) => candidate.id === contactId);
  return row?.card ? { id: row.card.id, name: row.card.displayName, organization: row.card.organization } : null;
}
