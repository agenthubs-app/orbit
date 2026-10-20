import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("all JSON image reader includes only the actor's uploaded V1 and V2 cards", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table bc_ingest_batches (workspace_id text,id text,actor_id text)`);
    await pool.query(`create table bc_ingest_items (workspace_id text,id text,batch_id text,derivative_object_key text)`);
    const v1 = "/card-root/b1/i1.jpg";
    const v2 = "00000000-0000-4000-8000-000000000001.jpg";
    for (const [id, actor] of [["i1", "actor"], ["other", "other"]]) {
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('w','businessCardBatchItems',$1,$2,'test',$1,$3::jsonb,now(),now())`,
      [id, actor, JSON.stringify({ item: { id, actorId: actor, imagePath: id === "i1" ? v1 : "/card-root/other.jpg" } })]);
    }
    await pool.query(`insert into bc_ingest_batches values ('w','b2','actor'),('w','b3','other')`);
    await pool.query(`insert into bc_ingest_items values ('w','v2','b2',$1),('w','v3','b3',$1)`, [v2]);
    const opened: string[] = [];
    const { createAccountExportImageReader } = await import("../../features/account/data-rights/images");
    const read = createAccountExportImageReader({ db, workspaceId: "w", actorId: "actor", open: async key => {
      opened.push(key); return Buffer.from(key);
    } });
    const images = await read();
    assert.equal(images.length, 2);
    assert.deepEqual(opened.sort(), [v1, v2].sort());
    assert.ok(images.every(image => /^card-[a-f0-9]{24}\.jpg$/.test(image.name)));
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
