/**
 * events-0918/events-model.ts 纯函数契约（设计 Events.dc.html renderVals 828–832、870）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CTA_TONE,
  STAT_CARDS,
  STATUS_CHIP,
  ctaFor,
  eventChipKind,
  eventDetailHref,
  listStats,
  registeredCountLabel,
  timelineDate,
  timelineNodes,
  timelineStep,
} from "../../app/(app)/app/events/events-0918/events-model";

test("status chip follows the design stStyle table and treats registered-upcoming as 已报名", () => {
  assert.equal(eventChipKind("active", false), "active");
  assert.equal(eventChipKind("active", true), "active");
  assert.equal(eventChipKind("ended", true), "ended");
  assert.equal(eventChipKind("upcoming", false), "upcoming");
  assert.equal(eventChipKind("upcoming", true), "registered");
  assert.deepEqual(STATUS_CHIP.active, { bg: "#E6F1EC", fg: "#2F6B4F", label: { zh: "进行中", en: "Live" } });
  assert.deepEqual(STATUS_CHIP.registered, { bg: "#DDDEFA", fg: "#2E3270", label: { zh: "已报名", en: "Registered" } });
  assert.deepEqual(STATUS_CHIP.upcoming, { bg: "#FBF1DC", fg: "#8A6420", label: { zh: "即将开始", en: "Upcoming" } });
  assert.deepEqual(STATUS_CHIP.ended, { bg: "#F0F1F8", fg: "#6B6F99", label: { zh: "已结束", en: "Ended" } });
});

test("ctaFor maps lifecycle + registration to the four design CTAs with real routes", () => {
  assert.equal(eventDetailHref("SMALL STAGING"), "/app/events/SMALL%20STAGING");

  const live = ctaFor({ code: "E1", status: "active", registered: true });
  assert.deepEqual(live, { href: "/app/events/E1/live", kind: "live", label: { zh: "进入活动现场", en: "Enter live" }, tone: "dark" });

  const recap = ctaFor({ code: "E1", status: "ended", registered: false });
  assert.deepEqual(recap, { href: "/app/events/E1?view=recap", kind: "recap", label: { zh: "回看活动", en: "Recap" }, tone: "ghost" });
  assert.equal(ctaFor({ code: "E1", status: "ended", registered: true }).kind, "recap");

  const view = ctaFor({ code: "E1", status: "upcoming", registered: true });
  assert.deepEqual(view, { href: "/app/events/E1", kind: "view", label: { zh: "查看活动", en: "View event" }, tone: "dark" });

  const register = ctaFor({ code: "E1", status: "upcoming", registered: false }, "open");
  assert.deepEqual(register, { href: "/app/events/E1/register", kind: "register", label: { zh: "立即报名", en: "Register now" }, tone: "accent" });

  // 报名未开放 / 未配置 → 不暗示可报名；未报名的进行中活动进不了现场 → 查看活动。
  assert.equal(ctaFor({ code: "E1", status: "upcoming", registered: false }).kind, "view");
  assert.equal(ctaFor({ code: "E1", status: "upcoming", registered: false }, "registration_closed").kind, "view");
  assert.equal(ctaFor({ code: "E1", status: "active", registered: false }).kind, "view");

  assert.deepEqual(CTA_TONE.dark, { bg: "#0E1225", fg: "#FFFFFF", border: "transparent" });
  assert.deepEqual(CTA_TONE.accent, { bg: "#4B4FC7", fg: "#FFFFFF", border: "transparent" });
  assert.deepEqual(CTA_TONE.ghost, { bg: "#FFFFFF", fg: "#2E3270", border: "#B9BCEB" });
});

test("timeline nodes: 报名成功 has no date source, start/end are real, marks/rings follow the design step", () => {
  const event = { endsAt: "2026-09-20T12:00:00.000Z", startsAt: "2026-09-20T10:00:00.000Z" };
  assert.equal(timelineStep("upcoming"), 0);
  assert.equal(timelineStep("active"), 1);
  assert.equal(timelineStep("ended"), 2);
  assert.equal(timelineDate(event.startsAt, "zh"), "9月20日");
  assert.equal(timelineDate(event.startsAt, "en"), "Sep 20");
  assert.equal(timelineDate("not-a-date", "zh"), "—");

  const upcoming = timelineNodes({ ...event, status: "upcoming" }, "zh");
  assert.deepEqual(upcoming.map((n) => n.label.zh), ["报名成功", "活动开始", "活动结束"]);
  assert.deepEqual(upcoming.map((n) => n.date), ["—", "9月20日", "9月20日"]);
  assert.deepEqual(upcoming.map((n) => n.mark), ["", "", ""]);
  assert.deepEqual(upcoming.map((n) => n.ring), ["0 0 0 4px #DDDEFA", "none", "none"]);
  assert.deepEqual(upcoming.map((n) => n.bg), ["#4B4FC7", "#FFFFFF", "#FFFFFF"]);
  assert.deepEqual(upcoming.map((n) => n.line), ["#DDDEFA", "#DDDEFA", "transparent"]);

  const active = timelineNodes({ ...event, status: "active" }, "zh");
  assert.deepEqual(active.map((n) => n.mark), ["✓", "", ""]);
  assert.deepEqual(active.map((n) => n.ring), ["none", "0 0 0 4px #DDDEFA", "none"]);
  assert.deepEqual(active.map((n) => n.line), ["#4B4FC7", "#DDDEFA", "transparent"]);
  assert.deepEqual(active.map((n) => n.border), ["#4B4FC7", "#4B4FC7", "#C9CBEA"]);

  const ended = timelineNodes({ ...event, status: "ended" }, "zh");
  assert.deepEqual(ended.map((n) => n.mark), ["✓", "✓", "✓"]);
  assert.deepEqual(ended.map((n) => n.ring), ["none", "none", "none"]);
  assert.deepEqual(ended.map((n) => n.line), ["#4B4FC7", "#4B4FC7", "transparent"]);
});

test("stat cards are the four truthful counters with design icons/colours", () => {
  assert.deepEqual(STAT_CARDS.map((card) => [card.key, card.icon, card.bg, card.fg]), [
    ["upcoming", "✦", "#ECEEFB", "#4B4FC7"],
    ["registered", "◎", "#ECEEFB", "#4B4FC7"],
    ["active", "▶", "#E6F1EC", "#2F6B4F"],
    ["thisMonth", "▦", "#ECEEFB", "#4B4FC7"],
  ]);
  const stats = listStats(
    [
      { startsAt: "2026-09-05T00:00:00.000Z", stats: { youRsvped: true } as never, status: "ended" },
      { startsAt: "2026-09-22T00:00:00.000Z", stats: { youRsvped: true } as never, status: "active" },
      { startsAt: "2026-10-01T00:00:00.000Z", stats: { youRsvped: false } as never, status: "upcoming" },
      { startsAt: "invalid", stats: { youRsvped: false } as never, status: "upcoming" },
    ],
    new Date("2026-09-22T03:00:00.000Z"),
  );
  assert.deepEqual(stats, { active: 1, registered: 2, thisMonth: 2, upcoming: 2 });
});

test("registered count label omits unknown and zero counts", () => {
  assert.equal(registeredCountLabel(null, "zh"), null);
  assert.equal(registeredCountLabel(0, "zh"), null);
  assert.equal(registeredCountLabel(7, "zh"), "+7 人已报名");
  assert.equal(registeredCountLabel(7, "en"), "+7 registered");
});
