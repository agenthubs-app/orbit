// 2026-11-23 活动 › 发现：点卡片右侧看简介（event-side-panel-proposal）+ 已结束卡原色加角标。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EventCard, journeyTranslator } from "../../app/(app)/app/orbit-2026/events/DiscoverTab";
import { EventSidePanel, panelWhen, primaryAction, seatsLine } from "../../app/(app)/app/orbit-2026/events/EventSidePanel";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { buildEventSummary, metPeople, plainDescription, summaryFromOverview } from "../../features/events/journey/summary-core";
import type { EventSummaryResponse } from "../../shared/contract/event-summary";
import type { JourneyEvent } from "../../features/events/journey/ports";

const t = journeyTranslator("zh");
const now = new Date("2026-11-23T03:00:00.000Z");
const render = (node: React.ReactNode) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);

const base: EventSummaryResponse = {
  attendeeInitials: [], capacity: 70, description: null, emoji: "🤝", ended: false, eventId: "e1", organizer: { following: false, name: "日中创新创业协会", organizerId: "org1" },
  registrationClosesAt: "2026-11-26T15:00:00.000Z", registrationCount: 58, remaining: 12, startsAt: "2026-11-28T05:00:00.000Z", status: "none", title: "第六期 中日创业交流会", waitlistEnabled: false,
};

test("primary button follows the state (S1–S6)", () => {
  assert.equal(primaryAction(base, now).kind, "join");
  assert.equal(primaryAction({ ...base, status: "registered" }, now).kind, "myRegistration");
  assert.equal(primaryAction({ ...base, remaining: 0 }, now).kind, "full");
  assert.equal(primaryAction({ ...base, registrationClosesAt: "2026-11-20T00:00:00.000Z" }, now).kind, "closed");
  assert.equal(primaryAction({ ...base, remaining: 0, waitlistEnabled: true }, now).kind, "waitlist");
  const ended = { ...base, ended: true };
  assert.equal(primaryAction({ ...ended, met: { count: 6, hasRecord: true, initials: [], notInContacts: 2 }, status: "attended" }, now).kind, "record");
  assert.deepEqual(primaryAction({ ...ended, next: { coverUrl: null, emoji: "🤝", eventId: "e2", startsAt: "2026-12-12T05:00:00.000Z", title: "下一场", venue: null } }, now), { eventId: "e2", kind: "next" });
  assert.equal(primaryAction({ ...ended, next: null }, now).kind, "follow");
  assert.equal(primaryAction({ ...ended, next: null, organizer: { ...base.organizer, following: true } }, now).kind, "following");
  assert.equal(primaryAction({ ...ended, next: null, organizer: { ...base.organizer, organizerId: null } }, now).kind, "none");
});

test("seats and deadline under the fee: seats + date, deadline only when unlimited, nothing once ended", () => {
  assert.equal(seatsLine(base, now, t), "还剩 12 个名额 · 报名到 11/27");
  assert.equal(seatsLine({ ...base, remaining: null }, now, t), "报名到 11/27");
  assert.equal(seatsLine({ ...base, remaining: 0 }, now, t), "名额已满");
  assert.equal(seatsLine({ ...base, ended: true }, now, t), null);
  assert.equal(panelWhen("2026-11-28T05:00:00.000Z", "2026-11-28T08:30:00.000Z", "zh", t), "11月28日（六） 14:00 – 17:30");
  assert.equal(panelWhen("2026-11-28T05:00:00.000Z", null, "en", journeyTranslator("en")), "Sat, Nov 28 · 14:00");
});

test("description becomes one plain paragraph (Markdown marks removed, capped)", () => {
  assert.equal(plainDescription("## 概要\n- **上半场** 三位分享\n- [报名](https://x.example)"), "概要 上半场 三位分享 报名");
  assert.equal(plainDescription("  "), null);
  assert.equal([...(plainDescription("あ".repeat(500)) ?? "")].length, 400);
});

test("people met: both tables + accepted exchanges, deduped, not counting me; who is not a contact yet", () => {
  const person = (participantId: string, displayName: string) => ({ participantId, displayName }) as never;
  const met = metPeople({
    contactRequests: [{ contactId: null, requestId: "r", requesterParticipantId: "me", revision: 1, status: "accepted", targetParticipantId: "c", withdrawnAt: null }],
    directory: [person("a", "王 伟"), person("b", "田中 美咲"), person("c", "Lee")],
    me: person("me", "我"),
    roundOneTable: { members: [{ participantId: "me" }, { participantId: "a" }, { participantId: "b" }] } as never,
    roundTwoTable: { members: [{ participantId: "me" }, { participantId: "a" }] } as never,
  }, new Set(["王伟"]));
  assert.deepEqual(met, { count: 3, hasRecord: true, initials: ["王", "田", "L"], notInContacts: 2 });
});

