import assert from "node:assert/strict";
import test from "node:test";

import { seedAvailableMeetingCandidates, type MeetingAvailability } from "../../app/(app)/app/orbit-2026/calendar/meeting-availability";
import type { SchedulingAvailabilitySettings } from "../../shared/contract/scheduling-availability";
import {
  DEFAULT_SCHEDULING_AVAILABILITY,
  addLocalDays,
  availabilityGrid,
  formatMeetingSlotsText,
  isSlotAllowed,
  localDateOf,
  localWeekday,
  replaceMeetingSlotsText,
  seedMeetingSlots,
  type MeetingBusyAvailability,
} from "../../shared/compute/meeting-slots";

const D = DEFAULT_SCHEDULING_AVAILABILITY;

// ---------- SC-R40-02: defaults reproduce the old hard-coded seed ----------

test("SC-R40-02 default settings give exactly what seedAvailableMeetingCandidates gives (fixtures of the existing test)", () => {
  const now = Date.parse("2030-04-01T00:00:00Z");
  const coverage: MeetingAvailability = { from: "2030-04-02T00:00:00Z", to: "2030-04-16T00:00:00Z", complete: true, items: [] };
  const cases: { now: number; zone: string; availability: MeetingAvailability }[] = [
    { now, zone: "UTC", availability: { ...coverage, items: [{ startsAt: "2030-04-02", allDay: true }, { startsAt: "2030-04-03T09:00:00Z", endsAt: "2030-04-03T11:00:00Z" }] } },
    { now, zone: "UTC", availability: { ...coverage, complete: false } },
    { now, zone: "UTC", availability: { ...coverage, to: "2030-04-02T08:00:00Z" } },
    { now, zone: "UTC", availability: { ...coverage, items: [{ startsAt: "2030-04-02T18:00:00Z", timeZone: "Asia/Tokyo" }] } },
    { now: Date.parse("2026-10-30T12:00:00Z"), zone: "America/New_York", availability: { from: "2026-10-31T04:00:00Z", to: "2026-11-14T05:00:00Z", complete: true, items: [{ startsAt: "2026-11-02T14:00:00Z" }] } },
  ];
  for (const item of cases) {
    assert.deepEqual(seedMeetingSlots(D, { timeZone: item.zone, now: item.now, availability: item.availability }), seedAvailableMeetingCandidates(item.now, item.zone, item.availability));
  }
  assert.equal(seedMeetingSlots(D, { timeZone: "UTC", now, availability: cases[0]!.availability }).length, 3);
});

test("SC-R40-02 default settings match the old seed over a sweep of times, zones and busy layouts", () => {
  const zones = ["Asia/Tokyo", "America/New_York", "Europe/London", "UTC"];
  let compared = 0, nonEmpty = 0;
  for (const zone of zones) {
    for (let step = 0; step < 24; step++) {
      // Every 7.5 hours from a Thursday, crossing weekends and the US spring DST change (2026-03-08).
      const now = Date.parse("2026-03-05T00:00:00Z") + step * 27_000_000;
      const today = localDateOf(now, zone)!;
      const day1 = addLocalDays(today, 1)!;
      const from = Date.parse(`${day1}T00:00:00Z`) - 14 * 3_600_000, to = from + 14.5 * 86_400_000;
      const items = step % 3 === 0 ? [] : [
        { startsAt: new Date(now + 86_400_000 + (step % 5) * 3_600_000).toISOString(), endsAt: new Date(now + 86_400_000 + (step % 5 + 4) * 3_600_000).toISOString() },
        { startsAt: addLocalDays(today, 2 + (step % 4))!, allDay: true },
        ...(step % 2 ? [{ startsAt: new Date(now + 3 * 86_400_000).toISOString() }] : []),
      ];
      const availability: MeetingAvailability = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), complete: true, items };
      const expected = seedAvailableMeetingCandidates(now, zone, availability);
      assert.deepEqual(seedMeetingSlots(D, { timeZone: zone, now, availability }), expected, `${zone} ${new Date(now).toISOString()}`);
      compared++; if (expected.length) nonEmpty++;
    }
  }
  assert.equal(compared, 96);
  assert.ok(nonEmpty > 60, `most cases must produce candidates (${nonEmpty})`);
});

