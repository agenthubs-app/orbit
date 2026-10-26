import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, script: string;
const initialTask = { id: "task:edit", accountId: "actor-1", ownerUserId: "actor-1", title: "Original title", notes: "Original notes", status: "open", category: "work", priority: "normal", source: "manual", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
// Real route, Screen, theme, hooks, HTTP client and task/date decoders.
// Only native integration, session/base providers, snapshot I/O and fetch are replaced.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0, nextId = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor-1", rawUserId: "user:raw-login", taskId: "task:edit", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true, fontScale: 1,
  requests: [], pending: [], presses: {}, inputs: {}, expiries: 0, notifications: 0, permissionCalls: 0, holdReads: false,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  data(path) { return path.endsWith("/activities") ? { activities: [] } : path.startsWith("/api/reminders") ? { reminders: [] } : { task: state.task }; },
  reply(index, status = 200, data) {
    const payload = data === undefined && status !== 200 ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "Request not accepted" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data };
    state.pending[index]?.(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input));
  state.requests.push({ method: init.method, path: url.pathname, query: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const response = new Promise(resolve => state.pending[index] = resolve);
  if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index));
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
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.rawUserId } : null, cookieHeader: state.cookieHeader }; };
// Sprint 0131: the screen reads the device mirror / page copies; this harness tests the network path (no mirror).
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, workspaceId: null, records: [], refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const useSyncCoordinatorSession = () => null;
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.taskId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/tasks/" + encodeURIComponent(state.taskId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
export const useNavigation = () => ({ addListener: () => () => {}, dispatch() {} });
export const usePreventRemove = () => {};
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
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/tasks/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "task-date-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "task-dates" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-router\/react-navigation|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store|native-notifications|useRelationshipInboxBadgeCount|useSyncedCollection)$/ }, () => ({ path: "fixture", namespace: "task-dates" }));
      plugin.onLoad({ filter: /.*/, namespace: "task-dates" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl, Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export { AppState } from "fixture";
export const findNodeHandle = instance => instance ?? null;
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
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, timezoneId: String(patch.timezoneId ?? "Asia/Tokyo"), colorScheme: patch.dark ? "dark" : "light", locale: "zh-CN" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<style>html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { task: initialTask, ...patch }); await p.addScriptTag({ content: script });
  await p.getByRole("textbox", { name: "待办标题", exact: true }).waitFor(); await settle(p);
  // UX T4/T5: the dates are inline rows (日期 / 时间 switches); missing wiring fails as an assertion, not a timeout.
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).count(), 1);
  return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function fill(p: Page, label: string, value: string) { await p.getByRole("textbox", { name: label, exact: true }).fill(value); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, origin: r.origin, body: r.body }))); }
async function reply(p: Page, status = 200, taskPatch: object = {}, dataOverride?: object) {
  await p.evaluate(({ status, taskPatch, dataOverride }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method !== "GET"); const task = { ...s.task, ...s.requests[i].body.patch, updatedAt: "2026-09-13T03:00:00.000Z", ...taskPatch }; for (const key of ["plannedDate", "dueAt", "location"]) if (task[key] === null) delete task[key]; if (status === 200 && !dataOverride) s.task = task; s.reply(i, status, dataOverride ?? (status === 200 ? { task } : undefined)); }, { status, taskPatch, dataOverride }); await settle(p);
}
/** Opens the same calendar the personal schedule uses, moves to the month and confirms the day with 完成. */
async function pickDate(p: Page, day: string) {
  await press(p, "更改日期");
  const dialog = p.getByRole("dialog", { name: "日期", exact: true });
  for (let step = 0; step < 24 && !(await dialog.getByRole("button", { name: day, exact: true }).count()); step++) {
    const shown = await dialog.getByRole("button", { name: /^\d{4}-\d{2}-01$/ }).first().getAttribute("aria-label");
    await dialog.getByRole("button", { name: shown! > day ? "上个月" : "下个月", exact: true }).click(); await settle(p);
  }
  await dialog.getByRole("button", { name: day, exact: true }).click(); await dialog.getByRole("button", { name: "完成", exact: true }).click(); await settle(p);
}
async function pickTime(p: Page, time: string) {
  await press(p, "更改时间");
  const dialog = p.getByRole("dialog", { name: "时间", exact: true });
  const [hour, minute] = time.split(":");
  await dialog.getByRole("radio", { name: `HH ${hour}`, exact: true }).click(); await dialog.getByRole("radio", { name: `mm ${minute}`, exact: true }).click();
  await dialog.getByRole("button", { name: "完成", exact: true }).click(); await settle(p);
}
const dateValue = (p: Page) => p.getByRole("button", { name: "更改日期", exact: true }).innerText();
const timeValue = (p: Page) => p.getByRole("button", { name: "更改时间", exact: true }).innerText();

