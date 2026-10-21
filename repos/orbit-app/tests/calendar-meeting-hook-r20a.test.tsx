import assert from "node:assert/strict";
import test from "node:test";
import type { Plugin } from "esbuild";
import type { Browser } from "playwright";

import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

const boundary: Plugin = {
  name: "calendar-meeting-hook-boundary",
  setup(plugin) {
    plugin.onResolve({ filter: /^react-native$|\/(ApiBaseUrlProvider|AuthSessionProvider|useApiResource|usePageCopySession)$/ }, args => ({ path: args.path, namespace: "meeting-hook" }));
    plugin.onLoad({ filter: /.*/, namespace: "meeting-hook" }, args => {
      const name = args.path.split("/").at(-1);
      if (name === "react-native") return { contents: "export const Platform = { OS: 'ios' };", loader: "js" };
      if (name === "ApiBaseUrlProvider") return { contents: "export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });", loader: "js" };
      if (name === "AuthSessionProvider") return { contents: "export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: window.actorId, cookieHeader: window.actorId, notificationSessionRevision: 1 });", loader: "js" };
      if (name === "useApiResource") return { contents: `export const useApiResource = (path, _isEmpty, options) => { window.lastCalendarRequest = { actor: window.actorId, path, options }; return window.actorId === 'actor-a' ? { kind: 'success', data: { scheduleItems: [{ id: 'schedule:a', sourceId: 'a', kind: 'meeting', category: 'meeting', state: 'upcoming', title: 'Actor A secret', startsAt: '2026-10-17T01:00:00.000Z', endsAt: '2026-10-17T02:00:00.000Z' }] }, refreshing: false, refresh() {} } : window.uiFixture.deniedB ? { kind: 'failure', status: 403, error: { code: 'FORBIDDEN' }, refreshing: false, refresh() {} } : window.uiFixture.successB ? { kind: 'success', data: { scheduleItems: [{ id: 'schedule:b', sourceId: 'b', kind: 'meeting', category: 'meeting', state: 'upcoming', title: 'Actor B meeting', startsAt: '2026-10-17T01:00:00.000Z', endsAt: '2026-10-17T02:00:00.000Z' }] }, refreshing: false, refresh() {} } : window.uiFixture.offlineB ? { kind: 'offline', status: 0, error: { code: 'ORBIT_APP_NETWORK_ERROR' }, refreshing: false, refresh() {} } : { kind: 'loading', refreshing: false, refresh() {} }; };`, loader: "js" };
      return { contents: `import { useCallback } from 'react';
        export const usePageCopySession = () => { const actor = window.actorId; const makeSession = () => window.sessionB ||= { readPageCopy: async () => (window.uiFixture.offlineB || window.uiFixture.deniedB || window.uiFixture.freshB) && !window.uiFixture.copyDeletedB ? { data: { from: '2026-10-16T15:00:00.000Z', to: '2026-10-17T15:00:00.000Z', language: 'ja', readLocalDate: window.uiFixture.readLocalDateB || '2026-10-16', meetings: [{ id: 'schedule:b', sourceId: 'b', kind: 'meeting', category: 'meeting', state: 'upcoming', title: 'Actor B cached meeting', startsAt: '2026-10-17T01:00:00.000Z', endsAt: '2026-10-17T02:00:00.000Z' }] }, syncedAt: window.uiFixture.freshB ? new Date().toISOString() : '2026-10-16T01:00:00.000Z' } : null, savePageCopy: async (_id, _variant, data) => { window.saveStartedB = true; if (window.uiFixture.deferSaveB) await new Promise(resolve => { window.releaseSaveB = resolve; }); window.uiFixture.copyDeletedB = false; window.saves.push({ actor: 'actor-b', data }); }, deletePageCopy: async (id, variant) => { window.deletes.push({ actor: 'actor-b', id, variant }); window.uiFixture.copyDeletedB = true; } }; const whenReady = useCallback(() => actor === 'actor-a' ? new Promise(resolve => { (window.pendingA ||= []).push(resolve); }) : Promise.resolve(window.uiFixture.delaySessionB && !window.uiFixture.sessionBReady ? null : makeSession()), [actor]); return { session: actor === 'actor-b' && window.uiFixture.sessionBReady ? makeSession() : null, whenReady }; };`, loader: "js", resolveDir: process.cwd() };
    });
  },
};

