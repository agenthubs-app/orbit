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

test("inbox purge removes the actor's messages and projections while preserving the other participant", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table relationship_conversations(workspace_id text,conversation_id text,inviter_account_id text not null,invitee_account_id text not null,
      inviter_contact_id text not null,status text not null,revoked_at timestamptz,revoked_by_account_id text,sync_revision bigint not null default 0,
      primary key(workspace_id,conversation_id),check(inviter_account_id<>invitee_account_id));
      create table relationship_conversation_members(workspace_id text,conversation_id text,account_id text,display_name text,
        foreign key(workspace_id,conversation_id) references relationship_conversations(workspace_id,conversation_id));
      create table relationship_messages(workspace_id text,conversation_id text,sender_account_id text,sender_display_name text,body text,
        foreign key(workspace_id,conversation_id) references relationship_conversations(workspace_id,conversation_id));
      create table relationship_lifecycle_command_receipts(workspace_id text,actor_id text,idempotency_key text);
      create table orbit_read_receipts(account_id text,id text);
      create table orbit_read_cost_daily_accounts(account_id text,id text);`);
    await pool.query("insert into relationship_conversations values('space','shared','owner','other','contact','active',null,null,0)");
    for (const actor of ["owner", "other"]) {
      await pool.query("insert into relationship_conversation_members values('space','shared',$1,$2)", [actor, actor]);
      await pool.query("insert into relationship_messages values('space','shared',$1,$2,$3)", [actor, actor, `${actor} message`]);
      await pool.query("insert into relationship_lifecycle_command_receipts values('space',$1,'key')", [actor]);
      await pool.query("insert into orbit_read_receipts values($1,'r')", [actor]);
      await pool.query("insert into orbit_read_cost_daily_accounts values($1,'r')", [actor]);
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('space','inboxNotifications',$1,$2,'test',$1,'{}',now(),now())`, [`${actor}-notification`, actor]);
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
        values('space','relationship_communication_messages',$1,'test',$1,$2::jsonb,now(),now())`, [`${actor}-legacy-message`, JSON.stringify({ senderAccountId: actor, body: `${actor} legacy` })]);
    }
    await pool.query(`update orbit_records set payload=payload || jsonb_build_object('body','削除されたメッセージ')
      where collection_name='relationship_communication_messages' and record_id='owner-legacy-message'`);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
      values('space','relationship_communication_conversations','legacy','test','legacy',$1::jsonb,now(),now())`,
      [JSON.stringify({ participantAccountIds: ["owner", "other"], participantDisplayNames: { owner: "Owner", other: "Other" }, contactId: "private", status: "active" })]);
    const { purgeAccountInbox } = await import("../../features/account/data-rights/purge/inbox");
    const first = await purgeAccountInbox(db, "space", "owner");
    assert.ok(first.deleted >= 7);
    assert.equal((await purgeAccountInbox(db, "space", "owner")).deleted, 0);
    assert.deepEqual((await pool.query("select sender_account_id,body from relationship_messages order by sender_account_id")).rows,
      [{ sender_account_id: "deleted-account", body: "削除されたメッセージ" }, { sender_account_id: "other", body: "other message" }]);
    assert.deepEqual((await pool.query("select account_id from relationship_conversation_members")).rows, [{ account_id: "other" }]);
    const conversation = (await pool.query("select * from relationship_conversations")).rows[0];
    assert.equal(conversation.inviter_account_id, "owner");
    assert.equal(conversation.invitee_account_id, "other");
    assert.equal(conversation.inviter_contact_id, "deleted-contact");
    assert.equal(conversation.status, "active");
    const legacy = (await pool.query("select payload from orbit_records where collection_name='relationship_communication_conversations'")).rows[0]?.payload;
    assert.deepEqual(legacy.participantAccountIds, ["deleted-account", "other"]);
    assert.deepEqual(legacy.participantDisplayNames, { other: "Other" });
    assert.equal(legacy.contactId, undefined);
    assert.equal(legacy.status, "active");
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='relationship_communication_messages'")).rows[0]?.n, 2);
    assert.equal((await pool.query("select payload->>'senderAccountId' as sender from orbit_records where record_id='owner-legacy-message'")).rows[0]?.sender, "deleted-account");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
