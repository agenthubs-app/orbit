import assert from "node:assert/strict";
import test from "node:test";

import type { EventDiscoverRow } from "../src/api/contract/event-discover";
import { createTranslator } from "../src/i18n/messages";
import type { MessageKey } from "../src/i18n/messages";
import { eventSummary, summaryWhen, type EventSummaryRow } from "../src/screens/events/v2/event-summary-model";

// 2026-11-23 event-side-panel-proposal: 探す 卡片的底部简介面板。六种主按钮状态（② S1–S6）、字段表「没有时」、三语。
const NOW = Date.parse("2026-11-23T03:00:00.000Z");
const tr = (language: "zh" | "ja" | "en") => { const t = createTranslator(language); return (key: string, values?: Record<string, string | number>) => t(key as MessageKey, values); };

const open: EventDiscoverRow = {
  eventId: "ev-6", title: "第六期 中日创业交流会", startsAt: "2026-11-28T05:00:00.000Z", endsAt: "2026-11-28T08:30:00.000Z",
  venue: "山田屋ビル B2", area: "tokyo", priceYen: 3000, emoji: "🤝", organizerId: "org-1", organizerName: "日中创新创业协会",
  registrationCount: 128, href: "/events/ev-6",
  relevance: { group: "people", people: [], known: { count: 2, names: ["王 伟", "田中 美咲"] }, topic: { labels: ["渠道伙伴"] }, warnings: [] },
};
const ended: EventDiscoverRow = { ...open, eventId: "ev-4", title: "第4回 中日创业交流会", startsAt: "2026-06-21T09:30:00.000Z", endsAt: "2026-06-21T12:00:00.000Z", registrationCount: 35, href: "/events/ev-4" };
const summary = (row: EventSummaryRow, language: "zh" | "ja" | "en" = "zh") => eventSummary(row, { language, now: NOW, t: tr(language) });

test("S1 recruiting with list fields only: time, place, fee; relevance facts; count; 参加 → register", () => {
  const s = summary(open);
  assert.equal(s.state, "open");
  assert.deepEqual(s.marks, [], "recruiting and not registered: no status row");
  assert.deepEqual(s.facts.map((fact) => fact.main), ["11月28日（六）14:00 – 17:30", "山田屋ビル B2", "¥3,000"]);
  assert.equal(s.facts[2]!.sub, null, "no seats / deadline on the list yet → no sub line");
  assert.equal(s.intro, null, "no description on the list yet → the intro block is hidden");
  assert.deepEqual(s.relevance.map((line) => [line.chip, line.text]), [["认识的人2位", "王 伟、田中 美咲 已报名"], ["主题相近", "与计划里的「渠道伙伴」主题相近"]]);
  assert.deepEqual(s.people, { preview: [], text: "已报名 128 人", title: "attendees" });
  assert.deepEqual(s.action, { href: "/events/ev-6/register", kind: "register" });
  assert.equal(s.detailHref, "/events/ev-6");
});

test("S1 with the pending fields: address, seats + deadline under the fee, 4-line intro, up to 4 avatars", () => {
  const s = summary({ ...open, attendeePreview: [{ initial: "王" }, { initial: "田" }, { initial: "L" }, { initial: "佐" }, { initial: "X" }], description: "在日华人创业者\n的线下交流会。", registrationDeadline: "2026-11-26T14:59:00.000Z", seatsLeft: 12, venueAddress: "東京都港区新橋6-5-3" });
  assert.equal(s.facts[1]!.sub, "東京都港区新橋6-5-3");
  assert.equal(s.facts[2]!.sub, "还剩 12 个名额 · 报名到 11/26");
  assert.equal(s.intro, "在日华人创业者 的线下交流会。");
  assert.equal(s.people?.preview.length, 4);
});

test("S2 registered: 已报名 mark, no fee row, 查看我的报名", () => {
  const s = summary({ ...open, myStatus: "registered" });
  assert.deepEqual(s.marks.map((mark) => mark.key), ["registered"]);
  assert.deepEqual(s.facts.map((fact) => fact.icon), ["calendar", "pin"]);
  assert.deepEqual(s.action, { href: "/events/ev-6/prep", kind: "myRegistration" });
});

