import { parseJsonWithUniqueObjectKeys } from "../operator-json";

export const CANONICAL_MEMBERSHIP_MIGRATION_APPLY_COMMAND_INVALID =
  "CANONICAL_MEMBERSHIP_MIGRATION_APPLY_COMMAND_INVALID" as const;

export class CanonicalMembershipMigrationApplyCommandError extends Error {
  constructor(readonly code = CANONICAL_MEMBERSHIP_MIGRATION_APPLY_COMMAND_INVALID) {
    super("Canonical membership migration apply command is invalid.");
    this.name = "CanonicalMembershipMigrationApplyCommandError";
  }
}

export interface CanonicalMembershipMigrationApplyCommand {
  readonly connectionString: string;
  readonly expectedCount: number;
  readonly expectedPlanHash: string;
  readonly manifestHash: string;
  readonly migrationRunId: string;
  readonly workspaceId: string;
}

const KEYS = ["connectionString", "expectedCount", "expectedPlanHash", "manifestHash", "migrationRunId", "workspaceId"] as const;
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

export function parseCanonicalMembershipMigrationApplyCommand(input: unknown): CanonicalMembershipMigrationApplyCommand {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw 0;
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw 0;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== KEYS.length || !KEYS.every((key) => keys.includes(key))) throw 0;
    const values = Object.create(null) as Record<string, unknown>;
    for (const key of KEYS) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw 0;
      values[key] = descriptor.value;
    }
    if (
      typeof values.connectionString !== "string" || !values.connectionString || values.connectionString.trim() !== values.connectionString ||
      typeof values.workspaceId !== "string" || !ID.test(values.workspaceId) ||
      typeof values.migrationRunId !== "string" || !ID.test(values.migrationRunId) ||
      typeof values.expectedPlanHash !== "string" || !HASH.test(values.expectedPlanHash) ||
      typeof values.manifestHash !== "string" || !HASH.test(values.manifestHash) ||
      !Number.isSafeInteger(values.expectedCount) || Number(values.expectedCount) < 0
    ) throw 0;
    return Object.freeze({ connectionString: values.connectionString, expectedCount: values.expectedCount as number, expectedPlanHash: values.expectedPlanHash, manifestHash: values.manifestHash, migrationRunId: values.migrationRunId, workspaceId: values.workspaceId });
  } catch { throw new CanonicalMembershipMigrationApplyCommandError(); }
}

/** JSON.parse accepts duplicate object keys; operator manifests must not. */
export function parseCanonicalMembershipMigrationOperatorManifestJson(input: unknown): unknown {
  try {
    return parseJsonWithUniqueObjectKeys(input);
  } catch { throw new CanonicalMembershipMigrationApplyCommandError(); }
}
