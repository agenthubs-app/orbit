import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import {
  applyPhonewebRegistrationWindowRepair,
  buildPhonewebRegistrationWindowRepairPlan,
  readPhonewebRegistrationWindowRepairSource,
  repairDigest,
  rollbackPhonewebRegistrationWindowRepair,
} from "../../features/events/registration/phoneweb-registration-window-repair";
import { repairFixture } from "./fixtures/phoneweb-registration-window-repair-fixture";

const testUrl = process.env.ORBIT_REGISTRATION_REPAIR_TEST_URL;
const required = process.env.ORBIT_REGISTRATION_REPAIR_REQUIRE_DB === "1";
const fixtureTables = [
  "event_ops_events", "event_ops_configurations", "event_ops_configuration_heads", "event_ops_audit_log",
  "event_ops_admission_policy_versions", "event_ops_admission_policy_heads", "event_ops_profile_versions",
  "event_ops_profile_heads", "event_ops_membership_versions", "event_ops_membership_heads", "event_ops_profile_response_versions",
] as const;

async function withRepairFixtureDatabase(
  operation: (input: { client: ReturnType<typeof createEventOperationsPostgresClient>; pool: Pool; schema: string }) => Promise<void>,
): Promise<void> {
  assert.ok(testUrl, "Required isolated PostgreSQL target is missing.");
  const target = new URL(testUrl);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, "35434");
  assert.equal(target.username, "orbit_registration_repair");
  assert.equal(target.pathname, "/orbit_phoneweb_20260916");
  assert.equal(target.search, "");
  const schema = `sprint0064_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: testUrl, max: 1 });
  const scopedPool = new Pool({ connectionString: testUrl, max: 1, options: `-c search_path=${schema},public` });
  const transactionPool = new Pool({ connectionString: testUrl, max: 1, options: `-c search_path=${schema},public` });
  const client = createEventOperationsPostgresClient({ connectionString: testUrl, pool: transactionPool });
  try {
    for (const candidate of [pool, scopedPool, transactionPool]) {
      const identity = await candidate.query("select current_database() as database,current_user as actor,host(inet_server_addr()) as host,inet_server_port() as port,current_setting('data_directory') as directory");
      assert.deepEqual(identity.rows, [{ database: "orbit_phoneweb_20260916", actor: "orbit_registration_repair", host: "127.0.0.1", port: 35434, directory: "/Volumes/ORICO/Dev/cache/orbit-sprint0064-pg.lQhm4Z/data" }]);
      assert.deepEqual((await candidate.query("select marker from public.root_sprint0064_test_marker")).rows, [{ marker: "ROOT-owned-0064-lQhm4Z" }]);
    }
    await pool.query(`create schema ${schema}`);
    const migrations = readFileSync("features/events/event-operations/storage/migrations.ts", "utf8");
    for (const table of fixtureTables) {
      const ddl = migrations.match(new RegExp(`create table ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
      assert.ok(ddl, `Minimal existing DDL missing: ${table}`);
      await scopedPool.query(ddl);
    }
    for (const column of ["registration_migration_state", "public_code"]) {
      const ddl = migrations.match(new RegExp(`alter table event_ops_events\\n  add column ${column}[\\s\\S]*?;`))?.[0];
      assert.ok(ddl);
      await scopedPool.query(ddl);
    }
    for (const event of repairFixture.events) {
      await scopedPool.query("insert into event_ops_events(workspace_id,event_id,organizer_actor_id,created_at,updated_at,registration_migration_state,lifecycle_state_v2,event_version,starts_at,ends_at,source_payload) values($1,$2,$3,now(),now(),'canonical','published',2,$4,$5,$6::jsonb)", [event.workspace_id, event.event_id, event.organizer_actor_id, event.starts_at, event.ends_at, JSON.stringify({ description: "synthetic protected event", answers: ["preserve"] })]);
    }
    await scopedPool.query("insert into event_ops_events(workspace_id,event_id,organizer_actor_id,created_at,updated_at,source_payload) values('workspace:other','event_01','synthetic-other-owner',now(),now(),'{\"private\":\"other scope must survive\"}')");
    await scopedPool.query("insert into event_ops_events(workspace_id,event_id,organizer_actor_id,created_at,updated_at,source_payload) values($1,'event_outside_13','synthetic-owner',now(),now(),'{\"private\":\"outside target must survive\"}')", [repairFixture.workspaceId]);
    const configuration = repairFixture.configurations[0]!;
    const columns = Object.keys(configuration);
    await scopedPool.query(`insert into event_ops_configurations (${columns.join(",")}) values (${columns.map((_column, index) => `$${index + 1}`).join(",")})`, Object.values(configuration));
    await scopedPool.query("insert into event_ops_configuration_heads(workspace_id,event_id,configuration_version,revision,updated_at) values($1,'event_signup_01',1,1,$2)", [repairFixture.workspaceId, configuration.updated_at]);
    await scopedPool.query("insert into event_ops_profile_versions values($1,'event_01','synthetic-participant',1,'synthetic-actor',$2::jsonb,'protected-hash','synthetic-registration',now())", [repairFixture.workspaceId, JSON.stringify({ answers: { goal: "must survive" } })]);
    await scopedPool.query("insert into event_ops_profile_heads values($1,'event_01','synthetic-participant','synthetic-actor',1,1,now())", [repairFixture.workspaceId]);
    await scopedPool.query("insert into event_ops_membership_versions values($1,'event_01','synthetic-actor',2,'synthetic-participant',1,'cancelled',now(),now(),null,false,'synthetic-registration',now())", [repairFixture.workspaceId]);
    await scopedPool.query("insert into event_ops_membership_heads values($1,'event_01','synthetic-actor',2,'synthetic-participant',1,'cancelled',1,now())", [repairFixture.workspaceId]);
    await scopedPool.query("insert into event_ops_profile_response_versions values($1,'event_01','synthetic-participant',1,'synthetic-response','goal','private','legacy_unknown',$2::jsonb,now(),now())", [repairFixture.workspaceId, JSON.stringify({ answer: "must survive" })]);
    console.log(`ROOT-owned isolated fixture schema=${schema}`);
    await operation({ client, pool: scopedPool, schema });
  } finally {
    await client.close();
    await scopedPool.end();
    await pool.end();
    // Leave precisely logged owned schemas for ROOT's sole lifecycle cleanup.
  }
}

