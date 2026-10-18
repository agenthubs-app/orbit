import type { EventDiscoverRow } from '../../../shared/contract/event-discover';
import type { InboxNotificationDTO } from '../../../shared/contract/inbox-notifications';
import { inboxNotificationWriteSchema } from '../../../shared/api-schema/inbox-notifications';
import { inboxNotificationId, type InboxNotificationUpsert } from '../inbox-record-service';
import type { InboxRecordRepository } from '../storage/inbox-record-repository';

/** The discover service has already removed feedback and registrations; these sets protect direct callers too. */
export function selectDailyRecommendation(rows: readonly EventDiscoverRow[], dismissed: ReadonlySet<string>, registered: ReadonlySet<string>): EventDiscoverRow | null {
  return [...rows]
    .filter(row => row.eventId && !dismissed.has(row.eventId) && !registered.has(row.eventId)
      && row.href.startsWith('/') && Number.isFinite(row.score) && row.score! > 0 && row.verdict !== 'skip')
    .sort((a, b) => (b.score! - a.score!) || a.eventId.localeCompare(b.eventId))[0] ?? null;
}

/** One semantic slot per actor and Tokyo day; R26 event-pick signatures remain independent. */
export function dailyRecommendationNotification(actorId: string, row: EventDiscoverRow, tokyoDate: string, at: string): InboxNotificationUpsert {
  return {
    actorId,
    actions: ['read', 'dismiss'],
    kind: 'suggestion',
    origin: 'automation',
    occurredAt: at,
    semanticKey: `secretary-daily:${tokyoDate}`,
    title: `今日のおすすめ：${row.title}`.slice(0, 1000),
    reason: (row.reason?.trim() || '今の目標に合うイベントです。').slice(0, 4000),
    sources: [{ sourceKind: 'event_pick', sourceId: row.eventId, sourceRevision: `daily:${tokyoDate}`, occurredAt: at, readAt: at, objectId: row.eventId }],
    target: { kind: 'event', id: row.eventId, href: row.href, status: 'available' },
  };
}

/** A transaction protects the one slot per actor/day. A newly eligible event replaces stale content without reusing its read/action receipts. */
export async function writeDailySlot(repository: InboxRecordRepository, actorId: string, row: EventDiscoverRow, tokyoDate: string, at: string): Promise<InboxNotificationDTO> {
  const raw = dailyRecommendationNotification(actorId, row, tokyoDate, at);
  const id = inboxNotificationId(actorId, raw.semanticKey);
  return repository.transaction(actorId, async transaction => {
    const previous = await transaction.get(id);
    if (previous?.notification.target.id === row.eventId && previous.notification.disposition !== 'archived') return previous.notification;
    const notification = inboxNotificationWriteSchema.parse({
      ...raw, id, revision: (previous?.notification.revision ?? 0) + 1,
      readAt: null, disposition: 'open', updatedAt: at,
    });
    await transaction.save({ notification, operations: {} });
    return notification;
  });
}

/** An empty daily selection retires a prior pick in the same slot. */
export async function clearDailySlot(repository: InboxRecordRepository, actorId: string, tokyoDate: string, at: string): Promise<boolean> {
  const id = inboxNotificationId(actorId, `secretary-daily:${tokyoDate}`);
  return repository.transaction(actorId, async transaction => {
    const previous = await transaction.get(id);
    if (!previous || previous.notification.disposition === 'archived') return false;
    await transaction.save({ ...previous, notification: {
      ...previous.notification, disposition: 'archived', revision: previous.notification.revision + 1, updatedAt: at,
    } });
    return true;
  });
}

/** One bounded maintenance pass; the cursor lets the next pass reach later actors. */
export async function runSecretaryDigest(input: {
  actors(after: string, limit: number): Promise<string[]>;
  recommendations(actorId: string): Promise<readonly EventDiscoverRow[]>;
  write(actorId: string, winner: EventDiscoverRow, tokyoDate: string, at: string): Promise<unknown>;
  clear(actorId: string, tokyoDate: string, at: string): Promise<boolean>;
  at: Date;
  after: string;
  limit: number;
}): Promise<{ examined: number; written: number; cleared: number; nextCursor: string }> {
  const actors = await input.actors(input.after, input.limit);
  const at = input.at.toISOString();
  const tokyoDate = new Date(input.at.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  let written = 0;
  let cleared = 0;
  for (const actorId of actors) {
    const winner = selectDailyRecommendation(await input.recommendations(actorId), new Set(), new Set());
    if (!winner) { if (await input.clear(actorId, tokyoDate, at)) cleared += 1; continue; }
    await input.write(actorId, winner, tokyoDate, at);
    written += 1;
  }
  return { examined: actors.length, written, cleared, nextCursor: actors.length === input.limit ? actors.at(-1)! : '' };
}
