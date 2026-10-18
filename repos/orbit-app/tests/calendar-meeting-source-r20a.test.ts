import assert from "node:assert/strict";
import test from "node:test";

import { calendarMeetingWindow, mergeCalendarScheduleItems, readCalendarMeetings } from "../src/screens/calendar/calendar-meeting-source";
import { OfflineDataPolicyRegistry, OFFLINE_POLICY_REGISTRATIONS } from "../src/api/schema/offline-policy";

test("meeting windows cover the visible local grid and stay within the server cap across DST", () => {
  const day = calendarMeetingWindow("2026-03-08", "day", "America/New_York");
  assert.deepEqual(day && { from: day.from, to: day.to }, { from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T04:00:00.000Z" });
  const week = calendarMeetingWindow("2026-03-08", "week", "America/New_York");
  assert.equal(week?.from, "2026-03-02T05:00:00.000Z");
  assert.equal(week?.to, "2026-03-09T04:00:00.000Z");
  const month = calendarMeetingWindow("2026-10-15", "month", "America/New_York");
  assert.ok(month);
  assert.ok(Date.parse(month.to) - Date.parse(month.from) <= 43 * 86_400_000);
  assert.equal(calendarMeetingWindow("bad", "month", "Asia/Tokyo"), null);
  assert.equal(calendarMeetingWindow("2026-10-15", "month", "Invalid/Zone"), null);
});

test("meeting reader stores only valid confirmed previews and rejects invalid envelopes", () => {
  const meeting = { id: "schedule:appointment-1", sourceId: "appointment-1", kind: "meeting", category: "meeting", state: "upcoming", title: "Meeting", startsAt: "2026-10-15T09:00:00.000Z", endsAt: "2026-10-15T09:30:00.000Z", location: "Room A", privateField: "must not persist" };
  const items = readCalendarMeetings({ scheduleItems: [meeting, { ...meeting, id: "schedule:cancelled", state: "cancelled" }, { ...meeting, id: "wrong-id" }, { kind: "personal", title: "Private" }, null] });
  assert.deepEqual(items, [{ id: meeting.id, sourceId: meeting.sourceId, kind: "meeting", category: "meeting", state: "upcoming", title: "Meeting", startsAt: meeting.startsAt, endsAt: meeting.endsAt, location: "Room A" }]);
  assert.equal(readCalendarMeetings({ scheduleItems: "not-an-array" }), null);
  assert.equal(readCalendarMeetings({ unrelated: [] }), null);
  assert.equal(readCalendarMeetings(null), null);
});

test("the calendar GET has a separate encrypted snapshot policy from personal schedule", () => {
  const registry = new OfflineDataPolicyRegistry(OFFLINE_POLICY_REGISTRATIONS);
  assert.equal(registry.resolve("GET", "/api/schedule-items", "read").domainId, "personal_schedule");
  const meeting = registry.resolve("GET", "/api/schedule-items", "calendar.read");
  assert.equal(meeting.domainId, "calendar_meetings");
  assert.equal(meeting.readPersistence, "encrypted_ttl_snapshot");
  assert.equal(meeting.mutationPolicy, "online_only");
});

test("meeting previews merge with personal rows without duplicating a mirrored meeting", () => {
  const personal = { id: "personal-1", kind: "personal", title: "Lunch" };
  const mirrored = { id: "schedule:appointment-1", kind: "meeting", title: "Mirrored meeting" };
  const fresh = { ...mirrored, title: "Fresh meeting" };
  const second = { id: "schedule:appointment-2", kind: "meeting", title: "Second meeting" };
  assert.deepEqual(mergeCalendarScheduleItems({ scheduleItems: [personal, mirrored] }, { scheduleItems: [fresh, second] }),
    { scheduleItems: [personal, fresh, second] });
  assert.deepEqual(mergeCalendarScheduleItems({ scheduleItems: [personal] }, null), { scheduleItems: [personal] });
  assert.deepEqual(mergeCalendarScheduleItems(null, { scheduleItems: [second] }), { scheduleItems: [second] });
});