const tokyoNow = Date.parse("2026-11-16T00:00:00Z"); // Mon 09:00 JST
const tokyoWindow = { from: "2026-11-16T15:00:00Z", to: "2026-11-30T15:00:00Z" }; // Tue 11/17 00:00 → Tue 12/1 00:00 JST
const custom: SchedulingAvailabilitySettings = { ...D, start: "10:00", end: "18:00", lunch: { start: "12:00", end: "13:00" }, minimumNotice: "1d", bufferMinutes: 15 };

test("SC-R40-02 custom hours, lunch, one-day notice and a 15-minute buffer move the seed", () => {
  const availability: MeetingBusyAvailability = { ...tokyoWindow, complete: true, items: [
    // Tue 11/17 10:00–11:00 JST busy: 11:00 starts touch it, so with the 15-minute buffer the
    // first free start is 11:30 — but 11:30–12:30 crosses lunch, so the day's slot is 13:00.
    { startsAt: "2026-11-17T01:00:00Z", endsAt: "2026-11-17T02:00:00Z" },
    // Wed 11/18 13:00–14:00 JST busy: 10:00 is free.
    { startsAt: "2026-11-18T04:00:00Z", endsAt: "2026-11-18T05:00:00Z" },
  ] };
  // now = Mon 11/16 09:00 JST: one day of notice rules out Tue before 09:00, not 10:00+.
  assert.deepEqual(seedMeetingSlots(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability }), [
    { startsAt: "2026-11-17T04:00:00.000Z", endsAt: "2026-11-17T05:00:00.000Z" }, // Tue 13:00–14:00
    { startsAt: "2026-11-18T01:00:00.000Z", endsAt: "2026-11-18T02:00:00.000Z" }, // Wed 10:00–11:00
    { startsAt: "2026-11-19T01:00:00.000Z", endsAt: "2026-11-19T02:00:00.000Z" }, // Thu 10:00–11:00
  ]);
  // Without the buffer, Tue 11:00 would fit right after the busy hour — lunch still blocks 11:30.
  assert.equal(seedMeetingSlots({ ...custom, bufferMinutes: 0 }, { timeZone: "Asia/Tokyo", now: tokyoNow, availability })[0]?.startsAt, "2026-11-17T02:00:00.000Z");
  // A 30-minute duration fits 11:30–12:00 before lunch even with the buffer.
  assert.equal(seedMeetingSlots({ ...custom, durationMinutes: 30 }, { timeZone: "Asia/Tokyo", now: tokyoNow, availability })[0]?.startsAt, "2026-11-17T02:30:00.000Z");
  // Two days of notice from Mon 09:00 JST: Tue is out, Wed 10:00 (the day's start) is the earliest.
  assert.equal(seedMeetingSlots({ ...custom, minimumNotice: "2d" }, { timeZone: "Asia/Tokyo", now: tokyoNow, availability })[0]?.startsAt, "2026-11-18T01:00:00.000Z");
  // Weekdays: only Saturday → 11/21, 11/28 are the only days in 14 → fewer than 3 → [].
  assert.deepEqual(seedMeetingSlots({ ...custom, weekdays: ["sat"] }, { timeZone: "Asia/Tokyo", now: tokyoNow, availability }), []);
  assert.equal(seedMeetingSlots({ ...custom, weekdays: ["sat"] }, { timeZone: "Asia/Tokyo", now: tokyoNow, availability, count: 2 }).length, 2);
});