test("S3 full / closed: a disabled primary that names the reason; waitlist is pressable", () => {
  const full = summary({ ...open, registrationState: "full", seatsLeft: 0 });
  assert.deepEqual(full.action, { kind: "disabled", reason: "full" });
  assert.equal(full.facts[2]!.sub, "名额已满");
  assert.deepEqual(summary({ ...open, registrationState: "closed" }).action, { kind: "disabled", reason: "closed" });
  assert.deepEqual(summary({ ...open, registrationState: "waitlist" }).action, { href: "/events/ev-6/register", kind: "waitlist" });
});

test("S4 ended and attended: 已结束 + 你参加了, met people replace attendees, 看会场记录", () => {
  const s = summary({ ...ended, metPeople: { count: 6, notContacts: 2, preview: [{ initial: "王" }] }, myStatus: "attended" });
  assert.deepEqual(s.marks.map((mark) => mark.key), ["ended", "attended"]);
  assert.deepEqual(s.facts.map((fact) => fact.icon), ["calendar", "pin"], "ended: no fee row");
  assert.deepEqual(s.relevance, [], "ended: no relevance block");
  assert.deepEqual(s.people, { preview: [{ initial: "王" }], text: "6 人，其中 2 人还没加为人脉", title: "met" });
  assert.deepEqual(s.action, { href: "/events/ev-4/live", kind: "venueRecord" });
  assert.equal(summary({ ...ended, myStatus: "attended" }).people?.text, "这场没有留下见面记录");
});

test("S5 / S6 ended and missed: next edition → 看下一场; none → 关注主办方 (following → 已关注)", () => {
  const next = { eventId: "ev-6", href: "/events/ev-6", startsAt: open.startsAt, title: open.title, venue: "新橋" };
  const s5 = summary({ ...ended, nextEvent: next });
  assert.equal(s5.state, "missedNext");
  assert.deepEqual(s5.action, { kind: "nextEvent", next });
  assert.equal(s5.next, next);
  assert.equal(s5.people?.text, "35 人参加");
  const s6 = summary(ended);
  assert.deepEqual(s6.action, { following: false, kind: "follow", organizerId: "org-1" });
  assert.deepEqual(s6.marks.map((mark) => mark.key), ["ended"]);
  assert.deepEqual(summary({ ...ended, organizerFollowing: true }).action, { following: true, kind: "follow", organizerId: "org-1" });
});

test("field table fallbacks: online has no address, fewer than 10 registrants hide the count, a placeholder organizer is hidden", () => {
  const s = summary({ ...open, area: "online", organizerName: "Organizer #1Q8PXWU", registrationCount: 4, venue: "Zoom", venueAddress: "x" });
  assert.deepEqual(s.facts[1], { icon: "pin", main: "线上", sub: null });
  assert.equal(s.people, null);
  assert.equal(s.organizer, null);
  assert.equal(summary({ ...open, priceYen: 0 }).facts[2]!.main, "免费");
});

test("three languages: the same row reads entirely in the screen language", () => {
  const row: EventSummaryRow = { ...open, registrationDeadline: "2026-11-26T14:59:00.000Z", seatsLeft: 12 };
  const ja = summary(row, "ja");
  assert.equal(ja.facts[0]!.main, "11月28日（土）14:00 – 17:30");
  assert.equal(ja.facts[2]!.sub, "残り 12 席 · 11/26 まで受付");
  assert.equal(ja.people?.text, "128 人が申込");
  const en = summary(row, "en");
  assert.equal(en.facts[0]!.main, "Sat 11/28 · 14:00 – 17:30");
  assert.equal(en.facts[2]!.sub, "12 seats left · Register by 11/26");
  assert.equal(en.people?.text, "128 registered");
  assert.match(en.relevance.map((line) => line.text).join(" "), /^[\x20-\x7e王伟田中美咲渠道伙伴“”]*$/u, "en sentences carry no CJK beyond the names and topic");
  assert.equal(summaryWhen(open.startsAt, null, "zh", tr("zh")), "11月28日（六）14:00");
});