test("summary from the event row: remaining = capacity − registered; ended from the end time", () => {
  const event = { agenda: [], badges: [], capacity: 70, description: "说明", emoji: "🤝", endsAt: "2026-11-20T12:00:00.000Z", eventId: "e1", organizerKey: "k", organizerName: "协会", priceYen: 3000, publicCode: null, registrationClosesAt: null, registrationCount: 58, review: false, startsAt: "2026-11-20T09:00:00.000Z", title: "T", venue: "新橋", waitlistEnabled: true } satisfies JourneyEvent;
  const summary = buildEventSummary({ attendeeNames: ["王 伟", "田中", "Lee", "佐藤", "鈴木"], event, now, organizer: base.organizer, status: "attended" });
  assert.equal(summary.remaining, 12);
  assert.equal(summary.ended, true);
  assert.equal(summary.waitlistEnabled, true);
  assert.deepEqual(summary.attendeeInitials, ["王", "田", "L", "佐"]);
  assert.equal(summaryFromOverview({ agenda: [], attendeeCounts: { all: 9, known: 0, planFit: 0 }, attendees: [], deadlineSoon: false, emoji: "🤝", eventId: "e1", knownAttendees: [], organizer: { name: "协会" }, registration: { href: "/x", status: "none" }, review: false, startsAt: "2026-12-01T00:00:00.000Z", title: "T" }, now).registrationCount, 9);
});

test("panel paints from the list row at once: cover band, title, organizer, time / place / fee, related facts; two buttons at the foot", () => {
  const html = render(<EventSidePanel eventId="e1" tone="lav" language="zh" now={now} mode="rail" onClose={() => {}} onSelect={() => {}} seed={{ emoji: "🥂", eventId: "e1", href: "/events/e1", organizerName: "日中创新创业协会", priceYen: 3000, relevance: { group: "topic", known: { count: 2, names: ["王 伟"] }, people: [], topic: null, warnings: [] }, startsAt: "2026-11-28T05:00:00.000Z", endsAt: "2026-11-28T08:30:00.000Z", title: "第六期 中日创业交流会", venue: "山田屋ビル B2" }} />);
  assert.match(html, /data-event-panel="e1"/);
  assert.match(html, /第六期 中日创业交流会/);
  assert.match(html, /日中创新创业协会/);
  assert.match(html, /11月28日（六） 14:00 – 17:30/);
  assert.match(html, /山田屋ビル B2/);
  assert.match(html, /¥3,000/);
  assert.match(html, /data-panel-related=""/);
  assert.match(html, /data-panel-detail="" href="\/app\/events\/e1">查看详情/);
  assert.match(html, /aria-label="关闭"/);
  // 2026-11-23 先出布局、再填内容：要另读的块在第一帧是同高骨架，主按钮是同尺寸占位；报名状态由页面已读的列表给出。
  assert.match(html, /data-panel-pending="intro"/);
  assert.match(html, /data-panel-pending="people"/);
  assert.doesNotMatch(html, /data-panel-primary=/, "the primary button waits as a same-size bone");
  const registered = render(<EventSidePanel eventId="e1" tone="lav" language="zh" now={now} mode="sheet" statusHint="registered" onClose={() => {}} onSelect={() => {}} seed={{ emoji: "🥂", eventId: "e1", href: "/events/e1", startsAt: "2026-11-28T05:00:00.000Z", title: "T" }} />);
  assert.match(registered, /已报名/, "the state row is there in the first frame");
});

test("ended card: original colours (no greyed class), 「已结束」 tag on the cover, no ended chip at the foot", () => {
  const row = { coverUrl: "/c.jpg", emoji: "🤝", eventId: "p1", href: "/events/p1", startsAt: "2026-06-21T09:30:00Z", title: "第4回 中日创业交流会", venue: "東京タワーズ" };
  const html = render(<EventCard ended row={row} index={0} language="zh" t={t} onOpen={() => {}} />);
  assert.match(html, /data-discover-cover=""><img [^>]*\/><span [^>]*data-discover-end-tag="">已结束<\/span>/);
  assert.doesNotMatch(html, /grayscale/);
  assert.equal((html.match(/已结束/g) ?? []).length, 1, "only the tag, no chip at the foot");
});
