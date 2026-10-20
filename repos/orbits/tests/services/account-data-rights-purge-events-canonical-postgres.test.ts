import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => { try { const u = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(u.hostname) && u.pathname === "/orbit_line_c_test"; } catch { return false; } })();

test("canonical event participant is anonymized while another account stays readable", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runEventOperationsMigrations(pool);
    await pool.query(`insert into event_ops_events(workspace_id,event_id,organizer_actor_id,created_at,updated_at)
      values('space','event-1','host',now(),now())`);
    for (const [actor, participant] of [["actor", "participant-a"], ["other", "participant-b"]]) {
      await pool.query(`insert into event_ops_profile_versions(workspace_id,event_id,participant_id,profile_version,actor_id,
        profile_payload,profile_hash,source_registration_id,created_at,effective_at)
        values('space','event-1',$1,1,$2,$3::jsonb,'hash',$4,now(),now())`,
      [participant, actor, JSON.stringify({ displayName: actor === "actor" ? "Private Person" : "Counterparty" }), `registration:${actor}`]);
      await pool.query(`insert into event_ops_profile_heads(workspace_id,event_id,participant_id,actor_id,profile_version,updated_at)
        values('space','event-1',$1,$2,1,now())`, [participant, actor]);
      await pool.query(`insert into event_ops_membership_versions(workspace_id,event_id,actor_id,membership_version,participant_id,
        profile_version,status,registered_at,late_registration,source_registration_id,created_at,effective_at,origin)
        values('space','event-1',$1,1,$2,1,'rsvped',now(),false,$3,now(),now(),'legacy_registration')`,
      [actor, participant, `registration:${actor}`]);
      await pool.query(`insert into event_ops_membership_heads(workspace_id,event_id,actor_id,membership_version,participant_id,
        profile_version,status,updated_at) values('space','event-1',$1,1,$2,1,'rsvped',now())`, [actor, participant]);
    }
    await pool.query(`insert into event_ops_configurations(workspace_id,event_id,configuration_version,check_in_opens_at,
      event_starts_at,event_ends_at,profile_edit_deadline_at,registration_cutoff_at,results_available_at,
      round_one_starts_at,round_two_starts_at,recommendation_count,table_size,shard_size,max_attempts_per_task,created_at,updated_at)
      values('space','event-1',1,now(),now()+interval '1 day',now()+interval '3 days',
        now()+interval '12 hours',now()+interval '1 day',now()+interval '36 hours',
        now()+interval '2 days',now()+interval '60 hours',1,2,1,1,now(),now())`);
    await pool.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
      configuration_version,snapshot_hash,status,expected_task_count,ai_request_fingerprint,created_at,updated_at)
      values('space','gen-1','event-1','host','key-1',1,'snapshot','published',1,'fingerprint',now(),now())`);
    for (const [actor, participant, ordinal] of [["actor", "participant-a", 0], ["other", "participant-b", 1]] as const) {
      await pool.query(`insert into event_ops_generation_participants(workspace_id,generation_id,participant_id,actor_id,
        profile_version,ordinal,participant_payload,membership_version) values('space','gen-1',$1,$2,1,$3,$4::jsonb,1)`,
      [participant, actor, ordinal, JSON.stringify({ displayName: actor === "actor" ? "Private Person" : "Counterparty" })]);
    }
    const dto = { eventId: "event-1", directory: [
      { actorId: "actor", participantId: "participant-a", displayName: "Private Person" },
      { actorId: "other", participantId: "participant-b", displayName: "Counterparty" },
    ], recommendations: [{ sourceParticipantId: "participant-b", recommendations: [{ targetParticipantId: "participant-a" }] }],
    graph: { nodes: [{ participantId: "participant-a", displayName: "Private Person" }, { participantId: "participant-b", displayName: "Counterparty" }],
      edges: [{ fromParticipantId: "participant-a", toParticipantId: "participant-b" }] },
    grouping: { roundOne: [{ members: [{ participantId: "participant-a" }, { participantId: "participant-b" }], memberPrompts: { "participant-a": ["Private Person", "x"] }, memberRationales: {} }], roundTwo: [] } };
    await pool.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,dto_hash,
      published_dto,published_by_actor_id,published_at) values('space','pub-1','event-1','gen-1','snapshot','hash',$1::jsonb,'host',now())`, [JSON.stringify(dto)]);
    await pool.query(`insert into event_ops_publication_heads(workspace_id,event_id,publication_id,generation_id,revision,updated_at)
      values('space','event-1','pub-1','gen-1',1,now())`);
    await pool.query(`insert into event_ops_graph_nodes(workspace_id,publication_id,participant_id,node_payload)
      values('space','pub-1','participant-a','{}'::jsonb),('space','pub-1','participant-b','{}'::jsonb)`);
    await pool.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
      configuration_version,snapshot_hash,status,expected_task_count,ai_request_fingerprint,created_at,updated_at)
      values('space','gen-audit','event-1','host','key-audit',1,'snapshot','superseded',1,'fingerprint',now(),now())`);
    await pool.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,dto_hash,
      published_dto,published_by_actor_id,published_at) values('space','pub-audit','event-1','gen-audit','snapshot','hash','{}'::jsonb,'actor',now())`);
    await pool.query(`insert into event_ops_data_repair_runs(workspace_id,repair_id,repair_type,schema_version,
      plan_hash,expected_count,result_hash,applied_at) values('space','repair-audit',
      'canonical_profile_empty_answer_v1',1,repeat('a',64),1,repeat('b',64),now()-interval '1 minute')`);
    await pool.query(`insert into event_ops_data_repair_items(workspace_id,repair_id,event_id,actor_id,participant_id,
      source_profile_version,target_profile_version,source_membership_version,target_membership_version,
      before_profile_hash,after_profile_hash,before_membership_hash,after_membership_hash,removed_paths)
      values('space','repair-audit','event-1','actor','participant-a',1,2,1,2,
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),array['registrationProfile.answers.industry'])`);
    await pool.query(`insert into event_reception_numbers(workspace_id,event_id,actor_id,sequence,reception_no,assigned_at)
      values('space','event-1','actor',1,'001',now())`);
    await pool.query(`insert into event_reception_numbers(workspace_id,event_id,actor_id,sequence,reception_no,assigned_at)
      values('space','event-1','other',2,'002',now())`);
    const { purgeAccountEvents } = await import("../../features/account/data-rights/purge/events");
    const first = await purgeAccountEvents(db, "space", "actor");
    assert.ok(first.deleted > 0);
    assert.equal(first.retainedPseudonymizedAuditRows, 2);
    assert.equal((await pool.query(`select count(*)::int as n from event_ops_membership_heads where workspace_id='space' and actor_id='other'`)).rows[0]?.n, 1);
    const redacted = await pool.query<{ actor_id: string; profile_payload: unknown }>(`select h.actor_id,v.profile_payload
      from event_ops_membership_heads h join event_ops_profile_versions v on v.workspace_id=h.workspace_id
      and v.event_id=h.event_id and v.participant_id=h.participant_id and v.profile_version=h.profile_version
      where h.workspace_id='space' and h.participant_id='participant-a'`);
    assert.match(redacted.rows[0]?.actor_id ?? "", /^deleted-event:/);
    assert.deepEqual(redacted.rows[0]?.profile_payload, {});
    const publication = (await pool.query<{ published_dto: unknown }>(`select p.published_dto from event_ops_publication_heads h
      join event_ops_publications p on p.workspace_id=h.workspace_id and p.publication_id=h.publication_id
      where h.workspace_id='space' and h.event_id='event-1'`)).rows[0]?.published_dto;
    assert.ok(!JSON.stringify(publication).includes("Private Person"));
    assert.equal((publication as { directory: unknown[] }).directory.length, 1);
    assert.equal((await pool.query(`select count(*)::int as n from event_ops_publications where publication_id='pub-1'`)).rows[0]?.n, 0);
    assert.deepEqual((await pool.query(`select n.participant_id from event_ops_graph_nodes n
      join event_ops_publication_heads h on h.workspace_id=n.workspace_id and h.publication_id=n.publication_id
      where h.workspace_id='space' and h.event_id='event-1'`)).rows, [{ participant_id: "participant-b" }]);
    assert.deepEqual((await pool.query(`select participant_payload from event_ops_generation_participants
      where workspace_id='space' and participant_id='participant-a'`)).rows[0]?.participant_payload, {});
    assert.equal((await pool.query(`select count(*)::int as n from event_ops_membership_versions where workspace_id='space' and actor_id='actor'`)).rows[0]?.n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from event_reception_numbers where workspace_id='space' and actor_id='actor'`)).rows[0]?.n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from event_reception_numbers where workspace_id='space' and actor_id='other'`)).rows[0]?.n, 1);
    assert.equal((await purgeAccountEvents(db, "space", "actor")).deleted, 0);
    await pool.query(`insert into event_ops_events(workspace_id,event_id,organizer_actor_id,created_at,updated_at)
      values('space','host-empty','actor',now(),now())`);
    await pool.query(`insert into event_ops_configurations(workspace_id,event_id,configuration_version,check_in_opens_at,
      event_starts_at,event_ends_at,profile_edit_deadline_at,registration_cutoff_at,results_available_at,
      round_one_starts_at,round_two_starts_at,recommendation_count,table_size,shard_size,max_attempts_per_task,created_at,updated_at)
      values('space','host-empty',1,now(),now()+interval '1 day',now()+interval '3 days',
        now()+interval '12 hours',now()+interval '1 day',now()+interval '36 hours',
        now()+interval '2 days',now()+interval '60 hours',1,2,1,1,now(),now())`);
    await pool.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
      configuration_version,snapshot_hash,status,expected_task_count,ai_request_fingerprint,created_at,updated_at)
      values('space','gen-empty','host-empty','actor','key-empty',1,'snapshot','published',1,'fingerprint',now(),now())`);
    await pool.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,dto_hash,
      published_dto,published_by_actor_id,published_at) values('space','pub-empty','host-empty','gen-empty','snapshot','hash','{}'::jsonb,'actor',now())`);
    await pool.query(`insert into event_ops_graph_nodes(workspace_id,publication_id,participant_id,node_payload)
      values('space','pub-empty','host-participant','{}'::jsonb)`);
    await pool.query(`insert into event_aliases(workspace_id,event_id,normalized_alias,alias_value,alias_type,source_payload,created_at)
      values('space','host-empty','host-alias','host-alias','public_slug','{}'::jsonb,now())`);
    assert.ok((await purgeAccountEvents(db, "space", "actor")).deleted >= 4);
    assert.equal((await pool.query(`select count(*)::int as n from event_ops_events where workspace_id='space' and event_id='host-empty'`)).rows[0]?.n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from event_ops_events where workspace_id='space' and event_id='event-1'`)).rows[0]?.n, 1);
    await pool.query(`insert into event_ops_event_role_assignment_versions(workspace_id,event_id,subject_actor_id,
      assignment_version,role,state,assigned_by_actor_id,reason) values('space','event-1','actor',1,'reviewer','revoked','host','Private Person')`);
    await assert.rejects(purgeAccountEvents(db, "space", "actor"), /EVENT_OPS_PII_LEDGER/);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
