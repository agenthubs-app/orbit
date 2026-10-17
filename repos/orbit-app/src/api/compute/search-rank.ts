// R30 global search (search/DESIGN.md §4.2): the keyword rank of a person and the comparator. Pure.
import { normalizeSearchText } from "./search-normalize";

export interface RankablePerson {
  name: string;
  org?: string | null;
  role?: string | null;
  /** Everything else the source searched (location, memo-like fields). */
  other?: readonly (string | null | undefined)[];
  /** ISO time of the last contact, newest wins ties; the caller parses it (compute never reads the clock). */
  lastInteractionAt?: string | null;
}

/**
 * 0 = the name starts with the first term; 1 = the name contains every term; 2 = org or role contain every term;
 * 3 = the remaining fields; 4 = no field holds every term (the source matched on something we do not show).
 */
export function personRank(person: RankablePerson, terms: readonly string[]): 0 | 1 | 2 | 3 | 4 {
  if (!terms.length) return 4;
  const name = normalizeSearchText(person.name);
  const first = terms[0]!;
  if (name.startsWith(first) && terms.every((term) => name.includes(term))) return 0;
  if (terms.every((term) => name.includes(term))) return 1;
  const work = normalizeSearchText(`${person.org ?? ""} ${person.role ?? ""}`);
  if (terms.every((term) => work.includes(term) || name.includes(term))) return 2;
  const rest = normalizeSearchText((person.other ?? []).join(" "));
  if (terms.every((term) => rest.includes(term) || work.includes(term) || name.includes(term))) return 3;
  return 4;
}

/** rank asc → last contact desc (ISO strings compare lexically) → name asc. */
export function comparePeople<T extends RankablePerson>(terms: readonly string[]): (a: T, b: T) => number {
  return (a, b) => {
    const rank = personRank(a, terms) - personRank(b, terms);
    if (rank !== 0) return rank;
    const last = compareIso(b.lastInteractionAt, a.lastInteractionAt);
    if (last !== 0) return last;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  };
}

function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  const left = a ?? "";
  const right = b ?? "";
  return left < right ? -1 : left > right ? 1 : 0;
}
