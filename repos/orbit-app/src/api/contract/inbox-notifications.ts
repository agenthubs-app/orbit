export type InboxNotificationKind = 'reminder' | 'suggestion' | 'update';
export type InboxNotificationOrigin = 'user' | 'automation' | 'business';
export type InboxNotificationDisposition = 'open' | 'dismissed' | 'handled' | 'accepted' | 'expired' | 'archived';
export type InboxNotificationAction = 'read' | 'dismiss' | 'handle' | 'snooze' | 'accept';
export type InboxSourceKind = 'reminder_plan' | 'task' | 'schedule' | 'appointment' | 'batch' | 'connection' | 'note' | 'message' | 'contact' | 'goal';
export interface InboxNotificationSource {
  sourceKind: InboxSourceKind;
  sourceId: string;
  sourceRevision: string;
  occurredAt: string;
  readAt: string;
  authorId?: string;
  objectId?: string;
  excerpt?: string;
}
export interface InboxNotificationTarget {
  kind: 'task' | 'schedule' | 'appointment' | 'event' | 'conversation' | 'batch' | 'source';
  id: string;
  href: string | null;
  status: 'available' | 'changed' | 'unavailable';
}
export interface InboxNotificationDTO {
  id: string;
  actorId: string;
  revision: number;
  kind: InboxNotificationKind;
  origin: InboxNotificationOrigin;
  semanticKey: string;
  title: string;
  reason: string;
  object?: { id: string; name: string };
  sources: readonly InboxNotificationSource[];
  target: InboxNotificationTarget;
  actions: readonly InboxNotificationAction[];
  occurredAt: string;
  updatedAt: string;
  readAt: string | null;
  dueAt?: string;
  scheduledFor?: string;
  expiresAt?: string;
  disposition: InboxNotificationDisposition;
  legacyId?: string;
  createdTaskId?: string;
  copy?: Readonly<Record<'zh' | 'en' | 'ja', { title: string; reason: string }>>;
}
export interface InboxNotificationListDTO {
  enabled: boolean;
  items: readonly InboxNotificationDTO[];
  unreadCount: number;
  nextCursor: string | null;
  asOf: string;
}
export interface InboxNotificationActionInput {
  action: InboxNotificationAction;
  expectedRevision: number;
  idempotencyKey: string;
  scheduledFor?: string;
}
export interface InboxNotificationActionReceipt {
  notification: InboxNotificationDTO;
  createdTaskId?: string;
}
export interface InboxNotificationReadBatchInput {
  items: readonly { id: string; expectedRevision: number }[];
  idempotencyKey: string;
}
