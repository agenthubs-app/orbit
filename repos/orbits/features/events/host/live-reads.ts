/**
 * R17 主办侧读模型的 SQL（live）。Owner: 甲 (R17).
 * 只读；授权在 live.ts（`requireEventCapability` 同一判定）。来自参加者私人记录的数字（会後フォロー、交換）在这里给原始计数，
 * 抑制（<5、差分保护）在拼装时用 `shared/compute/small-cell.ts` 做。
 */
import type { EventOperationsPostgresClient } from "../event-operations/storage/postgres-client";
import type { HostEventPayload } from "./storage/lifecycle";

type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value ?? 0);
const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value instanceof Date ? value : String(value)).toISOString());

export interface HostEventFacts {
  eventId: string;
  organizerActorId: string;
  organizerProfileId: string | null;
  lifecycle: "draft" | "published" | "cancelled" | "archived";
  title: string;
  description: string | null;
  venue: string | null;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
  publicCode: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  version: number;
  payload: Partial<HostEventPayload>;
  publicSlug: string | null;
  applied: number;
  pending: number;
  admitted: number;
  waitlisted: number;
  rejected: number;
  checkedIn: number;
  matched: number | null;
  generations: number;
  formPublishedAt: string | null;
  followedUp: number;
  role: string | null;
  admissionMode: "first_come" | "review";
  registrationClosesAt: string | null;
  capacity: number | null;
}

const FACTS_SELECT = `
  select e.event_id, e.organizer_actor_id, e.organizer_profile_id, e.lifecycle_state_v2, e.title, e.description, e.venue, e.timezone,
         e.starts_at, e.ends_at, e.public_code, e.cancelled_at, e.archived_at, e.event_version, coalesce(e.source_payload, '{}'::jsonb) as source_payload,
         (select a.alias_value from event_aliases a where a.workspace_id = e.workspace_id and a.event_id = e.event_id and a.alias_type = 'public_slug' order by a.created_at limit 1) as public_slug,
         (select count(*) from event_ops_admission_application_heads x where x.workspace_id = e.workspace_id and x.event_id = e.event_id and x.status <> 'withdrawn') as applied_app,
         (select count(*) from event_ops_admission_application_heads x where x.workspace_id = e.workspace_id and x.event_id = e.event_id and x.status = 'pending_review') as pending,
         (select count(*) from event_ops_admission_application_heads x where x.workspace_id = e.workspace_id and x.event_id = e.event_id and x.status = 'admitted') as admitted_app,
         (select count(*) from event_ops_admission_application_heads x where x.workspace_id = e.workspace_id and x.event_id = e.event_id and x.status = 'waitlisted') as waitlisted,
         (select count(*) from event_ops_admission_application_heads x where x.workspace_id = e.workspace_id and x.event_id = e.event_id and x.status = 'rejected') as rejected,
         (select count(*) from event_ops_membership_heads m where m.workspace_id = e.workspace_id and m.event_id = e.event_id and m.status = 'rsvped') as members,
         (select count(*) from event_ops_checkins c where c.workspace_id = e.workspace_id and c.event_id = e.event_id) as checked_in,
         (select count(*) from event_ops_generations g where g.workspace_id = e.workspace_id and g.event_id = e.event_id) as generations,
         (select jsonb_array_length(coalesce(p.published_dto -> 'directory', '[]'::jsonb)) from event_ops_publication_heads h join event_ops_publications p on p.workspace_id = h.workspace_id and p.publication_id = h.publication_id where h.workspace_id = e.workspace_id and h.event_id = e.event_id) as matched,
         (select q.published_at from event_host_question_sets q where q.workspace_id = e.workspace_id and q.event_id = e.event_id) as form_published_at,
         (select count(distinct r.user_id) from orbit_records r where r.workspace_id = e.workspace_id and r.collection_name = 'eventAfterConfirmations' and r.lifecycle_state <> 'deleted' and r.payload ->> 'eventId' = e.event_id) as followed_up,
         (select v.admission_mode from event_ops_admission_policy_heads ph join event_ops_admission_policy_versions v on v.workspace_id = ph.workspace_id and v.event_id = ph.event_id and v.policy_version = ph.policy_version where ph.workspace_id = e.workspace_id and ph.event_id = e.event_id) as admission_mode,
         (select v.registration_closes_at from event_ops_admission_policy_heads ph join event_ops_admission_policy_versions v on v.workspace_id = ph.workspace_id and v.event_id = ph.event_id and v.policy_version = ph.policy_version where ph.workspace_id = e.workspace_id and ph.event_id = e.event_id) as closes_at,
         (select v.capacity from event_ops_admission_policy_heads ph join event_ops_admission_policy_versions v on v.workspace_id = ph.workspace_id and v.event_id = ph.event_id and v.policy_version = ph.policy_version where ph.workspace_id = e.workspace_id and ph.event_id = e.event_id) as policy_capacity,
         role_head.role as role
    from event_ops_events e
    left join event_ops_event_role_assignment_heads role_head
      on role_head.workspace_id = e.workspace_id and role_head.event_id = e.event_id and role_head.subject_actor_id = $2 and role_head.state = 'active'`;

