/**
 * Controlled account merge (features/account/controlled-ops/account-merge): a party-app migrated account into the
 * account its owner registered anew. Local orbit_line_c_test (fully migrated), one fresh workspace per test.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { acquireSyncCommitOrderLock } from "../../features/sync/commit-order-lock";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();
const dbTest = { skip: local ? false : "requires local orbit_line_c_test (fully migrated)", timeout: 180_000 };
const HOST = "actor:merge-host";
const answers = (id: string) => ({ desiredOutcome: `Follow-ups for ${id}`, energyStyle: "Small groups", experienceHighlight: "Scaled a team",
  followUpPreference: "日本語", industry: "Software", positioning: `CFO @ ${id}`, targetAttendees: "Investors", valueOffered: "Intros" });

test("merge: dry run rolls back, refusals, apply moves the migrated account into the new one, rerun is a no-op", dbTest, async () => {
  const workspaceId = `merge-${randomUUID()}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  const previous = process.env.ORBIT_ACCOUNT_OPS;
  process.env.ORBIT_ACCOUNT_OPS = "build-only";
  const OLD = "user_old_merge";
  const NEW = "user_new_merge";
  const subspace = `${workspaceId}:actor:${encodeURIComponent(OLD)}`;
  try {
    const record = (collection: string, id: string, owner: string | null, payload: Record<string, unknown>, ws = workspaceId) =>
      pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at,search_text)
        values($1,$2,$3,$4,'test',$3,$5::jsonb,now(),now(),'')`, [ws, collection, id, owner, JSON.stringify(payload)]);
    const at = "2026-11-01T00:00:00.000Z";
    const account = async (id: string, email: string, auth: Record<string, unknown>, profile: Record<string, unknown>) => {
      await record("auth_users", `auth_user:${email}`, id, { id, email, displayName: id, provider: "credentials", passwordHash: "h", createdAt: at, updatedAt: at, ...auth });
      await record("accounts", id, id, { id });
      await record("profiles", `profile:${id}`, id, { id, accountId: id, ...profile });
    };
    await account(OLD, "old@example.test", { migratedFrom: "party-app:chinichi-2026", mustChangePassword: true },
      { displayName: "旧 名前", role: "CFO", handles: { email: "old@example.test", phone: "090" }, publicProfile: { bio: "old bio" } });
    await account(NEW, "new@example.test", {}, { displayName: "新 名前", handles: { email: "new@example.test" }, publicProfile: {} });
    await account("user_plain", "plain@example.test", {}, { displayName: "Plain" });
    await record("contacts", "contact:old-1", OLD, { displayName: "A contact", ownerActorId: OLD });
    await record("homeLayouts", `homeLayouts:${OLD}`, OLD, { layout: "old" });
    await record("homeLayouts", `homeLayouts:${NEW}`, NEW, { layout: "new" });
    await record("contact_actor_links", "link:other", "user_plain", { actorId: OLD, note: "points at the old account" });
    await record("orbit_agent_chat_sessions", "session:1", OLD, { title: "chat" }, subspace);

    // Event A: only the old account (admitted). Event B: both accounts applied (conflict).
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1,'prof',$2,$3,'Org')`, [workspaceId, HOST, `org-${randomUUID()}`]);
    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_m_${randomUUID().slice(0, 8)}_${++n}`, randomBytes: () => Uint8Array.from([n, 2, 3, 4, 5, 6, 7, 8]), workspaceId });
    const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
    const event = async () => {
      const draft = await lifecycle.create(HOST, { endsAt: "2100-01-02T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof", startsAt: "2100-01-02T10:00:00.000Z", title: `Merge ${n}` });
      await lifecycle.publish(HOST, draft.eventId, draft.version, { registrationClosesAt: "2100-01-01T00:00:00.000Z" });
      await admission.configurePolicy({ admissionMode: "approval_required", capacity: 10, eventId: draft.eventId, profileEditDeadlineAt: "2100-01-01T00:00:00.000Z",
        registrationClosesAt: "2100-01-01T00:00:00.000Z", registrationOpensAt: "2000-01-01T00:00:00.000Z", updatedByActorId: HOST, waitlistEnabled: true });
      return draft.eventId;
    };
    const eventA = await event();
    const eventB = await event();
    const applied = await admission.submitApplication({ actorId: OLD, eventId: eventA, profilePayload: { answers: answers(OLD), displayName: "旧 名前" } });
    await admission.decideApplication({ actorId: OLD, decision: "approve", decisionActorId: HOST, eventId: eventA, expectedApplicationVersion: applied.applicationVersion });
    for (const actor of [OLD, NEW]) await admission.submitApplication({ actorId: actor, eventId: eventB, profilePayload: { answers: answers(actor), displayName: actor } });
    await record("event_registrations", `registration:${eventA}:${OLD}`, HOST, { registration: { eventId: eventA, userId: OLD, status: "rsvped" } });
    // Event A also has published matching results naming the old account (directory, recommendations, graph).
    const plainApplied = await admission.submitApplication({ actorId: "user_plain", eventId: eventA, profilePayload: { answers: answers("user_plain"), displayName: "Plain" } });
    await admission.decideApplication({ actorId: "user_plain", decision: "approve", decisionActorId: HOST, eventId: eventA, expectedApplicationVersion: plainApplied.applicationVersion });
    const participantOf = async (actor: string) => (await pool.query<{ participant_id: string }>(`select participant_id from event_ops_membership_heads
      where workspace_id=$1 and event_id=$2 and actor_id=$3`, [workspaceId, eventA, actor])).rows[0]!.participant_id;
    const pOld = await participantOf(OLD);
    const pPlain = await participantOf("user_plain");
    // Seeding event tables that carry sync_revision needs the commit-order lock, like every product writer.
    const seed = await pool.connect();
    await seed.query("begin");
    await acquireSyncCommitOrderLock(seed as never);
    await seed.query(`insert into event_ops_configurations(workspace_id,event_id,configuration_version,check_in_opens_at,event_starts_at,event_ends_at,
      profile_edit_deadline_at,registration_cutoff_at,results_available_at,round_one_starts_at,round_two_starts_at,recommendation_count,table_size,
      shard_size,max_attempts_per_task,created_at,updated_at) values($1,$2,1,now(),now()+interval '1 day',now()+interval '3 days',now()+interval '12 hours',
      now()+interval '1 day',now()+interval '36 hours',now()+interval '2 days',now()+interval '60 hours',1,2,1,1,now(),now()) on conflict do nothing`, [workspaceId, eventA]);
    await seed.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,configuration_version,
      snapshot_hash,status,expected_task_count,ai_request_fingerprint,created_at,updated_at)
      values($1,'gen-a',$2,$3,'key-a',1,'snapshot','published',1,'fingerprint',now(),now())`, [workspaceId, eventA, HOST]);
    for (const [actor, participant, ordinal] of [[OLD, pOld, 0], ["user_plain", pPlain, 1]] as const) {
      await seed.query(`insert into event_ops_generation_participants(workspace_id,generation_id,participant_id,actor_id,profile_version,ordinal,participant_payload,membership_version)
        values($1,'gen-a',$2,$3,1,$4,$5::jsonb,1)`, [workspaceId, participant, actor, ordinal, JSON.stringify({ actorId: actor, displayName: actor })]);
    }
    const dto = { eventId: eventA,
      directory: [{ actorId: OLD, participantId: pOld, displayName: "旧 名前" }, { actorId: "user_plain", participantId: pPlain, displayName: "Plain" }],
      recommendations: [{ sourceParticipantId: pOld, recommendations: [{ targetParticipantId: pPlain, targetActorId: "user_plain", reasons: ["same industry"] }] },
        { sourceParticipantId: pPlain, recommendations: [{ targetParticipantId: pOld, targetActorId: OLD, reasons: ["investor fit"] }] }],
      graph: { nodes: [{ participantId: pOld, actorId: OLD }, { participantId: pPlain, actorId: "user_plain" }], edges: [{ fromParticipantId: pOld, toParticipantId: pPlain }] } };
    await seed.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,dto_hash,published_dto,published_by_actor_id,published_at)
      values($1,'pub-a',$2,'gen-a','snapshot','hash',$3::jsonb,$4,now())`, [workspaceId, eventA, JSON.stringify(dto), HOST]);
    await seed.query(`insert into event_ops_publication_heads(workspace_id,event_id,publication_id,generation_id,revision,updated_at) values($1,$2,'pub-a','gen-a',1,now())`, [workspaceId, eventA]);
    for (const [participant, actor] of [[pOld, OLD], [pPlain, "user_plain"]] as const) {
      await seed.query(`insert into event_ops_graph_nodes(workspace_id,publication_id,participant_id,node_payload) values($1,'pub-a',$2,$3::jsonb)`,
        [workspaceId, participant, JSON.stringify({ actorId: actor })]);
    }
    await seed.query(`insert into event_ops_graph_edges(workspace_id,publication_id,edge_id,from_participant_id,to_participant_id,edge_kind,label,edge_payload)
      values($1,'pub-a','edge-1',$2,$3,'recommendation','same industry',$4::jsonb)`, [workspaceId, pOld, pPlain, JSON.stringify({ sourceActorId: OLD })]);
    await seed.query("commit");
    seed.release();
    const published = async () => {
      const head = (await pool.query<{ publication_id: string; generation_id: string }>(`select publication_id,generation_id from event_ops_publication_heads
        where workspace_id=$1 and event_id=$2`, [workspaceId, eventA])).rows[0]!;
      const pub = (await pool.query<{ published_dto: Record<string, unknown> }>(`select published_dto from event_ops_publications where workspace_id=$1 and publication_id=$2`,
        [workspaceId, head.publication_id])).rows[0]!;
      const nodes = (await pool.query<{ participant_id: string; node_payload: Record<string, unknown> }>(`select participant_id,node_payload from event_ops_graph_nodes
        where workspace_id=$1 and publication_id=$2 order by participant_id`, [workspaceId, head.publication_id])).rows;
      const edges = (await pool.query<{ edge_id: string; label: string; edge_payload: Record<string, unknown> }>(`select edge_id,label,edge_payload from event_ops_graph_edges
        where workspace_id=$1 and publication_id=$2`, [workspaceId, head.publication_id])).rows;
      return { head, dto: pub.published_dto, nodes, edges };
    };
    const publicationCount = async () => Number((await pool.query(`select count(*)::int as n from event_ops_publications where workspace_id=$1 and event_id=$2`, [workspaceId, eventA])).rows[0].n);

    const heads = async (table: string, eventId: string) => (await pool.query<{ actor_id: string; status: string }>(
      `select actor_id,status from ${table} where workspace_id=$1 and event_id=$2 order by actor_id`, [workspaceId, eventId])).rows;
    const auth = async (email: string) => (await pool.query(`select lifecycle_state,payload from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, `auth_user:${email}`])).rows[0];
    const { runControlledAccountMerge } = await import("../../features/account/controlled-ops/account-merge");

    await assert.rejects(runControlledAccountMerge({ db, workspaceId, from: "plain@example.test", to: NEW }), /MERGE_SOURCE_NOT_MIGRATED/u);
    await assert.rejects(runControlledAccountMerge({ db, workspaceId, from: OLD, to: "old@example.test" }), /MERGE_SAME_ACCOUNT/u);

    const dry = await runControlledAccountMerge({ db, workspaceId, from: "old@example.test", to: NEW });
    assert.equal(dry.kind, "dry-run");
    assert.deepEqual(dry.conflicts?.events, [eventB]);
    assert.equal(dry.moved?.records.contacts, 1);
    assert.equal(dry.conflicts?.singletonRecords.homeLayouts, 1);
    assert.equal(dry.notMerged?.aiSessions, 1);
    assert.equal(JSON.stringify(dry).includes("old@example.test"), false);
    assert.equal(dry.moved?.republishedResults, 1);
    assert.equal((await published()).head.publication_id, "pub-a");
    assert.equal(await publicationCount(), 1);
    // Nothing was written.
    assert.equal((await auth("old@example.test")).lifecycle_state, "active");
    assert.deepEqual((await heads("event_ops_membership_heads", eventA)).map((row) => row.actor_id), [OLD, "user_plain"]);
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='account_merges'`, [workspaceId])).rows[0].n), 0);

    const merged = await runControlledAccountMerge({ db, workspaceId, from: "old@example.test", to: "new@example.test", apply: true });
    assert.equal(merged.kind, "merged");
    assert.equal(merged.remainingOnOld?.records.contacts, undefined);
    assert.deepEqual(merged.keptAsHistory, { event_ops_audit_log: 3 });
    assert.equal(merged.moved?.tables.event_reception_numbers, 1);
    // Event A moved, event B conflict kept as is.
    assert.deepEqual(await heads("event_ops_membership_heads", eventA), [{ actor_id: NEW, status: "rsvped" }, { actor_id: "user_plain", status: "rsvped" }]);
    assert.deepEqual((await heads("event_ops_admission_application_heads", eventA)).map((row) => row.actor_id), [NEW, "user_plain"]);
    assert.deepEqual((await heads("event_ops_admission_application_heads", eventB)).map((row) => row.actor_id).sort(), [NEW, OLD].sort());
    assert.equal(Number((await pool.query(`select count(*)::int as n from event_ops_profile_versions where workspace_id=$1 and event_id=$2 and actor_id=$3`, [workspaceId, eventA, OLD])).rows[0].n), 0);
    // Records: moved, singleton conflict stays, references rewritten.
    const owner = async (collection: string, id: string) => (await pool.query(`select user_id,payload from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3`, [workspaceId, collection, id])).rows[0];
    assert.equal((await owner("contacts", "contact:old-1")).user_id, NEW);
    assert.equal((await owner("contacts", "contact:old-1")).payload.ownerActorId, NEW);
    assert.equal((await owner("homeLayouts", `homeLayouts:${OLD}`)).user_id, OLD);
    assert.equal((await owner("homeLayouts", `homeLayouts:${NEW}`)).payload.layout, "new");
    assert.equal((await owner("contact_actor_links", "link:other")).payload.actorId, NEW);
    assert.equal((await owner("event_registrations", `registration:${eventA}:${OLD}`)).payload.registration.userId, NEW);
    // Profile: new wins, blanks filled.
    const profile = (await owner("profiles", `profile:${NEW}`)).payload;
    assert.equal(profile.displayName, "新 名前");
    assert.equal(profile.role, "CFO");
    assert.deepEqual(profile.handles, { email: "new@example.test", phone: "090" });
    assert.equal(profile.publicProfile.bio, "old bio");
    // Old account archived and traceable; new account untouched sign-in.
    const oldAuth = await auth("old@example.test");
    assert.equal(oldAuth.lifecycle_state, "archived");
    assert.equal(oldAuth.payload.mergedInto, NEW);
    assert.equal((await auth("new@example.test")).lifecycle_state, "active");
    const trace = (await pool.query(`select payload from orbit_records where workspace_id=$1 and collection_name='account_merges'`, [workspaceId])).rows;
    assert.equal(trace.length, 1);
    assert.equal(trace[0].payload.toUserId, NEW);
    // AI sessions stay where they were.
    assert.equal(Number((await pool.query(`select count(*)::int as n from orbit_records where workspace_id=$1`, [subspace])).rows[0].n), 1);
    // The other account is untouched.
    assert.equal((await auth("plain@example.test")).lifecycle_state, "active");

    // Published matching results: a new snapshot names the new account; content is otherwise identical.
    assert.equal(merged.moved?.republishedResults, 1);
    const after = await published();
    assert.notEqual(after.head.publication_id, "pub-a");
    const swap = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll(JSON.stringify(OLD), JSON.stringify(NEW)));
    assert.deepEqual(after.dto, swap(dto));
    // No value is the old account id any more (participant ids are opaque and stay as they are).
    assert.equal(JSON.stringify(after.dto).includes(JSON.stringify(OLD)), false);
    assert.deepEqual(after.nodes.map((node) => [node.participant_id, node.node_payload.actorId]).sort(), [[pOld, NEW], [pPlain, "user_plain"]].sort());
    assert.deepEqual(after.edges.map((edge) => [edge.edge_id, edge.label, edge.edge_payload.sourceActorId]), [["edge-1", "same industry", NEW]]);
    // The new account's membership is the same participant, so it sees the same directory entry and recommendations.
    assert.equal(await participantOf(NEW), pOld);
    const mine = (after.dto.directory as { actorId: string; participantId: string }[]).find((entry) => entry.actorId === NEW);
    assert.equal(mine?.participantId, pOld);
    assert.equal((after.dto.recommendations as { sourceParticipantId: string }[]).some((entry) => entry.sourceParticipantId === pOld), true);
    // The old snapshot stays as immutable history, no longer the head.
    assert.equal(await publicationCount(), 2);
    assert.equal(Number((await pool.query(`select count(*)::int as n from event_ops_generations where workspace_id=$1 and generation_id='gen-a' and status='superseded'`, [workspaceId])).rows[0].n), 1);

    const again = await runControlledAccountMerge({ db, workspaceId, from: OLD, to: NEW, apply: true });
    assert.equal(again.kind, "already-merged");
    assert.equal(await publicationCount(), 2);
    assert.equal((await published()).head.publication_id, after.head.publication_id);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_ACCOUNT_OPS; else process.env.ORBIT_ACCOUNT_OPS = previous;
    const tables = await pool.query<{ table_name: string }>(`select c.table_name from information_schema.columns c join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='workspace_id'`);
    for (let pass = 0; pass < 4; pass += 1) {
      for (const { table_name } of tables.rows) await pool.query(`delete from "${table_name}" where workspace_id = any($1::text[])`, [[workspaceId, subspace]]).catch(() => undefined);
    }
    await pool.end();
  }
});
