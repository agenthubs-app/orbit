import assert from "node:assert/strict";
import test from "node:test";
import { createTodayScheduleProvider } from "../../features/tasks/today-schedule-provider";
import type { AppointmentConfirmation } from "../../features/appointments/contract";

const window = { from: "2030-04-01T00:00:00Z", to: "2030-04-02T00:00:00Z" };
const confirmation = (medium: AppointmentConfirmation["medium"]): AppointmentConfirmation => ({ candidateId: "one", confirmedAt: "2030-03-01T00:00:00Z", confirmedByActorId: "a", durationMinutes: 60, medium, proposalRevision: 1, startsAtUtc: "2030-04-01T09:00:00Z", timezone: "UTC" });
test("calendar provider forwards owned overlap window and localizes only generated meeting labels", async () => {
  const calls: unknown[] = [];
  const provider = createTodayScheduleProvider({ listEvents: async actorId => { calls.push(actorId); return [{ id: "event", sourceId: "e", kind: "event", category: "event", title: "本人のタイトル 线上会面", location: "电话", startsAt: "2030-04-01T07:00:00Z" }]; },
    listAppointments: async actorId => { calls.push(actorId); return [
      { appointmentId: "video", status: "confirmed", confirmed: confirmation({ kind: "video", provider: "other", joinUrl: null }) },
      { appointmentId: "phone", status: "confirmed", confirmed: confirmation({ kind: "phone", phoneHint: null }) },
      { appointmentId: "place", status: "reschedule_pending", confirmed: confirmation({ kind: "in_person", location: "本人が入力した 线上会面" }) },
    ]; }, personalList: async input => { calls.push(input); return []; } });
  const items = await provider.list({ actorId: "a", ...window, language: "ja" });
  assert.deepEqual(calls, ["a", "a", { actorId: "a", ...window, overlap: true }]);
  assert.deepEqual(items.map(item => [item.title, item.location]), [["本人のタイトル 线上会面", "电话"], ["面談", "オンライン"], ["面談", "電話"], ["面談", "本人が入力した 线上会面"]]);
  const old = await provider.list({ actorId: "a" });
  assert.equal(old[1]!.title, "人脉会面"); assert.equal(old[1]!.location, "线上会面");
});
test("calendar provider filters half-open overlaps, retaining carry-over and confirmed reschedule slot", async () => {
  const event = (id: string, startsAt: string, endsAt?: string) => ({ id, sourceId: id, kind: "event" as const, category: "event" as const, title: id, startsAt, ...(endsAt ? { endsAt } : {}) });
  const provider = createTodayScheduleProvider({ listEvents: async () => [event("carry", "2030-03-31T00:00:00Z", "2030-04-01T01:00:00Z"), event("ended", "2030-03-31T00:00:00Z", window.from), event("at-end", window.to), event("point", window.from)], listAppointments: async () => [], personalList: async () => [] });
  assert.deepEqual((await provider.list({ actorId: "a", ...window, language: "ja" })).map(item => item.id), ["carry", "point"]);
});
test("direct calendar provider refuses invalid windows before any source reads", async () => {
  let calls = 0;
  const provider = createTodayScheduleProvider({ listEvents: async () => { calls++; return []; }, listAppointments: async () => { calls++; return []; }, personalList: async () => { calls++; return []; } });
  await assert.rejects(provider.list({ actorId: "a", from: window.from }));
  await assert.rejects(provider.list({ actorId: "a", from: window.to, to: window.from }));
  assert.equal(calls, 0);
});
test("calendar display cap fails visibly instead of returning a truncated complete window", async () => {
  const provider = createTodayScheduleProvider({ listEvents: async () => Array.from({ length: 1001 }, (_, index) => ({ id: String(index), sourceId: String(index), kind: "event", category: "event", title: "Event", startsAt: window.from })), listAppointments: async () => [], personalList: async () => [] });
  await assert.rejects(provider.list({ actorId: "a", ...window }), /CALENDAR_ITEMS_READ_CAP/);
  assert.equal((await provider.list({ actorId: "a" })).length, 1001, "legacy provider contract is unchanged");
});
