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

  const publications = await sql.query<{ publication_id: string; generation_id: string; published_dto: Record<string, unknown> | string }>(`select publication_id,generation_id,published_dto
    from event_ops_publications where workspace_id=$1 and event_id=$2 for update`, [workspaceId, eventId]);
  for (const publication of publications.rows) {
    const current = typeof publication.published_dto === "string" ? JSON.parse(publication.published_dto) as Record<string, unknown> : publication.published_dto;
    if (!JSON.stringify(current).includes(JSON.stringify(actorId)) && !JSON.stringify(current).includes(JSON.stringify(participantId))) continue;
    const next = withoutParticipant(current, participantId, actorId);
    if (JSON.stringify(next).includes(JSON.stringify(actorId)) || JSON.stringify(next).includes(JSON.stringify(participantId))) {
      throw new Error("EVENT_PUBLICATION_PII_REQUIRES_MIGRATION");
    }
    // 主会话代定 §R18c-7: publish a new immutable snapshot, advance the
    // revisioned head, then use the existing superseded-publication cleanup.
    const head = await sql.query<{ publication_id: string }>(`select publication_id from event_ops_publication_heads
      where workspace_id=$1 and event_id=$2 for update`, [workspaceId, eventId]);
    if (head.rows[0]?.publication_id === publication.publication_id) {
      const generationId = `deletion-gen:${hash(`${publication.publication_id}\0${actorId}`).slice(0, 24)}`;
      const publicationId = `deletion-pub:${hash(`${publication.publication_id}\0${actorId}`).slice(0, 24)}`;
      const idempotencyKey = `deletion:${hash(`${publication.publication_id}\0${actorId}`).slice(0, 24)}`;
      await sql.query(`update event_ops_generations set status='superseded',revision=revision+1,updated_at=now()
        where workspace_id=$1 and generation_id=$2 and status='published'`, [workspaceId, publication.generation_id]);
      await sql.query(`insert into event_ops_generations(workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
        configuration_version,snapshot_hash,status,expected_task_count,completed_at,published_at,revision,created_at,updated_at,ai_request_fingerprint)
        select workspace_id,$3,event_id,organizer_actor_id,$4,configuration_version,snapshot_hash,'published',
          expected_task_count,completed_at,now(),1,now(),now(),ai_request_fingerprint from event_ops_generations
        where workspace_id=$1 and generation_id=$2`, [workspaceId, publication.generation_id, generationId, idempotencyKey]);
      await sql.query(`insert into event_ops_publications(workspace_id,publication_id,event_id,generation_id,snapshot_hash,
        dto_hash,published_dto,published_by_actor_id,published_at)
        select workspace_id,$3,event_id,$4,snapshot_hash,$5,$6::jsonb,
          case when published_by_actor_id=$7 then $8 else published_by_actor_id end,now()
        from event_ops_publications where workspace_id=$1 and publication_id=$2`,
      [workspaceId, publication.publication_id, publicationId, generationId, hash(JSON.stringify(next)), JSON.stringify(next), actorId, deletedId]);
      const nodes = await sql.query<{ participant_id: string }>(`insert into event_ops_graph_nodes
        (workspace_id,publication_id,participant_id,node_payload)
        select workspace_id,$3,participant_id,node_payload from event_ops_graph_nodes
        where workspace_id=$1 and publication_id=$2 returning participant_id`,
      [workspaceId, publication.publication_id, publicationId]);
      changed += nodes.rows.length;
      const edges = await sql.query<{ edge_id: string }>(`insert into event_ops_graph_edges
        (workspace_id,publication_id,edge_id,from_participant_id,to_participant_id,edge_kind,label,edge_payload)
        select workspace_id,$3,edge_id,from_participant_id,to_participant_id,edge_kind,label,edge_payload
        from event_ops_graph_edges where workspace_id=$1 and publication_id=$2 returning edge_id`,
      [workspaceId, publication.publication_id, publicationId]);
      changed += edges.rows.length;
      await sql.query(`update event_ops_publication_heads set publication_id=$3,generation_id=$4,
        revision=revision+1,updated_at=now() where workspace_id=$1 and event_id=$2 and publication_id=$5`,
      [workspaceId, eventId, publicationId, generationId, publication.publication_id]);
      changed += 1;
    }
    changed += await remove(sql, `delete from event_ops_publications where workspace_id=$1 and publication_id=$2`,
      [workspaceId, publication.publication_id]);
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
export async function purgeAccountEvents(db: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{
  deleted: number; retainedPseudonymizedAuditRows: number;
}> {
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
    // LF18: the account's own event assessments (with poster images) and organizer requests are deleted; a notice the
    // account sent keeps an opaque sender. Before the scan below, which stops on any remaining actor id.
    for (const { table, column } of [
      { table: "event_assessment_posters", column: "actor_id" }, { table: "event_assessments", column: "actor_id" },
      { table: "event_host_roster_match_requests", column: "actor_id" }, { table: "event_host_notice_outbox", column: "actor_id" },
    ]) {
      if ((await sql.query<{ found: string | null }>("select to_regclass($1)::text as found", [table])).rows[0]?.found) {
        const removed = await sql.query<{ count: string }>(`with gone as (delete from ${quote(table)} where workspace_id=$1 and ${quote(column)}=$2 returning 1) select count(*)::text as count from gone`, [workspaceId, actorId]);
        deleted += Number(removed.rows[0]?.count ?? 0);
      }
    }
    if ((await sql.query<{ found: string | null }>("select to_regclass('event_host_notice_sends')::text as found")).rows[0]?.found) {
      await sql.query("update event_host_notice_sends set sent_by='deleted-account' where workspace_id=$1 and sent_by=$2", [workspaceId, actorId]);
    }
    const tables = await sql.query<{ table_name: string }>(`select distinct table_name from information_schema.columns
      where table_schema=current_schema() and table_name like 'event_%' and column_name='workspace_id' order by table_name`);
    let retainedPseudonymizedAuditRows = 0;
    // 主会话代定 §R18c-6/7: these immutable rows may keep an opaque actor ID
    // after identity deletion. Free text in a role assignment still fails closed.
    const opaqueColumns: Record<string, string[]> = {
      event_ops_event_role_assignment_versions: ["subject_actor_id", "assigned_by_actor_id"],
      event_ops_event_role_assignment_heads: ["subject_actor_id"],
      event_ops_data_repair_items: ["actor_id"],
      event_ops_publications: ["published_by_actor_id"],
    };
    for (const table of tables.rows) {
      const allowed = opaqueColumns[table.table_name] ?? [];
      if (allowed.length) {
        const matched = await sql.query<{ count: string; unsafe: string }>(`select count(*)::text as count,
          count(*) filter (where ${table.table_name === "event_ops_event_role_assignment_versions" ? "reason<>''" : "false"})::text as unsafe
          from ${quote(table.table_name)} where workspace_id=$1 and (${allowed.map(column => `${quote(column)}=$2`).join(" or ")})`,
        [workspaceId, actorId]);
        if (Number(matched.rows[0]?.unsafe ?? 0) > 0) throw new Error(`EVENT_OPS_PII_LEDGER:${table.table_name}`);
        retainedPseudonymizedAuditRows += Number(matched.rows[0]?.count ?? 0);
      }
      const stripped = allowed.length ? `to_jsonb(t)-array[${allowed.map(column => `'${column}'`).join(",")}]::text[]` : "to_jsonb(t)";
      const found = await sql.query(`select 1 from ${quote(table.table_name)} t where workspace_id=$1 and
        jsonb_path_exists(${stripped},'$.** ? (@ == $actor)',jsonb_build_object('actor',$2::text)) limit 1`,
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
    return { deleted, retainedPseudonymizedAuditRows };
  }, { isolation: "read committed" });
}
