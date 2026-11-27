import assert from "node:assert/strict";
import test from "node:test";

import type { EventDiscoverRow } from "../src/api/contract/event-discover";
import type { EventSummaryResponse } from "../src/api/contract/event-summary";
import { createTranslator } from "../src/i18n/messages";
import type { MessageKey } from "../src/i18n/messages";
import { eventSummary, rowWithSummary, summaryWhen, type EventSummary, type EventSummaryRow } from "../src/screens/events/v2/event-summary-model";

// 2026-11-23 event-side-panel-proposal: 探す 卡片的底部简介面板。先出布局（列表字段 + 骨架 + 按钮占位），摘要
// (GET /api/events/:id/summary) 到了原位替换；六种主按钮状态（② S1–S6，与 Web primaryAction 同规则）、字段表「没有时」、三语。
const NOW = Date.parse("2026-11-23T03:00:00.000Z");
const tr = (language: "zh" | "ja" | "en") => { const t = createTranslator(language); return (key: string, values?: Record<string, string | number>) => t(key as MessageKey, values); };

const open: EventDiscoverRow = {
  eventId: "ev-6", title: "第六期 中日创业交流会", startsAt: "2026-11-28T05:00:00.000Z", endsAt: "2026-11-28T08:30:00.000Z",
  venue: "山田屋ビル B2", area: "tokyo", priceYen: 3000, emoji: "🤝", organizerId: "org-1", organizerName: "日中创新创业协会",
  registrationCount: 128, href: "/events/ev-6",
  relevance: { group: "people", people: [], known: { count: 2, names: ["王 伟", "田中 美咲"] }, topic: { labels: ["渠道伙伴"] }, warnings: [] },
};
const ended: EventDiscoverRow = { ...open, eventId: "ev-4", title: "第4回 中日创业交流会", startsAt: "2026-06-21T09:30:00.000Z", endsAt: "2026-06-21T12:00:00.000Z", registrationCount: 35, href: "/events/ev-4" };
const answer = (row: EventDiscoverRow, patch: Partial<EventSummaryResponse> = {}): EventSummaryResponse => ({
  attendeeInitials: [], capacity: null, description: null, emoji: row.emoji, ended: row === ended || Boolean(patch.ended), eventId: row.eventId,
  organizer: { following: false, name: "日中创新创业协会", organizerId: "org-1" }, registrationClosesAt: null, registrationCount: row.registrationCount ?? 0,
  remaining: null, startsAt: row.startsAt, status: "none", title: row.title, waitlistEnabled: false, ...patch,
});
const summary = (row: EventSummaryRow, language: "zh" | "ja" | "en" = "zh") => eventSummary(row, { language, now: NOW, t: tr(language) });
const loaded = (row: EventDiscoverRow, patch: Partial<EventSummaryResponse> = {}, language: "zh" | "ja" | "en" = "zh") => summary(rowWithSummary(row, answer(row, patch), NOW), language);
const filled = (people: EventSummary["people"]) => (people && !("pending" in people) ? people : null);

test("first frame (summary not in yet): list facts drawn, intro / attendees / seats line as skeletons, primary as a placeholder", () => {
  const s = summary(open);
  assert.equal(s.state, "pending");
  assert.deepEqual(s.facts.map((fact) => fact.main), ["11月28日（六）14:00 – 17:30", "山田屋ビル B2", "¥3,000"], "time / place / fee from the list at once");
  assert.equal(s.facts[2]!.sub, "pending");
  assert.equal(s.intro, "pending");
  assert.deepEqual(s.people, { pending: true, title: "attendees" });
  assert.deepEqual(s.relevance.map((line) => [line.chip, line.text]), [["认识的人2位", "王 伟、田中 美咲 已报名"], ["主题相近", "与你目标里的「渠道伙伴」主题相近"]], "relevance is a list field: first frame");
  assert.deepEqual(s.action, { kind: "pending" });
  const e = summary(ended);
  assert.deepEqual(e.marks.map((mark) => mark.key), ["ended"], "ended is known from the list");
  assert.deepEqual(e.facts.map((fact) => fact.icon), ["calendar", "pin"], "ended: no fee row from the first frame");
  assert.deepEqual(e.people, { pending: true, title: null }, "ended: 参加者 or 你在这场见过的人 is not known yet");
});

test("S1 recruiting: seats + deadline under the fee, 4-line intro, up to 4 avatars, 参加 → register", () => {
  const s = loaded(open, { attendeeInitials: ["王", "田", "L", "佐", "X"], description: "在日华人创业者\n的线下交流会。", registrationClosesAt: "2026-11-26T14:59:00.000Z", remaining: 12 });
  assert.equal(s.state, "open");
  assert.deepEqual(s.marks, [], "recruiting and not registered: no status row");
  assert.equal(s.facts[2]!.sub, "还剩 12 个名额 · 报名到 11/26");
  assert.equal(s.intro, "在日华人创业者 的线下交流会。");
  assert.equal(filled(s.people)?.preview.length, 4);
  assert.equal(filled(s.people)?.text, "已报名 128 人");
  assert.deepEqual(s.action, { href: "/events/ev-6/register", kind: "register" });
  assert.equal(s.detailHref, "/events/ev-6");
  assert.equal(loaded(open).facts[2]!.sub, null, "unlimited, no deadline → no sub line");
  assert.equal(loaded(open).intro, null, "no description → no intro block");
});

