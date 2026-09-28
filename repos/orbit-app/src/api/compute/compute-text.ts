/**
 * Sprint 0117 (dashboard D3): the text and time primitives of the shared
 * computations, pinned so the server (Node, ICU, whatever its process locale
 * is), the phone (Hermes) and the browser build (V8) give the same answers.
 * This is the only file of shared/compute that may call localeCompare-like,
 * Intl or Date-parsing APIs (tests/support/shared-compute-audit.ts).
 *
 *   compareText      the order String.prototype.localeCompare gave on the
 *                    production server (locale en-US, ICU root rules for
 *                    everything en-US does not tailor). Strings made only of
 *                    printable ASCII are compared here, with the ICU root
 *                    table below (non-ignorable punctuation, then digits, then
 *                    letters; lower case before upper case at the third
 *                    level), so they never depend on the runtime. Anything else
 *                    goes to Intl.Collator("en-US"): the same ICU rules on the
 *                    server and in a browser; on the phone, Hermes' collator.
 *   parseTimestamp   Date.parse for the ISO 8601 forms the data holds
 *                    (date, date-time with optional seconds, fraction and
 *                    offset; "T" or a space), read as UTC when no offset is
 *                    given — what the production server (TZ=UTC) returns.
 *                    Other strings fall back to Date.parse.
 *   lowerText        toLowerCase (locale-independent), the result the
 *                    server's toLocaleLowerCase() gave in its en/ja locales.
 */

/** Printable ASCII in ICU root primary order; characters in one entry share a primary weight. */
const ASCII_PRIMARY_GROUPS = [
  " ", "_", "-", ",", ";", ":", "!", "?", ".", "'", "\"", "(", ")", "[", "]", "{", "}", "@", "*", "/", "\\", "&", "#", "%", "`", "^", "+", "<", "=", ">", "|", "~", "$",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "aA", "bB", "cC", "dD", "eE", "fF", "gG", "hH", "iI", "jJ", "kK", "lL", "mM", "nN", "oO", "pP", "qQ", "rR", "sS", "tT", "uU", "vV", "wW", "xX", "yY", "zZ",
] as const;

const PRIMARY_WEIGHT: number[] = (() => {
  const weights: number[] = new Array<number>(128).fill(-1);
  ASCII_PRIMARY_GROUPS.forEach((group, weight) => {
    for (const character of group) weights[character.charCodeAt(0)] = weight;
  });
  return weights;
})();

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

/** Primary weights of a printable-ASCII string, or null when it has any other character. */
function asciiPrimaryWeights(value: string): number[] | null {
  const weights: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const weight = code < 128 ? PRIMARY_WEIGHT[code] ?? -1 : -1;
    if (weight < 0) return null;
    weights.push(weight);
  }
  return weights;
}

let collator: Intl.Collator | null = null;

function runtimeCollator(): Intl.Collator {
  collator ??= new Intl.Collator("en-US");
  return collator;
}

/** -1, 0 or 1: the order of `left` and `right` (see the file comment). */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  const leftWeights = asciiPrimaryWeights(left);
  const rightWeights = leftWeights ? asciiPrimaryWeights(right) : null;
  if (leftWeights && rightWeights) {
    const shared = Math.min(leftWeights.length, rightWeights.length);
    for (let index = 0; index < shared; index += 1) {
      const difference = leftWeights[index]! - rightWeights[index]!;
      if (difference !== 0) return sign(difference);
    }
    if (leftWeights.length !== rightWeights.length) return sign(leftWeights.length - rightWeights.length);
    // Equal at the primary level: lower case sorts before upper case.
    for (let index = 0; index < left.length; index += 1) {
      const leftUpper = left.charCodeAt(index) >= 65 && left.charCodeAt(index) <= 90 ? 1 : 0;
      const rightUpper = right.charCodeAt(index) >= 65 && right.charCodeAt(index) <= 90 ? 1 : 0;
      if (leftUpper !== rightUpper) return sign(leftUpper - rightUpper);
    }
    return 0;
  }
  return sign(runtimeCollator().compare(left, right));
}

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/;

/** Milliseconds since the epoch, or NaN (see the file comment). */
export function parseTimestamp(value: string): number {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return Date.parse(value);
  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = hour === undefined ? 0 : Number(hour);
  const minuteNumber = minute === undefined ? 0 : Number(minute);
  const secondNumber = second === undefined ? 0 : Number(second);
  const valid = Number(year) >= 100 && monthNumber >= 1 && monthNumber <= 12 && dayNumber >= 1 && dayNumber <= 31
    && minuteNumber <= 59 && secondNumber <= 59 && (hourNumber < 24 || (hourNumber === 24 && minuteNumber === 0 && secondNumber === 0));
  if (!valid) return Date.parse(value);
  const milliseconds = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  let time = Date.UTC(Number(year), monthNumber - 1, dayNumber, hourNumber, minuteNumber, secondNumber, milliseconds);
  if (offset !== undefined && offset !== "Z" && offset !== "z") {
    const digits = offset.replace(":", "");
    const minutes = Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5));
    time -= (offset.startsWith("-") ? -1 : 1) * minutes * 60_000;
  }
  return time;
}

/** An ISO string (UTC, milliseconds) for a time in milliseconds; NaN stays invalid. */
export function isoTimestamp(time: number): string | null {
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Locale-independent lower case. */
export function lowerText(value: string): string {
  return value.toLowerCase();
}
