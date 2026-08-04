export const CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID =
  "CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID" as const;

export class CanonicalMembershipOperatorCommandError extends Error {
  constructor(
    readonly code = CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID,
  ) {
    super("Canonical membership operator command is invalid.");
    this.name = "CanonicalMembershipOperatorCommandError";
  }
}

export type CanonicalMembershipOperatorCommand =
  | Readonly<{
      manifestFile: string;
      mode: "dry-run";
      workspaceId: string;
    }>
  | Readonly<{
      manifestFile: string;
      migrationRunId: string;
      mode: "apply";
      reviewFile: string;
      workspaceId: string;
    }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VALUE_OPTIONS = new Set([
  "--manifest-file",
  "--migration-run-id",
  "--review-file",
  "--workspace-id",
]);

function failure(): never {
  throw new CanonicalMembershipOperatorCommandError();
}

function id(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function path(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_096 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  );
}

/** Strict argv parser; reviewed artifacts are files, never inline values or stdin. */
export function parseCanonicalMembershipOperatorCommand(
  argv: readonly string[],
): CanonicalMembershipOperatorCommand {
  try {
    if (!Array.isArray(argv)) failure();
    const values = new Map<string, string | true>();
    for (let index = 0; index < argv.length; index += 1) {
      const option = argv[index];
      if (
        typeof option !== "string" ||
        !option.startsWith("--") ||
        option.includes("=") ||
        values.has(option)
      ) {
        failure();
      }
      if (option === "--dry-run" || option === "--apply") {
        values.set(option, true);
        continue;
      }
      if (!VALUE_OPTIONS.has(option)) failure();
      const value = argv[index + 1];
      if (!path(value) || value.startsWith("--")) failure();
      values.set(option, value);
      index += 1;
    }

    const dryRun = values.has("--dry-run");
    const apply = values.has("--apply");
    if (dryRun === apply) failure();
    const workspaceId = values.get("--workspace-id");
    const manifestFile = values.get("--manifest-file");
    if (!id(workspaceId) || !path(manifestFile)) failure();

    if (dryRun) {
      if (values.has("--review-file") || values.has("--migration-run-id")) {
        failure();
      }
      return Object.freeze({
        manifestFile,
        mode: "dry-run" as const,
        workspaceId,
      });
    }

    const reviewFile = values.get("--review-file");
    const migrationRunId = values.get("--migration-run-id");
    if (!path(reviewFile) || !id(migrationRunId)) failure();
    return Object.freeze({
      manifestFile,
      migrationRunId,
      mode: "apply" as const,
      reviewFile,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorCommandError) throw error;
    failure();
  }
}
