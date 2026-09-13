import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const titles = ["周末产品交流会", "设计师午间聚会", "创业者交流夜", "产品与工程圆桌"];
const events = titles.map((title, index) => ({ id: "event:" + (index + 1), title, startsAt: "2026-09-" + [12, 13, 15, 18][index] + "T" + ["14:00", "12:00", "18:00", "19:00"][index] + ":00+09:00", endsAt: "2026-09-" + [12, 13, 15, 18][index] + "T21:00:00+09:00", status: "imported", venue: "东京", location: "东京", subtitle: ["涩谷 · 产品经验交流", "代官山 · 设计灵感分享", "丸之内 · 创业经验分享", "五反田 · 产品技术讨论"][index], tags: [index === 1 ? "设计" : "产品"], coverPath: "/orbit-covers/meeting.jpg", organizer: "星野社区", description: "带着一个正在推进的问题交流。", relationshipContext: "公开活动", recommendedPreparation: "确认参加要求", nextAction: "先看活动详情", sourceMetadata: { type: "event_import", label: "活动主办方" }, evidence: [], code: "public-" + index }));
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, expiries: 0, actor: "actor-1", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, focused: true, mounted: true, width: 390, fontScale: 1, events, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  data(path) {
    if (path === "/api/events/public") { const items = state.empty ? [] : state.events; return state.invalid ? {} : { events: state.badField ? items.map((event, i) => i === 0 ? { ...event, [typeof state.badField === "string" ? state.badField : "title"]: 42 } : event) : state.duplicate ? [...items, items[0]] : items, generatedAt: "2026-09-12T00:00:00Z", organizer: null }; }
    if (path === "/api/recommendations/events") return state.recommendations ?? { state: "empty", profile: { calendarFit: "open", goal: "交流产品经验", industryPreference: "technology", location: "Tokyo" }, recommendations: [], summary: "", nextAction: "先看活动详情" };
    return {};
  },
  reply(index, status = 200, payload) { const r = state.requests[index]; state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? state.data(r.path) : payload } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取，请重试" } }), { status, headers: { "Content-Type": "application/json" } })); }
};
Date.now = () => Date.parse(state.now ?? "2026-09-12T00:00:00Z");
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => {
  const index = state.requests.length; const path = new URL(String(input)).pathname;
  state.requests.push({ path, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => state.reply(index, init.method !== "GET" || state.failure ? 503 : 200));
  return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/events";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); } });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/(app)/events"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ink-events-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "events" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "events" }));
      plugin.onLoad({ filter: /.*/, namespace: "events" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, RefreshControl as RealRefreshControl, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
const scaled = (props, scale) => { const style = StyleSheet.flatten(props.style) || {}; return !style.fontSize || props.allowFontScaling === false ? props.style : [props.style, { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]; };
export const Text = props => { const s = useFixture(); return <RealText {...props} style={scaled(props, s.fontScale)} />; };
export const TextInput = props => { const s = useFixture(); return <RealTextInput {...props} style={scaled(props, s.fontScale)} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  const cover = readFileSync("../orbits/public/orbit-covers/meeting.jpg");
  await p.route("**/*", r => r.request().url().endsWith("/orbit-covers/meeting.jpg") ? r.fulfill({ contentType: "image/jpeg", body: cover }) : r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  await settle(p); await p.evaluate(() => document.fonts.ready); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }

const recommendationSource = { type: "event_import", label: "活动主办方", providerRecordId: "event:1", generatedBy: "live-store-query" };
const recommendation = {
  eventId: "event:1", title: "周末产品交流会", startsAt: "2026-09-12T14:00:00+09:00", endsAt: "2026-09-12T21:00:00+09:00", location: "东京", venue: "涩谷", industry: "technology", attendeeDensity: 20, calendarFit: "open", valueScore: 88, scoreBand: "high",
  factors: { profileGoal: 25, location: 20, industryPreference: 20, attendeeDensity: 13, calendarFit: 10 },
  signals: [{ signalId: "signal:1", label: "目标相关", detail: "可以与产品同行交流具体经验。", factor: "profileGoal", weight: 25, evidenceIds: [], source: recommendationSource, generatedBy: "live-event-value-rule", liveEventDiscoveryFeedRequested: false, calendarProviderRequested: false, databaseQueryExecuted: true, aiProviderRequested: false, externalNetworkRequested: false }],
  recommendedAction: "先查看活动详情，再决定是否报名。", source: recommendationSource, evidenceIds: [], generatedBy: "live-store-event-value", calendarAvailabilitySynced: false, liveEventDiscoveryFeedRequested: false, externalNetworkRequested: false, databaseQueryExecuted: true, aiProviderRequested: false, calendarProviderRequested: false, emailProviderRequested: false, notificationDelivered: false
};
const recommendationProvenance = { source: "event-catalogue", sourceLabel: "活动目录", evidenceIds: [], collectedAt: "2026-09-12T00:00:00Z", privacy: "live-event-value-recommendation-only", generationMethod: "live-store-event-value", calendarProviderRequested: false, calendarAvailabilitySynced: false, liveEventDiscoveryFeedRequested: false, databaseQueryExecuted: true, databaseWriteExecuted: false, productionAuditLogWriteExecuted: false, externalNetworkRequested: false, deviceRequested: false, aiProviderRequested: false, emailProviderRequested: false, notificationDelivered: false };
const recommendationsPayload = { state: "success", profile: { profileId: "actor-1", calendarFit: "open", goal: "交流产品经验", industryPreference: "technology", location: "Tokyo", source: recommendationSource, evidenceIds: [] }, recommendations: [recommendation], summary: "根据你的交流目标推荐。", nextAction: "先看活动详情", provenance: recommendationProvenance };
const acceptancePayload = { state: "accepted", acceptedEvent: recommendation, action: { actionId: "accept:event:1", label: "接受推荐", generatedBy: "live-event-value-service", evidenceIds: [], source: recommendationSource, externalNetworkRequested: false, calendarProviderRequested: false, notificationDelivered: false, databaseWriteExecuted: false, productionAuditLogWriteExecuted: false }, summary: "已接受推荐。", nextAction: "下一步去活动页确认报名和会前准备。", provenance: { ...recommendationProvenance, generationMethod: "live-store-acceptance" } };

async function recommendationsPage(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await open(t, { recommendations: recommendationsPayload, holdWrites: true, ...patch });
  await p.getByRole("tab", { name: "推荐", exact: true }).click(); await settle(p);
  await p.getByRole("button", { name: "记下推荐", exact: true }).or(p.getByText("暂时取不到推荐", { exact: true })).first().waitFor();
  return p;
}

test("recommendations expose loading and valid empty or pending states with read-only retry", async t => {
  const p = await recommendationsPage(t, { holdReads: false });
  await p.getByRole("tab", { name: "全部", exact: true }).click(); await update(p, { holdReads: true });
  await p.getByRole("tab", { name: "推荐", exact: true }).click(); await settle(p);
  assert.equal(await p.getByText("正在读取推荐", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-recommendations-loading.png" });
  await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.length - 1, 200, payload); }, { ...recommendationsPayload, state: "pending", recommendations: [] }); await settle(p);
  assert.equal(await p.getByText("推荐还在准备中", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-recommendations-pending.png" });
  await press(p, "重新读取推荐");
  await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.length - 1, 200, payload); }, { ...recommendationsPayload, state: "empty", recommendations: [] }); await settle(p);
  assert.equal(await p.getByText("暂无活动推荐", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-recommendations-empty.png" });
  assert.deepEqual(await writes(p), []);
});

for (const payload of [{}, { ...recommendationsPayload, recommendations: [{ ...recommendation, valueScore: "88" }] }, { ...recommendationsPayload, recommendations: [recommendation, recommendation] }, { ...recommendationsPayload, state: "empty" }]) test("malformed recommendation reads are recoverable, not fabricated empty or usable cards " + JSON.stringify(payload).slice(0, 150), async t => {
  const p = await recommendationsPage(t, { recommendations: payload });
  assert.equal(await p.getByText("暂时取不到推荐", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).count(), 0);
  await update(p, { recommendations: recommendationsPayload }); await press(p, "重新读取推荐");
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("recommendation transport failures have a working retry without hiding the catalogue", async t => {
  const p = await open(t); await update(p, { failure: true });
  await p.getByRole("tab", { name: "推荐", exact: true }).click(); await settle(p);
  assert.equal(await p.getByText("暂时取不到推荐", { exact: true }).count(), 1);
  await update(p, { failure: false, recommendations: recommendationsPayload }); await press(p, "重新读取推荐");
  assert.equal(await p.getByText("88 分", { exact: true }).count(), 1);
  await p.getByRole("tab", { name: "全部", exact: true }).click(); await settle(p);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "4");
});

test("recommendations only offer real matching events and explain excluded results", async t => {
  const p = await recommendationsPage(t);
  await p.getByPlaceholder("搜索活动、地点或主题").fill("设计师"); await settle(p);
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).count(), 0);
  assert.equal(await p.getByText("当前筛选下没有推荐活动", { exact: true }).count(), 1);
  await press(p, "清空活动搜索");
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).count(), 1);
  await update(p, { recommendations: { ...recommendationsPayload, recommendations: [{ ...recommendation, eventId: "unknown-event" }] } });
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).count(), 0);
  assert.equal(await p.getByText("当前筛选下没有推荐活动", { exact: true }).count(), 1);
});