test("S2 registered (and in review / waitlisted): status chip, 查看我的报名 → the registration page; the fee row stays", () => {
  const s = loaded(open, { status: "registered" });
  assert.deepEqual(s.marks.map((mark) => mark.key), ["registered"]);
  assert.deepEqual(s.facts.map((fact) => fact.icon), ["calendar", "pin", "ticket"], "kept so the blocks below do not jump when the answer lands");
  assert.deepEqual(s.action, { href: "/events/ev-6/register", kind: "myRegistration" });
  assert.deepEqual(loaded(open, { status: "pending_review" }).marks.map((mark) => mark.key), ["pending_review"]);
  assert.deepEqual(loaded(open, { status: "waitlisted" }).marks.map((mark) => mark.key), ["waitlisted"]);
});

test("S3 full / closed: a disabled primary that names the reason; with a waitlist it is pressable", () => {
  const full = loaded(open, { remaining: 0 });
  assert.deepEqual(full.action, { kind: "disabled", reason: "full" });
  assert.equal(full.facts[2]!.sub, "名额已满");
  const closed = loaded(open, { registrationClosesAt: "2026-11-20T00:00:00.000Z" });
  assert.deepEqual(closed.action, { kind: "disabled", reason: "closed" });
  assert.equal(closed.facts[2]!.sub, "报名已截止");
  assert.deepEqual(loaded(open, { remaining: 0, waitlistEnabled: true }).action, { href: "/events/ev-6/register", kind: "waitlist" });
});

test("S4 ended and went: 已结束 + 你参加了, met people replace attendees, 看会场记录 (only with a record)", () => {
  const s = loaded(ended, { met: { count: 6, hasRecord: true, initials: ["王"], notInContacts: 2 }, status: "attended" });
  assert.deepEqual(s.marks.map((mark) => mark.key), ["ended", "attended"]);
  assert.deepEqual(s.relevance, [], "ended: no relevance block");
  assert.deepEqual(s.people, { preview: [{ initial: "王" }], text: "6 人，其中 2 人还没加为人脉", title: "met" });
  assert.deepEqual(s.action, { href: "/events/ev-4/live?record=1", kind: "venueRecord" });
  const noRecord = loaded(ended, { met: { count: 0, hasRecord: false, initials: [], notInContacts: 0 }, status: "registered" });
  assert.equal(filled(noRecord.people)?.text, "这场没有留下见面记录");
  assert.equal(noRecord.action.kind, "follow", "went but no record: as Web, follow the organizer");
});

test("S5 / S6 ended and missed: next edition → 看下一场; none → 关注主办方 (following → 已关注)", () => {
  const next = { coverUrl: null, emoji: "🤝", eventId: "ev-6", startsAt: open.startsAt, title: open.title, venue: "新橋" };
  const s5 = loaded(ended, { next });
  assert.equal(s5.state, "missedNext");
  assert.deepEqual(s5.action, { kind: "nextEvent", next: { ...next, href: "/events/ev-6" } });
  assert.equal(filled(s5.people)?.text, "35 人参加");
  const s6 = loaded(ended);
  assert.deepEqual(s6.action, { following: false, kind: "follow", organizerId: "org-1" });
  assert.deepEqual(loaded(ended, { organizer: { following: true, name: "x", organizerId: "org-1" } }).action, { following: true, kind: "follow", organizerId: "org-1" });
});

test("the summary failed to load: the list facts stay and the button falls back to the list's own rule", () => {
  const s = summary({ ...open, summaryLoaded: true });
  assert.deepEqual(s.action, { href: "/events/ev-6/register", kind: "register" });
  assert.equal(s.intro, null);
});

test("field table fallbacks: online has no address, fewer than 10 registrants hide the count, a placeholder organizer is hidden", () => {
  const s = loaded({ ...open, area: "online", organizerName: "Organizer #1Q8PXWU", registrationCount: 4, venue: "Zoom" }, { registrationCount: 4 });
  assert.deepEqual(s.facts[1], { icon: "pin", main: "线上", sub: null });
  assert.equal(s.people, null);
  assert.equal(s.organizer, null);
  assert.equal(loaded({ ...open, priceYen: 0 }).facts[2]!.main, "免费");
});

test("three languages: the same answer reads entirely in the screen language", () => {
  const patch = { registrationClosesAt: "2026-11-26T14:59:00.000Z", remaining: 12 };
  const ja = loaded(open, patch, "ja");
  assert.equal(ja.facts[0]!.main, "11月28日（土）14:00 – 17:30");
  assert.equal(ja.facts[2]!.sub, "残り12席 · 11/26まで受付");
  assert.equal(filled(ja.people)?.text, "申込 128人");
  const en = loaded(open, patch, "en");
  assert.equal(en.facts[0]!.main, "Sat 11/28 · 14:00 – 17:30");
  assert.equal(en.facts[2]!.sub, "12 seats left · Open until 11/26");
  assert.equal(filled(en.people)?.text, "128 registered");
  assert.match(en.relevance.map((line) => line.text).join(" "), /^[\x20-\x7e王伟田中美咲渠道伙伴“”]*$/u, "en sentences carry no CJK beyond the names and topic");
  assert.equal(summaryWhen(open.startsAt, null, "zh", tr("zh")), "11月28日（六）14:00");
});
