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
  actor: "actor-1", taskId: "task:edit", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true, fontScale: 1,
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
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.taskId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/tasks/" + encodeURIComponent(state.taskId);
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
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
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "task-date-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "task-dates" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store|native-notifications|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "task-dates" }));
      plugin.onLoad({ filter: /.*/, namespace: "task-dates" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl, Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
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
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}, settings = true) {
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, timezoneId: String(patch.timezoneId ?? "America/Los_Angeles"), colorScheme: patch.dark ? "dark" : "light" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<style>html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { task: initialTask, ...patch }); await p.addScriptTag({ content: script });
  await p.getByRole("textbox", { name: "待办标题", exact: true }).waitFor(); await settle(p);
  // Missing wiring fails immediately as an assertion, not a timeout/bundle error.
  assert.equal(await p.getByRole("button", { name: "编辑日期和时间", exact: true }).count(), 1);
  if (settings) await press(p, "编辑日期和时间");
  return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function fill(p: Page, label: string, value: string) { await p.getByRole("textbox", { name: label, exact: true }).fill(value); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, origin: r.origin, body: r.body }))); }
async function reply(p: Page, status = 200, taskPatch: object = {}, dataOverride?: object) {
  await p.evaluate(({ status, taskPatch, dataOverride }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method !== "GET"); const task = { ...s.task, ...s.requests[i].body.patch, updatedAt: "2026-09-13T03:00:00.000Z", ...taskPatch }; if (status === 200 && !dataOverride) s.task = task; s.reply(i, status, dataOverride ?? (status === 200 ? { task } : undefined)); }, { status, taskPatch, dataOverride }); await settle(p);
}

test("date editor saves only changed dates with version/key and rereads detail, history and reminders", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  assert.deepEqual(await writes(p), []); await press(p, "保存日期和时间");
  const [write] = await writes(p); assert.equal(write.method, "PATCH"); assert.equal(write.path, "/api/tasks/task%3Aedit");
  assert.deepEqual(write.body.patch, { plannedDate: "2026-09-15" }); assert.equal(write.body.action, "update"); assert.equal(write.body.expectedUpdatedAt, "2026-09-07T00:00:00.000Z"); assert.ok(write.body.idempotencyKey);
  await reply(p); await press(p, "保存日期和时间"); assert.equal((await writes(p)).length, 1);
  const gets = await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").map((r: any) => r.path + r.query));
  assert.equal(gets.length, 6); for (const start of [0, 3]) assert.deepEqual(gets.slice(start, start + 3).sort(), ["/api/reminders?targetType=task&targetId=task%3Aedit", "/api/tasks/task%3Aedit", "/api/tasks/task%3Aedit/activities"]);
  assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15");
  assert.deepEqual(await p.evaluate(() => [(window as any).fixture.permissionCalls, (window as any).fixture.notifications]), [0, 0]);
});

test("deadline uses Tokyo despite browser timezone and planned-only edits remain timeless", async t => {
  const p = await open(t); await fill(p, "截止日期", "2026-09-15"); await fill(p, "截止时间（东京）", "00:30"); await press(p, "保存日期和时间");
  assert.deepEqual((await writes(p))[0].body.patch, { dueAt: "2026-09-14T15:30:00.000Z" }); await reply(p);
  assert.equal(await p.getByRole("textbox", { name: "截止时间（东京）", exact: true }).inputValue(), "00:30");
});

test("accepted date updates both visible labels while authoritative rereads are still pending", async t => {
  const p = await open(t, { task: { ...initialTask, dueAt: "2026-09-14T00:00:00Z" } });
  await p.clock.install({ time: new Date("2026-09-13T00:00:00Z") });
  await fill(p, "截止日期", "2026-09-16"); await update(p, { holdReads: true });
  await press(p, "保存日期和时间"); await reply(p); await press(p, "关闭待办设置");
  assert.equal(await p.getByText(/9月16日/).count(), 2, "badge and metadata must agree with the acknowledged date even before GET completes");
  assert.equal(await p.getByText(/9月14日/).count(), 0);
});

