import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID,
  parseProfileContractRepairOperatorManifest,
} from "../../features/events/registration/profile-contract-repair/operator-manifest";
import {
  ProfileContractRepairOperatorCommandError,
  parseProfileContractRepairOperatorCommand,
} from "../../features/events/registration/profile-contract-repair/operator-command";

const hash = "a".repeat(64);
const scopeManifest = "/tmp/profile-repair-scope.json";
const events = ["event:one", "event:two"];

test("operator manifest is canonical, copied, frozen, and stable", () => {
  const first = parseProfileContractRepairOperatorManifest({
    events,
    repairType: "canonical_profile_empty_answer_v1",
    schemaVersion: 1,
  });
  const second = parseProfileContractRepairOperatorManifest(JSON.stringify({
    events: ["event:one", "event:two"],
    repairType: "canonical_profile_empty_answer_v1",
    schemaVersion: 1,
  }));
  assert.ok("manifestHash" in first);
  assert.ok("manifestHash" in second);
  assert.equal(first.manifestHash, second.manifestHash);
  assert.notEqual(first.events, events);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.events));
});

test("operator manifest rejects hostile or non-canonical input without echoing it", () => {
  const getter = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(getter, "schemaVersion", { enumerable: true, get() { throw new Error("secret"); } });
  getter.repairType = "canonical_profile_empty_answer_v1";
  getter.events = events;
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const sparse = ["event:one", "event:two"] as string[];
  delete sparse[1];
  const accessorEvents = ["event:one", "event:two"];
  Object.defineProperty(accessorEvents, "1", { enumerable: true, get() { throw new Error("secret"); } });
  const symbolKey = {
    events, repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1,
    [Symbol("extra")]: true,
  };
  for (const value of [
    null, "{", Symbol("secret"), getter, revoked.proxy,
    '{"events":["event:decoy"],"repairType":"canonical_profile_empty_answer_v1","events":["event:one","event:two"],"schemaVersion":1}',
    { events: ["event:two", "event:one"], repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events: ["event:one", "event:one"], repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events: [], repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events: ["e\u0301vent"], repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events: sparse, repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events: accessorEvents, repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 },
    { events, repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1, extra: true }, symbolKey,
  ]) {
    const result = parseProfileContractRepairOperatorManifest(value);
    assert.deepEqual(result, { error: PROFILE_CONTRACT_REPAIR_OPERATOR_MANIFEST_INVALID, manifest: null });
    assert.ok(Object.isFrozen(result));
  }
});

test("operator command is strict and frozen", () => {
  const dryRun = parseProfileContractRepairOperatorCommand(["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest]);
  assert.deepEqual(dryRun, { mode: "dry-run", scopeManifest, workspaceId: "workspace:one" });
  assert.ok(Object.isFrozen(dryRun));
  const apply = parseProfileContractRepairOperatorCommand(["--apply", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest, "--repair-id", "repair:one", "--expected-count", "2", "--expected-plan-hash", hash]);
  assert.equal(apply.mode, "apply");
});

test("operator command rejects duplicate, inline, missing, and untrusted argv without echoing it", () => {
  const invalid = [
    ["--dry-run", "--dry-run"], ["--dry-run", "--workspace-id=secret"],
    ["--dry-run", "--workspace-id", "workspace:one"], ["argument"],
    ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest, "--repair-id", "repair:one"],
    ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", "x".repeat(4_097)],
    ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", "/tmp/secret\u0000.json"],
    ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest, "--workspace-id", "workspace:two"],
  ];
  for (const argv of invalid) {
    assert.throws(() => parseProfileContractRepairOperatorCommand(argv), (error: unknown) =>
      error instanceof ProfileContractRepairOperatorCommandError && !error.message.includes("secret"));
  }
});

test("operator command safely rejects accessor, proxy, cycle, and symbol argv", () => {
  const accessor = ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest];
  Object.defineProperty(accessor, "0", { get() { throw new Error("secret"); } });
  const revoked = Proxy.revocable(["--dry-run"], {}); revoked.revoke();
  const cyclic: unknown[] = ["--dry-run", "--workspace-id", "workspace:one", "--scope-manifest", scopeManifest];
  cyclic.push(cyclic as unknown as string);
  for (const argv of [accessor, new Proxy(["--dry-run"], {}), revoked.proxy, cyclic, [Symbol("secret")]]) {
    assert.throws(() => parseProfileContractRepairOperatorCommand(argv as readonly string[]), (error: unknown) =>
      error instanceof ProfileContractRepairOperatorCommandError && !error.message.includes("secret"));
  }
});
