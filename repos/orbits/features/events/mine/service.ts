/**
 * R26 `GET /api/events/mine`（新契约 events-mine；events DESIGN §4.1）。Owner: 甲 (R26).
 * Used by: 参加予定页签（两端）、首页「次のイベント」（R10）、手入力「出会った場所」候选（R26-06）、每天一问的活动选项（R26-07）。
 *
 * - 来源（都只读本人的，有界）：报名（membership：rsvped → registered、cancelled → cancelled）、审核（pending_review / waitlisted /
 *   rejected，withdrawn 归 cancelled）、签到（本人或代签 → attended）、计划里的活动条目（没报名 → planned；外部活动 = 我的评估）。
 * - `upcoming` = 开始时间在现在之后（或今天还没结束），按开始时间升序；`past` 降序。取消的不算进 `upcomingCount`（复核：参加予定不含取消）。
 * - 同一场活动多个来源时取「最强」状态：attended > registered > pending_review > waitlisted > planned > rejected > cancelled。
 */
import { eventEmoji } from "../../../shared/compute/event-emoji";
import type { MyEventItem, MyEventStatus, MyEventsRange, MyEventsResponse } from "../../../shared/contract/events-mine";

export interface MyEventSourceRow {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  emoji?: string | null;
  status: MyEventStatus;
  assessmentId?: string | null;
  score?: number | null;
  /** 外部活动（我的评估）。 */
  external?: boolean;
}

export interface MyEventsReader {
  /** 本人相关的全部活动行（各来源分别给，可重复；调用方合并）。`from` / `until` 是开始时间的有界窗口。 */
  rows(actorId: string, window: { from: string; until: string; limit: number }): Promise<MyEventSourceRow[]>;
  /** 会いたい人：计划人物类型匹配的预计人数与头像首字（可选）。 */
  meet?(actorId: string, eventIds: readonly string[]): Promise<Record<string, { count: number; initials: string[] }>>;
}

const RANK: Record<MyEventStatus, number> = { attended: 7, registered: 6, pending_review: 5, waitlisted: 4, planned: 3, rejected: 2, cancelled: 1 };
/** 窗口：过去 180 天到未来 365 天（有界）。 */
export const MY_EVENTS_PAST_DAYS = 180;
export const MY_EVENTS_FUTURE_DAYS = 365;
const DAY = 86_400_000;

export function mergeMyEvents(rows: readonly MyEventSourceRow[]): MyEventSourceRow[] {
  const byId = new Map<string, MyEventSourceRow>();
  for (const row of rows) {
    const current = byId.get(row.eventId);
    if (!current || RANK[row.status] > RANK[current.status]) byId.set(row.eventId, { ...current, ...row, assessmentId: row.assessmentId ?? current?.assessmentId ?? null, score: row.score ?? current?.score ?? null });
    else if (current && !current.assessmentId && row.assessmentId) byId.set(row.eventId, { ...current, assessmentId: row.assessmentId, score: row.score ?? current.score ?? null });
  }
  return [...byId.values()];
}

/** 还没结束（结束时间在现在之后；没有结束时间按开始后 3 小时）。 */
export function isUpcoming(row: Pick<MyEventSourceRow, "startsAt" | "endsAt">, now: Date): boolean {
  const end = row.endsAt ? Date.parse(row.endsAt) : Date.parse(row.startsAt) + 3 * 3_600_000;
  return Number.isFinite(end) && end > now.getTime();
}

export function myEventHref(row: Pick<MyEventSourceRow, "eventId" | "assessmentId" | "external">, platform: "web" | "app"): string {
  if (row.external && row.assessmentId) return platform === "app" ? `/events/assessments/${row.assessmentId}` : `/app/events/assessments/${row.assessmentId}`;
  return platform === "app" ? `/events/${row.eventId}` : `/app/events/${row.eventId}`;
}

