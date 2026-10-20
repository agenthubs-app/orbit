import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("contact purge erases owned image objects and rows, then safely replays after object failure", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table bc_ingest_batches(workspace_id text,id text,actor_id text,primary key(workspace_id,id));
      create table bc_ingest_items(workspace_id text,id text,batch_id text,derivative_object_key text,
        foreign key(workspace_id,batch_id) references bc_ingest_batches(workspace_id,id));
      create table bc_ingest_raw_uploads(workspace_id text,id text,actor_id text,object_key text);
      create table bc_ingest_cleanup_tasks(workspace_id text,id text,batch_id text,object_key text);
      create table bc_ingest_image_writes(workspace_id text,object_key text,state text);
      create table bc_ingest_notifications(workspace_id text,batch_id text,actor_id text);
      create table contact_import_batches(workspace_id text,id text,actor_id text,primary key(workspace_id,id));
      create table contact_import_rows(workspace_id text,batch_id text,seq int,
        foreign key(workspace_id,batch_id) references contact_import_batches(workspace_id,id));
      create table contact_import_followups(workspace_id text,batch_id text,actor_id text);
      create table contact_insights(workspace_id text,actor_id text,contact_id text);
      create table invite_codes(workspace_id text,id text,actor_id text,primary key(workspace_id,id));
      create table invite_connections(workspace_id text,id text,code_id text,inviter_actor_id text,redeemer_actor_id text,
        foreign key(workspace_id,code_id) references invite_codes(workspace_id,id));
      create table network_analysis_jobs(workspace_id text,actor_id text,id text);
      create table network_analysis_snapshots(workspace_id text,actor_id text,id text);`);
    for (const actor of ["owner", "other"]) {
      await pool.query("insert into bc_ingest_batches values('space',$1,$2)", [`${actor}-batch`, actor]);
      await pool.query("insert into bc_ingest_items values('space',$1,$2,$3)", [`${actor}-item`, `${actor}-batch`, `image/${actor}.jpg`]);
      await pool.query("insert into bc_ingest_raw_uploads values('space',$1,$2,$3)", [`${actor}-raw`, actor, `raw/${actor}.jpg`]);
      await pool.query("insert into bc_ingest_cleanup_tasks values('space',$1,$2,$3)", [`${actor}-cleanup`, `${actor}-batch`, `image/${actor}.jpg`]);
      await pool.query("insert into bc_ingest_image_writes values('space',$1,'attached')", [`image/${actor}.jpg`]);
      await pool.query("insert into bc_ingest_notifications values('space',$1,$2)", [`${actor}-batch`, actor]);
      await pool.query("insert into contact_import_batches values('space',$1,$2)", [`${actor}-import`, actor]);
      await pool.query("insert into contact_import_rows values('space',$1,1)", [`${actor}-import`]);
      await pool.query("insert into contact_import_followups values('space',$1,$2)", [`${actor}-import`, actor]);
      await pool.query("insert into contact_insights values('space',$1,'contact')", [actor]);
      await pool.query("insert into invite_codes values('space',$1,$2)", [`${actor}-code`, actor]);
      await pool.query("insert into invite_connections values('space',$1,$2,$3,$4)", [`${actor}-connection`, `${actor}-code`, actor, actor]);
      await pool.query("insert into network_analysis_jobs values('space',$1,'job')", [actor]);
      await pool.query("insert into network_analysis_snapshots values('space',$1,'snapshot')", [actor]);
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('space','contacts',$1,$2,'test',$1,'{}',now(),now())`, [`${actor}-contact`, actor]);
    }
    const { purgeAccountContacts } = await import("../../features/account/data-rights/purge/contacts");
    const removed: string[] = [];
    let fail = true;
    const erase = async (key: string) => { if (fail) { fail = false; throw new Error("object unavailable"); } removed.push(key); };
    await pool.query("update bc_ingest_items set derivative_object_key='image/owner.jpg' where id='other-item'");
    await assert.rejects(() => purgeAccountContacts({ db, workspaceId: "space", actorId: "owner", eraseObject: erase }), /SHARED_CARD_IMAGE_KEY/);
    assert.equal(fail, true, "shared objects must not reach the eraser");
    await pool.query("update bc_ingest_items set derivative_object_key='image/other.jpg' where id='other-item'");
    await assert.rejects(() => purgeAccountContacts({ db, workspaceId: "space", actorId: "owner", eraseObject: erase }), /object unavailable/);
    assert.equal((await pool.query("select count(*)::int as n from bc_ingest_batches")).rows[0]?.n, 2);
    const result = await purgeAccountContacts({ db, workspaceId: "space", actorId: "owner", eraseObject: erase });
    assert.deepEqual(removed.sort(), ["image/owner.jpg", "raw/owner.jpg"]);
    assert.ok(result.deleted > 0);
    assert.equal((await purgeAccountContacts({ db, workspaceId: "space", actorId: "owner", eraseObject: erase })).deleted, 0);
    for (const table of ["bc_ingest_batches", "bc_ingest_items", "bc_ingest_raw_uploads", "bc_ingest_cleanup_tasks", "bc_ingest_image_writes", "bc_ingest_notifications", "contact_import_batches", "contact_import_rows", "contact_import_followups", "contact_insights", "invite_codes", "invite_connections", "network_analysis_jobs", "network_analysis_snapshots"]) {
      const count = await pool.query(`select count(*)::int as n from ${table}`);
      assert.equal(count.rows[0]?.n, 1, table);
    }
    const contacts = await pool.query("select user_id from orbit_records where collection_name='contacts'");
    assert.deepEqual(contacts.rows, [{ user_id: "other" }]);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