let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(`
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useCalendarMeetings } from './src/screens/calendar/useCalendarMeetings';
    window.actorId = 'actor-a'; window.saves = []; window.deletes = []; window.pendingA = [];
    window.resolvePendingA = () => { const session = { readPageCopy: async () => ({ data: { from: 'old', to: 'old', language: 'ja', readLocalDate: '2026-10-16', meetings: [{ title: 'Actor A secret' }] }, syncedAt: '2026-10-16T00:00:00.000Z' }), savePageCopy: async (_id, _variant, data) => { window.saves.push({ actor: 'actor-a', data }); } }; for (const resolve of window.pendingA) resolve(session); };
    function Probe() { const [, bump] = useState(0); const [day, setDay] = useState('2026-10-17'); window.switchActor = id => { window.actorId = id; bump(value => value + 1); }; window.switchWindow = date => setDay(date); window.setNetworkB = (denied, offline) => { window.uiFixture.deniedB = denied; window.uiFixture.offlineB = offline; window.uiFixture.successB = false; bump(value => value + 1); }; window.setSessionBReady = () => { window.uiFixture.sessionBReady = true; bump(value => value + 1); }; const result = useCalendarMeetings(day, 'day', 'Asia/Tokyo', 'ja'); window.refreshMeetings = result.refresh; return <div id='probe'>{JSON.stringify({ part: result.part, copy: result.copy })}</div>; }
    createRoot(document.getElementById('root')).render(<Probe />);
  `, [boundary]);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("a delayed answer from actor A cannot save or paint into actor B's calendar", async t => {
  const page = await openScenario(browser, script, {});
  t.after(() => page.close());
  await page.getByText(/Actor A secret/u).waitFor();
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForFunction(() => !document.getElementById("probe")?.textContent?.includes("Actor A secret"));
  await page.evaluate(() => (window as any).resolvePendingA());
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => (window as any).saves), []);
  assert.doesNotMatch(await page.locator("#probe").innerText(), /Actor A secret/u);
});

test("the meeting hook reads only the bounded authenticated calendar window", async t => {
  const page = await openScenario(browser, script, {});
  t.after(() => page.close());
  // LF10: on the device the window's copy is read first (a fresh one would keep the request off), so the read starts once
  // the copy session answers; this one holds another window's copy.
  assert.equal(await page.evaluate(() => (window as any).lastCalendarRequest.options.enabled), false);
  await page.evaluate(() => (window as any).resolvePendingA());
  await page.waitForFunction(() => (window as any).lastCalendarRequest.options.enabled === true);
  const request = await page.evaluate(() => (window as any).lastCalendarRequest);
  const url = new URL(request.path, "https://orbit.example");
  assert.equal(url.pathname, "/api/schedule-items");
  assert.deepEqual(Object.fromEntries(url.searchParams), { scope: "calendar", from: "2026-10-16T15:00:00.000Z", to: "2026-10-17T15:00:00.000Z", language: "ja" });
  assert.equal(request.options.cachePolicy, "network-only");
  assert.equal(request.options.enabled, true);
  assert.match(request.options.scopeKey, /actor-a/u);
});

