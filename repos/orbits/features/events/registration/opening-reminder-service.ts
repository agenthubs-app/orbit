import { createHash } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { EventRegistrationAvailability } from "./deadline-gated-service";

export const EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION =
  "event_registration_opening_reminders";

export interface EventRegistrationOpeningReminderState {
  eventId: string;
  state: "not_subscribed" | "subscribed" | "notified";
  subscribedAt: string | null;
  updatedAt: string | null;
}

export interface EventRegistrationOpeningReminderService {
  get(input: {
    actorId: string;
    availability: EventRegistrationAvailability;
    eventId: string;
    eventTitle?: string | null;
  }): Promise<EventRegistrationOpeningReminderState>;
  subscribe(input: {
    actorId: string;
    eventId: string;
    eventTitle?: string | null;
  }): Promise<EventRegistrationOpeningReminderState>;
  unsubscribe(input: {
    actorId: string;
    eventId: string;
  }): Promise<EventRegistrationOpeningReminderState>;
  reconcileActor(input: {
    actorId: string;
    readAvailability: (
      eventId: string,
    ) => Promise<EventRegistrationAvailability>;
  }): Promise<readonly EventRegistrationOpeningReminderState[]>;
}

function required(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 256) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function reminderRecordId(actorId: string, eventId: string): string {
  return `event-registration-opening-reminder:${createHash("sha256")
    .update(`${actorId}\u0000${eventId}`)
    .digest("hex")}`;
}

function notificationRecordId(actorId: string, eventId: string): string {
  return `event-registration-opened:${createHash("sha256")
    .update(`${actorId}\u0000${eventId}`)
    .digest("hex")}`;
}

function title(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 200) : "该活动";
}

export function createEventRegistrationOpeningReminderService(input: {
  now?: () => string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): EventRegistrationOpeningReminderService {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async get(value) {
      const actorId = required(value.actorId, "Actor");
      const eventId = required(value.eventId, "Event");
      const recordId = reminderRecordId(actorId, eventId);
      const record = await input.store.getRecord({
        collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
        recordId,
        workspaceId: input.workspaceId,
      });

      if (!record || record.userId !== actorId) {
        return {
          eventId,
          state: "not_subscribed",
          subscribedAt: null,
          updatedAt: null,
        };
      }

      if (value.availability === "open") {
        const updatedAt = now();
        const eventTitle = title(value.eventTitle ?? record.payload.eventTitle as string | undefined);
        const notificationId = notificationRecordId(actorId, eventId);
        await input.store.upsertRecord({
          workspaceId: input.workspaceId,
          collectionName: "notifications",
          recordId: notificationId,
          userId: actorId,
          sourceType: "system",
          sourceId: recordId,
          sourceLabel: "Event registration opening reminder",
          evidenceIds: [`event-registration-window:${eventId}`],
          targetType: "event",
          targetId: eventId,
          occurredAt: updatedAt,
          lifecycleState: "active",
          searchText: `${eventTitle} 报名已开放`,
          payload: {
            id: notificationId,
            channel: "in_app",
            title: `${eventTitle}报名已开放`,
            body: "你订阅的活动现在可以报名。打开活动页查看并决定是否报名。",
            status: "pending",
            scheduledFor: updatedAt,
            actionHref: `/app/events/${encodeURIComponent(eventId)}`,
            source: {
              type: "system",
              id: recordId,
              label: "活动报名开放提醒",
            },
            evidenceIds: [`event-registration-window:${eventId}`],
            createdAt: updatedAt,
          },
          createdAt: updatedAt,
          updatedAt,
        });
        await input.store.deleteRecord({
          workspaceId: input.workspaceId,
          collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
          recordId,
          deletedAt: updatedAt,
        });
        return {
          eventId,
          state: "notified",
          subscribedAt:
            typeof record.payload.subscribedAt === "string"
              ? record.payload.subscribedAt
              : record.createdAt,
          updatedAt,
        };
      }

      if (value.availability !== "unavailable") {
        const updatedAt = now();
        await input.store.deleteRecord({
          workspaceId: input.workspaceId,
          collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
          recordId,
          deletedAt: updatedAt,
        });
        return {
          eventId,
          state: "not_subscribed",
          subscribedAt: null,
          updatedAt,
        };
      }

      return {
        eventId,
        state: "subscribed",
        subscribedAt:
          typeof record.payload.subscribedAt === "string"
            ? record.payload.subscribedAt
            : record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    async subscribe(value) {
      const actorId = required(value.actorId, "Actor");
      const eventId = required(value.eventId, "Event");
      const updatedAt = now();
      const recordId = reminderRecordId(actorId, eventId);
      const existing = await input.store.getRecord({
        collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
        includeDeleted: true,
        recordId,
        workspaceId: input.workspaceId,
      });
      const subscribedAt =
        existing?.lifecycleState === "active" &&
        typeof existing.payload.subscribedAt === "string"
          ? existing.payload.subscribedAt
          : updatedAt;

      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
        recordId,
        userId: actorId,
        sourceType: "manual",
        sourceId: eventId,
        sourceLabel: "Actor-requested event registration opening reminder",
        evidenceIds: [`event-registration-window:${eventId}`],
        targetType: "event",
        targetId: eventId,
        occurredAt: subscribedAt,
        lifecycleState: "active",
        searchText: `${title(value.eventTitle)} 报名开放提醒`,
        payload: {
          actorId,
          eventId,
          eventTitle: title(value.eventTitle),
          subscribedAt,
        },
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
      });

      return { eventId, state: "subscribed", subscribedAt, updatedAt };
    },

    async unsubscribe(value) {
      const actorId = required(value.actorId, "Actor");
      const eventId = required(value.eventId, "Event");
      const updatedAt = now();
      const recordId = reminderRecordId(actorId, eventId);
      const existing = await input.store.getRecord({
        collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
        recordId,
        workspaceId: input.workspaceId,
      });
      if (existing?.userId === actorId) {
        await input.store.deleteRecord({
          workspaceId: input.workspaceId,
          collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
          recordId,
          deletedAt: updatedAt,
        });
      }
      return {
        eventId,
        state: "not_subscribed",
        subscribedAt: null,
        updatedAt,
      };
    },

    async reconcileActor(value) {
      const actorId = required(value.actorId, "Actor");
      const records = await input.store.listRecords({
        collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
        lifecycleState: "active",
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      const reconciled = await Promise.all(records.slice(0, 100).flatMap((record) => {
        const eventId = typeof record.payload.eventId === "string"
          ? record.payload.eventId
          : null;
        if (!eventId) return [];
        return [value.readAvailability(eventId)
          .then((availability) => this.get({
              actorId,
              availability,
              eventId,
              eventTitle:
                typeof record.payload.eventTitle === "string"
                  ? record.payload.eventTitle
                  : null,
            }))
          .catch(() => null)];
      }));
      return reconciled.filter(
        (state): state is EventRegistrationOpeningReminderState => state !== null,
      );
    },
  };
}

export function createConfiguredEventRegistrationOpeningReminderService(): EventRegistrationOpeningReminderService | null {
  const configured =
    createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  return configured
    ? createEventRegistrationOpeningReminderService({
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : null;
}
