import { applyCanonicalMembershipMigration } from "./apply-repository";
import type { CanonicalMembershipMigrationApplyResult } from "./apply-repository";
import {
  CanonicalMembershipOperatorCommandError,
  parseCanonicalMembershipOperatorCommand,
} from "./operator-command";
import { parseCanonicalMembershipOperatorManifest } from "./operator-manifest";
import {
  buildCanonicalMembershipOperatorReview,
  CanonicalMembershipOperatorReviewError,
  parseCanonicalMembershipOperatorReviewJson,
  type CanonicalMembershipOperatorReview,
} from "./operator-review";
import { buildCanonicalMembershipMigrationPlan } from "./planner";
import {
  withCanonicalMembershipMigrationSnapshot,
  type CanonicalMembershipMigrationSnapshot,
} from "./snapshot-runner";
import { readCanonicalMembershipMigrationSource } from "./source-reader";
import {
  OperatorReviewedFileError,
  readOperatorReviewedFile,
} from "../operator-reviewed-file";

export type CanonicalMembershipOperatorErrorCode =
  | "CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID"
  | "CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID"
  | "CANONICAL_MEMBERSHIP_OPERATOR_DRY_RUN_FAILED"
  | "CANONICAL_MEMBERSHIP_OPERATOR_FILE_INVALID"
  | "CANONICAL_MEMBERSHIP_OPERATOR_MANIFEST_INVALID"
  | "CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID";

export class CanonicalMembershipOperatorError extends Error {
  constructor(readonly code: CanonicalMembershipOperatorErrorCode) {
    super("Canonical membership operator operation failed.");
    this.name = "CanonicalMembershipOperatorError";
  }
}

export interface CanonicalMembershipOperatorConfig {
  readonly connectionString: string;
  readonly workspaceId: string;
}

export type CanonicalMembershipOperatorResult =
  | CanonicalMembershipOperatorReview
  | Readonly<CanonicalMembershipMigrationApplyResult & { mode: "apply" }>;

type MigrationSource = Awaited<
  ReturnType<typeof readCanonicalMembershipMigrationSource>
>;

export interface CanonicalMembershipOperatorDependencies {
  readonly apply?: typeof applyCanonicalMembershipMigration;
  readonly buildPlan?: typeof buildCanonicalMembershipMigrationPlan;
  readonly readFile?: (path: string) => Promise<string>;
  readonly readSource?: (input: {
    snapshot: CanonicalMembershipMigrationSnapshot;
    workspaceId: string;
  }) => Promise<MigrationSource>;
  readonly withSnapshot?: <T>(input: {
    connectionString: string;
    isolation?: "repeatable read" | "serializable";
    operation: (
      snapshot: CanonicalMembershipMigrationSnapshot,
    ) => Promise<T>;
  }) => Promise<T>;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

function fail(code: CanonicalMembershipOperatorErrorCode): never {
  throw new CanonicalMembershipOperatorError(code);
}

function parseConfig(input: unknown): CanonicalMembershipOperatorConfig {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    ) {
      fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
    }
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 2 ||
      !keys.includes("connectionString") ||
      !keys.includes("workspaceId")
    ) {
      fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
    }
    const values = Object.create(null) as Record<string, unknown>;
    for (const key of ["connectionString", "workspaceId"] as const) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
      }
      values[key] = descriptor.value;
    }
    if (
      typeof values.connectionString !== "string" ||
      !values.connectionString ||
      values.connectionString.trim() !== values.connectionString ||
      typeof values.workspaceId !== "string" ||
      !ID.test(values.workspaceId)
    ) {
      fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
    }
    return Object.freeze({
      connectionString: values.connectionString,
      workspaceId: values.workspaceId,
    });
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorError) throw error;
    fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
  }
}

async function readReviewedFile(
  path: string,
  readFile: (path: string) => Promise<string>,
): Promise<string> {
  try {
    return await readFile(path);
  } catch {
    fail("CANONICAL_MEMBERSHIP_OPERATOR_FILE_INVALID");
  }
}

export async function runCanonicalMembershipOperator(
  argv: unknown,
  configInput: unknown,
  dependencies: CanonicalMembershipOperatorDependencies = {},
): Promise<CanonicalMembershipOperatorResult> {
  const config = parseConfig(configInput);
  let command;
  try {
    command = parseCanonicalMembershipOperatorCommand(
      argv as readonly string[],
    );
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorCommandError) {
      fail("CANONICAL_MEMBERSHIP_OPERATOR_COMMAND_INVALID");
    }
    throw error;
  }
  if (command.workspaceId !== config.workspaceId) {
    fail("CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID");
  }

  const readFile = dependencies.readFile ?? readOperatorReviewedFile;
  const rawManifest = await readReviewedFile(command.manifestFile, readFile);
  const parsedManifest = parseCanonicalMembershipOperatorManifest(rawManifest);

  if (command.mode === "dry-run") {
    const withSnapshot =
      dependencies.withSnapshot ?? withCanonicalMembershipMigrationSnapshot;
    const readSource =
      dependencies.readSource ?? readCanonicalMembershipMigrationSource;
    const buildPlan =
      dependencies.buildPlan ?? buildCanonicalMembershipMigrationPlan;
    try {
      const plan = await withSnapshot({
        connectionString: config.connectionString,
        isolation: "repeatable read",
        operation: async (snapshot) => {
          const source = await readSource({
            snapshot,
            workspaceId: config.workspaceId,
          });
          return buildPlan({
            facts: source.facts,
            parsedManifest,
            sourceBlockers: source.blockers,
          });
        },
      });
      return buildCanonicalMembershipOperatorReview({
        plan,
        workspaceId: config.workspaceId,
      });
    } catch (error) {
      if (error instanceof CanonicalMembershipOperatorError) throw error;
      fail("CANONICAL_MEMBERSHIP_OPERATOR_DRY_RUN_FAILED");
    }
  }

  if (parsedManifest.blockers.length > 0 || !parsedManifest.manifest) {
    fail("CANONICAL_MEMBERSHIP_OPERATOR_MANIFEST_INVALID");
  }
  const rawReview = await readReviewedFile(command.reviewFile, readFile);
  let review;
  try {
    review = parseCanonicalMembershipOperatorReviewJson(rawReview);
  } catch (error) {
    if (error instanceof CanonicalMembershipOperatorReviewError) {
      fail("CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID");
    }
    throw error;
  }
  if (
    !review.applyEligible ||
    !review.planHash ||
    review.registrationCounts.invalid !== 0 ||
    review.workspaceId !== config.workspaceId ||
    review.manifestHash !== parsedManifest.manifestHash
  ) {
    fail("CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID");
  }

  const apply = dependencies.apply ?? applyCanonicalMembershipMigration;
  const result = await apply(
    {
      connectionString: config.connectionString,
      expectedCount: review.registrationCounts.valid,
      expectedPlanHash: review.planHash,
      manifestHash: review.manifestHash,
      migrationRunId: command.migrationRunId,
      workspaceId: config.workspaceId,
    },
    rawManifest,
  );
  return Object.freeze({ ...result, mode: "apply" as const });
}

export { OperatorReviewedFileError };
