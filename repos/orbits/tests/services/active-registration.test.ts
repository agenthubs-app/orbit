/**
 * W0006 第 4 步「报名过任意活动」：`hasAnyActiveRegistration` 直接读本人的报名事实，
 * 不限于当前公开目录。
 *
 * - 内存假客户端：canonical rsvped 即完成；取消的不算；旧投影只在该活动没有 canonical 记录时算；
 *   参数永远是本人的 canonical actor id；
 * - 真实 PostgreSQL（本机测试库、独立 schema）：在真正的 event_ops / orbit_records 表上跑同一组 SQL。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import {
  ACTIVE_CANONICAL_REGISTRATION_SQL,
  CANONICAL_HEAD_EVENT_IDS_SQL,
  createActiveRegistrationChecker,
  LEGACY_RSVPED_EVENT_IDS_SQL,
} from "../../features/events/registration/active-registration";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

interface Head {
  actorId: string;
  eventId: string;
  status: "cancelled" | "rsvped";
}
interface Legacy {
  eventId: string;
  status: "cancelled" | "rsvped";
  userId: string;
}

function fakeSources(heads: Head[], legacy: Legacy[] | null) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const canonical = {
    client: {
      async query<TRow>(sql: string, values: readonly unknown[] = []) {
        calls.push({ sql, values });
        const [, actorId, eventIds] = values as [string, string, string[] | undefined];
        if (sql === ACTIVE_CANONICAL_REGISTRATION_SQL) {
          return { rows: heads.filter((head) => head.actorId === actorId && head.status === "rsvped").slice(0, 1).map(() => ({ found: 1 })) as TRow[] };
        }
        if (sql === CANONICAL_HEAD_EVENT_IDS_SQL) {
          return { rows: heads.filter((head) => head.actorId === actorId && eventIds!.includes(head.eventId)).map((head) => ({ event_id: head.eventId })) as TRow[] };
        }
        throw new Error(`unexpected canonical SQL: ${sql}`);
      },
    },
    workspaceId: "workspace:events",
  };
  const legacySource = legacy
    ? {
        client: {
          async query<TRow>(sql: string, values: readonly unknown[] = []) {
            calls.push({ sql, values });
            assert.equal(sql, LEGACY_RSVPED_EVENT_IDS_SQL);
            const actorId = values[1];
            return {
              rows: legacy
                .filter((row) => row.userId === actorId && row.status === "rsvped")
                .map((row) => ({ event_id: row.eventId })) as TRow[],
            };
          },
        },
        workspaceId: "workspace:records",
      }
    : null;
  // 假客户端只返回 rows，测试里不读 rowCount。
  return { calls, check: createActiveRegistrationChecker({ canonical: canonical as never, legacy: legacySource as never }) };
}

test("a canonical rsvped registration counts, even for an event no longer in the public catalogue", async () => {
  const { calls, check } = fakeSources([{ actorId: "account:alice", eventId: "ev-unlisted", status: "rsvped" }], []);
  assert.equal(await check("account:alice"), true);
  assert.deepEqual(calls.map((call) => call.values), [["workspace:events", "account:alice"]]);
});

test("cancelled registrations do not count; other actors' registrations never leak", async () => {
  const { check } = fakeSources(
    [
      { actorId: "account:alice", eventId: "ev-1", status: "cancelled" },
      { actorId: "account:bob", eventId: "ev-2", status: "rsvped" },
    ],
    [{ eventId: "ev-3", status: "rsvped", userId: "account:bob" }],
  );
  assert.equal(await check("account:alice"), false);
  assert.equal(await check("account:bob"), true);
});

test("a legacy projection counts only for events without a canonical record for the actor", async () => {
  const stale = fakeSources(
    [{ actorId: "account:alice", eventId: "ev-migrated", status: "cancelled" }],
    [{ eventId: "ev-migrated", status: "rsvped", userId: "account:alice" }],
  );
  assert.equal(await stale.check("account:alice"), false, "canonical cancellation wins over a stale projection");

  const legacyOnly = fakeSources(
    [{ actorId: "account:alice", eventId: "ev-migrated", status: "cancelled" }],
    [
      { eventId: "ev-migrated", status: "rsvped", userId: "account:alice" },
      { eventId: "ev-legacy", status: "rsvped", userId: "account:alice" },
    ],
  );
  assert.equal(await legacyOnly.check("account:alice"), true);
  const headQuery = legacyOnly.calls.find((call) => call.sql === CANONICAL_HEAD_EVENT_IDS_SQL);
  assert.deepEqual(headQuery?.values, ["workspace:events", "account:alice", ["ev-migrated", "ev-legacy"]]);
});

test("no sources means no registration; a blank actor is rejected", async () => {
  assert.equal(await createActiveRegistrationChecker({ canonical: null, legacy: null })("account:alice"), false);
  await assert.rejects(() => fakeSources([], []).check("  "), /ACTOR_REQUIRED/);
});

/* ── 真实 PostgreSQL ────────────────────────────────────────────────── */

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

test(
  "the same SQL runs against the real event_ops and orbit_records tables",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must be a loopback database");
    const schema = `active_reg_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
    await client.connect();
    try {
      await client.query(`create schema ${schema}`);
      await client.query(`set search_path = ${schema}`);
      await runEventOperationsMigrations({ query: (sql: string) => client.query(sql) });
      await client.query(ORBIT_RECORDS_SCHEMA_SQL);
      // 只测「有没有报名」的读取：跳过外键，直接写 membership head 的最小行。
      await client.query("set session_replication_role = replica");
      const head = (eventId: string, actorId: string, status: string) =>
        client.query(
          `insert into event_ops_membership_heads
             (workspace_id, event_id, actor_id, membership_version, participant_id, profile_version, status, updated_at)
           values ('workspace:events', $1, $2, 1, $3, 1, $4, now())`,
          [eventId, actorId, `participant:${eventId}:${actorId}`, status],
        );
      const legacy = (eventId: string, userId: string, status: string) =>
        client.query(
          `insert into orbit_records
             (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
           values ('workspace:records', 'event_registrations', $1, $2, 'active', $3::jsonb, 'manual', 'test', '{}'::text[], now(), now())`,
          [`reg:${eventId}:${userId}`, userId, JSON.stringify({ registration: { eventId, status, userId }, registrationId: `reg:${eventId}:${userId}` })],
        );
      await head("ev-cancelled", "account:alice", "cancelled");
      await head("ev-bob", "account:bob", "rsvped");
      await legacy("ev-cancelled", "account:alice", "rsvped");
      await legacy("ev-carol-legacy", "account:carol", "rsvped");
      await legacy("ev-dave-cancelled", "account:dave", "cancelled");

      const executor = { query: (sql: string, values?: readonly unknown[]) => client.query(sql, values as unknown[]) };
      const check = createActiveRegistrationChecker({
        canonical: { client: executor as never, workspaceId: "workspace:events" },
        legacy: { client: executor as never, workspaceId: "workspace:records" },
      });
      assert.equal(await check("account:alice"), false, "canonical cancellation wins over the stale projection");
      assert.equal(await check("account:bob"), true);
      assert.equal(await check("account:carol"), true, "legacy-only rsvped registration counts");
      assert.equal(await check("account:dave"), false);
      assert.equal(await check("account:nobody"), false);
    } finally {
      await client.query("set session_replication_role = origin").catch(() => undefined);
      await client.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await client.end();
    }
  },
);