test("isolated PostgreSQL is mandatory when REQUIRE_DB is set", () => {
  if (required) assert.ok(testUrl, "Required isolated PostgreSQL target is missing.");
});

test("actual PostgreSQL preview reads thirteen targets and makes no writes", { skip: !testUrl && !required }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const before = (await pool.query("select jsonb_agg(to_jsonb(c)) as snapshot from event_ops_configurations c")).rows;
    const source = await readPhonewebRegistrationWindowRepairSource(client);
    assert.equal(source.events.length, 13);
    assert.equal(buildPhonewebRegistrationWindowRepairPlan(source).changes.length, 13);
    assert.deepEqual((await pool.query("select jsonb_agg(to_jsonb(c)) as snapshot from event_ops_configurations c")).rows, before);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_audit_log")).rows[0].count, 0);
  });
});

test("actual PostgreSQL atomically applies, repeats without writes, and precisely restores heads without deleting history", { skip: !testUrl && !required }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const protectedBefore = [];
    for (const table of fixtureTables.filter((name) => /events$|profile|membership/u.test(name))) {
      protectedBefore.push([table, repairDigest((await pool.query(`select to_jsonb(t) as payload from ${table} t order by to_jsonb(t)::text`)).rows)]);
    }
    const source = await readPhonewebRegistrationWindowRepairSource(client);
    const plan = buildPhonewebRegistrationWindowRepairPlan(source);
    const receipt = await applyPhonewebRegistrationWindowRepair(client, plan);
    assert.equal(receipt.applied.length, 13);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 14);
    const snapshot = (await pool.query("select jsonb_agg(to_jsonb(h) order by event_id) as snapshot from event_ops_configuration_heads h")).rows;
    const repeated = await applyPhonewebRegistrationWindowRepair(client, plan);
    assert.equal(repeated.alreadyApplied, true);
    assert.deepEqual((await pool.query("select jsonb_agg(to_jsonb(h) order by event_id) as snapshot from event_ops_configuration_heads h")).rows, snapshot);
    await rollbackPhonewebRegistrationWindowRepair(client, receipt);
    assert.deepEqual((await pool.query("select event_id,configuration_version::text,revision::text,updated_at from event_ops_configuration_heads")).rows, [{ event_id: "event_signup_01", configuration_version: "1", revision: "1", updated_at: new Date(repairFixture.heads[0]!.updated_at) }]);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 14);
    for (const [table, digest] of protectedBefore) {
      assert.equal(repairDigest((await pool.query(`select to_jsonb(t) as payload from ${table} t order by to_jsonb(t)::text`)).rows), digest);
    }
  });
});

