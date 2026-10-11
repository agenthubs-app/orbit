/**
 * R15 SC-R15-08 / SC-R15-05（真实 PostgreSQL，只连回环库）：迁移「invite-codes-core」从零、重跑、约束——
 * 每人一个可用码、`used_count ≤ max_uses`、码全局唯一、同一对人只有一条生效连接（解除后可再连）、幂等键唯一。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import { INVITE_CODE_MIGRATIONS, runInviteCodeMigrations } from "../../features/invite-codes/migrations";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { databaseTest, INVITE_WS, withInviteDatabase } from "../support/invite-codes-harness";

test.before(async () => {
  if (!databaseTest.skip) await migrateConfiguredTestDatabase();
});

async function rejects(pool: Pool, sql: string, values: unknown[], code: string) {
  await assert.rejects(pool.query(sql, values), (error: { code?: string }) => error.code === code, sql);
}

const insertCode = (pool: Pool, id: string, actor: string, code: string, extra: { revoked?: boolean; superseded?: boolean; used?: number; max?: number; key?: string } = {}) =>
  pool.query(
    `insert into invite_codes (workspace_id, id, actor_id, code, shared_keys, max_uses, used_count, expires_at, revoked_at, superseded_at, idempotency_key)
     values ($1, $2, $3, $4, '{organization}', $5, $6, now() + interval '7 days', $7, $8, $9)`,
    [INVITE_WS, id, actor, code, extra.max ?? 10, extra.used ?? 0, extra.revoked ? new Date() : null, extra.superseded ? new Date() : null, extra.key ?? null],
  );

const insertConnection = (pool: Pool, id: string, codeId: string, inviter: string, redeemer: string, key: string, unlinked = false) =>
  pool.query(
    `insert into invite_connections (workspace_id, id, code_id, inviter_actor_id, redeemer_actor_id, outcome, inviter_contact_id, redeemer_contact_id,
       inviter_contact_created, redeemer_contact_created, redeemer_idempotency_key, unlinked_at, unlinked_by)
     values ($1, $2, $3, $4, $5, 'connected', 'c-a', 'c-b', true, true, $6, $7, $8)`,
    [INVITE_WS, id, codeId, inviter, redeemer, key, unlinked ? new Date() : null, unlinked ? inviter : null],
  );

test("invite-codes-core migrates from zero, records its checksum, and reruns without changes", databaseTest, async () => {
  await withInviteDatabase(async ({ pool }) => {
    const tables = (await pool!.query<{ tablename: string }>("select tablename from pg_tables where schemaname = current_schema() order by tablename")).rows.map((row) => row.tablename);
    for (const table of ["invite_code_attempts", "invite_codes", "invite_codes_schema_migrations", "invite_connections"]) assert.ok(tables.includes(table), table);
    const applied = async () => (await pool!.query("select version, name, checksum, applied_at from invite_codes_schema_migrations order by version")).rows;
    const before = await applied();
    assert.deepEqual(before.map(({ version, name, checksum }) => ({ checksum, name, version })), INVITE_CODE_MIGRATIONS.map(({ version, name, checksum }) => ({ checksum, name, version })));
    assert.equal(before[0]?.name, "invite-codes-core");
    await runInviteCodeMigrations(pool!);
    assert.deepEqual(await applied(), before, "a rerun keeps the history, including applied_at");
  });
});

test("a changed migration body is refused by the checksum guard", databaseTest, async () => {
  await withInviteDatabase(async ({ pool }) => {
    await pool!.query("update invite_codes_schema_migrations set checksum = 'tampered' where version = 1");
    await assert.rejects(runInviteCodeMigrations(pool!), /checksum mismatch/u);
  });
});

test("one usable code per person, global unique codes, used_count within max_uses, alphabet only", databaseTest, async () => {
  await withInviteDatabase(async ({ pool }) => {
    const db = pool!;
    await insertCode(db, "k1", "actor:a", "K7QX2M9P");
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ($1, 'k2', 'actor:a', 'H8MW4QZT', now())", [INVITE_WS], "23505");
    // 作废 / 被替换的不占「可用」名额。
    await db.query("update invite_codes set superseded_at = now() where id = 'k1'");
    await insertCode(db, "k2", "actor:a", "H8MW4QZT");
    await db.query("update invite_codes set revoked_at = now() where id = 'k2'");
    await insertCode(db, "k3", "actor:a", "R4VN8HTC");
    // 码全局唯一（跨人、跨 workspace）。
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ('other', 'k9', 'actor:z', 'K7QX2M9P', now())", [], "23505");
    // 用量上限与字母表。
    await rejects(db, "update invite_codes set used_count = 11 where id = 'k3'", [], "23514");
    await rejects(db, "update invite_codes set max_uses = 11 where id = 'k3'", [], "23514");
    await rejects(db, "update invite_codes set used_count = -1 where id = 'k3'", [], "23514");
    await db.query("update invite_codes set max_uses = 2, used_count = 2 where id = 'k3'");
    await rejects(db, "update invite_codes set used_count = 3 where id = 'k3'", [], "23514");
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ($1, 'k4', 'actor:b', 'K7QX2M9O', now())", [INVITE_WS], "23514");
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ($1, 'k4', 'actor:b', 'k7qx2m9z', now())", [INVITE_WS], "23514");
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, shared_keys, expires_at) values ($1, 'k4', 'actor:b', 'ZZZZ2222', '{password}', now())", [INVITE_WS], "23514");
    // 幂等键：同一个人同一个键只有一行。
    await insertCode(db, "k5", "actor:b", "ZZZZ2222", { key: "same", superseded: true });
    await rejects(db, "insert into invite_codes (workspace_id, id, actor_id, code, expires_at, idempotency_key) values ($1, 'k6', 'actor:b', 'ZZZZ3333', now(), 'same')", [INVITE_WS], "23505");
  });
});

test("one live connection per pair in either direction; unlinking frees the pair; redeem keys are unique", databaseTest, async () => {
  await withInviteDatabase(async ({ pool }) => {
    const db = pool!;
    await insertCode(db, "ka", "actor:a", "K7QX2M9P");
    await insertCode(db, "kb", "actor:b", "H8MW4QZT");
    await insertConnection(db, "n1", "ka", "actor:a", "actor:b", "r1");
    await assert.rejects(insertConnection(db, "n2", "kb", "actor:b", "actor:a", "r2"), (error: { code?: string }) => error.code === "23505", "the reverse direction is the same pair");
    await db.query("update invite_connections set unlinked_at = now(), unlinked_by = 'actor:b' where id = 'n1'");
    await insertConnection(db, "n3", "kb", "actor:b", "actor:a", "r3");
    await assert.rejects(insertConnection(db, "n4", "kb", "actor:c", "actor:a", "r3"), (error: { code?: string }) => error.code === "23505", "redeemer idempotency key is unique per redeemer");
    await assert.rejects(insertConnection(db, "n5", "ka", "actor:a", "actor:a", "r5"), (error: { code?: string }) => error.code === "23514", "nobody connects to themselves");
    await rejects(db, "update invite_connections set unlinked_at = now() where id = 'n3'", [], "23514");
    await rejects(db, "update invite_connections set unlinked_at = now(), unlinked_by = 'actor:z' where id = 'n3'", [], "23514");
    await assert.rejects(insertConnection(db, "n6", "missing", "actor:x", "actor:y", "r6"), (error: { code?: string }) => error.code === "23503", "the code must exist");
  });
});

test("attempt counters are keyed by bucket and window", databaseTest, async () => {
  await withInviteDatabase(async ({ pool }) => {
    const db = pool!;
    await db.query("insert into invite_code_attempts (bucket, window_start, count) values ('pv:x', '2026-10-11T00:00:00Z', 1)");
    await rejects(db, "insert into invite_code_attempts (bucket, window_start, count) values ('pv:x', '2026-10-11T00:00:00Z', 1)", [], "23505");
    await rejects(db, "insert into invite_code_attempts (bucket, window_start, count) values ('pv:y', '2026-10-11T00:00:00Z', -1)", [], "23514");
  });
});
