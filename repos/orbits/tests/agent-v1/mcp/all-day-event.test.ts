import assert from "node:assert/strict";
import test from "node:test";

import { projectRecord, projectedFieldNames } from "../../../features/agent-v1/mcp/tools/projection";

/**
 * Repair at a seam (AG17 × AG20a, integration 2026-11-20): AG20a's all-day private events reached an outside assistant
 * as `starts_at` at midnight with nothing saying "all day" — the schedule projection carried `all_day`, the event one
 * did not. An event, and a «我去过» note about one, now carry the same marker; a record without the flag goes out exactly
 * as before.
 */

const READS = new Set(["events", "attendance"] as const);
const view = (fields: Record<string, unknown>, id: string) => ({ fields, id, kind: "event", ref: `event:${id}`, updatedAt: "2026-11-10T00:00:00.000Z", version: "1" }) as never;

test("an all-day private event goes out with all_day: true next to its start", () => {
  const out = projectRecord("events", view({ allDay: true, kind: "private_event", location: "箱根", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日" }, "private_event:offsite"), READS);
  assert.deepEqual(out, { all_day: true, id: "private_event:offsite", kind: "private_event", starts_at: "2026-11-18T15:00:00.000Z", type: "event", updated_at: "2026-11-10T00:00:00.000Z", user_data: { location: "箱根", title: "团队外出日" } });
});

test("an event without the flag goes out exactly as before: no all_day field, not even false", () => {
  const timed = projectRecord("events", view({ endsAt: "2026-11-18T13:00:00.000Z", kind: "private_event", startsAt: "2026-11-18T10:00:00.000Z", title: "大学同学聚会" }, "private_event:reunion"), READS);
  assert.deepEqual(timed, { ends_at: "2026-11-18T13:00:00.000Z", id: "private_event:reunion", kind: "private_event", starts_at: "2026-11-18T10:00:00.000Z", type: "event", updated_at: "2026-11-10T00:00:00.000Z", user_data: { title: "大学同学聚会" } });
  const platform = projectRecord("events", view({ location: "涩谷", startsAt: "2026-11-21T01:00:00.000Z", title: "东京街头摄影展" }, "event:e101"), READS);
  assert.equal("all_day" in platform, false);
});

test("«我去过» about an all-day event carries the event's marker too", () => {
  const note = projectRecord("attendance", view({ allDay: true, attendedOn: "2026-11-19", kind: "attendance", selfNote: "一整天都在外面", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日" }, "attendance:offsite"), READS);
  assert.equal(note.all_day, true);
  assert.equal(note.starts_at, "2026-11-18T15:00:00.000Z");
  const timed = projectRecord("attendance", view({ attendedOn: "2026-11-08", kind: "attendance", selfNote: "见到了十年没见的室友", startsAt: "2026-11-08T10:00:00.000Z", title: "大学同学聚会" }, "attendance:a1"), READS);
  assert.equal("all_day" in timed, false);
});

test("the described output: all_day is one of the fields of an event and of a «我去过» note", () => {
  assert.ok(projectedFieldNames("events").plain.includes("all_day"));
  assert.ok(projectedFieldNames("attendance").plain.includes("all_day"));
});
