import assert from "node:assert/strict";
import test from "node:test";

import type { AppointmentOutboxEvent } from "../../features/appointments/contract";
import { createAppointmentCalendarProjector } from "../../features/appointments/calendar-projector";
import type { OrbitIntegrationService } from "../../features/integrations/service";

function confirmedEvent(eventType: "appointment.calendar.cancel" | "appointment.calendar.requested"): AppointmentOutboxEvent {
  return {
    aggregateVersion: 4,
    appointmentId: "appointment:aiko-ren",
    availableAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
    dedupeKey: `appointment:aiko-ren:2:${eventType}`,
    eventId: `outbox:${eventType}`,
    eventType,
    payload: {
      confirmed: {
        durationMinutes: 45,
        medium: { joinUrl: null, kind: "video", provider: "google_meet" },
        startsAtUtc: "2026-08-08T01:00:00.000Z",
      },
      eventId: "event:orbit-night",
      participantActorIds: ["actor:aiko", "actor:ren"],
      revision: 2,
    },
  };
}

test("appointment calendar projector creates and cancels one owner-scoped Google Calendar event with Meet", async () => {
  const createCalls: Parameters<OrbitIntegrationService["createCalendarEvent"]>[0][] = [];
  const deleteCalls: Parameters<OrbitIntegrationService["deleteCalendarEvent"]>[0][] = [];
  const integration = {
    async createCalendarEvent(input: Parameters<OrbitIntegrationService["createCalendarEvent"]>[0]) {
      createCalls.push(input);
      return { joinUrl: "https://meet.google.com/abc-defg-hij", providerRecordId: "google:event:1" };
    },
    async deleteCalendarEvent(input: Parameters<OrbitIntegrationService["deleteCalendarEvent"]>[0]) {
      deleteCalls.push(input);
    },
    async listAuthorizations() {
      return [{
        authorizationId: "integration:google_calendar",
        capabilities: ["calendar.read", "calendar.write"],
        healthMessage: "ok",
        healthStatus: "healthy",
        provider: "google_calendar",
        scopes: ["calendar.events"],
        status: "active",
      }];
    },
  } as unknown as OrbitIntegrationService;
  const actorRequests: string[] = [];
  const projector = createAppointmentCalendarProjector({
    actorDirectory: {
      async load(actorIds) {
        assert.deepEqual(actorIds, ["actor:aiko", "actor:ren"]);
        return [
          { actorId: "actor:ren", displayName: "任伊藤", email: "ren@example.test" },
          { actorId: "actor:aiko", displayName: "森爱子", email: "aiko@example.test" },
        ];
      },
    },
    integrationForActor(actorId) {
      actorRequests.push(actorId);
      return integration;
    },
  });

  const created = await projector.upsert(confirmedEvent("appointment.calendar.requested"));
  assert.deepEqual(created, {
    joinUrl: "https://meet.google.com/abc-defg-hij",
    providerRecordId: "google:event:1",
  });
  assert.deepEqual(actorRequests, ["actor:aiko"]);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0]?.provider, "google_calendar");
  assert.equal(createCalls[0]?.idempotencyKey, "appointment:aiko-ren:google-calendar");
  assert.deepEqual(createCalls[0]?.payload, {
    attendees: [
      { displayName: "森爱子", email: "aiko@example.test" },
      { displayName: "任伊藤", email: "ren@example.test" },
    ],
    conference: "google_meet",
    description: "Orbit activity follow-up · event:orbit-night",
    endsAt: "2026-08-08T01:45:00.000Z",
    startsAt: "2026-08-08T01:00:00.000Z",
    title: "Orbit 约谈 · 森爱子 × 任伊藤",
  });

  await projector.cancel(confirmedEvent("appointment.calendar.cancel"));
  assert.deepEqual(deleteCalls, [{
    idempotencyKey: "appointment:aiko-ren:google-calendar",
    provider: "google_calendar",
  }]);
});

test("appointment calendar projector fails closed for missing consent or incomplete actor identities", async () => {
  const inactive = {
    async listAuthorizations() {
      return [{
        authorizationId: "integration:google_calendar",
        capabilities: ["calendar.read"],
        healthMessage: "connect",
        healthStatus: "action_required",
        provider: "google_calendar",
        scopes: ["calendar.events.readonly"],
        status: "pending",
      }];
    },
  } as unknown as OrbitIntegrationService;
  const noConsent = createAppointmentCalendarProjector({
    actorDirectory: { async load() { return []; } },
    integrationForActor: () => inactive,
  });
  await assert.rejects(
    () => noConsent.upsert(confirmedEvent("appointment.calendar.requested")),
    /must connect Google Calendar/,
  );

  const incomplete = createAppointmentCalendarProjector({
    actorDirectory: {
      async load() {
        return [{ actorId: "actor:aiko", displayName: "森爱子", email: "aiko@example.test" }];
      },
    },
    integrationForActor: () => ({
      async listAuthorizations() {
        return [{
          authorizationId: "integration:google_calendar",
          capabilities: ["calendar.write"],
          healthMessage: "ok",
          healthStatus: "healthy",
          provider: "google_calendar",
          scopes: ["calendar.events"],
          status: "active",
        }];
      },
    } as unknown as OrbitIntegrationService),
  });
  await assert.rejects(
    () => incomplete.upsert(confirmedEvent("appointment.calendar.requested")),
    /identities are incomplete/,
  );
});
