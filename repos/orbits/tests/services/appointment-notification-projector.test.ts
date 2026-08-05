import assert from "node:assert/strict";
import test from "node:test";

import type { AppointmentOutboxEvent } from "../../features/appointments/contract";
import { createAppointmentNotificationProjector } from "../../features/appointments/notification-projector";
import { createPostgresAppointmentNotificationProjector } from "../../features/appointments/notification-projector";
import type { ReminderActionWriter } from "../../features/notifications/action-writer";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";

function event(eventType: AppointmentOutboxEvent["eventType"], revision = 3): AppointmentOutboxEvent {
  return {
    aggregateVersion: 6,
    appointmentId: "appointment:aiko-ren",
    availableAt: "2026-09-20T01:00:00.000Z",
    createdAt: "2026-08-04T06:00:00.000Z",
    dedupeKey: `appointment:aiko-ren:${revision}:${eventType}`,
    eventId: `event:${eventType}`,
    eventType,
    payload: {
      contactIdsByActor: { "actor:aiko": "contact:ren", "actor:ren": "contact:aiko" },
      eventId: "event:launch",
      participantActorIds: ["actor:aiko", "actor:ren"],
      revision,
    },
  };
}

test("appointment reminders project to two actor-scoped in-app records and invalidation removes old revision", async () => {
  const created: { actorId: string; reminderId: string }[] = [];
  const removed: { actorId: string; reminderId: string }[] = [];
  const writerForActor = (actorId: string): ReminderActionWriter => ({
    async createReminder(input) { created.push({ actorId, reminderId: input.reminderId }); return { recordId: input.reminderId }; },
    async removeReminder(reminderId) { removed.push({ actorId, reminderId }); },
  });
  const projector = createAppointmentNotificationProjector({ writerForActor });
  const projected = await projector.project(event("appointment.reminder.t24h"));
  assert.equal(projected.policy, "in_app");
  assert.deepEqual(created, [
    { actorId: "actor:aiko", reminderId: "notification:appointment:aiko-ren:3:t24h:actor:aiko" },
    { actorId: "actor:ren", reminderId: "notification:appointment:aiko-ren:3:t24h:actor:ren" },
  ]);
  const invalidated = await projector.project(event("appointment.reminders.invalidate"));
  assert.equal(invalidated.policy, "reminders_invalidated");
  assert.equal(removed.length, 6);
  assert.ok(removed.some((value) => value.reminderId.endsWith(":t15m:actor:ren")));
});

test("appointment action notifications are written only for the other actor and target that actor's contact", async () => {
  const created: { actorId: string; contactId?: string }[] = [];
  const projectedEvent = event("appointment.proposed");
  projectedEvent.payload = { ...projectedEvent.payload, notificationRecipientActorIds: ["actor:ren"] };
  const projector = createAppointmentNotificationProjector({
    writerForActor: (actorId) => ({
      async createReminder(input) { created.push({ actorId, contactId: input.contactId }); return { recordId: input.reminderId }; },
      async removeReminder() {},
    }),
  });
  await projector.project(projectedEvent);
  assert.deepEqual(created, [{ actorId: "actor:ren", contactId: "contact:aiko" }]);
});

test("T+15m postgres notification persists the ordinary actor-scoped appointment href", async () => {
  let insertedValues: readonly unknown[] | undefined;
  const transaction = {
    async query<TRow = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      if (sql.includes("select status, payload from appointment_aggregates")) {
        return { rowCount: 1, rows: [{ status: "completed", payload: { reminders: { cancelled: false, currentRevision: 3 } } }] as TRow[] };
      }
      if (sql.includes("insert into orbit_records")) insertedValues = values;
      return { rowCount: 1, rows: [] as TRow[] };
    },
  };
  const runtime = {
    workspaceId: "workspace:test",
    client: {
      ...transaction,
      async close() {},
      async transaction<TValue>(operation: (value: typeof transaction) => Promise<TValue>) { return operation(transaction); },
    },
  } as EventOperationsPostgresRuntime;

  await createPostgresAppointmentNotificationProjector(runtime).project(event("appointment.memo.t15m"));
  assert.ok(insertedValues);
  assert.equal(insertedValues?.[4], "contact");
  assert.equal(insertedValues?.[5], "contact:aiko");
  const payload = JSON.parse(String(insertedValues?.[8])) as { actionHref?: string };
  assert.equal(payload.actionHref, "/app/contacts/contact%3Aaiko?appointmentId=appointment%3Aaiko-ren&eventId=event%3Alaunch");
});

test("postgres action notification persists one row for the other actor with appointment/contact/event href", async () => {
  const inserts: (readonly unknown[])[] = [];
  const transaction = {
    async query<TRow = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      if (sql.includes("insert into orbit_records") && values) inserts.push(values);
      return { rowCount: 1, rows: [] as TRow[] };
    },
  };
  const runtime = {
    workspaceId: "workspace:test",
    client: {
      ...transaction,
      async close() {},
      async transaction<TValue>(operation: (value: typeof transaction) => Promise<TValue>) { return operation(transaction); },
    },
  } as EventOperationsPostgresRuntime;
  const proposed = event("appointment.proposed", 1);
  proposed.payload = { ...proposed.payload, notificationRecipientActorIds: ["actor:ren"] };

  await createPostgresAppointmentNotificationProjector(runtime).project(proposed);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]?.[2], "actor:ren");
  assert.equal(inserts[0]?.[5], "contact:aiko");
  const payload = JSON.parse(String(inserts[0]?.[8])) as { actionHref?: string };
  assert.equal(payload.actionHref, "/app/contacts/contact%3Aaiko?appointmentId=appointment%3Aaiko-ren&eventId=event%3Alaunch");
});

test("calendar and meeting cancellation never claim an unconfigured provider succeeded", async () => {
  const projector = createAppointmentNotificationProjector({
    writerForActor: () => ({ async createReminder(input) { return { recordId: input.reminderId }; }, async removeReminder() {} }),
  });
  assert.equal((await projector.project(event("appointment.calendar.cancel"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.meeting.cancel"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.calendar.requested"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.meeting.requested"))).policy, "provider_not_configured");
});

test("unknown appointment outbox events fail instead of being acknowledged as provider-not-configured", async () => {
  const projector = createAppointmentNotificationProjector({
    writerForActor: () => ({ async createReminder(input) { return { recordId: input.reminderId }; }, async removeReminder() {} }),
  });
  await assert.rejects(
    () => projector.project(event("appointment.unknown" as AppointmentOutboxEvent["eventType"])),
    /Unsupported appointment outbox event type/,
  );
});
