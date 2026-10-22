import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();
// LF18: the residual step removes everything else the account owns — the ~40 collections written with the account as
// owner that no domain step listed, the dedicated tables, introduction requests — keeps audits without the identity,
// leaves the identity records to the final step and never touches another account.
test("residual purge sweeps the account's remaining records and tables and leaves others intact", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `lf18_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table organizer_profiles(workspace_id text,profile_id text,owner_actor_id text not null,slug text);
      create table orbit_inbox_projection_work(workspace_id text,actor_id text not null,source_id text);
      create table orbit_schedule_reminder_windows(workspace_id text,actor_id text not null,series_id text);`);
    const record = (collection: string, id: string, owner: string | null, payload: Record<string, unknown> = {}) => pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values('space',$1,$2,$3,'test',$2,$4::jsonb,now(),now())`, [collection, id, owner, JSON.stringify(payload)]);
    for (const actor of ["owner", "other"]) {
      for (const collection of ["profile_mutations", "account_language_preferences", "homeLayouts", "guideState", "contactCompletionQuestions", "notificationDeliveryReservations", "devicePushTokens", "businessCardImportJobs", "orbitScheduleItems"]) await record(collection, `${collection}:${actor}`, actor);
      await record("relationship_lifecycle_audits", `audit:${actor}`, actor, { kind: "revoke", at: "2026-10-01", actorId: actor, note: "private" });
      await record("matchmakingIntroductionRequests", `intro:${actor}`, null, { requesterActorId: actor, targetActorId: "third" });
      await pool.query("insert into organizer_profiles values('space',$1,$2,$1)", [`profile:${actor}`, actor]);
      await pool.query("insert into orbit_inbox_projection_work values('space',$1,'s')", [actor]);
      await pool.query("insert into orbit_schedule_reminder_windows values('space',$1,'s')", [actor]);
    }
    await record("accounts", "account:owner", "owner");
    await record("auth_users", "user:owner", "owner-user");
    await record("profile_mutations", "by-user-id", "owner-user");
    const { purgeAccountResidual } = await import("../../features/account/data-rights/purge/residual");
    const result = await purgeAccountResidual(db, "space", "owner", "owner-user");
    assert.ok(result.deleted >= 14, String(result.deleted));
    assert.equal(result.retainedPseudonymizedAuditRows, 1);
    const left = (await pool.query("select collection_name,record_id,user_id,payload from orbit_records where user_id in ('owner','owner-user') or record_id like '%:owner' order by record_id")).rows;
    assert.deepEqual(left.map((row) => row.record_id).sort(), ["account:owner", "audit:owner", "user:owner"], "only the identity (final step) and the pseudonymized audit stay");
    const audit = left.find((row) => row.record_id === "audit:owner");
    assert.equal(audit.user_id, null);
    assert.deepEqual(audit.payload, { pseudonymized: true, kind: "revoke", at: "2026-10-01" });
    for (const table of ["organizer_profiles", "orbit_inbox_projection_work", "orbit_schedule_reminder_windows"]) {
      const column = table === "organizer_profiles" ? "owner_actor_id" : "actor_id";
      assert.deepEqual((await pool.query(`select ${column} as actor from ${table}`)).rows, [{ actor: "other" }], table);
    }
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where user_id='other'")).rows[0].n, 10, "the other account keeps every record");
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='matchmakingIntroductionRequests'")).rows[0].n, 1);
    assert.equal((await purgeAccountResidual(db, "space", "owner", "owner-user")).deleted, 0, "a retry finds nothing");
  } finally {
    await pool.end();
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    await admin.query(`drop schema if exists ${schema} cascade`); await admin.end();
  }
});
