import assert from "node:assert/strict";
import test from "node:test";
import type { Plugin } from "esbuild";
import type { Browser } from "playwright";

import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

const calendarBoundary: Plugin = {
  name: "calendar-failure-boundary",
  setup(plugin) {
    plugin.onResolve({ filter: /^expo-router$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider|schedule-calendar-source|useCalendarExternalEvents|AppScreen)$/ }, args => ({ path: args.path, namespace: "calendar-failure" }));
    plugin.onLoad({ filter: /.*/, namespace: "calendar-failure" }, args => {
      const name = args.path.split("/").at(-1);
      if (name === "expo-router") return { contents: "export const useGlobalSearchParams = () => ({}); export const useRouter = () => ({ push() {} });", loader: "js" };
      if (name === "AuthSessionProvider") return { contents: "export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: 'actor-1' });", loader: "js" };
      if (name === "ApiBaseUrlProvider") return { contents: "export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });", loader: "js" };
      if (name === "OrbitTimeZoneProvider") return { contents: "export const useOrbitTimeZone = () => ({ timeZone: 'Asia/Tokyo' });", loader: "js" };
      if (name === "schedule-calendar-source") return { contents: `export const useScheduleCalendarSource = () => { const part = { kind: "failure", data: null, message: window.uiFixture.message }; return { tasks: part, events: part, scheduleItems: part, refreshing: false, offline: null, refresh() {} }; };`, loader: "js" };
      if (name === "useCalendarExternalEvents") return { contents: "export const useCalendarExternalEvents = () => ({ view: null, refreshing: false, refresh() {} });", loader: "js" };
      return { contents: "import React from 'react'; import { View } from 'react-native'; export const AppScreen = ({ children }) => <View>{children}</View>;", loader: "jsx", resolveDir: process.cwd() };
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
    const language = "ja";
    const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
    createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><CalendarScreen /></OrbitLocaleContext.Provider>);
  `, [calendarBoundary]);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

test("Japanese calendar failure cards do not expose a Chinese server error", async t => {
  const page = await openScenario(browser, script, { message: "认证失败，请重试。" });
  t.after(() => page.close());
  await page.getByText("タスクを読み込めません").waitFor();
  const visible = await page.locator("body").innerText();
  assert.doesNotMatch(visible, /认证失败/u);
  assert.match(visible, /予定を確認できません。再読み込みしてください。/u);
});

test("Japanese calendar failure cards translate a mirror error code", async t => {
  const page = await openScenario(browser, script, { message: "sync.failure" });
  t.after(() => page.close());
  await page.getByText("タスクを読み込めません").waitFor();
  const visible = await page.locator("body").innerText();
  assert.doesNotMatch(visible, /sync\.failure/u);
  assert.match(visible, /同期できませんでした。もう一度お試しください。/u);
});
