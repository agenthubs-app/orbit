import {
  CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  canonicalMigrationDiagnosticHash,
  canonicalMigrationHash,
  type CanonicalMembershipMigrationBlocker,
  type CanonicalMembershipOperatorManifestEntry,
  type ParsedCanonicalMembershipOperatorManifest,
} from "./contract";
import { parseJsonWithUniqueObjectKeys } from "../operator-json";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = [...allowed].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function blocker(code: string, message: string): CanonicalMembershipMigrationBlocker {
  return { code, eventId: null, message, recordId: null };
}

function normalizedRfc3339Timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(
    value,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    year < 1 ||
    year > 9_999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    offsetHour < 0 ||
    offsetHour > 23 ||
    offsetMinute < 0 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseManifest(
  input: unknown,
): ParsedCanonicalMembershipOperatorManifest {
  let value = input;
  const blockers: CanonicalMembershipMigrationBlocker[] = [];
  if (typeof input === "string") {
    try {
      value = parseJsonWithUniqueObjectKeys(input);
    } catch {
      return {
        blockers: [blocker("MANIFEST_JSON_INVALID", "Operator manifest JSON is invalid.")],
        manifest: null,
        manifestHash: canonicalMigrationDiagnosticHash(
          "canonical-membership-operator-manifest-invalid-json",
          input,
        ),
      };
    }
  }
  const root = object(value);
  if (
    !root ||
    !exactKeys(root, ["schemaVersion", "events"]) ||
    root.schemaVersion !== CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION ||
    !object(root.events)
  ) {
    return {
      blockers: [blocker("MANIFEST_SCHEMA_INVALID", "Operator manifest v1 shape is invalid.")],
      manifest: null,
      manifestHash: canonicalMigrationDiagnosticHash(
        "canonical-membership-operator-manifest-invalid-schema",
        value,
      ),
    };
  }

  const parsedEntries: Array<
    readonly [string, CanonicalMembershipOperatorManifestEntry]
  > = [];
  Object.entries(root.events as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([eventId, rawEntry]) => {
    const entry = object(rawEntry);
    const profileEditDeadlineAt = entry
      ? normalizedRfc3339Timestamp(entry.profileEditDeadlineAt)
      : null;
    if (
      !eventId.trim() ||
      eventId !== eventId.trim() ||
      !entry ||
      !exactKeys(entry, [
        "evidenceId",
        "profileEditDeadlineAt",
        "source",
      ]) ||
      typeof entry.evidenceId !== "string" ||
      !entry.evidenceId.trim() ||
      entry.evidenceId !== entry.evidenceId.trim() ||
      entry.source !== "operator_manifest" ||
      !profileEditDeadlineAt
    ) {
      blockers.push(
        blocker("MANIFEST_ENTRY_INVALID", `Operator manifest event ${eventId} is invalid.`),
      );
      return;
    }
    parsedEntries.push([
      eventId,
      {
        evidenceId: entry.evidenceId,
        profileEditDeadlineAt,
        source: "operator_manifest",
      },
    ]);
  });

  const manifest = {
    events: Object.fromEntries(parsedEntries),
    schemaVersion: CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  } as const;
  return {
    blockers,
    manifest,
    manifestHash:
      blockers.length === 0
        ? canonicalMigrationHash(manifest)
        : canonicalMigrationDiagnosticHash(
            "canonical-membership-operator-manifest-invalid-entry",
            value,
          ),
  };
}

export function parseCanonicalMembershipOperatorManifest(
  input: unknown,
): ParsedCanonicalMembershipOperatorManifest {
  try {
    return parseManifest(input);
  } catch {
    return {
      blockers: [
        blocker(
          "MANIFEST_SCHEMA_INVALID",
          "Operator manifest could not be inspected safely.",
        ),
      ],
      manifest: null,
      manifestHash: canonicalMigrationDiagnosticHash(
        "canonical-membership-operator-manifest-unreadable",
        input,
      ),
    };
  }
}
