/**
 * Controlled one-account operations (features/account/controlled-ops): full purge of one account and a sign-in email
 * change. Runs against the local orbit_line_c_test database (fully migrated), one fresh workspace per test.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

const HOST = "actor:host";
const answers = (id: string) => ({ desiredOutcome: `Two follow-ups for ${id}`, energyStyle: "Small groups", experienceHighlight: "Scaled a team",
  followUpPreference: "日本語", industry: "Software", positioning: `CFO @ ${id}`, targetAttendees: "Investors", valueOffered: "Intros" });

async function withDatabase(run: (input: { pool: Pool; db: ReturnType<typeof createTransactionalPostgresClient>; workspaceId: string }) => Promise<void>) {
  const workspaceId = `controlled-ops-${randomUUID()}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  const previous = process.env.ORBIT_ACCOUNT_OPS;
  process.env.ORBIT_ACCOUNT_OPS = "build-only";
  try { await run({ pool, db, workspaceId }); }
  finally {
    if (previous === undefined) delete process.env.ORBIT_ACCOUNT_OPS; else process.env.ORBIT_ACCOUNT_OPS = previous;
    const tables = await pool.query<{ table_name: string }>(`select table_name from information_schema.columns where table_schema='public'
      and column_name='workspace_id' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')`);
    for (const { table_name } of tables.rows) await pool.query(`delete from "${table_name}" where workspace_id=$1`, [workspaceId]).catch(() => undefined);
    await pool.end();
  }
}

function seedHelpers(pool: Pool, workspaceId: string) {
  const record = (collection: string, id: string, owner: string | null, payload: Record<string, unknown>) =>
    pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at,search_text)
      values($1,$2,$3,$4,'test',$3,$5::jsonb,now(),now(),'')`, [workspaceId, collection, id, owner, JSON.stringify(payload)]);
  const account = async (key: string, email: string, extra: Record<string, unknown> = {}) => {
    const userId = `user:${key}`;
    const actorId = `actor:${key}`;
    const at = "2026-11-01T00:00:00.000Z";
    await record("auth_users", `auth_user:${email}`, userId, { id: userId, email, displayName: `Person ${key}`, provider: "credentials",
      passwordHash: "hash", createdAt: at, updatedAt: at, ...extra });
    await record("accounts", actorId, actorId, { id: actorId });
    await record("profiles", `profile:${userId}`, actorId, { id: userId, accountId: actorId, displayName: `Person ${key}` });
    return { userId, actorId, email };
  };
  return { record, account };
}

test("controlled purge: dry run writes nothing, refuses mismatch and hosts, apply removes exactly one account", dbTest, async () => {
  await withDatabase(async ({ pool, db, workspaceId }) => {
    const { record, account } = seedHelpers(pool, workspaceId);
    const target = await account("target", "target@example.test", { passwordReset: { tokenHash: "t", delivery: "sent" }, emailVerification: { sentAt: "x" } });
    const other = await account("other", "other@example.test");
    const host = await account("host", "host@example.test");
    for (const person of [target, other]) {
      await record("eventJoinIntros", `intro:${person.actorId}`, person.actorId, { text: "hello" });
      await record("profileContactConsent", `consent:${person.actorId}`, person.actorId, { confirmedAt: "x" });
      await record("mobile_auth_exchanges", `exchange:${person.userId}`, null, { user: { id: person.userId, email: person.email } });
    }
    // An event hosted by HOST with both people waiting for review.
    const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1,'prof',$2,$3,'Org')`,
      [workspaceId, HOST, `org-${randomUUID()}`]);
    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_ops_${randomUUID().slice(0, 8)}_${++n}`, randomBytes: () => Uint8Array.from([n, 2, 3, 4, 5, 6, 7, 8]), workspaceId });
    const draft = await lifecycle.create(HOST, { endsAt: "2100-01-02T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof", startsAt: "2100-01-02T10:00:00.000Z", title: "Review event" });
    await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: "2100-01-01T00:00:00.000Z" });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    await admission.configurePolicy({ admissionMode: "approval_required", capacity: 10, eventId: draft.eventId, profileEditDeadlineAt: "2100-01-01T00:00:00.000Z",
      registrationClosesAt: "2100-01-01T00:00:00.000Z", registrationOpensAt: "2000-01-01T00:00:00.000Z", updatedByActorId: HOST, waitlistEnabled: true });
    for (const person of [target, other]) await admission.submitApplication({ actorId: person.actorId, eventId: draft.eventId, profilePayload: { answers: answers(person.actorId), displayName: person.actorId } });
    const pending = async () => Number((await pool.query(`select count(*)::int as n from event_ops_admission_application_heads where workspace_id=$1 and event_id=$2 and status='pending_review'`, [workspaceId, draft.eventId])).rows[0].n);
    const owned = async (ids: string[]) => Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and user_id=any($2::text[])`, [workspaceId, ids])).rows[0].n);
    assert.equal(await pending(), 2);

    const { previewControlledAccountPurge, runControlledAccountPurge } = await import("../../features/account/controlled-ops/account-purge");
    const preview = await previewControlledAccountPurge({ db, workspaceId, email: "TARGET@example.test" });
    assert.deepEqual(preview.target, { userId: target.userId, actorId: target.actorId });
    assert.equal(preview.ownedRecords.eventJoinIntros, 1);
    assert.equal(preview.ownedRecords.profileContactConsent, 1);
    assert.equal(preview.ownedRecords.auth_users, 1);
    assert.equal(preview.referencedRecords.mobile_auth_exchanges, 1);
    assert.deepEqual(preview.applications, [{ eventId: draft.eventId, status: "pending_review" }]);
    assert.equal(preview.authState.pendingPasswordReset, true);
    assert.equal(JSON.stringify(preview).includes("target@example.test"), false);

    const before = await owned([target.actorId, target.userId]);
    const dry = await runControlledAccountPurge({ db, eventClient: client, workspaceId, email: target.email, userId: target.userId });
    assert.equal(dry.kind, "dry-run");
    assert.equal(await owned([target.actorId, target.userId]), before);
    assert.equal(await pending(), 2);

    await assert.rejects(runControlledAccountPurge({ db, eventClient: client, workspaceId, email: target.email, userId: other.userId, apply: true }), /TARGET_EMAIL_ID_MISMATCH/u);
    await assert.rejects(runControlledAccountPurge({ db, eventClient: client, workspaceId, email: target.email, userId: "", apply: true }), /TARGET_ID_REQUIRED/u);
    await assert.rejects(runControlledAccountPurge({ db, eventClient: client, workspaceId, email: host.email, userId: host.userId, apply: true }), /TARGET_IS_EVENT_HOST_OR_COHOST/u);
    assert.equal(await pending(), 2);

    const otherBefore = await owned([other.actorId, other.userId]);
    const result = await runControlledAccountPurge({ db, eventClient: client, workspaceId, email: target.email, userId: target.userId, apply: true });
    assert.equal(result.kind, "deleted", JSON.stringify(result.kind === "failed" ? { step: result.step, reason: result.reason } : null));
    if (result.kind !== "deleted") return;
    assert.equal(result.withdrawnApplications, 1);
    assert.equal(result.remaining.ownedRecords, 0);
    assert.equal(result.remaining.authRecord, 0);
    assert.equal(await owned([target.actorId, target.userId]), 0);
    assert.equal(await pending(), 1);
    const roster = await pool.query(`select actor_id from event_ops_admission_application_heads where workspace_id=$1 and event_id=$2`, [workspaceId, draft.eventId]);
    assert.equal(roster.rows.some((row) => row.actor_id === target.actorId), false);
    assert.equal(roster.rows.some((row) => row.actor_id === other.actorId), true);
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='mobile_auth_exchanges' and payload->'user'->>'id'=$2`, [workspaceId, target.userId])).rows[0].n), 0);
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and position($2 in payload::text)>0`, [workspaceId, "target@example.test"])).rows[0].n), 0);
    // The other account and the host are untouched.
    assert.equal(await owned([other.actorId, other.userId]), otherBefore);
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='auth_users'`, [workspaceId])).rows[0].n), 2);
    await assert.rejects(previewControlledAccountPurge({ db, workspaceId, email: target.email }), /TARGET_NOT_FOUND/u);
  });
});

test("controlled email change: candidates, taken address, re-keyed sign-in row, old sessions stop, reset works on the new address", dbTest, async () => {
  await withDatabase(async ({ pool, db, workspaceId }) => {
    const { account } = seedHelpers(pool, workspaceId);
    const person = await account("nakahara", "old.addr@example.test", { displayName: "中原 太郎", migratedFrom: "party-app:test", mustChangePassword: true,
      emailVerifiedAt: "2026-11-02T00:00:00.000Z", passwordReset: { tokenHash: "old-token", delivery: "sent", expiresAt: "2100-01-01T00:00:00.000Z" },
      emailVerification: { sentAt: "2026-11-02T00:00:00.000Z" }, consents: [{ termsVersion: "1" }] });
    await pool.query(`update orbit_records set payload=payload||'{"handles":{"email":"Old.Addr@example.test","phone":"090"}}'::jsonb
      where workspace_id=$1 and collection_name='profiles' and user_id=$2`, [workspaceId, person.actorId]);
    await account("taken", "taken@example.test");
    const { previewControlledEmailChange, runControlledEmailChange } = await import("../../features/account/controlled-ops/email-change");

    const preview = await previewControlledEmailChange({ db, workspaceId, name: "中原", newEmail: "New.Addr@example.test" });
    assert.equal(preview.candidates.length, 1);
    assert.equal(preview.candidates[0]?.userId, person.userId);
    assert.equal(preview.candidates[0]?.actorId, person.actorId);
    assert.equal(preview.candidates[0]?.maskedEmail, "o***@example.test");
    assert.equal(preview.candidates[0]?.migrated, true);
    assert.equal(preview.newEmailTaken, false);
    assert.equal(JSON.stringify(preview).includes("old.addr@"), false);
    assert.equal((await previewControlledEmailChange({ db, workspaceId, name: "中原", newEmail: "taken@example.test" })).newEmailTaken, true);

    await assert.rejects(runControlledEmailChange({ db, workspaceId, userId: "user:taken", fromEmail: person.email, toEmail: "new.addr@example.test", apply: true }), /TARGET_EMAIL_ID_MISMATCH/u);
    await assert.rejects(runControlledEmailChange({ db, workspaceId, userId: person.userId, fromEmail: person.email, toEmail: "taken@example.test", apply: true }), /NEW_EMAIL_TAKEN/u);
    const dry = await runControlledEmailChange({ db, workspaceId, userId: person.userId, fromEmail: person.email, toEmail: "New.Addr@example.test", alsoProfileContactEmail: true });
    assert.equal(dry.kind, "dry-run");
    assert.equal(dry.profileContactEmailMatches, 1);
    const row = async (email: string) => (await pool.query(`select user_id,search_text,payload from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, `auth_user:${email}`])).rows[0];
    assert.ok(await row(person.email));
    assert.equal(await row("new.addr@example.test"), undefined);

    const authenticatedBefore = Date.now() - 1000;
    const changed = await runControlledEmailChange({ db, workspaceId, userId: person.userId, fromEmail: person.email, toEmail: "New.Addr@example.test", alsoProfileContactEmail: true, apply: true });
    assert.deepEqual(changed, { kind: "changed", userId: person.userId, actorId: person.actorId, from: "o***@example.test", to: "n***@example.test",
      profileContactEmailMatches: 1, profileContactEmailChanged: 1 });
    const profile = (await pool.query(`select payload from orbit_records where workspace_id=$1 and collection_name='profiles' and user_id=$2`, [workspaceId, person.actorId])).rows[0].payload;
    assert.deepEqual(profile.handles, { email: "new.addr@example.test", phone: "090" });
    assert.equal(await row(person.email), undefined);
    const moved = await row("new.addr@example.test");
    assert.equal(moved.user_id, person.userId);
    assert.equal(moved.search_text, "new.addr@example.test");
    assert.equal(moved.payload.id, person.userId);
    assert.equal(moved.payload.email, "new.addr@example.test");
    assert.equal(moved.payload.passwordHash, "hash");
    assert.equal(moved.payload.migratedFrom, "party-app:test");
    assert.equal(moved.payload.mustChangePassword, true);
    assert.deepEqual(moved.payload.consents, [{ termsVersion: "1" }]);
    assert.equal("emailVerifiedAt" in moved.payload, false);
    assert.equal("passwordReset" in moved.payload, false);
    assert.equal("emailVerification" in moved.payload, false);
    // Profile and account stay with the same account.
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and user_id=$2 and collection_name in ('accounts','profiles')`, [workspaceId, person.actorId])).rows[0].n), 2);

    // Sessions: the old address no longer resolves; the new one does.
    const { createPostgresLiveRecordStore } = await import("../../shared/storage/postgres-live-record-store");
    const { readAuthSessionState } = await import("../../features/auth/session-revocation");
    const store = createPostgresLiveRecordStore({ client: { query: async (text: string, values?: readonly unknown[]) => ({ rows: (await pool.query(text, values ? [...values] : undefined)).rows }) } } as never);
    const database = { store, workspaceId };
    assert.equal((await readAuthSessionState({ email: person.email, userId: person.userId, authenticatedAt: authenticatedBefore }, database as never)).current, false);
    assert.equal((await readAuthSessionState({ email: "new.addr@example.test", userId: person.userId, authenticatedAt: Date.now() + 1000 }, database as never)).current, true);

    // Forgot password on the new address is accepted (the reset row is written).
    const { createPasswordResetStore } = await import("../../features/auth/password-reset-store");
    const resets = createPasswordResetStore({ query: async (text: string, values?: readonly unknown[]) => ({ rows: (await pool.query(text, values ? [...values] : undefined)).rows }) } as never, workspaceId);
    const at = new Date().toISOString();
    await resets.request("new.addr@example.test", { tokenHash: "new-token", sealedToken: "sealed", expiresAt: "2100-01-01T00:00:00.000Z", requestedAt: at, retryAt: at, delivery: "pending", attempts: 0 }, at);
    assert.equal((await row("new.addr@example.test")).payload.passwordReset.tokenHash, "new-token");
    assert.equal(await resets.isValid("old-token", at), false);
  });
});

test("controlled operations refuse outside the build-time operator process", async () => {
  const { assertControlledAccountOpsProcess, runInControlledAccountOpsScope, assertLocalAccountPurgeTarget } = await import("../../features/account/data-rights/purge/local-gate");
  assert.throws(() => assertControlledAccountOpsProcess({}), /CONTROLLED_ACCOUNT_OPS_DISABLED/u);
  assert.throws(() => assertControlledAccountOpsProcess({ ORBIT_ACCOUNT_OPS: "build-only", AWS_LAMBDA_FUNCTION_NAME: "fn" }), /CONTROLLED_ACCOUNT_OPS_DISABLED/u);
  assert.throws(() => assertControlledAccountOpsProcess({ ORBIT_ACCOUNT_OPS: "build-only", NEXT_RUNTIME: "nodejs" }), /CONTROLLED_ACCOUNT_OPS_DISABLED/u);
  assert.doesNotThrow(() => assertControlledAccountOpsProcess({ ORBIT_ACCOUNT_OPS: "build-only" }));
  const previous = process.env.ORBIT_ACCOUNT_OPS;
  delete process.env.ORBIT_ACCOUNT_OPS;
  try {
    assert.throws(() => runInControlledAccountOpsScope(async () => undefined), /CONTROLLED_ACCOUNT_OPS_DISABLED/u);
    // The local gate is unchanged outside the scope.
    assert.throws(() => assertLocalAccountPurgeTarget({ ORBIT_DATABASE_TARGET: "production" }), /LOCAL_PURGE_DISABLED/u);
  } finally {
    if (previous !== undefined) process.env.ORBIT_ACCOUNT_OPS = previous;
  }
});

test("no app route, page or server code imports the controlled operations", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) walk(path); continue; }
      if (!/\.(ts|tsx|js|mjs)$/u.test(name)) continue;
      const source = readFileSync(path, "utf8");
      if (/controlled-ops|runInControlledAccountOpsScope|runClaimedAccountPurge/u.test(source)) offenders.push(path);
    }
  };
  for (const root of ["app", "middleware.ts", "proxy.ts"]) {
    try { statSync(root).isDirectory() ? walk(root) : readFileSync(root, "utf8").includes("controlled-ops") && offenders.push(root); }
    catch { /* absent */ }
  }
  assert.deepEqual(offenders, []);
});
