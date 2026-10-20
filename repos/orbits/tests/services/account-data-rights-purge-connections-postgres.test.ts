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

test("connection purge requires token revocation before deleting only the target's credentials and devices", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const actor of ["owner", "other"]) {
      for (const collection of ["integrationTokens", "integrationOAuthStates", "integrationHealth", "pushDevices"]) {
        await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values('space',$1,$2,$3,'test',$4,'{}',now(),now())`, [collection, `${actor}-${collection}`, actor, collection === "integrationTokens" ? "integration:google_calendar" : collection]);
      }
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
        values('space','mobile_auth_exchanges',$1,'test',$1,$2::jsonb,now(),now())`, [`${actor}-exchange`, JSON.stringify({ user: { id: `${actor}-user` } })]);
    }
    const { purgeAccountConnections } = await import("../../features/account/data-rights/purge/connections");
    await assert.rejects(() => purgeAccountConnections({ db, workspaceId: "space", actorId: "owner", userId: "owner-user" }), /TOKEN_REVOCATION_REQUIRED/);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 10);
    const revoked: string[] = [];
    let fail = true;
    const revokeToken = async (source: string) => { if (fail) { fail = false; throw new Error("revoke unavailable"); } revoked.push(source); };
    await assert.rejects(() => purgeAccountConnections({ db, workspaceId: "space", actorId: "owner", userId: "owner-user", revokeToken }), /revoke unavailable/);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 10);
    assert.equal((await purgeAccountConnections({ db, workspaceId: "space", actorId: "owner", userId: "owner-user", revokeToken })).deleted, 5);
    assert.deepEqual(revoked, ["integration:google_calendar"]);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 5);
    assert.equal((await purgeAccountConnections({ db, workspaceId: "space", actorId: "owner", userId: "owner-user", revokeToken })).deleted, 0);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
