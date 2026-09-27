export type EventContactRequestTransition = "created" | "accepted" | "declined" | "withdrawn";

/**
 * One contact-request transition addressed to the participant who did not act.
 * The writer re-reads the request to verify the recipient and derive the
 * counterpart, copy and deep link (Sprint 0129: the typed inbox is the only
 * destination; see features/notifications/event-contact-request-inbox.ts).
 */
export interface EventContactRequestNotificationInput {
  actorId: string;
  /** The recipient-owned contact; required for an acceptance. */
  contactId: string | null;
  eventId: string;
  occurredAt: string;
  requestId: string;
  revision: number;
  transition: EventContactRequestTransition;
}

export interface EventContactRequestNotificationWriter {
  createNotification(
    input: EventContactRequestNotificationInput,
  ): Promise<{ recordId: string }>;
}
