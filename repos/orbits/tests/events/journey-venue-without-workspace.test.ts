import assert from "node:assert/strict";
import test from "node:test";

import { buildVenue } from "../../features/events/journey/venue-core";

const event = { eventId: "event_x", title: "交流会", startsAt: "2026-10-01T10:00:00.000Z", endsAt: "2026-10-01T13:00:00.000Z" };
const input = { agenda: [], event, myContacts: [], wantedParticipantIds: new Set<string>(), workspace: null };

test("venue: not registered stays not_registered", () => {
  assert.equal(buildVenue({ ...input, registered: false, now: new Date("2026-10-01T11:00:00.000Z") }).state, "not_registered");
});

test("venue: registered without a workspace after the event is ended, never 'registered attendees only'", () => {
  assert.equal(buildVenue({ ...input, registered: true, now: new Date("2026-11-13T00:00:00.000Z") }).state, "ended");
});

test("venue: registered without a workspace before the end waits for check-in", () => {
  const view = buildVenue({ ...input, registered: true, now: new Date("2026-10-01T09:00:00.000Z") });
  assert.equal(view.state, "before_check_in");
  assert.equal(view.checkIn?.available, false);
});

test("a seat always reads as table letter and seat number, whatever format the seat was stored in", async () => {
  const { lateJoinerTables } = await import("../../features/events/event-operations/late-joiner");
  const table = { icebreakers: ["a", "b", "c"] as [string, string, string], memberPrompts: {}, memberRationales: {}, members: [{ participantId: "p1", seat: "1" }, { participantId: "p2", seat: "2" }], rationale: "r", tableNumber: 2, theme: "t" };
  const me = { actorId: "u3", company: null, displayName: "C", energyStyle: null, evidenceIds: [], experienceHighlight: null, industry: null, languages: [], lateRegistration: false, needs: [], offers: [], participantId: "p3", profileCompleteness: "partial" as const, role: null, seniority: null, topics: [] };
  const placed = lateJoinerTables(me, { directory: [], grouping: { roundOne: [table], roundTwo: [table] } });
  assert.equal(placed.roundOneTable?.members.at(-1)?.seat, "3");
});
