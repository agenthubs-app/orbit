import { createHash } from "node:crypto";
import type { DomainChange } from "../../shared/contract/universal-read";
import {
  publicParticipant,
  publicRecommendations,
  publicTable,
  tableForParticipant,
} from "../events/event-operations/attendee-public";
import type { EventOperationsPublishedResult } from "../events/event-operations/contract";
import type { EventDerivedSyncSource } from "./domain-registry";
import { SYNC_MAX_PAYLOAD_BYTES, SyncReadError } from "./read-service";

/**
 * Sprint 0115 (offline 1a): the reader behind the three event_derived domains.
 *
 * Owner derivation: every row starts from the viewer's own head rows — the
 * membership head and the admission application head where actor_id is the
 * authenticated actor (`mine`). Nothing is read for an event the viewer has no
 * row for, so another attendee's registration, seats or recommendations and
 * the organizer's or staff views (admin workspace, check-in roster) can never
 * enter a page.
 *
 * Revision: a row's revision is the greatest sync_revision of the head rows it
 * is built from. All of them come from the orbit_records sequence under the
 * commit-order lock (sprint 0113), so a change to any of them resends the row
 * after every earlier bookmark, and revisions of different events never tie.
 *
 * Leaving: a cancelled membership or a rejected/withdrawn application keeps
 * its owner and takes a new revision; the row is then sent as a delete. So is
 * a published result that is not released to attendees (a newer publication
 * whose resultsAvailableAt is still ahead). The release itself is a moment in
 * time, not a write: it is folded into the published-results generation, so a
 * device holding a cursor from before the release is told to rebuild.
 */

// `mine` expects $1 = workspace, $2 = actor.
const MINE = `mine as (
  select coalesce(m.event_id, a.event_id) as event_id,
    m.status as membership_status, m.participant_id, m.sync_revision as m_rev,
    a.status as admission_status, a.sync_revision as a_rev,
    (m.status = 'rsvped' and coalesce(a.status, 'admitted') not in ('rejected', 'withdrawn')) as member
  from (
    select event_id, status, participant_id, sync_revision from event_ops_membership_heads
    where workspace_id = $1 and actor_id = $2
  ) m
  full join (
    select event_id, status, sync_revision from event_ops_admission_application_heads
    where workspace_id = $1 and actor_id = $2
  ) a on a.event_id = m.event_id
)`;

const VIEW_SQL: Record<EventDerivedSyncSource["view"], string> = {
  "registrations": `
    select mine.event_id as record_id, greatest(mine.m_rev, mine.a_rev) as rev, true as visible,
      mine.membership_status, mine.admission_status
    from mine`,
  "registered-events": `
    select mine.event_id as record_id,
      greatest(mine.m_rev, mine.a_rev, event.sync_revision, head.sync_revision) as rev,
      (mine.member and event.title is not null and event.starts_at is not null and event.ends_at is not null) as visible,
      mine.participant_id, event.title, event.description, event.venue, event.timezone,
      event.starts_at, event.ends_at, event.lifecycle_state_v2,
      configuration.check_in_opens_at, configuration.event_starts_at, configuration.event_ends_at,
      configuration.profile_edit_deadline_at, configuration.results_available_at,
      configuration.round_one_starts_at, configuration.round_two_starts_at
    from mine
    join event_ops_events event on event.workspace_id = $1 and event.event_id = mine.event_id
    left join event_ops_configuration_heads head on head.workspace_id = event.workspace_id and head.event_id = event.event_id
    left join event_ops_configurations configuration
      on configuration.workspace_id = head.workspace_id and configuration.event_id = head.event_id
      and configuration.configuration_version = head.configuration_version
    where mine.membership_status is not null`,
  "published-results": `
    select record_id, rev, visible, participant_id,
      case when visible then published_dto end as published_dto
    from (
      select mine.event_id as record_id,
        greatest(mine.m_rev, mine.a_rev, head.sync_revision) as rev,
        (mine.member and (publication.published_dto ->> 'resultsAvailableAt')::timestamptz <= statement_timestamp()) as visible,
        mine.participant_id, publication.published_dto
      from mine
      join event_ops_publication_heads head on head.workspace_id = $1 and head.event_id = mine.event_id
      join event_ops_publications publication
        on publication.workspace_id = head.workspace_id and publication.publication_id = head.publication_id
      where mine.membership_status is not null
    ) published`,
};

