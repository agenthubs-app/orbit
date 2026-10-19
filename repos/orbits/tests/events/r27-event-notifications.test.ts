/** R27 SC-R27-13：event_deadline / event_prep 的触发条件、站内完整写入、幂等（semanticKey）。 */
import assert from "node:assert/strict";
import test from "node:test";

import { dueEventNotifications, runEventNotifications, type EventNotificationCandidate } from "../../features/events/journey/notifications";

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

test("a run writes through the idempotent writer with the same semantic key every time", async () => {
  const keys: string[] = [];
  const run = () => runEventNotifications({ candidates: async () => [going], now: at("2026-10-07T09:00:00+09:00"), write: async (item) => { keys.push(item.semanticKey); assert.equal(item.href, "/events/e2/prep"); return true; } });
  assert.deepEqual(await run(), { planned: 1, written: 1 });
  await run();
  assert.deepEqual(keys, ["event_prep:e2", "event_prep:e2"]);
});

test("due inbox records are all written before push quota is considered", async () => {
  const written: string[] = [];
  const result = await runEventNotifications({
    candidates: async () => [going, { ...going, eventId: "e3", title: "SaaS Summit" }],
    now: at("2026-10-07T09:00:00+09:00"),
    write: async (item) => { written.push(item.semanticKey); return true; },
  });
  assert.deepEqual(result, { planned: 2, written: 2 });
  assert.deepEqual(written, ["event_prep:e2", "event_prep:e3"]);
});
