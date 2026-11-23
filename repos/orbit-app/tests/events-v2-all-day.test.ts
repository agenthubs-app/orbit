import assert from "node:assert/strict";
import test from "node:test";

import { appAllDayLabel, appEventWhen } from "../src/screens/events/v2/events-model";
import { myEventsResponseSchema } from "../src/api/schema/events-mine";

/** AG20a: an all-day private event prints its day and 全天 / 終日 / All day where the time would be; timed ones as before. */
test("App formatter: day and the all-day words in the clock's place", () => {
  const midnight = "2026-10-23T15:00:00.000Z"; // 10月24日 00:00 in Tokyo
  assert.equal(appEventWhen(midnight, "zh", appAllDayLabel({ allDay: true }, "全天")), "10月24日（周六）全天");
  assert.equal(appEventWhen(midnight, "ja", appAllDayLabel({ allDay: true }, "終日")), "10月24日（土）終日");
  assert.match(appEventWhen(midnight, "en", appAllDayLabel({ allDay: true }, "All day")), /^Sat 10\/24 All day$/u);
  assert.equal(appEventWhen(midnight, "zh", appAllDayLabel({}, "全天")), "10月24日（周六）0:00", "without the flag nothing changes");
  assert.equal(appEventWhen("2026-10-07T10:00:00.000Z", "zh", appAllDayLabel({}, "全天")), "10月7日（周三）19:00");
});

test("the App's copy of the schema keeps allDay", () => {
  const parsed = myEventsResponseSchema.parse({ asOf: "2026-10-07T03:00:00.000Z", items: [{ allDay: true, emoji: "🏺", eventId: "private_event:fair", href: "/events?privateEvent=x", privateEvent: true, startsAt: "2026-10-23T15:00:00.000Z", status: "planned", title: "陶艺市集" }], range: "upcoming", upcomingCount: 1 });
  assert.equal(parsed.items[0]?.allDay, true);
});
