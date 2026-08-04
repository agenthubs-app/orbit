import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Pool } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { withCanonicalMembershipMigrationSnapshot } from "../../features/events/registration/canonical-migration/snapshot-runner";
import { buildProfileContractRepairPlan } from "../../features/events/registration/profile-contract-repair/planner";
import { readProfileContractRepairSource } from "../../features/events/registration/profile-contract-repair/source-reader";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

loadLocalEnv();
const connectionString = process.env.ORBIT_EVENT_DATABASE_URL;
const workspaceId = process.env.ORBIT_WORKSPACE_ID;

function command(args: readonly string[], env: NodeJS.ProcessEnv) {
  return spawnSync("npm", ["--silent", "run", "events:repair-profile-contract", "--", ...args], {
    cwd: process.cwd(), encoding: "utf8", env, timeout: 25_000,
  });
}

function schemaUrl(value: string, schema: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

async function createTemporaryFixture() {
  assert.ok(connectionString && workspaceId);
  const schema = `profile_repair_operator_cli_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  const scopedUrl = schemaUrl(connectionString, schema);
  const pool = new Pool({ connectionString: scopedUrl, max: 2 });
  const client = createEventOperationsPostgresClient({ connectionString: scopedUrl, pool });
  const sourceSchema = String((await admin.query("select current_schema() as value")).rows[0]?.value);
  assert.match(sourceSchema, /^[A-Za-z_][A-Za-z0-9_]*$/u);
  await admin.query(`create schema ${schema}`);
  await runEventOperationsMigrations(client);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  for (const table of [
    "event_ops_events", "event_event_versions", "event_ops_configurations",
    "event_ops_configuration_heads", "event_ops_profile_versions", "event_ops_profile_heads",
    "event_ops_profile_response_versions",
  ]) {
    await pool.query(`insert into ${table} select * from ${sourceSchema}.${table} where workspace_id=$1`, [workspaceId]);
  }
  await pool.query(`insert into event_ops_membership_versions (
    workspace_id,event_id,actor_id,membership_version,participant_id,profile_version,status,
    registered_at,cancelled_at,reactivated_at,late_registration,source_registration_id,
    created_at,effective_at,origin,admission_application_version)
    select workspace_id,event_id,actor_id,membership_version,participant_id,profile_version,status,
    registered_at,cancelled_at,reactivated_at,late_registration,source_registration_id,
    created_at,effective_at,'legacy_registration',null from ${sourceSchema}.event_ops_membership_versions
    where workspace_id=$1`, [workspaceId]);
  const admission = (await pool.query<{ actor_id: string; event_id: string; membership_version: number; registered_at: Date }>(
    `select event_id,actor_id,membership_version,registered_at from event_ops_membership_versions
      where workspace_id=$1 order by event_id,actor_id limit 1`, [workspaceId],
  )).rows[0];
  assert.ok(admission);
  await pool.query(`insert into event_ops_admission_policy_versions
    (workspace_id,event_id,policy_version,capacity,admission_mode,waitlist_enabled,
     registration_opens_at,registration_closes_at,updated_at,profile_edit_deadline_at)
    values ($1,$2,1,null,'instant',true,$3::timestamptz-interval '1 day',$3::timestamptz+interval '1 day',$3,$3)`,
  [workspaceId, admission.event_id, admission.registered_at]);
  await pool.query(`insert into event_ops_admission_application_versions
    (workspace_id,event_id,actor_id,application_version,policy_version,status,profile_payload,
     submitted_at,updated_at,decided_at,decision_actor_id)
    values ($1,$2,$3,1,1,'admitted','{}',$4,$4,$4,'actor:test-organizer')`,
  [workspaceId, admission.event_id, admission.actor_id, admission.registered_at]);
  await pool.query(`update event_ops_membership_versions
    set origin='admission_application',admission_application_version=1
    where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
  [workspaceId, admission.event_id, admission.actor_id, admission.membership_version]);
  assert.equal(Number((await pool.query(`select count(*) as count
    from event_ops_membership_versions membership
    join event_ops_admission_application_versions application
      on application.workspace_id=membership.workspace_id and application.event_id=membership.event_id
      and application.actor_id=membership.actor_id and application.application_version=membership.admission_application_version
    join event_ops_admission_policy_versions policy
      on policy.workspace_id=application.workspace_id and policy.event_id=application.event_id
      and policy.policy_version=application.policy_version
    where membership.workspace_id=$1 and membership.origin='admission_application'`, [workspaceId])).rows[0]?.count), 1);
  await pool.query(`insert into event_ops_membership_heads select * from ${sourceSchema}.event_ops_membership_heads where workspace_id=$1`, [workspaceId]);
  await pool.query(`insert into event_ops_audit_log select * from ${sourceSchema}.event_ops_audit_log
    where workspace_id=$1 and action='registration_migration_activated'`, [workspaceId]);
  await pool.query(`insert into orbit_records select * from ${sourceSchema}.orbit_records where workspace_id=$1`, [workspaceId]);
  const plan = await withCanonicalMembershipMigrationSnapshot({
    connectionString: scopedUrl,
    isolation: "serializable",
    operation: async (snapshot) => buildProfileContractRepairPlan(await readProfileContractRepairSource({ snapshot, workspaceId })),
  });
  assert.equal(plan.applyEligible, true, JSON.stringify(plan.blockers));
  assert.equal(plan.eventCount, 2);
  assert.equal(plan.targetCount, 24);
  assert.ok(plan.applyPlanHash);
  assert.ok(Number((await pool.query("select max(version) as version from event_ops_schema_migrations")).rows[0]?.version) >= 11);
  return {
    admission,
    admin,
    plan,
    pool,
    schema,
    async close() {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    },
  };
}

