/**
 * 2026-11-12 one-off data import (user request): the matching results of the four imported
 * 「中日创业交流会」 events — round-one seated tables, round-two topic tables, per-person
 * recommendations, the event insights — moved from party-app into Orbit's own format.
 *
 * Input: a JSON file built outside the repo from a party-app export (it holds attendee text, so it is
 * never committed). Per event it carries what attendees saw in party-app: the latest completed
 * `groups` run (round one), the latest `topic_groups` run (round two; free-join there, so members
 * were assigned by each person's own registration topics — the user's 2026-11-12 decision), the
 * per-person active recommendations, and the run insights. Text is already single-language (zh).
 *
 * What it writes per event, in one transaction behind the sync commit-order lock — the same rows a
 * normal publish leaves, minus the AI task / artifact trail (no reader needs it):
 *   - event_ops_configurations v1 + head (schedule from party-app, event times = Orbit's canonical ones);
 *   - event_ops_generations (status 'published', ai_request_fingerprint 'import:party-app:v1', so no
 *     worker ever claims it) + event_ops_generation_participants (the seated attendees);
 *   - event_ops_tasks: one completed `table_content_shard` row per table and round (the host groups
 *     screen builds its tables from these);
 *   - event_ops_publications (published_dto = EventOperationsPublishedResult) + publication head;
 *   - event_ops_events.source_payload.partyAppInsights (no Orbit page reads it yet), event_version + 1
 *     with a new event_event_versions row.
 * No notice / outbox rows: those are written only by the host publish path, which this bypasses.
 *
 * Attendees are matched to Orbit by actor: `party-app:account:<account_id>` (the organizer's party-app
 * account is now the user's Orbit login) or `party-app:profile:<profile_id>`. Only people who sat in
 * round one are in the published directory (Orbit needs every directory member at a table in both
 * rounds); recommendations pointing outside it are dropped and reported.
 *
 *   npx tsx scripts/import-chinichi-party-results.ts --data <file>              # dry run (read-only, builds + validates)
 *   npx tsx scripts/import-chinichi-party-results.ts --data <file> --rollback   # write, read back, roll back
 *   npx tsx scripts/import-chinichi-party-results.ts --data <file> --apply      # write
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

import type { EventOperationsGraphEdge, EventOperationsParticipant, EventOperationsParticipantRecommendations, EventOperationsPublishedResult, EventOperationsTable } from "../features/events/event-operations/contract";
import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { TARGETS } from "./fix-chinichi-startup-event-details";
import { loadLocalEnv } from "./load-local-env";

export const IMPORT_FINGERPRINT = "import:party-app:v1";
const SINGLE_ROUND_NOTE = "本场只有一轮分组，第二轮沿用第一轮的桌次。";

type ImportMember = { profileId: string; seat: string; leader?: boolean; prompts: string[]; rationale?: string };
type ImportTable = { tableNumber: number; theme: string; rationale: string; icebreakers: string[]; members: ImportMember[] };
type ImportRec = { source: string; target: string; rank: number; score: number; reasons: string[]; memberHint: string; icebreakers: string[] };
export type ImportEvent = {
  partyRuns: Record<string, string | null>;
  times: { checkInOpensAt: string; profileEditDeadlineAt: string; resultsAvailableAt: string; roundOneAt: string | null; roundTwoAt: string | null };
  actorKeys: Record<string, string[]>;
  roundOne: ImportTable[];
  roundTwo: ImportTable[] | null;
  recs: ImportRec[];
  insights: Record<string, unknown> | null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stableValue(v)]));
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString());
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const nullableText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

type Head = { actorId: string; participantId: string; membershipVersion: number; profileVersion: number; participant: Record<string, unknown> };

/** Orbit's directory entry for one attendee: the stored participant snapshot, ids pinned to the head, arrays never null. */
export function directoryEntry(head: Head): EventOperationsParticipant {
  const p = head.participant;
  const completeness = p.profileCompleteness === "complete" || p.profileCompleteness === "partial" || p.profileCompleteness === "minimal" ? p.profileCompleteness : "partial";
  return {
    ...(p as object),
    actorId: head.actorId,
    company: nullableText(p.company),
    displayName: nullableText(p.displayName) ?? "参加者",
    energyStyle: nullableText(p.energyStyle),
    evidenceIds: strings(p.evidenceIds),
    experienceHighlight: nullableText(p.experienceHighlight),
    industry: nullableText(p.industry),
    languages: strings(p.languages),
    lateRegistration: p.lateRegistration === true,
    needs: strings(p.needs),
    offers: strings(p.offers),
    participantId: head.participantId,
    profileCompleteness: completeness,
    role: nullableText(p.role),
    seniority: nullableText(p.seniority),
    topics: strings(p.topics),
  } as EventOperationsParticipant;
}