for (const status of [503, 409]) test(`${status} retains date draft, retries with same key, and new input gets a new key`, async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15"); await press(p, "保存日期和时间"); await reply(p, status);
  await p.getByRole("alert").waitFor(); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15");
  await press(p, "保存日期和时间"); await reply(p, status); let requests = await writes(p); assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey);
  await fill(p, "安排日期", "2026-09-16"); await press(p, "保存日期和时间"); requests = await writes(p); assert.notEqual(requests[1].body.idempotencyKey, requests[2].body.idempotencyKey);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").length), 3);
});

for (const bad of ["missing", "owner", "wrong-value", "non-2xx"]) test(`${bad} receipt cannot acknowledge the draft or discard its retry key`, async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15"); await press(p, "保存日期和时间");
  await reply(p, bad === "non-2xx" ? 500 : 200, {}, bad === "missing" ? {} : { task: { ...initialTask, plannedDate: bad === "wrong-value" ? "2026-09-16" : "2026-09-15", ownerUserId: bad === "owner" ? "actor-2" : "actor-1", updatedAt: "2026-09-13T03:00:00Z" } });
  await p.getByRole("alert").waitFor(); await press(p, "保存日期和时间"); const requests = await writes(p);
  assert.equal(requests.length, 2); assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey); assert.equal(requests[1].body.expectedUpdatedAt, initialTask.updatedAt);
  assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15");
});

test("refresh preserves dirty dates and explicit discard adopts every latest field inside settings", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await update(p, { task: { ...initialTask, title: "Remote title", plannedDate: "2026-09-17", updatedAt: "2026-09-13T01:00:00Z" } }); await refresh(p);
  assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15");
  assert.equal(await p.getByRole("button", { name: "保存日期和时间", exact: true }).isDisabled(), true);
  await press(p, "放弃草稿并载入最新内容"); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-17");
  await press(p, "关闭待办设置"); assert.equal(await p.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Remote title"); assert.deepEqual(await writes(p), []);
});

test("closing settings retains dates; date save never silently saves or resets unsaved text", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15"); await press(p, "关闭待办设置");
  await p.evaluate(() => { const s = (window as any).fixture; s.inputs["待办标题"].onChangeText("Local title"); s.inputs["备注"].onChangeText("Local notes"); }); await settle(p);
  await press(p, "编辑日期和时间"); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15");
  await press(p, "保存日期和时间"); assert.deepEqual((await writes(p))[0].body.patch, { plannedDate: "2026-09-15" }); await reply(p); await press(p, "关闭待办设置");
  assert.equal(await p.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Local title"); assert.equal(await p.getByRole("textbox", { name: "备注", exact: true }).inputValue(), "Local notes");
});

test("title save preserves the independent date draft and advances its expected version", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15"); await press(p, "关闭待办设置"); await fill(p, "待办标题", "Local title"); await p.getByRole("textbox", { name: "待办标题", exact: true }).blur(); await settle(p); await reply(p);
  await press(p, "编辑日期和时间"); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-15"); await press(p, "保存日期和时间");
  const requests = await writes(p); assert.deepEqual(requests[1].body.patch, { plannedDate: "2026-09-15" }); assert.equal(requests[1].body.expectedUpdatedAt, "2026-09-13T03:00:00.000Z");
});

test("same-frame duplicate saves are single flight and pending date inputs are read-only", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["保存日期和时间"]; fn(); fn(); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).isEditable(), false);
});

test("an old save callback cannot submit dates superseded by a newer local edit", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave = s.presses["保存日期和时间"]; });
  await fill(p, "安排日期", "2026-09-16"); await p.evaluate(() => { void (window as any).fixture.oldSave(); }); await settle(p);
  assert.deepEqual(await writes(p), []); await press(p, "保存日期和时间");
  assert.deepEqual((await writes(p))[0].body.patch, { plannedDate: "2026-09-16" });
});

test("a same-frame input change invalidates a previously captured save callback", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await p.evaluate(() => { const s = (window as any).fixture; const save = s.presses["保存日期和时间"]; s.inputs["安排日期"].onChangeText("2026-09-16"); save(); }); await settle(p);
  assert.deepEqual(await writes(p), []); await press(p, "保存日期和时间");
  assert.deepEqual((await writes(p))[0].body.patch, { plannedDate: "2026-09-16" });
});

