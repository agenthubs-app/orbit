/** Read-only counts. A refresh-required notification count is unknown, not zero. */
export type InboxSummaryDTO = {
  actorId: string;
  messagesUnread: number;
  asOf: string;
} & ({
  notificationMode: 'legacy' | 'typed';
  notificationRead: 'ready';
  notificationsUnread: number;
} | {
  notificationMode: 'typed';
  notificationRead: 'refresh-required';
  notificationsUnread: null;
});