function graphFor(grouping: EventOperationsPublishedResult["grouping"], directory: readonly EventOperationsParticipant[], recommendations: readonly EventOperationsParticipantRecommendations[]) {
  const edges = new Map<string, EventOperationsGraphEdge>();
  for (const row of recommendations) for (const rec of row.recommendations) {
    const key = `recommendation:${row.sourceParticipantId}:${rec.targetParticipantId}`;
    edges.set(key, { fromParticipantId: row.sourceParticipantId, id: `event-operations-edge:recommendation:${hash(key).slice(0, 20)}`, kind: "recommendation", label: `AI recommendation #${rec.rank} · ${rec.score}`, toParticipantId: rec.targetParticipantId });
  }
  const tableEdges = (round: readonly EventOperationsTable[], kind: "round_one_table" | "round_two_topic") => {
    for (const table of round) for (const left of table.members) for (const right of table.members) {
      if (left.participantId === right.participantId) continue;
      const key = `${kind}:${left.participantId}:${right.participantId}`;
      edges.set(key, { fromParticipantId: left.participantId, id: `event-operations-edge:${kind}:${hash(key).slice(0, 20)}`, kind, label: `${table.theme} · table ${table.tableNumber}`, toParticipantId: right.participantId });
    }
  };
  tableEdges(grouping.roundOne, "round_one_table");
  tableEdges(grouping.roundTwo, "round_two_topic");
  return { edges: [...edges.values()], nodes: directory.map((p) => ({ company: p.company, displayName: p.displayName, participantId: p.participantId })) };
}

/** The checks the analytics read model and attendee readers rely on (validateGrouping itself is bypassed on import). */
export function validateDto(dto: EventOperationsPublishedResult): string[] {
  const errors: string[] = [];
  const ids = new Set(dto.directory.map((p) => p.participantId));
  for (const [name, round] of [["roundOne", dto.grouping.roundOne], ["roundTwo", dto.grouping.roundTwo]] as const) {
    const seen = new Set<string>();
    const numbers = new Set<number>();
    for (const table of round) {
      if (!Number.isInteger(table.tableNumber) || table.tableNumber <= 0 || numbers.has(table.tableNumber)) errors.push(`${name}: bad table number ${table.tableNumber}`);
      numbers.add(table.tableNumber);
      if (!table.members.length) errors.push(`${name} t${table.tableNumber}: empty`);
      if (table.icebreakers.length !== 3 || table.icebreakers.some((s) => !s.trim())) errors.push(`${name} t${table.tableNumber}: icebreakers ${table.icebreakers.length}`);
      const seats = new Set<string>();
      for (const m of table.members) {
        if (seen.has(m.participantId)) errors.push(`${name}: ${m.participantId} twice`);
        seen.add(m.participantId);
        if (!m.seat || seats.has(m.seat)) errors.push(`${name} t${table.tableNumber}: seat ${m.seat}`);
        seats.add(m.seat);
        if ((table.memberPrompts[m.participantId] ?? []).length !== 2) errors.push(`${name} t${table.tableNumber}: prompts for ${m.participantId}`);
        if (typeof table.memberRationales[m.participantId] !== "string") errors.push(`${name} t${table.tableNumber}: rationale for ${m.participantId}`);
      }
    }
    if (seen.size !== ids.size || [...seen].some((id) => !ids.has(id))) errors.push(`${name}: members ${seen.size} != directory ${ids.size}`);
  }
  for (const row of dto.recommendations) {
    if (!ids.has(row.sourceParticipantId)) errors.push(`rec source outside directory`);
    for (const rec of row.recommendations) {
      if (!ids.has(rec.targetParticipantId) || rec.targetParticipantId === row.sourceParticipantId) errors.push(`rec target ${rec.targetParticipantId}`);
      if (!rec.reasons.length || !rec.memberHint.trim() || rec.score < 0 || rec.score > 100) errors.push(`rec content ${row.sourceParticipantId}#${rec.rank}`);
    }
  }
  if (Number.isNaN(Date.parse(dto.resultsAvailableAt))) errors.push("resultsAvailableAt");
  return errors;
}

