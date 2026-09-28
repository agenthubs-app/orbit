import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { Pool } from "pg";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { OWNER_BACKFILL_COLLECTIONS, runOwnerBackfill } from "../../features/sync/owner-backfill";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0114, SC-04 (decision 3): the seeds that write contact data produce
// owned rows on an empty database, so the owner backfill has nothing to do
// for freshly seeded data. Real local Postgres, strict sync schema.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 300_000 };
const W = "workspace:seed-owner";
const execFileAsync = promisify(execFile);

async function database(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `seed_owner_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=60000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  return { schema, pool, client, store: createPostgresLiveRecordStore({ client }) };
}

async function ownerCounts(pool: Pool) {
  const result = await pool.query<{ collection_name: string; total: number; ownerless: number }>(
    `select collection_name, count(*)::int as total, count(*) filter (where nullif(user_id, '') is null)::int as ownerless
       from orbit_records where workspace_id = $1 and collection_name = any($2::text[]) group by collection_name`,
    [W, [...OWNER_BACKFILL_COLLECTIONS]],
  );
  return Object.fromEntries(result.rows.map((row) => [row.collection_name, { total: row.total, ownerless: row.ownerless }]));
}

test("the generated relationship seed and the account contact seed write owned contact rows; the backfill finds nothing to do", options, async (t) => {
  const { schema, pool, client, store } = await database(t);
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId: W, now: () => "2026-09-28T00:00:00.000Z" });
  const generated = await ownerCounts(pool);
  for (const name of ["contacts", "connections", "evidence"]) {
    assert.ok((generated[name]?.total ?? 0) > 0, `the generated seed writes ${name}`);
    assert.equal(generated[name]?.ownerless, 0, `every generated ${name} row has an owner`);
  }

  // The account contact seed is a script: run it as one, against this schema.
  const authProvider = createStorageAuthUserProvider({ store, workspaceId: W });
  const authService = createAuthUserService({ accountProvisioner: createStorageAuthAccountProvisioningProvider({ store, workspaceId: W }), provider: authProvider });
  const registered = await authService.registerUser({ displayName: "Seed Owner", email: "seed-owner@orbit.test", password: "seed-owner-password-1" });
  assert.equal(registered.state, "success");
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  await execFileAsync("npx", ["tsx", join(__dirname, "../../scripts/seed-account-contact-fixtures.ts"), "--email", "seed-owner@orbit.test"], {
    cwd: join(__dirname, "../.."),
    env: { ...process.env, ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: url.toString(), ORBIT_LOCAL_WORKSPACE_ID: W },
  });
  const afterAccountSeed = await ownerCounts(pool);
  assert.ok((afterAccountSeed.contacts?.total ?? 0) > (generated.contacts?.total ?? 0), "the account seed added contacts");
  for (const name of OWNER_BACKFILL_COLLECTIONS) assert.equal(afterAccountSeed[name]?.ownerless ?? 0, 0, `no owner-less ${name} row after both seeds`);

  const plan = await runOwnerBackfill({ client, workspaceId: W, mode: "dry-run" });
  assert.equal(plan.assignments.length, 0, "freshly seeded data needs no owner backfill");
  assert.equal(plan.copies.length, 0);
  assert.deepEqual(plan.unresolvable, []);
});
