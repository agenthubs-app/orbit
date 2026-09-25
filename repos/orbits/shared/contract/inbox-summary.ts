/** Read-only counts from bounded, permission-checked summary readers. */
export type InboxSummaryDTO = {
  actorId: string;
  messagesUnread: number;
  asOf: string;
  notificationMode: 'legacy' | 'typed';
  notificationRead: 'ready';
  notificationsUnread: number;
};