test("accepting a recommendation has a synchronous lock and only valid acknowledgement enables registration navigation", async t => {
  const p = await recommendationsPage(t); assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; const accept = s.presses["记下推荐"]; accept(); accept(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/recommendations/events/event%3A1/accept", body: null }]);
  assert.equal(await p.getByRole("button", { name: "去报名", exact: true }).count(), 0);
  await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 200, payload); }, acceptancePayload); await settle(p);
  assert.equal(await p.getByText("已接受推荐：周末产品交流会", { exact: true }).count(), 1);
  assert.equal(await p.getByText("未写日历、未发送通知", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-recommendations-accepted.png" });
  await press(p, "去报名"); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events/event%3A1/register");
  assert.equal((await writes(p)).length, 1);
});

for (const [label, payload, status] of [
  ["missing", {}, 200], ["pending", { ...acceptancePayload, state: "pending" }, 202],
  ["wrong id", { ...acceptancePayload, acceptedEvent: { ...recommendation, eventId: "event:2" } }, 200],
  ["missing safety", { ...acceptancePayload, action: {} }, 200],
  ["invalid score", { ...acceptancePayload, acceptedEvent: { ...recommendation, valueScore: 101 } }, 200],
  ["non-2xx", acceptancePayload, 503]
] as const) test("acceptance does not fabricate confirmation from " + label, async t => {
  const p = await recommendationsPage(t); await press(p, "记下推荐");
  await p.evaluate(({ payload, status }: { payload: unknown; status: number }) => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), status, payload); }, { payload, status }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "去报名", exact: true }).count(), 0);
  assert.equal(await p.getByText("已接受推荐：周末产品交流会", { exact: true }).count(), 0);
  assert.equal(await p.getByText("未能确认推荐选择，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).isEnabled(), true);
});