export function createMyEventsService(deps: { reader: MyEventsReader; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  return {
    async list(actorId: string, input: { range: MyEventsRange; limit: number; platform: "web" | "app" }): Promise<MyEventsResponse> {
      const at = now();
      const from = new Date(at.getTime() - MY_EVENTS_PAST_DAYS * DAY).toISOString();
      const until = new Date(at.getTime() + MY_EVENTS_FUTURE_DAYS * DAY).toISOString();
      const merged = mergeMyEvents(await deps.reader.rows(actorId, { from, limit: 200, until }));
      const upcoming = merged.filter((row) => isUpcoming(row, at));
      const past = merged.filter((row) => !isUpcoming(row, at));
      const upcomingCount = upcoming.filter((row) => row.status !== "cancelled" && row.status !== "rejected").length;
      const picked = (input.range === "upcoming"
        ? upcoming.filter((row) => row.status !== "rejected").sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        : past.sort((a, b) => b.startsAt.localeCompare(a.startsAt))).slice(0, input.limit);
      const meet = deps.reader.meet && input.range === "upcoming" ? await deps.reader.meet(actorId, picked.filter((row) => !row.external).map((row) => row.eventId)).catch(() => ({})) : {};
      const items: MyEventItem[] = picked.map((row) => ({
        emoji: row.emoji ?? eventEmoji({ title: row.title }),
        endsAt: row.endsAt,
        eventId: row.eventId,
        href: myEventHref(row, input.platform),
        startsAt: row.startsAt,
        status: row.status,
        title: row.title,
        venue: row.venue,
        ...(row.assessmentId ? { assessmentId: row.assessmentId } : {}),
        ...(typeof row.score === "number" ? { score: row.score } : {}),
        ...((meet as Record<string, { count: number; initials: string[] }>)[row.eventId] ? { meetCount: (meet as Record<string, { count: number; initials: string[] }>)[row.eventId]!.count, meetInitials: (meet as Record<string, { count: number; initials: string[] }>)[row.eventId]!.initials.slice(0, 4) } : {}),
      }));
      return { asOf: at.toISOString(), items, range: input.range, upcomingCount };
    },
  };
}

type Query = (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
const iso = (value: unknown): string | null => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : String(value));

/** live：报名 / 审核 / 签到（event_ops_*）+ 计划活动条目（plan_items）+ 我的外部评估（event_assessments）。 */
export function createPostgresMyEventsReader(input: { query: Query; workspaceId: string; assessmentsReady?: () => Promise<void>; strict?: boolean }): MyEventsReader {
  return {
    async rows(actorId, window) {
      const registrations = await input.query(
        `with mine as (
           select event_id, status from event_ops_membership_heads where workspace_id = $1 and actor_id = $2
         ), apps as (
           select event_id, status from event_ops_admission_application_heads where workspace_id = $1 and actor_id = $2
         ), checked as (
           select event_id from event_ops_checkins where workspace_id = $1 and actor_id = $2
         ), planned as (
           select distinct i.linked_event_id as event_id from plan_items i join plans p on p.workspace_id = i.workspace_id and p.actor_id = i.actor_id and p.id = i.plan_id
           where i.workspace_id = $1 and i.actor_id = $2 and i.kind = 'event' and p.status = 'active' and i.linked_event_id not like 'assessment:%'
         ), ids as (
           select event_id from mine union select event_id from apps union select event_id from checked union select event_id from planned
         )
         select e.event_id, e.title, e.starts_at, e.ends_at, e.venue, e.lifecycle_state_v2, e.source_payload->>'emoji' as emoji,
                m.status as membership, a.status as application, (c.event_id is not null) as attended, (pl.event_id is not null) as planned
         from ids join event_ops_events e on e.workspace_id = $1 and e.event_id = ids.event_id
         left join mine m on m.event_id = ids.event_id
         left join apps a on a.event_id = ids.event_id
         left join checked c on c.event_id = ids.event_id
         left join planned pl on pl.event_id = ids.event_id
         where e.lifecycle_state_v2 in ('published', 'cancelled') and e.starts_at >= $3::timestamptz and e.starts_at < $4::timestamptz
         order by e.starts_at limit $5`,
        [input.workspaceId, actorId, window.from, window.until, window.limit],
      ).catch((error: { code?: string }) => (error?.code === "42P01" && !input.strict ? { rows: [] } : Promise.reject(error)));
      const out: MyEventSourceRow[] = registrations.rows.flatMap((row) => {
        const startsAt = iso(row.starts_at);
        if (!startsAt) return [];
        const base = { emoji: (row.emoji as string | null) ?? null, endsAt: iso(row.ends_at), eventId: String(row.event_id), startsAt, title: String(row.title ?? ""), venue: (row.venue as string | null) ?? null };
        const statuses: MyEventStatus[] = [];
        if (row.lifecycle_state_v2 === "cancelled") statuses.push("cancelled");
        if (row.attended) statuses.push("attended");
        if (row.membership === "rsvped") statuses.push("registered");
        if (row.membership === "cancelled") statuses.push("cancelled");
        const application = row.application as string | null;
        if (application === "pending_review" || application === "waitlisted" || application === "rejected") statuses.push(application);
        if (application === "withdrawn") statuses.push("cancelled");
        if (application === "admitted") statuses.push("registered");
        if (row.planned) statuses.push("planned");
        if (row.lifecycle_state_v2 === "cancelled") return [{ ...base, status: "cancelled" as const }];
        return statuses.map((status) => ({ ...base, status }));
      });
      // 我的外部评估（加入计划的）：只对本人。
      if (input.assessmentsReady) {
        if (input.strict) await input.assessmentsReady();
        else await input.assessmentsReady().catch(() => undefined);
      }
      const external = await input.query(
        `select id, facts, total from event_assessments where workspace_id = $1 and actor_id = $2 and user_decision = 'added' and event_id is null
           and (facts->>'startsAt') >= $3 and (facts->>'startsAt') < $4 order by facts->>'startsAt' limit $5`,
        [input.workspaceId, actorId, window.from, window.until, window.limit],
      ).catch((error: { code?: string }) => (error?.code === "42P01" && !input.strict ? { rows: [] } : Promise.reject(error)));
      for (const row of external.rows) {
        const facts = (row.facts ?? {}) as { title?: string; startsAt?: string; endsAt?: string; venue?: string };
        if (!facts.startsAt) continue;
        out.push({ assessmentId: String(row.id), endsAt: facts.endsAt ?? null, eventId: `assessment:${String(row.id)}`, external: true, score: Number(row.total ?? 0), startsAt: facts.startsAt, status: "planned", title: facts.title ?? "", venue: facts.venue ?? null });
      }
      // 库内活动的评估分（参加予定卡上不显示分，但给 R10 / 详情用）。
      const ids = [...new Set(out.filter((row) => !row.external).map((row) => row.eventId))];
      if (ids.length) {
        const scoresRead = input.query(`select id, event_id, total from event_assessments where workspace_id = $1 and actor_id = $2 and event_id = any($3::text[])`, [input.workspaceId, actorId, ids]);
        const scores = input.strict ? await scoresRead : await scoresRead.catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
        const byEvent = new Map(scores.rows.map((row) => [String(row.event_id), { assessmentId: String(row.id), score: Number(row.total ?? 0) }]));
        for (const row of out) { const found = byEvent.get(row.eventId); if (found && !row.external) { row.assessmentId = found.assessmentId; row.score = found.score; } }
      }
      return out;
    },
  };
}