for (const failure of ["concurrent head", "concurrent policy", "fourth insert failure"] as const) {
  test(`actual PostgreSQL ${failure} leaves the full batch unchanged`, { skip: !testUrl && !required }, async () => {
    await withRepairFixtureDatabase(async ({ client, pool }) => {
      const plan = buildPhonewebRegistrationWindowRepairPlan(await readPhonewebRegistrationWindowRepairSource(client));
      if (failure === "concurrent head") await pool.query("update event_ops_configuration_heads set revision=revision+1");
      if (failure === "concurrent policy") {
        await pool.query("insert into event_ops_admission_policy_versions values($1,'event_01',1,null,'instant',false,'2026-09-01','2026-10-17',now())", [repairFixture.workspaceId]);
        await pool.query("insert into event_ops_admission_policy_heads values($1,'event_01',1,now())", [repairFixture.workspaceId]);
      }
      if (failure === "fourth insert failure") {
        await pool.query("create function reject_fourth_repair() returns trigger language plpgsql as 'begin if NEW.event_id = ''event_04'' then raise exception ''fourth repair insertion rejected''; end if; return NEW; end'");
        await pool.query("create trigger reject_fourth_repair before insert on event_ops_configurations for each row execute function reject_fourth_repair()");
      }
      const before = (await pool.query("select jsonb_agg(to_jsonb(h)) as snapshot from event_ops_configuration_heads h")).rows;
      await assert.rejects(() => applyPhonewebRegistrationWindowRepair(client, plan), /conflict|policy|fourth/u);
      assert.deepEqual((await pool.query("select jsonb_agg(to_jsonb(h)) as snapshot from event_ops_configuration_heads h")).rows, before);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 1);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_audit_log")).rows[0].count, 0);
    });
  });
}

test("actual PostgreSQL rollback refuses another owner's subsequent head update", { skip: !testUrl && !required }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const receipt = await applyPhonewebRegistrationWindowRepair(client, buildPhonewebRegistrationWindowRepairPlan(await readPhonewebRegistrationWindowRepairSource(client)));
    await pool.query("update event_ops_configuration_heads set revision=revision+1 where event_id='event_04'");
    await assert.rejects(() => rollbackPhonewebRegistrationWindowRepair(client, receipt), /conflict/u);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configuration_heads")).rows[0].count, 13);
  });
});

test("actual PostgreSQL held event-row lock times out visibly and leaves every configuration unchanged", { skip: !testUrl && !required, timeout: 15_000 }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const plan = buildPhonewebRegistrationWindowRepairPlan(await readPhonewebRegistrationWindowRepairSource(client));
    await pool.query("begin");
    try {
      await pool.query("select event_id from event_ops_events where event_id='event_01' for update");
      await assert.rejects(() => applyPhonewebRegistrationWindowRepair(client, plan), (error: unknown) => {
        assert.equal((error as { code: string }).code, "55P03");
        return true;
      });
    } finally { await pool.query("rollback"); }
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 1);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_audit_log")).rows[0].count, 0);
  });
});