/** One statement: the three watermarks and the released set, for the manifest and every page. */
export const EVENT_DOMAIN_SUMMARY_SQL = `
  /* sync:event-domains:summary */
  with ${MINE},
  registrations as (${VIEW_SQL.registrations}),
  events as (select rev from (${VIEW_SQL["registered-events"]}) rows),
  results as (
    select mine.event_id,
      greatest(mine.m_rev, mine.a_rev, head.sync_revision) as rev,
      -- Time only: a cancellation already moves the row's revision, so it must not rotate the generation.
      ((publication.published_dto ->> 'resultsAvailableAt')::timestamptz <= statement_timestamp()) as released
    from mine
    join event_ops_publication_heads head on head.workspace_id = $1 and head.event_id = mine.event_id
    join event_ops_publications publication
      on publication.workspace_id = head.workspace_id and publication.publication_id = head.publication_id
    where mine.membership_status is not null
  )
  select
    (select coalesce(max(rev), 0)::text from registrations) as registrations,
    (select coalesce(max(rev), 0)::text from events) as events,
    (select coalesce(max(rev), 0)::text from results) as results,
    (select coalesce(string_agg(event_id, ',' order by event_id) filter (where released), '') from results) as released
`;

function pageSql(view: EventDerivedSyncSource["view"]): string {
  return `
  /* sync:event-domains:page:${view} */
  with ${MINE}, rows as (${VIEW_SQL[view]})
  select rows.*, rows.rev::text as sync_revision
  from rows
  where rows.rev > $3::bigint and rows.rev <= $4::bigint
  order by rows.rev asc
  limit $5
`;
}

export interface EventDomainSummary {
  watermarks: Record<EventDerivedSyncSource["view"], string>;
  /** Events of the viewer whose current publication is released to attendees; part of the published-results generation. */
  released: string;
}