/** Builds the published result for one event from the import data and the Orbit attendee heads. */
export function buildPublication(eventId: string, data: ImportEvent, heads: readonly Head[]) {
  const byActor = new Map(heads.map((h) => [h.actorId, h]));
  const unmatched: string[] = [];
  const resolve = (profileId: string): Head | null => {
    for (const key of data.actorKeys[profileId] ?? []) { const head = byActor.get(key); if (head) return head; }
    unmatched.push(profileId);
    return null;
  };
  const toTable = (table: ImportTable, round: 1 | 2, single = false): EventOperationsTable => {
    const members = table.members.flatMap((m) => { const head = resolve(m.profileId); return head ? [{ head, m }] : []; });
    return {
      icebreakers: table.icebreakers.slice(0, 3) as unknown as EventOperationsTable["icebreakers"],
      memberPrompts: Object.fromEntries(members.map(({ head, m }) => [head.participantId, m.prompts.slice(0, 2)])) as unknown as EventOperationsTable["memberPrompts"],
      memberRationales: Object.fromEntries(members.map(({ head, m }) => [head.participantId, round === 2 && !single ? m.rationale ?? "" : m.leader ? "本桌桌长" : ""])),
      members: members.map(({ head, m }) => ({ participantId: head.participantId, seat: m.seat })),
      rationale: single ? [table.rationale, SINGLE_ROUND_NOTE].filter(Boolean).join("\n") : table.rationale,
      tableNumber: table.tableNumber,
      theme: table.theme,
    };
  };
  const roundOne = data.roundOne.map((t) => toTable(t, 1)).filter((t) => t.members.length);
  const roundTwo = (data.roundTwo ?? data.roundOne).map((t) => toTable(t, 2, !data.roundTwo)).filter((t) => t.members.length);
  const seated = new Set(roundOne.flatMap((t) => t.members.map((m) => m.participantId)));
  const directory = heads.filter((h) => seated.has(h.participantId)).map(directoryEntry).sort((a, b) => a.participantId.localeCompare(b.participantId));
  const pidOf = (profileId: string) => { for (const key of data.actorKeys[profileId] ?? []) { const head = byActor.get(key); if (head) return head.participantId; } return null; };
  let droppedRecs = 0;
  const bySource = new Map<string, ImportRec[]>();
  for (const rec of data.recs) {
    const source = pidOf(rec.source), target = pidOf(rec.target);
    if (!source || !target || !seated.has(source) || !seated.has(target) || source === target) { droppedRecs += 1; continue; }
    bySource.set(source, [...(bySource.get(source) ?? []), rec]);
  }
  const recommendations: EventOperationsParticipantRecommendations[] = directory.map((p) => {
    const rows = (bySource.get(p.participantId) ?? []).sort((a, b) => a.rank - b.rank);
    return {
      noMatchReason: rows.length ? null : "这场活动没有为你生成推荐。",
      recommendations: rows.map((rec, index) => ({
        icebreakers: rec.icebreakers.slice(0, 2) as unknown as readonly [string, string],
        memberHint: rec.memberHint,
        rank: index + 1,
        reasons: rec.reasons as unknown as readonly [string, ...string[]],
        score: rec.score,
        targetParticipantId: pidOf(rec.target)!,
      })),
      sourceParticipantId: p.participantId,
    };
  });
  const snapshotHash = hash(directory);
  const idempotencyKey = `${IMPORT_FINGERPRINT}:${eventId}`;
  const generationId = `event-operations-generation:${hash({ eventId, idempotencyKey }).slice(0, 32)}`;
  const grouping = { roundOne, roundTwo };
  const publishedAt = iso(data.times.roundOneAt ?? data.times.resultsAvailableAt);
  const dto: EventOperationsPublishedResult = {
    directory, eventId, generationId, graph: graphFor(grouping, directory, recommendations), grouping,
    profileEditDeadlineAt: iso(data.times.profileEditDeadlineAt), publishedAt, recommendations,
    resultsAvailableAt: iso(data.times.resultsAvailableAt), snapshotHash,
  };
  return { dto, idempotencyKey, generationId, unmatched: [...new Set(unmatched)], droppedRecs, heads: heads.filter((h) => seated.has(h.participantId)) };
}

