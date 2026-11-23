import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { journeyOverview, journeyVenue } from "../../orbits/shared/mock/demo-world/events-journey";
import { requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// LF2: event detail and venue keep the last answer per event (page copies event-overview / event-venue), so a
// registered attendee can read them without signal; before, both routes were online-only.
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([
    { name: "detail", importPath: "./src/screens/events/v2/EventDetailPage", exportName: "EventDetailPage" },
    { name: "venue", importPath: "./src/screens/events/v2/VenuePage", exportName: "VenuePage" },
    { name: "events", importPath: "./src/screens/events/v2/EventsHome", exportName: "EventsHome" },
  ]);
});
after(async () => { await harness.close(); });

const overview = journeyOverview("many", "app");
const venue = journeyVenue("checked_in", "app");
const eventId = overview.eventId;
const syncedAt = "2026-10-21T01:00:00.000Z";

test("LF2: offline, the event detail shows the saved copy with the 「截至」 notice instead of an error", async (t) => {
  const page = await harness.open(t, { screen: "detail", online: false, params: { id: eventId },
    copies: { [`event-overview|${eventId}`]: { data: overview, syncedAt } } });
  await page.getByText(overview.title).first().waitFor();
  await page.getByText(/无法连接 · 显示截至/).waitFor();
});

test("LF2: offline without a copy, the event detail says it needs a connection (not 'not found')", async (t) => {
  const page = await harness.open(t, { screen: "detail", online: false, params: { id: eventId } });
  await page.getByText("需要联网").first().waitFor();
});

test("LF2: online, the event detail saves its answer as the per-event copy", async (t) => {
  const page = await harness.open(t, { screen: "detail", params: { id: eventId },
    responses: { [`/api/events/${encodeURIComponent(eventId)}/overview`]: overview } });
  await page.getByText(overview.title).first().waitFor();
  await page.waitForFunction((key) => (window as any).fixture.saves.includes(key), `event-overview|${eventId}`);
  assert.ok((await requestsOf(page)).some((request) => request.includes("/overview")));
});

test("LF2: offline, the venue shows the saved copy with the 「截至」 notice", async (t) => {
  const page = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: venue, syncedAt } } });
  await page.getByText(/无法连接 · 显示截至/).waitFor();
});

test("QA-B4: 会场模式 shows LIVE only from the start time (check-in opens before it)", async (t) => {
  const later = new Date(Date.now() + 40 * 60_000).toISOString();
  const early = { ...venue, now: new Date().toISOString(), startsAt: later, endsAt: new Date(Date.now() + 160 * 60_000).toISOString() };
  const page = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: early, syncedAt } } });
  await page.getByText(/ 开始$/u).first().waitFor();
  assert.equal(await page.getByText("LIVE", { exact: true }).count(), 0);
  const live = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: { ...venue, startsAt: new Date(Date.now() - 10 * 60_000).toISOString() }, syncedAt } } });
  await live.getByText("LIVE", { exact: true }).waitFor();
});

test("LF2: offline, the events tab keeps its saved lists with 「截至」 instead of showing no events", async (t) => {
  const mine = { items: [], upcomingCount: 0, asOf: syncedAt, nextCursor: null };
  const page = await harness.open(t, { screen: "events", online: false, copies: {
    "event-assessments|main": { data: [], syncedAt },
    "events-mine|upcoming": { data: mine, syncedAt },
    "events-mine|past": { data: mine, syncedAt },
  } });
  await page.getByText(/无法连接 · 显示截至/).waitFor();
});

test("server 9683ee88f: registered but outside the host's results — before the event waits for check-in, after it is ended (never 'registered only')", async (t) => {
  const outside = { ...journeyVenue("before_check_in", "app"), checkIn: { available: false, displayName: "", qrPayload: null, receptionNumber: null } };
  const waiting = await harness.open(t, { screen: "venue", online: false, params: { id: eventId }, copies: { [`event-venue|${eventId}`]: { data: outside, syncedAt } } });
  await waiting.getByText("签到后就能使用", { exact: true }).waitFor();
  assert.equal(await waiting.getByText("只有已报名的人可以使用会场模式").count(), 0);
  const numbered = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: { ...outside, checkIn: { ...outside.checkIn, receptionNumber: "12" } }, syncedAt } } });
  await numbered.getByText("签到后就能使用 · 签到号12", { exact: true }).waitFor();
  // 2026-11-20 会場の記録: ended and in the published results → the read-only record (default グループ); outside them → the
  // explanation with the roster / agenda ways out. Never 「registered only」.
  const record = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: { ...journeyVenue("ended", "app"), readOnly: true }, syncedAt } } });
  await record.getByTestId("events-venue-record").waitFor();
  await record.getByText("已结束", { exact: true }).waitFor();
  assert.equal(await record.getByText("只有已报名的人可以使用会场模式").count(), 0);
  const ended = await harness.open(t, { screen: "venue", online: false, params: { id: eventId },
    copies: { [`event-venue|${eventId}`]: { data: { ...journeyVenue("ended", "app"), readOnly: true, recommendations: [], rounds: [] }, syncedAt } } });
  await ended.getByText("你不在这场的分组里", { exact: true }).waitFor();
  assert.equal(await ended.getByText("只有已报名的人可以使用会场模式").count(), 0);
});

