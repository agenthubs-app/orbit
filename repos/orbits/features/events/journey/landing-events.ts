/**
 * 登录前展示页 ⑤「いま申し込めるイベント」(2026-11-22 landing v2)：真实的公开活动，只读这一屏要显示的列。
 *
 * - SQL：已发布、有公开码、未取消/归档、尚未开始的活动，按开始时间取前 LANDING_SCAN_LIMIT 条（只取 id / 标题 /
 *   会场 / 时区 / 开始时间）；定员与截止、报名人数各一次批量读，只针对这几条。
 * - 只留现在还能报名的（截止未过、未满员），取前 LANDING_EVENT_LIMIT 场。
 * - 一个实例内缓存 60 秒（匿名首页的每次请求不都去读库）；读失败返回 null，页面只留标题和「すべてのイベントを見る」。
 */
import { getConfiguredEventAssessmentRuntime } from "../assessment/configured";
import { readEventOperationsCatalogueSummaries } from "../event-operations/catalogue-summary";

export const LANDING_EVENT_LIMIT = 3;
/** 多读几条，给已截止 / 已满员的留余量。 */
export const LANDING_SCAN_LIMIT = 9;
const CACHE_TTL_MS = 60_000;

export interface LandingEvent {
  eventId: string;
  title: string;
  startsAt: string;
  timezone: string;
  venue: string | null;
  capacity: number | null;
  /** 剩余名额；没有定员时为 null。 */
  seatsLeft: number | null;
}

export interface LandingEventRow {
  eventId: string;
  title: string;
  startsAt: string;
  timezone: string | null;
  venue: string | null;
}

export interface LandingEventPolicy {
  capacity: number | null;
  registrationClosesAt: string | null;
}

/** 纯规则：还能报名（截止未过、未满员）的前 limit 场，按开始时间。 */
export function selectOpenLandingEvents(input: {
  rows: readonly LandingEventRow[];
  policies: ReadonlyMap<string, LandingEventPolicy>;
  registrations: ReadonlyMap<string, number>;
  now: Date;
  limit?: number;
}): LandingEvent[] {
  const at = input.now.getTime();
  const open: LandingEvent[] = [];
  const rows = [...input.rows].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.eventId.localeCompare(b.eventId));
  for (const row of rows) {
    if (!(Date.parse(row.startsAt) > at)) continue;
    const policy = input.policies.get(row.eventId) ?? { capacity: null, registrationClosesAt: null };
    if (policy.registrationClosesAt && Date.parse(policy.registrationClosesAt) <= at) continue;
    const registered = input.registrations.get(row.eventId) ?? 0;
    const seatsLeft = policy.capacity === null ? null : Math.max(0, policy.capacity - registered);
    if (seatsLeft === 0) continue;
    open.push({ capacity: policy.capacity, eventId: row.eventId, seatsLeft, startsAt: row.startsAt, timezone: row.timezone?.trim() || "Asia/Tokyo", title: row.title, venue: row.venue?.trim() || null });
    if (open.length >= (input.limit ?? LANDING_EVENT_LIMIT)) break;
  }
  return open;
}

const iso = (value: unknown): string | null => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : String(value));
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

async function readFromDatabase(now: Date): Promise<LandingEvent[] | null> {
  const runtime = getConfiguredEventAssessmentRuntime();
  if (!runtime) return [];
  const query = (sql: string, values: unknown[]) => runtime.client.query(sql, values) as Promise<{ rows: Array<Record<string, unknown>> }>;
  const events = await query(
    `/* events:landing:open-events */ select event_id, title, venue, timezone, starts_at
       from event_ops_events
      where workspace_id = $1 and lifecycle_state_v2 = 'published'
        and public_code is not null and btrim(public_code) <> ''
        and cancelled_at is null and archived_at is null
        and starts_at > $2::timestamptz
      order by starts_at, event_id
      limit $3`,
    [runtime.workspaceId, now.toISOString(), LANDING_SCAN_LIMIT],
  );
  const rows: LandingEventRow[] = events.rows.flatMap((row) => {
    const eventId = text(row.event_id), title = text(row.title), startsAt = iso(row.starts_at);
    return eventId && title && startsAt ? [{ eventId, startsAt, timezone: text(row.timezone), title, venue: text(row.venue) }] : [];
  });
  if (!rows.length) return [];
  const ids = rows.map((row) => row.eventId);
  const [policyRows, summaries] = await Promise.all([
    query(
      `/* events:landing:policies */ select head.event_id, policy.capacity, policy.registration_closes_at
         from event_ops_admission_policy_heads head
         join event_ops_admission_policy_versions policy on policy.workspace_id = head.workspace_id and policy.event_id = head.event_id and policy.policy_version = head.policy_version
        where head.workspace_id = $1 and head.event_id = any($2::text[]) limit $3`,
      [runtime.workspaceId, ids, ids.length],
    ),
    readEventOperationsCatalogueSummaries(ids),
  ]);
  const policies = new Map(policyRows.rows.map((row) => {
    const capacity = row.capacity === null || row.capacity === undefined ? null : Number(row.capacity);
    return [String(row.event_id), { capacity: capacity !== null && Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null, registrationClosesAt: iso(row.registration_closes_at) }] as const;
  }));
  const registrations = new Map(summaries.map((summary) => [summary.eventId, summary.activeRegistrationCount]));
  return selectOpenLandingEvents({ now, policies, registrations, rows });
}

/** Pixel gate only: non-production with `ORBIT_REDESIGN_MOCK` naming `landing-events` (or `all`) shows the drawing's three sample events. */
export function landingEventsFixtureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false;
  const listed = (env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((entry) => entry.trim());
  return listed.includes("all") || listed.includes("landing-events");
}

/** The three sample events of landing v2 ⑤ (docs/designs/redesign-2026-10/landing/v2.html). */
export const LANDING_EVENTS_FIXTURE: readonly LandingEvent[] = [
  { capacity: 70, eventId: "design-landing-1", seatsLeft: 12, startsAt: "2026-12-12T09:30:00.000Z", timezone: "Asia/Tokyo", title: "日中創新創業交流会 Vol.5", venue: "東京・渋谷" },
  { capacity: 40, eventId: "design-landing-2", seatsLeft: 8, startsAt: "2026-12-19T10:00:00.000Z", timezone: "Asia/Tokyo", title: "AIスタートアップ ミートアップ", venue: "東京・六本木" },
  { capacity: 30, eventId: "design-landing-3", seatsLeft: null, startsAt: "2027-01-16T09:00:00.000Z", timezone: "Asia/Tokyo", title: "海外展開の勉強会と懇親会", venue: "大阪・梅田" },
];

let cached: { at: number; value: LandingEvent[] | null } | null = null;
let inflight: Promise<LandingEvent[] | null> | null = null;

/** 展示页用：失败返回 null（页面不显示列表）。同一实例 60 秒内复用结果，并发请求合并成一次。 */
export async function readLandingEvents(now = new Date()): Promise<LandingEvent[] | null> {
  if (landingEventsFixtureEnabled()) return [...LANDING_EVENTS_FIXTURE];
  if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.value;
  inflight ??= readFromDatabase(now)
    .catch((error: unknown) => {
      console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "landing_events_read_failed" }));
      return null;
    })
    .then((value) => {
      cached = { at: now.getTime(), value };
      return value;
    })
    .finally(() => { inflight = null; });
  return inflight;
}
