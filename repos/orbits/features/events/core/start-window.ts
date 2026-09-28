/**
 * 活动开始时间窗口的专用投影（Sprint W0021，只供名片活动归属使用）。
 *
 * 归属只需要「已发布、开始时间落在 [from, to) 的活动」的 id、标题与开始时间，不需要整份
 * `PublishedCanonicalEvent`（描述、来源载荷等大字段）。这里在数据库层按
 * `workspace_id + lifecycle_state_v2 + starts_at` 粗筛（走 `event_ops_events_public_catalogue_idx`），
 * 只取三列，所以单次读取不随 workspace 的活动总数增长。
 *
 * - 半开区间：`starts_at >= from and starts_at < to`，不用 `BETWEEN`。
 * - 参数一律是带时区的 ISO 时间，显式转成 `timestamptz`，结果不依赖数据库 session timezone。
 * - 这不是 `PublishedCanonicalEvent`：不带 `endsAt`／`timezone`，也不做它的完整校验；只校验
 *   窗口内的行本身（标题非空、开始时间可解析），否则抛 `EventCoreDataError`（调用方按读取失败处理）。
 * - 逐卡判定与平局规则仍在 `features/plans/event-attribution.ts`，这里只做粗筛。
 */
import { EventCoreDataError } from "./contract";
import type { EventOperationsSqlExecutor } from "../event-operations/storage/postgres-client";

export interface EventStartWindowRecord {
  eventId: string;
  /** 去掉首尾空白后的标题（与 `PublishedCanonicalEvent.title` 同一口径）。 */
  title: string;
  /** ISO 时间（毫秒精度，UTC）。 */
  startsAt: string;
}

export interface EventStartWindowReader {
  /** 已发布、开始时间落在 [fromIso, toIso) 的活动，按开始时间、event_id 正序。 */
  listPublishedStartingBetween(fromIso: string, toIso: string): Promise<EventStartWindowRecord[]>;
}

export const EVENT_START_WINDOW_SQL = `select event_id, title, starts_at
  from event_ops_events
 where workspace_id = $1
   and lifecycle_state_v2 = 'published'
   and starts_at >= $2::timestamptz
   and starts_at < $3::timestamptz
 order by starts_at, event_id`;

function isoInstant(value: string, field: string): string {
  const time = Date.parse(value);
  // 只接受带时区的 ISO 时间：不带时区的字符串会被数据库按 session timezone 解释。
  if (!Number.isFinite(time) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    throw new EventCoreDataError("EVENT_CORE_INVALID_TIME_RANGE", `Event start window ${field} must be an ISO instant with a time zone.`);
  }
  return new Date(time).toISOString();
}

function recordFromRow(row: Record<string, unknown>): EventStartWindowRecord {
  const eventId = row.event_id;
  if (typeof eventId !== "string" || !eventId) {
    throw new EventCoreDataError("EVENT_CORE_ROW_INVALID", "Event start window row is missing event_id.");
  }
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) {
    throw new EventCoreDataError("EVENT_CORE_INVALID_PUBLISHED_EVENT", `Published event ${eventId} is missing title.`);
  }
  const raw = row.starts_at;
  const time = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  if (!Number.isFinite(time)) {
    throw new EventCoreDataError("EVENT_CORE_ROW_INVALID", `Published event ${eventId} has invalid starts_at.`);
  }
  return { eventId, startsAt: new Date(time).toISOString(), title };
}

export function createPostgresEventStartWindowReader(input: {
  client: EventOperationsSqlExecutor;
  workspaceId: string;
}): EventStartWindowReader {
  const { client, workspaceId } = input;
  return {
    async listPublishedStartingBetween(fromIso, toIso) {
      const from = isoInstant(fromIso, "from");
      const to = isoInstant(toIso, "to");
      if (Date.parse(from) >= Date.parse(to)) return [];
      const result = await client.query<Record<string, unknown>>(EVENT_START_WINDOW_SQL, [workspaceId, from, to]);
      return result.rows.map(recordFromRow);
    },
  };
}
