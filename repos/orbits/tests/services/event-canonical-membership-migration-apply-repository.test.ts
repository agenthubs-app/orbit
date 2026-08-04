import assert from "node:assert/strict";
import test from "node:test";

import { Pool } from "pg";

import {
  applyCanonicalMembershipMigration,
  CanonicalMembershipMigrationApplyError,
  canonicalMembershipMigrationLedgerResultHash,
} from "../../features/events/registration/canonical-migration/apply-repository";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const hash = "a".repeat(64);

test("canonical migration apply errors redact command input and ledger result hashing is sorted and bound", async () => {
  await assert.rejects(
    applyCanonicalMembershipMigration(
      { connectionString: "postgres://secret", expectedCount: 1 },
      "secret",
    ),
    (error: unknown) =>
      error instanceof CanonicalMembershipMigrationApplyError &&
      error.code === "CANONICAL_MEMBERSHIP_MIGRATION_COMMAND_INVALID" &&
      !error.message.includes("secret"),
  );
  const run = {
    expectedCount: 1,
    manifestHash: hash,
    migrationId: "canonical-membership-v1" as const,
    planHash: hash,
    schemaVersion: 1 as const,
  };
  const activate = {
    action: "activate" as const,
    authority: "legacy_registration" as const,
    deadlineEvidenceHash: hash,
    eventAggregateHash: "b".repeat(64),
    eventId: "event:a",
    targetCount: 1,
  };
  const verify = {
    action: "verify_canonical" as const,
    authority: "canonical_membership" as const,
    deadlineEvidenceHash: null,
    eventAggregateHash: "c".repeat(64),
    eventId: "event:b",
    targetCount: 0,
  };
  assert.equal(
    canonicalMembershipMigrationLedgerResultHash({
      events: [activate, verify],
      run,
    }),
    canonicalMembershipMigrationLedgerResultHash({
      events: [verify, activate],
      run,
    }),
  );
  assert.notEqual(
    canonicalMembershipMigrationLedgerResultHash({
      events: [activate],
      run,
    }),
    canonicalMembershipMigrationLedgerResultHash({
      events: [{ ...activate, targetCount: 0 }],
      run,
    }),
  );
});

test(
  "main v11 apply fails not-ready before manifest parsing and is read-only",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
  },
  async () => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const before = await pool.query(
        `select coalesce(max(version),0)::text as version
           from event_ops_schema_migrations`,
      );
      await assert.rejects(
        applyCanonicalMembershipMigration(
          {
            connectionString: databaseUrl,
            expectedCount: 0,
            expectedPlanHash: hash,
            manifestHash: hash,
            migrationRunId: "run:not-ready",
            workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default",
          },
          undefined,
        ),
        (error: unknown) =>
          error instanceof CanonicalMembershipMigrationApplyError &&
          error.code === "CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY",
      );
      assert.deepEqual(
        (
          await pool.query(
            `select coalesce(max(version),0)::text as version
               from event_ops_schema_migrations`,
          )
        ).rows[0],
        before.rows[0],
      );
    } finally {
      await pool.end();
    }
  },
);
