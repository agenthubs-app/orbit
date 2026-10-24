import assert from "node:assert/strict";
import test from "node:test";
import type { Plugin } from "esbuild";
import type { Browser } from "playwright";

import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

const boundary: Plugin = {
  name: "calendar-meeting-boundary",
  setup(plugin) {
    plugin.onResolve({ filter: /^expo-router$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider|schedule-calendar-source|useCalendarExternalEvents|useCalendarMeetings|AppScreen)$/ }, args => ({ path: args.path, namespace: "calendar-meeting" }));
    plugin.onLoad({ filter: /.*/, namespace: "calendar-meeting" }, args => {
      const name = args.path.split("/").at(-1);
      if (name === "expo-router") return { contents: "export const useGlobalSearchParams = () => ({ date: '2026-10-17' }); export const useRouter = () => ({ push(path) { window.pushed = path; } });", loader: "js" };
      if (name === "AuthSessionProvider") return { contents: "export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: 'actor-1' });", loader: "js" };
      if (name === "ApiBaseUrlProvider") return { contents: "export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });", loader: "js" };
      if (name === "OrbitTimeZoneProvider") return { contents: "export const useOrbitTimeZone = () => ({ timeZone: 'Asia/Tokyo' });", loader: "js" };
      if (name === "schedule-calendar-source") return { contents: `export const useScheduleCalendarSource = () => ({ tasks: { kind: "ready", data: { tasks: [] }, message: "" }, events: { kind: "ready", data: { events: [] }, message: "" }, scheduleItems: { kind: "ready", data: { scheduleItems: [{ id: "personal-1", kind: "personal", title: "Personal lunch", startsAt: "2026-10-17T03:00:00.000Z", endsAt: "2026-10-17T04:00:00.000Z" }] }, message: "" }, refreshing: false, offline: null, refresh() { window.sourceRefreshes++; } });`, loader: "js" };
      if (name === "useCalendarExternalEvents") return { contents: "export const useCalendarExternalEvents = () => ({ view: null, refreshing: false, refresh() {} });", loader: "js" };
      if (name === "useCalendarMeetings") return { contents: `export const useCalendarMeetings = () => window.uiFixture.invalid ? { part: { kind: "failure", data: null, message: "calendar.view.invalid" }, copy: null, refreshing: false, refresh() { window.meetingRefreshes++; } } : { part: { kind: "ready", data: { scheduleItems: [{ id: "schedule:appointment-1", sourceId: "appointment-1", kind: "meeting", category: "meeting", state: "upcoming", title: "Confirmed interview", startsAt: "2026-10-17T01:00:00.000Z", endsAt: "2026-10-17T02:00:00.000Z" }] }, message: "" }, copy: window.uiFixture.stale || window.uiFixture.loadingCopy ? { lastSyncedAt: "2026-10-16T01:00:00.000Z", offline: !!window.uiFixture.stale, reason: window.uiFixture.stale ? "unreachable" : null, readLocalDate: "2026-10-16", stale: !!window.uiFixture.stale } : null, refreshing: false, refresh() { window.meetingRefreshes++; } };`, loader: "js" };
      return { contents: "import React from 'react'; import { View, Text } from 'react-native'; export const AppScreen = ({ children, refreshControl }) => <View><Text onPress={refreshControl.props.onRefresh}>Refresh calendar</Text>{children}</View>;", loader: "jsx", resolveDir: process.cwd() };
    });
  },
};

let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { CalendarScreen } from "./src/screens/calendar/CalendarScreen";
    import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
    import { createTranslator } from "./src/i18n/messages";
    window.sourceRefreshes = 0; window.meetingRefreshes = 0;
    const language = "ja";
    const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
    createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><CalendarScreen /></OrbitLocaleContext.Provider>);
  `, [boundary]);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("calendar shows the confirmed appointment and opens its read-only detail", async t => {
  const page = await openScenario(browser, script, {});
  t.after(() => page.close());
  await page.getByText("Confirmed interview").first().waitFor();
  await page.getByRole("button", { name: /Confirmed interview/u }).click();
  assert.equal(await page.evaluate(() => (window as any).pushed), "/schedule/meetings/appointment-1?source=appointment");
});

test("a stale meeting copy is marked while unrelated personal rows remain visible", async t => {
  const page = await openScenario(browser, script, { stale: true });
  t.after(() => page.close());
  await page.getByText("Personal lunch").first().waitFor();
  await page.getByText(/以前の情報/u).waitFor();
  await page.getByText("Refresh calendar").click();
  assert.equal(await page.evaluate(() => (window as any).meetingRefreshes), 1);
});

test("UX review: a cached meeting shows at once while its network read is pending, without an as-of notice", async t => {
  const page = await openScenario(browser, script, { loadingCopy: true });
  t.after(() => page.close());
  await page.getByText("Confirmed interview").first().waitFor();
  // The device copy is the calendar while the read runs (local-first); 「…時点の情報」 is only for an offline copy.
  assert.equal(await page.getByText(/時点の情報/u).count(), 0);
});

test("a failed meeting read does not hide personal schedule rows", async t => {
  const page = await openScenario(browser, script, { invalid: true });
  t.after(() => page.close());
  await page.getByText("Personal lunch").first().waitFor();
  assert.equal(await page.getByText("Confirmed interview").count(), 0);
});