test("isSlotAllowed checks weekday, hours, lunch and notice only", () => {
  const input = { timeZone: "Asia/Tokyo", now: tokyoNow };
  const slot = (start: string, end: string) => ({ startsAt: start, endsAt: end });
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T01:00:00Z", "2026-11-18T02:00:00Z"), input), true); // Wed 10–11
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T00:30:00Z", "2026-11-18T01:30:00Z"), input), false); // 09:30 before start
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T08:30:00Z", "2026-11-18T09:30:00Z"), input), false); // ends 18:30
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z"), input), true); // 17–18
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T02:30:00Z", "2026-11-18T03:30:00Z"), input), false); // 11:30–12:30 lunch
  assert.equal(isSlotAllowed(custom, slot("2026-11-21T01:00:00Z", "2026-11-21T02:00:00Z"), input), false); // Saturday
  assert.equal(isSlotAllowed(custom, slot("2026-11-16T23:30:00Z", "2026-11-17T00:30:00Z"), input), false); // Tue 08:30 (hours)
  // Exactly now + 24h (Tue 09:00 JST) is too soon; the notice must be exceeded.
  assert.equal(isSlotAllowed({ ...custom, start: "09:00" }, slot("2026-11-17T00:00:00Z", "2026-11-17T01:00:00Z"), input), false);
  assert.equal(isSlotAllowed({ ...custom, start: "09:00" }, slot("2026-11-17T00:30:00Z", "2026-11-17T01:30:00Z"), input), true);
  assert.equal(isSlotAllowed(custom, slot("2026-11-18T01:00:00Z", "2026-11-18T02:00:00Z"), { timeZone: "Not/AZone", now: tokyoNow }), false);
});

// ---------- SC-R40-03: the grid ----------

const wedBusy: MeetingBusyAvailability = { ...tokyoWindow, complete: true, items: [{ startsAt: "2026-11-18T04:00:00Z", endsAt: "2026-11-18T05:00:00Z" }] }; // Wed 13–14 JST

function states(grid: ReturnType<typeof availabilityGrid>, dayIndex = 0) {
  return Object.fromEntries(grid.days[dayIndex]!.cells.map((cell) => [cell.time, cell.state]));
}

test("SC-R40-03 grid rows follow the settings; cells are allowed / busy / off (Asia/Tokyo, calendars complete)", () => {
  const grid = availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: wedBusy, days: ["2026-11-18", "2026-11-21"] });
  assert.deepEqual(grid.rows, ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]);
  assert.equal(grid.days[0]!.weekday, "wed");
  assert.deepEqual(grid.days[0]!.cells[0], { time: "10:00", startsAt: "2026-11-18T01:00:00.000Z", endsAt: "2026-11-18T02:00:00.000Z", state: "allowed" });
  assert.deepEqual(states(grid), {
    "10:00": "allowed", "10:30": "allowed", "11:00": "allowed", // 11–12 ends where lunch starts
    "11:30": "off", "12:00": "off", "12:30": "off", // lunch
    "13:00": "busy", "13:30": "busy", "14:00": "busy", // 14:00 is inside the 15-minute buffer
    "14:30": "allowed", "15:00": "allowed", "15:30": "allowed", "16:00": "allowed", "16:30": "allowed", "17:00": "allowed",
    "17:30": "off", // would end 18:30
  });
  assert.equal(grid.days[1]!.weekday, "sat");
  assert.ok(grid.days[1]!.cells.every((cell) => cell.state === "off"));
  // Default settings: 18 rows 09:00–17:30, like the old 5 × 18 grid.
  assert.equal(availabilityGrid(D, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: wedBusy, days: [] }).rows.length, 18);
  // A 30-minute duration picked in the dialog: 17:30–18:00 fits.
  assert.equal(states(availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: wedBusy, days: ["2026-11-18"], durationMinutes: 30 }))["17:30"], "allowed");
});

test("SC-R40-03 external calendar not connected (Orbit schedule only, complete) preselects; a failed read (incomplete) gives unknown cells and no preselection", () => {
  const orbitOnly: MeetingBusyAvailability = { ...wedBusy, complete: true };
  assert.equal(seedMeetingSlots(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: orbitOnly }).length, 3);
  assert.equal(states(availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: orbitOnly, days: ["2026-11-18"] }))["10:00"], "allowed");

  const failed: MeetingBusyAvailability = { ...wedBusy, complete: false };
  assert.deepEqual(seedMeetingSlots(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: failed }), []);
  const grid = states(availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: failed, days: ["2026-11-18"] }));
  assert.equal(grid["10:00"], "unknown");
  assert.equal(grid["15:00"], "unknown");
  assert.equal(grid["12:00"], "off"); // off stays off
  assert.equal(grid["13:00"], "busy"); // busy time that was read is still known
  // No availability at all (read not finished / failed before any data): every non-off cell is unknown.
  const none = states(availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: null, days: ["2026-11-18"] }));
  assert.equal(none["10:00"], "unknown");
  assert.equal(none["13:00"], "unknown");
  assert.equal(none["12:00"], "off");
  // Outside the window that was read → unknown.
  assert.equal(states(availabilityGrid(custom, { timeZone: "Asia/Tokyo", now: tokyoNow, availability: orbitOnly, days: ["2026-12-01"] }))["10:00"], "unknown");
});

