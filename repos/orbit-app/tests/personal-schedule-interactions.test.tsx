import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, script: string;
const initialItem = { id: "personal:edit", sourceId: "personal:edit", accountId: "actor-1", ownerUserId: "actor-1", title: "Original title", kind: "personal", category: "personal", state: "upcoming", startsAt: "2026-09-17T00:30:00Z", endsAt: "2026-09-17T01:30:00Z", location: "Tokyo", createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z" };
// Real route, Screen, theme, hooks, HTTP client and task/date decoders.
// Only native integration, session/base providers, snapshot I/O and fetch are replaced.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let revision = 0, nextId = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor-1", rawUserId: "user:raw-login", taskId: "personal:edit", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true, fontScale: 1,
  requests: [], pending: [], presses: {}, inputs: {}, expiries: 0, notifications: 0, permissionCalls: 0, holdReads: false, openedUrls: [],
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  data(path, query) { if (path.startsWith("/api/contacts")) return path.endsWith("/search") ? { contacts: state.contact ? [state.contact] : [] } : { contact: state.contact }; if (path.startsWith("/api/notes")) return path === "/api/notes" ? { notes: state.note ? [state.note] : [], total: state.note ? 1 : 0 } : { note: state.note }; return state.list ? { scheduleItems: query === "?scope=personal" ? state.listItems ?? [state.item] : [{ id: "legacy:personal", sourceId: "legacy:personal", kind: "personal", category: "personal", title: "Legacy", startsAt: state.item.startsAt, state: "upcoming" }] } : { scheduleItem: state.item }; },
  reply(index, status = 200, data) {
    const payload = data === undefined && status !== 200 ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "Request not accepted" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path, state.requests[index].query) : data };
    state.pending[index]?.(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
// Model only the platform unit-formatting fault; dates, numbers and real translators stay real.
if (state.unitFormatAsSeconds) {
  const OriginalNumberFormat = Intl.NumberFormat;
  Intl.NumberFormat = new Proxy(OriginalNumberFormat, { construct(Target, args, newTarget) {
    const [language, options] = args;
    if (options?.style === "unit" && options?.unit === "minute") {
      const seconds = new OriginalNumberFormat(language, { ...options, unit: "second" });
      return { format: minutes => seconds.format(minutes * 60) };
    }
    return Reflect.construct(Target, args, newTarget);
  } });
}
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input));
  state.requests.push({ method: init.method, path: url.pathname, query: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const response = new Promise(resolve => state.pending[index] = resolve);
  if ((init.method === "GET" || url.pathname === "/api/contacts/search") && !state.holdReads) queueMicrotask(() => state.reply(index));
  return response;
};
const foregroundListeners = new Set();
export const AppState = { currentState: "active", addEventListener: (_name, fn) => { foregroundListeners.add(fn); return { remove: () => foregroundListeners.delete(fn) }; } };
const OriginalDateTimeFormat = Intl.DateTimeFormat;
state.setDeviceZone = zone => {
  Intl.DateTimeFormat = function(locale, options) {
    if (options?.timeZone) return new OriginalDateTimeFormat(locale, options);
    if (zone === "invalid") throw new Error("Device zone unavailable");
    return new OriginalDateTimeFormat(locale, { ...options, timeZone: zone });
  };
  foregroundListeners.forEach(fn => fn("active"));
};
export const useFixture = () => { observe(); return state; };
export const useOrbitLocale = () => { observe(); const language = state.language ?? "zh"; return React.useMemo(() => ({ language, t: createTranslator(language) }), [language]); };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.rawUserId } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.taskId, focus: state.focus, saved: state.saved }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const useFocusEffect = callback => React.useEffect(callback, [callback]);
export const usePathname = () => "/tasks/" + encodeURIComponent(state.taskId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(path) { state.navigation = path; }, replace(path) { state.navigation = path; } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const useRelationshipInboxBadgeCount = () => 0;
export const notifyReminderPlansChanged = () => { state.notifications++; };
export const requestNotificationPermission = async () => { state.permissionCalls++; return "denied"; };
export const randomUUID = () => "task-date-fixture-" + ++nextId;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes("top") && { paddingTop: 48 }]} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/schedule/personal/[id]"; import EditRoute from "./app/schedule/personal/[id]/edit"; import { PersonalScheduleList } from "./src/screens/schedule/PersonalScheduleList"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? s.list ? <PersonalScheduleList /> : s.detail ? <Route /> : <EditRoute /> : null; } createRoot(document.getElementById("root")).render(window.initialFixture?.strict ? <React.StrictMode><App /></React.StrictMode> : <App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "task-date-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "task-dates" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store|native-notifications|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "task-dates" }));
      plugin.onLoad({ filter: /.*/, namespace: "task-dates" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl, Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export { AppState } from "fixture";
export const Linking = { openURL: async url => { window.fixture.openedUrls.push(url); } };
export const useWindowDimensions = () => ({ ...realDimensions(), fontScale: useFixture().fontScale });
const scaled = (style, scale) => { const s = StyleSheet.flatten(style) || {}; return [style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]; };
export const Text = props => <RealText {...props} style={scaled(props.style, useFixture().fontScale)} />;
export const TextInput = React.forwardRef((props, ref) => { window.fixture.inputs[props.accessibilityLabel] = props; return <RealInput {...props} ref={ref} style={scaled(props.style, useFixture().fontScale)} />; });
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", locale: "zh-CN" }); p.setDefaultTimeout(1800);
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message)); t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { item: initialItem, ...patch }); await p.addScriptTag({ content: script });
  if (patch.list) await p.getByRole("button", { name: "新建个人日程", exact: true }).waitFor();
  else if (patch.detail) await p.getByText("Original title", { exact: true }).waitFor();
  else await p.getByRole("textbox", { name: patch.language === "en" ? "Schedule title" : patch.language === "ja" ? "予定名" : "日程标题", exact: true }).waitFor();
  await settle(p); return p;
}

