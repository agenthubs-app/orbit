import type {
  EventRegistrationRosterEntry,
  EventRegistrationRosterFields,
} from "./contract";

/**
 * Roster projection (W0029): the attendee roster and the anonymous preview
 * read whole events, but only `status`, `displayName` and the `industry` /
 * `positioning` answers of rsvped rows. The projection keeps each value's JSON
 * type class so both consumers succeed, fall back, skip or throw exactly as
 * they do on the full `EventRegistration`:
 *   * a leaf keeps a string, maps missing/null to null and anything else to 0
 *     (`?.trim()` / `?.split()` short-circuit only on null/undefined, and throw
 *     on 0 as on any other non-string);
 *   * a missing/null profile or answers stays null (reading through it
 *     throws); any other non-object becomes 0 (reading a key gives undefined);
 *   * the preview drops `positioning` when `industry` is a non-blank string,
 *     because the preview only falls back to it when `industry.trim()` is empty.
 * `rosterEntryFromRegistration` does this in JS; the SQL helpers below do the
 * same in PostgreSQL (jsonb, never `->>`/`#>>` text on a leaf) and
 * `rosterEntryFromRow` rebuilds the entry.
 */

type Leaf = string | null | 0;
const NON_OBJECT = 0;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leaf(value: unknown): Leaf {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : 0;
}

function nested(value: unknown): "missing" | "non-object" | "object" {
  if (value === undefined || value === null) return "missing";
  return isJsonObject(value) ? "object" : "non-object";
}

/** Shape of an rsvped row's profile: null when profile and answers are objects. */
type ShapeCode = "P" | "p" | "A" | "a" | null;

function entry(
  status: string | null,
  fields: EventRegistrationRosterFields,
  shape: ShapeCode,
  leaves: { displayName?: Leaf; industry?: Leaf; positioning?: Leaf },
): EventRegistrationRosterEntry {
  if (status !== "rsvped") return { participantProfile: null, status };
  if (shape === "P") return { participantProfile: null, status };
  if (shape === "p") return { participantProfile: NON_OBJECT as never, status };
  const answers =
    shape === "A"
      ? null
      : shape === "a"
        ? NON_OBJECT
        : fields === "attendees"
          ? { positioning: leaves.positioning ?? null }
          : { industry: leaves.industry ?? null, positioning: leaves.positioning ?? null };
  return {
    participantProfile: (fields === "attendees"
      ? { answers, displayName: leaves.displayName ?? null }
      : { answers }) as never,
    status,
  };
}

/** Same characters as JavaScript's `String.prototype.trim`. */
const JS_TRIM_CHARACTERS =
  "\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const JS_TRIM_REGEX = new RegExp(`^[${JS_TRIM_CHARACTERS}]*$`, "u");

function isNonBlankString(value: unknown): boolean {
  return typeof value === "string" && !JS_TRIM_REGEX.test(value);
}

export function rosterEntryFromRegistration(
  registration: { participantProfile?: unknown; status?: unknown },
  fields: EventRegistrationRosterFields,
): EventRegistrationRosterEntry {
  const status = typeof registration.status === "string" ? registration.status : null;
  if (status !== "rsvped") return entry(status, fields, null, {});
  const profile = registration.participantProfile;
  const profileShape = nested(profile);
  if (profileShape !== "object") {
    return entry(status, fields, profileShape === "missing" ? "P" : "p", {});
  }
  const record = profile as Record<string, unknown>;
  const displayName = fields === "attendees" ? leaf(record.displayName) : undefined;
  const answersShape = nested(record.answers);
  if (answersShape !== "object") {
    return entry(status, fields, answersShape === "missing" ? "A" : "a", { displayName });
  }
  const answers = record.answers as Record<string, unknown>;
  return entry(status, fields, null, {
    displayName,
    industry: fields === "preview" ? leaf(answers.industry) : undefined,
    positioning:
      fields === "preview" && isNonBlankString(answers.industry)
        ? null
        : leaf(answers.positioning),
  });
}

/** Row of a roster projection query (short names keep the returned bytes small). */
export interface RosterEntryRow {
  /** rsvped rows: profile shape (`ShapeCode`); otherwise a read-specific marker. */
  k: string | null;
  /** displayName leaf (attendees only). */
  n?: unknown;
  /** industry leaf (preview only). */
  i?: unknown;
  /** positioning leaf. */
  q?: unknown;
  /** stored status when it is a string. */
  s: string | null;
}

export function rosterEntryFromRow(
  row: RosterEntryRow,
  fields: EventRegistrationRosterFields,
): EventRegistrationRosterEntry {
  const status = typeof row.s === "string" ? row.s : null;
  if (status === "rsvped" && row.k !== null && !["P", "p", "A", "a"].includes(row.k)) {
    throw new Error("Unexpected event registration roster row.");
  }
  const sqlLeaf = (value: unknown): Leaf => leaf(value);
  return entry(status, fields, status === "rsvped" ? (row.k as ShapeCode) : null, {
    displayName: fields === "attendees" ? sqlLeaf(row.n) : undefined,
    industry: fields === "preview" ? sqlLeaf(row.i) : undefined,
    positioning: sqlLeaf(row.q),
  });
}

/** jsonb leaf: the string itself, NULL for missing/null, 0 for any other type. */
function leafSql(value: string): string {
  return `case when jsonb_typeof(${value}) = 'string' then ${value}
        when coalesce(jsonb_typeof(${value}), 'null') <> 'null' then '0'::jsonb end`;
}

/**
 * Select-list columns `k`, `n` or `i`, and `q` for a roster projection.
 * `profile` is a jsonb expression for the stored profile, `rsvped` a boolean
 * SQL expression; both must be trusted SQL, never user input. The caller
 * selects `s` and may wrap `k` to report read-specific problems.
 */
export function rosterEntryShapeSql(profile: string, rsvped: string): string {
  const answers = `(${profile} -> 'answers')`;
  return `case when ${rsvped} then
        case when coalesce(jsonb_typeof(${profile}), 'null') = 'null' then 'P'
          when jsonb_typeof(${profile}) <> 'object' then 'p'
          when coalesce(jsonb_typeof(${answers}), 'null') = 'null' then 'A'
          when jsonb_typeof(${answers}) <> 'object' then 'a' end
      end`;
}

export function rosterEntryLeafColumnsSql(
  profile: string,
  rsvped: string,
  fields: EventRegistrationRosterFields,
): string {
  const answers = `(${profile} -> 'answers')`;
  const profileObject = `${rsvped} and jsonb_typeof(${profile}) = 'object'`;
  const answersObject = `${profileObject} and jsonb_typeof(${answers}) = 'object'`;
  const industry = `(${answers} -> 'industry')`;
  const positioning = leafSql(`(${answers} -> 'positioning')`);
  if (fields === "attendees") {
    return `
      case when ${profileObject} then ${leafSql(`(${profile} -> 'displayName')`)} end as n,
      case when ${answersObject} then ${positioning} end as q`;
  }
  // `#>> '{}'` only tests a value already known to be a JSON string.
  return `
      case when ${answersObject} then ${leafSql(industry)} end as i,
      case when ${answersObject} and not coalesce(jsonb_typeof(${industry}) = 'string'
          and (${industry} #>> '{}') ~ '[^${JS_TRIM_CHARACTERS}]', false)
        then ${positioning} end as q`;
}
