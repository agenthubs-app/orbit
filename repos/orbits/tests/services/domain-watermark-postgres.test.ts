import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { readDomainWatermark, type DomainWatermark } from "../../shared/storage/domain-watermark";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const W = "workspace:watermark";
const INSERT = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
  values ($1,$2,$3,$4,'manual','watermark',$5::jsonb,$6,$6)`;

test("domain watermark is one cheap indexed row that moves on every kind of change and stays per-user for private domains", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `watermark_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const statements: { sql: string; rows: number }[] = [];
  const client = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    statements.push({ sql, rows: result.rows.length });
    return { rows: result.rows as T[] };
  } };
  const at = (n: number) => `2026-09-18T04:00:${String(n).padStart(2, "0")}.000Z`;
  const insert = (collection: string, id: string, user: string, n: number) =>
    pool.query(INSERT, [W, collection, id, user, JSON.stringify({ id }), at(n)]);
  const read = (input: Partial<Parameters<typeof readDomainWatermark>[0]> = {}) =>
    readDomainWatermark({ client, workspaceId: W, collections: ["tasks"], ...input });
  const fingerprints = new Set<string>();
  const expectMoved = async (label: string, input?: Partial<Parameters<typeof readDomainWatermark>[0]>) => {
    const mark: DomainWatermark = await read(input);
    assert.ok(!fingerprints.has(mark.fingerprint), `${label}: watermark must change`);
    fingerprints.add(mark.fingerprint);
    return mark;
  };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (let n = 0; n < 5; n += 1) await insert("tasks", `task:a:${n}`, "actor:a", n);
    await insert("tasks", "task:b:0", "actor:b", 20);
    await insert("notes", "note:a:0", "actor:a", 30);

    statements.length = 0;
    const first = await read();
    assert.equal(statements.length, 1, "exactly one SQL statement");
    assert.equal(statements[0]!.rows, 1, "exactly one row back");
    assert.equal(first.count, 6);
    fingerprints.add(first.fingerprint);
    assert.equal((await read()).fingerprint, first.fingerprint, "stable when nothing changed");

    // Index usage: with sequential scans discouraged the planner must pick one of the two covering indexes.
    await pool.query("set enable_seqscan = off");
    const plan = (await pool.query<{ "QUERY PLAN": string }>(`explain ${statements[0]!.sql}`, [W, ["tasks"]])).rows.map((row) => row["QUERY PLAN"]).join("\n");
    await pool.query("reset enable_seqscan");
    assert.match(plan, /orbit_records_(workspace_collection|private_owner)_idx/, `plan must use a covering index:\n${plan}`);

    await insert("tasks", "task:a:5", "actor:a", 40);
    await expectMoved("insert");
    await pool.query("update orbit_records set payload = payload || '{\"touched\":true}', updated_at = $2 where workspace_id=$1 and record_id='task:a:0'", [W, at(41)]);
    await expectMoved("update");
    await pool.query("update orbit_records set lifecycle_state='deleted', deleted_at=$2, updated_at=$2 where workspace_id=$1 and record_id='task:a:1'", [W, at(42)]);
    await expectMoved("soft delete");
    await pool.query("delete from orbit_records where workspace_id=$1 and record_id='task:a:2'", [W]);
    await expectMoved("hard delete (count drops)");

    // Private domains: B's write never moves A's watermark; A's own write does.
    const aBefore = await read({ userId: "actor:a" });
    await insert("tasks", "task:b:1", "actor:b", 50);
    assert.equal((await read({ userId: "actor:a" })).fingerprint, aBefore.fingerprint, "B's write must not move A's watermark");
    assert.notEqual((await read({ userId: "actor:b" })).fingerprint, aBefore.fingerprint);
    await insert("tasks", "task:a:6", "actor:a", 51);
    assert.notEqual((await read({ userId: "actor:a" })).fingerprint, aBefore.fingerprint, "A's write must move A's watermark");

    // Shared (authorization) collections ride in the same single statement and move a private watermark.
    statements.length = 0;
    const withAuth = await read({ userId: "actor:a", sharedCollections: ["permissions"] });
    assert.equal(statements.length, 1, "private + shared collections stay one statement");
    await insert("permissions", "permission:1", "actor:admin", 55);
    assert.notEqual((await read({ userId: "actor:a", sharedCollections: ["permissions"] })).fingerprint, withAuth.fingerprint, "shared collection write must move the private watermark");

    // Multi-collection watermark covers every listed collection.
    const multi = await read({ collections: ["tasks", "notes"] });
    await insert("notes", "note:a:1", "actor:a", 60);
    assert.notEqual((await read({ collections: ["tasks", "notes"] })).fingerprint, multi.fingerprint);
    assert.equal((await read({ collections: ["contacts"] })).count, 0, "empty domains still yield a watermark");
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