test("personal list reads owned collection, opens detail and distinguishes failure, recovery and real empty", async t => {
  const p = await open(t, { list: true });
  await p.getByText("Original title", { exact: true }).waitFor();
  assert.equal(await p.getByText("个人日程加载失败", { exact: true }).count(), 0);
  await p.getByRole("button", { name: /Original title/ }).click();
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit");
  await p.evaluate(() => (window as any).fixture.update({ holdReads: true }));
  await p.getByRole("button", { name: "刷新个人日程", exact: true }).click();
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.length - 1, 503); });
  await p.getByText("个人日程加载失败", { exact: true }).waitFor();
  assert.equal(await p.getByText("暂无个人日程", { exact: true }).count(), 0);
  await p.evaluate(() => (window as any).fixture.update({ holdReads: false, listItems: [] }));
  await p.getByRole("button", { name: "刷新个人日程", exact: true }).click();
  await p.getByText("暂无个人日程", { exact: true }).waitFor();
  assert.equal(await p.getByText("个人日程加载失败", { exact: true }).count(), 0);
});
async function fill(p: Page, label: string, value: string) { await p.getByRole("textbox", { name: label, exact: true }).fill(value); await settle(p); }
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET" && r.path.startsWith("/api/schedule-items")).map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }

for (const [language, minutes, endsAt, label] of [
  ["zh", 30, "2026-09-17T01:00:00Z", "30 分钟"], ["zh", 60, "2026-09-17T01:30:00Z", "60 分钟"], ["zh", 120, "2026-09-17T02:30:00Z", "120 分钟"],
  ["ja", 30, "2026-09-17T01:00:00Z", "30分"], ["ja", 60, "2026-09-17T01:30:00Z", "60分"], ["ja", 120, "2026-09-17T02:30:00Z", "120分"],
  ["en", 30, "2026-09-17T01:00:00Z", "30 min"], ["en", 60, "2026-09-17T01:30:00Z", "60 min"], ["en", 120, "2026-09-17T02:30:00Z", "120 min"],
] as const) {
  test(`detail keeps ${minutes} minutes in ${language} under platform unit fault`, async t => {
    const item = { ...initialItem, endsAt, timeZone: "Asia/Tokyo" };
    for (const unitFormatAsSeconds of [false, true]) {
      const p = await open(t, { detail: true, language, item, unitFormatAsSeconds });
      const hint = p.getByText(/^2026-09-17 · .* · Asia\/Tokyo$/);
      assert.equal(await hint.innerText(), `2026-09-17 · ${label} · Asia/Tokyo`);
      assert.deepEqual(await writes(p), []);
      assert.deepEqual(await p.evaluate(() => (window as any).fixture.item), item);
    }
  });
}

for (const [language, label] of [["zh", "结束时间未设置"], ["ja", "終了時刻未設定"], ["en", "End time not set"]] as const) {
  test(`detail keeps missing end in ${language}`, async t => {
    const { endsAt: _end, ...item } = { ...initialItem, timeZone: "Asia/Tokyo" };
    const p = await open(t, { detail: true, language, item, unitFormatAsSeconds: true });
    assert.equal(await p.getByText(/^2026-09-17 · .* · Asia\/Tokyo$/).innerText(), `2026-09-17 · ${label} · Asia/Tokyo`);
    assert.deepEqual(await writes(p), []);
  });
}

