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

// 2026-11-22 trilingual event AI text: the synced row carries `i18n: { ja, zh, en }` beside the legacy strings (the publish
// language). The device keeps all three; the screen language is picked at read time, so switching re-renders from the same rows.
const trilingualResult = {
  ...result,
  recommendations: {
    sourceParticipantId: "p-a", noMatchReason: null,
    i18n: { ja: { noMatchReason: null }, zh: { noMatchReason: null }, en: { noMatchReason: null } },
    recommendations: [{
      targetParticipantId: "p-b", score: 91, reasons: ["蓄電の話が合う"], icebreakers: ["実証の話"], memberHint: "ヒント",
      i18n: {
        ja: { reasons: ["蓄電の話が合う"], icebreakers: ["実証の話"], memberHint: "ヒント" },
        zh: { reasons: ["都在做储能"], icebreakers: ["问问试点"], memberHint: "提示" },
        en: { reasons: ["Both work on storage"], icebreakers: ["Ask about pilots"], memberHint: "Hint" },
      },
    }],
  },
  roundOneTable: {
    ...result.roundOneTable, theme: "蓄電", rationale: "蓄電の卓", icebreakers: ["あ"], memberPrompts: { "p-a": ["ア"], "p-b": ["イ"] }, memberRationales: { "p-a": "理由A", "p-b": "理由B" },
    i18n: {
      ja: { theme: "蓄電", rationale: "蓄電の卓", icebreakers: ["あ"], memberPrompts: { "p-a": ["ア"], "p-b": ["イ"] }, memberRationales: { "p-a": "理由A", "p-b": "理由B" } },
      zh: { theme: "储能", rationale: "储能桌", icebreakers: ["甲"], memberPrompts: { "p-a": ["一"], "p-b": ["二"] }, memberRationales: { "p-a": "原因A", "p-b": "原因B" } },
      en: { theme: "Storage", rationale: "Storage table", icebreakers: ["one"], memberPrompts: { "p-a": ["x"], "p-b": ["y"] }, memberRationales: { "p-a": "why a", "p-b": "why b" } },
    },
  },
};
const dayRecords = (payload: unknown) => ({
  registrations: [record("event_registration", "event-1", { eventId: "event-1", membershipStatus: "rsvped", admissionStatus: null })],
  events: [record("registered_event", "event-1", event)],
  results: [record("event_published_result", "event-1", payload)],
});

test("trilingual AI text: the same device rows read in ja, zh and en", () => {
  const records = dayRecords(trilingualResult);
  const expected = {
    ja: { reason: "蓄電の話が合う", hint: "ヒント", theme: "蓄電", rationale: "蓄電の卓", prompt: "ア", why: "理由A", icebreaker: "あ" },
    zh: { reason: "都在做储能", hint: "提示", theme: "储能", rationale: "储能桌", prompt: "一", why: "原因A", icebreaker: "甲" },
    en: { reason: "Both work on storage", hint: "Hint", theme: "Storage", rationale: "Storage table", prompt: "x", why: "why a", icebreaker: "one" },
  } as const;
  for (const language of ["ja", "zh", "en"] as const) {
    const day = localEventDay(records, "event-1", language);
    const workspace = localAttendeeWorkspace(day, { now: NOW, displayName: "Aiko" });
    assert.ok(workspace, language);
    assert.deepEqual(readAttendeeWorkspace(workspace, "event-1"), workspace, `${language}: the live page's own validation accepts it`);
    const want = expected[language];
    const recommendation = workspace.recommendations?.recommendations[0];
    assert.deepEqual(recommendation?.reasons, [want.reason], language);
    assert.equal(recommendation?.memberHint, want.hint, language);
    assert.equal(recommendation?.score, 91, `${language}: non-text fields stay`);
    assert.equal(workspace.roundOneTable?.theme, want.theme, language);
    assert.equal(workspace.roundOneTable?.rationale, want.rationale, language);
    assert.deepEqual(workspace.roundOneTable?.icebreakers, [want.icebreaker], language);
    assert.deepEqual(workspace.roundOneTable?.memberPrompts["p-a"], [want.prompt], language);
    assert.equal(workspace.roundOneTable?.memberRationales["p-a"], want.why, language);
    assert.equal(workspace.roundOneTable?.tableNumber, 3, `${language}: seating stays`);
    assert.ok(!("i18n" in (day.result?.roundOneTable ?? {})), `${language}: the picked view carries no i18n map`);
  }
});

test("trilingual AI text falls back to the legacy strings: old server rows, a missing language, a malformed i18n", () => {
  const legacy = localEventDay(dayRecords(result), "event-1", "zh").result;
  assert.deepEqual(legacy?.recommendations?.recommendations[0]?.reasons, ["Both work on storage"], "no i18n → legacy strings");
  assert.equal(legacy?.roundOneTable?.theme, "Storage");

  const onlyJa = { ...trilingualResult, roundOneTable: { ...trilingualResult.roundOneTable, i18n: { ja: trilingualResult.roundOneTable.i18n.ja } } };
  assert.equal(localEventDay(dayRecords(onlyJa), "event-1", "en").result?.roundOneTable?.theme, "蓄電", "no text in the screen language → legacy strings");

  const broken = { ...trilingualResult, roundOneTable: { ...trilingualResult.roundOneTable, i18n: { en: { theme: 42 }, zh: "x" } } };
  const day = localEventDay(dayRecords(broken), "event-1", "en");
  assert.ok(day.result, "a malformed i18n never drops the row");
  assert.equal(day.result.roundOneTable?.theme, "蓄電", "malformed language entry → legacy strings");

  assert.equal(localEventDay(dayRecords(trilingualResult), "event-1").result?.roundOneTable?.theme, "蓄電", "no screen language given → legacy strings");
});
