import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { EventAttendeeProfile } from "../src/api/contract/event-attendee-profile";
import type { EventVenueRound } from "../src/api/contract/event-venue";
import { journeyOverview, journeyVenue } from "../../orbits/shared/mock/demo-world/events-journey";
import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 2026-11-20 (events-replay-cover-app-proposal): 会場の記録 after the event, the shared attendee sheet, the detail page's
// record entry / status row / cover image, and the discover row's 2:1 band (D2: a row with any image bands every card).
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([
    { name: "detail", importPath: "./src/screens/events/v2/EventDetailPage", exportName: "EventDetailPage" },
    { name: "venue", importPath: "./src/screens/events/v2/VenuePage", exportName: "VenuePage" },
    { name: "discover", importPath: "./src/screens/events/v2/DiscoverPage", exportName: "DiscoverPage" },
    { name: "people", importPath: "./src/screens/events/v2/EventPeoplePage", exportName: "EventPeoplePage" },
  ]);
});
after(async () => { await harness.close(); });

const overview = journeyOverview("many", "app");
const eventId = overview.eventId;
const path = `/api/events/${encodeURIComponent(eventId)}`;
const ended = { ...journeyVenue("ended", "app"), readOnly: true, checkedIn: true };
const mate = ended.attendees[1]!;
const rounds: EventVenueRound[] = [
  { round: 1, table: "A-2", theme: "IPO 準備の実務", why: "同じ関心の 3名と同席", tablemates: [{ attendeeId: ended.attendees[4]!.attendeeId, initial: ended.attendees[4]!.initial, name: ended.attendees[4]!.name }] },
  { round: 2, table: "B-4", theme: "シリーズAの資本政策", tablemates: [{ attendeeId: mate.attendeeId, initial: mate.initial, name: mate.name, org: mate.org ?? null }] },
];
const profile = (patch: Partial<EventAttendeeProfile> = {}): EventAttendeeProfile => ({
  answers: [{ a: "シリーズA 前後の起業家", q: "このイベントで会いたい人" }], attendeeId: mate.attendeeId, canRequestExchange: true, exchange: "none",
  exchangeUntil: "2026-11-06T12:30:00.000Z", initial: mate.initial, intro: "資本政策の相談歓迎です。", name: mate.name, participantId: "p-1",
  together: { recommended: true, sharedRounds: [{ round: 2, table: "B-4" }], why: "昨年シリーズAを調達" }, ...patch,
});

test("会場の記録: an ended event opens on グループ (every round), without 現場; a name opens the attendee sheet", async (t) => {
  const page = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile(),
  } });
  await page.getByTestId("events-venue-round-1").waitFor();
  await page.getByTestId("events-venue-round-2").waitFor();
  assert.equal(await page.getByTestId("events-venue-tab-now").count(), 0, "no 現場 tab after the event");
  await page.getByTestId("events-venue-tab-groups").waitFor();
  await page.getByRole("button", { name: mate.name }).first().click();
  await page.getByTestId("events-attendee-sheet").waitFor();
  await page.getByText("这场活动里的交集", { exact: true }).waitFor();
  await page.getByText("Round 2 同桌 B-4", { exact: true }).waitFor();
  await page.getByText("資本政策の相談歓迎です。", { exact: true }).waitFor();
  await page.getByTestId("events-attendee-request").waitFor();
  await page.getByText("活动结束后 30 天内可以申请（截至 11/6）", { exact: true }).waitFor();
});

test("attendee sheet: exchanged opens the contact; past the window the request button says it has closed", async (t) => {
  const exchanged = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile({ contactId: "c-9", exchange: "exchanged" }),
  } });
  await exchanged.getByRole("button", { name: mate.name }).first().click();
  await exchanged.getByTestId("events-attendee-open-contact").waitFor();
  const closed = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile({ canRequestExchange: false, exchangeClosedReason: "ended", exchangeUntil: null }),
  } });
  await closed.getByRole("button", { name: mate.name }).first().click();
  await closed.getByText("申请期已结束", { exact: true }).waitFor();
  assert.equal(await closed.getByTestId("events-attendee-request").count(), 0);
});

