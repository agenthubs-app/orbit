/**
 * W0053（W53-4）：活动导入的来源 = 本人作为 owner 的现场交换（`event_ops_relationship_sides`）。
 *
 * 交换只有在对方接受后才会产生 pair 与两条 side（`onsite-operations-repository` 的接受事务），所以「有 side」就等于
 * 「已互相交换」；待对方确认、已拒绝的请求没有 side，不会出现。只读本人那一侧（owner_actor_id = 本人）；
 * 对方那一侧属于对方。联系人由 outbox 投影异步建出（`contact:event-consent:*`）：还没建出来的显示「同步中」，
 * 这里绝不自行建联系人。
 */
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

export interface EventExchangeRow {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string | null;
  contactId: string;
  acceptedAt: string;
  /** 联系人已投影进本人人脉（活跃、归本人）。 */
  projected: boolean;
  displayName: string;
  organization: string;
  metEventId: string | null;
}

export interface ImportableEventSummary {
  eventId: string;
  title: string;
  startsAt: string | null;
  lastExchangeAt: string;
  /** 已互换（已接受）的人数。 */
  exchanged: number;
  /** 其中已在人脉（联系人已建出）的人数。 */
  inNetwork: number;
  /** 联系人还在同步中的人数。 */
  syncing: number;
  /** 已记为「在该活动认识」的人数。 */
  alreadyMarked: number;
}

const MAX_EXCHANGES = 2_000;

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function listActorEventExchanges(
  executor: TransactionalSqlExecutor,
  input: { workspaceId: string; actorId: string; eventId?: string },
): Promise<EventExchangeRow[]> {
  const result = await executor.query<Record<string, unknown>>(
    `/* contact-import:event-exchanges */
     select p.event_id, coalesce(e.title, '') as event_title, e.starts_at, s.contact_id, p.accepted_at,
            (c.record_id is not null) as projected,
            coalesce(c.payload->>'displayName', '') as display_name,
            coalesce(c.payload->>'organization', '') as organization,
            nullif(c.payload->>'metEventId', '') as met_event_id
     from event_ops_relationship_sides s
     join event_ops_relationship_pairs p
       on p.workspace_id = s.workspace_id and p.relationship_pair_id = s.relationship_pair_id
     left join event_ops_events e on e.workspace_id = p.workspace_id and e.event_id = p.event_id
     left join orbit_records c
       on c.workspace_id = s.workspace_id and c.collection_name = 'contacts' and c.record_id = s.contact_id
      and c.user_id = s.owner_actor_id and c.lifecycle_state = 'active'
      and coalesce(c.payload->>'accountId', s.owner_actor_id) = s.owner_actor_id
     where s.workspace_id = $1 and s.owner_actor_id = $2 and ($3::text is null or p.event_id = $3)
     order by p.accepted_at desc, s.contact_id
     limit ${MAX_EXCHANGES}`,
    [input.workspaceId, input.actorId, input.eventId ?? null],
  );
  return result.rows.map((row) => ({
    acceptedAt: iso(row.accepted_at) ?? "",
    contactId: String(row.contact_id),
    displayName: String(row.display_name ?? ""),
    eventId: String(row.event_id),
    eventStartsAt: iso(row.starts_at),
    eventTitle: String(row.event_title ?? ""),
    metEventId: (row.met_event_id as string | null) ?? null,
    organization: String(row.organization ?? ""),
    projected: row.projected === true,
  }));
}

export function summarizeImportableEvents(rows: readonly EventExchangeRow[]): ImportableEventSummary[] {
  const byEvent = new Map<string, ImportableEventSummary>();
  for (const row of rows) {
    const summary = byEvent.get(row.eventId) ?? {
      alreadyMarked: 0, eventId: row.eventId, exchanged: 0, inNetwork: 0, lastExchangeAt: row.acceptedAt, startsAt: row.eventStartsAt, syncing: 0, title: row.eventTitle,
    };
    summary.exchanged += 1;
    if (row.projected) summary.inNetwork += 1;
    else summary.syncing += 1;
    if (row.projected && row.metEventId === row.eventId) summary.alreadyMarked += 1;
    if (row.acceptedAt > summary.lastExchangeAt) summary.lastExchangeAt = row.acceptedAt;
    byEvent.set(row.eventId, summary);
  }
  return [...byEvent.values()].sort((a, b) => b.lastExchangeAt.localeCompare(a.lastExchangeAt));
}