test("task deletion waits for confirmation, cancel leaves it intact, and confirm sends its version", async t => {
  const p = await open(t);
  await press(p, "删除待办");
  assert.equal(await p.getByText("要删除这项待办吗？", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
  await press(p, "取消");
  assert.deepEqual(await writes(p), []);
  await press(p, "删除待办");
  await press(p, "确认删除");
  const [write] = await writes(p);
  assert.equal(write.method, "DELETE");
  assert.equal(write.path, "/api/tasks/task%3Aedit");
  assert.equal(write.body.expectedUpdatedAt, initialTask.updatedAt);
  assert.ok(write.body.idempotencyKey);
});

test("the detail has no raw date fields, zone text, history or a second edit button", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } });
  for (const gone of ["YYYY-MM-DD", "HH:mm", "Asia/Tokyo", "变更历史", "取消待办", "安排日期", "截止日期", "来源", "创建于", "分类", "未完成"]) assert.equal(await p.getByText(gone, { exact: false }).count(), 0, gone);
  for (const gone of ["编辑待办", "标记完成", "编辑日期和时间"]) assert.equal(await p.getByRole("button", { name: gone, exact: true }).count(), 0, gone);
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isChecked(), true);
  assert.equal(await p.getByRole("switch", { name: "时间", exact: true }).isChecked(), false);
  assert.deepEqual(await writes(p), []);
});

test("second date deferral asks before writing and cancellation keeps the saved date", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14", deferralCount: 1 } });
  const before = await dateValue(p);
  await pickDate(p, "2026-09-16");
  assert.equal(await p.getByText("又推迟一次吗？", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
  await press(p, "取消");
  assert.deepEqual(await writes(p), []);
  assert.equal(await dateValue(p), before);
  await pickDate(p, "2026-09-16");
  await press(p, "继续延期");
  const [write] = await writes(p);
  assert.equal(write.method, "PATCH");
  assert.equal(write.body.expectedUpdatedAt, initialTask.updatedAt);
  assert.deepEqual(write.body.patch, { plannedDate: "2026-09-16" });
});

test("a picked date saves at once with version/key and rereads detail and reminders", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } });
  await pickDate(p, "2026-09-15");
  const [write] = await writes(p); assert.equal(write.method, "PATCH"); assert.equal(write.path, "/api/tasks/task%3Aedit");
  assert.deepEqual(write.body.patch, { plannedDate: "2026-09-15" }); assert.equal(write.body.action, "update"); assert.equal(write.body.expectedUpdatedAt, "2026-09-07T00:00:00.000Z"); assert.ok(write.body.idempotencyKey);
  await reply(p); await pickDate(p, "2026-09-15"); assert.equal((await writes(p)).length, 1, "the same day again is unchanged");
  const gets = await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").map((r: any) => r.path + r.query));
  assert.equal(gets.length, 4); for (const start of [0, 2]) assert.deepEqual(gets.slice(start, start + 2).sort(), ["/api/reminders?targetType=task&targetId=task%3Aedit", "/api/tasks/task%3Aedit"]);
  assert.match(await dateValue(p), /9月15日/);
  assert.deepEqual(await p.evaluate(() => [(window as any).fixture.permissionCalls, (window as any).fixture.notifications]), [0, 0]);
});

test("the time follows the device zone and the date-only switch stays timeless", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14", dueAt: "2026-09-14T00:00:00Z" } });
  assert.equal(await timeValue(p), "09:00");
  await pickTime(p, "00:30");
  assert.deepEqual((await writes(p))[0].body.patch, { dueAt: "2026-09-13T15:30:00.000Z" }); await reply(p);
  assert.equal(await timeValue(p), "00:30");
  await p.getByRole("switch", { name: "时间", exact: true }).click(); await settle(p);
  assert.deepEqual((await writes(p))[1].body.patch, { dueAt: null }); await reply(p);
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isChecked(), true);
  assert.equal(await p.getByRole("button", { name: "更改时间", exact: true }).count(), 0);
});

test("turning the time on keeps the chosen day and adds the next full hour", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-15" } });
  await p.getByRole("switch", { name: "时间", exact: true }).click(); await settle(p);
  const [write] = await writes(p);
  assert.deepEqual(Object.keys(write.body.patch), ["dueAt"]);
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(write.body.patch.dueAt));
  assert.match(local, /^2026-09-15, \d{2}:00$/);
});

test("accepted date updates the visible date while authoritative rereads are still pending", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14", dueAt: "2026-09-14T00:00:00Z" } });
  await update(p, { holdReads: true });
  await pickDate(p, "2026-09-16"); await reply(p);
  assert.match(await dateValue(p), /9月16日/);
  assert.equal(await p.getByText(/9月14日/).count(), 0);
});