test("会場の記録 recs: no exchange / dismiss buttons; only the 已交换 fact, no 'not talked' guess from memos", async (t) => {
  const recs = ended.recommendations.map((person, index) => ({ ...person, exchange: index === 0 ? "exchanged" as const : "none" as const }));
  const page = await harness.open(t, { screen: "venue", params: { id: eventId, tab: "recs" }, responses: { [`${path}/venue`]: { ...ended, rounds, recommendations: recs } } });
  await page.getByTestId("events-venue-recs").waitFor();
  await page.getByTestId("events-venue-recs").getByText("已交换", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("没聊过").count(), 0);
  assert.equal(await page.getByRole("button", { name: "申请交换" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "从推荐中移除" }).count(), 0);
});

test("event detail (ended, in the results): the record card opens 会場の記録; the status sits under the title; the cover image replaces the band", async (t) => {
  const endedOverview = { ...overview, coverUrl: "https://example.com/cover.webp", endsAt: "2026-10-07T21:30:00+09:00", registration: { ...overview.registration, status: "attended" as const },
    startsAt: "2026-10-07T19:00:00+09:00", venueRecord: { checkedIn: true, exchanged: 3, recommended: 6, tablemates: 14 } };
  const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: endedOverview } });
  await page.getByTestId("events-detail-record").waitFor();
  await page.getByText("会场记录", { exact: true }).waitFor();
  await page.getByText(`报名 ${endedOverview.attendeeCounts.all}人`, { exact: true }).waitFor();
  await page.getByTestId("events-detail-cover-image").waitFor();
  assert.equal(await page.getByTestId("events-detail-status").innerText(), "已结束");
  await page.getByTestId("events-detail-record-open").click();
  assert.ok((await page.evaluate(() => JSON.stringify((window as unknown as { fixture: { navigation: unknown[] } }).fixture.navigation))).includes(`/events/${encodeURIComponent(eventId)}/live`));
});

test("event detail: no venueRecord → no record card (not in the published results, or not over yet)", async (t) => {
  const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: { ...overview, venueRecord: null } } });
  await page.getByText(overview.title).first().waitFor();
  assert.equal(await page.getByTestId("events-detail-record").count(), 0);
});

test("discover D2: one card with an image → every card in that row gets the 2:1 top (the others their emoji band)", async (t) => {
  const row = (eventId: string, coverUrl: string | null) => ({ emoji: "🎤", eventId, href: `/events/${eventId}`, priceYen: 3000, registrationCount: 24, relevance: null, startsAt: "2026-11-28T10:00:00.000Z", title: `Event ${eventId}`, venue: "渋谷", ...(coverUrl ? { coverUrl } : {}) });
  const discover = { all: [], community: [], planFit: [row("a", "https://example.com/a.webp"), row("b", null)], planFitTotal: 2, popularityFallback: false, total: 12 };
  const page = await harness.open(t, { screen: "discover", responses: { "/api/events/discover": discover } });
  await page.getByTestId("events-discover-cover-a").waitFor();
  assert.equal(await page.getByTestId("events-discover-cover-b").count(), 0);
  await page.getByTestId("events-discover-card-b").getByText("🎤").waitFor();
});

test("cover uri: a site path is completed against the API address; absolute stays; empty is no image", async () => {
  const { coverUri } = await import("../src/screens/events/v2/event-cover");
  assert.equal(coverUri("/orbit-covers/events/a.jpg", "http://localhost:3017"), "http://localhost:3017/orbit-covers/events/a.jpg");
  assert.equal(coverUri("https://cdn.example.com/a.webp", "http://localhost:3017"), "https://cdn.example.com/a.webp");
  assert.equal(coverUri(null, "http://localhost:3017"), null);
  assert.equal(coverUri("  ", "http://localhost:3017"), null);
});

