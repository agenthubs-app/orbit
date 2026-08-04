import assert from "node:assert/strict";
import { lstat, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CanonicalMembershipOperatorCommandError,
  parseCanonicalMembershipOperatorCommand,
} from "../../features/events/registration/canonical-migration/operator-command";
import {
  parseCanonicalMembershipOperatorManifest,
} from "../../features/events/registration/canonical-migration/operator-manifest";
import {
  buildCanonicalMembershipOperatorReview,
  CanonicalMembershipOperatorReviewError,
  parseCanonicalMembershipOperatorReview,
  parseCanonicalMembershipOperatorReviewJson,
} from "../../features/events/registration/canonical-migration/operator-review";
import { buildCanonicalMembershipMigrationPlan } from "../../features/events/registration/canonical-migration/planner";
import type { CanonicalMembershipMigrationLegacyFact } from "../../features/events/registration/canonical-migration/contract";
import {
  OperatorReviewedFileError,
  operatorReviewedFileSnapshotMatches,
  readOperatorReviewedFile,
} from "../../features/events/registration/operator-reviewed-file";

const manifestFile = "/tmp/canonical-membership-manifest.json";
const reviewFile = "/tmp/canonical-membership-review.json";
const hash = "a".repeat(64);

function reviewedPlan() {
  const parsedManifest = parseCanonicalMembershipOperatorManifest(
    JSON.stringify({
      events: {
        "event:legacy": {
          evidenceId: "evidence:operator-reviewed",
          profileEditDeadlineAt: "2026-08-08T03:00:00.000Z",
          source: "operator_manifest",
        },
      },
      schemaVersion: 1,
    }),
  );
  const fact: CanonicalMembershipMigrationLegacyFact = {
    authority: "legacy_registration",
    configurationDeadline: null,
    contentHash: hash,
    eventId: "event:legacy",
    eventVersion: 1,
    invalidRegistrationCount: 0,
    rawRegistrationCount: 0,
    registrations: [],
    validRegistrationCount: 0,
  };
  return buildCanonicalMembershipMigrationPlan({
    facts: [fact],
    parsedManifest,
    sourceBlockers: [],
  });
}

test("canonical membership operator command is exact, modal, and frozen", () => {
  const dryRun = parseCanonicalMembershipOperatorCommand([
    "--dry-run",
    "--workspace-id",
    "workspace:one",
    "--manifest-file",
    manifestFile,
  ]);
  assert.deepEqual(dryRun, {
    manifestFile,
    mode: "dry-run",
    workspaceId: "workspace:one",
  });
  assert.ok(Object.isFrozen(dryRun));

  const apply = parseCanonicalMembershipOperatorCommand([
    "--apply",
    "--workspace-id",
    "workspace:one",
    "--manifest-file",
    manifestFile,
    "--review-file",
    reviewFile,
    "--migration-run-id",
    "run:one",
  ]);
  assert.deepEqual(apply, {
    manifestFile,
    migrationRunId: "run:one",
    mode: "apply",
    reviewFile,
    workspaceId: "workspace:one",
  });
  assert.ok(Object.isFrozen(apply));
});

test("canonical membership operator command rejects unknown, duplicate, inline, and hostile argv", () => {
  const validDry = [
    "--dry-run",
    "--workspace-id",
    "workspace:one",
    "--manifest-file",
    manifestFile,
  ];
  const invalid: unknown[] = [
    [],
    ["--unknown"],
    ["--dry-run", "--apply"],
    [...validDry, "--dry-run"],
    ["--dry-run", "--workspace-id=secret", "--manifest-file", manifestFile],
    ["--dry-run", "--workspace-id", "workspace:one"],
    [...validDry, "--review-file", reviewFile],
    [
      "--apply",
      "--workspace-id",
      "workspace:one",
      "--manifest-file",
      manifestFile,
      "--review-file",
      reviewFile,
    ],
    ["--dry-run", "--workspace-id", "workspace:one", "--manifest-file", "bad\u0000path"],
    [Symbol("secret")],
  ];
  const accessor = [...validDry];
  Object.defineProperty(accessor, "0", {
    get() {
      throw new Error("secret");
    },
  });
  const revoked = Proxy.revocable(validDry, {});
  revoked.revoke();
  invalid.push(accessor, revoked.proxy);

  for (const argv of invalid) {
    assert.throws(
      () =>
        parseCanonicalMembershipOperatorCommand(
          argv as readonly string[],
        ),
      (error: unknown) =>
        error instanceof CanonicalMembershipOperatorCommandError &&
        !error.message.includes("secret"),
    );
  }
});

