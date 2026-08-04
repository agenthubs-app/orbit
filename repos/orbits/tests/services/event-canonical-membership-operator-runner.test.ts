import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import {
  CanonicalMembershipMigrationApplyError,
} from "../../features/events/registration/canonical-migration/apply-repository";
import type { CanonicalMembershipMigrationLegacyFact } from "../../features/events/registration/canonical-migration/contract";
import {
  CanonicalMembershipOperatorError,
  runCanonicalMembershipOperator,
  type CanonicalMembershipOperatorDependencies,
} from "../../features/events/registration/canonical-migration/operator-runner";
import {
  executeCanonicalMembershipOperatorCli,
} from "../../scripts/migrate-event-canonical-membership";

const execFileAsync = promisify(execFile);
const manifestPath = "/reviewed/manifest.json";
const reviewPath = "/reviewed/review.json";
const workspaceId = "workspace:operator";
const connectionString = "postgres://operator-secret";
const manifest = JSON.stringify({
  events: {
    "event:legacy": {
      evidenceId: "evidence:reviewed",
      profileEditDeadlineAt: "2026-08-08T03:00:00.000Z",
      source: "operator_manifest",
    },
  },
  schemaVersion: 1,
});
const fact: CanonicalMembershipMigrationLegacyFact = {
  authority: "legacy_registration",
  configurationDeadline: null,
  contentHash: "a".repeat(64),
  eventId: "event:legacy",
  eventVersion: 1,
  invalidRegistrationCount: 0,
  rawRegistrationCount: 0,
  registrations: [],
  validRegistrationCount: 0,
};
const dryArgs = [
  "--dry-run",
  "--workspace-id",
  workspaceId,
  "--manifest-file",
  manifestPath,
] as const;
const applyArgs = [
  "--apply",
  "--workspace-id",
  workspaceId,
  "--manifest-file",
  manifestPath,
  "--review-file",
  reviewPath,
  "--migration-run-id",
  "run:operator",
] as const;

function dependencies(input: {
  applyError?: CanonicalMembershipMigrationApplyError;
  manifest?: string;
  review?: string;
} = {}) {
  let applyInput: readonly unknown[] | null = null;
  let snapshotCalls = 0;
  const files = new Map<string, string>([
    [manifestPath, input.manifest ?? manifest],
    [reviewPath, input.review ?? ""],
  ]);
  const deps = {
    apply: async (...args: readonly unknown[]) => {
      applyInput = args;
      if (input.applyError) throw input.applyError;
      return Object.freeze({
        count: 0,
        planHash: "b".repeat(64),
        resultHash: "c".repeat(64),
        status: "applied" as const,
      });
    },
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("secret path");
      return value;
    },
    readSource: async () => ({ blockers: [], facts: [fact] }),
    withSnapshot: async <T>(input: {
      operation: (snapshot: never) => Promise<T>;
    }) => {
      snapshotCalls += 1;
      return input.operation({} as never);
    },
  } as unknown as CanonicalMembershipOperatorDependencies;
  return {
    applyInput: () => applyInput,
    deps,
    files,
    snapshotCalls: () => snapshotCalls,
  };
}

test("operator dry-run returns a frozen non-PII review and never applies", async () => {
  const mock = dependencies();
  const result = await runCanonicalMembershipOperator(
    dryArgs,
    { connectionString, workspaceId },
    mock.deps,
  );
  assert.equal(result.mode, "dry-run");
  if (result.mode !== "dry-run") assert.fail("expected dry-run");
  assert.equal(result.applyEligible, true);
  assert.equal(result.registrationCounts.valid, 0);
  assert.equal(result.events[0]?.authority, "legacy_registration");
  assert.ok(Object.isFrozen(result));
  assert.equal(mock.snapshotCalls(), 1);
  assert.equal(mock.applyInput(), null);
  const output = JSON.stringify(result);
  assert.ok(!output.includes(connectionString));
  assert.ok(!output.includes(manifestPath));
  assert.ok(!output.includes("evidence:reviewed"));
});

test("operator apply consumes the exact review and delegates only reviewed facts", async () => {
  const mock = dependencies();
  const review = await runCanonicalMembershipOperator(
    dryArgs,
    { connectionString, workspaceId },
    mock.deps,
  );
  mock.files.set(reviewPath, JSON.stringify(review));
  const result = await runCanonicalMembershipOperator(
    applyArgs,
    { connectionString, workspaceId },
    mock.deps,
  );
  assert.deepEqual(result, {
    count: 0,
    mode: "apply",
    planHash: "b".repeat(64),
    resultHash: "c".repeat(64),
    status: "applied",
  });
  assert.equal(mock.snapshotCalls(), 1, "apply must not add a preflight snapshot");
  const applyInput = mock.applyInput();
  assert.ok(applyInput);
  assert.deepEqual(applyInput[0], {
    connectionString,
    expectedCount: 0,
    expectedPlanHash: review.mode === "dry-run" ? review.planHash : null,
    manifestHash: review.mode === "dry-run" ? review.manifestHash : null,
    migrationRunId: "run:operator",
    workspaceId,
  });
  assert.equal(applyInput[1], manifest);
});

