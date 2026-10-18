/** R27 SC-R27-13：event_deadline / event_prep 的触发条件、频控、幂等（semanticKey）。 */
import assert from "node:assert/strict";
import test from "node:test";

import { capEventNotifications, dueEventNotifications, runEventNotifications, type EventNotificationCandidate } from "../../features/events/journey/notifications";

const at = (iso: string) => new Date(iso);
const planned: EventNotificationCandidate = { actorId: "a", eventId: "e1", registrationClosesAt: "2026-10-03T23:59:00+09:00", startsAt: "2026-10-07T19:00:00+09:00", status: "planned", title: "CFO Night" };
const going: EventNotificationCandidate = { ...planned, eventId: "e2", registrationClosesAt: null, status: "registered" };

test("event_deadline: from 48 hours before the deadline until it closes, only for planned-not-registered", () => {
  assert.equal(dueEventNotifications([planned], at("2026-10-01T23:58:00+09:00")).length, 0);
  assert.deepEqual(dueEventNotifications([planned], at("2026-10-02T00:00:00+09:00")).map((item) => [item.sourceKind, item.semanticKey]), [["event_deadline", "event_deadline:e1"]]);
  assert.equal(dueEventNotifications([planned], at("2026-10-04T00:00:00+09:00")).length, 0, "closed");
  assert.equal(dueEventNotifications([{ ...planned, status: "registered" }], at("2026-10-02T12:00:00+09:00")).filter((item) => item.sourceKind === "event_deadline").length, 0);
  assert.equal(dueEventNotifications([planned], at("2026-10-02T12:00:00+09:00"))[0]?.at, new Date(planned.registrationClosesAt!).toISOString());
});

test("event_prep: the event day from 08:00 Tokyo until it starts, only for registered", () => {
  assert.equal(dueEventNotifications([going], at("2026-10-07T07:59:00+09:00")).length, 0);
  assert.deepEqual(dueEventNotifications([going], at("2026-10-07T08:00:00+09:00")).map((item) => item.semanticKey), ["event_prep:e2"]);
  assert.equal(dueEventNotifications([going], at("2026-10-07T19:00:00+09:00")).length, 0, "started");
  assert.equal(dueEventNotifications([{ ...going, status: "planned" }], at("2026-10-07T09:00:00+09:00")).length, 0);
  assert.equal(dueEventNotifications([going], at("2026-10-07T09:00:00+09:00"))[0]?.at, new Date(going.startsAt).toISOString());
});

test("daily cap: per person per Tokyo day (default 2, user setting 1–3), earliest events first", () => {
  const items = ["x", "y", "z"].map((eventId, index) => ({ actorId: "a", at: "", eventId, semanticKey: `event_prep:${eventId}`, sourceKind: "event_prep" as const, startsAt: `2026-10-07T1${index}:00:00+09:00` }));
  const startsAt = Object.fromEntries(items.map((item) => [item.eventId, item.startsAt]));
  assert.deepEqual(capEventNotifications(items, { dailyCap: {}, sentToday: {}, startsAt }).map((item) => item.eventId), ["x", "y"]);
  assert.deepEqual(capEventNotifications(items, { dailyCap: { a: 1 }, sentToday: {}, startsAt }).map((item) => item.eventId), ["x"]);
  assert.deepEqual(capEventNotifications(items, { dailyCap: { a: 3 }, sentToday: { a: 2 }, startsAt }).map((item) => item.eventId), ["x"]);
  assert.deepEqual(capEventNotifications(items, { dailyCap: {}, sentToday: { a: 5 }, startsAt }), []);
});

test("a run writes through the idempotent writer with the same semantic key every time", async () => {
  const keys: string[] = [];
  const run = () => runEventNotifications({ candidates: async () => [going], dailyCap: async () => ({}), now: at("2026-10-07T09:00:00+09:00"), sentToday: async () => ({}), write: async (item) => { keys.push(item.semanticKey); assert.equal(item.href, "/events/e2/prep"); return true; } });
  assert.deepEqual(await run(), { planned: 1, written: 1 });
  await run();
  assert.deepEqual(keys, ["event_prep:e2", "event_prep:e2"]);
});
