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

test("export purge retries a failed object deletion and preserves another actor's ZIP", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const actor of ["owner", "other"]) {
      for (const [collection, kind] of [["account_exports", ""], ["account_export_locks", ""], ["account_rights_outbox", "export-ready"], ["account_rights_outbox", "deletion-request"]]) {
        const id = `${actor}-${collection}-${kind}`;
        const payload = collection === "account_exports" ? { fileKey: `account-exports/${actor}.zip` } : { kind };
        await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values('space',$1,$2,$3,'test',$2,$4::jsonb,now(),now())`, [collection, id, actor, JSON.stringify(payload)]);
      }
    }
    const { purgeAccountExports } = await import("../../features/account/data-rights/purge/exports");
    let fail = true;
    const removed: string[] = [];
    const storage = { async delete(actor: string, key: string) { if (fail) { fail = false; throw new Error("file busy"); } removed.push(`${actor}:${key}`); } };
    await assert.rejects(() => purgeAccountExports({ db, workspaceId: "space", actorId: "owner", storage }), /file busy/);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 8);
    assert.equal((await purgeAccountExports({ db, workspaceId: "space", actorId: "owner", storage })).deleted, 3);
    assert.deepEqual(removed, ["owner:account-exports/owner.zip"]);
    assert.equal((await purgeAccountExports({ db, workspaceId: "space", actorId: "owner", storage })).deleted, 0);
    const remaining = await pool.query("select user_id,collection_name,payload->>'kind' as kind from orbit_records order by user_id,collection_name,record_id");
    assert.equal(remaining.rows.filter(row => row.user_id === "owner").length, 1);
    assert.equal(remaining.rows.filter(row => row.user_id === "owner")[0]?.kind, "deletion-request");
    assert.equal(remaining.rows.filter(row => row.user_id === "other").length, 4);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