for (const flag of ["calendarProviderRequested", "notificationDelivered", "databaseWriteExecuted", "externalNetworkRequested", "productionAuditLogWriteExecuted"] as const) for (const value of [undefined, true]) test("acceptance requires an explicit safe acknowledgement for " + flag + "=" + value, async t => {
  const p = await recommendationsPage(t); await press(p, "记下推荐");
  const action: Record<string, unknown> = { ...acceptancePayload.action };
  if (value === undefined) delete action[flag]; else action[flag] = value;
  await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 200, payload); }, { ...acceptancePayload, action }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "去报名", exact: true }).count(), 0);
  assert.equal(await p.getByText("未能确认推荐选择，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "记下推荐", exact: true }).isEnabled(), true);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-cookie-2" }, { baseUrl: "https://second.example" }, { focused: false }, { mounted: false }, { tab: "all" }, { filter: "设计师" }, { refresh: true }]) test("obsolete recommendation writes and retained callbacks cannot affect the active scope " + JSON.stringify(patch), async t => {
  const p = await recommendationsPage(t);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAccept = s.presses["记下推荐"]; s.oldOpen = s.presses["查看活动"]; });
  await press(p, "记下推荐");
  if ("tab" in patch) { await p.getByRole("tab", { name: "全部", exact: true }).click(); await settle(p); }
  else if ("filter" in patch) { await p.getByPlaceholder("搜索活动、地点或主题").fill(patch.filter); await settle(p); }
  else if ("refresh" in patch) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
  else await update(p, patch);
  const before = (await writes(p)).length;
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAccept(); s.oldOpen(); s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 401); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "POST").signal?.aborted), true);
  assert.equal((await writes(p)).length, before);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("event catalogue uses the approved title, inline operator entry, tabs and compact image rows", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("tab", { name: "全部", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await p.getByRole("tab", { name: "已报名", exact: true }).count(), 0);
  const heading = (await p.getByRole("heading", { name: "活动", exact: true }).boundingBox())!;
  const center = (await p.getByRole("button", { name: "打开活动运营中心", exact: true }).boundingBox())!;
  assert.ok(Math.abs(heading.y - center.y) < 20 && center.height >= 44);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "4");
  const row = p.getByRole("button", { name: /^周末产品交流会，/ });
  const cover = (await row.locator("img").boundingBox())!; assert.equal(cover.width, 92); assert.equal(cover.height, 70);
  const title = (await row.getByText("周末产品交流会", { exact: true }).boundingBox())!;
  const date = (await row.getByText("9月12日 周六 14:00", { exact: true }).boundingBox())!;
  assert.ok(title.y < date.y);
  for (const name of ["筛选活动时间", "筛选活动地点", "筛选活动主题"]) { const box = (await p.getByRole("button", { name, exact: true }).boundingBox())!; assert.ok(box.width >= 44 && box.height >= 44); }
  assert.equal(await p.getByRole("tablist", { name: "主导航" }).count(), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.some((r: any) => r.path === "/api/recommendations/events")), false);
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-390-" + (process.env.EVENTS_QA_PASS ?? "current") + ".png" });
});

