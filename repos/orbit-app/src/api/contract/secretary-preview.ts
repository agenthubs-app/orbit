import type { InboxNotificationDTO } from './inbox-notifications';

/** The card's meaning is separate from the notification category and source enum. */
export type SecretaryCardKind = 'event_deadline' | 'event_prep' | 'event_pick' | 'daily_recommendation';
export interface SecretaryPreviewItemDTO {
  key: string;
  eventId: string;
  kind: SecretaryCardKind;
  notification: InboxNotificationDTO;
}
export interface SecretaryPreviewDTO {
  actorId: string;
  items: readonly SecretaryPreviewItemDTO[];
  hasMore: boolean;
  asOf: string;
}
