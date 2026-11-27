/**
 * Controlled account merge (features/account/controlled-ops/account-merge): a party-app migrated account into the
 * account its owner registered anew. Local orbit_line_c_test (fully migrated), one fresh workspace per test.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();
const dbTest = { skip: local ? false : "requires local orbit_line_c_test (fully migrated)", timeout: 180_000 };
const HOST = "actor:merge-host";
const answers = (id: string) => ({ desiredOutcome: `Follow-ups for ${id}`, energyStyle: "Small groups", experienceHighlight: "Scaled a team",
  followUpPreference: "日本語", industry: "Software", positioning: `CFO @ ${id}`, targetAttendees: "Investors", valueOffered: "Intros" });

test("merge: dry run rolls back, refusals, apply moves the migrated account into the new one, rerun is a no-op", dbTest, async () => {
  const workspaceId = `merge-${randomUUID()}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  const previous = process.env.ORBIT_ACCOUNT_OPS;
  process.env.ORBIT_ACCOUNT_OPS = "build-only";
  const OLD = "user_old_merge";
  const NEW = "user_new_merge";
  const subspace = `${workspaceId}:actor:${encodeURIComponent(OLD)}`;
  try {
    const record = (collection: string, id: string, owner: string | null, payload: Record<string, unknown>, ws = workspaceId) =>
      pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at,search_text)
        values($1,$2,$3,$4,'test',$3,$5::jsonb,now(),now(),'')`, [ws, collection, id, owner, JSON.stringify(payload)]);
    const at = "2026-11-01T00:00:00.000Z";
    const account = async (id: string, email: string, auth: Record<string, unknown>, profile: Record<string, unknown>) => {
      await record("auth_users", `auth_user:${email}`, id, { id, email, displayName: id, provider: "credentials", passwordHash: "h", createdAt: at, updatedAt: at, ...auth });
      await record("accounts", id, id, { id });
      await record("profiles", `profile:${id}`, id, { id, accountId: id, ...profile });
    };
    await account(OLD, "old@example.test", { migratedFrom: "party-app:chinichi-2026", mustChangePassword: true },
      { displayName: "旧 名前", role: "CFO", handles: { email: "old@example.test", phone: "090" }, publicProfile: { bio: "old bio" } });
    await account(NEW, "new@example.test", {}, { displayName: "新 名前", handles: { email: "new@example.test" }, publicProfile: {} });
    await account("user_plain", "plain@example.test", {}, { displayName: "Plain" });
    await record("contacts", "contact:old-1", OLD, { displayName: "A contact", ownerActorId: OLD });
    await record("homeLayouts", `homeLayouts:${OLD}`, OLD, { layout: "old" });
    await record("homeLayouts", `homeLayouts:${NEW}`, NEW, { layout: "new" });
    await record("contact_actor_links", "link:other", "user_plain", { actorId: OLD, note: "points at the old account" });
    await record("orbit_agent_chat_sessions", "session:1", OLD, { title: "chat" }, subspace);

    // Event A: only the old account (admitted). Event B: both accounts applied (conflict).
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1,'prof',$2,$3,'Org')`, [workspaceId, HOST, `org-${randomUUID()}`]);
    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_m_${randomUUID().slice(0, 8)}_${++n}`, randomBytes: () => Uint8Array.from([n, 2, 3, 4, 5, 6, 7, 8]), workspaceId });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    const event = async () => {
      const draft = await lifecycle.create(HOST, { endsAt: "2100-01-02T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof", startsAt: "2100-01-02T10:00:00.000Z", title: `Merge ${n}` });
      await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: "2100-01-01T00:00:00.000Z" });
      await admission.configurePolicy({ admissionMode: "approval_required", capacity: 10, eventId: draft.eventId, profileEditDeadlineAt: "2100-01-01T00:00:00.000Z",
        registrationClosesAt: "2100-01-01T00:00:00.000Z", registrationOpensAt: "2000-01-01T00:00:00.000Z", updatedByActorId: HOST, waitlistEnabled: true });
      return draft.eventId;
    };
    const eventA = await event();
    const eventB = await event();
    const applied = await admission.submitApplication({ actorId: OLD, eventId: eventA, profilePayload: { answers: answers(OLD), displayName: "旧 名前" } });
    await admission.decideApplication({ actorId: OLD, decision: "approve", decisionActorId: HOST, eventId: eventA, expectedApplicationVersion: applied.applicationVersion });
    for (const actor of [OLD, NEW]) await admission.submitApplication({ actorId: actor, eventId: eventB, profilePayload: { answers: answers(actor), displayName: actor } });
    await record("event_registrations", `registration:${eventA}:${OLD}`, HOST, { registration: { eventId: eventA, userId: OLD, status: "rsvped" } });

    const heads = async (table: string, eventId: string) => (await pool.query<{ actor_id: string; status: string }>(
      `select actor_id,status from ${table} where workspace_id=$1 and event_id=$2 order by actor_id`, [workspaceId, eventId])).rows;
    const auth = async (email: string) => (await pool.query(`select lifecycle_state,payload from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, `auth_user:${email}`])).rows[0];
    const { runControlledAccountMerge } = await import("../../features/account/controlled-ops/account-merge");

    await assert.rejects(runControlledAccountMerge({ db, workspaceId, from: "plain@example.test", to: NEW }), /MERGE_SOURCE_NOT_MIGRATED/u);
    await assert.rejects(runControlledAccountMerge({ db, workspaceId, from: OLD, to: "old@example.test" }), /MERGE_SAME_ACCOUNT/u);

    const dry = await runControlledAccountMerge({ db, workspaceId, from: "old@example.test", to: NEW });
    assert.equal(dry.kind, "dry-run");
    assert.deepEqual(dry.conflicts?.events, [eventB]);
    assert.equal(dry.moved?.records.contacts, 1);
    assert.equal(dry.conflicts?.singletonRecords.homeLayouts, 1);
    assert.equal(dry.notMerged?.aiSessions, 1);
    assert.equal(JSON.stringify(dry).includes("old@example.test"), false);
    // Nothing was written.
    assert.equal((await auth("old@example.test")).lifecycle_state, "active");
    assert.deepEqual((await heads("event_ops_membership_heads", eventA)).map((row) => row.actor_id), [OLD]);
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='account_merges'`, [workspaceId])).rows[0].n), 0);

    const merged = await runControlledAccountMerge({ db, workspaceId, from: "old@example.test", to: "new@example.test", apply: true });
    assert.equal(merged.kind, "merged");
    assert.equal(merged.remainingOnOld?.records.contacts, undefined);
    assert.deepEqual(merged.keptAsHistory, { event_ops_audit_log: 3 });
    assert.equal(merged.moved?.tables.event_reception_numbers, 1);
    // Event A moved, event B conflict kept as is.
    assert.deepEqual(await heads("event_ops_membership_heads", eventA), [{ actor_id: NEW, status: "rsvped" }]);
    assert.deepEqual((await heads("event_ops_admission_application_heads", eventA)).map((row) => row.actor_id), [NEW]);
    assert.deepEqual((await heads("event_ops_admission_application_heads", eventB)).map((row) => row.actor_id).sort(), [NEW, OLD].sort());
    assert.equal(Number((await pool.query(`select count(*)::int as n from event_ops_profile_versions where workspace_id=$1 and event_id=$2 and actor_id=$3`, [workspaceId, eventA, OLD])).rows[0].n), 0);
    // Records: moved, singleton conflict stays, references rewritten.
    const owner = async (collection: string, id: string) => (await pool.query(`select user_id,payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3`, [workspaceId, collection, id])).rows[0];
    assert.equal((await owner("contacts", "contact:old-1")).user_id, NEW);
    assert.equal((await owner("contacts", "contact:old-1")).payload.ownerActorId, NEW);
    assert.equal((await owner("homeLayouts", `homeLayouts:${OLD}`)).user_id, OLD);
    assert.equal((await owner("homeLayouts", `homeLayouts:${NEW}`)).payload.layout, "new");
    assert.equal((await owner("contact_actor_links", "link:other")).payload.actorId, NEW);
    assert.equal((await owner("event_registrations", `registration:${eventA}:${OLD}`)).payload.registration.userId, NEW);
    // Profile: new wins, blanks filled.
    const profile = (await owner("profiles", `profile:${NEW}`)).payload;
    assert.equal(profile.displayName, "新 名前");
    assert.equal(profile.role, "CFO");
    assert.deepEqual(profile.handles, { email: "new@example.test", phone: "090" });
    assert.equal(profile.publicProfile.bio, "old bio");
    // Old account archived and traceable; new account untouched sign-in.
    const oldAuth = await auth("old@example.test");
    assert.equal(oldAuth.lifecycle_state, "archived");
    assert.equal(oldAuth.payload.mergedInto, NEW);
    assert.equal((await auth("new@example.test")).lifecycle_state, "active");
    const trace = (await pool.query(`select payload from orbit_records where workspace_id=$1 and collection_name='account_merges'`, [workspaceId])).rows;
    assert.equal(trace.length, 1);
    assert.equal(trace[0].payload.toUserId, NEW);
    // AI sessions stay where they were.
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1`, [subspace])).rows[0].n), 1);
    // The other account is untouched.
    assert.equal((await auth("plain@example.test")).lifecycle_state, "active");

    const again = await runControlledAccountMerge({ db, workspaceId, from: OLD, to: NEW, apply: true });
    assert.equal(again.kind, "already-merged");
  } finally {
    if (previous === undefined) delete process.env.ORBIT_ACCOUNT_OPS; else process.env.ORBIT_ACCOUNT_OPS = previous;
    const tables = await pool.query<{ table_name: string }>(`select c.table_name from information_schema.columns c join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='workspace_id'`);
    for (let pass = 0; pass < 4; pass += 1) {
      for (const { table_name } of tables.rows) await pool.query(`delete from "${table_name}" where workspace_id = any($1::text[])`, [[workspaceId, subspace]]).catch(() => undefined);
    }
    await pool.end();
  }
});
