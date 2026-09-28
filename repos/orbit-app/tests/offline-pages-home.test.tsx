import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0131: the home page reads every card from the device copy — tasks,
// personal schedule and registered events from their sync domains, the
// recommended events and the meetings of the last schedule answer from page
// copies — so it paints at once and stays readable offline with 「截至」.
const A = "account:one";
const inOneHour = new Date(Date.now() + 60 * 60_000).toISOString();
const inTwoHours = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
const inThreeHours = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
const task = (id: string, title: string, plannedDate: string) => ({ id, accountId: A, ownerUserId: A, title, status: "open", category: "relationship", priority: "normal", source: "manual", plannedDate, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" });
const records = {
  task: [task("t1", "给张伟回电话", "2026-09-01"), task("t2", "整理储能资料", "2026-09-02")],
  personal_schedule: [{ id: "p1", accountId: A, ownerUserId: A, kind: "personal", category: "personal", state: "upcoming", title: "和佐藤喝咖啡", sourceId: "p1", startsAt: inOneHour, endsAt: inTwoHours, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" }],
  registered_event: [{ eventId: "ev1", participantId: "pt1", title: "储能论坛", description: "", venue: "东京国际论坛", timeZone: "Asia/Tokyo", startsAt: inTwoHours, endsAt: inThreeHours, lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null, eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null }],
};
const recommendation = (eventId: string, title: string) => ({ eventId, title, startsAt: "2026-10-10T01:00:00.000Z", location: "东京", venue: "涩谷", valueScore: 80, scoreBand: "high", signals: [], recommendedAction: "报名" });
const copies = {
  "event-recommendations|home": { data: { state: "success", recommendations: [recommendation("ev9", "AI 创业者晚宴")] }, syncedAt: "2026-09-28T01:20:00.000Z" },
  "home-schedule|main": { data: { scheduleItems: [{ id: "schedule:m1", kind: "meeting", category: "meeting", state: "upcoming", title: "约谈：林悦", startsAt: inThreeHours, sourceId: "m1" }] }, syncedAt: "2026-09-28T01:20:00.000Z" },
};

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => { harness = await startOfflinePageHarness([{ name: "home", importPath: "./src/screens/home/HomeDashboardScreen", exportName: "HomeDashboardScreen" }]); });
test.after(async () => { await harness?.close(); });

test("offline: every home card shows the device copy with 截至; completing a task needs the network", async (t) => {
  const page = await harness.open(t, { screen: "home", online: false, syncStatus: "stale", records, copies });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("给张伟回电话").waitFor();
  await page.getByText("整理储能资料").waitFor();
  await page.getByText("和佐藤喝咖啡").waitFor();
  await page.getByText("储能论坛").waitFor();
  await page.getByText("约谈：林悦").waitFor();
  await page.getByText("AI 创业者晚宴").waitFor();
  const complete = page.getByRole("button", { name: /完成.*给张伟回电话.*需要联网/ });
  assert.equal(await complete.isDisabled(), true);
  await complete.click({ force: true });
  assert.deepEqual((await requestsOf(page)).filter((entry) => !entry.startsWith("get:")), [], "no write offline");
  assert.equal(await page.getByText("暂时无法连接 Orbit 服务，请检查网络后再试。").count(), 0, "no red error under the cards");
  await page.getByRole("button", { name: /储能论坛/ }).click();
  assert.ok((await fixtureValue<string[]>(page, "navigation")).includes("/events/ev1"), "a registered event opens its detail page (readable offline)");
});

test("offline without a saved recommendation: that card says it is not on this device, the others still show", async (t) => {
  const page = await harness.open(t, { screen: "home", online: false, syncStatus: "stale", records, copies: {} });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("给张伟回电话").waitFor();
  await page.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。").waitFor();
});

test("online: the server answers replace the device copy and the recommendations and schedule become page copies", async (t) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const responses = {
    "/api/schedule-items": { scheduleItems: [{ id: "srv-1", kind: "personal", category: "personal", state: "upcoming", title: "服务器上的日程", startsAt: inOneHour, sourceId: "srv-1" }] },
    "/api/recommendations/events": { state: "success", recommendations: [recommendation("ev7", "服务器推荐的活动")] },
    "/api/tasks/page": { actorId: A, status: "open", scope: "all", query: "", dueWindow: { plannedThrough: today, dueBefore: new Date(new Date(`${today}T00:00:00+09:00`).getTime() + 86_400_000).toISOString() }, items: [], counts: { open: 0, completed: 0 }, total: 0, hasMore: false, nextCursor: null, asOf: new Date().toISOString() },
  };
  const page = await harness.open(t, { screen: "home", records, copies, responses });
  await page.getByText("服务器上的日程").waitFor();
  await page.getByText("服务器推荐的活动").waitFor();
  assert.equal(await page.getByText(OFFLINE_BANNER).count(), 0);
  assert.equal(await page.getByText("AI 创业者晚宴").count(), 0, "the server answer replaced the copy");
  const saves = await fixtureValue<string[]>(page, "saves");
  assert.ok(saves.includes("home-schedule|main") && saves.includes("event-recommendations|home"), saves.join(","));
});
