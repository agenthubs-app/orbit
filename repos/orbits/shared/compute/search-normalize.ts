// R30 global search (search/DESIGN.md §3.3): the one text-folding rule both ends and every data source share.
// Same folding as R27's event search (features/events/journey/search-core.ts): NFKC, lower case, no whitespace —
// so full / half width, case and spacing never decide a hit. Pure: no clock, no locale, no IO.
import { lowerText } from "./compute-text";

/** Fold text for matching: NFKC → lower → strip all whitespace. */
export function normalizeSearchText(value: string | null | undefined): string {
  return lowerText((value ?? "").normalize("NFKC")).replace(/\s+/gu, "");
}

/** Split a query into terms on whitespace (two or more terms are AND-ed); each term folded; empty terms dropped. */
export function splitSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of (query ?? "").normalize("NFKC").split(/\s+/u)) {
    const term = normalizeSearchText(raw);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

/** Every term appears somewhere in at least one of the fields (a term may hit a different field than another). */
export function matchesAllTerms(fields: readonly (string | null | undefined)[], terms: readonly string[]): boolean {
  if (!terms.length) return false;
  const folded = fields.map(normalizeSearchText);
  return terms.every((term) => folded.some((field) => field.includes(term)));
}