test("catalogue tabs keep source text alignment and a text-width underline without shrinking their touch targets", async t => {
  const p = await open(t);
  const recommended = p.getByRole("tab", { name: "推荐", exact: true }); const all = p.getByRole("tab", { name: "全部", exact: true });
  const first = (await recommended.getByText("推荐", { exact: true }).boundingBox())!;
  const second = (await all.getByText("全部", { exact: true }).boundingBox())!;
  assert.ok(Math.abs(first.x - 16) <= 1 && Math.abs(second.x - 66) <= 1, `source text insets 16 / 66; got ${first.x} / ${second.x}`);
  const underlineWidth = await all.evaluate(el => [el, ...el.querySelectorAll("*")].find(node => { const style = getComputedStyle(node); return parseFloat(style.borderBottomWidth) >= 2 && style.borderBottomColor !== "rgba(0, 0, 0, 0)"; })?.getBoundingClientRect().width);
  assert.ok(typeof underlineWidth === "number" && Math.abs(underlineWidth - second.width) <= 1);
  for (const tab of [recommended, all]) { const box = (await tab.boundingBox())!; assert.ok(box.width >= 44 && box.height >= 44); }
  await recommended.click({ position: { x: 40, y: 20 } }); assert.equal(await recommended.getAttribute("aria-selected"), "true"); assert.deepEqual(await writes(p), []);
});

test("event filters compose and clear without registering or replacing the real navigation id", async t => {
  const p = await open(t); await press(p, "筛选活动时间"); assert.equal(await p.getByRole("button", { name: "全部时间", exact: true }).innerText(), "全部时间 4"); await press(p, "全部时间");
  await press(p, "筛选活动地点"); await press(p, "东京");
  await press(p, "筛选活动主题"); await press(p, "产品");
  await p.getByPlaceholder("搜索活动、地点或主题").fill("圆桌"); await settle(p);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  await p.getByRole("button", { name: /^产品与工程圆桌，/ }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [{ pathname: "/events/[id]", params: { id: "event:4" } }]);
  await press(p, "清空活动搜索"); assert.equal(await p.getByTestId("events-result-count").innerText(), "3");
  await press(p, "筛选活动主题"); await press(p, "全部主题"); assert.equal(await p.getByTestId("events-result-count").innerText(), "4");
  assert.deepEqual(await writes(p), []);
});

