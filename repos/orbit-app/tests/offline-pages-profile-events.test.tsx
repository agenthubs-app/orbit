import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_BANNER, UNAVAILABLE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0131: the own profile (and its preview), a meeting's details, the
// events tab (public catalogue + recommendations), the old events list, the
// calendar preview and the event detail's 404 / 5xx / removed states.
const A = "account:one";
const copy = (data: unknown) => ({ data, syncedAt: "2026-09-28T01:10:00.000Z" });
const meeting = { appointmentId: "m1", confirmed: { durationMinutes: 30, medium: { kind: "in_person", location: "丸之内咖啡" }, startsAtUtc: "2026-10-02T02:00:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:1", details: "聊储能试点的报价", detailsUpdatedAt: "2026-09-27T01:00:00.000Z", detailsUpdatedBy: "you", eventId: null, proposals: [],
  status: "confirmed", title: "和张伟约谈", updatedAt: "2026-09-27T01:00:00.000Z", version: 3, visibility: "participants" };
const publicEvent = (id: string, title: string) => ({ id, title, startsAt: "2026-10-10T01:00:00.000Z", endsAt: "2026-10-10T04:00:00.000Z", location: "东京", status: "imported", topics: ["AI"], summary: "简介" });
const registered = { eventId: "ev1", participantId: "pt1", title: "储能论坛", description: "年度论坛", venue: "东京国际论坛", timeZone: "Asia/Tokyo", startsAt: "2026-10-01T01:00:00.000Z", endsAt: "2026-10-01T08:00:00.000Z", lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null, eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null };

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "meeting", importPath: "./src/screens/schedule/MeetingDetailScreen", exportName: "MeetingDetailScreen" },
    { name: "events", importPath: "./src/screens/events/EventsScreen", exportName: "EventsScreen" },
    { name: "homeEvents", importPath: "./src/screens/home/HomeScreen", exportName: "HomeScreen" },
    { name: "preview", importPath: "./src/screens/schedule/ScheduleEventPreviewScreen", exportName: "ScheduleEventPreviewScreen" },
    { name: "detail", importPath: "./src/screens/events/EventDetailScreen", exportName: "EventDetailScreen" },
  ]);
});
test.after(async () => { await harness?.close(); });

