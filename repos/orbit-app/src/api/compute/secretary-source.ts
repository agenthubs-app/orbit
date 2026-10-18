import type { InboxNotificationDTO } from '../contract/inbox-notifications';
import type { SecretaryCardKind, SecretaryPreviewDTO, SecretaryPreviewItemDTO } from '../contract/secretary-preview';
import { compareInboxNewestFirst, isActiveInboxNotification, type InboxSourceState } from './inbox-local';

export interface SecretaryCandidate {
  notification: InboxNotificationDTO;
  sourceState: InboxSourceState;
}

/** Only an explicit secretary source can enter the preview. Daily picks have their own semantic key. */
export function secretaryKind(notification: InboxNotificationDTO): SecretaryCardKind | null {
  const source = notification.sources.find(item => item.sourceKind === 'event_deadline' || item.sourceKind === 'event_prep' || item.sourceKind === 'event_pick');
  if (!source) return null;
  if (source.sourceKind === 'event_deadline' || source.sourceKind === 'event_prep') return source.sourceKind;
  return notification.semanticKey.startsWith('secretary-daily:') ? 'daily_recommendation' : 'event_pick';
}

/** Deduplicate before taking three; an R26 reason wins over a daily recommendation for the same event. */
export function buildSecretaryPreview(actorId: string, candidates: readonly SecretaryCandidate[], asOf: string): SecretaryPreviewDTO {
  const nowMs = Date.parse(asOf);
  const byEvent = new Map<string, SecretaryPreviewItemDTO>();
  for (const { notification, sourceState } of candidates) {
    const kind = secretaryKind(notification);
    if (!kind || notification.actorId !== actorId || sourceState !== 'available' || notification.target.status !== 'available'
      || notification.target.kind !== 'event' || !notification.target.href || !isActiveInboxNotification(notification, nowMs)
      || (notification.expiresAt && Date.parse(notification.expiresAt) <= nowMs)) continue;
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