test("an offline actor-B copy is visibly stale and never shows actor-A rows", async t => {
  const page = await openScenario(browser, script, { offlineB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.getByText(/Actor B cached meeting/u).waitFor();
  const view = await page.locator("#probe").innerText();
  assert.match(view, /"stale":true/u);
  assert.doesNotMatch(view, /Actor A secret/u);
});

test("an open offline meeting copy becomes stale after local midnight", async t => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.clock.install({ time: new Date("2026-10-17T14:59:30.000Z") });
  await page.setContent(`<!doctype html><html><body><div id="root"></div><script>window.uiFixture={offlineB:true,readLocalDateB:'2026-10-17'}</script></body></html>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.getByText(/Actor B cached meeting/u).waitFor();
  assert.match(await page.locator("#probe").innerText(), /"stale":false/u);
  await page.clock.fastForward(61_000);
  await page.waitForFunction(() => document.getElementById("probe")?.textContent?.includes('"stale":true'));
});

test("an authoritative 403 purges the matching copy before a later offline read", async t => {
  const page = await openScenario(browser, script, { deniedB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForFunction(() => (window as any).deletes.length === 1);
  assert.doesNotMatch(await page.locator("#probe").innerText(), /Actor B cached meeting/u);
  await page.evaluate(() => (window as any).setNetworkB(false, true));
  await page.evaluate(() => (window as any).switchActor("actor-a"));
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForTimeout(200);
  const afterOffline = await page.locator("#probe").innerText();
  assert.match(afterOffline, /"kind":"offline"/u);
  assert.doesNotMatch(afterOffline, /Actor B cached meeting/u);
});

test("a 403 still purges its copy when the storage session opens late", async t => {
  const page = await openScenario(browser, script, { deniedB: true, delaySessionB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => (window as any).deletes), []);
  await page.evaluate(() => (window as any).setSessionBReady());
  await page.waitForFunction(() => (window as any).deletes.length === 1);
  assert.doesNotMatch(await page.locator("#probe").innerText(), /Actor B cached meeting/u);
});

test("a delayed successful save cannot restore a copy after an authoritative 403", async t => {
  const page = await openScenario(browser, script, { successB: true, deferSaveB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForFunction(() => (window as any).saveStartedB === true);
  await page.evaluate(() => (window as any).setNetworkB(true, false));
  await page.waitForFunction(() => document.getElementById("probe")?.textContent?.includes('"kind":"failure"'));
  await page.evaluate(() => (window as any).releaseSaveB());
  await page.waitForFunction(() => (window as any).deletes.length === 1);
  assert.equal(await page.evaluate(() => (window as any).uiFixture.copyDeletedB), true);
  await page.evaluate(() => (window as any).setNetworkB(false, true));
  await page.waitForTimeout(100);
  assert.doesNotMatch(await page.locator("#probe").innerText(), /Actor B cached meeting/u);
});

test("a denied window is deleted even when the calendar moves before its save finishes", async t => {
  const page = await openScenario(browser, script, { successB: true, deferSaveB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForFunction(() => (window as any).saveStartedB === true);
  await page.evaluate(() => (window as any).setNetworkB(true, false));
  await page.waitForFunction(() => document.getElementById("probe")?.textContent?.includes('"kind":"failure"'));
  await page.evaluate(() => (window as any).setNetworkB(false, true));
  await page.evaluate(() => (window as any).switchWindow("2026-10-18"));
  await page.evaluate(() => (window as any).releaseSaveB());
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => ({ deletes: (window as any).deletes, copyDeleted: (window as any).uiFixture.copyDeletedB }));
  assert.equal(state.deletes.length, 1);
  assert.match(state.deletes[0].variant, /2026-10-16T15:00:00.000Z/u);
  assert.equal(state.copyDeleted, true);
});

test("LF10: a window's copy saved moments ago is shown without a request until the user refreshes", async t => {
  const page = await openScenario(browser, script, { freshB: true });
  t.after(() => page.close());
  await page.evaluate(() => (window as any).switchActor("actor-b"));
  await page.waitForFunction(() => document.getElementById("probe")?.textContent?.includes("Actor B cached meeting"));
  const shown = JSON.parse((await page.textContent("#probe"))!);
  assert.equal(shown.copy, null, "a fresh copy is current data, not a 截至 snapshot");
  assert.deepEqual(await page.evaluate(() => [(window as any).lastCalendarRequest.actor, (window as any).lastCalendarRequest.options.enabled]), ["actor-b", false]);
  await page.evaluate(() => (window as any).refreshMeetings());
  await page.waitForFunction(() => (window as any).lastCalendarRequest.options.enabled === true);
});
