import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostgresOrganizerOwnershipWriter,
  createPostgresOrganizerMembershipWriter,
  parseEventOrganizerAccountBootstrapCommand,
  runEventOrganizerAccountBootstrapCommand,
} from "../../scripts/bootstrap-event-organizer-accounts";
import type {
  OrganizerAccountBootstrapDependencies,
  OrganizerAccountBootstrapPlan,
} from "../../features/events/organizer-accounts/bootstrap";
import type { LiveRecord } from "../../shared/storage/live-record-store";

const userId = "user_mry5y200_58jpi8";
const hash = "a".repeat(64);

test("organizer bootstrap command accepts only the reviewed dry-run and apply forms", () => {
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--dry-run", "--xiaoyu-auth-user-id", userId,
  ]), { kind: "dry-run", xiaoyuAuthUserId: userId });
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--apply", "--xiaoyu-auth-user-id", userId,
    "--expected-count", "22", "--expected-plan-hash", hash,
  ]), {
    expectedCount: 22,
    expectedPlanHash: hash,
    kind: "apply",
    xiaoyuAuthUserId: userId,
  });
});

test("organizer bootstrap command rejects mixed, duplicate, and unknown flags before database setup", () => {
  for (const args of [
    [],
    ["--dry-run", "--apply", "--xiaoyu-auth-user-id", userId],
    ["--dry-run", "--dry-run", "--xiaoyu-auth-user-id", userId],
    ["--dry-run", "--xiaoyu-auth-user-id", userId, "--unknown"],
    ["--dry-run", "--xiaoyu-auth-user-id", "user_not_xiaoyu"],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "19", "--expected-plan-hash", hash],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "20", "--expected-plan-hash", hash],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "22", "--expected-plan-hash", "A".repeat(64)],
  ]) {
    assert.throws(() => parseEventOrganizerAccountBootstrapCommand(args));
  }
});

function reviewedPlan(): OrganizerAccountBootstrapPlan {
  const items = Array.from({ length: 22 }, (_, index) => ({
    accountKey: `organizer-${index}`,
    displayName: `Organizer ${index}`,
    email: `organizer-${index}@organizers.orbit.example.test`,
    kind: "organizer-identity" as const,
  }));
  return {
    accountCount: 13,
    contactLinkCount: 6,
    hash,
    items,
    manifestVersion: "event-organizers-v1",
    xiaoyuCanonicalOwnershipRepairCount: 2,
    xiaoyuIdentityBindingCount: 1,
  } as OrganizerAccountBootstrapPlan;
}

function runnerHarness() {
  const operations: string[] = [];
  const logs: string[] = [];
  let createCount = 0;
  const dependencies = {} as OrganizerAccountBootstrapDependencies;
  const runtime = {
    client: {
      close: async () => { operations.push("close"); },
      query: async (text: string) => { operations.push(text); return { rows: [] }; },
    },
    close: async () => { operations.push("runtime-close"); },
    dependencies,
  };

  return {
    createCount: () => createCount,
    logs,
    operations,
    options: {
      applyPlan: async () => ({
        accountCount: 13 as const,
        contactLinkCount: 6 as const,
        hash,
        newAccountCount: 0,
        newContactLinkCount: 0,
        newXiaoyuCanonicalOwnershipRepairCount: 0,
        newXiaoyuIdentityBindingCount: 0,
        xiaoyuCanonicalOwnershipRepairCount: 2 as const,
        xiaoyuIdentityBindingCount: 1 as const,
      }),
      buildPlan: async () => reviewedPlan(),
      createDependencies: () => { createCount += 1; return runtime; },
      env: {},
      loadEnv: () => { operations.push("load-env"); },
      log: (value: string) => { logs.push(value); },
    },
  };
}

test("runner rejects production and missing passwords before dependencies", async () => {
  for (const env of [
    { NODE_ENV: "production", ORBIT_DEMO_ORGANIZER_PASSWORD: "organizer-password" },
    {},
  ]) {
    const harness = runnerHarness();
    await assert.rejects(
      runEventOrganizerAccountBootstrapCommand([
        "--apply", "--xiaoyu-auth-user-id", userId,
        "--expected-count", "22", "--expected-plan-hash", hash,
      ], { ...harness.options, env }),
    );
    assert.equal(harness.createCount(), 0);
  }
});

test("runner parser failures occur before dependencies are constructed", async () => {
  const harness = runnerHarness();
  await assert.rejects(
    runEventOrganizerAccountBootstrapCommand([
      "--dry-run", "--xiaoyu-auth-user-id", "user_not_xiaoyu",
    ], harness.options),
    /reviewed Xiaoyu auth user ID/i,
  );
  assert.equal(harness.createCount(), 0);
  assert.deepEqual(harness.operations, []);
});

