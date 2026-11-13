/**
 * R17 主办侧读模型的 SQL（live）。Owner: 甲 (R17).
 * 只读；授权在 live.ts（`requireEventCapability` 同一判定）。来自参加者私人记录的数字（会後フォロー、交換）在这里给原始计数，
 * 抑制（<5、差分保护）在拼装时用 `shared/compute/small-cell.ts` 做。
 */
import type { EventOperationsPostgresClient } from "../event-operations/storage/postgres-client";
import type { HostEventPayload } from "./storage/lifecycle";

type Row = Record<string, unknown>;

/**
 * profileScore() in SQL for an admission application row `alias`: with interview responses 44 + the
 * coverage weights (jsonb param) of the answered fields; otherwise 100 when every answer key (text[]
 * param) is filled, else 44. Lets lists and counts filter / count without shipping profiles.
 */
function applicationScoreSql(alias: string, weightsParam: string, keysParam: string): string {
  return `case when jsonb_typeof(${alias}.profile_payload -> 'interviewResponses') = 'array' and jsonb_array_length(${alias}.profile_payload -> 'interviewResponses') > 0
    then 44 + coalesce((select sum(coalesce((${weightsParam}::jsonb ->> x.f)::int, 0)) from (select distinct r ->> 'field' as f from jsonb_array_elements(${alias}.profile_payload -> 'interviewResponses') r where coalesce(trim(r #>> '{answer,displayText}'), '') <> '') x), 0)
    else case when not exists (select 1 from unnest(${keysParam}::text[]) k where coalesce(trim(${alias}.profile_payload #>> array['answers', k]), '') = '') then 100 else 44 end
  end`;
}

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

    /**
     * 截至 `now` 的近 N 天每天的申込数（东京日；旧 → 新）。一人一次：有申込（admission）的取提交时间；
     * 没走申込直接登记参加的人（不审核的活动、从 party-app 搬来的场次）取最早一版参加登记的 registered_at。
     */
    async trend(eventId: string, now: Date, days = 14): Promise<number[]> {
      const result = await client.query<{ day: string; n: number }>(
        `with applied as (
           select actor_id, submitted_at as at from event_ops_admission_application_heads where workspace_id = $1 and event_id = $2
         ), registered as (
           select v.actor_id, min(v.registered_at) as at from event_ops_membership_versions v
            where v.workspace_id = $1 and v.event_id = $2 and not exists (select 1 from applied a where a.actor_id = v.actor_id)
            group by v.actor_id
         )
         select to_char((at at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD') as day, count(*)::int as n
           from (select at from applied union all select at from registered) s
          where at >= $3 and at <= $4 group by 1`,
        [workspaceId, eventId, new Date(now.getTime() - days * 86_400_000).toISOString(), now.toISOString()],
      );
      const byDay = new Map(result.rows.map((row) => [row.day, Number(row.n)]));
      return Array.from({ length: days }, (_, index) => {
        const day = new Date(now.getTime() - (days - 1 - index) * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
        return byDay.get(day) ?? 0;
      });
    },

    /** 没有申込记录、但在当前已发布分组名单里的参加中成员数（直接登记 / 搬迁来的场次的「マッチ可能」）。 */
    async matchedMembersWithoutApplication(eventId: string): Promise<number> {
      const result = await client.query<{ n: number }>(
        `select count(*)::int as n from event_ops_membership_heads m
          where m.workspace_id = $1 and m.event_id = $2 and m.status = 'rsvped'
            and not exists (select 1 from event_ops_admission_application_heads a where a.workspace_id = m.workspace_id and a.event_id = m.event_id and a.actor_id = m.actor_id)
            and exists (select 1 from event_ops_publication_heads p join event_ops_generation_participants g on g.workspace_id = p.workspace_id and g.generation_id = p.generation_id
                         where p.workspace_id = m.workspace_id and p.event_id = m.event_id and g.participant_id = m.participant_id)`,
        [workspaceId, eventId],
      );
      return Number(result.rows[0]?.n ?? 0);
    },

    /**
     * 「参加者」页签的一页：筛选、搜索、分页都在数据库里做，只返回这一页要显示的列；参加歴与主办方问题的回答
     * 只为这一页的人查。成员（无申込，直接登记 / 搬迁场次）在 includeMembers 时并入，只取名字・公司・职位・前两项需求。
     * score 与 profileScore() 同口径：有访谈回答 → 44 + 覆盖权重；否则 ANSWER_KEYS 全填 = 100，否则 44；成员按 5 项资料填了几项。
     */
    async peoplePage(input: {
      eventId: string; organizerActorId: string; status: string; includeMembers: boolean; q: string; incompleteOnly: boolean;
      limit: number; offset: number; answerKeys: readonly string[]; coverageWeights: Readonly<Record<string, number>>; hostQuestionId: string | null;
    }): Promise<{ total: number; rows: Array<{ actorId: string; kind: "application" | "member"; version: number; name: string; positioning: string | null; org: string | null; role: string | null; desired: string | null; hostAnswer: string | null; score: number; attendCount: number }> }> {
      const result = await client.query<Row>(
        `with apps as (
           select a.actor_id, a.application_version::int as version, a.submitted_at as sort_at, 'application' as kind,
                  a.profile_payload ->> 'displayName' as name,
                  a.profile_payload #>> '{answers,positioning}' as positioning, null::text as org, null::text as role,
                  a.profile_payload #>> '{answers,desiredOutcome}' as desired,
                  ${applicationScoreSql("a", "$9", "$8")} as score
             from event_ops_admission_application_heads a
            where a.workspace_id = $1 and a.event_id = $2 and a.status = $3
         ), members as (
           select m.actor_id, 0 as version,
                  (select min(mv.registered_at) from event_ops_membership_versions mv where mv.workspace_id = m.workspace_id and mv.event_id = m.event_id and mv.actor_id = m.actor_id) as sort_at,
                  'member' as kind,
                  v.profile_payload #>> '{participant,displayName}' as name, null::text as positioning,
                  v.profile_payload #>> '{participant,company}' as org, v.profile_payload #>> '{participant,role}' as role,
                  (select string_agg(n, '、') from (select jsonb_array_elements_text(case when jsonb_typeof(v.profile_payload #> '{participant,needs}') = 'array' then v.profile_payload #> '{participant,needs}' else '[]'::jsonb end) as n limit 2) needs) as desired,
                  round(100.0 * (
                    (case when coalesce(trim(v.profile_payload #>> '{participant,displayName}'), '') <> '' then 1 else 0 end)
                  + (case when coalesce(trim(v.profile_payload #>> '{participant,company}'), '') <> '' then 1 else 0 end)
                  + (case when coalesce(trim(v.profile_payload #>> '{participant,role}'), '') <> '' then 1 else 0 end)
                  + (case when jsonb_typeof(v.profile_payload #> '{participant,topics}') = 'array' and jsonb_array_length(v.profile_payload #> '{participant,topics}') > 0 then 1 else 0 end)
                  + (case when (jsonb_typeof(v.profile_payload #> '{participant,offers}') = 'array' and jsonb_array_length(v.profile_payload #> '{participant,offers}') > 0)
                           or (jsonb_typeof(v.profile_payload #> '{participant,needs}') = 'array' and jsonb_array_length(v.profile_payload #> '{participant,needs}') > 0) then 1 else 0 end)
                  ) / 5)::int as score
             from event_ops_membership_heads m
             left join event_ops_profile_versions v on v.workspace_id = m.workspace_id and v.event_id = m.event_id and v.participant_id = m.participant_id and v.profile_version = m.profile_version
            where $4 and m.workspace_id = $1 and m.event_id = $2 and m.status = 'rsvped'
              and not exists (select 1 from event_ops_admission_application_heads a where a.workspace_id = m.workspace_id and a.event_id = m.event_id and a.actor_id = m.actor_id)
         ), filtered as (
           select * from (select * from apps union all select * from members) b
            where (not $6 or b.score < 100)
              and ($5 = '' or strpos(concat_ws(' ', b.name, b.org, b.positioning, b.desired), $5) > 0
                   or ($10::text is not null and exists (select 1 from orbit_records r where r.workspace_id = $1 and r.collection_name = 'eventHostAnswers' and r.user_id = b.actor_id and r.lifecycle_state <> 'deleted' and r.payload ->> 'eventId' = $2 and strpos(coalesce(r.payload -> 'answers' ->> $10, ''), $5) > 0)))
         ), page as (
           select *, count(*) over () as total from filtered order by sort_at nulls last, actor_id limit $7 offset $11
         )
         select p.actor_id, p.kind, p.version, p.name, p.positioning, p.org, p.role, p.desired, p.score, p.total,
                case when $10::text is null then null else (select r.payload -> 'answers' ->> $10 from orbit_records r where r.workspace_id = $1 and r.collection_name = 'eventHostAnswers' and r.user_id = p.actor_id and r.lifecycle_state <> 'deleted' and r.payload ->> 'eventId' = $2 limit 1) end as host_answer,
                (select count(*) from event_ops_checkins c join event_ops_events oe on oe.workspace_id = c.workspace_id and oe.event_id = c.event_id
                  where c.workspace_id = $1 and c.actor_id = p.actor_id and oe.organizer_actor_id = $12 and c.event_id <> $2) as attend_count
           from page p order by p.sort_at nulls last, p.actor_id`,
        [workspaceId, input.eventId, input.status, input.includeMembers, input.q, input.incompleteOnly, input.limit, [...input.answerKeys], JSON.stringify(input.coverageWeights), input.hostQuestionId, input.offset, input.organizerActorId],
      );
      const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
      return {
        total: num(result.rows[0]?.total),
        rows: result.rows.map((row) => ({
          actorId: String(row.actor_id), attendCount: num(row.attend_count), desired: text(row.desired), hostAnswer: text(row.host_answer),
          kind: row.kind === "member" ? "member" : "application", name: text(row.name) ?? "", org: text(row.org), positioning: text(row.positioning),
          role: text(row.role), score: num(row.score), version: num(row.version),
        })),
      };
    },

    /**
     * 参加者詳細：この 1 人の申込（回答だけ）・活動プロフィール（表示する項目だけ）・受付・番号・参加歴・主催者質問への回答。
     */
    async person(eventId: string, subjectActorId: string, organizerActorId: string): Promise<{
      status: string | null; submittedAt: string | null; applicationName: string | null; answers: Record<string, string>;
      participantId: string | null; memberStatus: string | null; participant: Record<string, unknown>; checkedInAt: string | null; receptionNumber: string | null;
      hostAnswers: Record<string, string>; attendCount: number;
    } | null> {
      const result = await client.query<Row>(
        `select a.status, a.submitted_at, a.profile_payload ->> 'displayName' as application_name, a.profile_payload -> 'answers' as answers,
                m.participant_id, m.status as member_status, c.checked_in_at, r.reception_no,
                case when v.profile_payload is null then null else jsonb_build_object(
                  'displayName', v.profile_payload #> '{participant,displayName}', 'company', v.profile_payload #> '{participant,company}',
                  'role', v.profile_payload #> '{participant,role}', 'industry', v.profile_payload #> '{participant,industry}',
                  'seniority', v.profile_payload #> '{participant,seniority}', 'energyStyle', v.profile_payload #> '{participant,energyStyle}',
                  'experienceHighlight', v.profile_payload #> '{participant,experienceHighlight}', 'topics', v.profile_payload #> '{participant,topics}',
                  'offers', v.profile_payload #> '{participant,offers}', 'needs', v.profile_payload #> '{participant,needs}') end as participant,
                (select h.payload -> 'answers' from orbit_records h where h.workspace_id = $1 and h.collection_name = 'eventHostAnswers' and h.user_id = $3 and h.lifecycle_state <> 'deleted' and h.payload ->> 'eventId' = $2 limit 1) as host_answers,
                (select count(*) from event_ops_checkins hc join event_ops_events oe on oe.workspace_id = hc.workspace_id and oe.event_id = hc.event_id
                  where hc.workspace_id = $1 and hc.actor_id = $3 and oe.organizer_actor_id = $4 and hc.event_id <> $2) as attend_count
           from (select $3::text as actor_id) x
           left join event_ops_admission_application_heads a on a.workspace_id = $1 and a.event_id = $2 and a.actor_id = x.actor_id
           left join event_ops_membership_heads m on m.workspace_id = $1 and m.event_id = $2 and m.actor_id = x.actor_id
           left join event_ops_profile_versions v on v.workspace_id = m.workspace_id and v.event_id = m.event_id and v.participant_id = m.participant_id and v.profile_version = m.profile_version
           left join event_ops_checkins c on c.workspace_id = m.workspace_id and c.event_id = m.event_id and c.participant_id = m.participant_id
           left join event_reception_numbers r on r.workspace_id = $1 and r.event_id = $2 and r.actor_id = x.actor_id`,
        [workspaceId, eventId, subjectActorId, organizerActorId],
      );
      const row = result.rows[0];
      if (!row || (row.status == null && row.participant_id == null)) return null;
      const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : {});
      const strings = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      return {
        answers: strings(obj(row.answers)), applicationName: (row.application_name as string | null) ?? null, attendCount: num(row.attend_count),
        checkedInAt: iso(row.checked_in_at), hostAnswers: strings(obj(row.host_answers)), memberStatus: (row.member_status as string | null) ?? null,
        participant: obj(row.participant), participantId: (row.participant_id as string | null) ?? null, receptionNumber: (row.reception_no as string | null) ?? null,
        status: (row.status as string | null) ?? null, submittedAt: iso(row.submitted_at),
      };
    },

    /**
     * 参加者詳細のマッチング：公開済み結果のうち、この人の卓（各ラウンド）・この人への推薦・そこに出てくる人の名前だけを
     * DB 内で取り出す（published_dto 全体は返さない）。未公開なら published=false。
     */
    async personMatching(eventId: string, participantId: string): Promise<{ published: boolean; tables: Array<{ round: number; tableNumber: number; theme: string | null; why: string | null; members: string[] }>; recommendations: Array<{ rank: number; participantId: string; reason: string | null }>; names: Record<string, { name: string; org: string | null; role: string | null }> }> {
      const result = await client.query<Row>(
        `with pub as (
           select p.published_dto as d from event_ops_publication_heads h
             join event_ops_publications p on p.workspace_id = h.workspace_id and p.publication_id = h.publication_id
            where h.workspace_id = $1 and h.event_id = $2
         ), tbl as (
           select rr.round, t from pub
             cross join lateral (values (1, pub.d #> '{grouping,roundOne}'), (2, pub.d #> '{grouping,roundTwo}')) rr(round, arr)
             cross join lateral jsonb_array_elements(case when jsonb_typeof(rr.arr) = 'array' then rr.arr else '[]'::jsonb end) t
            where exists (select 1 from jsonb_array_elements(t -> 'members') mm where mm ->> 'participantId' = $3)
         ), rec as (
           select x from pub cross join lateral jsonb_array_elements(case when jsonb_typeof(pub.d -> 'recommendations') = 'array' then pub.d -> 'recommendations' else '[]'::jsonb end) row
             cross join lateral jsonb_array_elements(case when jsonb_typeof(row -> 'recommendations') = 'array' then row -> 'recommendations' else '[]'::jsonb end) x
            where row ->> 'sourceParticipantId' = $3
         ), ids as (
           select mm ->> 'participantId' as id from tbl cross join lateral jsonb_array_elements(t -> 'members') mm
           union select x ->> 'targetParticipantId' from rec
         )
         select (select count(*) > 0 from pub) as published,
                (select jsonb_agg(jsonb_build_object('round', round, 'tableNumber', t -> 'tableNumber', 'theme', t ->> 'theme',
                         'why', coalesce(nullif(t -> 'memberRationales' ->> $3, ''), t ->> 'rationale'),
                         'members', (select jsonb_agg(mm ->> 'participantId') from jsonb_array_elements(t -> 'members') mm)) order by round) from tbl) as tables,
                (select jsonb_agg(jsonb_build_object('rank', x -> 'rank', 'participantId', x ->> 'targetParticipantId', 'reason', coalesce(nullif(x -> 'reasons' ->> 0, ''), x ->> 'memberHint')) order by (x ->> 'rank')::int) from rec) as recs,
                (select jsonb_object_agg(e ->> 'participantId', jsonb_build_object('name', e ->> 'displayName', 'org', e ->> 'company', 'role', e ->> 'role'))
                   from pub cross join lateral jsonb_array_elements(case when jsonb_typeof(pub.d -> 'directory') = 'array' then pub.d -> 'directory' else '[]'::jsonb end) e
                  where e ->> 'participantId' in (select id from ids)) as names`,
        [workspaceId, eventId, participantId],
      );
      const row = result.rows[0] ?? {};
      const parse = <T,>(value: unknown, fallback: T): T => (value == null ? fallback : (typeof value === "string" ? JSON.parse(value) : value) as T);
      return {
        names: parse(row.names, {} as Record<string, { name: string; org: string | null; role: string | null }>),
        published: row.published === true,
        recommendations: parse(row.recs, [] as Array<{ rank: number; participantId: string; reason: string | null }>).map((item) => ({ participantId: String(item.participantId), rank: num(item.rank), reason: item.reason ?? null })),
        tables: parse(row.tables, [] as Array<{ round: number; tableNumber: number; theme: string | null; why: string | null; members: string[] }>),
      };
    },

    /** 概要の「マッチ可能」「プロフィール未完了」：申込者の資料完成度を DB で数えるだけ（資料は運ばない）。 */
    async applicantScoreCounts(eventId: string, answerKeys: readonly string[], coverageWeights: Readonly<Record<string, number>>): Promise<{ incomplete: number; matchable: number }> {
      const result = await client.query<{ incomplete: number; matchable: number }>(
        `select count(*) filter (where s.score < 100)::int as incomplete, count(*) filter (where s.status = 'admitted' and s.score = 100)::int as matchable
           from (select a.status, ${applicationScoreSql("a", "$4", "$3")} as score from event_ops_admission_application_heads a
                  where a.workspace_id = $1 and a.event_id = $2 and a.status in ('pending_review', 'admitted', 'waitlisted')) s`,
        [workspaceId, eventId, [...answerKeys], JSON.stringify(coverageWeights)],
      );
      return { incomplete: num(result.rows[0]?.incomplete), matchable: num(result.rows[0]?.matchable) };
    },

    /** レポートの「立場」：承認済み申込者の主催者第 1 問の回答（「 · 」の前）ごとの人数。 */
    async firstAnswerCounts(eventId: string, questionId: string): Promise<Array<{ label: string; count: number }>> {
      const result = await client.query<{ label: string; n: number }>(
        `select split_part(r.payload -> 'answers' ->> $3, ' · ', 1) as label, count(*)::int as n
           from event_ops_admission_application_heads a
           join orbit_records r on r.workspace_id = a.workspace_id and r.collection_name = 'eventHostAnswers' and r.user_id = a.actor_id and r.lifecycle_state <> 'deleted' and r.payload ->> 'eventId' = a.event_id
          where a.workspace_id = $1 and a.event_id = $2 and a.status = 'admitted' and coalesce(r.payload -> 'answers' ->> $3, '') <> ''
          group by 1 order by min(a.submitted_at)`,
        [workspaceId, eventId, questionId],
      );
      return result.rows.filter((row) => row.label).map((row) => ({ count: num(row.n), label: row.label }));
    },

    /** 申込者（一个 bucket），带资料回答与本主办方参加歴。 */
    async applicants(eventId: string, organizerActorId: string, statuses: readonly string[]): Promise<Array<{ actorId: string; status: string; version: number; payload: { displayName?: string; answers?: Record<string, string> }; hostAnswers: Record<string, string>; submittedAt: string; attendCount: number }>> {
      const result = await client.query<Row>(
        `select a.actor_id, a.status, a.application_version, a.profile_payload, a.submitted_at,
                (select r.payload -> 'answers' from orbit_records r where r.workspace_id = a.workspace_id and r.collection_name = 'eventHostAnswers' and r.user_id = a.actor_id and r.lifecycle_state <> 'deleted' and r.payload ->> 'eventId' = a.event_id limit 1) as host_answers,
                (select count(*) from event_ops_checkins c join event_ops_events oe on oe.workspace_id = c.workspace_id and oe.event_id = c.event_id
                  where c.workspace_id = a.workspace_id and c.actor_id = a.actor_id and oe.organizer_actor_id = $3 and c.event_id <> a.event_id) as attend_count
           from event_ops_admission_application_heads a
          where a.workspace_id = $1 and a.event_id = $2 and a.status = any($4::text[])
          order by a.submitted_at, a.actor_id`,
        [workspaceId, eventId, organizerActorId, statuses],
      );
      return result.rows.map((row) => ({ actorId: String(row.actor_id), attendCount: num(row.attend_count), hostAnswers: ((typeof row.host_answers === "string" ? JSON.parse(row.host_answers) : row.host_answers) ?? {}) as Record<string, string>, payload: (typeof row.profile_payload === "string" ? JSON.parse(row.profile_payload) : row.profile_payload) as { displayName?: string; answers?: Record<string, string> }, status: String(row.status), submittedAt: iso(row.submitted_at)!, version: num(row.application_version) }));
    },

    /**
     * 受付名单：已报名（含签到状态、番号）+ キャンセル待ち。只取显示用的几列（名字 / 公司 / 职位 / 立场一句），不带整份资料。
     * Name / company / role: the admission application when there is one; otherwise (first-come
     * registrations, imported events) the member's own event profile snapshot.
     * 选项：q = 名字・公司里包含的文字（库里筛）；limit；participantIds = 只要这些人；withTables = 为返回的这几行查第一轮桌号
     * （只在库里展开已发布分组，不把分组 JSON 传回来）。
     */
    async kioskRoster(eventId: string, options: { q?: string; limit?: number; participantIds?: readonly string[]; withTables?: boolean } = {}): Promise<Array<{ actorId: string; participantId: string | null; name: string; org: string | null; role: string | null; status: "not_arrived" | "checked_in" | "waitlisted"; checkedInAt: string | null; receptionNumber: string | null; answers: Record<string, string>; tableNumber: number | null }>> {
      const result = await client.query<Row>(
        `with roster as (
           select m.actor_id, m.participant_id, c.checked_in_at, r.reception_no, 'member' as kind,
                  coalesce(nullif(trim(a.profile_payload ->> 'displayName'), ''), v.profile_payload #>> '{participant,displayName}') as name,
                  a.profile_payload #>> '{answers,positioning}' as positioning,
                  v.profile_payload #>> '{participant,company}' as company, v.profile_payload #>> '{participant,role}' as role
             from event_ops_membership_heads m
             left join event_ops_profile_versions v on v.workspace_id = m.workspace_id and v.event_id = m.event_id and v.participant_id = m.participant_id and v.profile_version = m.profile_version
             left join event_ops_checkins c on c.workspace_id = m.workspace_id and c.event_id = m.event_id and c.participant_id = m.participant_id
             left join event_reception_numbers r on r.workspace_id = m.workspace_id and r.event_id = m.event_id and r.actor_id = m.actor_id
             left join event_ops_admission_application_heads a on a.workspace_id = m.workspace_id and a.event_id = m.event_id and a.actor_id = m.actor_id
            where m.workspace_id = $1 and m.event_id = $2 and m.status = 'rsvped'
           union all
           select a.actor_id, null, null, null, 'waitlist', a.profile_payload ->> 'displayName', a.profile_payload #>> '{answers,positioning}', null, null
             from event_ops_admission_application_heads a
            where a.workspace_id = $1 and a.event_id = $2 and a.status = 'waitlisted'
         ), picked as (
           select * from roster
            where ($3 = '' or strpos(concat_ws(' ', name, positioning, company), $3) > 0)
              and ($4::text[] is null or participant_id = any($4::text[]))
            order by reception_no nulls last, name, actor_id
            limit $5
         )
         select p.*,
                case when $6 and p.participant_id is not null then (
                  select (t ->> 'tableNumber')::int
                    from event_ops_publication_heads ph
                    join event_ops_publications pub on pub.workspace_id = ph.workspace_id and pub.publication_id = ph.publication_id
                    cross join lateral jsonb_array_elements(pub.published_dto #> '{grouping,roundOne}') t
                   where ph.workspace_id = $1 and ph.event_id = $2
                     and exists (select 1 from jsonb_array_elements(t -> 'members') mm where mm ->> 'participantId' = p.participant_id)
                   limit 1) end as table_number
           from picked p`,
        [workspaceId, eventId, options.q?.trim() ?? "", options.participantIds ? [...options.participantIds] : null, options.limit ?? null, options.withTables === true],
      );
      const textOf = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
      return result.rows.map((row) => ({
        actorId: String(row.actor_id),
        answers: textOf(row.positioning) ? { positioning: textOf(row.positioning)! } : {},
        checkedInAt: iso(row.checked_in_at),
        name: textOf(row.name) ?? "",
        org: textOf(row.company),
        participantId: (row.participant_id as string | null) ?? null,
        receptionNumber: (row.reception_no as string | null) ?? null,
        role: textOf(row.role),
        status: row.kind === "waitlist" ? "waitlisted" : row.checked_in_at ? "checked_in" : "not_arrived",
        tableNumber: row.table_number === null || row.table_number === undefined ? null : num(row.table_number),
      }));
    },

    /** 受付の人数：参加中の総数と受付済み（库里数，不读名单）。 */
    async kioskCounts(eventId: string): Promise<{ members: number; checkedIn: number }> {
      const result = await client.query<{ members: number; checked_in: number }>(
        `select count(*)::int as members, count(c.participant_id)::int as checked_in
           from event_ops_membership_heads m
           left join event_ops_checkins c on c.workspace_id = m.workspace_id and c.event_id = m.event_id and c.participant_id = m.participant_id
          where m.workspace_id = $1 and m.event_id = $2 and m.status = 'rsvped'`,
        [workspaceId, eventId],
      );
      return { checkedIn: num(result.rows[0]?.checked_in), members: num(result.rows[0]?.members) };
    },

    /** 交换：双方都确认的（contact request accepted）。按 requester / target 各自计人。 */
    async exchanges(eventId: string): Promise<{ pairs: number; people: number; byParticipant: Map<string, number> }> {
      const result = await client.query<{ requester_participant_id: string; target_participant_id: string }>(`select requester_participant_id, target_participant_id from event_ops_contact_requests where workspace_id = $1 and event_id = $2 and status = 'accepted'`, [workspaceId, eventId]);
      const byParticipant = new Map<string, number>();
      for (const row of result.rows) for (const id of [row.requester_participant_id, row.target_participant_id]) byParticipant.set(id, (byParticipant.get(id) ?? 0) + 1);
      return { byParticipant, pairs: result.rows.length, people: byParticipant.size };
    },

    async publishedGrouping(eventId: string): Promise<{ roundOne: Array<{ tableNumber: number; members: Array<{ participantId: string }> }> } | null> {
      // Only table numbers and member ids leave the database (not themes, rationales or prompts).
      const result = await client.query<{ grouping: unknown }>(
        `select jsonb_build_object('roundOne', coalesce((
                  select jsonb_agg(jsonb_build_object('tableNumber', t -> 'tableNumber', 'members',
                           coalesce((select jsonb_agg(jsonb_build_object('participantId', mm -> 'participantId')) from jsonb_array_elements(t -> 'members') mm), '[]'::jsonb)))
                    from jsonb_array_elements(p.published_dto #> '{grouping,roundOne}') t), '[]'::jsonb)) as grouping
           from event_ops_publication_heads h join event_ops_publications p on p.workspace_id = h.workspace_id and p.publication_id = h.publication_id
          where h.workspace_id = $1 and h.event_id = $2`,
        [workspaceId, eventId],
      );
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
