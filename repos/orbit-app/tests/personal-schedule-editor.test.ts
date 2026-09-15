import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleDraft, buildPersonalScheduleChange } from "../src/view-models/personal-schedule-editor";
import { personalScheduleReceiptMatches } from "../src/api/personal-schedule";
const item = { id: "personal:1", sourceId: "personal:1", accountId: "owner", ownerUserId: "owner", kind: "personal" as const, category: "personal" as const, state: "upcoming" as const, title: "Review", startsAt: "2026-09-14T00:30:42Z", endsAt: "2026-09-14T01:30:00Z", location: "Tokyo", createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" };
test("personal editor preserves seconds, clears optional fields and rejects ambiguous wall time", () => {
  const draft = personalScheduleDraft(item, "America/Los_Angeles"); assert.equal(draft.startDate, "2026-09-13"); assert.equal(draft.startTime, "17:30");
  assert.deepEqual(buildPersonalScheduleChange(item, { ...draft, location: "", endDate: "", endTime: "" }, "America/Los_Angeles"), { kind: "ready", fields: { location: null, endsAt: null } });
  assert.equal(buildPersonalScheduleChange(null, { ...draft, startDate: "2026-11-01", startTime: "01:30", endDate: "", endTime: "" }, "America/New_York").kind, "invalid");
});
test("personal receipts must match actor, id, changed fields and deletion acknowledgement", () => {
  const data = { scheduleItem: item };
  assert.equal(personalScheduleReceiptMatches(data, "owner", "personal:1", { title: "Review" }), true);
  assert.equal(personalScheduleReceiptMatches(data, "other", "personal:1", {}), false);
  assert.equal(personalScheduleReceiptMatches(data, "owner", "personal:2", {}), false);
  assert.equal(personalScheduleReceiptMatches(data, "owner", "personal:1", { location: null }), false);
  assert.equal(personalScheduleReceiptMatches(data, "owner", "personal:1", {}, true), false);
});

test("home and calendar route the same personal record to its editor", async () => {
  const { homeScheduleToView } = await import("../src/view-models/home-dashboard");
  const { scheduleToCalendarView } = await import("../src/view-models/schedule");
  const payload = { scheduleItems: [item] }; const now = new Date("2026-09-14T00:00:00Z");
  const href = "/schedule/personal/personal%3A1";
  assert.equal(homeScheduleToView(payload, "2026-09-14", now, "Asia/Tokyo")?.[0]?.href, href);
  const row = scheduleToCalendarView({ scheduleItems: payload, events: {}, tasks: {}, now, timeZone: "Asia/Tokyo" }).timedItems[0];
  assert.equal(row?.href, href);
  assert.equal(row?.subtitle, "Tokyo");
});

test("personal list rejects another actor and keeps dates, location and real state", async () => {
  const { personalScheduleList } = await import("../src/api/personal-schedule");
  assert.deepEqual(personalScheduleList({ scheduleItems: [item, { ...item, id: "event:1", kind: "event" }] }, "owner"), [item]);
  assert.equal(personalScheduleList({ scheduleItems: [{ ...item, ownerUserId: "other" }] }, "owner"), null);
  assert.equal(personalScheduleList({ scheduleItems: [{ ...item, startsAt: "bad" }] }, "owner"), null);
});

test("a personal date-only task keeps its location and is not labeled a relationship task in calendar", async () => {
  const { scheduleToCalendarView } = await import("../src/view-models/schedule");
  const task = { id: "task:personal", title: "Personal task", category: "personal", status: "open", priority: "normal", plannedDate: "2026-09-17", location: "Room 123" };
  const view = scheduleToCalendarView({ events: {}, tasks: { tasks: [task] }, scheduleItems: {}, now: new Date("2026-09-17T00:00:00Z"), timeZone: "Asia/Tokyo" });
  assert.equal(view.allDayItems[0]?.location, "Room 123");
  assert.match(view.allDayItems[0]?.subtitle ?? "", /Room 123/);
  assert.doesNotMatch(view.allDayItems[0]?.subtitle ?? "", /人脉/);
});
