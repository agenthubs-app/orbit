/**
 * Compare two ISO timestamps as instants. Stored times are UTC ("…Z") while model-supplied ranges
 * carry an offset ("…+09:00"), so comparing the strings drops or keeps the wrong records
 * (agent-design AG01 run-02). When either side does not parse, the old text comparison is kept.
 */
export function compareInstants(left: string, right: string): number {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b ? 0 : a < b ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Sort order by instant; text order (localeCompare, as before) when either side does not parse. */
export function compareInstantsForSort(left: string, right: string): number {
  return Number.isFinite(Date.parse(left)) && Number.isFinite(Date.parse(right)) ? compareInstants(left, right) : left.localeCompare(right);
}

export function instantAtOrAfter(value: string, bound: string): boolean {
  return compareInstants(value, bound) >= 0;
}

export function instantAtOrBefore(value: string, bound: string): boolean {
  return compareInstants(value, bound) <= 0;
}
