import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleDraft, buildPersonalScheduleChange } from "../src/view-models/personal-schedule-editor";
import { personalScheduleList, personalScheduleReceiptMatches, readPersonalSchedule } from "../src/api/personal-schedule";

const item = { id: "personal:rules", sourceId: "personal:rules", accountId: "owner", ownerUserId: "owner", kind: "personal" as const, category: "personal" as const, state: "upcoming" as const, title: "Review", startsAt: "2026-09-18T00:30:42Z", endsAt: "2026-09-18T01:30:42Z", timeZone: "Asia/Tokyo", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", reminderMinutes: 15 as const, recurrence: { frequency: "weekly" as const, until: "2026-10-18" } };

test("reopening a draft retains reminder and recurrence rules without silently changing them", () => {
  const draft = personalScheduleDraft(item, "Asia/Tokyo");
  assert.equal(draft.reminderMinutes, 15);
  assert.deepEqual(draft.recurrence, item.recurrence);
  assert.deepEqual(buildPersonalScheduleChange(item, draft, "Asia/Tokyo"), { kind: "unchanged" });
  assert.deepEqual(buildPersonalScheduleChange(item, { ...draft, reminderMinutes: null, recurrence: null }, "Asia/Tokyo"), { kind: "ready", fields: { reminderMinutes: null, recurrence: null } });
});

test("rule edits persist a strict local until date and reject invalid or earlier dates", () => {
  const draft = personalScheduleDraft(item, "Asia/Tokyo");
  assert.deepEqual(buildPersonalScheduleChange(item, { ...draft, reminderMinutes: 5, recurrence: { frequency: "daily", until: "2026-09-20" } }, "Asia/Tokyo"), { kind: "ready", fields: { reminderMinutes: 5, recurrence: { frequency: "daily", until: "2026-09-20" } } });
  for (const until of ["2026-02-30", "2026-09-17"]) assert.equal(buildPersonalScheduleChange(item, { ...draft, recurrence: { frequency: "daily", until } }, "Asia/Tokyo").kind, "invalid");
});

test("v3 receipts compare nested rules by value rather than trusting an ACK or object identity", () => {
  assert.equal(personalScheduleReceiptMatches({ scheduleItem: item }, "owner", item.id, { recurrence: { frequency: "weekly", until: "2026-10-18" }, reminderMinutes: 15 }), true);
  assert.equal(personalScheduleReceiptMatches({ scheduleItem: item }, "owner", item.id, { recurrence: { frequency: "daily", until: "2026-10-18" } }), false);
  assert.equal(personalScheduleReceiptMatches({ scheduleItem: item }, "owner", item.id, { recurrence: { frequency: "weekly" } }), false);
});

test("v3 instances accept only stable series-owned identity, not forged source or incomplete metadata", () => {
  const instance = { ...item, id: "personal:rules:occurrence:2026-09-18", seriesId: item.id, occurrenceDate: "2026-09-18" };
  assert.deepEqual(personalScheduleList({ scheduleItems: [instance] }, "owner"), [instance]);
  assert.equal(personalScheduleReceiptMatches({ scheduleItem: instance }, "owner", instance.id, { title: "Review" }), true);
  assert.equal(readPersonalSchedule({ scheduleItem: { ...instance, sourceId: "personal:foreign" } }), null);
  assert.equal(readPersonalSchedule({ scheduleItem: { ...instance, occurrenceDate: "2026-09-19" } }), null);
  const { seriesId, ...incomplete } = instance;
  assert.equal(readPersonalSchedule({ scheduleItem: incomplete }), null);
  assert.ok(readPersonalSchedule({ scheduleItem: { ...item, reminderMinutes: undefined, recurrence: undefined } }));
});

test("enabling rules on a legacy zone-less record persists the editing zone", () => {
  const { timeZone, reminderMinutes, recurrence, ...legacy } = item;
  const draft = personalScheduleDraft(legacy, "Asia/Tokyo");
  assert.deepEqual(buildPersonalScheduleChange(legacy, { ...draft, reminderMinutes: 5 }, "Asia/Tokyo"), { kind: "ready", fields: { reminderMinutes: 5, timeZone: "Asia/Tokyo" } });
});

test("moving an occurrence after the series until date does not alter inherited rules", () => {
  const instance = { ...item, id: `${item.id}:occurrence:2026-09-18`, seriesId: item.id, occurrenceDate: "2026-09-18", recurrence: { frequency: "daily" as const, until: "2026-09-20" } };
  const draft = personalScheduleDraft(instance, "Asia/Tokyo");
  const result = buildPersonalScheduleChange(instance, { ...draft, startDate: "2026-09-21", endDate: "2026-09-21" }, "Asia/Tokyo");
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") assert.equal(Object.hasOwn(result.fields, "recurrence"), false);
});

test("new rule validation errors expose typed locale keys for the editor", () => {
  const draft = personalScheduleDraft(item, "Asia/Tokyo");
  const invalidReminder = buildPersonalScheduleChange(item, { ...draft, reminderMinutes: 10 as never }, "Asia/Tokyo");
  const invalidUntil = buildPersonalScheduleChange(item, { ...draft, recurrence: { frequency: "daily", until: "2026-02-30" } }, "Asia/Tokyo");
  assert.equal(invalidReminder.kind, "invalid");
  assert.equal(invalidUntil.kind, "invalid");
  if (invalidReminder.kind === "invalid") assert.equal("messageKey" in invalidReminder ? invalidReminder.messageKey : undefined, "personal60.invalidReminder");
  if (invalidUntil.kind === "invalid") assert.equal("messageKey" in invalidUntil ? invalidUntil.messageKey : undefined, "personal60.invalidUntil");
});