test("public imported records are filtered and counted by their real time range", async t => {
  const p = await open(t, { now: "2026-09-12T04:00:00Z" });
  await p.evaluate(() => { const s = (window as any).fixture; s.events = [
    { ...s.events[0], id: "future", title: "未来活动", startsAt: "2026-09-12T14:00:00+09:00", endsAt: "2026-09-12T15:00:00+09:00", status: "imported" },
    { ...s.events[0], id: "active", title: "现场活动", startsAt: "2026-09-12T12:00:00+09:00", endsAt: "2026-09-12T15:00:00+09:00", status: "imported" },
    { ...s.events[0], id: "ended", title: "过去活动", startsAt: "2026-09-12T10:00:00+09:00", endsAt: "2026-09-12T12:00:00+09:00", status: "cancelled" },
    { ...s.events[0], id: "past-imported", title: "刚结束活动", startsAt: "2026-09-12T10:00:00+09:00", endsAt: "2026-09-12T13:00:00+09:00", status: "imported" }
  ]; s.refresh(); }); await settle(p);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  assert.equal(await p.getByRole("button", { name: /^未来活动，/ }).count(), 1);
  await press(p, "筛选活动时间"); assert.equal(await p.getByRole("button", { name: "进行中", exact: true }).innerText(), "进行中 1");
  await press(p, "进行中"); assert.equal(await p.getByRole("button", { name: /^现场活动，/ }).count(), 1);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  await press(p, "筛选活动时间"); assert.equal(await p.getByRole("button", { name: "历史", exact: true }).innerText(), "历史 2");
  await press(p, "历史"); assert.equal(await p.getByTestId("events-result-count").innerText(), "2");
  assert.equal(await p.getByRole("button", { name: /^刚结束活动，/ }).count(), 1);
  await press(p, "筛选活动时间"); await press(p, "全部时间"); assert.equal(await p.getByTestId("events-result-count").innerText(), "4");
  assert.deepEqual(await writes(p), []);
});

for (const bad of [{ startsAt: "not-a-date" }, { startsAt: " " }, { endsAt: "not-a-date" }, { endsAt: null }, { endsAt: "2026-09-11T00:00:00Z" }, { status: "garbage" }, { status: " " }]) test("public catalogue rejects malformed required temporal fields " + JSON.stringify(bad), async t => {
  const p = await open(t); await p.evaluate(bad => { const s = (window as any).fixture; Object.assign(s.events[0], bad); s.refresh(); }, bad); await settle(p);
  assert.equal(await p.getByRole("button", { name: /，/ }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "重新读取活动", exact: true }).count(), 1);
  assert.equal(await p.getByText("暂无活动", { exact: true }).count(), 0);
});

test("public list expands 8 to 16 to all, collapses, and resets pagination for every discovery input", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.events = Array.from({ length: 18 }, (_, index) => ({ ...s.events[0], id: "page:" + index, title: "产品交流 " + index, location: index < 16 ? "东京" : "大阪", venue: index < 16 ? "东京" : "大阪", tags: ["产品"] })); s.refresh(); }); await settle(p);
  const rows = p.getByRole("button", { name: /^产品交流 \d+，/ });
  assert.equal(await rows.count(), 8); assert.equal(await p.getByTestId("events-result-count").innerText(), "18");
  await press(p, "查看更多活动"); assert.equal(await rows.count(), 16);
  await press(p, "查看更多活动"); assert.equal(await rows.count(), 18);
  await press(p, "收起活动"); assert.equal(await rows.count(), 8);
  await press(p, "查看更多活动"); await p.getByPlaceholder("搜索活动、地点或主题").fill("产品"); await settle(p); assert.equal(await rows.count(), 8);
  await press(p, "查看更多活动"); await press(p, "筛选活动时间"); await press(p, "全部时间"); assert.equal(await rows.count(), 8);
  await press(p, "查看更多活动"); await press(p, "筛选活动地点"); await press(p, "东京"); assert.equal(await rows.count(), 8); assert.equal(await p.getByTestId("events-result-count").innerText(), "16");
  await press(p, "查看更多活动"); await press(p, "筛选活动主题"); await press(p, "产品"); assert.equal(await rows.count(), 8);
  await press(p, "筛选活动地点"); await press(p, "大阪"); assert.equal(await rows.count(), 2); assert.equal(await p.getByTestId("events-result-count").innerText(), "2");
  await p.getByRole("button", { name: /^产品交流 17，/ }).click(); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1).params.id), "page:17");
  assert.deepEqual(await writes(p), []);
});