function factsFromRow(row: Row): HostEventFacts {
  const payload = ((typeof row.source_payload === "string" ? JSON.parse(row.source_payload) : row.source_payload) as { host?: Partial<HostEventPayload> }).host ?? {};
  const capacity = row.policy_capacity !== null && row.policy_capacity !== undefined ? num(row.policy_capacity) : payload.capacity ?? null;
  return {
    admissionMode: row.admission_mode === "instant" ? "first_come" : "review",
    admitted: Math.max(num(row.admitted_app), num(row.members)),
    applied: Math.max(num(row.applied_app), num(row.members)),
    archivedAt: iso(row.archived_at),
    cancelledAt: iso(row.cancelled_at),
    capacity,
    checkedIn: num(row.checked_in),
    description: (row.description as string | null) ?? null,
    endsAt: iso(row.ends_at),
    eventId: String(row.event_id),
    followedUp: num(row.followed_up),
    formPublishedAt: iso(row.form_published_at),
    generations: num(row.generations),
    lifecycle: row.lifecycle_state_v2 as HostEventFacts["lifecycle"],
    matched: row.matched === null || row.matched === undefined ? null : num(row.matched),
    organizerActorId: String(row.organizer_actor_id),
    organizerProfileId: (row.organizer_profile_id as string | null) ?? null,
    payload,
    pending: num(row.pending),
    publicCode: (row.public_code as string | null) ?? null,
    publicSlug: (row.public_slug as string | null) ?? null,
    registrationClosesAt: iso(row.closes_at),
    rejected: num(row.rejected),
    role: (row.role as string | null) ?? null,
    startsAt: iso(row.starts_at),
    timezone: String(row.timezone ?? "Asia/Tokyo"),
    title: String(row.title ?? ""),
    venue: (row.venue as string | null) ?? null,
    version: num(row.event_version),
    waitlisted: num(row.waitlisted),
  };
}