test("a callback from before a newer server revision cannot bypass the stale-version guard", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave = s.presses["保存日期和时间"]; });
  await update(p, { task: { ...initialTask, plannedDate: "2026-09-17", updatedAt: "2026-09-13T04:00:00Z" } }); await refresh(p);
  await p.evaluate(() => { void (window as any).fixture.oldSave(); }); await settle(p); assert.deepEqual(await writes(p), []);
});

test("late date acknowledgement does not conceal a newer revision already read", async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15"); await press(p, "保存日期和时间");
  await update(p, { task: { ...initialTask, title: "Newer title", plannedDate: "2026-09-17", updatedAt: "2026-09-13T04:00:00Z" } }); await refresh(p);
  await reply(p, 200, {}, { task: { ...initialTask, plannedDate: "2026-09-15", updatedAt: "2026-09-13T03:00:00Z" } });
  assert.equal(await p.getByRole("button", { name: "保存日期和时间", exact: true }).isDisabled(), true);
  await press(p, "放弃草稿并载入最新内容"); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), "2026-09-17");
});

test("invalid date, incomplete deadline and unsupported clear do not send a write", async t => {
  const p = await open(t, { task: { ...initialTask, plannedDate: "2026-09-14" } });
  for (const value of ["2026-02-29", ""]) { await fill(p, "安排日期", value); await press(p, "保存日期和时间"); await p.getByRole("alert").waitFor(); }
  await fill(p, "安排日期", "2026-09-15"); await fill(p, "截止日期", "2026-09-16"); await press(p, "保存日期和时间"); await p.getByRole("alert").waitFor(); assert.deepEqual(await writes(p), []);
});

test("cancelled task shows why dates cannot be saved and blocks retained callbacks", async t => {
  const p = await open(t, { task: { ...initialTask, status: "cancelled" } });
  assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).isEditable(), false);
  assert.equal(await p.getByRole("button", { name: "保存日期和时间", exact: true }).isDisabled(), true);
  await p.evaluate(() => (window as any).fixture.presses["保存日期和时间"]()); await settle(p); assert.deepEqual(await writes(p), []);
});

for (const change of ["actor", "server", "task", "unmount", "ready"]) test(`${change} change revokes a pending write, old callbacks and late session expiry`, async t => {
  const p = await open(t); await fill(p, "安排日期", "2026-09-15");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSave = s.presses["保存日期和时间"]; s.oldSave(); }); await settle(p);
  const patch = change === "actor" ? { actor: "actor-2", task: { ...initialTask, accountId: "actor-2", ownerUserId: "actor-2", title: "Next owner" } }
    : change === "server" ? { baseUrl: "https://next.example", task: { ...initialTask, title: "Next server" } }
    : change === "task" ? { taskId: "task:next", task: { ...initialTask, id: "task:next", title: "Next task" } }
    : change === "unmount" ? { mounted: false } : { baseReady: false };
  await update(p, patch); await p.evaluate(() => { const s = (window as any).fixture; s.oldSave(); const i = s.requests.findIndex((r: any) => r.method === "PATCH"); s.reply(i, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "PATCH").signal?.aborted), true);
  if (!["unmount", "ready"].includes(change)) { await press(p, "编辑日期和时间"); assert.equal(await p.getByRole("textbox", { name: "安排日期", exact: true }).inputValue(), ""); }
});

for (const variant of [{ name: "normal", width: 390 }, { name: "narrow-large", width: 320, fontScale: 2 }, { name: "dark", width: 390, dark: true }]) test(`${variant.name} date controls remain reachable, legible and at least 44 points`, async t => {
  const p = await open(t, variant);
  for (const label of ["安排日期", "截止日期", "截止时间（东京）"]) { const input = p.getByRole("textbox", { name: label, exact: true }); await input.scrollIntoViewIfNeeded(); const b = (await input.boundingBox())!; assert.ok(b.height >= 44 && b.x >= 0 && b.x + b.width <= variant.width); }
  const button = p.getByRole("button", { name: "保存日期和时间", exact: true }); await button.scrollIntoViewIfNeeded(); const b = (await button.boundingBox())!; assert.ok(b.height >= 44 && b.y + b.height <= 844);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(await p.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1).map(n => n.textContent)), []);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: `/tmp/orbit-task-dates-${variant.name}-20260913.png`, fullPage: true });
  await press(p, "关闭待办设置"); assert.deepEqual(await writes(p), []);
});