test("a meeting's details: online saved per meeting; offline the copy with 截至 and editing needs the network", async (t) => {
  const online = await harness.open(t, { screen: "meeting", params: { id: "m1" }, responses: { "/api/appointments/m1": meeting } });
  await online.getByText("聊储能试点的报价").waitFor();
  assert.deepEqual(await fixtureValue<string[]>(online, "saves"), ["meeting-details|appointment:m1"]);
  const page = await harness.open(t, { screen: "meeting", online: false, params: { id: "m1" }, copies: { "meeting-details|appointment:m1": copy(meeting) } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("聊储能试点的报价").waitFor();
  const edit = page.getByRole("button", { name: /· 需要联网/ });
  assert.equal(await edit.isDisabled(), true);
  const never = await harness.open(t, { screen: "meeting", online: false, params: { id: "m2" } });
  await never.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。").waitFor();
});

test("the events tab offline shows the last seen public catalogue with 截至; recording a recommendation needs the network", async (t) => {
  const catalogue = { events: [publicEvent("ev5", "AI 创业者晚宴"), publicEvent("ev6", "储能圆桌")] };
  const page = await harness.open(t, { screen: "events", online: false, copies: { "public-events|main": copy(catalogue) } });
  await page.getByText(OFFLINE_BANNER).first().waitFor();
  await page.getByText("AI 创业者晚宴").first().waitFor();
  assert.equal(await page.getByText("服务器连不上").count(), 0);
  assert.deepEqual((await requestsOf(page)).filter((entry) => !entry.startsWith("get:") && !entry.startsWith("resource:")), []);
});

test("the events tab online saves the catalogue it read", async (t) => {
  const page = await harness.open(t, { screen: "events", responses: { "/api/events/public": { events: [publicEvent("ev7", "服务器上的活动")] }, "/api/recommendations/events": { state: "empty", recommendations: [] } } });
  await page.getByText("服务器上的活动").first().waitFor();
  assert.ok((await fixtureValue<string[]>(page, "saves")).includes("public-events|main"));
});

test("the old events list reads the same catalogue copy offline", async (t) => {
  const page = await harness.open(t, { screen: "homeEvents", online: false, copies: { "public-events|main": copy([publicEvent("ev5", "AI 创业者晚宴")]) } });
  await page.getByText(OFFLINE_BANNER).waitFor();
});

test("the calendar preview of a registered event opens its detail page", async (t) => {
  const page = await harness.open(t, { screen: "preview", online: false, params: { id: "ev1" }, records: { registered_event: [registered] } });
  await page.waitForFunction(() => (window as unknown as { fixture: { navigation: string[] } }).fixture.navigation.length > 0);
  assert.deepEqual(await fixtureValue<string[]>(page, "navigation"), ["redirect:/events/ev1"]);
  const other = await harness.open(t, { screen: "preview", online: false, params: { id: "ev9" } });
  await other.getByText("这个页面要连上 Orbit 服务器才能使用。联网后点「重试」。").waitFor();
});

test("event detail: a 5xx keeps the device copy with 服务暂时不可用; a 404 says the event is gone; a removed registration is a neutral note", async (t) => {
  const records = { registered_event: [registered], event_registration: [{ eventId: "ev1", membershipStatus: "rsvped", admissionStatus: null }] };
  const unavailable = await harness.open(t, { screen: "detail", params: { id: "ev1" }, status5xx: true, records });
  await unavailable.getByText(UNAVAILABLE_BANNER).waitFor();
  await unavailable.getByText("储能论坛").first().waitFor();
  const gone = await harness.open(t, { screen: "detail", params: { id: "ev1" }, records, responses: { "/api/events/public/ev1": { __status: 404, __code: "NOT_FOUND", __message: "not found" } } });
  await gone.getByText("这场活动已不存在，可能已被主办方删除。").waitFor();
  assert.equal(await gone.getByText("储能论坛").count(), 0, "a deleted event is not shown from the device copy");
  const removed = await harness.open(t, { screen: "detail", online: false, params: { id: "ev1" }, records: { event_registration: [{ eventId: "ev1", membershipStatus: "cancelled", admissionStatus: null }] } });
  await removed.getByText(/报名已取消 · 这场活动的资料已从本机移除/).waitFor();
  assert.equal(await removed.getByText("暂时取不到活动详情").count(), 0, "no red error box next to the removal note");
  await removed.getByRole("button", { name: "返回" }).last().waitFor();
});

test("the own profile offline shows its copy with 截至, device counts, and editing needs the network; the preview reads the same copy", async (t) => {
  const { profilePayload } = await import("./helpers/profile-detail-fixtures");
  const profiles = await startOfflinePageHarness([
    { name: "profile", importPath: "./src/screens/profile/ProfileScreen", exportName: "ProfileScreen" },
    { name: "preview", importPath: "./src/screens/profile/ProfilePreviewScreen", exportName: "ProfilePreviewScreen" },
  ]);
  t.after(() => profiles.close());
  const card = (id: string, name: string) => ({ id, card: { id, displayName: name, organization: "星河", role: "顾问", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-27T00:00:00.000Z" }, tags: [], search: { text: name, occurredAt: "2026-09-27T00:00:00.000000Z", updatedAt: "2026-09-27T00:00:00.000000Z", error: null }, detail: null });
  const page = await profiles.open(t, { screen: "profile", online: false, syncStatus: "stale", copies: { "self-profile|main": copy(profilePayload) }, records: { contact: [card("c1", "张伟"), card("c2", "佐藤")] } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("程川").first().waitFor();
  await page.getByRole("button", { name: "人脉 2", exact: true }).waitFor();
  assert.deepEqual((await requestsOf(page)).filter((entry) => entry.startsWith("put:") || entry.startsWith("post:")), []);
  const preview = await profiles.open(t, { screen: "preview", online: false, copies: { "self-profile|main": copy(profilePayload) } });
  await preview.getByText(OFFLINE_BANNER).waitFor();
  await preview.getByText("程川").first().waitFor();
});