test("main CLI dry run is read-only and does not disclose operator inputs", {
  skip: connectionString && workspaceId ? false : "ORBIT_EVENT_DATABASE_URL/ORBIT_WORKSPACE_ID is not configured",
  timeout: 120_000,
}, async () => {
  assert.ok(connectionString && workspaceId);
  const pool = new Pool({ connectionString, max: 1 });
  const directory = await mkdtemp(join(tmpdir(), "profile-repair-cli-main-"));
  try {
    const before = await pool.query<{ version: string; legacy: string }>(
      `select (select coalesce(max(version),0)::text from event_ops_schema_migrations) as version,
       (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by to_jsonb(r)::text), '')) from orbit_records r where workspace_id=$1) as legacy`, [workspaceId],
    );
    const plan = await withCanonicalMembershipMigrationSnapshot({
      connectionString,
      operation: async (snapshot) => buildProfileContractRepairPlan(await readProfileContractRepairSource({ snapshot, workspaceId })),
    });
    assert.equal(plan.eventCount, 2); assert.equal(plan.targetCount, 24);
    const manifest = join(directory, "scope.json");
    await writeFile(manifest, JSON.stringify({ events: plan.events.map((event) => event.eventId), repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 }));
    const result = command(["--dry-run", "--workspace-id", workspaceId, "--scope-manifest", manifest], {
      ...process.env, ORBIT_EVENT_DATABASE_URL: connectionString, ORBIT_WORKSPACE_ID: workspaceId,
    });
    assert.equal(result.status, 0, result.stderr);
    const jsonStart = result.stdout.indexOf("{");
    assert.ok(jsonStart >= 0, result.stdout);
    const output = JSON.parse(result.stdout.slice(jsonStart)) as { eventCount: number; targetCount: number; mode: string };
    assert.deepEqual({ eventCount: output.eventCount, mode: output.mode, targetCount: output.targetCount }, { eventCount: 2, mode: "dry-run", targetCount: 24 });
    const after = await pool.query<{ version: string; legacy: string }>(
      `select (select coalesce(max(version),0)::text from event_ops_schema_migrations) as version,
       (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by to_jsonb(r)::text), '')) from orbit_records r where workspace_id=$1) as legacy`, [workspaceId],
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
    const cliOutput = `${result.stdout.slice(jsonStart)}\n${result.stderr}`;
    assert.ok(!cliOutput.includes(connectionString));
    assert.ok(!cliOutput.includes(manifest));
  } finally { await pool.end(); await rm(directory, { force: true, recursive: true }); }
});

test("temporary-schema CLI applies only the reviewed 24-target manifest without leaking operator inputs", {
  skip: connectionString && workspaceId ? false : "ORBIT_EVENT_DATABASE_URL/ORBIT_WORKSPACE_ID is not configured",
  timeout: 120_000,
}, async () => {
  const fixture = await createTemporaryFixture();
  const directory = await mkdtemp(join(tmpdir(), "profile-repair-cli-postgres-"));
  const outputs: string[] = [];
  const invoke = (args: readonly string[]) => {
    const result = command(args, {
      ...process.env,
      ORBIT_EVENT_DATABASE_URL: connectionString,
      ORBIT_WORKSPACE_ID: workspaceId,
      PGOPTIONS: `-c search_path=${fixture.schema}`,
    });
    outputs.push(`${result.stdout}\n${result.stderr}`);
    return result;
  };
  const output = <T>(result: ReturnType<typeof invoke>): T => {
    const start = result.stdout.indexOf("{");
    assert.ok(start >= 0, result.stdout);
    return JSON.parse(result.stdout.slice(start)) as T;
  };
  const counts = async () => (await fixture.pool.query<{ items: string; runs: string }>(`select
    (select count(*) from event_ops_data_repair_runs) as runs,
    (select count(*) from event_ops_data_repair_items) as items`)).rows[0]!;
  const stableSnapshot = async () => JSON.stringify(await Promise.all([
    "event_ops_data_repair_runs", "event_ops_data_repair_items", "event_ops_profile_versions",
    "event_ops_profile_heads", "event_ops_profile_response_versions", "event_ops_membership_versions",
    "event_ops_membership_heads", "event_ops_audit_log", "event_ops_outbox", "orbit_records",
  ].map(async (table) => ({
    table,
    value: (await fixture.pool.query(`select coalesce(jsonb_agg(to_jsonb(item) order by to_jsonb(item)::text), '[]'::jsonb) as value from ${table} item`)).rows[0]?.value,
  }))));
  try {
    const manifest = join(directory, "scope.json");
    const writeManifest = async (events: readonly string[]) => {
      await writeFile(manifest, JSON.stringify({
        events, repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1,
      }));
    };
    const events = fixture.plan.events.map((event) => event.eventId);
    await writeManifest(events);
    const dryArgs = ["--dry-run", "--workspace-id", workspaceId!, "--scope-manifest", manifest] as const;
    const before = await stableSnapshot();
    const dry = invoke(dryArgs);
    assert.equal(dry.status, 0, dry.stderr);
    const reviewed = output<{ eventCount: number; mode: string; planHash: string; targetCount: number }>(dry);
    assert.deepEqual(
      { eventCount: reviewed.eventCount, mode: reviewed.mode, targetCount: reviewed.targetCount },
      { eventCount: 2, mode: "dry-run", targetCount: 24 },
    );
    assert.match(reviewed.planHash, /^[a-f0-9]{64}$/u);
    assert.equal(await stableSnapshot(), before, "dry run must make no repair/profile/membership/audit/outbox/legacy changes");

    const invalid = [
      [],
      ["--unknown"],
      [...dryArgs, "--dry-run"],
      ["--dry-run", "--workspace-id", workspaceId!],
      [...dryArgs, "--repair-id", "repair:apply-only"],
      ["--dry-run", "--workspace-id", workspaceId!, "--scope-manifest", join(directory, "missing.json")],
    ];
    for (const args of invalid) assert.notEqual(invoke(args).status, 0, JSON.stringify(args));
    await writeFile(manifest,
      `{"events":["event:decoy"],"repairType":"canonical_profile_empty_answer_v1","events":${JSON.stringify(events)},"schemaVersion":1}`);
    assert.notEqual(invoke(dryArgs).status, 0, "duplicate root key must fail before scope planning");
    await writeManifest(events.slice(1));
    assert.notEqual(invoke(dryArgs).status, 0, "scope missing an event");
    await writeManifest([...events, "event:scope-extra"].sort());
    assert.notEqual(invoke(dryArgs).status, 0, "scope includes an extra event");
    await writeManifest(events);
    const applyArgs = (repairId: string, expectedCount = 24, expectedPlanHash = reviewed.planHash, requestedWorkspaceId = workspaceId!) => [
      "--apply", "--workspace-id", requestedWorkspaceId, "--scope-manifest", manifest,
      "--repair-id", repairId, "--expected-count", String(expectedCount), "--expected-plan-hash", expectedPlanHash,
    ];
    assert.notEqual(invoke(applyArgs("repair:wrong-workspace", 24, reviewed.planHash, "workspace:wrong")).status, 0);
    assert.notEqual(invoke(applyArgs("repair:wrong-count", 23)).status, 0);
    assert.notEqual(invoke(applyArgs("repair:wrong-hash", 24, "0".repeat(64))).status, 0);
    assert.deepEqual(await counts(), { items: "0", runs: "0" });
    assert.equal(await stableSnapshot(), before, "all invalid commands must be write-free");

    await fixture.pool.query(`update event_ops_configurations set profile_edit_deadline_at=profile_edit_deadline_at+interval '1 second'
      where workspace_id=$1 and event_id=$2`, [workspaceId, events[0]]);
    assert.notEqual(invoke(applyArgs("repair:expired-review")).status, 0, "old review must fail after deadline drift");
    assert.deepEqual(await counts(), { items: "0", runs: "0" });
    const refreshedDry = invoke(dryArgs);
    assert.equal(refreshedDry.status, 0, refreshedDry.stderr);
    const refreshed = output<{ planHash: string; targetCount: number }>(refreshedDry);
    assert.equal(refreshed.targetCount, 24);
    assert.notEqual(refreshed.planHash, reviewed.planHash);

    const appliedArgs = applyArgs("repair:temporary-cli-24", 24, refreshed.planHash);
    const appliedResult = invoke(appliedArgs);
    assert.equal(appliedResult.status, 0, appliedResult.stderr);
    const applied = output<{ count: number; status: string }>(appliedResult);
    assert.deepEqual({ count: applied.count, status: applied.status },
      { count: 24, status: "applied" }, "the reviewed temporary-schema run applies all 24 targets");
    assert.deepEqual(await counts(), { items: "24", runs: "1" });
    const replay = invoke(appliedArgs);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(output<{ status: string }>(replay).status, "already_applied");
    assert.notEqual(invoke(applyArgs("repair:duplicate-plan", 24, refreshed.planHash)).status, 0);
    assert.deepEqual(await counts(), { items: "24", runs: "1" });
    const legacyAfter = await fixture.pool.query(`select coalesce(jsonb_agg(to_jsonb(item) order by to_jsonb(item)::text), '[]'::jsonb) as value from orbit_records item`);
    const legacyBefore = JSON.parse(before) as Array<{ table: string; value: unknown }>;
    assert.deepEqual(legacyAfter.rows[0]?.value, legacyBefore.find((row) => row.table === "orbit_records")?.value);

    const actorId = fixture.admission.actor_id;
    const participantId = String((await fixture.pool.query(`select participant_id from event_ops_membership_versions
      where workspace_id=$1 order by event_id,actor_id limit 1`, [workspaceId])).rows[0]?.participant_id);
    const answerFragment = String((await fixture.pool.query(`select answer.value
      from event_ops_profile_versions profile
      cross join lateral jsonb_each_text(profile.profile_payload->'registrationProfile'->'answers') answer
      where profile.workspace_id=$1 and length(trim(answer.value)) > 0
      order by profile.event_id,profile.participant_id,answer.key limit 1`, [workspaceId])).rows[0]?.value ?? "");
    assert.ok(answerFragment.length > 0, "fixture must provide a real answer fragment to redact");
    const cliText = outputs.join("\n");
    for (const [name, secret] of [
      ["connection string", connectionString!], ["manifest path", manifest], ["actor", actorId],
      ["participant", participantId], ["answer fragment", answerFragment],
    ] as const) assert.ok(!cliText.includes(secret), `${name} leaked from CLI output`);
  } finally {
    await fixture.close();
    await rm(directory, { force: true, recursive: true });
  }
});