test("attendee sheet: a request they sent can be accepted (same /respond route); a private profile says so, not 'load failed'", async (t) => {
  const incoming = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile({ exchange: "incoming", requestId: "req-1", requestRevision: 3 }),
    [`${path}/operations/contact-requests/req-1/respond`]: { ok: true },
  } });
  await incoming.getByRole("button", { name: mate.name }).first().click();
  await incoming.getByTestId("events-attendee-accept").click();
  const bodies = await incoming.evaluate(() => (window as unknown as { fixture: { postBodies?: { path: string; body: unknown }[] } }).fixture.postBodies ?? []);
  const respond = bodies.find((entry) => entry.path.endsWith("/operations/contact-requests/req-1/respond"));
  assert.deepEqual(respond?.body, { accept: true, expectedRevision: 3 });
  const hidden = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: { __status: 404 },
  } });
  await hidden.getByRole("button", { name: mate.name }).first().click();
  await hidden.getByText("对方没有公开参加资料", { exact: true }).waitFor();
});

test("会場の記録 ほかのテーブル: switch rounds, open a table to see its members; a member opens the sheet", async (t) => {
  const roundTables = [
    { round: 1, tables: [{ table: "B-1", theme: "AI・SaaS", members: [{ attendeeId: mate.attendeeId, initial: mate.initial, name: mate.name }] }] },
    { round: 2, tables: [{ table: "D-3", theme: "飲食・小売", members: [{ attendeeId: "x-9", initial: "周", name: "周 遥" }] }] },
  ];
  const page = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: { [`${path}/venue`]: { ...ended, rounds, roundTables }, [`${path}/attendees/`]: profile() } });
  await page.getByTestId("events-venue-other-tables").waitFor();
  await page.getByText("AI・SaaS", { exact: true }).waitFor();
  assert.equal(await page.getByText("飲食・小売", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: "Round 2" }).click();
  await page.getByText("飲食・小売", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Round 1" }).click();
  await page.getByTestId("events-venue-other-table-B-1").click();
  await page.getByTestId("events-venue-other-tables").getByRole("button", { name: mate.name }).click();
  await page.getByTestId("events-attendee-sheet").waitFor();
});

// 2026-11-21 加载与读取：先出框架 + 骨架再填内容；同一人的资料 5 分钟内再打开不再请求；弹层里的交换只改本页，不整页重读。
const gets = (page: { evaluate: (fn: () => unknown) => Promise<unknown> }, part: string) =>
  page.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests).then((list) => (list as string[]).filter((entry) => entry.startsWith("get:") && entry.includes(part)).length);

test("attendee sheet: grey shapes while the profile loads; re-opening the same person reads nothing", async (t) => {
  const page = await harness.open(t, { screen: "venue", params: { id: eventId }, slowPrefix: `${path}/attendees/`, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile(),
  } });
  await page.getByRole("button", { name: mate.name }).first().click();
  await page.getByTestId("events-attendee-loading").waitFor();
  await page.getByText("資本政策の相談歓迎です。", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("events-attendee-loading").count(), 0);
  await page.getByTestId("events-attendee-head").getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: mate.name }).first().click();
  await page.getByText("資本政策の相談歓迎です。", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("events-attendee-loading").count(), 0, "a cached profile shows at once");
  assert.equal(await gets(page, "/attendees/"), 1, "one read for two opens");
});

test("会場の記録: an exchange request in the sheet patches the page (no second venue read)", async (t) => {
  const page = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds },
    [`${path}/attendees/`]: profile(),
    [`${path}/operations/contact-requests`]: { ok: true },
  } });
  await page.getByRole("button", { name: mate.name }).first().click();
  await page.getByTestId("events-attendee-request").click();
  await page.getByTestId("events-attendee-sheet").getByText("已申请", { exact: false }).first().waitFor();
  assert.equal(await gets(page, "/venue"), 1);
});

