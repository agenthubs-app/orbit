import type { InboxNotificationDTO, InboxNotificationListDTO } from '../contract/inbox-notifications';
import type { SecretaryCardKind, SecretaryPreviewDTO, SecretaryPreviewItemDTO } from '../contract/secretary-preview';
import { compareInboxNewestFirst, isActiveInboxNotification, type InboxSourceState } from './inbox-local';
import { parseTimestamp } from './compute-text';

export interface SecretaryCandidate {
  notification: InboxNotificationDTO;
  sourceState: InboxSourceState;
}

/** D-16 is dormant: keep the enum for future compatibility but never show its rows. */
export function withoutMailSummary<T extends Pick<InboxNotificationDTO, 'sources'>>(rows: readonly T[]): T[] {
  return rows.filter(row => !row.sources.some(source => source.sourceKind === 'mail_summary'));
}

/** Only an explicit secretary source can enter the preview. Daily picks have their own semantic key. */
export function secretaryKind(notification: InboxNotificationDTO): SecretaryCardKind | null {
  const source = notification.sources.find(item => item.sourceKind === 'event_deadline' || item.sourceKind === 'event_prep' || item.sourceKind === 'event_pick');
  if (!source) return null;
  if (source.sourceKind === 'event_deadline' || source.sourceKind === 'event_prep') return source.sourceKind;
  return notification.semanticKey.startsWith('secretary-daily:') ? 'daily_recommendation' : 'event_pick';
}

/** A category page may sit behind many ordinary rows. Keep the server's global unread count. */
export async function scanSecretaryNotificationPage(
  load: (cursor?: string) => Promise<InboxNotificationListDTO>,
  after?: string,
): Promise<InboxNotificationListDTO> {
  const seen = new Set<string>();
  const items: InboxNotificationDTO[] = [];
  let cursor = after;
  let first: InboxNotificationListDTO | null = null;
  for (let count = 0; count < 100; count += 1) {
    const page = await load(cursor);
    first ??= page;
    items.push(...page.items.filter(item => secretaryKind(item) !== null && item.target.status === 'available'));
    if (!page.nextCursor || items.length >= 50) return { ...first, items, nextCursor: page.nextCursor };
    if (seen.has(page.nextCursor)) throw new Error('Secretary inbox cursor repeated');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('Secretary inbox page budget exceeded');
}

/** Deduplicate before taking three; an R26 reason wins over a daily recommendation for the same event. */
export function buildSecretaryPreview(actorId: string, candidates: readonly SecretaryCandidate[], asOf: string): SecretaryPreviewDTO {
  const nowMs = parseTimestamp(asOf);
  const byEvent = new Map<string, SecretaryPreviewItemDTO>();
  for (const { notification, sourceState } of candidates) {
    const kind = secretaryKind(notification);
    if (!kind || notification.sources.some(source => source.sourceKind === 'mail_summary')
      || notification.actorId !== actorId || sourceState !== 'available' || notification.target.status !== 'available'
      || notification.target.kind !== 'event' || !notification.target.href || !isActiveInboxNotification(notification, nowMs)
      || (notification.expiresAt && parseTimestamp(notification.expiresAt) <= nowMs)) continue;
    const eventId = notification.target.id;
    if (!eventId) continue;
    const item = { key: `${eventId}:${kind}`, eventId, kind, notification };
    const prior = byEvent.get(eventId);
    if (!prior || (kind === 'event_pick' && prior.kind === 'daily_recommendation')
      || (kind !== 'daily_recommendation' || prior.kind !== 'event_pick') && compareInboxNewestFirst(notification, prior.notification) < 0) {
      byEvent.set(eventId, item);
    }
  }
  const all = [...byEvent.values()].sort((a, b) => compareInboxNewestFirst(a.notification, b.notification));
  return { actorId, items: all.slice(0, 3), hasMore: all.length > 3, asOf };
}