for (const status of [503, 409]) test(`${status} retains the date, retries with the same key, and a new day gets a new key`, async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15"); await reply(p, status);
  await p.getByRole("alert").waitFor(); assert.match(await dateValue(p), /9月15日/);
  await pickDate(p, "2026-09-15"); await reply(p, status); let requests = await writes(p); assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey);
  await pickDate(p, "2026-09-16"); requests = await writes(p); assert.notEqual(requests[1].body.idempotencyKey, requests[2].body.idempotencyKey);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").length), 2);
});

for (const bad of ["missing", "owner", "wrong-value", "non-2xx"]) test(`${bad} receipt cannot acknowledge the date or discard its retry key`, async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15");
  await reply(p, bad === "non-2xx" ? 500 : 200, {}, bad === "missing" ? {} : { task: { ...initialTask, plannedDate: bad === "wrong-value" ? "2026-09-16" : "2026-09-15", ownerUserId: bad === "owner" ? "actor-2" : "actor-1", updatedAt: "2026-09-13T03:00:00Z" } });
  await p.getByRole("alert").waitFor(); await pickDate(p, "2026-09-15"); const requests = await writes(p);
  assert.equal(requests.length, 2); assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey); assert.equal(requests[1].body.expectedUpdatedAt, initialTask.updatedAt);
  assert.match(await dateValue(p), /9月15日/);
});

test("refresh preserves an unsaved date and explicit discard adopts every latest field", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15"); await reply(p, 503);
  await update(p, { task: { ...initialTask, title: "Remote title", plannedDate: "2026-09-17", updatedAt: "2026-09-13T01:00:00Z" } }); await refresh(p);
  assert.match(await dateValue(p), /9月15日/);
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isDisabled(), true);
  await press(p, "放弃草稿并载入最新内容"); assert.match(await dateValue(p), /9月17日/);
  assert.equal(await p.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Remote title"); assert.equal((await writes(p)).length, 1);
});

test("a date save never saves or resets unsaved title and notes", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } });
  await p.evaluate(() => { const s = (window as any).fixture; s.inputs["待办标题"].onChangeText("Local title"); s.inputs["备注"].onChangeText("Local notes"); }); await settle(p);
  await pickDate(p, "2026-09-15"); assert.deepEqual((await writes(p))[0].body.patch, { plannedDate: "2026-09-15" }); await reply(p);
  assert.equal(await p.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Local title"); assert.equal(await p.getByRole("textbox", { name: "备注", exact: true }).inputValue(), "Local notes");
});

test("title save preserves an unsaved date and advances its expected version", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15"); await reply(p, 503);
  await fill(p, "待办标题", "Local title"); await p.getByRole("textbox", { name: "待办标题", exact: true }).blur(); await settle(p); await reply(p);
  assert.match(await dateValue(p), /9月15日/); await pickDate(p, "2026-09-15");
  const requests = await writes(p); assert.deepEqual(requests[2].body.patch, { plannedDate: "2026-09-15" }); assert.equal(requests[2].body.expectedUpdatedAt, "2026-09-13T03:00:00.000Z");
});

test("a pending date save is single flight and locks the date controls", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15");
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("button", { name: "更改日期", exact: true }).isDisabled(), true);
  await reply(p); assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isDisabled(), false);
});

test("late date acknowledgement does not conceal a newer revision already read", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15");
  await update(p, { task: { ...initialTask, title: "Newer title", plannedDate: "2026-09-17", updatedAt: "2026-09-13T04:00:00Z" } }); await refresh(p);
  await reply(p, 200, {}, { task: { ...initialTask, plannedDate: "2026-09-15", updatedAt: "2026-09-13T03:00:00Z" } });
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isDisabled(), true);
  await press(p, "放弃草稿并载入最新内容"); assert.match(await dateValue(p), /9月17日/);
});

test("cancelled task cannot change its dates and says why", async t => {
  const p = await open(t, { task: { ...initialTask, status: "cancelled", plannedDate: "2026-09-14" } });
  assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("button", { name: "更改日期", exact: true }).isDisabled(), true);
  await p.getByText("已取消的待办不能修改日期。", { exact: true }).waitFor(); assert.deepEqual(await writes(p), []);
});

