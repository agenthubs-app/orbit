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
 *     With `sort: "added"` (RD-33) the occurred-at time is replaced by the
 *     card's `addedAt` (when the person joined 人脈; a row from an older
 *     mirror without it falls back to its occurred-at time).
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

/** RD-33 `sort: "added"`: addedAt desc (millisecond ISO text compares as text), then the list's own order. */
function compareAddedOrder(left: Listed, right: Listed): number {
  return compareText(right.card.addedAt ?? right.search.occurredAt, left.card.addedAt ?? left.search.occurredAt)
    || compareText(right.search.updatedAt, left.search.updatedAt)
    || compareText(left.id, right.id);
}

/**
 * R11a: the plan-merged density of a listed row (plan-related people read 3). Rows from an older mirror without
 * `density` read 1 here; the App fills them from its own fields first (src/view-models/contacts-local.ts).
 */
export function localEffectiveDensity(card: ContactCardDTO, goalRelated: ReadonlySet<string>): 1 | 2 | 3 {
  if (goalRelated.has(card.id)) return 3;
  return card.density === 2 || card.density === 3 ? card.density : 1;
}

interface NetworkSets { goal: ReadonlySet<string>; followUp: ReadonlySet<string> }

function networkSets(input: LocalContactDirectoryQuery): NetworkSets {
  return { goal: new Set(input.goalRelatedIds ?? []), followUp: new Set(input.followUpContactIds ?? []) };
}

function matchesNetwork(row: Listed, input: LocalContactDirectoryQuery, sets: NetworkSets): boolean {
  const industries = selected(input.industryFilters);
  const regions = selected(input.regionFilters);
  const mets = selected(input.metFilters);
  const densities = selected(input.densityFilters);
  const card = row.card;
  return (input.goalRelated !== true || sets.goal.has(card.id))
    && (input.needsFollowUp !== true || sets.followUp.has(card.id))
    && (industries.length === 0 || industries.includes(card.primaryIndustryId ?? "none")
      || (card.secondaryIndustryId !== undefined && industries.includes(card.secondaryIndustryId)))
    && (regions.length === 0 || regions.includes(card.region?.city ?? "none"))
    && (mets.length === 0 || mets.includes(card.metKind ?? "other"))
    && (densities.length === 0 || densities.includes(String(localEffectiveDensity(card, sets.goal))));
}

function matches(row: Listed, input: LocalContactDirectoryQuery, query: string, sets: NetworkSets = networkSets(input)): boolean {
  const sources = selected(input.sourceFilters);
  const statuses = selected(input.statusFilters);
  const tags = selected(input.tagFilters);
  const values = selected(input.valueFilters);
  const valueTypes: readonly string[] = row.card.valueTypes ?? [];
  return (query === "" || row.search.text.toLowerCase().includes(query))
    && (sources.length === 0 || sources.includes(row.card.sourceType))
    && (statuses.length === 0 || (!row.card.pendingInitialization && statuses.includes(row.card.status)))
    && tags.every((tag) => row.tags.includes(tag))
    && values.every((value) => valueTypes.includes(value))
    && matchesNetwork(row, input, sets);
}

/** The contacts the list shows for this query and filters, in list order (refused contacts are never listed). */
export function localContactDirectory(rows: readonly ContactSyncPayload[], input: LocalContactDirectoryQuery): ContactSyncPayload[] {
  const query = normalizedQuery(input);
  const sets = networkSets(input);
  const rank = (row: Listed) => (query === "" || row.card.displayName.toLowerCase().startsWith(query) ? 0 : 1);
  return listed(rows)
    .filter((row) => row.search.error === null && matches(row, input, query, sets))
    .sort((left, right) => rank(left) - rank(right) || (input.sort === "added" ? compareAddedOrder(left, right) : compareListOrder(left, right)));
}

/** The list summary for this query and filters (the server's /api/contacts/summary without asOf). */
export function localContactDirectorySummary(rows: readonly ContactSyncPayload[], input: LocalContactDirectoryQuery): Omit<ContactCardSummaryDTO, "asOf"> {
  const query = normalizedQuery(input);
  const sets = networkSets(input);
  const all = listed(rows).sort(compareListOrder);
  // R11a facets over every contact (the same counts as NETWORK_SUMMARY_SQL on the server).
  const densityCounts = { 1: 0, 2: 0, 3: 0 };
  const sourceChips: Record<string, number> = {};
  const industries: Record<string, number> = {};
  const regions: Record<string, number> = {};
  const metKinds: Record<string, number> = {};
  const bump = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1; };
  let addedThisMonth = 0;
  let goalRelated = 0;
  let needsFollowUp = 0;
  const sources: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  const values: Record<string, number> = {};
  const tags = new Map<string, { count: number; firstOrder: number; firstTagOrder: number }>();
  let total = 0;
  all.forEach((row, order) => {
    if (matches(row, input, query, sets)) total += 1;
    densityCounts[localEffectiveDensity(row.card, sets.goal)] += 1;
    bump(sourceChips, row.card.sourceChip ?? "manual");
    bump(industries, row.card.primaryIndustryId ?? "none");
    bump(regions, row.card.region?.city ?? "none");
    bump(metKinds, row.card.metKind ?? "other");
    if (input.monthStart && row.card.addedAt && row.card.addedAt >= input.monthStart) addedThisMonth += 1;
    if (sets.goal.has(row.card.id)) goalRelated += 1;
    if (sets.followUp.has(row.card.id)) needsFollowUp += 1;
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
  return { total, sources, statuses, values, tags: orderedTags.slice(0, 50), hasMoreTags: orderedTags.length > 50,
    densityCounts, ...(input.monthStart ? { addedThisMonth } : {}), tabCounts: { goalRelated, needsFollowUp }, sourceChips, industries, regions, metKinds };
}
