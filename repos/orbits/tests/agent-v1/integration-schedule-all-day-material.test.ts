import assert from "node:assert/strict";
import { test } from "node:test";

import { withoutFieldLabels } from "../../features/agent-v1/answer/list-or-text";
import { materialOf } from "../../features/agent-v1/answer/materials";

/**
 * Integration (2026-11-20, coordinator): what the answer step reads about an all-day schedule item is its day, never a
 * 00:00 start — as AG20a made it for private events — so no written answer can say 00:00. An all-day item is stored from
 * its day's local midnight (AG20a: to the next midnight). Timed items read as before.
 */

const ZONE = "Asia/Tokyo";
const NOW = "2026-11-15T01:00:00.000Z";
// 2026-11-15 00:00 in Tokyo, and the next midnight.
const DAY = "2026-11-14T15:00:00.000Z";
const NEXT = "2026-11-15T15:00:00.000Z";

const said = (fields: Record<string, unknown>, occurrence: string | null = null) => {
  const view = { fields: { title: "年度体检", ...fields }, id: "personal:allday", kind: "schedule", ref: "schedule:personal:allday", updatedAt: DAY, version: "1" } as never;
  return materialOf(view, "p1", "s1", { names: new Map(), now: NOW, occurrence, timeZone: ZONE }).sentences.map((sentence) => sentence.text);
};

test("an all-day schedule item: its day and 'all day', no start time, no end at the next midnight", () => {
  const lines = said({ allDay: true, endsAt: NEXT, startsAt: DAY });
  assert.deepEqual(lines.slice(0, 2), ["Title: 年度体检", "Day: 2026-11-15 (Sun) (all day; no time of day was given)"]);
  assert.doesNotMatch(lines.join("\n"), /00:00|Starts:|Ends:/u, lines.join("\n"));
  assert.doesNotMatch(said({ allDay: true, startsAt: DAY }).join("\n"), /00:00|Starts:/u, "without an end too");
});

test("an all-day item over several days says its last day, never a time", () => {
  const lines = said({ allDay: true, endsAt: "2026-11-17T15:00:00.000Z", startsAt: DAY });
  assert.ok(lines.includes("Last day: 2026-11-17 (Tue) (all day)"), lines.join("\n"));
  assert.doesNotMatch(lines.join("\n"), /00:00/u);
});

test("a repeating all-day item read as one occurrence: that day, all day", () => {
  const lines = said({ allDay: true, endsAt: "2026-11-08T15:00:00.000Z", recurrence: "weekly", startsAt: "2026-11-07T15:00:00.000Z" }, DAY);
  assert.equal(lines[1], "Day: 2026-11-15 (Sun) (all day; no time of day was given)");
  assert.doesNotMatch(lines.join("\n"), /00:00|Last day/u, lines.join("\n"));
});

test("the all-day labels copied into a zh or ja answer go, their values stay (the hotfix's field-label rule); en keeps them", () => {
  assert.equal(withoutFieldLabels("年度体检在 Day: 11月28日（周六）（all day…）。", "zh"), "年度体检在 11月28日（周六）（all day…）。");
  assert.equal(withoutFieldLabels("年次健診は Day: 11月28日（土）（all day…）です。", "ja"), "年次健診は 11月28日（土）（all day…）です。");
  assert.equal(withoutFieldLabels("合宿是 Day：11月28日（周六）到 Last day: 11月30日（周一）（all day）。", "zh"), "合宿是 11月28日（周六）到 11月30日（周一）（all day）。");
  assert.equal(withoutFieldLabels("Day: Sat, Nov 28 (all day)", "en"), "Day: Sat, Nov 28 (all day)");
  assert.equal(withoutFieldLabels("周六那天（Saturday）有空。", "zh"), "周六那天（Saturday）有空。", "a word that only contains the label is not touched");
});

test("a timed item reads as before: start and end with their times", () => {
  const lines = said({ endsAt: "2026-11-15T07:00:00.000Z", startsAt: "2026-11-15T06:00:00.000Z" });
  assert.equal(lines[1], "Starts: 2026-11-15 (Sun) 15:00");
  assert.equal(lines[2], "Ends: 2026-11-15 (Sun) 16:00");
});
