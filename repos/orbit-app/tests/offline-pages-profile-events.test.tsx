import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_BANNER, UNAVAILABLE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0131: the own profile (and its preview), a meeting's details, the
// events tab (public catalogue + recommendations), the old events list, the
// calendar preview (the R27 event detail is online-only; its old offline states went with it).
const A = "account:one";
const copy = (data: unknown) => ({ data, syncedAt: "2026-09-28T01:10:00.000Z" });
const meeting = { appointmentId: "m1", confirmed: { durationMinutes: 30, medium: { kind: "in_person", location: "丸之内咖啡" }, startsAtUtc: "2026-10-02T02:00:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:1", details: "聊储能试点的报价", detailsUpdatedAt: "2026-09-27T01:00:00.000Z", detailsUpdatedBy: "you", eventId: null, proposals: [],
  status: "confirmed", title: "和张伟约谈", updatedAt: "2026-09-27T01:00:00.000Z", version: 3, visibility: "participants" };
// The events tab lists upcoming events only, so the catalogue starts a week from now
// (a fixed date turned into a past event on 2026-10-10 and the two tab tests timed out).
const inAWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
const publicEvent = (id: string, title: string) => ({ id, title, startsAt: new Date(inAWeek).toISOString(), endsAt: new Date(inAWeek + 3 * 60 * 60 * 1000).toISOString(), location: "东京", status: "imported", topics: ["AI"], summary: "简介" });
const registered = { eventId: "ev1", participantId: "pt1", title: "储能论坛", description: "年度论坛", venue: "东京国际论坛", timeZone: "Asia/Tokyo", startsAt: "2026-10-01T01:00:00.000Z", endsAt: "2026-10-01T08:00:00.000Z", lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null, eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null };

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "meeting", importPath: "./src/screens/schedule/MeetingDetailScreen", exportName: "MeetingDetailScreen" },
    { name: "homeEvents", importPath: "./src/screens/home/HomeScreen", exportName: "HomeScreen" },
    { name: "preview", importPath: "./src/screens/schedule/ScheduleEventPreviewScreen", exportName: "ScheduleEventPreviewScreen" },
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
