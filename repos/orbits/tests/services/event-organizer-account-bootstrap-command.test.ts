import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

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
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const userId = "user_mry5y200_58jpi8";
const hash = "a".repeat(64);
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("organizer bootstrap command accepts only the reviewed dry-run and apply forms", () => {
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--dry-run", "--xiaoyu-auth-user-id", userId,
  ]), { kind: "dry-run", xiaoyuAuthUserId: userId });
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--apply", "--xiaoyu-auth-user-id", userId,
    "--expected-count", "28", "--expected-plan-hash", hash,
  ]), {
    expectedCount: 28,
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
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "22", "--expected-plan-hash", hash],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "28", "--expected-plan-hash", "A".repeat(64)],
  ]) {
    assert.throws(() => parseEventOrganizerAccountBootstrapCommand(args));
  }
});

function reviewedPlan(): OrganizerAccountBootstrapPlan {
  const items = Array.from({ length: 28 }, (_, index) => ({
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
    xiaoyuContactOwnershipRepairCount: 6,
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
        newXiaoyuContactOwnershipRepairCount: 0,
        newXiaoyuIdentityBindingCount: 0,
        xiaoyuCanonicalOwnershipRepairCount: 2 as const,
        xiaoyuContactOwnershipRepairCount: 6 as const,
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
        "--expected-count", "28", "--expected-plan-hash", hash,
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
    "--expected-count", "28", "--expected-plan-hash", hash,
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
        newXiaoyuContactOwnershipRepairCount: 0,
        newXiaoyuIdentityBindingCount: 0,
        xiaoyuCanonicalOwnershipRepairCount: 2 as const,
        xiaoyuContactOwnershipRepairCount: 6 as const,
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
      "--expected-count", "28", "--expected-plan-hash", hash,
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

  assert.equal(await writer.lockForUpdate({
    workspaceId: "workspace:test",
    collectionName: "accounts",
    recordId: "account_orbit_generated",
  }), "locked");
  assert.equal(await writer.setOwnerIfAbsent({
    workspaceId: "workspace:test",
    collectionName: "accounts",
    recordId: "account_orbit_generated",
    ownerActorId: "account_orbit_generated",
  }), "updated");
  assert.match(calls[0]!.text, /select record_id[\s\S]+for update/i);
  assert.deepEqual(calls[0]!.values, ["workspace:test", "accounts", "account_orbit_generated"]);
  assert.match(calls[1]!.text, /update orbit_records\s+set user_id = \$4/i);
  assert.match(calls[1]!.text, /user_id is null/i);
  assert.match(calls[1]!.text, /returning record_id/i);
  assert.doesNotMatch(calls[1]!.text, /payload\s*=|updated_at\s*=|lifecycle_state\s*=/i);
  assert.deepEqual(calls[1]!.values, [
    "workspace:test",
    "accounts",
    "account_orbit_generated",
    "account_orbit_generated",
  ]);
});

test(
  "Postgres rolls back an earlier owner repair when a later reviewed row conflicts",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `organizer_bootstrap_rollback_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      await pool.query(
        `insert into orbit_records (
           workspace_id, collection_name, record_id, user_id, source_type, source_id,
           evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
         ) values
           ($1, 'accounts', 'account_orbit_generated', null, 'manual', 'test:account', '{}', 'active', '', $2::jsonb, $3, $3),
           ($1, 'profiles', 'profile_orbit_generated_operator', null, 'manual', 'test:profile', '{}', 'active', '', $4::jsonb, $3, $3)`,
        [
          workspaceId,
          JSON.stringify({ id: "account_orbit_generated", name: "Xiaoyu", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }),
          "2026-08-19T00:00:00.000Z",
          JSON.stringify({ id: "profile_orbit_generated_operator", accountId: "account_orbit_generated", displayName: "小雨", timezone: "Asia/Tokyo", createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z" }),
        ],
      );
      const writer = createPostgresOrganizerOwnershipWriter({
        client: Object.assign(pool, {
          close: () => pool.end(),
        }),
      });

      await pool.query("BEGIN");
      try {
        assert.equal(await writer.lockForUpdate({ workspaceId, collectionName: "accounts", recordId: "account_orbit_generated" }), "locked");
        assert.equal(await writer.setOwnerIfAbsent({ workspaceId, collectionName: "accounts", recordId: "account_orbit_generated", ownerActorId: "account_orbit_generated" }), "updated");
        assert.equal(await writer.lockForUpdate({ workspaceId, collectionName: "profiles", recordId: "profile_orbit_generated_operator" }), "locked");
        await pool.query(
          `update orbit_records set user_id = 'account_conflicting'
           where workspace_id = $1 and collection_name = 'profiles' and record_id = 'profile_orbit_generated_operator'`,
          [workspaceId],
        );
        throw new Error("later reviewed row conflicted");
      } catch (error) {
        await pool.query("ROLLBACK");
        assert.match(String(error), /later reviewed row conflicted/i);
      }

      const rows = await pool.query<{ user_id: string | null }>(
        `select user_id from orbit_records where workspace_id = $1 order by collection_name`,
        [workspaceId],
      );
      assert.deepEqual(rows.rows, [{ user_id: null }, { user_id: null }]);
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
