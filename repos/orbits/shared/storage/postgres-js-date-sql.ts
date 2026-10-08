/**
 * SQL predicate: node-pg turns this `timestamptz` column into a valid JS Date.
 *
 * node-pg (postgres-date) parses ±infinity as ±Infinity (not a Date), and
 * builds finite values in two steps: `Date.UTC(<wall clock in the session
 * time zone>)`, then shifts by the printed offset. Either step leaving the JS
 * Date range (±8.64e15 ms, i.e. up to 275760-09-13T00:00:00Z) yields an
 * Invalid Date whose `toISOString()` throws. The predicate checks both steps
 * in the same session time zone PostgreSQL prints with, at millisecond
 * precision (JS drops sub-millisecond digits). PostgreSQL's lower bound
 * (4713 BC) is well inside the JS range.
 *
 * `column` must be a trusted SQL expression, never user input.
 */
export function jsDateSafeTimestampSql(column: string): string {
  return `(isfinite(${column})
      and date_trunc('milliseconds', ${column}) <= '275760-09-13 00:00:00+00'::timestamptz
      and date_trunc('milliseconds', ${column}::timestamp) <= '275760-09-13 00:00:00'::timestamp)`;
}