/** Schedule rows that satisfy the configuration CHECKs, anchored on the canonical event times. */
export function scheduleFor(data: ImportEvent, startsAt: string, endsAt: string) {
  const ms = (v: string) => Date.parse(v);
  const starts = ms(startsAt), ends = ms(endsAt);
  const results = Math.min(ms(data.times.resultsAvailableAt), ends - 2);
  const profileEdit = Math.min(ms(data.times.profileEditDeadlineAt), results);
  const roundOne = Math.min(Math.max(starts, results, data.times.roundOneAt ? ms(data.times.roundOneAt) : 0), ends - 1);
  // party-app ran topic groups before results opened, so its run time is only used when it falls after round one.
  const topicAt = data.times.roundTwoAt ? ms(data.times.roundTwoAt) : 0;
  const wantedTwo = topicAt > roundOne ? topicAt : roundOne + Math.floor((ends - roundOne) / 2);
  const roundTwo = Math.min(Math.max(wantedTwo, roundOne + 1), ends);
  const checkIn = Math.min(ms(data.times.checkInOpensAt), ends);
  const d = (v: number) => new Date(v).toISOString();
  return { checkInOpensAt: d(checkIn), eventStartsAt: d(starts), eventEndsAt: d(ends), profileEditDeadlineAt: d(profileEdit), registrationCutoffAt: d(profileEdit), resultsAvailableAt: d(results), roundOneStartsAt: d(roundOne), roundTwoStartsAt: d(roundTwo) };
}

async function loadHeads(sql: EventOperationsSqlExecutor, ws: string, eventId: string): Promise<Head[]> {
  const rows = await sql.query<{ actor_id: string; participant_id: string; membership_version: string; profile_version: string; payload: Record<string, unknown> }>(
    `select h.actor_id, h.participant_id, h.membership_version::text, h.profile_version::text, v.profile_payload as payload
       from event_ops_membership_heads h join event_ops_profile_versions v on v.workspace_id=h.workspace_id and v.event_id=h.event_id and v.participant_id=h.participant_id and v.profile_version=h.profile_version
      where h.workspace_id=$1 and h.event_id=$2 and h.status='rsvped'`, [ws, eventId]);
  return rows.rows.map((r) => ({ actorId: r.actor_id, participantId: r.participant_id, membershipVersion: Number(r.membership_version), profileVersion: Number(r.profile_version), participant: (r.payload?.participant ?? {}) as Record<string, unknown> }));
}

