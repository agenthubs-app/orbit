import type { ContactCardDTO, ContactCardSummaryDTO } from "../contract/contact-card-page";
import type { ContactSyncPayload, LocalContactDirectoryQuery } from "../contract/contact-local-directory";

/**
 * Sprint 0116 (offline 1b): the rules the device lists and searches its copy
 * of the contacts sync domain with (the rows: shared/contract/contact-local-directory.ts).
 *
 * The server builds every field from its own contact list SQL and detail
 * read, so the device only has to apply the list rules below. They are the
 * rules of GET /api/contacts/page and /summary (features/contacts/storage/
 * contact-list-postgres-reader.ts), matcher policy ecmascript-lower-substring-v1:
 *
 *   - query: trimmed with String.prototype.trim and lowered with toLowerCase;
 *     a contact matches when its lowered search text contains the query as a
 *     plain substring (no wildcards: `%` and `_` are ordinary characters). The
 *     server lowers the same text with PostgreSQL lower() under the verified
 *     ICU collation, which sprint 0126 proved equal to toLowerCase.
 *   - filters: source (the card's source type), status (not while the contact
 *     awaits initialization), tags and relationship values (all selected
 *     values present). Blank filter values are ignored.
 *   - order: display names that start with the query first, then the
 *     contact's occurred-at time (newest first), its update time, its id.
 *   - summary: the total is the number of matches; the facet counts (sources,
 *     statuses, relationship values, the first 50 tags in list order) cover
 *     every contact, exactly as the server's summary does.
 *
 * This file is copied into the App (npm run sync:contract), so the App and the
 * server's parity test run the same code.
 */

function selected(values?: readonly string[] | null): readonly string[] {
  return values?.filter((value) => value.trim().length > 0) ?? [];
}

function normalizedQuery(input: LocalContactDirectoryQuery): string {
  return input.query?.trim().toLowerCase() ?? "";
}

type Listed = ContactSyncPayload & { card: ContactCardDTO };

function listed(rows: readonly ContactSyncPayload[]): Listed[] {
  return rows.filter((row): row is Listed => row.card !== null);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** occurred-at desc, updated-at desc, id asc: the list's own order. */
function compareListOrder(left: ContactSyncPayload, right: ContactSyncPayload): number {
  return compareText(right.search.occurredAt, left.search.occurredAt)
    || compareText(right.search.updatedAt, left.search.updatedAt)
    || compareText(left.id, right.id);
}

function matches(row: Listed, input: LocalContactDirectoryQuery, query: string): boolean {
  const sources = selected(input.sourceFilters);
  const statuses = selected(input.statusFilters);
  const tags = selected(input.tagFilters);
  const values = selected(input.valueFilters);
  const valueTypes: readonly string[] = row.card.valueTypes ?? [];
  return (query === "" || row.search.text.toLowerCase().includes(query))
    && (sources.length === 0 || sources.includes(row.card.sourceType))
    && (statuses.length === 0 || (!row.card.pendingInitialization && statuses.includes(row.card.status)))
    && tags.every((tag) => row.tags.includes(tag))
    && values.every((value) => valueTypes.includes(value));
}

/** The contacts the list shows for this query and filters, in list order (refused contacts are never listed). */
export function localContactDirectory(rows: readonly ContactSyncPayload[], input: LocalContactDirectoryQuery): ContactSyncPayload[] {
  const query = normalizedQuery(input);
  const rank = (row: Listed) => (query === "" || row.card.displayName.toLowerCase().startsWith(query) ? 0 : 1);
  return listed(rows)
    .filter((row) => row.search.error === null && matches(row, input, query))
    .sort((left, right) => rank(left) - rank(right) || compareListOrder(left, right));
}

/** The list summary for this query and filters (the server's /api/contacts/summary without asOf). */
export function localContactDirectorySummary(rows: readonly ContactSyncPayload[], input: LocalContactDirectoryQuery): Omit<ContactCardSummaryDTO, "asOf"> {
  const query = normalizedQuery(input);
  const all = listed(rows).sort(compareListOrder);
  const sources: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  const values: Record<string, number> = {};
  const tags = new Map<string, { count: number; firstOrder: number; firstTagOrder: number }>();
  let total = 0;
  all.forEach((row, order) => {
    if (matches(row, input, query)) total += 1;
    sources[row.card.sourceType] = (sources[row.card.sourceType] ?? 0) + 1;
    if (!row.card.pendingInitialization) statuses[row.card.status] = (statuses[row.card.status] ?? 0) + 1;
    for (const value of new Set(row.card.valueTypes ?? [])) values[value] = (values[value] ?? 0) + 1;
    const seen = new Set<string>();
    row.tags.forEach((tag, tagOrder) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      const entry = tags.get(tag);
      if (entry) entry.count += 1;
      else tags.set(tag, { count: 1, firstOrder: order, firstTagOrder: tagOrder });
    });
  });
  const orderedTags = [...tags.entries()]
    .sort(([leftValue, left], [rightValue, right]) => left.firstOrder - right.firstOrder || left.firstTagOrder - right.firstTagOrder || compareText(leftValue, rightValue))
    .map(([value, entry]) => ({ value, count: entry.count }));
  return { total, sources, statuses, values, tags: orderedTags.slice(0, 50), hasMoreTags: orderedTags.length > 50 };
}
