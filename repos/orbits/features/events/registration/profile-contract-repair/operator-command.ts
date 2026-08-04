export const PROFILE_CONTRACT_REPAIR_OPERATOR_COMMAND_INVALID =
  "PROFILE_CONTRACT_REPAIR_OPERATOR_COMMAND_INVALID" as const;

export class ProfileContractRepairOperatorCommandError extends Error {
  constructor(readonly code = PROFILE_CONTRACT_REPAIR_OPERATOR_COMMAND_INVALID) {
    super("Profile contract repair operator command is invalid.");
    this.name = "ProfileContractRepairOperatorCommandError";
  }
}

export type ProfileContractRepairOperatorCommand =
  | Readonly<{
      mode: "dry-run";
      scopeManifest: string;
      workspaceId: string;
    }>
  | Readonly<{
      expectedCount: number;
      expectedPlanHash: string;
      mode: "apply";
      repairId: string;
      scopeManifest: string;
      workspaceId: string;
    }>;

const HASH = /^[a-f0-9]{64}$/u;
const REPAIR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VALUE_OPTIONS = new Set([
  "--workspace-id",
  "--scope-manifest",
  "--repair-id",
  "--expected-count",
  "--expected-plan-hash",
]);

function failure(): never {
  throw new ProfileContractRepairOperatorCommandError();
}

function nonEmptyToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function scopeManifestPath(value: unknown): value is string {
  return (
    nonEmptyToken(value) &&
    value.length <= 4_096 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  );
}

/** Strict parser for the reviewed repair boundary; it intentionally accepts no inline flags. */
export function parseProfileContractRepairOperatorCommand(
  argv: readonly string[],
): ProfileContractRepairOperatorCommand {
  try {
    if (!Array.isArray(argv)) return failure();
    const options = new Map<string, string | true>();
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (typeof arg !== "string" || !arg.startsWith("--") || arg.includes("=")) return failure();
      if (arg === "--dry-run" || arg === "--apply") {
        if (options.has(arg)) return failure();
        options.set(arg, true);
        continue;
      }
      if (!VALUE_OPTIONS.has(arg) || options.has(arg)) return failure();
      const value = argv[index + 1];
      if (!nonEmptyToken(value) || value.startsWith("--")) return failure();
      options.set(arg, value);
      index += 1;
    }

    const dryRun = options.has("--dry-run");
    const apply = options.has("--apply");
    if (dryRun === apply) return failure();
    const workspaceId = options.get("--workspace-id");
    const scopeManifest = options.get("--scope-manifest");
    if (
      !nonEmptyToken(workspaceId) || !WORKSPACE_ID.test(workspaceId) ||
      !scopeManifestPath(scopeManifest)
    ) return failure();

    const applyOnly = ["--repair-id", "--expected-count", "--expected-plan-hash"] as const;
    if (dryRun) {
      if (applyOnly.some((key) => options.has(key))) return failure();
      return Object.freeze({ mode: "dry-run" as const, scopeManifest, workspaceId });
    }
    const repairId = options.get("--repair-id");
    const expectedCountText = options.get("--expected-count");
    const expectedPlanHash = options.get("--expected-plan-hash");
    if (
      !nonEmptyToken(repairId) || !REPAIR_ID.test(repairId) ||
      !nonEmptyToken(expectedCountText) || !/^[1-9][0-9]*$/u.test(expectedCountText) ||
      !nonEmptyToken(expectedPlanHash) || !HASH.test(expectedPlanHash)
    ) return failure();
    const expectedCount = Number(expectedCountText);
    if (!Number.isSafeInteger(expectedCount)) return failure();
    return Object.freeze({
      expectedCount,
      expectedPlanHash,
      mode: "apply" as const,
      repairId,
      scopeManifest,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof ProfileContractRepairOperatorCommandError) throw error;
    return failure();
  }
}
