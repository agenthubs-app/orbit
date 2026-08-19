import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
  createEventRegistrationOpeningReminderService,
} from "../../features/events/registration/opening-reminder-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:opening-reminder";
const EVENT = "event:opening-reminder";
const WORKSPACE = "workspace:opening-reminder";

test("event opening reminder is actor-scoped, idempotent, cancellable, and projects an in-app notification", async () => {
  let current = "2026-08-19T10:00:00.000Z";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createEventRegistrationOpeningReminderService({
    now: () => current,
    store,
    workspaceId: WORKSPACE,
  });

  const subscribed = await service.subscribe({
    actorId: ACTOR,
    eventId: EVENT,
    eventTitle: "AI 商务对接会",
  });
  assert.equal(subscribed.state, "subscribed");
  const repeated = await service.subscribe({
    actorId: ACTOR,
    eventId: EVENT,
    eventTitle: "AI 商务对接会",
  });
  assert.equal(repeated.subscribedAt, subscribed.subscribedAt);

  assert.equal((await service.get({
    actorId: ACTOR,
    availability: "unavailable",
    eventId: EVENT,
  })).state, "subscribed");
  assert.equal((await service.get({
    actorId: "account:other",
    availability: "unavailable",
    eventId: EVENT,
  })).state, "not_subscribed");

  current = "2026-08-20T09:00:00.000Z";
  const reconciled = await service.reconcileActor({
    actorId: ACTOR,
    readAvailability: async () => "open",
  });
  assert.equal(reconciled[0]?.state, "notified");
  assert.equal((await store.listRecords({
    collectionName: EVENT_REGISTRATION_OPENING_REMINDER_COLLECTION,
    lifecycleState: "active",
    userId: ACTOR,
    workspaceId: WORKSPACE,
  })).length, 0);

  const notifications = await store.listRecords({
    collectionName: "notifications",
    lifecycleState: "active",
    userId: ACTOR,
    workspaceId: WORKSPACE,
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.payload.channel, "in_app");
  assert.equal(notifications[0]?.payload.status, "pending");
  assert.equal(
    notifications[0]?.payload.actionHref,
    `/app/events/${encodeURIComponent(EVENT)}`,
  );

  await service.subscribe({ actorId: ACTOR, eventId: EVENT });
  assert.equal((await service.unsubscribe({ actorId: ACTOR, eventId: EVENT })).state, "not_subscribed");

  await service.subscribe({ actorId: ACTOR, eventId: EVENT });
  assert.equal((await service.get({
    actorId: ACTOR,
    availability: "registration_closed",
    eventId: EVENT,
  })).state, "not_subscribed");
});
