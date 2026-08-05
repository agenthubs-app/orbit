import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export interface EventContactRequestNotificationInput {
  actionHref: string;
  actorId: string;
  contactId: string | null;
  eventId: string;
  evidenceIds: readonly string[];
  notificationId: string;
  occurredAt: string;
  title: string;
}

export interface EventContactRequestNotificationWriter {
  createNotification(
    input: EventContactRequestNotificationInput,
  ): Promise<{ recordId: string }>;
}

export function createStorageEventContactRequestNotificationWriter(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): EventContactRequestNotificationWriter {
  return {
    async createNotification(notification) {
      if (!notification.actionHref.startsWith("/app/")) {
        throw new Error("Event contact-request notifications require an internal app deep link.");
      }
      if (notification.contactId) {
        const contact = await input.store.getRecord({
          collectionName: "contacts",
          recordId: notification.contactId,
          workspaceId: input.workspaceId,
        });
        if (
          !contact ||
          contact.lifecycleState !== "active" ||
          contact.userId !== notification.actorId
        ) {
          throw new Error("The actor-owned contact must be projected before its notification deep link is published.");
        }
      }
      await input.store.upsertRecord({
        collectionName: "notifications",
        createdAt: notification.occurredAt,
        evidenceIds: notification.evidenceIds,
        lifecycleState: "active",
        occurredAt: notification.occurredAt,
        payload: {
          actionHref: notification.actionHref,
          body: notification.title,
          channel: "in_app",
          createdAt: notification.occurredAt,
          evidenceIds: notification.evidenceIds,
          id: notification.notificationId,
          scheduledFor: notification.occurredAt,
          source: {
            id: notification.notificationId,
            label: "Event business-card request",
            type: "event_import",
          },
          status: "pending",
          title: notification.title,
        },
        recordId: notification.notificationId,
        searchText: notification.title,
        sourceId: notification.notificationId,
        sourceLabel: "Event business-card request",
        sourceType: "event_import",
        targetId: notification.contactId ?? notification.eventId,
        targetType: notification.contactId ? "contact" : "event",
        updatedAt: notification.occurredAt,
        userId: notification.actorId,
        workspaceId: input.workspaceId,
      });
      return { recordId: notification.notificationId };
    },
  };
}
