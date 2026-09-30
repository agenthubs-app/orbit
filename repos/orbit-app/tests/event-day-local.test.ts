import assert from "node:assert/strict";
import test from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import { publicEventDetailSchema } from "../src/api/event-detail-contract";
import { readAttendeeWorkspace } from "../src/api/event-attendee-operations";
import {
  localAttendeeWorkspace,
  localEventDay,
  localPublicEventDetail,
  localScheduleEvents,
} from "../src/view-models/event-day-local";
import { scheduleToCalendarView } from "../src/view-models/schedule";

// Sprint 0115: the device mirror rows of the three event domains become the
// same shapes the live page, the event detail and the calendar already render.
const NOW = Date.parse("2026-10-02T10:00:00.000Z");

function record<T>(kind: SyncRecord["kind"], id: string, payload: T): SyncRecord<T> {
  return { actorId: "actor:a", workspaceId: "w", kind, id, revision: "10", updatedAt: "2026-10-01T00:00:00.000Z", deletedAt: null, payload, syncState: "synced", aiVisibility: "excluded" };
}

const event = {
  eventId: "event-1", participantId: "p-a", title: "Climate night", description: "Storage and grids", venue: "Shibuya Hall", timeZone: "Asia/Tokyo",
  startsAt: "2026-10-02T09:00:00.000Z", endsAt: "2026-10-02T12:00:00.000Z", lifecycleState: "published",
  checkInOpensAt: "2026-10-02T08:30:00.000Z", eventStartsAt: "2026-10-02T09:00:00.000Z", eventEndsAt: "2026-10-02T12:00:00.000Z",
  profileEditDeadlineAt: "2026-10-01T09:00:00.000Z", resultsAvailableAt: "2026-10-02T08:00:00.000Z",
  roundOneStartsAt: "2026-10-02T09:30:00.000Z", roundTwoStartsAt: "2026-10-02T10:30:00.000Z",
};
const person = (participantId: string, displayName: string) => ({ participantId, displayName, company: "Co", role: "Lead", industry: "Climate", topics: ["storage"], experienceHighlight: null, languages: ["ja"], needs: [], offers: [] });
const result = {
  eventId: "event-1", generationId: "g1", publishedAt: "2026-10-02T07:00:00.000Z", resultsAvailableAt: "2026-10-02T08:00:00.000Z",
  me: person("p-a", "Aiko"), directory: [person("p-a", "Aiko"), person("p-b", "Ben"), person("p-c", "Chen")], directoryComplete: true,
  recommendations: { sourceParticipantId: "p-a", noMatchReason: null, recommendations: [{ targetParticipantId: "p-b", score: 91, reasons: ["Both work on storage"], icebreakers: ["Ask about pilots", "Ask about grids"], memberHint: "hint" }] },
  roundOneTable: { tableNumber: 3, theme: "Storage", rationale: "Storage table", icebreakers: ["a", "b", "c"], memberPrompts: { "p-a": ["x", "y"], "p-b": ["x", "y"] }, memberRationales: { "p-a": "why a", "p-b": "why b" }, members: [{ participantId: "p-a", seat: "S1" }, { participantId: "p-b", seat: "S2" }] },
  roundTwoTable: null,
};

test("a registered event and its published result become the attendee workspace the live page renders", () => {
  const day = localEventDay({
    registrations: [record("event_registration", "event-1", { eventId: "event-1", membershipStatus: "rsvped", admissionStatus: null })],
    events: [record("registered_event", "event-1", event)],
    results: [record("event_published_result", "event-1", result)],
  }, "event-1");
  assert.ok(day.event && day.result);
  const workspace = localAttendeeWorkspace(day, { now: NOW, displayName: "Aiko" });
  assert.ok(workspace);
  assert.deepEqual(readAttendeeWorkspace(workspace, "event-1"), workspace, "the live page's own validation accepts it");
  assert.equal(workspace.resultsState, "ready");
  assert.equal(workspace.roundOneTable?.tableNumber, 3);
  assert.equal(workspace.recommendations?.recommendations[0]?.targetParticipantId, "p-b");
  assert.deepEqual(workspace.contactRequests, [], "exchange state is not on the device");
  assert.equal(workspace.checkIn, null, "check-in state is not on the device");
  assert.equal(workspace.directory.length, 3);
});

test("before any publication the live page still shows the event with only the attendee; results are locked or not generated", () => {
  const day = localEventDay({ registrations: [], events: [record("registered_event", "event-1", event)], results: [] }, "event-1");
  const locked = localAttendeeWorkspace(day, { now: Date.parse("2026-10-02T07:00:00.000Z"), displayName: "Aiko" });
  assert.equal(locked?.resultsState, "locked");
  assert.deepEqual(locked?.directory.map((p) => p.participantId), ["p-a"]);
  assert.equal(locked?.me.displayName, "Aiko");
  const after = localAttendeeWorkspace(day, { now: NOW, displayName: "Aiko" });
  assert.equal(after?.resultsState, "not_generated");
});

test("a cancelled or rejected registration has no event on the device: no workspace, the status is still readable", () => {
  const cancelled = localEventDay({ registrations: [record("event_registration", "event-1", { eventId: "event-1", membershipStatus: "cancelled", admissionStatus: null })], events: [], results: [] }, "event-1");
  assert.equal(cancelled.event, null);
  assert.equal(cancelled.registration?.membershipStatus, "cancelled");
  assert.equal(localAttendeeWorkspace(cancelled, { now: NOW, displayName: "Aiko" }), null);
  const rejected = localEventDay({ registrations: [record("event_registration", "event-4", { eventId: "event-4", membershipStatus: null, admissionStatus: "rejected" })], events: [], results: [] }, "event-4");
  assert.equal(rejected.registration?.admissionStatus, "rejected");
});

test("malformed or foreign rows are ignored, never rendered", () => {
  const day = localEventDay({
    registrations: [],
    events: [record("registered_event", "event-1", { ...event, startsAt: "not a date" }), record("registered_event", "event-2", { ...event, eventId: "event-9" })],
    results: [record("event_published_result", "event-1", { ...result, me: person("p-z", "Zed") })],
  }, "event-1");
  assert.equal(day.event, null, "an invalid time is not shown");
  assert.equal(day.result, null, "a result whose attendee is not in its directory is not shown");
});

test("the local event detail passes the detail screen's own schema; the calendar shows registered events", () => {
  const detail = localPublicEventDetail(event);
  assert.ok(detail);
  assert.equal(publicEventDetailSchema.safeParse(detail).success, true);
  assert.equal(detail.event.title, "Climate night");
  assert.equal(detail.event.venue, "Shibuya Hall");
  const events = localScheduleEvents([record("registered_event", "event-1", event)]);
  const view = scheduleToCalendarView({ events, tasks: { tasks: [] }, scheduleItems: { scheduleItems: [] }, now: new Date(NOW), timeZone: "Asia/Tokyo", weekStartsOn: 1 });
  const item = view.items.find((entry) => entry.kind === "event");
  assert.equal(item?.title, "Climate night");
  assert.equal(item?.location, "Shibuya Hall");
});
