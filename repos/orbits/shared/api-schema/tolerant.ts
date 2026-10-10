import { z } from "zod";

// Contract rule 10 (README, confirmed by the product owner 2026-10-10): responses are
// read tolerantly. Unknown keys are dropped (zod's default for z.object — never
// `.strict()` on a response), an unknown enum value falls back to a stated value,
// and unknown members of an enum list are skipped, so a client keeps working when
// the server adds a field or a value. Request bodies stay strict.

/**
 * An enum read from a response: an unknown value becomes `fallback`. The field is
 * still required — a missing value fails like any other missing field.
 */
export function tolerantEnum<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) {
  const known = new Set<string>(values);
  return z.string().transform((value): T[number] => (known.has(value) ? value : fallback));
}

/**
 * A list read from a response whose items are checked one by one: an item this
 * client cannot read is skipped, the rest are kept (the page never fails as a whole).
 */
export function readableItems<T>(item: z.ZodType<T>) {
  return z.array(z.unknown()).transform((items) => items.flatMap((value) => {
    const parsed = item.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }));
}

/** A list of enum values read from a response: unknown values are skipped. */
export function knownValues<const T extends readonly [string, ...string[]]>(values: T) {
  const known = new Set<string>(values);
  return z.array(z.string()).transform((list) => list.filter((value): value is T[number] => known.has(value)));
}