test("event detail: an applicant sees the organizer's WeChat / LINE card; someone who has not applied does not", async (t) => {
  const contact = { wechatId: "orbit_wx", lineId: null, note: "加好友时请备注姓名" };
  const applied = { ...overview, hostContact: contact, registration: { ...overview.registration, status: "pending_review" as const } };
  const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`/api/events/${encodeURIComponent(eventId)}/overview`]: applied } });
  await page.getByText("主办方联系方式", { exact: true }).waitFor();
  await page.getByText("orbit_wx", { exact: true }).waitFor();
  await page.getByText("加好友时请备注姓名", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "复制微信", exact: true }).count(), 1);
  const outsider = { ...overview, hostContact: undefined, registration: { ...overview.registration, status: "none" as const } };
  const other = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`/api/events/${encodeURIComponent(eventId)}/overview`]: outsider } });
  await other.getByText(overview.title).first().waitFor();
  assert.equal(await other.getByText("主办方联系方式", { exact: true }).count(), 0);
});

test("agenda: rows carry the time, title and a small detail line; no agenda → the detail page leaves the section out (2026-11-21), the venue says it", async (t) => {
  const agenda = [{ at: "19:00", title: "開場・受付", detail: "受付で名札を受け取ってください" }, { at: "19:30", title: "キーノート", detail: null }];
  const page = await harness.open(t, { screen: "detail", params: { id: eventId, tab: "agenda" },
    responses: { [`/api/events/${encodeURIComponent(eventId)}/overview`]: { ...overview, agenda } } });
  await page.getByText("19:00", { exact: true }).waitFor();
  await page.getByText("開場・受付", { exact: true }).waitFor();
  await page.getByText("受付で名札を受け取ってください", { exact: true }).waitFor();
  await page.getByText("キーノート", { exact: true }).waitFor();
  assert.equal(await page.getByText("主办方还没有公布议程", { exact: true }).count(), 0);
  const empty = await harness.open(t, { screen: "detail", params: { id: eventId, tab: "agenda" },
    responses: { [`/api/events/${encodeURIComponent(eventId)}/overview`]: { ...overview, agenda: [] } } });
  await empty.getByTestId("events-detail-intro").waitFor();
  assert.equal(await empty.getByTestId("events-detail-agenda").count(), 0);
  const venueEmpty = await harness.open(t, { screen: "venue", online: false, params: { id: eventId, tab: "agenda" },
    copies: { [`event-venue|${eventId}`]: { data: { ...venue, agenda: [], agendaTip: null }, syncedAt } } });
  await venueEmpty.getByText("主办方还没有公布议程", { exact: true }).waitFor();
});

test("参加的活动 (2026-11-21, same as Web): これから / 過去 switch, stays on これから with its empty card; past rows say what happened", async (t) => {
  const none = { items: [], upcomingCount: 0, asOf: syncedAt, nextCursor: null, range: "upcoming" };
  const pastItem = (eventId: string, status: string) => ({ emoji: "🥂", eventId, href: `/events/${eventId}`, startsAt: "2026-10-07T10:00:00.000Z", status, title: `Event ${eventId}`, venue: "渋谷" });
  const past = { items: [pastItem("p1", "attended"), pastItem("p2", "registered"), pastItem("p3", "cancelled")], upcomingCount: 0, asOf: syncedAt, nextCursor: null, range: "past" };
  const page = await harness.open(t, { screen: "events", online: false, params: { tab: "going" }, copies: {
    "event-assessments|main": { data: [], syncedAt }, "events-mine|upcoming": { data: none, syncedAt }, "events-mine|past": { data: past, syncedAt },
  } });
  await page.getByRole("tab", { name: "接下来 0" }).waitFor();
  await page.getByText("接下来没有要参加的活动", { exact: true }).waitFor();
  assert.equal(await page.getByText("Event p1").count(), 0, "past events are not listed under 接下来");
  await page.getByRole("tab", { name: "过去 3" }).click();
  await page.getByText("Event p1").waitFor();
  for (const chip of ["参加了", "未签到", "已取消"]) await page.getByText(chip, { exact: true }).waitFor();
  const empty = await harness.open(t, { screen: "events", online: false, params: { tab: "going" }, copies: {
    "event-assessments|main": { data: [], syncedAt }, "events-mine|upcoming": { data: none, syncedAt }, "events-mine|past": { data: { ...none, range: "past" }, syncedAt },
  } });
  await empty.getByText("接下来没有要参加的活动", { exact: true }).waitFor();
  assert.equal(await empty.getByRole("tab", { name: "过去 0" }).count(), 0, "no switch when both sides are empty");
});

test("参加的活动: tapping an upcoming card itself opens the event (before only its button reacted)", async (t) => {
  const item = { emoji: "🥂", eventId: "u1", href: "/events/u1", startsAt: "2099-10-07T10:00:00.000Z", status: "registered", title: "Event u1", venue: "渋谷" };
  const upcoming = { items: [item], upcomingCount: 1, asOf: syncedAt, nextCursor: null, range: "upcoming" };
  const page = await harness.open(t, { screen: "events", online: false, params: { tab: "going" }, copies: {
    "event-assessments|main": { data: [], syncedAt }, "events-mine|upcoming": { data: upcoming, syncedAt }, "events-mine|past": { data: { ...upcoming, items: [], upcomingCount: 1, range: "past" }, syncedAt },
  } });
  await page.getByText("Event u1", { exact: true }).first().click();
  await page.waitForFunction(() => (window as unknown as { fixture: { navigation: unknown[] } }).fixture.navigation.some((entry) => JSON.stringify(entry).includes("/events/u1")));
});
