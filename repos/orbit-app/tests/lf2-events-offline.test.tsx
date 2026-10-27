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
