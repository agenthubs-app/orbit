import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { APPOINTMENT_SCHEMA_SQL } from "../../features/appointments/storage/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("local deletion anonymizes one side of a shared appointment, removes their writing, and preserves the other account", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(APPOINTMENT_SCHEMA_SQL);
    for (const actor of ["owner", "other"]) {
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('space','notes',$1,$2,'test',$1,$3::jsonb,now(),now())`, [`${actor}-note`, actor, JSON.stringify({ body: `${actor}-private` })]);
    }
    const appointment = {
      appointmentId: "shared", authorityRequestId: "authority:owner", contactIdsByActor: { owner: "owner-contact", other: "other-contact" },
      createdAt: "2026-10-01T00:00:00.000Z", createdByActorId: "owner", details: "owner-secret-details", detailsUpdatedByActorId: "owner",
      eventId: null, history: [
        { actorId: "owner", at: "2026-10-01T00:00:00.000Z", command: "created", detail: "owner-secret-history", proposalRevision: null, version: 1 },
        { actorId: "other", at: "2026-10-02T00:00:00.000Z", command: "counter", detail: "keep-other-history", proposalRevision: 2, version: 2 },
      ], inviteeActorId: "other", ownerActorId: "owner", pendingProposalRevision: 2,
      proposals: [
        { proposedByActorId: "owner", note: "owner-secret-proposal", revision: 1 },
        { proposedByActorId: "other", note: "keep-other-proposal", revision: 2 },
      ], confirmed: { confirmedByActorId: "owner", candidateId: "owner-secret-candidate" },
      projection: { calendar: "pending", meeting: "pending", revision: 2 }, relationshipPairId: "relationship:owner",
      reminders: { cancelled: false, currentRevision: 2 }, status: "confirmed", updatedAt: "2026-10-02T00:00:00.000Z", version: 2,
    };
    await pool.query(`insert into appointment_aggregates(workspace_id,appointment_id,owner_actor_id,invitee_actor_id,contact_id,
      relationship_pair_id,authority_request_id,contact_ids_by_actor,event_id,status,version,payload,created_at,updated_at)
      values('space','shared','owner','other','owner-contact','relationship:owner','authority:owner',$1::jsonb,null,'confirmed',2,$2::jsonb,now(),now())`,
    [JSON.stringify(appointment.contactIdsByActor), JSON.stringify(appointment)]);
    const reverse = { ...appointment, appointmentId: "reverse", ownerActorId: "other", inviteeActorId: "owner",
      relationshipPairId: "relationship:reverse", authorityRequestId: "authority:reverse", createdByActorId: "other" };
    await pool.query(`insert into appointment_aggregates(workspace_id,appointment_id,owner_actor_id,invitee_actor_id,contact_id,
      relationship_pair_id,authority_request_id,contact_ids_by_actor,event_id,status,version,payload,created_at,updated_at)
      values('space','reverse','other','owner','other-contact','relationship:reverse','authority:reverse',$1::jsonb,null,'confirmed',2,$2::jsonb,now(),now())`,
    [JSON.stringify(reverse.contactIdsByActor), JSON.stringify(reverse)]);
    await pool.query(`insert into appointment_command_receipts(workspace_id,idempotency_key,actor_id,appointment_id,aggregate_version,created_at,
      resource_id,command,request_hash,response_snapshot) values('space','other-key','other','shared',2,now(),'shared','counter','hash',$1::jsonb)`,
    [JSON.stringify(appointment)]);
    const { purgeAccountNotes } = await import("../../features/account/data-rights/purge/notes");
    const result = await purgeAccountNotes(db, "space", "owner");
    assert.ok(result.deleted >= 2);
    const kept = (await pool.query(`select owner_actor_id,invitee_actor_id,status,payload from appointment_aggregates where appointment_id='shared'`)).rows[0];
    assert.equal(kept?.owner_actor_id, "deleted-inviter");
    assert.equal(kept?.invitee_actor_id, "other");
    assert.equal(kept?.status, "cancelled");
    const retainedInvitee = (await pool.query(`select owner_actor_id,invitee_actor_id,payload from appointment_aggregates where appointment_id='reverse'`)).rows[0];
    assert.equal(retainedInvitee?.owner_actor_id, "other");
    assert.equal(retainedInvitee?.invitee_actor_id, "deleted-invitee");
    assert.ok(!JSON.stringify(retainedInvitee).includes('"owner"'));
    assert.ok(JSON.stringify(kept).includes("keep-other-proposal"));
    assert.ok(JSON.stringify(kept).includes("keep-other-history"));
    assert.ok(!JSON.stringify(kept).includes('"owner"') && !JSON.stringify(kept).includes("owner-secret"),
      "deleted actor ID and authored content leave the retained row");
    assert.equal((await pool.query(`select count(*)::int as n from appointment_command_receipts where appointment_id='shared'`)).rows[0]?.n, 0);
    assert.deepEqual((await pool.query("select distinct user_id from orbit_records order by user_id")).rows, [{ user_id: "other" }]);
    assert.equal((await purgeAccountNotes(db, "space", "owner")).deleted, 0);
    assert.equal((await pool.query(`select count(*)::int as n from appointment_aggregates`)).rows[0]?.n, 2);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