test("loading frames: 記録を見る opens on the record's own frame; the detail page shows the cover card's shape first", async (t) => {
  const record = await harness.open(t, { screen: "venue", params: { id: eventId, record: "1" }, noMirror: true, slowPrefix: `${path}/venue`, responses: { [`${path}/venue`]: { ...ended, rounds } } });
  await record.getByTestId("events-venue-loading").waitFor();
  await record.getByTestId("events-venue-tab-groups").waitFor();
  await record.getByTestId("events-venue-round-1").waitFor();
  const detail = await harness.open(t, { screen: "detail", params: { id: eventId }, noMirror: true, slowPrefix: `${path}/overview`, responses: { [`${path}/overview`]: overview } });
  await detail.getByTestId("events-detail-loading").waitFor();
  await detail.getByText(overview.title).first().waitFor();
  assert.equal(await detail.getByTestId("events-detail-loading").count(), 0);
});

test("attendee profile request: the id goes in the query (an imported id with a literal %3A survives one decode)", async (t) => {
  const odd = "event-participant-profile:ev:party-app%3Aprofile%3Aabc";
  const oddRounds: EventVenueRound[] = [{ round: 1, table: "A-2", theme: "IPO", tablemates: [{ attendeeId: odd, initial: "周", name: "周 遥" }] }];
  const page = await harness.open(t, { screen: "venue", params: { id: eventId }, responses: {
    [`${path}/venue`]: { ...ended, rounds: oddRounds },
    [`${path}/attendees/profile`]: profile({ attendeeId: odd, name: "周 遥" }),
  } });
  await page.getByRole("button", { name: "周 遥" }).first().click();
  await page.getByText("資本政策の相談歓迎です。", { exact: true }).waitFor();
  const requests = await page.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests);
  const sent = requests.find((entry) => entry.includes("/attendees/"))!;
  assert.equal(sent, `get:${path}/attendees/profile?attendeeId=${encodeURIComponent(odd)}&platform=app`);
  assert.equal(new URLSearchParams(sent.split("?")[1]).get("attendeeId"), odd);
});

test("会場の記録 asks with view=record and shows the slimmed answer (no memos / whyDetail / live parts)", async (t) => {
  const slim = (person: Record<string, unknown>) => { const { memo: _m, whyDetail: _w, requestedAt: _r, isOrbitUser: _o, ...rest } = person; return rest; };
  const { checkIn: _c, round: _r, seats: _s, mySeat: _y, nextRound: _n, groups: _g, mutualHint: _h, agendaTip: _a, meetingSlots: _l, ...base } = ended as Record<string, unknown>;
  const answer = { ...base, openers: [], rounds, attendees: ended.attendees.map(slim), recommendations: ended.recommendations.map(slim), nextOrder: ended.nextOrder.map(slim) };
  const page = await harness.open(t, { screen: "venue", params: { id: eventId, tab: "recs" }, responses: { [`${path}/venue`]: answer } });
  await page.getByTestId("events-venue-recs").waitFor();
  await page.getByText(ended.recommendations[0]!.name).first().waitFor();
  const requests = await page.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests);
  assert.ok(requests.includes(`get:${path}/venue?view=record&platform=app`), requests.join(" "));
});