test("canonical membership review is complete, zero-count safe, sorted, and deeply frozen", () => {
  const review = buildCanonicalMembershipOperatorReview({
    plan: reviewedPlan(),
    workspaceId: "workspace:one",
  });
  assert.equal(review.applyEligible, true);
  assert.equal(review.eventCount, 1);
  assert.deepEqual(review.registrationCounts, {
    cancelled: 0,
    invalid: 0,
    raw: 0,
    rsvped: 0,
    valid: 0,
  });
  assert.deepEqual(
    review.events.map((event) => ({
      action: event.action,
      authority: event.authority,
      deadlineSource: event.deadlineSource,
    })),
    [
      {
        action: "activate",
        authority: "legacy_registration",
        deadlineSource: "operator_manifest",
      },
    ],
  );
  assert.ok(Object.isFrozen(review));
  assert.ok(Object.isFrozen(review.events));
  assert.ok(Object.isFrozen(review.events[0]));
  assert.ok(Object.isFrozen(review.registrationCounts));
  assert.deepEqual(
    parseCanonicalMembershipOperatorReviewJson(JSON.stringify(review)),
    review,
  );
});

test("canonical membership review rejects duplicate JSON keys and inconsistent nested facts", () => {
  const review = buildCanonicalMembershipOperatorReview({
    plan: reviewedPlan(),
    workspaceId: "workspace:one",
  });
  assert.throws(
    () =>
      parseCanonicalMembershipOperatorReviewJson(
        `{"mode":"dry-run","mode":"dry-run","review":${JSON.stringify(review)}}`,
      ),
    CanonicalMembershipOperatorReviewError,
  );

  for (const invalid of [
    { ...review, extra: true },
    { ...review, eventCount: 2 },
    {
      ...review,
      registrationCounts: { ...review.registrationCounts, raw: 1 },
    },
    {
      ...review,
      events: [{ ...review.events[0], action: "verify_canonical" }],
    },
    { ...review, applyEligible: true, planHash: null },
    { ...review, blockerCodes: ["Z_BLOCKER", "A_BLOCKER"] },
  ]) {
    assert.throws(
      () => parseCanonicalMembershipOperatorReview(invalid),
      CanonicalMembershipOperatorReviewError,
    );
  }

  const accessor = { ...review } as Record<string, unknown>;
  Object.defineProperty(accessor, "workspaceId", {
    enumerable: true,
    get() {
      throw new Error("secret");
    },
  });
  const symbol = { ...review, [Symbol("secret")]: true };
  for (const invalid of [accessor, symbol]) {
    assert.throws(
      () => parseCanonicalMembershipOperatorReview(invalid),
      (error: unknown) =>
        error instanceof CanonicalMembershipOperatorReviewError &&
        !error.message.includes("secret"),
    );
  }
});

test("shared reviewed-file reader accepts one stable regular UTF-8 file and rejects unsafe evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "operator-reviewed-file-"));
  const valid = join(directory, "valid.json");
  const empty = join(directory, "empty.json");
  const large = join(directory, "large.json");
  const invalidUtf8 = join(directory, "invalid.json");
  const link = join(directory, "link.json");
  try {
    await writeFile(valid, "{\"review\":true}");
    await writeFile(empty, "");
    await writeFile(large, "x".repeat(65_537));
    await writeFile(invalidUtf8, Buffer.from([0xff]));
    await symlink(valid, link);
    assert.equal(await readOperatorReviewedFile(valid), "{\"review\":true}");
    for (const path of [directory, empty, large, invalidUtf8, link]) {
      await assert.rejects(
        readOperatorReviewedFile(path),
        (error: unknown) =>
          error instanceof OperatorReviewedFileError &&
          !error.message.includes(directory),
      );
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("shared reviewed-file snapshot detects same-inode rewrites with restored mtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "operator-reviewed-snapshot-"));
  const path = join(directory, "review.json");
  const fixed = new Date("2026-08-04T00:00:00.000Z");
  try {
    await writeFile(path, "review-one");
    await utimes(path, fixed, fixed);
    const before = await lstat(path, { bigint: true });
    await writeFile(path, "review-two");
    await utimes(path, fixed, fixed);
    const after = await lstat(path, { bigint: true });
    assert.equal(before.dev, after.dev);
    assert.equal(before.ino, after.ino);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeNs, after.mtimeNs);
    assert.notEqual(before.ctimeNs, after.ctimeNs);
    assert.equal(operatorReviewedFileSnapshotMatches(before, after), false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
