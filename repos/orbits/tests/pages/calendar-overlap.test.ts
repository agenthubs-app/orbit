import assert from "node:assert/strict";
import test from "node:test";
import { calendarDraftOverlaps } from "../../app/(app)/app/orbit-2026/calendar/calendar-overlap";
import type { CalendarEntry } from "../../app/(app)/app/orbit-2026/calendar/calendar-view-model";

const target = { id: "own", sourceId: "own", startsAt: "2026-10-18T09:00:00Z", endsAt: "2026-10-18T10:00:00Z" };
const entry = (id: string, startsAt: string, endsAt?: string): CalendarEntry => ({ key: `personal:${id}`, id, sourceId: id, kind: "personal", title: id, startsAt, endsAt, allDay: false, readOnly: false });
const coverage = { from: "2026-10-18T00:00:00Z", to: "2026-10-19T00:00:00Z", complete: true };
test("overlap warning uses half-open known intervals, excludes only the actual edited personal instance and retains external collisions", () => {
  const external = { ...entry("own", target.startsAt, target.endsAt), key: "external:own", kind: "external" as const, readOnly: true };
  const result = calendarDraftOverlaps(target, [entry("own", target.startsAt, target.endsAt), entry("touch-before", "2026-10-18T08:00:00Z", target.startsAt), entry("touch-after", target.endsAt, "2026-10-18T11:00:00Z"), entry("hit", "2026-10-18T09:30:00Z", "2026-10-18T10:30:00Z"), external], coverage);
  assert.deepEqual(result.items.map(item => item.key), ["personal:hit", "external:own"]);
  assert.equal(result.coverageComplete, true);
});
test("missing source or out-of-window time can never imply free time; all-day/point records do not invent busy durations", () => {
  assert.equal(calendarDraftOverlaps(target, [], { ...coverage, complete: false }).coverageComplete, false);
  assert.equal(calendarDraftOverlaps({ ...target, startsAt: "2026-10-19T00:00:00Z", endsAt: "2026-10-19T01:00:00Z" }, [], coverage).coverageComplete, false);
  assert.deepEqual(calendarDraftOverlaps(target, [{ ...entry("all-day", coverage.from, coverage.to), allDay: true }, entry("point", "2026-10-18T09:30:00Z")], coverage).items, []);
});
