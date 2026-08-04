import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, open, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { ProfileContractRepairOperatorError, profileContractRepairOperatorFileSnapshotMatches, readProfileContractRepairOperatorManifestFile, runProfileContractRepairOperator, type ProfileContractRepairOperatorDependencies } from "../../features/events/registration/profile-contract-repair/operator-runner";
import { ProfileContractRepairApplyError } from "../../features/events/registration/profile-contract-repair/apply-contract";

const hash = "a".repeat(64);
const manifest = Object.freeze({ events: Object.freeze(["event:one"]), manifestHash: hash, repairType: "canonical_profile_empty_answer_v1" as const, schemaVersion: 1 as const });
const plan = Object.freeze({
  applyEligible: true, applyPlanHash: hash, blockers: Object.freeze([]), diagnosticHash: "b".repeat(64), eventCount: 1,
  events: Object.freeze([{ eventId: "event:one", inventoryHash: "c".repeat(64), targetCount: 2, targetsHash: "d".repeat(64) }]),
  repairId: "canonical-profile-empty-answer-v1", schemaVersion: 1, targetCount: 2, targets: Object.freeze([]),
});
const config = { connectionString: "postgres://secret", workspaceId: "workspace:one" };
const dry = ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", "/tmp/scope.json"];
const apply = ["--apply", "--workspace-id", "workspace:one", "--scope-manifest", "/tmp/scope.json", "--repair-id", "repair:one", "--expected-count", "2", "--expected-plan-hash", hash];
const execFileAsync = promisify(execFile);

function dependencies(input: { applyFailure?: boolean; plan?: typeof plan; manifest?: typeof manifest } = {}) {
  let snapshotCalls = 0; let readinessCalls = 0; let applyCalls = 0;
  return {
    deps: {
      apply: async () => { applyCalls += 1; if (input.applyFailure) throw new ProfileContractRepairApplyError("PROFILE_CONTRACT_REPAIR_PLAN_DRIFT"); return Object.freeze({ count: 2, planHash: hash, resultHash: "e".repeat(64), status: "applied" as const }); },
      buildPlan: () => input.plan ?? plan,
      readManifest: async () => input.manifest ?? manifest,
      readSource: async () => ({}),
      readiness: async () => { readinessCalls += 1; },
      withSnapshot: async <T>(value: { operation: (snapshot: never) => Promise<T> }) => { snapshotCalls += 1; return value.operation({} as never); },
    } as unknown as ProfileContractRepairOperatorDependencies,
    calls: () => ({ applyCalls, readinessCalls, snapshotCalls }),
  };
}

test("runner dry run is redacted and never readies or applies", async () => {
  const mock = dependencies();
  const result = await runProfileContractRepairOperator(dry, config, mock.deps);
  assert.deepEqual(result, { applyEligible: true, blockerCodes: [], diagnosticHash: "b".repeat(64), eventCount: 1, events: [{ eventId: "event:one", inventoryHash: "c".repeat(64), targetCount: 2, targetsHash: "d".repeat(64) }], manifestHash: hash, mode: "dry-run", planHash: hash, targetCount: 2 });
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.events));
  assert.deepEqual(mock.calls(), { applyCalls: 0, readinessCalls: 0, snapshotCalls: 1 });
});

test("runner fail closes before readiness and apply for workspace and scope mismatches", async () => {
  const cases = [
    { argv: ["--dry-run", "--workspace-id", "workspace:other", "--scope-manifest", "/tmp/scope.json"], input: {} },
    { argv: dry, input: { manifest: Object.freeze({ ...manifest, events: Object.freeze(["event:other"]) }) } },
  ];
  for (const item of cases) {
    const mock = dependencies(item.input as never);
    await assert.rejects(runProfileContractRepairOperator(item.argv, config, mock.deps), (error: unknown) => error instanceof ProfileContractRepairOperatorError && !error.message.includes("secret"));
    const calls = mock.calls(); assert.equal(calls.readinessCalls, 0); assert.equal(calls.applyCalls, 0);
  }
});

test("runner delegates current plan drift and replay eligibility to the locked apply boundary", async () => {
  for (const input of [
    { applyFailure: true, plan: Object.freeze({ ...plan, applyPlanHash: "f".repeat(64) }) },
    { applyFailure: true, plan: Object.freeze({ ...plan, applyEligible: false }) },
    { applyFailure: true },
  ]) {
    const mock = dependencies(input as never);
    await assert.rejects(runProfileContractRepairOperator(apply, config, mock.deps), (error: unknown) =>
      error instanceof ProfileContractRepairOperatorError && !error.message.includes("secret"));
    assert.deepEqual(mock.calls(), { applyCalls: 1, readinessCalls: 1, snapshotCalls: 1 });
  }
});

test("runner checks readiness then delegates apply with only reviewed fields", async () => {
  const mock = dependencies();
  const result = await runProfileContractRepairOperator(apply, config, mock.deps);
  assert.equal(result.mode, "apply");
  assert.deepEqual(mock.calls(), { applyCalls: 1, readinessCalls: 1, snapshotCalls: 1 });
});

test("safe manifest reader accepts only a stable regular UTF-8 manifest and always closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "profile-repair-reader-"));
  const valid = join(directory, "scope.json");
  const invalidUtf8 = join(directory, "invalid-utf8.json");
  const empty = join(directory, "empty.json");
  const large = join(directory, "large.json");
  const malformed = join(directory, "malformed.json");
  const duplicateKeys = join(directory, "duplicate-keys.json");
  const link = join(directory, "scope-link.json");
  try {
    await writeFile(valid, JSON.stringify({ events: ["event:one"], repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 }));
    await writeFile(invalidUtf8, Buffer.from([0xff]));
    await writeFile(empty, "");
    await writeFile(large, " ".repeat(65_537));
    await writeFile(malformed, "{");
    await writeFile(duplicateKeys, '{"events":["event:decoy"],"repairType":"canonical_profile_empty_answer_v1","events":["event:one"],"schemaVersion":1}');
    await symlink(valid, link);
    const parsed = await readProfileContractRepairOperatorManifestFile(valid);
    assert.equal(parsed.events[0], "event:one");
    for (const path of [directory, link, empty, large, invalidUtf8, malformed, duplicateKeys]) {
      await assert.rejects(readProfileContractRepairOperatorManifestFile(path), (error: unknown) =>
        error instanceof ProfileContractRepairOperatorError && !error.message.includes(directory));
    }
    const handle = await open(malformed, "r"); await handle.close();
    await rename(malformed, `${malformed}.renamed`);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("manifest snapshot detects same-inode same-size rewrites even when mtime is restored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "profile-repair-snapshot-"));
  const path = join(directory, "scope.json");
  const fixedTime = new Date("2026-08-04T00:00:00.000Z");
  try {
    await writeFile(path, "event:one");
    await utimes(path, fixedTime, fixedTime);
    const before = await lstat(path, { bigint: true });
    await writeFile(path, "event:two");
    await utimes(path, fixedTime, fixedTime);
    const after = await lstat(path, { bigint: true });
    assert.equal(before.dev, after.dev);
    assert.equal(before.ino, after.ino);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeNs, after.mtimeNs);
    assert.notEqual(before.ctimeNs, after.ctimeNs);
    assert.equal(profileContractRepairOperatorFileSnapshotMatches(before, after), false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("operator script import has no execution side effect", async () => {
  const output = await execFileAsync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    "await import('./scripts/repair-event-profile-contract.ts');",
  ], { cwd: process.cwd() });
  assert.equal(output.stdout, "");
  assert.equal(output.stderr, "");
});