export interface EventDomainSqlClient {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

const REVISION = /^(?:0|[1-9]\d*)$/;

export async function readEventDomainSummary(client: EventDomainSqlClient, input: { workspaceId: string; actorId: string }): Promise<EventDomainSummary> {
  const result = await client.query<{ registrations: string; events: string; results: string; released: string }>(EVENT_DOMAIN_SUMMARY_SQL, [input.workspaceId, input.actorId]);
  const row = result.rows[0];
  if (!row || ![row.registrations, row.events, row.results].every((value) => typeof value === "string" && REVISION.test(value)) || typeof row.released !== "string") {
    throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The event sync summary is invalid.");
  }
  return { watermarks: { "registrations": row.registrations, "registered-events": row.events, "published-results": row.results }, released: row.released };
}

/** A stable digest of what the manifest's event entries depend on (conditional manifest key). */
export function eventDomainSummaryKey(summary: EventDomainSummary): string {
  return createHash("sha256").update(JSON.stringify(summary)).digest("hex").slice(0, 32);
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new SyncReadError("SYNC_INVALID_RECORD", "An event sync timestamp is invalid.");
  return date.toISOString();
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

type ViewRow = Record<string, unknown> & { record_id: string; rev: unknown; sync_revision: string; visible: boolean };

// A very large event's directory is cut to the people this attendee's own
// results name (their tablemates and recommendations), so one event can never
// make the whole sync fail on SYNC_PAYLOAD_TOO_LARGE. directoryComplete says so.
const DIRECTORY_BUDGET_BYTES = Math.floor(SYNC_MAX_PAYLOAD_BYTES * 0.75);

function publishedPayload(eventId: string, participantId: string, published: EventOperationsPublishedResult): Record<string, unknown> | null {
  const me = published.directory.find((participant) => participant.participantId === participantId);
  // Not in this publication (e.g. registered after it was generated): nothing was published to this attendee.
  if (!me || published.eventId !== eventId) return null;
  const recommendations = published.recommendations.find((row) => row.sourceParticipantId === participantId) ?? null;
  const roundOne = tableForParticipant(published.grouping.roundOne, participantId);
  const roundTwo = tableForParticipant(published.grouping.roundTwo, participantId);
  let directory = published.directory.map(publicParticipant);
  let directoryComplete = true;
  if (Buffer.byteLength(JSON.stringify(directory), "utf8") > DIRECTORY_BUDGET_BYTES) {
    const named = new Set<string>([participantId]);
    for (const table of [roundOne, roundTwo]) for (const member of table?.members ?? []) named.add(member.participantId);
    for (const row of recommendations?.recommendations ?? []) named.add(row.targetParticipantId);
    directory = directory.filter((participant) => named.has(participant.participantId));
    directoryComplete = false;
  }
  return {
    eventId,
    generationId: published.generationId,
    publishedAt: published.publishedAt,
    resultsAvailableAt: published.resultsAvailableAt,
    me: publicParticipant(me),
    directory,
    directoryComplete,
    recommendations: publicRecommendations(recommendations),
    roundOneTable: publicTable(roundOne),
    roundTwoTable: publicTable(roundTwo),
  };
}

function payloadFor(view: EventDerivedSyncSource["view"], row: ViewRow): Record<string, unknown> | null {
  if (!row.visible) return null;
  if (view === "registrations") {
    return { eventId: row.record_id, membershipStatus: nullableText(row.membership_status), admissionStatus: nullableText(row.admission_status) };
  }
  if (view === "registered-events") {
    return {
      eventId: row.record_id,
      participantId: nullableText(row.participant_id),
      title: nullableText(row.title),
      description: nullableText(row.description),
      venue: nullableText(row.venue),
      timeZone: nullableText(row.timezone),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      lifecycleState: nullableText(row.lifecycle_state_v2),
      checkInOpensAt: iso(row.check_in_opens_at),
      eventStartsAt: iso(row.event_starts_at),
      eventEndsAt: iso(row.event_ends_at),
      profileEditDeadlineAt: iso(row.profile_edit_deadline_at),
      resultsAvailableAt: iso(row.results_available_at),
      roundOneStartsAt: iso(row.round_one_starts_at),
      roundTwoStartsAt: iso(row.round_two_starts_at),
    };
  }
  const published = row.published_dto;
  if (!published || typeof published !== "object" || typeof row.participant_id !== "string") return null;
  return publishedPayload(row.record_id, row.participant_id, published as EventOperationsPublishedResult);
}

// A page stays well under SYNC_MAX_PAGE_BYTES however large each event's results are.
const PAGE_BUDGET_BYTES = 768 * 1_024;

export async function readEventDomainPage(
  client: EventDomainSqlClient,
  source: EventDerivedSyncSource,
  input: { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  const result = await client.query<ViewRow>(pageSql(source.view), [input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit + 1]);
  let pageRows = result.rows.slice(0, input.limit);
  let hasMore = result.rows.length > input.limit;
  const changes: DomainChange[] = [];
  let bytes = 0;
  let consumed = 0;
  for (const row of pageRows) {
    if (!REVISION.test(row.sync_revision)) throw new SyncReadError("SYNC_INVALID_RECORD", "An event sync revision is invalid.");
    const payload = payloadFor(source.view, row);
    if (payload && Buffer.byteLength(JSON.stringify(payload), "utf8") > SYNC_MAX_PAYLOAD_BYTES) {
      throw new SyncReadError("SYNC_PAYLOAD_TOO_LARGE", "A mapped sync payload exceeds the configured limit.");
    }
    const change: DomainChange = payload
      ? { id: row.record_id, revision: row.sync_revision, operation: "upsert", payload }
      : { id: row.record_id, revision: row.sync_revision, operation: "delete", payload: null };
    const size = Buffer.byteLength(JSON.stringify(change), "utf8");
    if (consumed > 0 && bytes + size > PAGE_BUDGET_BYTES) { hasMore = true; break; }
    bytes += size;
    consumed += 1;
    // A first pull has nothing to remove: tombstones are only sent after a bookmark.
    if (change.operation === "delete" && input.afterRevision === "0") continue;
    changes.push(change);
  }
  pageRows = pageRows.slice(0, consumed);
  return { changes, hasMore, lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null };
}
