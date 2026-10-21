import assert from "node:assert/strict";
import test from "node:test";
import type { Plugin } from "esbuild";

import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// LF10: provider events are network-only (never stored on the device), so the read is keyed by the range the calendar
// shows. Tapping another day of the same month must not read Google again; moving to another month must.
const boundary: Plugin = {
  name: "calendar-external-boundary",
  setup(plugin) {
    plugin.onResolve({ filter: /\/(ApiBaseUrlProvider|AuthSessionProvider|useApiResource)$/ }, (args) => ({ path: args.path, namespace: "external" }));
    plugin.onLoad({ filter: /.*/, namespace: "external" }, (args) => {
      const name = args.path.split("/").at(-1);
      if (name === "ApiBaseUrlProvider") return { contents: "export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });", loader: "js" };
      if (name === "AuthSessionProvider") return { contents: "export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: 'actor', cookieHeader: 'c', notificationSessionRevision: 1 });", loader: "js" };
      return { contents: "export const useApiResource = (path, _isEmpty, options) => { if (options.enabled) (window.reads ||= []).push(options.scopeKey + '|' + path); return { kind: 'loading', refreshing: false, refresh() {} }; };", loader: "js" };
    });
  },
};

test("tapping days inside the shown month keeps the provider read; another month reads once more", async (t) => {
  const script = await bundleScenarios(`
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useCalendarExternalEvents } from './src/screens/calendar/useCalendarExternalEvents';
    function Probe() { const [day, setDay] = useState('2026-10-07'); window.pick = setDay; useCalendarExternalEvents(day, 'month', 'Asia/Tokyo', true); return null; }
    createRoot(document.getElementById('root')).render(<Probe />);
  `, [boundary]);
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, {}); t.after(() => page.close());
  const distinct = () => page.evaluate(() => [...new Set((window as any).reads ?? [])].length);
  await page.waitForFunction(() => ((window as any).reads ?? []).length > 0);
  const first = await distinct();
  for (const day of ["2026-10-08", "2026-10-21", "2026-10-30"]) { await page.evaluate((value) => (window as any).pick(value), day); await page.waitForTimeout(50); }
  assert.equal(await distinct(), first, "same month: same reads");
  await page.evaluate(() => (window as any).pick("2026-11-12"));
  await page.waitForFunction((count) => new Set((window as any).reads).size > count, first);
});