test("operator rejects workspace, manifest, file, and review mismatches before apply", async () => {
  const baseline = dependencies();
  const review = await runCanonicalMembershipOperator(
    dryArgs,
    { connectionString, workspaceId },
    baseline.deps,
  );
  const cases = [
    {
      args: dryArgs,
      config: { connectionString, workspaceId: "workspace:other" },
      mock: dependencies(),
      code: "CANONICAL_MEMBERSHIP_OPERATOR_CONFIGURATION_INVALID",
    },
    {
      args: applyArgs,
      config: { connectionString, workspaceId },
      mock: dependencies({ manifest: "{" }),
      code: "CANONICAL_MEMBERSHIP_OPERATOR_MANIFEST_INVALID",
    },
    {
      args: applyArgs,
      config: { connectionString, workspaceId },
      mock: dependencies({ review: "{" }),
      code: "CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID",
    },
    {
      args: applyArgs,
      config: { connectionString, workspaceId },
      mock: dependencies({
        review: JSON.stringify({ ...review, workspaceId: "workspace:other" }),
      }),
      code: "CANONICAL_MEMBERSHIP_OPERATOR_REVIEW_INVALID",
    },
  ];
  for (const item of cases) {
    await assert.rejects(
      runCanonicalMembershipOperator(item.args, item.config, item.mock.deps),
      (error: unknown) =>
        error instanceof CanonicalMembershipOperatorError &&
        error.code === item.code &&
        !error.message.includes("secret"),
    );
    assert.equal(item.mock.applyInput(), null);
  }

  const missing = dependencies();
  missing.files.delete(manifestPath);
  await assert.rejects(
    runCanonicalMembershipOperator(
      dryArgs,
      { connectionString, workspaceId },
      missing.deps,
    ),
    (error: unknown) =>
      error instanceof CanonicalMembershipOperatorError &&
      error.code === "CANONICAL_MEMBERSHIP_OPERATOR_FILE_INVALID",
  );
});

test("CLI emits stable exit classes and never serializes secrets", async () => {
  const dryMock = dependencies({ manifest: "{" });
  const blocked = await executeCanonicalMembershipOperatorCli(
    dryArgs,
    { ORBIT_EVENT_DATABASE_URL: connectionString, ORBIT_WORKSPACE_ID: workspaceId },
    dryMock.deps,
  );
  assert.equal(blocked.exitCode, 2);
  assert.equal(blocked.stream, "stdout");

  const config = await executeCanonicalMembershipOperatorCli(
    dryArgs,
    { ORBIT_EVENT_DATABASE_URL: connectionString },
    dryMock.deps,
  );
  assert.deepEqual(
    { exitCode: config.exitCode, stream: config.stream },
    { exitCode: 64, stream: "stderr" },
  );

  const reviewMock = dependencies({ review: "{" });
  const invalidReview = await executeCanonicalMembershipOperatorCli(
    applyArgs,
    { ORBIT_EVENT_DATABASE_URL: connectionString, ORBIT_WORKSPACE_ID: workspaceId },
    reviewMock.deps,
  );
  assert.equal(invalidReview.exitCode, 65);

  for (const [code, exitCode] of [
    ["CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY", 69],
    ["CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT", 73],
    ["CANONICAL_MEMBERSHIP_MIGRATION_RETRY_EXHAUSTED", 75],
    ["CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED", 70],
  ] as const) {
    const mock = dependencies();
    const review = await runCanonicalMembershipOperator(
      dryArgs,
      { connectionString, workspaceId },
      mock.deps,
    );
    mock.files.set(reviewPath, JSON.stringify(review));
    const failure = dependencies({
      applyError: new CanonicalMembershipMigrationApplyError(code),
      review: JSON.stringify(review),
    });
    const outcome = await executeCanonicalMembershipOperatorCli(
      applyArgs,
      { ORBIT_EVENT_DATABASE_URL: connectionString, ORBIT_WORKSPACE_ID: workspaceId },
      failure.deps,
    );
    assert.equal(outcome.exitCode, exitCode);
    assert.equal(outcome.stream, "stderr");
    const serialized = JSON.stringify(outcome.payload);
    assert.ok(!serialized.includes(connectionString));
    assert.ok(!serialized.includes(manifestPath));
  }
});

test("canonical membership operator script import has no execution side effect", async () => {
  const output = await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    "await import('./scripts/migrate-event-canonical-membership.ts');",
  ], { cwd: process.cwd() });
  assert.equal(output.stdout, "");
  assert.equal(output.stderr, "");
});