test("detail preserves fractional minutes rather than rounding stored seconds", async t => {
  const item = { ...initialItem, startsAt: "2026-09-17T00:30:42Z", endsAt: "2026-09-17T01:01:12Z", timeZone: "Asia/Tokyo" };
  const p = await open(t, { detail: true, item, unitFormatAsSeconds: true });
  assert.equal(await p.getByText(/^2026-09-17 · .* · Asia\/Tokyo$/).innerText(), "2026-09-17 · 30.5 分钟 · Asia/Tokyo");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.item), item);
  assert.deepEqual(await writes(p), []);
});

for (const [endsAt, expected] of [["2026-09-17T15:00:00Z", "2026-09-17 · 1440 分钟 · Asia/Tokyo"], ["2026-09-18T15:00:00Z", "2026-09-17 · 2026-09-18 · 2880 分钟 · Asia/Tokyo"]] as const) {
  test(`all-day detail renders only occupied dates through the real route: ${endsAt}`, async t => {
    const item = { ...initialItem, startsAt: "2026-09-16T15:00:00Z", endsAt, allDay: true, timeZone: "Asia/Tokyo" };
    const p = await open(t, { detail: true, item, unitFormatAsSeconds: true });
    assert.equal(await p.getByText(/^2026-09-17 · .* · Asia\/Tokyo$/).innerText(), expected);
    assert.deepEqual(await writes(p), []);
    assert.deepEqual(await p.evaluate(() => (window as any).fixture.item), item);
  });
}
async function reply(p: Page, status = 200, override?: object) {
  await p.evaluate(({ status, override }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method !== "GET" && r.path.startsWith("/api/schedule-items")); const r = s.requests[i]; const item = { ...s.item, ...(r.body.patch ?? r.body), updatedAt: "2026-09-15T00:00:00Z" }; delete item.idempotencyKey; for (const key of ["endsAt", "location"]) if (item[key] === null) delete item[key]; if (r.method === "DELETE") item.state = "cancelled"; if (status === 200 && !override) s.item = item; s.reply(i, status, override ?? (status === 200 ? { scheduleItem: item, ...(r.method === "DELETE" ? { deleted: true } : {}) } : undefined)); }, { status, override }); await settle(p);
}

test("create without a contact, failure retry and reopen use one server record", async t => {
  const p = await open(t, { taskId: "" }); await fill(p, "日程标题", "Solo review"); await press(p, "调整日期和时间"); await fill(p, "开始日期", "2026-09-17"); await fill(p, "开始时间", "09:30"); await fill(p, "日程地点", "Home");
  await press(p, "保存日程"); await reply(p, 503); assert.equal(await p.getByRole("textbox", { name: "日程标题" }).inputValue(), "Solo review");
  await press(p, "保存日程"); const w = await writes(p); assert.equal(w.length, 2); assert.equal(w[0].method, "POST"); assert.equal(w[0].body.idempotencyKey, w[1].body.idempotencyKey);
  assert.equal(w[0].body.startsAt, "2026-09-17T00:30:00.000Z"); assert.equal(w[0].body.contactId, undefined); await reply(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit?saved=2026-09-15T00%3A00%3A00Z");
  await p.evaluate(() => (window as any).fixture.update({ taskId: "personal:edit" })); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "日程地点" }).inputValue(), "Home");
});
test("clear optional fields, retain conflicting draft, explicitly reload and confirm deletion", async t => {
  const p = await open(t); await press(p, "调整日期和时间"); await fill(p, "结束时间", ""); await fill(p, "日程地点", ""); await press(p, "保存日程");
  assert.deepEqual((await writes(p))[0].body.patch, { endsAt: null, location: null }); await reply(p); assert.equal(await p.getByRole("textbox", { name: "日程地点" }).inputValue(), "");
  await fill(p, "日程标题", "Local draft"); await press(p, "保存日程"); await reply(p, 409);
  await p.evaluate(() => { const s = (window as any).fixture; s.item = { ...s.item, title: "Remote", updatedAt: "2026-09-16T00:00:00Z" }; s.refresh(); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "日程标题" }).inputValue(), "Local draft"); assert.equal(await p.getByRole("button", { name: "保存日程", exact: true }).isDisabled(), true);
  await press(p, "放弃草稿并载入最新内容"); assert.equal(await p.getByRole("textbox", { name: "日程标题" }).inputValue(), "Remote");
  await press(p, "删除个人日程"); assert.equal((await writes(p)).length, 2); await press(p, "确认删除个人日程");
  assert.equal((await writes(p))[2].method, "DELETE");
  await reply(p, 200, { scheduleItem: { ...initialItem, state: "cancelled", updatedAt: "2026-09-17T00:00:00Z" }, deleted: true }); assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule");
});
for (const wrong of ["owner", "id", "field"]) test(`${wrong} receipt retains draft and retry intent`, async t => {
  const p = await open(t); await fill(p, "日程地点", "Local"); await press(p, "保存日程");
  await reply(p, 200, { scheduleItem: { ...initialItem, updatedAt: "2026-09-15T00:00:00Z", location: wrong === "field" ? "Wrong" : "Local", ownerUserId: wrong === "owner" ? "other" : "actor-1", id: wrong === "id" ? "personal:other" : initialItem.id } });
  await press(p, "保存日程"); const w = await writes(p); assert.equal(w.length, 2); assert.equal(w[0].body.idempotencyKey, w[1].body.idempotencyKey);
});
test("account replacement cannot accept a late old save", async t => {
  const p = await open(t); await fill(p, "日程地点", "Old draft"); await press(p, "保存日程");
  await p.evaluate(() => { const s = (window as any).fixture; s.update({ actor: "actor-2", item: { ...s.item, accountId: "actor-2", ownerUserId: "actor-2", title: "New account" } }); }); await settle(p);
  await reply(p, 200, { scheduleItem: { ...initialItem, location: "Old draft", updatedAt: "2026-09-15T00:00:00Z" } });
  assert.equal(await p.getByRole("textbox", { name: "日程标题" }).inputValue(), "New account"); assert.equal(await p.evaluate(() => (window as any).fixture.navigation), undefined);
});