for (const change of ["actor", "server", "task", "unmount", "ready"]) test(`${change} change revokes a pending write and late session expiry`, async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } }); await pickDate(p, "2026-09-15");
  const patch = change === "actor" ? { actor: "actor-2", task: { ...initialTask, accountId: "actor-2", ownerUserId: "actor-2", title: "Next owner" } }
    : change === "server" ? { baseUrl: "https://next.example", task: { ...initialTask, title: "Next server" } }
    : change === "task" ? { taskId: "task:next", task: { ...initialTask, id: "task:next", title: "Next task" } }
    : change === "unmount" ? { mounted: false } : { baseReady: false };
  await update(p, patch); await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findIndex((r: any) => r.method === "PATCH"); s.reply(i, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "PATCH").signal?.aborted), true);
  if (!["unmount", "ready"].includes(change)) { await p.getByRole("textbox", { name: "待办标题", exact: true }).waitFor(); assert.equal(await p.getByRole("switch", { name: "日期", exact: true }).isChecked(), false); }
});

for (const variant of [{ name: "normal", width: 390 }, { name: "narrow-large", width: 320, fontScale: 2 }, { name: "dark", width: 390, dark: true }]) test(`${variant.name} date rows remain reachable, legible and at least 44 points`, async t => {
  const p = await open(t, { ...variant, task: { ...initialTask, plannedDate: "2026-09-14", dueAt: "2026-09-14T00:30:00Z", location: "Tokyo" } });
  for (const name of ["更改日期", "更改时间", "提醒"]) { const button = p.getByRole("button", { name, exact: true }); await button.scrollIntoViewIfNeeded(); const b = (await button.boundingBox())!; assert.ok(b.x >= 0 && b.x + b.width <= variant.width, name); }
  for (const name of ["提醒", "删除待办"]) { const b = (await p.getByRole("button", { name, exact: true }).boundingBox())!; assert.ok(b.height >= 44, name); }
  const location = (await p.getByRole("textbox", { name: "地点", exact: true }).boundingBox())!; assert.ok(location.height >= 44);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(await p.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1).map(n => n.textContent)), []);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: `/tmp/orbit-task-dates-${variant.name}-20261026.png`, fullPage: true });
  assert.deepEqual(await writes(p), []);
});

test("Los Angeles device time saves its own absolute instant", async t => {
  const p = await open(t, { timezoneId: "America/Los_Angeles", task: { ...initialTask, plannedDate: "2026-09-15", dueAt: "2026-09-15T07:00:00Z" } });
  await pickTime(p, "00:30");
  assert.deepEqual((await writes(p))[0].body.patch, { dueAt: "2026-09-15T07:30:00.000Z" });
});

test("foreground zone change keeps an unsaved time and saves it under the original zone", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-15", dueAt: "2026-09-15T00:00:00Z" } });
  await pickTime(p, "00:30"); await reply(p, 503);
  await p.evaluate(() => (window as any).fixture.setDeviceZone("America/Los_Angeles")); await settle(p);
  assert.equal(await timeValue(p), "00:30");
  assert.ok(await p.getByText(/此草稿按原时区 Asia\/Tokyo 保存/).count());
  await pickTime(p, "00:30");
  const requests = await writes(p); assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body.patch, { dueAt: "2026-09-14T15:30:00.000Z" });
});

test("a clean editor follows the foreground zone without changing the saved instant", async t => {
  const p = await open(t, { task: { ...initialTask, dueAt: "2026-09-14T00:30:42.123Z" } });
  assert.equal(await timeValue(p), "09:30");
  await p.evaluate(() => (window as any).fixture.setDeviceZone("America/Los_Angeles")); await settle(p);
  assert.match(await dateValue(p), /9月13日/);
  assert.equal(await timeValue(p), "17:30");
  assert.deepEqual(await writes(p), []);
});

test("location saves when the field is left while an unsaved title stays a draft", async t => {
  const p = await open(t); await p.evaluate(() => (window as any).fixture.inputs["待办标题"].onChangeText("Local title")); await settle(p);
  await fill(p, "地点", "Kyoto station"); await p.getByRole("textbox", { name: "地点", exact: true }).blur(); await settle(p);
  assert.deepEqual((await writes(p))[0].body.patch, { location: "Kyoto station" });
  await reply(p); assert.equal(await p.getByRole("textbox", { name: "地点", exact: true }).inputValue(), "Kyoto station");
  assert.equal(await p.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Local title");
});

test("switching the date off and clearing the location remove the saved fields", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14", dueAt: "2026-09-14T00:30:00Z", location: "Tokyo" } });
  await p.getByRole("switch", { name: "日期", exact: true }).click(); await settle(p);
  assert.deepEqual((await writes(p))[0].body.patch, { plannedDate: null, dueAt: null }); await reply(p);
  assert.equal(await p.getByRole("switch", { name: "时间", exact: true }).isChecked(), false);
  await fill(p, "地点", ""); await p.getByRole("textbox", { name: "地点", exact: true }).blur(); await settle(p);
  assert.deepEqual((await writes(p))[1].body.patch, { location: null }); await reply(p);
  assert.equal(await p.getByRole("textbox", { name: "地点", exact: true }).inputValue(), "");
});
