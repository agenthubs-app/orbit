/**
 * Landing v2 (2026-11-22): eight screens under the unchanged first screen; ⑤ lists only events still open for
 * registration (at most 3), and with none it keeps the heading and 「すべてのイベントを見る」 only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LandingMore } from "../../app/(app)/app/orbit-2026/auth-public/LandingMore";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { landingEventsFixtureEnabled, selectOpenLandingEvents, type LandingEvent } from "../../features/events/journey/landing-events";

const now = new Date("2026-12-01T00:00:00.000Z");
const row = (eventId: string, startsAt: string) => ({ eventId, startsAt, timezone: "Asia/Tokyo", title: `Event ${eventId}`, venue: "東京・渋谷" });

test("only events still open for registration, soonest first, at most 3", () => {
  const rows = [row("late", "2026-12-20T09:00:00.000Z"), row("full", "2026-12-05T09:00:00.000Z"), row("closed", "2026-12-06T09:00:00.000Z"), row("past", "2026-11-30T09:00:00.000Z"), row("a", "2026-12-07T09:00:00.000Z"), row("b", "2026-12-08T09:00:00.000Z"), row("c", "2026-12-09T09:00:00.000Z")];
  const policies = new Map([
    ["full", { capacity: 10, registrationClosesAt: null }],
    ["closed", { capacity: null, registrationClosesAt: "2026-11-30T00:00:00.000Z" }],
    ["a", { capacity: 70, registrationClosesAt: "2026-12-06T00:00:00.000Z" }],
  ]);
  const open = selectOpenLandingEvents({ now, policies, registrations: new Map([["full", 10], ["a", 58]]), rows });
  assert.deepEqual(open.map((event) => event.eventId), ["a", "b", "c"]);
  assert.equal(open[0]!.seatsLeft, 12);
  assert.equal(open[1]!.seatsLeft, null, "no capacity → no seat count");
});

const render = (events: readonly LandingEvent[] | null, language: "ja" | "zh" | "en" = "ja") =>
  renderToStaticMarkup(createElement(OrbitLanguageProvider, { initialLanguage: language, children: createElement(LandingMore, { events }) }));

const sample: LandingEvent[] = [
  { capacity: 70, eventId: "evt_1", seatsLeft: 12, startsAt: "2026-12-12T09:30:00.000Z", timezone: "Asia/Tokyo", title: "日中創新創業交流会", venue: "東京・渋谷" },
  { capacity: null, eventId: "evt_2", seatsLeft: null, startsAt: "2026-12-19T10:00:00.000Z", timezone: "Asia/Tokyo", title: "AI ミートアップ", venue: null },
];

test("eight screens in the agreed order: cards and network first, events after", () => {
  const html = render(sample);
  const order = ["名刺の管理", "人脈を掘る", "会ったあと", "交流会の前に", "いま申し込めるイベント", "主催者の方へ", "データの扱い", "手元の名刺を10枚", "利用規約"];
  const at = order.map((text) => html.indexOf(text));
  assert.ok(at.every((index) => index >= 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test("⑤ shows real events with date, time and seats, linking to the event page", () => {
  const html = render(sample);
  assert.match(html, /data-landing-events="2"/u);
  assert.match(html, /<b>12<\/b><br\/><span>12月 土<\/span>/u, "Tokyo date of 2026-12-12T09:30Z");
  assert.match(html, /東京・渋谷　18:30 開始　定員70人/u);
  assert.match(html, /残り12席/u);
  assert.match(html, /受付中/u, "no capacity → open chip");
  assert.match(html, /href="\/app\/events\/evt_1"/u);
});

test("⑤ with no open events (or a read failure) keeps the heading and the link to all events only", () => {
  for (const events of [[], null]) {
    const html = render(events);
    assert.match(html, /いま申し込めるイベント/u);
    assert.match(html, /すべてのイベントを見る/u);
    assert.doesNotMatch(html, /data-landing-event="/u);
    assert.doesNotMatch(html, /申し込む/u);
  }
});

test("unverified public claims stay off the page until confirmed", () => {
  const html = render(sample);
  assert.doesNotMatch(html, /223/u, "attendee count not confirmed");
  assert.doesNotMatch(html, /退会するとデータは削除/u, "production purge does not run yet");
  assert.match(html, /同じイベントの参加者と主催者だけ/u, "organizers also see rosters");
});

test("every screen switches language with the page", () => {
  assert.match(render(sample, "zh"), /现在可以报名的活动[\s\S]*剩 12 席[\s\S]*12月 周六/u);
  assert.match(render(sample, "en"), /Events open for registration[\s\S]*12 left[\s\S]*Dec Sat/u);
  const english = render(sample, "en").replace(/<strong>[^<]*<\/strong><p>[^<]*<\/p>/gu, (block) => (sample.some((event) => block.includes(event.title)) ? "" : block));
  assert.doesNotMatch(english, /[ぁ-んァ-ヶ]/u, "no Japanese kana in English (event titles and venues are data)");
});

test("the drawing's sample events are local-only: never in production", () => {
  assert.equal(landingEventsFixtureEnabled({ ORBIT_REDESIGN_MOCK: "landing-events", NODE_ENV: "development" }), true);
  assert.equal(landingEventsFixtureEnabled({ ORBIT_REDESIGN_MOCK: "landing-events", NODE_ENV: "production" }), false);
  assert.equal(landingEventsFixtureEnabled({ ORBIT_REDESIGN_MOCK: "all", VERCEL_ENV: "production" }), false);
  assert.equal(landingEventsFixtureEnabled({}), false);
});
