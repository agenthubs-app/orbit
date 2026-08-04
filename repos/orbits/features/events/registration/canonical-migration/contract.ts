import { createHash } from "node:crypto";

import type { EventRegistration } from "../contract";

export const CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION = 1 as const;
export const CANONICAL_MEMBERSHIP_MIGRATION_ID = "canonical-membership-v1" as const;

export type CanonicalMembershipMigrationAction =
  | "activate"
  | "verify_canonical"
  | "blocked";
export type CanonicalMembershipAuthority =
  | "legacy_registration"
  | "canonical_membership";

export interface CanonicalMembershipMigrationBlocker {
  code: string;
  eventId: string | null;
  message: string;
  recordId: string | null;
}

export interface CanonicalMembershipMigrationDeadline {
  evidenceId: string;
  profileEditDeadlineAt: string;
  source: "event_operations_configuration" | "operator_manifest";
}

export interface CanonicalMembershipMigrationSourceSummary {
  cancelled: number;
  count: number;
  hash: string;
  rsvped: number;
}

export interface CanonicalMembershipMigrationEventPlan {
  action: CanonicalMembershipMigrationAction;
  authority: CanonicalMembershipAuthority;
  blockers: readonly CanonicalMembershipMigrationBlocker[];
  currentState: "canonical" | "legacy";
  deadline: CanonicalMembershipMigrationDeadline | null;
  eventId: string;
  source: CanonicalMembershipMigrationSourceSummary;
}

export interface CanonicalMembershipMigrationPlan {
  applyEligible: boolean;
  applyPlanHash: string | null;
  blockers: readonly CanonicalMembershipMigrationBlocker[];
  diagnosticHash: string;
  eventCoreHash: string;
  eventCount: number;
  events: readonly CanonicalMembershipMigrationEventPlan[];
  manifestHash: string;
  migrationId: string;
  schemaVersion: typeof CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION;
  total: {
    cancelled: number;
    registrations: number;
    rsvped: number;
  };
}

export interface CanonicalMembershipOperatorManifestEntry {
  evidenceId: string;
  profileEditDeadlineAt: string;
  source: "operator_manifest";
}

export interface CanonicalMembershipOperatorManifest {
  events: Readonly<Record<string, CanonicalMembershipOperatorManifestEntry>>;
  schemaVersion: typeof CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION;
}

export interface ParsedCanonicalMembershipOperatorManifest {
  blockers: readonly CanonicalMembershipMigrationBlocker[];
  manifest: CanonicalMembershipOperatorManifest | null;
  manifestHash: string;
}

export interface CanonicalMembershipMigrationConfigurationDeadline {
  configurationVersion: number;
  profileEditDeadlineAt: string;
}

export interface CanonicalMembershipMigrationCanonicalFact {
  activationBaselineValid: boolean;
  authority: "canonical_membership";
  configurationDeadline: CanonicalMembershipMigrationConfigurationDeadline | null;
  contentHash: string;
  eventId: string;
  eventVersion: number;
  registrations: readonly EventRegistration[];
}

export interface CanonicalMembershipMigrationLegacyFact {
  authority: "legacy_registration";
  configurationDeadline: CanonicalMembershipMigrationConfigurationDeadline | null;
  contentHash: string;
  eventId: string;
  eventVersion: number;
  registrations: readonly EventRegistration[];
}

export type CanonicalMembershipMigrationEventFact =
  | CanonicalMembershipMigrationCanonicalFact
  | CanonicalMembershipMigrationLegacyFact;

export function stableCanonicalMigrationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCanonicalMigrationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableCanonicalMigrationValue(item)]),
  );
}

export function canonicalMigrationHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableCanonicalMigrationValue(value)))
    .digest("hex");
}

function diagnosticValue(
  value: unknown,
  seen: WeakMap<object, string>,
  path: string,
): unknown {
  const kind = typeof value;
  if (kind === "undefined") return { $type: "undefined" };
  if (kind === "bigint") return { $type: "bigint", value: String(value) };
  if (kind === "function") return { $type: "function" };
  if (kind === "symbol") return { $type: "symbol", value: String(value) };
  if (kind === "number" && !Number.isFinite(value as number)) {
    return { $type: "nonfinite-number", value: String(value) };
  }
  if (!value || kind !== "object") return value;

  const objectValue = value as object;
  const previousPath = seen.get(objectValue);
  if (previousPath) return { $ref: previousPath, $type: "circular" };
  seen.set(objectValue, path);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        diagnosticValue(item, seen, `${path}[${index}]`),
      );
    }
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      try {
        output[key] = diagnosticValue(
          (value as Record<string, unknown>)[key],
          seen,
          `${path}.${key}`,
        );
      } catch {
        output[key] = { $type: "unreadable-property" };
      }
    }
    return output;
  } catch {
    return { $type: "unreadable-object" };
  }
}

export function canonicalMigrationDiagnosticHash(
  domain: string,
  value: unknown,
): string {
  let sanitized: unknown;
  try {
    sanitized = diagnosticValue(value, new WeakMap(), "$input");
  } catch {
    sanitized = { $type: "unreadable-input" };
  }
  return canonicalMigrationHash({ domain, value: sanitized });
}
