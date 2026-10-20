import { createHash } from "node:crypto";

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";
import { acquireSyncCommitOrderLock } from "../../../../features/sync/commit-order-lock";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";

const PERSONAL_COLLECTIONS = ["attendees", "eventParticipantIntents", "eventPreferences",
  "eventAfterConfirmations", "eventHostAnswers", "organizerFollows"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const placeholder = (eventId: string, actorId: string) => `deleted-event:${hash(`${eventId}\0${actorId}`).slice(0, 24)}`;
const emptyHash = hash("{}");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function remove(sql: TransactionalSqlExecutor, statement: string, values: unknown[]): Promise<number> {
  const result = await sql.query<{ count: string }>(`with removed as (${statement} returning 1) select count(*)::text as count from removed`, values);
  return Number(result.rows[0]?.count ?? 0);
}

function withoutParticipant(dto: Record<string, unknown>, participantId: string, actorId: string): Record<string, unknown> {
  const excludes = (value: unknown) => value && typeof value === "object" &&
    ((value as Record<string, unknown>).participantId === participantId || (value as Record<string, unknown>).actorId === actorId);
  const directory = Array.isArray(dto.directory) ? dto.directory.filter(value => !excludes(value)) : [];
  const recommendations = Array.isArray(dto.recommendations) ? dto.recommendations
    .filter(value => (value as Record<string, unknown>).sourceParticipantId !== participantId)
    .map(value => ({ ...value as Record<string, unknown>, recommendations: Array.isArray((value as Record<string, unknown>).recommendations)
      ? ((value as Record<string, unknown>).recommendations as unknown[])
        .filter(item => (item as Record<string, unknown>).targetParticipantId !== participantId)
        .map(item => ({ ...item as Record<string, unknown>, reasons: [""], icebreakers: ["", ""], memberHint: "" })) : [] })) : [];
  const graph = dto.graph && typeof dto.graph === "object" ? dto.graph as Record<string, unknown> : {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter(value => !excludes(value)) : [];
  const edges = Array.isArray(graph.edges) ? graph.edges.filter(value => {
    const edge = value as Record<string, unknown>;
    return edge.fromParticipantId !== participantId && edge.toParticipantId !== participantId;
  }).map(value => ({ ...value as Record<string, unknown>, label: "" })) : [];
  const grouping = dto.grouping && typeof dto.grouping === "object" ? dto.grouping as Record<string, unknown> : {};
  const redactTables = (value: unknown) => Array.isArray(value) ? value.map(table => {
    const row = table as Record<string, unknown>;
    return { ...row, members: Array.isArray(row.members) ? row.members.filter(member => (member as Record<string, unknown>).participantId !== participantId) : [],
      theme: "", rationale: "", icebreakers: ["", "", ""], memberPrompts: {}, memberRationales: {} };
  }) : [];
  return { ...dto, directory, recommendations, graph: { ...graph, nodes, edges },
    grouping: { ...grouping, roundOne: redactTables(grouping.roundOne), roundTwo: redactTables(grouping.roundTwo) } };
}

function scrubSharedEventPayload(value: unknown, actorId: string, deletedId: string): unknown {
  if (Array.isArray(value)) return value
    .filter(item => !(item && typeof item === "object" && !Array.isArray(item) &&
      ["actorId", "accountId", "userId"].some(key => (item as Record<string, unknown>)[key] === actorId)))
    .map(item => scrubSharedEventPayload(item, actorId, deletedId));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, scrubSharedEventPayload(item, actorId, deletedId)]));
  return value === actorId ? deletedId : value;
}

