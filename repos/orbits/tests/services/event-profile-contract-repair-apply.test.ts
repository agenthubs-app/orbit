import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsOutboxProjector } from "../../features/events/event-operations/outbox-projector";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { withCanonicalMembershipMigrationSnapshot } from "../../features/events/registration/canonical-migration/snapshot-runner";
import { applyProfileContractRepair } from "../../features/events/registration/profile-contract-repair/apply-repository";
import { ProfileContractRepairApplyError } from "../../features/events/registration/profile-contract-repair/apply-contract";
import { buildProfileContractRepairPlan } from "../../features/events/registration/profile-contract-repair/planner";
import { readProfileContractRepairSource } from "../../features/events/registration/profile-contract-repair/source-reader";
import {
  profileRepairToken,
  stableProfileRepairValue,
} from "../../features/events/registration/profile-contract-repair/contract";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const workspaceId = process.env.ORBIT_WORKSPACE_ID;

function schemaUrl(value: string, schema: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function storedFixtureHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableProfileRepairValue(value)))
    .digest("hex");
}

async function cloneFixture(
  prefix: string,
  prepare?: (input: { pool: Pool; workspaceId: string }) => Promise<void>,
) {
  assert.ok(databaseUrl && workspaceId);
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const scopedUrl = schemaUrl(databaseUrl, schema);
  const pool = new Pool({ connectionString: scopedUrl, max: 2 });
  const client = createEventOperationsPostgresClient({ connectionString: scopedUrl, pool });
  const sourceSchema = String((await admin.query(`select current_schema() as value`)).rows[0]?.value);
  await admin.query(`create schema ${schema}`);
  await runEventOperationsMigrations(client);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  for (const table of ["event_ops_events","event_event_versions","event_ops_configurations",
    "event_ops_configuration_heads","event_ops_profile_versions","event_ops_profile_heads",
    "event_ops_profile_response_versions"]) {
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
  const admission = (await pool.query(`select event_id,actor_id,membership_version,registered_at
    from event_ops_membership_versions where workspace_id=$1 order by event_id,actor_id limit 1`, [workspaceId])).rows[0]!;
  await pool.query(`insert into event_ops_admission_policy_versions
    (workspace_id,event_id,policy_version,capacity,admission_mode,waitlist_enabled,
     registration_opens_at,registration_closes_at,updated_at,profile_edit_deadline_at)
    values ($1,$2,1,null,'instant',true,$3::timestamptz-interval '1 day',$3::timestamptz+interval '1 day',$3,$3)`,
    [workspaceId,admission.event_id,admission.registered_at]);
  await pool.query(`insert into event_ops_admission_application_versions
    (workspace_id,event_id,actor_id,application_version,policy_version,status,profile_payload,
     submitted_at,updated_at,decided_at,decision_actor_id)
    values ($1,$2,$3,1,1,'admitted','{}',$4,$4,$4,'actor:test-organizer')`,
    [workspaceId,admission.event_id,admission.actor_id,admission.registered_at]);
  await pool.query(`update event_ops_membership_versions set origin='admission_application',admission_application_version=1
    where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [workspaceId,admission.event_id,admission.actor_id,admission.membership_version]);
  await pool.query(`insert into event_ops_membership_heads select * from ${sourceSchema}.event_ops_membership_heads where workspace_id=$1`, [workspaceId]);
  await pool.query(`insert into event_ops_audit_log select * from ${sourceSchema}.event_ops_audit_log
    where workspace_id=$1 and action='registration_migration_activated'`, [workspaceId]);
  await prepare?.({ pool, workspaceId });
  const reviewed = await withCanonicalMembershipMigrationSnapshot({ connectionString: scopedUrl,
    isolation: "serializable", operation: async (snapshot) => {
      const source = await readProfileContractRepairSource({ snapshot, workspaceId });
      return { plan: buildProfileContractRepairPlan(source), source };
    } });
  const { plan, source } = reviewed;
  assert.equal(plan.targetCount, 24, JSON.stringify(plan.blockers)); assert.ok(plan.applyPlanHash);
  return {
    admin, pool, schema, scopedUrl, plan, planHash: plan.applyPlanHash, source,
    command(repairId: string, applicationName?: string) {
      const url = new URL(scopedUrl);
      if (applicationName) url.searchParams.set("application_name", applicationName);
      return { connectionString:url.toString(),expectedCount:24,expectedPlanHash:plan.applyPlanHash!,repairId,workspaceId:workspaceId! };
    },
    async close() { await client.close(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); },
  };
}

test("apply command rejects extra and malformed values without diagnostics echo", async () => {
  await assert.rejects(
    applyProfileContractRepair({ connectionString: "secret", expectedCount: 0 }),
    (error: unknown) =>
      error instanceof ProfileContractRepairApplyError &&
      error.code === "PROFILE_CONTRACT_REPAIR_COMMAND_INVALID" &&
      !error.message.includes("secret"),
  );
});

test(
  "serializable profile repair atomically applies the real diverse 24-target fixture clone and replays",
  {
    skip: databaseUrl && workspaceId ? false : "ORBIT_EVENT_DATABASE_URL/ORBIT_WORKSPACE_ID is not configured",
    timeout: 120_000,
  },
  async () => {
    assert.ok(databaseUrl && workspaceId);
    const schema = `profile_repair_apply_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedUrl = schemaUrl(databaseUrl, schema);
    const pool = new Pool({ connectionString: scopedUrl, max: 2 });
    const client = createEventOperationsPostgresClient({ connectionString: scopedUrl, pool });
    try {
      const sourceSchema = String((await admin.query(`select current_schema() as value`)).rows[0]?.value);
      assert.match(sourceSchema, /^[A-Za-z_][A-Za-z0-9_]*$/u);
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
      const tables = [
        "event_ops_events", "event_event_versions", "event_ops_configurations",
        "event_ops_configuration_heads", "event_ops_profile_versions",
        "event_ops_profile_heads", "event_ops_profile_response_versions",
      ];
      for (const table of tables) {
        await pool.query(`insert into ${table} select * from ${sourceSchema}.${table} where workspace_id=$1`, [workspaceId]);
      }
      await pool.query(
        `insert into event_ops_membership_versions (
           workspace_id,event_id,actor_id,membership_version,participant_id,
           profile_version,status,registered_at,cancelled_at,reactivated_at,
           late_registration,source_registration_id,created_at,effective_at,
           origin,admission_application_version
         ) select workspace_id,event_id,actor_id,membership_version,participant_id,
           profile_version,status,registered_at,cancelled_at,reactivated_at,
           late_registration,source_registration_id,created_at,effective_at,
           'legacy_registration',null
         from ${sourceSchema}.event_ops_membership_versions where workspace_id=$1`,
        [workspaceId],
      );
      await pool.query(
        `insert into event_ops_membership_heads
         select * from ${sourceSchema}.event_ops_membership_heads where workspace_id=$1`,
        [workspaceId],
      );
      await pool.query(
        `insert into event_ops_audit_log select * from ${sourceSchema}.event_ops_audit_log
          where workspace_id=$1 and action='registration_migration_activated'`, [workspaceId],
      );
      await pool.query(
        `insert into orbit_records select * from ${sourceSchema}.orbit_records where workspace_id=$1`, [workspaceId],
      );
      const beforeLegacy = JSON.stringify((await pool.query(
        `select * from orbit_records order by workspace_id,collection_name,record_id`,
      )).rows);
      const plan = await withCanonicalMembershipMigrationSnapshot({
        connectionString: scopedUrl,
        isolation: "serializable",
        operation: async (snapshot) => buildProfileContractRepairPlan(
          await readProfileContractRepairSource({ snapshot, workspaceId }),
        ),
      });
      assert.equal(plan.applyEligible, true);
      assert.equal(plan.targetCount, 24);
      assert.ok(plan.applyPlanHash);
      const command = {
        connectionString: scopedUrl, expectedCount: 24,
        expectedPlanHash: plan.applyPlanHash, repairId: "repair-run:test-clone-24", workspaceId,
      };
      await assert.rejects(
        applyProfileContractRepair({ ...command, expectedCount: 23 }),
        (error: unknown) => error instanceof ProfileContractRepairApplyError &&
          error.code === "PROFILE_CONTRACT_REPAIR_PLAN_DRIFT",
      );
      const mutableTables = ["event_ops_profile_versions","event_ops_profile_heads",
        "event_ops_membership_versions","event_ops_membership_heads","event_ops_profile_response_versions",
        "event_ops_audit_log","event_ops_outbox","event_ops_data_repair_runs",
        "event_ops_data_repair_items","orbit_records"];
      const snapshot = async () => JSON.stringify(await Promise.all(mutableTables.map(async (table) => ({
        table, rows:(await pool.query(`select to_jsonb(item) as value from ${table} item order by to_jsonb(item)::text`)).rows,
      }))));
      const beforeInjectedFailures = await snapshot();
      await pool.query(`create function reject_profile_repair_stage() returns trigger language plpgsql as $$
        begin raise exception 'injected repair stage failure'; end $$`);
      const stages = [
        ["run_insert","event_ops_data_repair_runs","before insert","row"],
        ["profile_version","event_ops_profile_versions","before insert","row"],
        ["response_copy","event_ops_profile_response_versions","before insert","statement"],
        ["profile_head","event_ops_profile_heads","before update","row"],
        ["membership_version","event_ops_membership_versions","before insert","row"],
        ["membership_head","event_ops_membership_heads","before update","row"],
        ["audit","event_ops_audit_log","before insert","row"],
        ["outbox","event_ops_outbox","before insert","row"],
        ["ledger_item","event_ops_data_repair_items","before insert","row"],
      ] as const;
      for (const [stage, table, timing, scope] of stages) {
        await pool.query(`create trigger reject_${stage} ${timing} on ${table}
          for each ${scope} execute function reject_profile_repair_stage()`);
        await assert.rejects(
          applyProfileContractRepair({ ...command, repairId: `repair-run:failure-${stage}` }),
          (error: unknown) => error instanceof ProfileContractRepairApplyError &&
            error.code === "PROFILE_CONTRACT_REPAIR_DATABASE_FAILED",
        );
        await pool.query(`drop trigger reject_${stage} on ${table}`);
        assert.equal(await snapshot(), beforeInjectedFailures, stage);
      }
      await pool.query(`drop function reject_profile_repair_stage()`);
      const applied = await applyProfileContractRepair(command);
      assert.equal(applied.status, "applied");
      assert.equal(applied.count, 24);
      const replay = await applyProfileContractRepair(command);
      assert.deepEqual(replay, { ...applied, status: "already_applied" });
      for (const [table, count] of [
        ["event_ops_data_repair_runs", 1], ["event_ops_data_repair_items", 24],
      ] as const) {
        assert.equal(Number((await pool.query(`select count(*) as count from ${table}`)).rows[0]?.count), count);
      }
      assert.equal(Number((await pool.query(
        `select count(*) as count from event_ops_audit_log where action='event.registration.profile_contract_repaired'`,
      )).rows[0]?.count), 24);
      assert.equal(Number((await pool.query(
        `select count(*) as count from event_ops_outbox where event_type='event.registration.profile_contract_repaired'`,
      )).rows[0]?.count), 24);
      const projectedStore = createMemoryLiveRecordStore<Record<string, unknown>>();
      const projector = createEventOperationsOutboxProjector({
        registrationProvider: createEventRegistrationLiveRecordProvider({ store: projectedStore, workspaceId }),
        relationshipProvider: createStorageBusinessCardContactWriteProvider({ store: projectedStore, workspaceId }),
      });
      const outboxes = (await pool.query<Record<string, unknown>>(
        `select outbox_id,event_id,aggregate_type,aggregate_id,event_type,payload
           from event_ops_outbox where event_type='event.registration.profile_contract_repaired'
           order by outbox_id`,
      )).rows;
      for (const outbox of outboxes) {
        assert.deepEqual(await projector.project({
          aggregateId: String(outbox.aggregate_id), aggregateType: String(outbox.aggregate_type),
          attempts: 1, eventId: String(outbox.event_id), eventType: String(outbox.event_type),
          leaseEpoch: 1, leaseExpiresAt: "2026-08-05T10:01:00.000Z", leaseToken: "lease:test",
          outboxId: String(outbox.outbox_id), payload: outbox.payload as Record<string, unknown>, workerId: "worker:test",
        }), { policy: "canonical_only", projectedIds: [], projection: "none" });
      }
      assert.deepEqual(await projectedStore.listRecords({ workspaceId }), []);
      assert.equal(JSON.stringify((await pool.query(
        `select * from orbit_records order by workspace_id,collection_name,record_id`,
      )).rows), beforeLegacy);
      await assert.rejects(
        applyProfileContractRepair({ ...command, repairId: "repair-run:test-clone-duplicate" }),
        (error: unknown) => error instanceof ProfileContractRepairApplyError &&
          error.code === "PROFILE_CONTRACT_REPAIR_PLAN_ALREADY_APPLIED",
      );
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test("concurrent same-run and same-plan repairs serialize to one physical apply", {
  skip: databaseUrl && workspaceId ? false : "database is not configured", timeout: 120_000,
}, async () => {
  const sameRun = await cloneFixture("profile_repair_same_run");
  try {
    const results = await Promise.all([
      applyProfileContractRepair(sameRun.command("repair-run:concurrent-same")),
      applyProfileContractRepair(sameRun.command("repair-run:concurrent-same")),
    ]);
    assert.deepEqual(results.map((value) => value.status).sort(), ["already_applied", "applied"]);
    assert.equal(Number((await sameRun.pool.query(`select count(*) from event_ops_data_repair_runs`)).rows[0]?.count), 1);
    assert.equal(Number((await sameRun.pool.query(`select count(*) from event_ops_data_repair_items`)).rows[0]?.count), 24);
  } finally { await sameRun.close(); }

  const differentRun = await cloneFixture("profile_repair_same_plan");
  try {
    const settled = await Promise.allSettled([
      applyProfileContractRepair(differentRun.command("repair-run:concurrent-a")),
      applyProfileContractRepair(differentRun.command("repair-run:concurrent-b")),
    ]);
    assert.equal(settled.filter((value) => value.status === "fulfilled").length, 1);
    const rejected = settled.find((value): value is PromiseRejectedResult => value.status === "rejected");
    assert.ok(rejected?.reason instanceof ProfileContractRepairApplyError);
    assert.equal(rejected.reason.code, "PROFILE_CONTRACT_REPAIR_PLAN_ALREADY_APPLIED");
    assert.equal(Number((await differentRun.pool.query(`select count(*) from event_ops_data_repair_runs`)).rows[0]?.count), 1);
  } finally { await differentRun.close(); }
});

test("serialization and deadlock SQLSTATE retries rebuild the original reviewed plan and close clients", {
  skip: databaseUrl && workspaceId ? false : "database is not configured", timeout: 120_000,
}, async () => {
  const fixture = await cloneFixture("profile_repair_retry");
  const appName = `c1_retry_${randomUUID().replaceAll("-", "")}`;
  try {
    await fixture.pool.query(`create sequence repair_retry_attempt`);
    await fixture.pool.query(`create function inject_repair_retry() returns trigger language plpgsql as $$
      declare n bigint; begin n:=nextval('repair_retry_attempt');
      if n=1 then raise exception 'retry' using errcode='40001'; end if;
      if n=2 then raise exception 'deadlock' using errcode='40P01'; end if;
      return new; end $$`);
    await fixture.pool.query(`create trigger inject_repair_retry before insert on event_ops_data_repair_runs
      for each row execute function inject_repair_retry()`);
    assert.equal((await applyProfileContractRepair(fixture.command("repair-run:retry-success", appName))).status, "applied");
    assert.equal(Number((await fixture.pool.query(`select last_value from repair_retry_attempt`)).rows[0]?.last_value), 3);
    assert.equal(Number((await fixture.admin.query(`select count(*) from pg_stat_activity where application_name=$1`, [appName])).rows[0]?.count), 0);
  } finally { await fixture.close(); }

  const exhausted = await cloneFixture("profile_repair_retry_exhausted");
  const exhaustedApp = `c1_exhausted_${randomUUID().replaceAll("-", "")}`;
  try {
    await exhausted.pool.query(`create sequence repair_retry_attempt`);
    await exhausted.pool.query(`create function inject_repair_retry() returns trigger language plpgsql as $$
      begin perform nextval('repair_retry_attempt'); raise exception 'retry' using errcode='40001'; end $$`);
    await exhausted.pool.query(`create trigger inject_repair_retry before insert on event_ops_data_repair_runs
      for each row execute function inject_repair_retry()`);
    await assert.rejects(applyProfileContractRepair(exhausted.command("repair-run:retry-exhausted", exhaustedApp)),
      (error: unknown) => error instanceof ProfileContractRepairApplyError && error.code === "PROFILE_CONTRACT_REPAIR_RETRY_EXHAUSTED");
    assert.equal(Number((await exhausted.pool.query(`select last_value from repair_retry_attempt`)).rows[0]?.last_value), 3);
    assert.equal(Number((await exhausted.pool.query(`select count(*) from event_ops_data_repair_runs`)).rows[0]?.count), 0);
    assert.equal(Number((await exhausted.admin.query(`select count(*) from pg_stat_activity where application_name=$1`, [exhaustedApp])).rows[0]?.count), 0);
  } finally { await exhausted.close(); }
});

test("reviewed hash fails closed before writes for configuration, audit, head, lifecycle, provenance, and response drift", {
  skip: databaseUrl && workspaceId ? false : "database is not configured", timeout: 120_000,
}, async () => {
  const fixture = await cloneFixture("profile_repair_drift");
  const assertDrift = async (name: string) => {
    await assert.rejects(applyProfileContractRepair(fixture.command(`repair-run:drift-${name}`)),
      (error: unknown) => error instanceof ProfileContractRepairApplyError &&
        error.code === "PROFILE_CONTRACT_REPAIR_PLAN_DRIFT");
    assert.equal(Number((await fixture.pool.query(`select count(*) from event_ops_data_repair_runs`)).rows[0]?.count), 0);
  };
  try {
    const configuration = (await fixture.pool.query(`select c.workspace_id,c.event_id,c.configuration_version,c.profile_edit_deadline_at
      from event_ops_configurations c join event_ops_configuration_heads h using(workspace_id,event_id,configuration_version)
      where c.workspace_id=$1 order by c.event_id limit 1`, [workspaceId])).rows[0]!;
    await fixture.pool.query(`update event_ops_configurations set profile_edit_deadline_at=profile_edit_deadline_at-interval '1 second'
      where workspace_id=$1 and event_id=$2 and configuration_version=$3`, [configuration.workspace_id,configuration.event_id,configuration.configuration_version]);
    await assertDrift("configuration");
    await fixture.pool.query(`update event_ops_configurations set profile_edit_deadline_at=$4
      where workspace_id=$1 and event_id=$2 and configuration_version=$3`, [configuration.workspace_id,configuration.event_id,configuration.configuration_version,configuration.profile_edit_deadline_at]);

    const audit = (await fixture.pool.query(`select audit_id,after_payload from event_ops_audit_log
      where workspace_id=$1 and action='registration_migration_activated' order by audit_id limit 1`, [workspaceId])).rows[0]!;
    await fixture.pool.query(`update event_ops_audit_log set after_payload=after_payload||'{"unexpected":true}'::jsonb where workspace_id=$1 and audit_id=$2`, [workspaceId,audit.audit_id]);
    await assertDrift("audit");
    await fixture.pool.query(`update event_ops_audit_log set after_payload=$3 where workspace_id=$1 and audit_id=$2`, [workspaceId,audit.audit_id,audit.after_payload]);

    const head = (await fixture.pool.query(`select event_id,participant_id,revision from event_ops_profile_heads
      where workspace_id=$1 order by event_id,participant_id limit 1`, [workspaceId])).rows[0]!;
    await fixture.pool.query(`update event_ops_profile_heads set revision=revision+1 where workspace_id=$1 and event_id=$2 and participant_id=$3`, [workspaceId,head.event_id,head.participant_id]);
    await assertDrift("profile-head");
    await fixture.pool.query(`update event_ops_profile_heads set revision=$4 where workspace_id=$1 and event_id=$2 and participant_id=$3`, [workspaceId,head.event_id,head.participant_id,head.revision]);

    const membership = (await fixture.pool.query(`select v.event_id,v.actor_id,v.participant_id,v.membership_version,v.late_registration
      from event_ops_membership_versions v join event_ops_membership_heads h using(workspace_id,event_id,actor_id,membership_version)
      join event_ops_events e using(workspace_id,event_id)
      where v.workspace_id=$1 and e.registration_migration_state='canonical'
        and v.origin='legacy_registration'
      order by v.event_id,v.actor_id limit 1`, [workspaceId])).rows[0]!;
    await fixture.pool.query(`update event_ops_membership_versions set late_registration=not late_registration
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`, [workspaceId,membership.event_id,membership.actor_id,membership.membership_version]);
    await assertDrift("lifecycle");
    await fixture.pool.query(`update event_ops_membership_versions set late_registration=$5
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`, [workspaceId,membership.event_id,membership.actor_id,membership.membership_version,membership.late_registration]);

    await fixture.pool.query(`insert into event_ops_admission_policy_versions
      (workspace_id,event_id,policy_version,capacity,admission_mode,waitlist_enabled,
       registration_opens_at,registration_closes_at,updated_at)
      values ($1,$2,1,120,'instant',true,'2025-01-01T00:00:00.000Z',
              '2027-01-01T00:00:00.000Z','2026-08-01T00:00:00.000Z')
      on conflict (workspace_id,event_id,policy_version) do nothing`, [workspaceId,membership.event_id]);
    await fixture.pool.query(`insert into event_ops_admission_application_versions
      (workspace_id,event_id,actor_id,application_version,policy_version,status,profile_payload,
       submitted_at,updated_at,decided_at,decision_actor_id)
      values ($1,$2,$3,1,1,'admitted','{}'::jsonb,'2026-08-01T01:00:00.000Z',
              '2026-08-01T01:05:00.000Z','2026-08-01T01:05:00.000Z','operator:drift')
      on conflict (workspace_id,event_id,actor_id,application_version) do nothing`,
    [workspaceId,membership.event_id,membership.actor_id]);
    const provenanceUpdate = await fixture.pool.query(`update event_ops_membership_versions
      set origin='admission_application',admission_application_version=1
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [workspaceId,membership.event_id,membership.actor_id,membership.membership_version]);
    assert.equal(provenanceUpdate.rowCount, 1);
    assert.deepEqual((await fixture.pool.query(`select
      to_jsonb(version_row)->>'origin' as origin,
      to_jsonb(version_row)->>'admission_application_version' as admission_application_version
      from event_ops_membership_versions version_row where workspace_id=$1 and event_id=$2
      and actor_id=$3 and membership_version=$4`, [workspaceId,membership.event_id,
      membership.actor_id,membership.membership_version])).rows[0], {
      origin: "admission_application", admission_application_version: "1",
    });
    const provenanceReviewed = await withCanonicalMembershipMigrationSnapshot({
      connectionString: fixture.scopedUrl,
      isolation: "serializable",
      operation: async (snapshot) => {
        const source = await readProfileContractRepairSource({ snapshot, workspaceId: workspaceId! });
        return { plan: buildProfileContractRepairPlan(source), source };
      },
    });
    const provenanceToken = profileRepairToken("profile-target",
      `${workspaceId}\0${membership.event_id}\0${membership.participant_id}`);
    assert.notEqual(
      provenanceReviewed.source.inventory.find((row) => row.targetToken === provenanceToken)?.lifecycleHash,
      fixture.source.inventory.find((row) => row.targetToken === provenanceToken)?.lifecycleHash,
    );
    assert.notEqual(provenanceReviewed.plan.applyPlanHash, fixture.planHash);
    await assertDrift("provenance");
    await fixture.pool.query(`update event_ops_membership_versions
      set origin='legacy_registration',admission_application_version=null
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [workspaceId,membership.event_id,membership.actor_id,membership.membership_version]);
    await fixture.pool.query(`delete from event_ops_admission_application_versions
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and application_version=1`,
    [workspaceId,membership.event_id,membership.actor_id]);

    const profile = (await fixture.pool.query(`select event_id,participant_id,profile_version from event_ops_profile_heads
      where workspace_id=$1 order by event_id,participant_id limit 1`, [workspaceId])).rows[0]!;
    const answeredAt = "2026-08-05T00:00:00.000Z";
    const responsePayload = { answer:{customText:"drift",displayText:"drift",selectedOptionIds:[]},answerSource:"participant",
      answeredAt,field:"industry",generation:null,question:null,questionId:null,questionSource:"legacy_unknown",
      responseId:"legacy:drift-injected",visibility:"event_attendees" };
    await fixture.pool.query(`insert into event_ops_profile_response_versions
      (workspace_id,event_id,participant_id,profile_version,response_id,field_key,visibility,question_source,response_payload,answered_at,created_at)
      values ($1,$2,$3,$4,$5,'industry','event_attendees','legacy_unknown',$6,$7,$7)`,
      [workspaceId,profile.event_id,profile.participant_id,profile.profile_version,responsePayload.responseId,responsePayload,answeredAt]);
    await assertDrift("response");
  } finally { await fixture.close(); }
});

test("exact repair replay remains ledger-idempotent after a later legitimate profile edit", {
  skip: databaseUrl && workspaceId ? false : "database is not configured", timeout: 120_000,
}, async () => {
  const fixture = await cloneFixture("profile_repair_later_edit");
  const command = fixture.command("repair-run:later-edit-replay");
  try {
    const applied = await applyProfileContractRepair(command);
    const current = (await fixture.pool.query(`select mh.event_id,mh.actor_id,mh.participant_id,
      mh.membership_version,mh.profile_version,mh.revision as membership_revision,
      ph.revision as profile_revision from event_ops_membership_heads mh join event_ops_profile_heads ph
      on ph.workspace_id=mh.workspace_id and ph.event_id=mh.event_id and ph.participant_id=mh.participant_id
      where mh.workspace_id=$1 order by mh.event_id,mh.actor_id limit 1`, [workspaceId])).rows[0]!;
    await fixture.pool.query(`insert into event_ops_profile_versions
      (workspace_id,event_id,participant_id,profile_version,actor_id,profile_payload,profile_hash,
       source_registration_id,created_at,effective_at)
      select workspace_id,event_id,participant_id,$5,actor_id,profile_payload,profile_hash,source_registration_id,
             statement_timestamp(),statement_timestamp()
      from event_ops_profile_versions where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4`,
      [workspaceId,current.event_id,current.participant_id,current.profile_version,Number(current.profile_version)+1]);
    await fixture.pool.query(`update event_ops_profile_heads set profile_version=$4,revision=revision+1,updated_at=statement_timestamp()
      where workspace_id=$1 and event_id=$2 and participant_id=$3`,
      [workspaceId,current.event_id,current.participant_id,Number(current.profile_version)+1]);
    await fixture.pool.query(`insert into event_ops_membership_versions
      (workspace_id,event_id,actor_id,membership_version,participant_id,profile_version,status,
       registered_at,cancelled_at,reactivated_at,late_registration,source_registration_id,
       created_at,effective_at,origin,admission_application_version)
      select workspace_id,event_id,actor_id,$5,participant_id,$6,status,registered_at,cancelled_at,reactivated_at,
             late_registration,source_registration_id,statement_timestamp(),statement_timestamp(),origin,admission_application_version
      from event_ops_membership_versions where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
      [workspaceId,current.event_id,current.actor_id,current.membership_version,Number(current.membership_version)+1,Number(current.profile_version)+1]);
    await fixture.pool.query(`update event_ops_membership_heads set membership_version=$4,profile_version=$5,
      revision=revision+1,updated_at=statement_timestamp() where workspace_id=$1 and event_id=$2 and actor_id=$3`,
      [workspaceId,current.event_id,current.actor_id,Number(current.membership_version)+1,Number(current.profile_version)+1]);
    const beforeReplay = JSON.stringify((await fixture.pool.query(`select
      (select count(*) from event_ops_data_repair_runs) runs,
      (select count(*) from event_ops_data_repair_items) items,
      (select count(*) from event_ops_audit_log where action='event.registration.profile_contract_repaired') audits,
      (select count(*) from event_ops_outbox where event_type='event.registration.profile_contract_repaired') outboxes`)).rows[0]);
    assert.deepEqual(await applyProfileContractRepair(command), { ...applied, status:"already_applied" });
    assert.equal(JSON.stringify((await fixture.pool.query(`select
      (select count(*) from event_ops_data_repair_runs) runs,
      (select count(*) from event_ops_data_repair_items) items,
      (select count(*) from event_ops_audit_log where action='event.registration.profile_contract_repaired') audits,
      (select count(*) from event_ops_outbox where event_type='event.registration.profile_contract_repaired') outboxes`)).rows[0]), beforeReplay);
  } finally { await fixture.close(); }
});

test("apply preserves adaptive and legacy responses, mirror absence, second-cancel lifecycle, and admission origin", {
  skip: databaseUrl && workspaceId ? false : "database is not configured", timeout: 120_000,
}, async () => {
  let admissionTargetIdentity: {
    actorId: string; eventId: string; membershipVersion: number; participantId: string;
  } | null = null;
  const fixture = await cloneFixture("profile_repair_diverse", async ({ pool, workspaceId: fixtureWorkspaceId }) => {
    const currentRows = (await pool.query<{
      actor_id: string;
      cancelled_at: Date | null;
      event_id: string;
      membership_version: string;
      participant_id: string;
      profile_effective_at: Date;
      profile_payload: Record<string, unknown>;
      profile_version: string;
      registered_at: Date;
    }>(`select mh.event_id,mh.actor_id,mh.participant_id,mh.membership_version,mh.profile_version,
              mv.registered_at,mv.cancelled_at,pv.effective_at as profile_effective_at,pv.profile_payload
         from event_ops_membership_heads mh
         join event_ops_membership_versions mv using(workspace_id,event_id,actor_id,membership_version)
         join event_ops_profile_heads ph on ph.workspace_id=mh.workspace_id and ph.event_id=mh.event_id
          and ph.participant_id=mh.participant_id and ph.profile_version=mh.profile_version
         join event_ops_profile_versions pv on pv.workspace_id=ph.workspace_id and pv.event_id=ph.event_id
          and pv.participant_id=ph.participant_id and pv.profile_version=ph.profile_version
        where mh.workspace_id=$1 order by mh.event_id,mh.actor_id`, [fixtureWorkspaceId])).rows;
    const candidates = currentRows.filter((row) => {
      const registration = row.profile_payload.registrationProfile as { answers?: Record<string, unknown> };
      return Object.values(registration.answers ?? {}).some(
        (value) => typeof value === "string" && value.trim().length === 0,
      );
    });
    assert.equal(candidates.length, 24);
    const adaptiveTarget = candidates[0]!;
    const legacyTarget = candidates[1]!;
    const cancelledTarget = candidates[3]!;

    const responseSpecs = [
      { adaptiveField: "positioning", row: adaptiveTarget },
      { adaptiveField: null, row: legacyTarget },
    ] as const;
    for (const spec of responseSpecs) {
      const payload = structuredClone(spec.row.profile_payload);
      const registration = payload.registrationProfile as {
        answers: Record<string, string>;
        interviewResponses?: unknown[];
      };
      const answeredAt = spec.row.profile_effective_at.toISOString();
      const responses = Object.entries(registration.answers).flatMap(([field, answer]) => {
        if (!answer.trim()) return [];
        const adaptive = field === spec.adaptiveField;
        const questionId = adaptive ? `question:repair-diversity:${field}` : null;
        return [{
          answer: { customText: answer, displayText: answer, selectedOptionIds: [] },
          answerSource: "participant",
          answeredAt,
          field,
          generation: adaptive ? {
            method: "orbit-agent-model-adaptive", model: "gpt-5.6", promptVersion: 2, provider: "openai",
          } : null,
          question: adaptive ? {
            fieldLabel: { en: "Positioning", zh: "个人定位" },
            inputKind: "single_choice_with_custom", language: "zh", options: [
              { id: "operator", label: "Operator building cross-border partnerships" },
            ], prompt: "Which positioning best describes the value you bring to this room?",
          } : null,
          questionId,
          questionSource: adaptive ? "ai_adaptive" : "legacy_unknown",
          responseId: questionId ? `response:${questionId}` : `legacy:${field}`,
          visibility: adaptive ? "matching_only" : "event_attendees",
        }];
      });
      registration.interviewResponses = responses;
      if (spec === responseSpecs[0]) {
        delete (payload.participant as Record<string, unknown>).profileAnswers;
      }
      await pool.query(`update event_ops_profile_versions set profile_payload=$6::jsonb,profile_hash=$7
        where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4
          and actor_id=$5`, [fixtureWorkspaceId,spec.row.event_id,spec.row.participant_id,
        spec.row.profile_version,spec.row.actor_id,JSON.stringify(payload),storedFixtureHash(payload)]);
      for (const response of responses) {
        await pool.query(`insert into event_ops_profile_response_versions
          (workspace_id,event_id,participant_id,profile_version,response_id,field_key,visibility,
           question_source,response_payload,answered_at,created_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10)`, [fixtureWorkspaceId,
          spec.row.event_id,spec.row.participant_id,spec.row.profile_version,response.responseId,
          response.field,response.visibility,response.questionSource,JSON.stringify(response),answeredAt]);
      }
    }

    await pool.query(`update event_ops_membership_versions
      set status='cancelled',reactivated_at=registered_at+interval '1 minute',
          cancelled_at=registered_at+interval '2 minutes',effective_at=registered_at+interval '2 minutes'
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [fixtureWorkspaceId,cancelledTarget.event_id,cancelledTarget.actor_id,cancelledTarget.membership_version]);
    await pool.query(`update event_ops_membership_heads
      set status='cancelled',updated_at=$5::timestamptz+interval '2 minutes'
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [fixtureWorkspaceId,cancelledTarget.event_id,cancelledTarget.actor_id,
      cancelledTarget.membership_version,cancelledTarget.registered_at]);

    const admissionTarget = candidates[2]!;
    admissionTargetIdentity = {
      actorId: admissionTarget.actor_id,
      eventId: admissionTarget.event_id,
      membershipVersion: Number(admissionTarget.membership_version),
      participantId: admissionTarget.participant_id,
    };
    await pool.query(`insert into event_ops_admission_policy_versions
      (workspace_id,event_id,policy_version,capacity,admission_mode,waitlist_enabled,
       registration_opens_at,registration_closes_at,updated_at)
      values ($1,$2,1,120,'instant',true,'2025-01-01T00:00:00.000Z',
              '2027-01-01T00:00:00.000Z','2026-08-01T00:00:00.000Z')
      on conflict (workspace_id,event_id,policy_version) do nothing`,
    [fixtureWorkspaceId,admissionTarget.event_id]);
    await pool.query(`insert into event_ops_admission_application_versions
      (workspace_id,event_id,actor_id,application_version,policy_version,status,profile_payload,
       submitted_at,updated_at,decided_at,decision_actor_id)
      values ($1,$2,$3,1,1,'admitted','{}'::jsonb,'2026-08-01T01:00:00.000Z',
              '2026-08-01T01:05:00.000Z','2026-08-01T01:05:00.000Z','operator:fixture')`,
    [fixtureWorkspaceId,admissionTarget.event_id,admissionTarget.actor_id]);
    await pool.query(`update event_ops_membership_versions
      set origin='admission_application',admission_application_version=1
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4`,
    [fixtureWorkspaceId,admissionTarget.event_id,admissionTarget.actor_id,admissionTarget.membership_version]);
  });
  try {
    assert.ok(admissionTargetIdentity);
    assert.ok(fixture.plan.targets.some((target) => target.targetToken === profileRepairToken(
      "profile-target",
      `${workspaceId}\0${admissionTargetIdentity.eventId}\0${admissionTargetIdentity.participantId}`,
    )));
    const sourceResponses = (await fixture.pool.query(`select event_id,participant_id,profile_version,
      response_id,field_key,visibility,question_source,response_payload,answered_at,created_at
      from event_ops_profile_response_versions order by event_id,participant_id,response_id`)).rows;
    assert.deepEqual([...new Set(sourceResponses.map((row) => row.question_source))].sort(),
      ["ai_adaptive", "legacy_unknown"]);
    const mirrorAbsent = (await fixture.pool.query(`select ph.event_id,ph.participant_id,ph.profile_version
      from event_ops_profile_heads ph join event_ops_profile_versions pv using(workspace_id,event_id,participant_id,profile_version)
      where ph.workspace_id=$1 and not ((pv.profile_payload->'participant') ? 'profileAnswers') limit 1`, [workspaceId])).rows[0];
    assert.ok(mirrorAbsent);
    const secondCancel = (await fixture.pool.query(`select mh.event_id,mh.actor_id,mh.membership_version,
      mv.registered_at,mv.cancelled_at,mv.reactivated_at,mv.status,mv.late_registration
      from event_ops_membership_heads mh join event_ops_membership_versions mv using(workspace_id,event_id,actor_id,membership_version)
      where mh.workspace_id=$1 and mv.status='cancelled' and mv.reactivated_at is not null limit 1`, [workspaceId])).rows[0];
    assert.ok(secondCancel);
    const admission = (await fixture.pool.query(`select mh.event_id,mh.actor_id,mh.membership_version,
      mv.origin,mv.admission_application_version from event_ops_membership_heads mh
      join event_ops_membership_versions mv using(workspace_id,event_id,actor_id,membership_version)
      where mh.workspace_id=$1 and mh.event_id=$2 and mh.actor_id=$3`, [workspaceId,
      admissionTargetIdentity.eventId,admissionTargetIdentity.actorId])).rows[0];
    assert.ok(admission);

    assert.equal((await applyProfileContractRepair(fixture.command("repair-run:diverse-preservation"))).status, "applied");
    const copiedResponses = (await fixture.pool.query(`select response.event_id,response.participant_id,
      response.profile_version-1 as profile_version,
      response.response_id,response.field_key,response.visibility,response.question_source,
      response.response_payload,response.answered_at,response.created_at
      from event_ops_profile_response_versions response join event_ops_data_repair_items item
        on item.workspace_id=response.workspace_id and item.event_id=response.event_id
       and item.participant_id=response.participant_id and item.target_profile_version=response.profile_version
      order by response.event_id,response.participant_id,response.response_id`)).rows;
    assert.deepEqual(copiedResponses, sourceResponses);
    const repairedMirror = (await fixture.pool.query(`select profile_payload
      from event_ops_profile_versions where workspace_id=$1 and event_id=$2 and participant_id=$3
      and profile_version=$4`, [workspaceId,mirrorAbsent.event_id,mirrorAbsent.participant_id,
      Number(mirrorAbsent.profile_version)+1])).rows[0]?.profile_payload;
    assert.equal(Object.hasOwn(repairedMirror.participant, "profileAnswers"), false);
    const repairedSecondCancel = (await fixture.pool.query(`select registered_at,cancelled_at,reactivated_at,
      status,late_registration from event_ops_membership_versions where workspace_id=$1 and event_id=$2
      and actor_id=$3 and membership_version=$4`, [workspaceId,secondCancel.event_id,secondCancel.actor_id,
      Number(secondCancel.membership_version)+1])).rows[0];
    assert.deepEqual(repairedSecondCancel, {
      registered_at: secondCancel.registered_at, cancelled_at: secondCancel.cancelled_at,
      reactivated_at: secondCancel.reactivated_at, status: secondCancel.status,
      late_registration: secondCancel.late_registration,
    });
    const repairedAdmissionRows = (await fixture.pool.query(`select membership_version,origin,admission_application_version
      from event_ops_membership_versions where workspace_id=$1 and event_id=$2 and actor_id=$3
      order by membership_version`, [workspaceId,admission.event_id,admission.actor_id])).rows;
    assert.deepEqual(repairedAdmissionRows.at(-1), {
      membership_version: String(Number(admission.membership_version)+1),
      origin: "admission_application", admission_application_version: "1",
    });
  } finally { await fixture.close(); }
});