async function importEvent(sql: EventOperationsSqlExecutor, ws: string, eventId: string, data: ImportEvent, write: boolean) {
  const event = (await sql.query<{ organizer_actor_id: string; starts_at: unknown; ends_at: unknown; event_version: string; title: string }>(
    `select organizer_actor_id, starts_at, ends_at, event_version::text, title from event_ops_events where workspace_id=$1 and event_id=$2 ${write ? "for update" : ""}`, [ws, eventId])).rows[0];
  if (!event || event.title.trim() !== TARGETS[eventId]!.title) throw new Error(`GUARD_EVENT:${eventId}`);
  const existing = await sql.query<{ n: string }>(`select ((select count(*) from event_ops_generations where workspace_id=$1 and event_id=$2) + (select count(*) from event_ops_configurations where workspace_id=$1 and event_id=$2) + (select count(*) from event_ops_publication_heads where workspace_id=$1 and event_id=$2))::text n`, [ws, eventId]);
  if (existing.rows[0]?.n !== "0") throw new Error(`GUARD_ALREADY_HAS_MATCHING_ROWS:${eventId}:${existing.rows[0]?.n}`);
  const heads = await loadHeads(sql, ws, eventId);
  const built = buildPublication(eventId, data, heads);
  const errors = validateDto(built.dto);
  const schedule = scheduleFor(data, iso(event.starts_at), iso(event.ends_at));
  const tableSize = Math.max(2, ...built.dto.grouping.roundOne.map((t) => t.members.length));
  const summary = {
    eventId, directory: built.dto.directory.length, rsvped: heads.length, unmatchedPartyProfiles: built.unmatched.length, droppedRecs: built.droppedRecs,
    roundOne: built.dto.grouping.roundOne.map((t) => t.members.length).join("/"), roundTwo: built.dto.grouping.roundTwo.map((t) => t.members.length).join("/"),
    recs: built.dto.recommendations.reduce((n, r) => n + r.recommendations.length, 0), noRecs: built.dto.recommendations.filter((r) => !r.recommendations.length).length,
    edges: built.dto.graph.edges.length, dtoBytes: JSON.stringify(built.dto).length, schedule, tableSize, insights: data.insights ? Object.keys(data.insights) : [], errors,
  };
  if (errors.length) throw new Error(`INVALID_DTO:${eventId}:${errors.slice(0, 5).join(" | ")}`);
  if (!write) return summary;

  const at = built.dto.publishedAt;
  await sql.query(
    `insert into event_ops_configurations (workspace_id, event_id, configuration_version, check_in_opens_at, event_starts_at, event_ends_at, profile_edit_deadline_at, registration_cutoff_at, results_available_at, round_one_starts_at, round_two_starts_at, recommendation_count, table_size, shard_size, max_attempts_per_task, created_at, updated_at)
     values ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,10,$11,25,3,now(),now())`,
    [ws, eventId, schedule.checkInOpensAt, schedule.eventStartsAt, schedule.eventEndsAt, schedule.profileEditDeadlineAt, schedule.registrationCutoffAt, schedule.resultsAvailableAt, schedule.roundOneStartsAt, schedule.roundTwoStartsAt, tableSize]);
  await sql.query(`insert into event_ops_configuration_heads (workspace_id, event_id, configuration_version, revision, updated_at) values ($1,$2,1,1,now())`, [ws, eventId]);
  const tables = [...built.dto.grouping.roundOne.map((table) => ({ round: 1 as const, table })), ...built.dto.grouping.roundTwo.map((table) => ({ round: 2 as const, table }))];
  await sql.query(
    `insert into event_ops_generations (workspace_id, generation_id, event_id, organizer_actor_id, idempotency_key, configuration_version, snapshot_hash, status, expected_task_count, completed_at, published_at, revision, created_at, updated_at, ai_request_fingerprint)
     values ($1,$2,$3,$4,$5,1,$6,'published',$7,$8,$8,1,$8,now(),$9)`,
    [ws, built.generationId, eventId, event.organizer_actor_id, built.idempotencyKey, built.dto.snapshotHash, tables.length, at, IMPORT_FINGERPRINT]);
  const byPid = new Map(built.heads.map((h) => [h.participantId, h]));
  for (const [ordinal, participant] of built.dto.directory.entries()) {
    const head = byPid.get(participant.participantId)!;
    await sql.query(`insert into event_ops_generation_participants (workspace_id, generation_id, participant_id, actor_id, profile_version, ordinal, participant_payload, membership_version) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [ws, built.generationId, participant.participantId, head.actorId, head.profileVersion, ordinal, JSON.stringify(participant), head.membershipVersion]);
  }
  for (const { round, table } of tables) {
    const output = { kind: "table_content_shard", roundNumber: round, table };
    await sql.query(
      `insert into event_ops_tasks (workspace_id, task_id, generation_id, task_kind, status, participant_ids, depends_on_task_ids, attempt_limit, attempts, output_payload, output_hash, completed_at, created_at, updated_at)
       values ($1,$2,$3,'table_content_shard','completed',$4::text[],'{}',3,1,$5::jsonb,$6,$7,$7,now())`,
      [ws, `${built.generationId}:table-content:r${round}:${table.tableNumber}`, built.generationId, table.members.map((m) => m.participantId), JSON.stringify(output), hash(output), at]);
  }
  const publicationId = `event-operations-publication:${hash(built.generationId).slice(0, 32)}`;
  await sql.query(`insert into event_ops_publications (workspace_id, publication_id, event_id, generation_id, snapshot_hash, dto_hash, published_dto, published_by_actor_id, published_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [ws, publicationId, eventId, built.generationId, built.dto.snapshotHash, hash(built.dto), JSON.stringify(built.dto), event.organizer_actor_id, at]);
  await sql.query(`insert into event_ops_publication_heads (workspace_id, event_id, publication_id, generation_id, revision, updated_at) values ($1,$2,$3,$4,1,now())`, [ws, eventId, publicationId, built.generationId]);

  if (data.insights) {
    const version = Number(event.event_version);
    const updated = await sql.query<{ event_version: string; source_payload: unknown; title: string | null; description: string | null; venue: string | null; starts_at: unknown; ends_at: unknown; lifecycle_state_v2: string | null; organizer_actor_id: string; public_code: string | null; timezone: string | null }>(
      `update event_ops_events set source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('partyAppInsights', $3::jsonb), event_version = event_version + 1, revision = revision + 1, updated_at = now()
        where workspace_id=$1 and event_id=$2 and event_version=$4
        returning event_version::text, source_payload, title, description, venue, starts_at, ends_at, lifecycle_state_v2, organizer_actor_id, public_code, timezone`,
      [ws, eventId, JSON.stringify({ ...data.insights, importedFrom: "party-app", runId: data.partyRuns.aiContent ?? data.partyRuns.groups }), version]);
    const saved = updated.rows[0];
    if (!saved) throw new Error(`VERSION_CONFLICT:${eventId}`);
    const contentHash = createHash("sha256").update(JSON.stringify({ description: saved.description, endsAt: iso(saved.ends_at), eventId, lifecycle: saved.lifecycle_state_v2, organizerActorId: saved.organizer_actor_id, payload: saved.source_payload, publicCode: saved.public_code, startsAt: iso(saved.starts_at), timezone: saved.timezone, title: saved.title, venue: saved.venue })).digest("hex");
    await sql.query(
      `insert into event_event_versions (workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, content_hash, created_at)
       select workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, $3, now()
         from event_ops_events where workspace_id=$1 and event_id=$2`, [ws, eventId, contentHash]);
  }

  // Read back what the readers read.
  const back = await sql.query<{ dto: EventOperationsPublishedResult; status: string; tasks: string }>(
    `select p.published_dto dto, g.status, (select count(*)::text from event_ops_tasks t where t.workspace_id=$1 and t.generation_id=g.generation_id and t.status='completed') tasks
       from event_ops_publication_heads h join event_ops_publications p on p.workspace_id=h.workspace_id and p.publication_id=h.publication_id
       join event_ops_generations g on g.workspace_id=h.workspace_id and g.generation_id=h.generation_id where h.workspace_id=$1 and h.event_id=$2`, [ws, eventId]);
  const readBack = back.rows[0];
  if (!readBack || readBack.status !== "published" || validateDto(readBack.dto).length || Number(readBack.tasks) !== tables.length) throw new Error(`VERIFY_FAILED:${eventId}`);
  return { ...summary, generationId: built.generationId, publicationId, tasks: Number(readBack.tasks) };
}

class Rollback extends Error {}

async function main(argv: readonly string[]) {
  loadLocalEnv();
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  const dataIndex = argv.indexOf("--data");
  if (apply && rollback) throw new Error("USAGE: --apply and --rollback are exclusive");
  if (dataIndex < 0 || !argv[dataIndex + 1]) throw new Error("USAGE: --data <file>");
  const data = JSON.parse(fs.readFileSync(argv[dataIndex + 1]!, "utf8")) as Record<string, ImportEvent>;
  const eventIds = Object.keys(TARGETS);
  if (eventIds.some((id) => !data[id])) throw new Error("DATA_MISSING_EVENT");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  const mode = apply ? "APPLY" : rollback ? "ROLLBACK" : "DRY_RUN";
  const results: unknown[] = [];
  try {
    try {
      await client.transaction(async (sql) => {
        if (mode === "DRY_RUN") await sql.query("set transaction read only");
        else await acquireSyncCommitOrderLock(sql);
        for (const eventId of eventIds) results.push(await importEvent(sql, config.workspaceId, eventId, data[eventId]!, mode !== "DRY_RUN"));
        if (rollback) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    console.info(`chinichi-party-results ${mode} ${JSON.stringify(results)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-party-results FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
