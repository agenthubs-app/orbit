import assert from "node:assert/strict";
import { test } from "node:test";

import { agendaProgress } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";

// 2026-08-13 19:00 Asia/Tokyo (UTC+9, 无夏令时) = 2026-08-13T10:00:00Z
const STARTS_AT = "2026-08-13T10:00:00.000Z";
const ENDS_AT = "2026-08-13T12:30:00.000Z";

const AGENDA = [
  { description: "", label: "签到", time: "18:30" },
  { description: "", label: "开场", time: "19:00" },
  { description: "", label: "第一轮", time: "19:15" },
  { description: "", label: "第二轮", time: "20:15" },
];

function eventAt(status: "active" | "ended" | "upcoming") {
  return { agenda: AGENDA, endsAt: ENDS_AT, startsAt: STARTS_AT, status };
}

test("before the event starts nothing is current", () => {
  const { currentIndex, items } = agendaProgress(
    eventAt("upcoming"),
    new Date("2026-08-13T08:00:00.000Z"),
  );
  assert.equal(items.length, 4);
  assert.equal(currentIndex, -1);
});

test("mid-event lands on the agenda item whose time has passed", () => {
  // 19:40 Tokyo = 10:40Z → 第一轮(19:15) 已开始，第二轮(20:15) 未到
  const { currentIndex } = agendaProgress(
    eventAt("active"),
    new Date("2026-08-13T10:40:00.000Z"),
  );
  assert.equal(currentIndex, 2);
});

test("ended events mark every step done", () => {
  const { currentIndex, items } = agendaProgress(
    eventAt("ended"),
    new Date("2026-08-14T00:00:00.000Z"),
  );
  assert.equal(currentIndex, items.length);
});

test("agenda times before the official start still resolve (check-in row)", () => {
  // 19:05 Tokyo：开场(19:00) 已过 → index 1；签到(18:30) 属于更早的墙钟时间
  const { currentIndex } = agendaProgress(
    eventAt("active"),
    new Date("2026-08-13T10:05:00.000Z"),
  );
  assert.equal(currentIndex, 1);
});
