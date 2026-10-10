import { z } from "zod";

// Contract rule 10 (README, confirmed by the product owner 2026-10-10): responses are
// read tolerantly. Unknown keys are dropped (zod's default for z.object — never
// `.strict()` on a response), an unknown enum value falls back to a stated value,
// and unknown members of an enum list are skipped, so a client keeps working when
// the server adds a field or a value. Request bodies stay strict.

/** An enum read from a response: an unknown value becomes `fallback`. */
export function tolerantEnum<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) {
  return z.enum(values).catch(fallback);
}

/** A list of enum values read from a response: unknown values are skipped. */
export function knownValues<const T extends readonly [string, ...string[]]>(values: T) {
  const known = new Set<string>(values);
  return z.array(z.string()).transform((list) => list.filter((value): value is T[number] => known.has(value)));
}