export function createHostLiveReads(deps: { client: EventOperationsPostgresClient; workspaceId: string }) {
  const { client, workspaceId } = deps;
  return {
    /** 我能看到的活动（owner 或有效角色）。 */
    async accessibleEvents(actorId: string): Promise<HostEventFacts[]> {
      const result = await client.query<Row>(`${FACTS_SELECT} where e.workspace_id = $1 and e.lifecycle_state_v2 is not null and (e.organizer_actor_id = $2 or role_head.role is not null) order by e.starts_at desc nulls last, e.event_id`, [workspaceId, actorId]);
      return result.rows.map(factsFromRow);
    },

    async eventFacts(actorId: string, eventId: string): Promise<HostEventFacts | null> {
      const result = await client.query<Row>(`${FACTS_SELECT} where e.workspace_id = $1 and e.event_id = $3 and e.lifecycle_state_v2 is not null`, [workspaceId, actorId, eventId]);
      return result.rows[0] ? factsFromRow(result.rows[0]) : null;
    },

    /** 近 14 天每天的申込数（东京日；旧 → 新）。 */
    async trend(eventId: string, now: Date, days = 14): Promise<number[]> {
      const result = await client.query<{ day: string; n: number }>(
        `select to_char((submitted_at at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD') as day, count(*)::int as n from event_ops_admission_application_heads
          where workspace_id = $1 and event_id = $2 and submitted_at >= $3 group by 1`,
        [workspaceId, eventId, new Date(now.getTime() - days * 86_400_000).toISOString()],
      );
      const byDay = new Map(result.rows.map((row) => [row.day, Number(row.n)]));
      return Array.from({ length: days }, (_, index) => {
        const day = new Date(now.getTime() - (days - 1 - index) * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
        return byDay.get(day) ?? 0;
      });
    },

    /** 申込者（一个 bucket），带资料回答与本主办方参加歴。 */
    async applicants(eventId: string, organizerActorId: string, statuses: readonly string[]): Promise<Array<{ actorId: string; status: string; version: number; payload: { displayName?: string; answers?: Record<string, string> }; submittedAt: string; attendCount: number }>> {
      const result = await client.query<Row>(
        `select a.actor_id, a.status, a.application_version, a.profile_payload, a.submitted_at,
                (select count(*) from event_ops_checkins c join event_ops_events oe on oe.workspace_id = c.workspace_id and oe.event_id = c.event_id
                  where c.workspace_id = a.workspace_id and c.actor_id = a.actor_id and oe.organizer_actor_id = $3 and c.event_id <> a.event_id) as attend_count
           from event_ops_admission_application_heads a
          where a.workspace_id = $1 and a.event_id = $2 and a.status = any($4::text[])
          order by a.submitted_at, a.actor_id`,
        [workspaceId, eventId, organizerActorId, statuses],
      );
      return result.rows.map((row) => ({ actorId: String(row.actor_id), attendCount: num(row.attend_count), payload: (typeof row.profile_payload === "string" ? JSON.parse(row.profile_payload) : row.profile_payload) as { displayName?: string; answers?: Record<string, string> }, status: String(row.status), submittedAt: iso(row.submitted_at)!, version: num(row.application_version) }));
    },

    /** 受付名单：已报名（含签到状态、番号）+ キャンセル待ち。 */
    async kioskRoster(eventId: string): Promise<Array<{ actorId: string; participantId: string | null; name: string; status: "not_arrived" | "checked_in" | "waitlisted"; checkedInAt: string | null; receptionNumber: string | null; answers: Record<string, string> }>> {
      const result = await client.query<Row>(
        `select m.actor_id, m.participant_id, c.checked_in_at, r.reception_no, a.profile_payload, 'member' as kind
           from event_ops_membership_heads m
           left join event_ops_checkins c on c.workspace_id = m.workspace_id and c.event_id = m.event_id and c.participant_id = m.participant_id
           left join event_reception_numbers r on r.workspace_id = m.workspace_id and r.event_id = m.event_id and r.actor_id = m.actor_id
           left join event_ops_admission_application_heads a on a.workspace_id = m.workspace_id and a.event_id = m.event_id and a.actor_id = m.actor_id
          where m.workspace_id = $1 and m.event_id = $2 and m.status = 'rsvped'
         union all
         select a.actor_id, null, null, null, a.profile_payload, 'waitlist' from event_ops_admission_application_heads a
          where a.workspace_id = $1 and a.event_id = $2 and a.status = 'waitlisted'`,
        [workspaceId, eventId],
      );
      return result.rows.map((row) => {
        const payload = (typeof row.profile_payload === "string" ? JSON.parse(row.profile_payload) : row.profile_payload ?? {}) as { displayName?: string; answers?: Record<string, string> };
        return { actorId: String(row.actor_id), answers: payload.answers ?? {}, checkedInAt: iso(row.checked_in_at), name: payload.displayName ?? "", participantId: (row.participant_id as string | null) ?? null, receptionNumber: (row.reception_no as string | null) ?? null, status: row.kind === "waitlist" ? "waitlisted" : row.checked_in_at ? "checked_in" : "not_arrived" };
      });
    },

    /** 交换：双方都确认的（contact request accepted）。按 requester / target 各自计人。 */
    async exchanges(eventId: string): Promise<{ pairs: number; people: number; byParticipant: Map<string, number> }> {
      const result = await client.query<{ requester_participant_id: string; target_participant_id: string }>(`select requester_participant_id, target_participant_id from event_ops_contact_requests where workspace_id = $1 and event_id = $2 and status = 'accepted'`, [workspaceId, eventId]);
      const byParticipant = new Map<string, number>();
      for (const row of result.rows) for (const id of [row.requester_participant_id, row.target_participant_id]) byParticipant.set(id, (byParticipant.get(id) ?? 0) + 1);
      return { byParticipant, pairs: result.rows.length, people: byParticipant.size };
    },

    async publishedGrouping(eventId: string): Promise<{ roundOne: Array<{ tableNumber: number; members: Array<{ participantId: string }> }> } | null> {
      const result = await client.query<{ grouping: unknown }>(`select p.published_dto -> 'grouping' as grouping from event_ops_publication_heads h join event_ops_publications p on p.workspace_id = h.workspace_id and p.publication_id = h.publication_id where h.workspace_id = $1 and h.event_id = $2`, [workspaceId, eventId]);
      const raw = result.rows[0]?.grouping;
      return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as { roundOne: Array<{ tableNumber: number; members: Array<{ participantId: string }> }> } : null;
    },

    async recentCheckIns(eventId: string, limit = 8): Promise<Array<{ participantId: string; actorId: string; at: string }>> {
      const result = await client.query<Row>(`select participant_id, actor_id, checked_in_at from event_ops_checkins where workspace_id = $1 and event_id = $2 order by checked_in_at desc limit $3`, [workspaceId, eventId, limit]);
      return result.rows.map((row) => ({ actorId: String(row.actor_id), at: iso(row.checked_in_at)!, participantId: String(row.participant_id) }));
    },

    async questionSet(eventId: string): Promise<{ draft: Record<string, unknown>; published: Record<string, unknown> | null; revision: number; savedAt: string | null; publishedAt: string | null } | null> {
      const result = await client.query<Row>(`select draft, published, revision, saved_at, published_at from event_host_question_sets where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
      const row = result.rows[0];
      if (!row) return null;
      const parse = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
      return { draft: parse(row.draft), published: row.published ? parse(row.published) : null, publishedAt: iso(row.published_at), revision: num(row.revision), savedAt: iso(row.saved_at) };
    },

    async hostNote(eventId: string): Promise<string | null> {
      const result = await client.query<{ host_note: string | null }>(`select host_note from event_host_notice_extras where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
      return result.rows[0]?.host_note ?? null;
    },

    async followerCount(organizerKey: string): Promise<number> {
      const result = await client.query<{ n: number }>(`select count(*)::int as n from orbit_records where workspace_id = $1 and collection_name = 'organizerFollows' and lifecycle_state <> 'deleted' and payload ->> 'organizerId' = $2`, [workspaceId, organizerKey]);
      return num(result.rows[0]?.n);
    },

    async sendCount(eventId: string, kind: string): Promise<number> {
      const result = await client.query<{ n: number }>(`select count(*)::int as n from event_host_notice_sends where workspace_id = $1 and event_id = $2 and kind = $3`, [workspaceId, eventId, kind]);
      return num(result.rows[0]?.n);
    },
  };
}

export type HostLiveReads = ReturnType<typeof createHostLiveReads>;