test("actual PostgreSQL rejects a tampered review before configuration writes", { skip: !testUrl && !required }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const plan = buildPhonewebRegistrationWindowRepairPlan(await readPhonewebRegistrationWindowRepairSource(client));
    plan.changes[0]!.after.table_size = 100;
    await assert.rejects(() => applyPhonewebRegistrationWindowRepair(client, plan), /hash/u);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 1);
  });
});

test("actual PostgreSQL rollback refuses a modified historical configuration version", { skip: !testUrl && !required }, async () => {
  await withRepairFixtureDatabase(async ({ client, pool }) => {
    const receipt = await applyPhonewebRegistrationWindowRepair(client, buildPhonewebRegistrationWindowRepairPlan(await readPhonewebRegistrationWindowRepairSource(client)));
    await pool.query("update event_ops_configurations set table_size=99 where event_id='event_signup_01' and configuration_version=1");
    await assert.rejects(() => rollbackPhonewebRegistrationWindowRepair(client, receipt), /historical.*conflict/u);
    assert.equal((await pool.query("select count(*)::int as count from event_ops_configuration_heads")).rows[0].count, 13);
  });
});

test("actual CLI on attested PostgreSQL previews zero writes, persists apply receipt, repeats idempotently, and restores heads", { skip: !testUrl && !required, timeout: 15_000 }, async () => {
  await withRepairFixtureDatabase(async ({ pool, schema }) => {
    const directory = mkdtempSync(path.join(tmpdir(), "orbit-0064-cli-pg-"));
    const previewFile = path.join(directory, "preview.json");
    const receiptFile = path.join(directory, "receipt.json");
    const repeatFile = path.join(directory, "repeat.json");
    const rollbackFile = path.join(directory, "rollback.json");
    const scopedUrl = new URL(testUrl!);
    scopedUrl.searchParams.set("options", `-c search_path=${schema},public`);
    const env = { ...process.env, ORBIT_REGISTRATION_REPAIR_URL: scopedUrl.toString() };
    try {
      const preview = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--output", previewFile], { env, encoding: "utf8" });
      assert.equal(preview.status, 0, preview.stderr);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 1);
      const planHash = JSON.parse(preview.stdout).plan.planHash;
      assert.equal(JSON.parse(preview.stdout).lockPolicy.tableLocks.length, 3);
      const apply = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--apply", "--plan", previewFile, "--confirm-plan-hash", planHash, "--output", receiptFile], { env, encoding: "utf8" });
      assert.equal(apply.status, 0, apply.stderr);
      assert.equal(JSON.parse(readFileSync(receiptFile, "utf8")).receipt.applied.length, 13);
      const repeat = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--apply", "--plan", previewFile, "--confirm-plan-hash", planHash, "--output", repeatFile], { env, encoding: "utf8" });
      assert.equal(repeat.status, 0, repeat.stderr);
      assert.equal(JSON.parse(repeat.stdout).receipt.alreadyApplied, true);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_audit_log")).rows[0].count, 13);
      const rollback = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--rollback", receiptFile, "--confirm-plan-hash", planHash, "--output", rollbackFile], { env, encoding: "utf8" });
      assert.equal(rollback.status, 0, rollback.stderr);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_configuration_heads")).rows[0].count, 1);
      assert.equal((await pool.query("select count(*)::int as count from event_ops_configurations")).rows[0].count, 14);
      for (const processResult of [preview, apply, repeat, rollback]) assert.match(processResult.stderr, /guard: denied=0/u);
    } finally { rmSync(directory, { recursive: true }); }
  });
});