for (const dimension of ["location", "topic"] as const) test("discovery keeps options beyond eight and filters records beyond the first page: " + dimension, async t => {
  const p = await open(t);
  await p.evaluate(() => {
    const s = (window as any).fixture;
    s.events = Array.from({ length: 17 }, (_, index) => ({ ...s.events[0], id: "discovery:" + index, title: "筛选交流 " + index, venue: "会场 " + String(index).padStart(2, "0"), tags: ["主题 " + String(index).padStart(2, "0")] }));
    s.refresh();
  });
  await settle(p);
  const rows = p.getByRole("button", { name: /^筛选交流 \d+，/ });
  assert.equal(await rows.count(), 8);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "17");
  await press(p, dimension === "location" ? "筛选活动地点" : "筛选活动主题");
  const prefix = dimension === "location" ? "会场" : "主题";
  assert.equal(await p.getByRole("button", { name: new RegExp("^" + prefix + " \\d+$") }).count(), 17);
  await press(p, prefix + " 08");
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  assert.equal(await p.getByRole("button", { name: /^筛选交流 8，/ }).count(), 1);
  await press(p, dimension === "location" ? "筛选活动地点" : "筛选活动主题");
  await press(p, prefix + " 16");
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  await p.getByRole("button", { name: /^筛选交流 16，/ }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [{ pathname: "/events/[id]", params: { id: "discovery:16" } }]);
  await press(p, dimension === "location" ? "筛选活动地点" : "筛选活动主题");
  await press(p, dimension === "location" ? "全部地点" : "全部主题");
  assert.equal(await rows.count(), 8);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "17");
  assert.deepEqual(await writes(p), []);
});

test("discovery can search and select a tag beyond the first three topics", async t => {
  const p = await open(t);
  await p.evaluate(() => { const s = (window as any).fixture; s.events = s.events.map((event: any, index: number) => index === 3 ? { ...event, industry: "第一行业", theme: "第二主题", tags: ["第三标签", "第四标签", "第四标签", " "] } : event); s.refresh(); });
  await settle(p);
  await p.getByPlaceholder("搜索活动、地点或主题").fill("第四标签");
  await settle(p);
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  assert.equal(await p.getByRole("button", { name: /^产品与工程圆桌，/ }).count(), 1);
  await press(p, "清空活动搜索");
  await press(p, "筛选活动主题");
  assert.equal(await p.getByRole("button", { name: "第四标签", exact: true }).count(), 1);
  await press(p, "第四标签");
  assert.equal(await p.getByTestId("events-result-count").innerText(), "1");
  assert.equal(await p.getByRole("button", { name: /^产品与工程圆桌，/ }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-cookie-2" }, { baseUrl: "https://second.example" }, { focused: false }, { mounted: false }, { signedIn: false }]) test("retained public row, operations and refresh callbacks cannot navigate or read after scope change " + JSON.stringify(patch), async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.oldRow = Object.entries(s.presses).find(([label]) => label.startsWith("周末产品交流会，"))?.[1]; s.oldCenter = s.presses["打开活动运营中心"]; s.oldRefresh = s.refresh; });
  await update(p, patch); const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldRow(); s.oldCenter(); s.oldRefresh(); }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), before);
});

test("guest users can browse public events and are not shown private recommendations or operations", async t => {
  const p = await open(t, { signedIn: false });
  assert.equal(await p.getByRole("button", { name: /^周末产品交流会，/ }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "打开活动运营中心" }).count(), 0);
  await p.getByRole("tab", { name: "推荐", exact: true }).click(); await settle(p);
  assert.equal(await p.getByRole("button", { name: "登录后查看推荐", exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path)), ["/api/events/public"]);
  await press(p, "登录后查看推荐"); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/account?next=%2Fevents");
});

for (const patch of [{ invalid: true }, { badField: true }, { badField: "tags" }, { badField: "theme" }, { badField: "stats" }, { duplicate: true }, { failure: true }]) test("invalid public catalogue remains a recoverable failure " + JSON.stringify(patch), async t => {
  const p = await open(t, patch);
  assert.equal(await p.getByRole("button", { name: /，/ }).count(), 0);
  assert.equal(await p.getByText("暂无活动", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "重新读取活动", exact: true }).count(), 1);
  await update(p, { invalid: false, badField: false, duplicate: false, failure: false }); await press(p, "重新读取活动");
  assert.equal(await p.getByRole("button", { name: /^周末产品交流会，/ }).count(), 1); assert.deepEqual(await writes(p), []);
});