test("SC-R40-03 America/New_York across the spring DST change keeps local wall times; skipped and repeated local times are off", () => {
  const now = Date.parse("2026-03-01T00:00:00Z");
  const availability: MeetingBusyAvailability = { from: "2026-03-02T05:00:00Z", to: "2026-03-16T04:00:00Z", complete: true, items: [] };
  const grid = availabilityGrid(D, { timeZone: "America/New_York", now, availability, days: ["2026-03-06", "2026-03-09"] });
  assert.equal(grid.days[0]!.cells[0]!.startsAt, "2026-03-06T14:00:00.000Z"); // Fri 09:00 EST
  assert.equal(grid.days[1]!.cells[0]!.startsAt, "2026-03-09T13:00:00.000Z"); // Mon 09:00 EDT
  assert.equal(grid.days[1]!.cells[0]!.state, "allowed");
  const seeded = seedMeetingSlots(D, { timeZone: "America/New_York", now, availability });
  assert.deepEqual(seeded.map((slot) => slot.startsAt), ["2026-03-02T14:00:00.000Z", "2026-03-03T14:00:00.000Z", "2026-03-04T14:00:00.000Z"]);

  const night: SchedulingAvailabilitySettings = { ...D, weekdays: ["sun"], start: "00:00", end: "04:00", durationMinutes: 30 };
  const spring = states(availabilityGrid(night, { timeZone: "America/New_York", now, availability: null, days: ["2026-03-08"] }));
  assert.equal(spring["01:30"], "unknown");
  assert.equal(spring["02:00"], "off"); // does not exist
  assert.equal(spring["02:30"], "off");
  assert.equal(spring["03:00"], "unknown");
  const fall = availabilityGrid(night, { timeZone: "America/New_York", now: Date.parse("2026-10-20T00:00:00Z"), availability: null, days: ["2026-11-01"] });
  const fallStates = states(fall);
  assert.equal(fallStates["01:00"], "off"); // happens twice
  assert.equal(fall.days[0]!.cells.find((cell) => cell.time === "01:00")!.startsAt, null);
  assert.equal(fallStates["00:30"], "unknown");
});

test("local date helpers", () => {
  assert.equal(localWeekday("2026-11-18"), "wed");
  assert.equal(localWeekday("2026-02-30"), null);
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(localDateOf(Date.parse("2026-11-17T15:30:00Z"), "Asia/Tokyo"), "2026-11-18");
  assert.equal(localDateOf(Date.parse("2026-11-17T15:30:00Z"), "America/New_York"), "2026-11-17");
});

// ---------- SC-R40-04: text ----------

const designSlots = [
  { startsAt: "2026-11-19T05:00:00Z", endsAt: "2026-11-19T05:30:00Z" },
  { startsAt: "2026-11-18T01:00:00Z", endsAt: "2026-11-18T01:30:00Z" },
  { startsAt: "2026-11-21T07:00:00Z", endsAt: "2026-11-21T07:30:00Z" },
];

