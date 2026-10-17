import assert from "node:assert/strict";
import test from "node:test";
import { createMeetingAvailabilityCheck, createMeetingAvailabilityClient, meetingCandidateAvailability, seedAvailableMeetingCandidates, type MeetingAvailability } from "../../app/(app)/app/orbit-2026/calendar/meeting-availability";

const now = Date.parse("2030-04-01T00:00:00Z");
const coverage: MeetingAvailability = { from: "2030-04-02T00:00:00Z", to: "2030-04-16T00:00:00Z", complete: true, items: [] };
test("default three meeting candidates avoid native intervals and floating all-day external events within complete coverage", () => {
  assert.deepEqual(seedAvailableMeetingCandidates(now, "UTC", { ...coverage, items: [
    { startsAt: "2030-04-02", allDay: true },
    { startsAt: "2030-04-03T09:00:00Z", endsAt: "2030-04-03T11:00:00Z" },
  ] }), [
    { startsAt: "2030-04-03T11:00:00.000Z", endsAt: "2030-04-03T12:00:00.000Z" },
    { startsAt: "2030-04-04T09:00:00.000Z", endsAt: "2030-04-04T10:00:00.000Z" },
    { startsAt: "2030-04-05T09:00:00.000Z", endsAt: "2030-04-05T10:00:00.000Z" },
  ]);
  assert.deepEqual(seedAvailableMeetingCandidates(now, "UTC", { ...coverage, complete: false }), []);
  assert.deepEqual(seedAvailableMeetingCandidates(now, "UTC", { ...coverage, to: "2030-04-02T08:00:00Z" }), []);
  assert.equal(seedAvailableMeetingCandidates(now, "UTC", { ...coverage, items: [{ startsAt: "2030-04-02T18:00:00Z", timeZone: "Asia/Tokyo" }] })[0]?.startsAt, "2030-04-03T09:00:00.000Z");
});

test("candidate defaults use local weekdays across fall DST and do not guess an end for point-only busy records", () => {
  const values = seedAvailableMeetingCandidates(Date.parse("2026-10-30T12:00:00Z"), "America/New_York", { from: "2026-10-31T04:00:00Z", to: "2026-11-14T05:00:00Z", complete: true, items: [{ startsAt: "2026-11-02T14:00:00Z" }] });
  assert.equal(values[0]?.startsAt, "2026-11-03T14:00:00.000Z");
  assert.equal(values[0]?.endsAt, "2026-11-03T15:00:00.000Z");
});

test("availability uses exactly bounded native and external reads and keeps incomplete coverage explicit", async () => {
  const calls: string[] = []; let state = "connected";
  const client = createMeetingAvailabilityClient({ fetch: async url => {
    calls.push(String(url)); return String(url).includes("external-events") ? Response.json({ success: true, data: { provider: "google_calendar", connection: state, events: [], asOf: "2030-04-01T00:00:00Z" } }) : Response.json({ success: true, data: { scheduleItems: [] } });
  } });
  const result = await client.load("UTC", now);
  assert.equal(result.complete, true); assert.equal(calls.length, 2);
  for (const path of calls) { const url = new URL(path, "http://localhost"); assert.equal(url.searchParams.get("from"), "2030-04-02T00:00:00.000Z"); assert.equal(url.searchParams.get("to"), "2030-04-16T00:00:00.000Z"); }
  assert.equal(new URL(calls[0]!, "http://localhost").searchParams.get("scope"), "calendar");
  state = "needs_reconnect";
  assert.equal((await client.load("UTC", now)).complete, false);
});

test("source failure never becomes an apparently empty free calendar, and denial aborts private availability", async () => {
  const failed = createMeetingAvailabilityClient({ fetch: async () => Response.json({ success: false }, { status: 503 }) });
  const result = await failed.load("UTC", now);
  assert.equal(result.complete, false); assert.deepEqual(seedAvailableMeetingCandidates(now, "UTC", result), []);
  const denied = createMeetingAvailabilityClient({ fetch: async () => Response.json({ success: false }, { status: 401 }) });
  await assert.rejects(denied.load("UTC", now));
});

test("manual selections distinguish known conflicts from unverified and fully read slots", () => {
  const candidate = { startsAt: "2030-04-02T09:00:00Z", endsAt: "2030-04-02T10:00:00Z" };
  assert.equal(meetingCandidateAvailability(candidate, "UTC", coverage), "free");
  assert.equal(meetingCandidateAvailability(candidate, "UTC", { ...coverage, complete: false }), "unknown");
  assert.equal(meetingCandidateAvailability(candidate, "UTC", { ...coverage, items: [{ startsAt: "2030-04-02", allDay: true }] }), "busy");
  assert.equal(meetingCandidateAvailability(candidate, "UTC", { ...coverage, complete: false, items: [{ startsAt: "2030-04-02T09:30:00Z", endsAt: "2030-04-02T10:30:00Z" }] }), "busy");
  assert.equal(meetingCandidateAvailability(candidate, "UTC", { ...coverage, to: "2030-04-02T09:30:00Z" }), "unknown");
});

test("a rendered slot grid projects busy facts once rather than rescanning source records for every cell", () => {
  let reads = 0;
  const items = Array.from({ length: 8 }, () => ({ get startsAt() { reads++; return "2030-04-02T18:00:00Z"; } }));
  const check = createMeetingAvailabilityCheck("UTC", { ...coverage, items });
  for (let index = 0; index < 8; index++) assert.equal(check({ startsAt: "2030-04-03T09:00:00Z", endsAt: "2030-04-03T10:00:00Z" }), "free");
  assert.ok(reads <= 32, `Source field reads exceeded one bounded projection: ${reads}`);
});