test("event detail is one page (2026-11-21): no tabs; 紹介 → アジェンダ → 参加者 → 主催; long agenda folds; 全員を見る opens the roster page", async (t) => {
  const agenda = Array.from({ length: 7 }, (_, index) => ({ at: `1${index}:00`, title: `Item ${index + 1}`, detail: null }));
  const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: { ...overview, agenda, rosterLocked: false } } });
  await page.getByTestId("events-detail-intro").waitFor();
  assert.equal(await page.getByRole("tab").count(), 0, "no tab bar");
  const order = await page.evaluate(() => ["events-detail-intro", "events-detail-agenda", "events-detail-people"].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1));
  assert.ok(order[0]! < order[1]! && order[1]! < order[2]!, `section order ${order.join(",")}`);
  assert.equal(await page.getByText("Item 6", { exact: true }).count(), 0, "agenda folds after 5");
  await page.getByTestId("events-detail-agenda-all").click();
  await page.getByText("Item 7", { exact: true }).waitFor();
  await page.getByTestId("events-detail-people-all").click();
  assert.ok((await page.evaluate(() => JSON.stringify((window as unknown as { fixture: { navigation: unknown[] } }).fixture.navigation))).includes(`/events/${encodeURIComponent(eventId)}/people`));
});

test("参加者 page: full roster (attendees=all), plan-fit / known / all, search by name or company; a registered person opens the sheet", async (t) => {
  const registered = { ...overview, rosterLocked: false, hosting: false, registration: { ...overview.registration, status: "registered" as const } };
  const page = await harness.open(t, { screen: "people", params: { id: eventId, filter: "all" }, responses: { [`${path}/overview`]: registered, [`${path}/attendees/profile`]: profile() } });
  await page.getByTestId("events-people-list").waitFor();
  const requests = await page.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests);
  assert.ok(requests.includes(`get:${path}/overview?platform=app&attendees=all`), requests.join(" "));
  const first = registered.attendees[0]!;
  const other = registered.attendees.find((person) => person.name !== first.name)!;
  await page.getByTestId("events-people-search").fill(first.name);
  await page.getByRole("button", { name: first.name }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: other.name }).count(), 0);
  await page.getByTestId("events-people-search").fill("");
  const known = registered.attendees.filter((person) => person.known);
  await page.getByRole("tab", { name: `熟人${registered.attendeeCounts.known}` }).click();
  if (known.length) await page.getByRole("button", { name: known[0]!.name }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: registered.attendees.find((person) => !person.known)!.name }).count(), 0);
  await page.getByRole("tab", { name: `全部${registered.attendeeCounts.all}` }).click();
  await page.getByRole("button", { name: first.name }).first().click();
  await page.getByTestId("events-attendee-sheet").waitFor();
});

test("会場の記録 from 記録を見る: a copy saved while the event was running is not drawn first (no live venue flash)", async (t) => {
  const during = { ...journeyVenue("checked_in", "app"), endsAt: "2026-01-01T03:00:00.000Z" };
  const page = await harness.open(t, { screen: "venue", params: { id: eventId, record: "1" }, slowPrefix: `${path}/venue`,
    copies: { [`event-venue|${eventId}`]: { data: during, syncedAt: "2026-01-01T02:00:00.000Z" } },
    responses: { [`${path}/venue`]: { ...ended, rounds } } });
  await page.getByTestId("events-venue-loading").waitFor();
  assert.equal(await page.getByTestId("events-venue-tab-now").count(), 0, "the live venue's 現場 tab never shows");
  await page.getByTestId("events-venue-round-1").waitFor();
});

test("会場の記録 offline: the copy saved during the event is still shown when the answer cannot arrive", async (t) => {
  const during = { ...journeyVenue("checked_in", "app"), endsAt: "2026-01-01T03:00:00.000Z" };
  const page = await harness.open(t, { screen: "venue", params: { id: eventId, record: "1" }, online: false,
    copies: { [`event-venue|${eventId}`]: { data: during, syncedAt: "2026-01-01T02:00:00.000Z" } }, responses: {} });
  await page.getByTestId("events-venue-tab-now").waitFor();
});

