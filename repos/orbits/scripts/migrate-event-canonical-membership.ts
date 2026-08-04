import { pathToFileURL } from "node:url";

import {
  CanonicalMembershipMigrationApplyError,
  type CanonicalMembershipMigrationApplyErrorCode,
} from "../features/events/registration/canonical-migration/apply-repository";
import {
  CanonicalMembershipOperatorError,
  runCanonicalMembershipOperator,
  type CanonicalMembershipOperatorDependencies,
} from "../features/events/registration/canonical-migration/operator-runner";
import { loadLocalEnv } from "./load-local-env";

export interface CanonicalMembershipOperatorCliOutcome {
  readonly exitCode: number;
  readonly payload: Readonly<object>;
  readonly stream: "stderr" | "stdout";
}

function failure(
  exitCode: number,
  code: string,
): CanonicalMembershipOperatorCliOutcome {
  return Object.freeze({
    exitCode,
    payload: Object.freeze({ error: code, ok: false }),
    stream: "stderr" as const,
  });
}

function applyFailureExitCode(
  code: CanonicalMembershipMigrationApplyErrorCode,
): number {
  switch (code) {
    case "CANONICAL_MEMBERSHIP_MIGRATION_COMMAND_INVALID":
      return 64;
    case "CANONICAL_MEMBERSHIP_MIGRATION_MANIFEST_INVALID":
      return 65;
    case "CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY":
      return 69;
    case "CANONICAL_MEMBERSHIP_MIGRATION_RETRY_EXHAUSTED":
      return 75;
    case "CANONICAL_MEMBERSHIP_MIGRATION_ACTIVATION_INVALID":
    case "CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT":
    case "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_ALREADY_APPLIED":
    case "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT":
    case "CANONICAL_MEMBERSHIP_MIGRATION_REPLAY_MISMATCH":
      return 73;
    case "CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED":
      return 70;
  }
}

export async function executeCanonicalMembershipOperatorCli(
  argv: unknown,
  environment: NodeJS.ProcessEnv,
  dependencies: CanonicalMembershipOperatorDependencies = {},
): Promise<CanonicalMembershipOperatorCliOutcome> {
  try {
    const connectionString = environment.ORBIT_EVENT_DATABASE_URL;
    const workspaceId = environment.ORBIT_WORKSPACE_ID;
    if (
      typeof connectionString !== "string" ||
      !connectionString ||
      connectionString.trim() !== connectionString ||
      typeof workspaceId !== "string" ||
      !workspaceId ||
      workspaceId.trim() !== workspaceId
    ) {
      return failure(64, "CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
    }
    const result = await runCanonicalMembershipOperator(
      argv,
      { connectionString, workspaceId },
      dependencies,
    );
    return Object.freeze({
      exitCode:
        result.mode === "dry-run" && !result.applyEligible ? 2 : 0,
      payload: result,
      stream: "stdout" as const,
    });
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorError) {
      switch (error.code) {
        case "CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID":
        case "CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID":
          return failure(64, error.code);
        case "CANONICAL_MEMBERSHIP_OPERATOR_FILE_INVALID":
        case "CANONICAL_MEMBERSHIP_OPERATOR_MANIFEST_INVALID":
        case "CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID":
          return failure(65, error.code);
        case "CANONICAL_MEMBERSHIP_OPERATOR_DRY_RUN_FAILED":
          return failure(70, error.code);
      }
    }
    if (error instanceof CanonicalMembershipMigrationApplyError) {
      return failure(applyFailureExitCode(error.code), error.code);
    }
    return failure(70, "CANONICAL_MEMBERSHIP_OPERATOR_INTERNAL_FAILED");
  }
}

export async function main(argv: unknown = process.argv.slice(2)): Promise<void> {
  loadLocalEnv();
  const outcome = await executeCanonicalMembershipOperatorCli(
    argv,
    process.env,
  );
  const line = JSON.stringify(outcome.payload);
  if (outcome.stream === "stdout") console.log(line);
  else console.error(line);
  process.exitCode = outcome.exitCode;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        error: "CANONICAL_MEMBERSHIP_OPERATOR_INTERNAL_FAILED",
        ok: false,
      }),
    );
    process.exitCode = 70;
  });
}