test("runner dry-run uses no transaction and needs no password", async () => {
  const harness = runnerHarness();
  await runEventOrganizerAccountBootstrapCommand([
    "--dry-run", "--xiaoyu-auth-user-id", userId,
  ], harness.options);

  assert.equal(harness.createCount(), 1);
  assert.deepEqual(harness.operations, ["load-env", "runtime-close"]);
  assert.equal(harness.logs.length, 1);
});

test("runner commits only after successful reviewed apply without logging secrets", async () => {
  const harness = runnerHarness();
  let applied = false;
  await runEventOrganizerAccountBootstrapCommand([
    "--apply", "--xiaoyu-auth-user-id", userId,
    "--expected-count", "22", "--expected-plan-hash", hash,
  ], {
    ...harness.options,
    applyPlan: async () => {
      assert.deepEqual(harness.operations, ["load-env", "BEGIN"]);
      applied = true;
      return {
        accountCount: 13 as const,
        contactLinkCount: 6 as const,
        hash,
        newAccountCount: 0,
        newContactLinkCount: 0,
        newXiaoyuCanonicalOwnershipRepairCount: 0,
        newXiaoyuIdentityBindingCount: 0,
        xiaoyuCanonicalOwnershipRepairCount: 2 as const,
        xiaoyuIdentityBindingCount: 1 as const,
      };
    },
    env: { ORBIT_DEMO_ORGANIZER_PASSWORD: "secret-organizer-password" },
  });

  assert.equal(applied, true);
  assert.deepEqual(harness.operations, ["load-env", "BEGIN", "COMMIT", "runtime-close"]);
  assert.doesNotMatch(harness.logs.join("\n"), /secret-organizer-password|passwordHash/i);
});

test("runner rolls back failed apply without commit or success log", async () => {
  const harness = runnerHarness();
  await assert.rejects(
    runEventOrganizerAccountBootstrapCommand([
      "--apply", "--xiaoyu-auth-user-id", userId,
      "--expected-count", "22", "--expected-plan-hash", hash,
    ], {
      ...harness.options,
      applyPlan: async () => { throw new Error("final verification failed"); },
      env: { ORBIT_DEMO_ORGANIZER_PASSWORD: "secret-organizer-password" },
    }),
    /final verification failed/i,
  );

  assert.deepEqual(harness.operations, ["load-env", "BEGIN", "ROLLBACK", "runtime-close"]);
  assert.deepEqual(harness.logs, []);
});

test("Postgres membership writer uses insert-if-absent without updates", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const writer = createPostgresOrganizerMembershipWriter({
    client: {
      close: async () => {},
      query: async <TRow>(text: string, values?: readonly unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ record_id: "profile:auth-membership:user_mry5y200_58jpi8" }] as TRow[] };
      },
    },
  });
  const record: LiveRecord<Record<string, unknown>> = {
    workspaceId: "workspace:test",
    collectionName: "profiles",
    recordId: "profile:auth-membership:user_mry5y200_58jpi8",
    userId: "account_orbit_generated",
    sourceType: "manual",
    sourceId: "auth-membership:user_mry5y200_58jpi8",
    evidenceIds: ["evidence:organizer-account-manifest:v1"],
    lifecycleState: "active",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    payload: { id: "user_mry5y200_58jpi8", accountId: "account_orbit_generated" },
  };

  assert.equal(await writer.insertIfAbsent(record), "inserted");
  assert.match(calls[0]!.text, /insert into orbit_records/i);
  assert.match(calls[0]!.text, /on conflict \(workspace_id, collection_name, record_id\)\s+do nothing/i);
  assert.match(calls[0]!.text, /returning record_id/i);
  assert.doesNotMatch(calls[0]!.text, /do update/i);
  assert.equal(calls[0]!.values?.[2], record.recordId);
});

test("Postgres canonical ownership writer conditionally updates only a null user_id", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const writer = createPostgresOrganizerOwnershipWriter({
    client: {
      close: async () => {},
      query: async <TRow>(text: string, values?: readonly unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ record_id: "account_orbit_generated" }] as TRow[] };
      },
    },
  });

  assert.equal(await writer.setOwnerIfAbsent({
    workspaceId: "workspace:test",
    collectionName: "accounts",
    recordId: "account_orbit_generated",
    ownerActorId: "account_orbit_generated",
  }), "updated");
  assert.match(calls[0]!.text, /update orbit_records\s+set user_id = \$4/i);
  assert.match(calls[0]!.text, /user_id is null/i);
  assert.match(calls[0]!.text, /returning record_id/i);
  assert.doesNotMatch(calls[0]!.text, /payload\s*=|updated_at\s*=|lifecycle_state\s*=/i);
  assert.deepEqual(calls[0]!.values, [
    "workspace:test",
    "accounts",
    "account_orbit_generated",
    "account_orbit_generated",
  ]);
});
