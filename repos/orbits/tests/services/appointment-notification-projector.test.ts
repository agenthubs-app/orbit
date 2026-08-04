import assert from "node:assert/strict";
import test from "node:test";

import type { AppointmentOutboxEvent } from "../../features/appointments/contract";
import { createAppointmentNotificationProjector } from "../../features/appointments/notification-projector";
import type { ReminderActionWriter } from "../../features/notifications/action-writer";

function event(eventType: AppointmentOutboxEvent["eventType"], revision = 3): AppointmentOutboxEvent {
  return {
    aggregateVersion: 6,
    appointmentId: "appointment:aiko-ren",
    availableAt: "2026-09-20T01:00:00.000Z",
    createdAt: "2026-08-04T06:00:00.000Z",
    dedupeKey: `appointment:aiko-ren:${revision}:${eventType}`,
    eventId: `event:${eventType}`,
    eventType,
    payload: { participantActorIds: ["actor:aiko", "actor:ren"], revision },
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

test("calendar and meeting cancellation never claim an unconfigured provider succeeded", async () => {
  const projector = createAppointmentNotificationProjector({
    writerForActor: () => ({ async createReminder(input) { return { recordId: input.reminderId }; }, async removeReminder() {} }),
  });
  assert.equal((await projector.project(event("appointment.calendar.cancel"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.meeting.cancel"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.calendar.requested"))).policy, "provider_not_configured");
  assert.equal((await projector.project(event("appointment.meeting.requested"))).policy, "provider_not_configured");
});