test("personal editor effect replay retains an active read and save scope", async t => {
  const p = await open(t, { strict: true });
  await fill(p, "日程地点", "After replay"); await press(p, "保存日程"); await reply(p);
  assert.equal(await p.getByRole("textbox", { name: "日程地点" }).inputValue(), "After replay");
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.getByRole("alert").count(), 0);
});

test("merged time block shortcuts and both saves share one in-flight mutation", async t => {
  const p = await open(t, { taskId: "" });
  await fill(p, "日程标题", "Time block");
  await p.getByRole("button", { name: "调整日期和时间", exact: true }).click();
  await fill(p, "开始日期", "2026-09-17"); await fill(p, "开始时间", "23:45");
  await press(p, "30分钟");
  await p.getByText("00:15", { exact: true }).waitFor();
  await p.getByRole("button", { name: "调整日期和时间", exact: true }).click(); await settle(p);
  const saveBox = await p.getByRole("button", { name: "保存日程", exact: true }).boundingBox();
  assert.ok(saveBox && saveBox.y >= 0 && saveBox.y + saveBox.height <= 844, "bottom save remains visible at the reference viewport");
  await p.screenshot({ path: "../../build/harness-state/evidence/sprint-0054/run-01/app-editor.png", fullPage: true });
  await press(p, "保存日程");
  assert.equal(await p.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  assert.equal((await writes(p)).length, 1);
  assert.equal((await writes(p))[0].body.endsAt, "2026-09-17T15:15:00.000Z");
});

test("personal destination reads a standalone detail with edit and reschedule but no mutation on open", async t => {
  const p = await open(t, { detail: true });
  assert.equal(await p.getByRole("textbox").count(), 0);
  await p.getByText("个人日程 · 仅自己可见", { exact: true }).waitFor();
  await p.screenshot({ path: "../../build/harness-state/evidence/sprint-0054/run-01/app-detail.png", fullPage: true });
  assert.equal((await writes(p)).length, 0);
  await press(p, "编辑");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit/edit");
  await press(p, "改期");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit/edit?focus=time");
  assert.equal((await writes(p)).length, 0);
});

test("save waits for independent authenticated GET before navigating and preserves draft on failed readback", async t => {
  const p = await open(t, { taskId: "", holdReads: true });
  await fill(p, "日程标题", "Readback gate"); await press(p, "调整日期和时间");
  await fill(p, "开始日期", "2026-09-17"); await fill(p, "开始时间", "09:30"); await press(p, "保存日程"); await reply(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), undefined);
  const requests = await p.evaluate(() => (window as any).fixture.requests.map((r: any) => [r.method, r.path]));
  assert.deepEqual(requests, [["POST", "/api/schedule-items"], ["GET", "/api/schedule-items/personal%3Aedit"]]);
  await p.evaluate(() => (window as any).fixture.reply(1, 503)); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "日程标题" }).inputValue(), "Readback gate");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), undefined);
});

