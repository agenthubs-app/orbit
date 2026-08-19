import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  applyEventOrganizerOwnerPlan,
  buildEventOrganizerOwnerPlan,
  XIAOYU_ACTOR_ID,
  type EventOrganizerOwnerPlan,
} from "../../features/events/organizer-accounts/owner-migration";
import {
  EVENT_ORGANIZER_ACCOUNT_MANIFEST,
  EVENT_ORGANIZER_ASSIGNMENTS,
} from "../../features/events/organizer-accounts/manifest";
import { authUserRecordId } from "../../features/auth/storage/auth-user-live-record-provider";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const timestamp = "2026-08-19T00:00:00.000Z";
const xiaoyuAuthUserId = "user_mry5y200_58jpi8";

async function seedIdentity(
  pool: Pool,
  workspaceId: string,
  input: { displayName: string; email: string; provider: "credentials" | "google"; userId: string },
): Promise<void> {
  const { displayName, email, provider, userId } = input;
  await pool.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type, source_id,
       evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
     ) values
       ($1, 'auth_users', $2, $3, 'manual', $4, '{}', 'active', '', $5::jsonb, $6, $6),
       ($1, 'accounts', $3, $3, 'manual', $7, '{}', 'active', '', $8::jsonb, $6, $6),
       ($1, 'profiles', $9, $3, 'manual', $10, '{}', 'active', '', $11::jsonb, $6, $6)`,
    [
      workspaceId,
      authUserRecordId(email),
      userId,
      `auth:${userId}`,
      JSON.stringify({
        id: userId, email, displayName, provider, passwordHash: provider === "credentials" ? "test-password-hash" : null,
        providerAccountId: provider === "google" ? "google-agenthubs" : null, createdAt: timestamp, updatedAt: timestamp,
      }),
      timestamp,
      `account:${userId}`,
      JSON.stringify({ id: userId, createdAt: timestamp, updatedAt: timestamp }),
      `profile:${userId}`,
      `profile-source:${userId}`,
      JSON.stringify({ id: `profile:${userId}`, accountId: userId, displayName, timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp }),
    ],
  );
}

async function seedReviewedState(pool: Pool, workspaceId: string): Promise<Map<string, string>> {
  const accountIds = new Map<string, string>();
  for (const [index, organizer] of EVENT_ORGANIZER_ACCOUNT_MANIFEST.entries()) {
    const userId = `user-organizer-${index + 1}`;
    accountIds.set(organizer.key, userId);
    await seedIdentity(pool, workspaceId, { ...organizer, provider: "credentials", userId });
  }
  await seedIdentity(pool, workspaceId, {
    displayName: "agenthubs", email: "agenthubs@example.com", provider: "google", userId: xiaoyuAuthUserId,
  });
  await pool.query(
    `delete from orbit_records where workspace_id = $1 and collection_name in ('accounts', 'profiles') and record_id in ($2, $3)`,
    [workspaceId, xiaoyuAuthUserId, `profile:${xiaoyuAuthUserId}`],
  );
  await pool.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label,
       provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at,
       lifecycle_state, search_text, payload, created_at, updated_at, deleted_at
     ) values
       ($1, 'accounts', $2, $2, 'manual', 'account:reviewed', null, null, null, '{}', null, null, null, 'active', '', $3::jsonb, $4, $4, null),
       ($1, 'profiles', 'profile_orbit_generated_operator', $2, 'manual', 'profile:reviewed', null, null, null, '{}', null, null, null, 'active', '', $5::jsonb, $4, $4, null),
       ($1, 'profiles', $6, $2, 'manual', $7, 'Reviewed Xiaoyu auth membership', 'event-organizer-account-bootstrap', $8,
        $9, null, null, $4, 'active', $10, $11::jsonb, $4, $4, null)`,
    [
      workspaceId,
      XIAOYU_ACTOR_ID,
      JSON.stringify({ id: XIAOYU_ACTOR_ID, createdAt: timestamp, updatedAt: timestamp }),
      timestamp,
      JSON.stringify({ id: "profile_orbit_generated_operator", accountId: XIAOYU_ACTOR_ID, displayName: "Orbit operator", timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp }),
      `profile:auth-membership:${xiaoyuAuthUserId}`,
      `auth-membership:${xiaoyuAuthUserId}`,
      xiaoyuAuthUserId,
      ["evidence:organizer-account-manifest:v1"],
      "agenthubs agenthubs@example.com",
      JSON.stringify({ id: xiaoyuAuthUserId, accountId: XIAOYU_ACTOR_ID, displayName: "agenthubs", timezone: "Asia/Tokyo", createdAt: timestamp, updatedAt: timestamp }),
    ],
  );
  const values = EVENT_ORGANIZER_ASSIGNMENTS.map((assignment, index) => [
    workspaceId, assignment.eventId, `legacy-event:${assignment.eventId}`, JSON.stringify({ id: assignment.eventId, title: `Reviewed ${index + 1}` }), timestamp,
  ]);
  for (const value of values) {
    await pool.query(
      `insert into orbit_records (
         workspace_id, collection_name, record_id, user_id, source_type, source_id,
         evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
       ) values ($1, 'events', $2, null, 'event_import', $3, '{}', 'active', '', $4::jsonb, $5, $5)`,
      value,
    );
  }
  await pool.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type, source_id,
       evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
     ) values ($1, 'contacts', 'contact:unchanged', 'account:other', 'manual', 'contact:unchanged', '{}', 'active', '', '{}'::jsonb, $2, $2)`,
    [workspaceId, timestamp],
  );
  return accountIds;
}

test(
  "review-gated owner migration plans, applies exactly 16 rows, and replays idempotently",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_organizer_owner_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:owner:${schema}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      const accountIds = await seedReviewedState(pool, workspaceId);
      const before = await pool.query<{ user_id: string | null }>(`select user_id from orbit_records where workspace_id = $1 and collection_name = 'events'`, [workspaceId]);
      const plan = await buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID });
      assert.equal(plan.count, 16);
      assert.match(plan.hash, /^[a-f0-9]{64}$/);
      assert.ok(before.rows.every((row) => row.user_id === null));
      assert.equal((await pool.query(`select count(*)::int as count from orbit_records where workspace_id = $1 and collection_name = 'event_organizer_owner_migrations'`, [workspaceId])).rows[0]?.count, 0);
      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 15, expectedPlanHash: plan.hash, plan }),
        /requires count 16/i,
      );
      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: "0".repeat(64), plan }),
        /changed since review/i,
      );
      assert.ok((await pool.query<{ user_id: string | null }>(`select user_id from orbit_records where workspace_id = $1 and collection_name = 'events'`, [workspaceId])).rows.every((row) => row.user_id === null));

      const applyQueries: string[] = [];
      const lockingClient = {
        query: async <TRow>(sql: string, values?: readonly unknown[]) => {
          applyQueries.push(sql);
          return pool.query<TRow>(sql, values ? [...values] : undefined);
        },
      };
      const first = await applyEventOrganizerOwnerPlan({ client: lockingClient, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: plan.hash, plan });
      assert.equal(first.count, 16);
      assert.ok(applyQueries.some((sql) => /collection_name in \('auth_users', 'accounts', 'profiles'\)[\s\S]*for update/i.test(sql)));
      const assigned = await pool.query<{ record_id: string; user_id: string }>(`select record_id, user_id from orbit_records where workspace_id = $1 and collection_name = 'events' order by record_id`, [workspaceId]);
      assert.deepEqual(assigned.rows, [...EVENT_ORGANIZER_ASSIGNMENTS].sort((left, right) => left.eventId.localeCompare(right.eventId)).map((assignment) => ({ record_id: assignment.eventId, user_id: assignment.organizerKey === "xiaoyu" ? XIAOYU_ACTOR_ID : accountIds.get(assignment.organizerKey)! })));
      assert.equal((await pool.query(`select count(*)::int as count from orbit_records where workspace_id = $1 and record_id = 'contact:unchanged' and user_id = 'account:other'`, [workspaceId])).rows[0]?.count, 1);
      const audit = await pool.query<{ payload: Record<string, unknown> }>(`select payload from orbit_records where workspace_id = $1 and collection_name = 'event_organizer_owner_migrations'`, [workspaceId]);
      assert.equal(audit.rows.length, 1);
      assert.deepEqual(Object.keys(audit.rows[0]!.payload).sort(), ["actorIds", "count", "eventIds", "manifestVersion", "planHash"]);

      const replay = await applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: plan.hash, plan });
      assert.equal(replay.count, 16);

      const changedPlan = await buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID });
      await pool.query(
        `update orbit_records set payload = jsonb_set(payload, '{title}', '"Changed after review"'::jsonb)
         where workspace_id = $1 and collection_name = 'events' and record_id = 'event_01'`,
        [workspaceId],
      );
      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: changedPlan.hash, plan: changedPlan }),
        /changed since review/i,
      );
      assert.equal(
        (await pool.query<{ user_id: string }>(`select user_id from orbit_records where workspace_id = $1 and collection_name = 'events' and record_id = 'event_01'`, [workspaceId])).rows[0]?.user_id,
        accountIds.get("yuhang-wei"),
      );
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "owner migration rejects missing identities, source drift, and forged reviewed event sets",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_organizer_owner_gate_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:owner-gate:${schema}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      await seedReviewedState(pool, workspaceId);
      const plan = await buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID });

      await pool.query("BEGIN");
      await pool.query(`delete from orbit_records where workspace_id = $1 and collection_name = 'events' and record_id = 'event_01'`, [workspaceId]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /exactly the 16 reviewed/i);
      await pool.query("ROLLBACK");

      await pool.query("BEGIN");
      await pool.query(`delete from orbit_records where workspace_id = $1 and collection_name = 'auth_users' and payload->>'email' = 'yuhang-wei@organizers.orbit.example.test'`, [workspaceId]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /one active auth user/i);
      await pool.query("ROLLBACK");

      await pool.query("BEGIN");
      await pool.query(`update orbit_records set record_id = 'auth-user:noncanonical' where workspace_id = $1 and collection_name = 'auth_users' and record_id = $2`, [workspaceId, authUserRecordId("yuhang-wei@organizers.orbit.example.test")]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /noncanonical auth user/i);
      await pool.query("ROLLBACK");

      await pool.query("BEGIN");
      await pool.query(`update orbit_records set user_id = 'user:wrong' where workspace_id = $1 and collection_name = 'auth_users' and record_id = $2`, [workspaceId, authUserRecordId("kaori-ito@organizers.orbit.example.test")]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /noncanonical auth user/i);
      await pool.query("ROLLBACK");

      await pool.query("BEGIN");
      await pool.query(`update orbit_records set payload = jsonb_set(payload, '{createdAt}', 'null'::jsonb) where workspace_id = $1 and collection_name = 'auth_users' and record_id = $2`, [workspaceId, authUserRecordId("agenthubs@example.com")]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /noncanonical Xiaoyu auth user/i);
      await pool.query("ROLLBACK");

      await pool.query("BEGIN");
      await pool.query(`update orbit_records set user_id = 'account:unexpected' where workspace_id = $1 and collection_name = 'events' and record_id = 'event_01'`, [workspaceId]);
      await assert.rejects(buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID }), /drifted ownership/i);
      await pool.query("ROLLBACK");

      const duplicatePlan = {
        ...plan,
        assignments: [...plan.assignments, plan.assignments[0]!],
      } as EventOrganizerOwnerPlan;
      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: plan.hash, plan: duplicatePlan }),
        /changed since review/i,
      );
      const extraPlan = {
        ...plan,
        assignments: [...plan.assignments, { accountId: XIAOYU_ACTOR_ID, eventId: "event:extra-in-request" }],
      } as EventOrganizerOwnerPlan;
      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: plan.hash, plan: extraPlan }),
        /changed since review/i,
      );
      assert.equal((await pool.query(`select count(*)::int as count from orbit_records where workspace_id = $1 and collection_name = 'event_organizer_owner_migrations'`, [workspaceId])).rows[0]?.count, 0);
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "owner migration rolls back a partial event update before writing an audit record",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_organizer_owner_partial_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:owner-partial:${schema}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      await seedReviewedState(pool, workspaceId);
      const plan = await buildEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID });
      await pool.query(
        `create function suppress_reviewed_event_owner_update() returns trigger language plpgsql as $$
           begin
             if new.record_id = 'event_01' then return null; end if;
             return new;
           end;
         $$;
         create trigger suppress_reviewed_event_owner_update
           before update of user_id on orbit_records
           for each row execute function suppress_reviewed_event_owner_update();`,
      );

      await assert.rejects(
        applyEventOrganizerOwnerPlan({ client: pool, workspaceId, xiaoyuActorId: XIAOYU_ACTOR_ID, expectedCount: 16, expectedPlanHash: plan.hash, plan }),
        /update exactly the 16 reviewed event owners/i,
      );
      assert.equal((await pool.query(`select count(*)::int as count from orbit_records where workspace_id = $1 and collection_name = 'events' and user_id is not null`, [workspaceId])).rows[0]?.count, 0);
      assert.equal((await pool.query(`select count(*)::int as count from orbit_records where workspace_id = $1 and collection_name = 'event_organizer_owner_migrations'`, [workspaceId])).rows[0]?.count, 0);
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
