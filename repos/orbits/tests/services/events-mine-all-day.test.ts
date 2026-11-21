import assert from "node:assert/strict";
import test from "node:test";

import { myEventsResponseSchema } from "../../shared/api-schema/events-mine";
import { createMyEventsService } from "../../features/events/mine/service";
import { allDayLabelOf, eventWhen } from "../../app/(app)/app/orbit-2026/events/events-model";

/**
 * agent-design AG20a follow-up (coordinator review of R5): an all-day private event carries `allDay` in 「我的活动」 (only added,
 * the schedule contract's name); startsAt stays 00:00 of its day. The Web page prints its day and 全天 / 終日 / All day where
 * the clock time would be, never 0:00.
 */

const NOW = new Date("2026-10-07T03:00:00.000Z");

test("service: an all-day private event carries allDay; a timed one nothing; startsAt as stored", async () => {
  const service = createMyEventsService({
    now: () => NOW,
    reader: {
      rows: async () => [],
      selfRecords: async () => ({
        attendance: [],
        privateEvents: [
          { allDay: true, id: "private_event:fair", startsAt: "2026-10-23T15:00:00.000Z", title: "陶艺市集" },
          { id: "private_event:club", startsAt: "2026-10-24T10:00:00.000Z", title: "读书会" },
        ],
      }),
    },
  });
  const upcoming = await service.list("actor:a", { limit: 20, platform: "web", range: "upcoming" });
  const fair = upcoming.items.find((item) => item.eventId === "private_event:fair");
  const club = upcoming.items.find((item) => item.eventId === "private_event:club");
  assert.deepEqual([fair?.allDay, fair?.startsAt, fair?.privateEvent], [true, "2026-10-23T15:00:00.000Z", true]);
  assert.equal(club?.allDay, undefined);
  assert.equal(myEventsResponseSchema.parse(upcoming).items.find((item) => item.eventId === "private_event:fair")?.allDay, true);
  // A value the reader does not understand drops the field, never the row.
  const odd = myEventsResponseSchema.parse({ ...upcoming, items: upcoming.items.map((item) => ({ ...item, allDay: "yes" })) });
  assert.equal(odd.items.length, upcoming.items.length);
  assert.equal(odd.items[0].allDay, undefined);
});

test("Web formatter: day and 全天 / 終日 / All day in the time's place; a timed event as before", () => {
  const midnight = "2026-10-23T15:00:00.000Z"; // 10月24日 00:00 in Tokyo
  assert.equal(eventWhen(midnight, "zh", allDayLabelOf({ allDay: true }, "全天")), "10月24日（周六）全天");
  assert.equal(eventWhen(midnight, "ja", allDayLabelOf({ allDay: true }, "終日")), "10月24日（土）終日");
  assert.match(eventWhen(midnight, "en", allDayLabelOf({ allDay: true }, "All day")), /^Sat 10\/24 All day$/u);
  assert.equal(eventWhen(midnight, "zh", allDayLabelOf({}, "全天")), "10月24日（周六）0:00", "without the flag nothing changes");
  assert.equal(eventWhen("2026-10-07T10:00:00.000Z", "zh", allDayLabelOf({}, "全天")), "10月7日（周三）19:00");
});
