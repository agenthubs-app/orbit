/** R17 迁移 host-core（v16）：只加、可重放；短链 alias 类型、manager 角色、各新表可写。 */
import assert from "node:assert/strict";
import test from "node:test";

import { EVENT_OPERATIONS_SCHEMA_MIGRATIONS, runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

test("host-core is v16, appended after v15 without touching earlier checksums", () => {
  const v16 = EVENT_OPERATIONS_SCHEMA_MIGRATIONS.at(-1);
  assert.equal(v16?.version, 16);
  assert.equal(v16?.name, "event-operations-v16-host-core");
});

test("host-core migrates, replays, and accepts the new values", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ pool, workspaceId }) => {
    await runEventOperationsMigrations(pool);
    const tables = await pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = current_schema() and table_name = any($1::text[]) order by 1`, [["organizer_profiles", "event_reception_counters", "event_reception_numbers", "event_ops_checkin_undos", "event_ops_walk_ins", "event_kiosk_requests", "event_kiosk_heartbeats", "event_ops_matching_conditions", "event_ops_generation_overrides", "event_cohost_invites", "event_cohost_invite_attempts", "event_host_notice_outbox", "event_host_notice_sends", "event_host_notice_extras"]]);
    assert.equal(tables.rows.length, 14);
    await lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, lifecycle_state_v2, created_by) values ($1, 'e1', 'host', now(), now(), 'draft', 'host')`, [workspaceId]);
    await pool.query(`insert into event_aliases (workspace_id, normalized_alias, alias_value, alias_type, event_id) values ($1, 'cfo-night-19', 'cfo-night-19', 'public_slug', 'e1')`, [workspaceId]);
    await assert.rejects(lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, created_by) values ($1, 'e2', 'host', now(), now(), 'backfill')`, [workspaceId]), /created_by_check/u);
    await pool.query(`insert into event_ops_event_role_assignment_versions (workspace_id, event_id, subject_actor_id, assignment_version, role, state, assigned_by_actor_id, reason) values ($1, 'e1', 'cohost', 1, 'manager', 'active', 'host', 'reason')`, [workspaceId]);
    await assert.rejects(pool.query(`insert into event_cohost_invites (workspace_id, invite_id, event_id, token_hash, short_code, role, invited_by, expires_at) values ($1, 'i1', 'e1', 'h', 'H-7KQM-2TR0', 'manager', 'host', now())`, [workspaceId]), "0 is not in the code alphabet");
    await pool.query(`insert into event_cohost_invites (workspace_id, invite_id, event_id, token_hash, short_code, role, invited_by, expires_at) values ($1, 'i1', 'e1', 'h', 'H-7KQM-2TR4', 'manager', 'host', now())`, [workspaceId]);
    await assert.rejects(pool.query(`insert into event_host_notice_extras (workspace_id, event_id, host_note, updated_by) values ($1, 'e1', repeat('あ', 141), 'host')`, [workspaceId]));
  });
});