test("a valid empty public catalogue is distinct from a failed read", async t => {
  const p = await open(t, { empty: true }); assert.equal(await p.getByText("暂无活动", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "重新读取活动", exact: true }).count(), 0);
});

for (const patch of [{ ready: false }, { baseReady: false }, { focused: false }]) test("public event route waits for its active read scope " + JSON.stringify(patch), async t => {
  const p = await open(t, patch); assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-cookie-2" }, { baseUrl: "https://second.example" }, { focused: false }, { mounted: false }]) test("obsolete event reads and navigation are revoked " + JSON.stringify(patch), async t => {
  const p = await open(t, { holdReads: true });
  await p.evaluate(() => { const s = (window as any).fixture; s.oldRefresh = s.refresh; });
  await update(p, patch); await p.evaluate(() => { const s = (window as any).fixture; s.oldRefresh?.(); s.reply(0, 401); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[0].signal?.aborted), true);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-cookie-2" }, { baseUrl: "https://second.example" }, { focused: false }, { tab: "all" }, { filter: "设计师" }]) test("late recommendation reads are aborted before a stale session expiry " + JSON.stringify(patch), async t => {
  const p = await open(t); await update(p, { holdReads: true }); await p.getByRole("tab", { name: "推荐", exact: true }).click(); await settle(p);
  const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.path === "/api/recommendations/events")); assert.ok(index >= 0);
  if ("tab" in patch) { await p.getByRole("tab", { name: "全部", exact: true }).click(); await settle(p); }
  else if ("filter" in patch) { await p.getByPlaceholder("搜索活动、地点或主题").fill(patch.filter); await settle(p); }
  else await update(p, patch);
  await p.evaluate(index => (window as any).fixture.reply(index, 401), index); await settle(p);
  assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, index), true);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0); assert.deepEqual(await writes(p), []);
});

for (const patch of [{ width: 320, fontScale: 1.6 }, { width: 820 }, { width: 390, dark: true }]) test("event list keeps long labels, filters and the final item reachable " + JSON.stringify(patch), async t => {
  const p = await open(t, patch);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-" + patch.width + (patch.dark ? "-dark" : "") + "-initial.png" });
  await p.evaluate(() => { const s = (window as any).fixture; s.events[0].title = "跨团队产品与工程合作伙伴年度经验交流圆桌会议"; s.refresh(); }); await settle(p);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const label = p.getByText("跨团队产品与工程合作伙伴年度经验交流圆桌会议", { exact: true });
  assert.ok(await label.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1));
  const last = p.getByRole("button", { name: /^产品与工程圆桌，/ }); await last.scrollIntoViewIfNeeded();
  const box = (await last.boundingBox())!; assert.ok(box.x >= 0 && box.x + box.width <= patch.width && box.height >= 44);
  await last.click(); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1).params.id), "event:4");
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-events-" + patch.width + (patch.dark ? "-dark" : "") + "-" + (process.env.EVENTS_QA_PASS ?? "current") + ".png" });
});

for (const fontScale of [1, 1.6, 2]) test("IORBIT brand remains a complete word and all five navigation targets fit at text scale " + fontScale, async t => {
  const p = await open(t, { width: 320, fontScale });
  const bar = p.getByRole("tablist", { name: "主导航" });
  const brand = bar.getByText("IORBIT", { exact: true });
  const metrics = await brand.evaluate(el => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight), targetWidth: el.parentElement!.getBoundingClientRect().width, targetMaxWidth: getComputedStyle(el.parentElement!).maxWidth }));
  assert.ok(metrics.height <= metrics.lineHeight + 1, "the IORBIT brand must not break across lines: " + JSON.stringify(metrics));
  const targets = await bar.getByRole("tab").all(); assert.equal(targets.length, 5);
  for (const tab of targets) {
    const box = (await tab.boundingBox())!; const label = (await tab.locator('[dir="auto"]').boundingBox())!;
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 16 && box.x + box.width <= 304);
    assert.ok(label.x >= box.x && label.x + label.width <= box.x + box.width + 0.01 && label.y + label.height <= box.y + box.height + 0.01);
  }
  await bar.getByRole("tab", { name: "IORBIT", exact: true }).click(); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/ai");
});