test("SC-R40-04 the paragraph in ja / zh / en matches design ③ (sorted, weekday, start–end, duration, format)", () => {
  assert.equal(formatMeetingSlotsText(designSlots, { language: "ja", timeZone: "Asia/Tokyo", durationMinutes: 30, medium: "video" }), [
    "以下の日時のいずれかで、30 分ほどお時間をいただけますでしょうか（オンライン）。",
    "・11/18（水）10:00–10:30",
    "・11/19（木）14:00–14:30",
    "・11/21（土）16:00–16:30",
  ].join("\n"));
  assert.equal(formatMeetingSlotsText(designSlots, { language: "zh", timeZone: "Asia/Tokyo", durationMinutes: 30, medium: "in_person" }), [
    "以下时间您是否方便？想约您 30 分钟左右（面谈）。",
    "・11/18（周三）10:00–10:30",
    "・11/19（周四）14:00–14:30",
    "・11/21（周六）16:00–16:30",
  ].join("\n"));
  assert.equal(formatMeetingSlotsText(designSlots, { language: "en", timeZone: "Asia/Tokyo", durationMinutes: 30, medium: "phone" }), [
    "Would any of these times work for a 30-minute phone call?",
    "- Wed, Nov 18, 10:00–10:30",
    "- Thu, Nov 19, 14:00–14:30",
    "- Sat, Nov 21, 16:00–16:30",
  ].join("\n"));
  assert.equal(formatMeetingSlotsText(designSlots.slice(0, 1), { language: "ja", timeZone: "America/New_York", durationMinutes: 30 }),
    "以下の日時のいずれかで、30 分ほどお時間をいただけますでしょうか。\n・11/19（木）00:00–00:30");
  assert.equal(formatMeetingSlotsText(designSlots.slice(0, 1), { language: "en", timeZone: "UTC", durationMinutes: 60, medium: null }).split("\n")[0], "Would any of these times work for a 60-minute meeting?");
  assert.equal(formatMeetingSlotsText([], { language: "ja", timeZone: "Asia/Tokyo", durationMinutes: 30 }), "");
});

test("SC-R40-04 replaceMeetingSlotsText replaces only the inserted paragraph and keeps the person's edits", () => {
  const first = formatMeetingSlotsText(designSlots, { language: "ja", timeZone: "Asia/Tokyo", durationMinutes: 30, medium: "video" });
  const template = "安川 高宏様\n\nご無沙汰しております。\n現在「制造业客户介绍」に取り組んでおり、ご連絡しました。\n\nどうぞよろしくお願いいたします。";
  // No paragraph yet → before the closing line, as its own paragraph.
  const inserted = replaceMeetingSlotsText(template, first);
  assert.equal(inserted, `安川 高宏様\n\nご無沙汰しております。\n現在「制造业客户介绍」に取り組んでおり、ご連絡しました。\n\n${first}\n\nどうぞよろしくお願いいたします。`);
  // The person edits the greeting and the closing; picking again replaces only the paragraph.
  const edited = inserted.replace("ご無沙汰しております。", "先日はありがとうございました。").replace("どうぞよろしく", "引き続きよろしく");
  const second = formatMeetingSlotsText(designSlots.slice(0, 2), { language: "ja", timeZone: "Asia/Tokyo", durationMinutes: 60, medium: "in_person" });
  const replaced = replaceMeetingSlotsText(edited, second, { previous: first });
  assert.equal(replaced, edited.replace(first, second));
  assert.ok(replaced.includes("先日はありがとうございました。") && replaced.includes("引き続きよろしくお願いいたします。"));
  // Without `previous` (e.g. after a reload) the paragraph is found by its shape.
  assert.equal(replaceMeetingSlotsText(edited, second), edited.replace(first, second));
  // The block written right under a line (design ③ layout) is found too.
  const tight = `本文です。\n${first}\n\nよろしくお願いします。`;
  assert.equal(replaceMeetingSlotsText(tight, second), `本文です。\n${second}\n\nよろしくお願いします。`);
  // Empty block removes it and leaves one blank line at the seam.
  assert.equal(replaceMeetingSlotsText(inserted, ""), template);
  // No closing line → appended; empty body → the block alone.
  assert.equal(replaceMeetingSlotsText("Hi Ken,\n\nGreat to meet you.", "X"), "Hi Ken,\n\nGreat to meet you.\n\nX");
  assert.equal(replaceMeetingSlotsText("", first), first);
  // English closing with a signature line.
  const en = formatMeetingSlotsText(designSlots, { language: "en", timeZone: "Asia/Tokyo", durationMinutes: 30 });
  assert.equal(replaceMeetingSlotsText("Hi Ken,\n\nGreat to meet you.\n\nBest regards,\nLi", en), `Hi Ken,\n\nGreat to meet you.\n\n${en}\n\nBest regards,\nLi`);
  // "$" in the new block is written literally.
  assert.equal(replaceMeetingSlotsText(`a\n${first}\nb`, "$& $1", { previous: first }), "a\n$& $1\nb");
});