// 2026-11-23 先出布局再填内容: the summary sheet opens at its final height with the list's facts, skeletons where the summary
// fills in, and both buttons in place; the answer (1.5 s late here) replaces the skeletons without moving the sheet or buttons.
test("探す summary sheet: final height and fixed buttons from the first frame; the late summary fills in place; reopening uses it", async (t) => {
  const row = { emoji: "🤝", eventId: "ev-6", href: "/events/ev-6", priceYen: 3000, registrationCount: 128, relevance: null, startsAt: "2099-11-28T05:00:00.000Z", endsAt: "2099-11-28T08:30:00.000Z", title: "第六期 中日创业交流会", venue: "山田屋ビル B2", organizerId: "org-1", organizerName: "日中创新创业协会" };
  const summary = { attendeeInitials: ["王", "田", "L", "佐"], capacity: 140, description: "在日华人创业者、投资人和日本本地企业负责人的线下交流会。上半场三位创业者分享在日本拿到第一批客户的经过，下半场按报名时填写的需求分桌交流。", emoji: "🤝", ended: false, eventId: "ev-6", organizer: { following: false, name: "日中创新创业协会", organizerId: "org-1" }, registrationClosesAt: "2099-11-26T14:59:00.000Z", registrationCount: 128, remaining: 12, startsAt: row.startsAt, status: "none", title: row.title, waitlistEnabled: false };
  const page = await harness.open(t, { screen: "discover", slowPrefix: "/api/events/ev-6/summary", slowMs: 1500, responses: {
    "/api/events/discover": { all: [], community: [], planFit: [row], planFitTotal: 1, popularityFallback: false, total: 1 },
    "/api/events/ev-6/summary": summary,
  } });
  // Positions inside the sheet (the harness has no portal host: the sheet sits in the page, which a wait may scroll).
  const sheetId = "events-summary-ev-6";
  const measure = async (primaryId: string) => {
    const sheet = (await page.getByTestId(sheetId).boundingBox())!, detail = (await page.getByTestId("events-summary-detail").boundingBox())!, primary = (await page.getByTestId(primaryId).boundingBox())!;
    const at = (b: { x: number; y: number; width: number; height: number }) => ({ h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.x - sheet.x), y: Math.round(b.y - sheet.y) });
    return { detail: at(detail), primary: at(primary), sheetH: Math.round(sheet.height) };
  };
  await page.getByTestId("events-discover-card-ev-6").click();
  await page.getByTestId("events-summary-primary-pending").waitFor();
  await page.waitForTimeout(700); // past the slide-in
  const first = await measure("events-summary-primary-pending");
  assert.equal(first.sheetH, Math.round(844 * 0.76), "opens at the final 76% height");
  for (const id of ["events-summary-seats-pending", "events-summary-intro-pending", "events-summary-people-pending"]) assert.equal(await page.getByTestId(id).count(), 1, `${id} on the first frame`);
  assert.equal(await page.getByTestId(sheetId).getByText("¥3,000", { exact: true }).count(), 1, "a list fact on the first frame");
  await page.getByTestId("events-summary-primary").waitFor({ timeout: 4000 });
  assert.equal(await page.getByTestId(sheetId).getByText("还剩 12 个名额 · 报名到 11/26", { exact: true }).count(), 1);
  const after = await measure("events-summary-primary");
  assert.equal(after.sheetH, first.sheetH, "the sheet keeps its height");
  assert.deepEqual(after.detail, first.detail, "查看详情 does not move");
  assert.deepEqual(after.primary, first.primary, "the primary replaces its placeholder at the same size and place");
  // The harness page scrolls with the sheet in it: press ✕ and the card on the elements themselves.
  await page.getByTestId("events-summary-close").evaluate((el) => (el as HTMLElement).click());
  await page.getByTestId(sheetId).waitFor({ state: "detached" });
  await page.getByTestId("events-discover-card-ev-6").evaluate((el) => (el as HTMLElement).click());
  await page.getByTestId("events-summary-primary").waitFor({ timeout: 500 });
  assert.equal(await page.getByTestId("events-summary-intro-pending").count(), 0, "reopening the same event uses the last answer");
});
