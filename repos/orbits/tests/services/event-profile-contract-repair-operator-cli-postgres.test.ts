import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import { stableProfileRepairValue } from "../../features/events/registration/profile-contract-repair/contract";
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
  assert.ok(connectionString);
  const schema = `profile_repair_operator_cli_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${schema}`;
  const admin = new Pool({ connectionString, max: 1 });
  const scopedUrl = schemaUrl(connectionString, schema);
  const pool = new Pool({ connectionString: scopedUrl, max: 2 });
  const client = createEventOperationsPostgresClient({ connectionString: scopedUrl, pool });
  const repository = createPostgresEventOperationsRepository({ client, workspaceId });
  const close = async () => {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  };
  try {
    await admin.query(`create schema ${schema}`);
    await runEventOperationsMigrations(client);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const eventId of ["repair-cli-a", "repair-cli-b"]) {
      await pool.query(`insert into event_ops_events (
        workspace_id,event_id,organizer_actor_id,lifecycle_state,revision,created_at,updated_at,
        public_code,title,timezone,starts_at,ends_at,lifecycle_state_v2,source_payload,event_version
      ) values ($1,$2,'organizer-repair','active',1,now(),now(),$2,$2,'Asia/Tokyo',
        '2026-09-01T10:00:00Z','2026-09-01T14:00:00Z','published','{}',1)`, [workspaceId,eventId]);
      await pool.query(`insert into event_event_versions (
        workspace_id,event_id,event_version,public_code,title,timezone,starts_at,ends_at,
        lifecycle_state_v2,source_payload,organizer_actor_id,content_hash,created_at
      ) values ($1,$2,1,$2,$2,'Asia/Tokyo','2026-09-01T10:00:00Z','2026-09-01T14:00:00Z',
        'published','{}','organizer-repair',$3,now())`,
      [workspaceId,eventId,createHash("sha256").update(eventId).digest("hex")]);
      await repository.saveConfiguration({
        checkInOpensAt: "2026-09-01T09:00:00.000Z",
        eventEndsAt: "2026-09-01T14:00:00.000Z", eventId,
        eventStartsAt: "2026-09-01T10:00:00.000Z", maxAttemptsPerTask: 3,
        organizerActorId: "organizer-repair", profileEditDeadlineAt: "2026-08-20T10:00:00.000Z",
        recommendationCount: 4, registrationCutoffAt: "2026-08-25T10:00:00.000Z",
        resultsAvailableAt: "2026-08-26T10:00:00.000Z", roundOneStartsAt: "2026-09-01T11:00:00.000Z",
        roundTwoStartsAt: "2026-09-01T12:00:00.000Z", shardSize: 6, tableSize: 6,
        updatedAt: "2026-08-04T10:00:00.000Z",
      });
      const registrations: EventRegistration[] = Array.from({ length: 13 }, (_, index) => {
        const userId = `actor:${eventId}:${index}`;
        const id = `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
        const participantProfileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
        const registeredAt = "2026-08-05T10:00:00.000Z";
        const cancelledAt = index % 4 === 3 ? "2026-08-06T10:00:00.000Z" : null;
        return {
          cancelledAt, eventId, id, participantProfileId, registeredAt, reactivatedAt: null,
          status: cancelledAt ? "cancelled" : "rsvped", updatedAt: cancelledAt ?? registeredAt, userId,
          sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false,
            notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
          participantProfile: {
            answers: { positioning: `Distinct role ${index} @ ${eventId}`,
              targetAttendees: `Synthetic collaborators ${index}`, valueOffered: `Synthetic expertise ${index}` },
            createdAt: registeredAt, displayName: `Fictional participant ${index}`, eventId,
            id: participantProfileId, updatedAt: registeredAt, userId,
          },
        };
      });
      await repository.activateCanonicalRegistrations(eventId, registrations);
    }
    // Inject the historical defect only after creating valid canonical evidence.
    // The thirteenth profile in each event remains a no-op control.
    const profiles = await pool.query<{ actor_id: string; event_id: string; participant_id: string;
      profile_version: number; profile_payload: Record<string, unknown> }>(
      "select actor_id,event_id,participant_id,profile_version,profile_payload from event_ops_profile_versions where workspace_id=$1",
      [workspaceId]);
    for (const [index, row] of profiles.rows.entries()) {
      if (row.actor_id.endsWith(":12")) continue;
      const payload = structuredClone(row.profile_payload);
      const participant = payload.participant as Record<string, unknown>;
      const registration = payload.registrationProfile as Record<string, unknown>;
      const whitespace = ["", "   ", "\u3000\t"][index % 3];
      if (row.actor_id === "actor:repair-cli-a:0") delete participant.profileAnswers;
      else (participant.profileAnswers as Record<string, unknown>).industry = whitespace;
      (registration.answers as Record<string, unknown>).industry = whitespace;
      await pool.query(`update event_ops_profile_versions set profile_payload=$5,profile_hash=$6
        where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4`,
      [workspaceId,row.event_id,row.participant_id,row.profile_version,JSON.stringify(payload),
        createHash("sha256").update(JSON.stringify(stableProfileRepairValue(payload))).digest("hex")]);
    }
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,source_type,
      source_id,payload,created_at,updated_at) values ($1,'unrelated-fixture','sentinel','manual',
      'synthetic-cli-test','{"preserve":true}',now(),now())`, [workspaceId]);
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
    return { admission, plan, pool, schema, scopedUrl, workspaceId, close };
  } catch (error) {
    await close();
    throw error;
  }
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
    assert.equal(plan.eventCount, 2);
    assert.ok(plan.targetCount === 0 || plan.targetCount === 24);
    const manifest = join(directory, "scope.json");
    await writeFile(manifest, JSON.stringify({ events: plan.events.map((event) => event.eventId), repairType: "canonical_profile_empty_answer_v1", schemaVersion: 1 }));
    const result = command(["--dry-run", "--workspace-id", workspaceId, "--scope-manifest", manifest], {
      ...process.env, ORBIT_EVENT_DATABASE_URL: connectionString, ORBIT_WORKSPACE_ID: workspaceId,
    });
    assert.equal(result.status, 0, result.stderr);
    const jsonStart = result.stdout.indexOf("{");
    assert.ok(jsonStart >= 0, result.stdout);
    const output = JSON.parse(result.stdout.slice(jsonStart)) as { eventCount: number; targetCount: number; mode: string };
    assert.deepEqual(
      { eventCount: output.eventCount, mode: output.mode, targetCount: output.targetCount },
      { eventCount: plan.eventCount, mode: "dry-run", targetCount: plan.targetCount },
    );
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
  skip: connectionString ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
  timeout: 120_000,
}, async () => {
  const fixture = await createTemporaryFixture();
  const workspaceId = fixture.workspaceId;
  const directory = await mkdtemp(join(tmpdir(), "profile-repair-cli-postgres-"));
  const outputs: string[] = [];
  const invoke = (args: readonly string[]) => {
    const result = command(args, {
      ...process.env,
      ORBIT_EVENT_DATABASE_URL: fixture.scopedUrl,
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
    const noOpProfilesQuery = `select coalesce(jsonb_agg(to_jsonb(profile) order by profile.event_id), '[]'::jsonb) as value
      from event_ops_profile_versions profile where actor_id like '%:12'`;
    const noOpProfilesBefore = (await fixture.pool.query(noOpProfilesQuery)).rows[0]?.value;
    assert.equal(noOpProfilesBefore.length, 2, "each event retains one already-valid control profile");
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
    assert.deepEqual((await fixture.pool.query(noOpProfilesQuery)).rows[0]?.value, noOpProfilesBefore,
      "already-valid profiles must not receive new versions or payload changes");
    assert.equal(Number((await fixture.pool.query("select count(*) as count from event_ops_profile_versions")).rows[0]?.count), 50,
      "26 original profiles plus exactly 24 repaired versions");
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
      ["connection string", connectionString!], ["scoped connection string", fixture.scopedUrl], ["manifest path", manifest], ["actor", actorId],
      ["participant", participantId], ["answer fragment", answerFragment],
    ] as const) assert.ok(!cliText.includes(secret), `${name} leaked from CLI output`);
  } finally {
    await fixture.close();
    await rm(directory, { force: true, recursive: true });
  }
});
