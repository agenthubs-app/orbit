// 活动详情 2026-11-15 重排（docs/designs/redesign-2026-10/event-detail-agenda-proposal.html ① ②）：
// 封面整行 + 议程卡总在 · 右栏「和你有关 + 可能见到的人」一张卡 → 报名卡 → 主办方卡（统计一行 / 简介 / 以往活动）。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DetailRail, EventDetailBody } from "../../app/(app)/app/orbit-2026/events/EventDetail";
import { journeyTranslator } from "../../app/(app)/app/orbit-2026/events/DiscoverTab";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";
import type { EventOverviewResponse } from "../../shared/contract/event-overview";
import { journeyOverview } from "../../shared/mock/demo-world/events-journey";

const t = journeyTranslator("zh");
const base: EventOverviewResponse = {
  agenda: [], attendeeCounts: { all: 0, known: 0, planFit: 0 }, attendees: [], deadlineSoon: false, emoji: "🥂", endsAt: "2099-11-28T08:30:00Z", eventId: "evt6",
  hasPlan: true, knownAttendees: [], organizer: { averageAttendance: 30, editions: 5, emoji: "🥂", myAttendance: 2, name: "日中创新创业协会", organizerId: "org1", slug: "jcia", bio: "连接中日创业者与投资人的交流社群，每月一次。",
    past: [{ attendance: 32, eventId: "evt5", startsAt: "2099-10-25T05:00:00Z", title: "第五期 中日创业交流会" }, { attendance: null, eventId: "evt4", startsAt: "2099-09-27T05:00:00Z", title: "第四期 中日创业交流会" }] },
  registration: { href: "/events/evt6/register", status: "none" }, review: true, startsAt: "2099-11-28T05:00:00Z", title: "第六期 中日创业交流会",
  assessment: { basis: "", display: { goalFit: 0, people: 0, timeCost: 0 }, score: 0, verdict: "conditional", relevance: { group: "topic", known: null, people: [], topic: { labels: ["融过资的创业者"] }, warnings: [] } as never },
};
const render = (node: React.ReactNode) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);

test("body with the rail: cover spans the row, the agenda card always sits under it; no agenda → one grey line; no organizer card in the center", () => {
  const html = render(<EventDetailBody data={base} language="zh" t={t} railShown />);
  assert.match(html, /data-detail-agenda="0"/); assert.match(html, /data-agenda-empty=""[^>]*>主办方还没有公布议程/);
  assert.match(html, /14:00–17:30/, "agenda header shows the time range");
  assert.doesNotMatch(html, /data-detail-host=|data-detail-meet=|data-relevance-card/);
  assert.ok(html.indexOf("data-detail-agenda") < html.indexOf("data-detail-people"));
  const withAgenda = render(<EventDetailBody data={{ ...base, agenda: [{ at: "14:00", title: "签到 · 名片交换" }, { at: "14:30", title: "开场致辞", detail: "日中创新创业协会 会长" }] }} language="zh" t={t} railShown />);
  assert.match(withAgenda, /<time>14:30<\/time><div[^>]*><span>开场致辞<\/span><small>日中创新创业协会 会长<\/small>/);
  assert.doesNotMatch(withAgenda, /data-agenda-empty/);
});

test("body without the rail (public page / < 1280): 和你有关 and the host card follow the agenda", () => {
  const html = render(<EventDetailBody data={base} language="zh" t={t} />);
  assert.ok(html.indexOf("data-detail-agenda") < html.indexOf("data-detail-meet") && html.indexOf("data-detail-meet") < html.indexOf("data-detail-host="));
});

test("rail order: 和你有关 + 可能见到的人 → 报名 → 主办方; nobody registered → one line 还没有人报名", () => {
  const html = render(<DetailRail data={base} t={t} language="zh" onRegister={() => {}} />);
  const order = ["data-detail-meet", "data-detail-register", "data-detail-host="].map((key) => html.indexOf(key));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!)), String(order));
  assert.match(html, /和你有关/); assert.match(html, /data-relevance-row="topic"/); assert.match(html, /可能见到的人/);
  assert.match(html, /data-detail-meet-none=""[^>]*>还没有人报名/); assert.doesNotMatch(html, /ghostRow|data-detail-meet-all/);
});

test("host card: one stats line, follow on the same row, bio, 以往活动 (2, linked, N 人 only when known) and 主办方页面 ›", () => {
  const html = render(<DetailRail data={base} t={t} language="zh" onRegister={() => {}} />);
  assert.match(html, /data-detail-host-stats="">办过5场 · 平均30人参加 · 你去过2次</);
  assert.match(html, /data-detail-follow=""[^>]*>关注</);
  assert.match(html, /data-detail-host-bio="">连接中日创业者与投资人的交流社群，每月一次。</);
  assert.match(html, /以往活动/); assert.match(html, /href="\/app\/o\/jcia"[^>]*>主办方页面/);
  assert.match(html, /href="\/app\/events\/evt5"[^>]*><span[^>]*>10\/25<\/span><span[^>]*>第五期 中日创业交流会<\/span><span[^>]*>32人</);
  assert.match(html, /href="\/app\/events\/evt4"[^>]*><span[^>]*>09\/27<\/span><span[^>]*>第四期 中日创业交流会<\/span><\/a>/);
  // Missing parts are left out, not shown as 0 / —.
  const bare = render(<DetailRail data={{ ...base, organizer: { name: "主办方A", editions: 1, averageAttendance: null, myAttendance: 0 } }} t={t} language="zh" onRegister={() => {}} />);
  assert.match(bare, /data-detail-host-stats="">办过1场</); assert.doesNotMatch(bare, /data-detail-host-bio|以往活动|主办方页面|data-detail-follow/);
});

test("with registrants: up to 4 people with 想见 / 认识 tags and 全部 N ›", () => {
  const data = journeyOverview("many", "web");
  const html = render(<DetailRail data={data} t={t} language="zh" onRegister={() => {}} />);
  assert.equal((html.match(/data-detail-meet-person=/g) ?? []).length, Math.min(4, data.attendees.length));
  assert.match(html, /data-detail-meet-all=""[^>]*>全部\d+/);
  assert.match(html, />想见</);
});

test("overview schema: organizer bio / past are optional and tolerant (old clients and bad rows)", () => {
  const parsed = eventOverviewResponseSchema.parse({ ...base, organizer: { ...base.organizer, bio: 5, past: [{ eventId: "x", title: "t", startsAt: "s", attendance: -1 }, { bad: true }] } });
  assert.equal(parsed.organizer.bio, null);
  assert.deepEqual(parsed.organizer.past, [{ attendance: null, eventId: "x", startsAt: "s", title: "t" }]);
  const { bio: _b, past: _p, ...older } = base.organizer;
  assert.equal(eventOverviewResponseSchema.parse({ ...base, organizer: older }).organizer.past, undefined);
});
