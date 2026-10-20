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

test("agent purge covers both personal subspace encodings and base actor records", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const actor of ["actor/a", "actor/b"]) {
      for (const [workspace, collection] of [
        ["space", "agentActions"],
        [`space:agent-actor:${actor}`, "agentSignals"],
        [`space:actor:${encodeURIComponent(actor)}`, "orbit_agent_chat_messages"],
      ]) {
        await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values($1,$2,$3,$4,'test',$3,'{}',now(),now())`, [workspace, collection, `${actor}-${collection}`, workspace === "space" ? actor : null]);
      }
    }
    const { purgeAccountAgentData } = await import("../../features/account/data-rights/purge/agent");
    assert.equal((await purgeAccountAgentData(db, "space", "actor/a")).deleted, 3);
    assert.equal((await purgeAccountAgentData(db, "space", "actor/a")).deleted, 0);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 3);
    assert.deepEqual((await pool.query("select distinct workspace_id from orbit_records order by workspace_id")).rows,
      [{ workspace_id: "space" }, { workspace_id: "space:actor:actor%2Fb" }, { workspace_id: "space:agent-actor:actor/b" }]);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