test("private note selection saves exact IDs and details refuse revoked note contents", async t => {
  const note = { id: "note:owned", accountId: "actor-1", ownerUserId: "actor-1", title: "Saved note", body: "Private body", contactIds: [], manualContactIds: [], mentions: [], eventIds: [], version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  const p = await open(t, { note });
  await press(p, "关联笔记");
  await p.getByRole("textbox", { name: "搜索笔记", exact: true }).fill("Saved");
  await p.getByRole("checkbox", { name: "Saved note", exact: true }).click(); await settle(p);
  await press(p, "保存日程");
  assert.deepEqual((await writes(p))[0].body.patch.noteIds, ["note:owned"]);
  await reply(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.update({ detail: true, note: { ...s.note, ownerUserId: "other" } }); });
  await p.getByText("关联对象不可用，请移除或重试", { exact: true }).waitFor();
  assert.equal(await p.getByText("Private body", { exact: true }).count(), 0);
});

test("personal contact selection uses bounded formal search and refuses unavailable cached identities", async t => {
  const contact = { id: "contact:owned", displayName: "Owned contact", role: "Engineer", organization: "Company", status: "active", source: { type: "manual", label: "Manual" }, evidence: [], value: { score: 50, valueTypes: [], rationale: "", evidenceIds: [] } };
  const p = await open(t, { contact });
  await press(p, "关联人脉"); await p.getByRole("textbox", { name: "搜索相关人脉", exact: true }).fill("Owned");
  await p.getByRole("checkbox", { name: "Owned contact", exact: true }).click(); await settle(p);
  const search = await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.path === "/api/contacts/search"));
  assert.deepEqual(search.body, { query: "Owned", limit: 20 });
  await press(p, "保存日程"); assert.deepEqual((await writes(p))[0].body.patch.contactIds, ["contact:owned"]); await reply(p);
  await p.evaluate(() => (window as any).fixture.update({ detail: true, contact: null }));
  await p.getByText("关联对象不可用，请移除或重试", { exact: true }).waitFor();
  assert.equal(await p.getByText("Owned contact", { exact: true }).count(), 0);
});

test("reschedule focus opens time editing and permits explicit cross-day end dates", async t => {
  const p = await open(t, { focus: "time" });
  await fill(p, "结束日期", "2026-09-18"); await fill(p, "结束时间", "00:15"); await press(p, "保存日程");
  assert.equal((await writes(p))[0].body.patch.endsAt, "2026-09-17T15:15:00.000Z");
});

test("cancel uses the detail fallback and dirty cancellation requires visible confirmation", async t => {
  const p = await open(t); await press(p, "取消");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit");
  await p.evaluate(() => delete (window as any).fixture.navigation);
  await fill(p, "日程标题", "Unsaved title"); await press(p, "取消");
  await p.getByText("有未保存的修改，确认放弃？", { exact: true }).waitFor();
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), undefined);
  await p.getByRole("button", { name: "取消", exact: true }).last().click(); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit"); assert.equal((await writes(p)).length, 0);
});

test("English and Japanese cancellation has a localized accessible name and exits without writing", async t => {
  for (const [language, cancel, save] of [["en", "Cancel", "Save"], ["ja", "キャンセル", "保存"]]) {
    const p = await open(t, { language });
    assert.equal(await p.getByRole("button", { name: save, exact: true }).count(), 1);
    await press(p, cancel!);
    assert.equal(await p.evaluate(() => (window as any).fixture.navigation), "/schedule/personal/personal%3Aedit");
    assert.equal((await writes(p)).length, 0);
  }
});

test("detail exposes a safe online link only on user action and hides an invalid refreshed URL", async t => {
  const p = await open(t, { detail: true, item: { ...initialItem, meetingMethod: "video", meetingUrl: "https://meet.example.test/room" } });
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.openedUrls), []);
  await press(p, "进入会议"); assert.deepEqual(await p.evaluate(() => (window as any).fixture.openedUrls), ["https://meet.example.test/room"]);
  await p.evaluate(() => { const s = (window as any).fixture; s.item = { ...s.item, meetingUrl: "javascript:alert(1)" }; s.refresh(); });
  await p.getByRole("alert").waitFor(); assert.equal(await p.getByRole("button", { name: "进入会议", exact: true }).count(), 0);
  assert.equal((await writes(p)).length, 0);
});

test("detail saved notice requires the independently read current version", async t => {
  const p = await open(t, { detail: true, saved: initialItem.updatedAt });
  assert.equal(await p.getByText("个人日程已保存", { exact: true }).count(), 1);
  await p.evaluate(() => (window as any).fixture.update({ saved: "2020-01-01T00:00:00Z" })); await settle(p);
  assert.equal(await p.getByText("个人日程已保存", { exact: true }).count(), 0);
});
