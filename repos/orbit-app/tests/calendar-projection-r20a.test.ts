import assert from "node:assert/strict";
import test from "node:test";

import { calendarProjection, type CalendarMode } from "../src/screens/calendar/calendar-projection";

const meeting = { id: "schedule:appointment-1", sourceId: "appointment-1", kind: "meeting", category: "meeting", state: "upcoming", title: "Confirmed interview", startsAt: "2026-10-17T01:00:00.000Z", endsAt: "2026-10-17T02:00:00.000Z" };
for (const mode of ["day", "week", "month"] as const satisfies readonly CalendarMode[]) {
  test(`confirmed meeting appears in ${mode} calendar with appointment detail route`, () => {
    const projection = calendarProjection({ actorId: "actor-1", dateKey: "2026-10-17", events: { events: [] }, language: "ja", mode, now: new Date("2026-10-17T00:00:00.000Z"), scheduleItems: { scheduleItems: [meeting] }, tasks: { tasks: [] }, timeZone: "Asia/Tokyo" });
    assert.equal(projection.kind, "ready");
    if (projection.kind !== "ready") return;
    const item = projection.selectedItems.find(row => row.id === meeting.id);
    assert.equal(item?.kind, "meeting");
    assert.equal(item?.href, "/schedule/meetings/appointment-1?source=appointment");
  });
}