/** 主会话代定 §R18c-1: keep the event and other participants, redact the departing member. */
async function redactCanonicalParticipant(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, eventId: string, participantId: string): Promise<number> {
  const scope = [workspaceId, eventId, actorId];
  const deletedId = placeholder(eventId, actorId);
  let changed = 0;
  // Pending delivery and accepted contact pairs can contain the departing person's PII.
  changed += await remove(sql, `delete from event_ops_outbox where workspace_id=$1 and event_id=$2 and
    (payload::text like '%' || to_jsonb($3::text)::text || '%' or aggregate_id=$3)`, scope);
  changed += await remove(sql, `delete from event_ops_relationship_pairs where workspace_id=$1 and event_id=$2 and request_id in
    (select request_id from event_ops_contact_requests where workspace_id=$1 and event_id=$2 and
      (requester_actor_id=$3 or target_actor_id=$3))`, scope);
  changed += await remove(sql, `delete from event_ops_contact_requests where workspace_id=$1 and event_id=$2 and
    (requester_actor_id=$3 or target_actor_id=$3)`, scope);
  changed += await remove(sql, `delete from event_ops_checkins where workspace_id=$1 and event_id=$2 and actor_id=$3`, scope);
  changed += await remove(sql, `delete from event_ops_walk_ins where workspace_id=$1 and event_id=$2 and actor_id=$3`, scope);
  changed += await remove(sql, `delete from event_reception_numbers where workspace_id=$1 and event_id=$2 and actor_id=$3`, scope);
  changed += await remove(sql, `delete from event_kiosk_heartbeats where workspace_id=$1 and event_id=$2 and actor_id=$3`, scope);
  changed += await remove(sql, `delete from event_cohost_invites where workspace_id=$1 and event_id=$2 and
    (invited_actor_id=$3 or used_by=$3)`, scope);
  const invites = await sql.query<{ invite_id: string }>(`update event_cohost_invites set invited_by=$4
    where workspace_id=$1 and event_id=$2 and invited_by=$3 returning invite_id`, [workspaceId, eventId, actorId, deletedId]);
  changed += invites.rows.length;
  const undos = await sql.query<{ undo_id: string }>(`update event_ops_checkin_undos set
    actor_id=case when actor_id=$3 then $4 else actor_id end,
    undone_by=case when undone_by=$3 then $4 else undone_by end,
    evidence_id=case when actor_id=$3 then 'deleted' else evidence_id end
    where workspace_id=$1 and event_id=$2 and (actor_id=$3 or undone_by=$3) returning undo_id`,
  [workspaceId, eventId, actorId, deletedId]);
  changed += undos.rows.length;
  changed += await remove(sql, `delete from event_ops_recommendations where workspace_id=$1 and generation_id in
    (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2) and
    (source_participant_id=$3 or target_participant_id=$3)`, [workspaceId, eventId, participantId]);
  changed += await remove(sql, `delete from event_ops_recommendation_results where workspace_id=$1 and generation_id in
    (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2) and source_participant_id=$3`, [workspaceId, eventId, participantId]);
  changed += await remove(sql, `delete from event_ops_seats where workspace_id=$1 and generation_id in
    (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2) and participant_id=$3`, [workspaceId, eventId, participantId]);
  changed += await remove(sql, `delete from event_ops_candidates where workspace_id=$1 and generation_id in
    (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2) and
    (source_participant_id=$3 or target_participant_id=$3)`, [workspaceId, eventId, participantId]);
  changed += await remove(sql, `delete from event_ops_graph_nodes where workspace_id=$1 and participant_id=$3 and publication_id in
    (select publication_id from event_ops_publications where workspace_id=$1 and event_id=$2)`, [workspaceId, eventId, participantId]);
  // Frozen AI text may mention a participant even in another attendee's row.
  const generations = `(select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2)`;
  const seats = await sql.query<{ participant_id: string }>(`update event_ops_seats set member_prompts='["",""]'::jsonb
    where workspace_id=$1 and generation_id in ${generations} returning participant_id`, [workspaceId, eventId]);
  changed += seats.rows.length;
  const tables = await sql.query<{ table_number: number }>(`update event_ops_tables set theme='',rationale='',icebreakers='["","",""]'::jsonb
    where workspace_id=$1 and generation_id in ${generations} returning table_number`, [workspaceId, eventId]);
  changed += tables.rows.length;
  const remainingRecommendations = await sql.query<{ source_participant_id: string }>(`update event_ops_recommendations
    set reasons='[""]'::jsonb,icebreakers='["",""]'::jsonb,member_hint=''
    where workspace_id=$1 and generation_id in ${generations} returning source_participant_id`, [workspaceId, eventId]);
  changed += remainingRecommendations.rows.length;
  const artifacts = await sql.query<{ artifact_id: string }>(`update event_ops_ai_artifacts
    set validated_payload='{}'::jsonb,evidence_metadata='{}'::jsonb
    where workspace_id=$1 and generation_id in ${generations} returning artifact_id`, [workspaceId, eventId]);
  changed += artifacts.rows.length;
  const tasks = await sql.query<{ task_id: string }>(`update event_ops_tasks
    set participant_ids=array_remove(participant_ids,$3::text),output_payload=null,output_hash=null
    where workspace_id=$1 and generation_id in ${generations} returning task_id`, [workspaceId, eventId, participantId]);
  changed += tasks.rows.length;
  const graphEdges = await sql.query<{ edge_id: string }>(`update event_ops_graph_edges set label='',edge_payload='{}'::jsonb
    where workspace_id=$1 and publication_id in
      (select publication_id from event_ops_publications where workspace_id=$1 and event_id=$2) returning edge_id`, [workspaceId, eventId]);
  changed += graphEdges.rows.length;

  const publications = await sql.query<{ publication_id: string; published_dto: Record<string, unknown> | string }>(`select publication_id,published_dto
    from event_ops_publications where workspace_id=$1 and event_id=$2 for update`, [workspaceId, eventId]);
  for (const publication of publications.rows) {
    const current = typeof publication.published_dto === "string" ? JSON.parse(publication.published_dto) as Record<string, unknown> : publication.published_dto;
    const next = withoutParticipant(current, participantId, actorId);
    const saved = await sql.query<{ publication_id: string }>(`update event_ops_publications set published_dto=$3::jsonb,dto_hash=$4,
      published_by_actor_id=case when published_by_actor_id=$5 then $6 else published_by_actor_id end
      where workspace_id=$1 and publication_id=$2 and published_dto=$7::jsonb returning publication_id`,
    [workspaceId, publication.publication_id, JSON.stringify(next), hash(JSON.stringify(next)), actorId, deletedId, JSON.stringify(current)]);
    if (saved.rows.length !== 1) throw new Error("EVENT_PUBLICATION_CAS_CONFLICT");
    changed += 1;
  }
  const generation = await sql.query<{ participant_id: string }>(`update event_ops_generation_participants
    set actor_id=$4,participant_payload='{}'::jsonb where workspace_id=$1 and actor_id=$3 and generation_id in
    (select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2) returning participant_id`,
  [workspaceId, eventId, actorId, deletedId]);
  changed += generation.rows.length;
  const head = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_membership_heads
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning to_jsonb(event_ops_membership_heads) as data`, scope);
  changed += head.rows.length;
  const versions = await sql.query<{ actor_id: string }>(`update event_ops_membership_versions set actor_id=$4,
    status='cancelled',cancelled_at=coalesce(cancelled_at,now()),source_registration_id='deleted',
    origin='legacy_registration',admission_application_version=null
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning actor_id`, [workspaceId, eventId, actorId, deletedId]);
  changed += versions.rows.length;
  for (const row of head.rows) {
    const data = { ...row.data, actor_id: deletedId, status: "cancelled", revision: Number(row.data.revision) + 1, updated_at: new Date().toISOString() };
    await sql.query(`insert into event_ops_membership_heads select (jsonb_populate_record(null::event_ops_membership_heads,$1::jsonb)).*`, [JSON.stringify(data)]);
  }
  const appHeads = await sql.query<{ data: Record<string, unknown> }>(`delete from event_ops_admission_application_heads
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning to_jsonb(event_ops_admission_application_heads) as data`, scope);
  const apps = await sql.query<{ actor_id: string }>(`update event_ops_admission_application_versions
    set actor_id=$4,profile_payload='{}'::jsonb,decision_actor_id=case when decision_actor_id=$3 then $4 else decision_actor_id end
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning actor_id`, [workspaceId, eventId, actorId, deletedId]);
  changed += appHeads.rows.length + apps.rows.length;
  for (const row of appHeads.rows) {
    const data = { ...row.data, actor_id: deletedId, profile_payload: {}, decision_actor_id: row.data.decision_actor_id === actorId ? deletedId : row.data.decision_actor_id };
    await sql.query(`insert into event_ops_admission_application_heads select (jsonb_populate_record(null::event_ops_admission_application_heads,$1::jsonb)).*`, [JSON.stringify(data)]);
  }
  const profiles = await sql.query<{ participant_id: string }>(`update event_ops_profile_versions
    set actor_id=$4,profile_payload='{}'::jsonb,profile_hash=$5,source_registration_id='deleted'
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning participant_id`, [workspaceId, eventId, actorId, deletedId, emptyHash]);
  changed += profiles.rows.length;
  const profileHeads = await sql.query<{ participant_id: string }>(`update event_ops_profile_heads set actor_id=$4,revision=revision+1,updated_at=now()
    where workspace_id=$1 and event_id=$2 and actor_id=$3 returning participant_id`, [workspaceId, eventId, actorId, deletedId]);
  changed += profileHeads.rows.length;
  const answers = await sql.query<{ response_id: string }>(`update event_ops_profile_response_versions set response_payload='{}'::jsonb
    where workspace_id=$1 and event_id=$2 and participant_id=$3 returning response_id`, [workspaceId, eventId, participantId]);
  changed += answers.rows.length;
  const audits = await sql.query<{ audit_id: string }>(`update event_ops_audit_log set
    actor_id=case when actor_id=$3 then $4 else actor_id end,
    before_payload=null,after_payload=null,evidence_ids='{}'::text[]
    where workspace_id=$1 and event_id=$2 and (actor_id=$3 or
      jsonb_path_exists(coalesce(before_payload,'{}'::jsonb),'$.** ? (@ == $actor)',jsonb_build_object('actor',$3::text)) or
      jsonb_path_exists(coalesce(after_payload,'{}'::jsonb),'$.** ? (@ == $actor)',jsonb_build_object('actor',$3::text))) returning audit_id`,
  [workspaceId, eventId, actorId, deletedId]);
  changed += audits.rows.length;
  const hasExperiences = await sql.query<{ present: string | null }>(`select to_regclass('event_ops_experience_versions')::text as present`);
  if (hasExperiences.rows[0]?.present) {
    const experiences = await sql.query<{ experience_version: string }>(`update event_ops_experience_versions set created_by_actor_id=$4
      where workspace_id=$1 and event_id=$2 and created_by_actor_id=$3 returning experience_version`,
    [workspaceId, eventId, actorId, deletedId]);
    changed += experiences.rows.length;
  }
  const publicationsBy = await sql.query<{ publication_id: string }>(`update event_ops_publications set published_by_actor_id=$4
    where workspace_id=$1 and event_id=$2 and published_by_actor_id=$3 returning publication_id`,
  [workspaceId, eventId, actorId, deletedId]);
  changed += publicationsBy.rows.length;
  const decisions = await sql.query<{ application_version: string }>(`update event_ops_admission_application_versions
    set decision_actor_id=$4 where workspace_id=$1 and event_id=$2 and decision_actor_id=$3 returning application_version`,
  [workspaceId, eventId, actorId, deletedId]);
  changed += decisions.rows.length;
  return changed;
}

async function removeHostedCanonicalEvent(sql: TransactionalSqlExecutor, workspaceId: string, eventId: string, actorId: string): Promise<number> {
  const values = [workspaceId, eventId];
  const generations = `(select generation_id from event_ops_generations where workspace_id=$1 and event_id=$2)`;
  let deleted = 0;
  deleted += await remove(sql, `delete from event_ops_publication_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_recommendations where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_recommendation_results where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_seats where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_candidates where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_tables where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_ai_artifacts where workspace_id=$1 and generation_id in ${generations}`, values);
  deleted += await remove(sql, `delete from event_ops_publications where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_generations where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_relationship_pairs where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_contact_requests where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_checkins where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_membership_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_membership_versions where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_profile_response_versions where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_profile_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_profile_versions where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_admission_application_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_admission_application_versions where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_admission_policy_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_admission_policy_versions where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_configuration_heads where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_configurations where workspace_id=$1 and event_id=$2`, values);
  deleted += await remove(sql, `delete from event_ops_events where workspace_id=$1 and event_id=$2 and organizer_actor_id=$3`,
    [workspaceId, eventId, actorId]);
  return deleted;
}

/** Local-only event deletion. All steps share one transaction and leave other accounts intact. */
export async function purgeAccountEvents(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ deleted: number }> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(db);
  if (!workspaceId || !actorId) throw new Error("ACCOUNT_PURGE_SCOPE_REQUIRED");
  return db.transaction(async sql => {
    await acquireSyncCommitOrderLock(sql);
    let deleted = 0;
    const hostedCanonical = await sql.query<{ event_id: string }>(`select event_id from event_ops_events
      where workspace_id=$1 and organizer_actor_id=$2 for update`, [workspaceId, actorId]);
    for (const host of hostedCanonical.rows) {
      const others = await sql.query(`select 1 from event_ops_membership_heads where workspace_id=$1 and event_id=$2
        and actor_id<>$3 and status='rsvped' limit 1`, [workspaceId, host.event_id, actorId]);
      if (others.rows.length) throw new Error("HOST_EVENT_HAS_REGISTRATIONS");
      // An unregistered hosted event has no counterpart to preserve.
      deleted += await removeHostedCanonicalEvent(sql, workspaceId, host.event_id, actorId);
    }
    const canonical = await sql.query<{ event_id: string; participant_id: string }>(`select distinct event_id,participant_id from (
      select event_id,participant_id from event_ops_membership_heads where workspace_id=$1 and actor_id=$2
      union all select event_id,participant_id from event_ops_profile_heads where workspace_id=$1 and actor_id=$2
      union all select event_id,'' as participant_id from event_ops_admission_application_heads where workspace_id=$1 and actor_id=$2
    ) actor_participation order by event_id,participant_id`, [workspaceId, actorId]);
    for (const row of canonical.rows) deleted += await redactCanonicalParticipant(sql, workspaceId, actorId, row.event_id, row.participant_id);
    const tables = await sql.query<{ table_name: string }>(`select distinct table_name from information_schema.columns
      where table_schema=current_schema() and table_name like 'event_%' and column_name='workspace_id' order by table_name`);
    for (const table of tables.rows) {
      const found = await sql.query(`select 1 from ${quote(table.table_name)} t where workspace_id=$1 and
        jsonb_path_exists(to_jsonb(t),'$.** ? (@ == $actor)',jsonb_build_object('actor',$2::text)) limit 1`,
      [workspaceId, actorId]);
      if (found.rows.length) throw new Error(`EVENT_OPS_REDACTION_REQUIRED:${table.table_name}`);
    }
    const hosted = await sql.query<{ record_id: string }>(`select record_id from orbit_records where workspace_id=$1 and collection_name='events'
      and (user_id=$2 or payload->>'accountId'=$2) for update`, [workspaceId, actorId]);
    for (const host of hosted.rows) {
      const others = await sql.query(`select 1 from orbit_records where workspace_id=$1 and collection_name='event_registrations'
        and payload->'registration'->>'eventId'=$2 and user_id<>$3 and payload->'registration'->>'status'='rsvped' limit 1`,
      [workspaceId, host.record_id, actorId]);
      if (others.rows.length) throw new Error("HOST_EVENT_HAS_REGISTRATIONS");
      deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and collection_name='event_registrations'
        and payload->'registration'->>'eventId'=$2`, [workspaceId, host.record_id]);
      deleted += await remove(sql, `delete from orbit_records where workspace_id=$1 and collection_name='events' and record_id=$2`,
        [workspaceId, host.record_id]);
    }
    const shared = await sql.query<{ collection_name: string; record_id: string; payload: unknown }>(`select collection_name,record_id,payload from orbit_records where workspace_id=$1
      and (left(collection_name,5)='event' or collection_name in ('attendees','organizerFollows'))
      and user_id is distinct from $2 and position(to_jsonb($2::text)::text in payload::text)>0 for update`, [workspaceId, actorId]);
    for (const row of shared.rows) {
      const current = typeof row.payload === "string" ? JSON.parse(row.payload) as unknown : row.payload;
      const next = scrubSharedEventPayload(current, actorId, placeholder(row.record_id, actorId));
      const saved = await sql.query<{ record_id: string }>(`update orbit_records set payload=$4::jsonb,updated_at=now()
        where workspace_id=$1 and collection_name=$2 and record_id=$3 and payload=$5::jsonb returning record_id`,
      [workspaceId, row.collection_name, row.record_id, JSON.stringify(next), JSON.stringify(current)]);
      if (saved.rows.length !== 1) throw new Error("SHARED_EVENT_CAS_CONFLICT");
      deleted += 1;
    }
    deleted += await remove(sql, `delete from orbit_records where workspace_id=$1
      and ((collection_name='event_registrations' and (user_id=$2 or payload->'registration'->>'userId'=$2))
        or (collection_name=any($3::text[]) and user_id=$2))`, [workspaceId, actorId, PERSONAL_COLLECTIONS]);
    return { deleted };
  }, { isolation: "read committed" });
}
