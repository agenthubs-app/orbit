import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
const hasScreen = existsSync(new URL("../src/screens/events/EventExperienceScreen.tsx", import.meta.url));
const hasRoute = existsSync(new URL("../app/events/[id]/operations/experience.tsx", import.meta.url));

// Only native, router, auth/base-url providers and fetch are fixtures. The
// screen/content, React hooks, private wrapper, API client/parser and Zod run.
// Alert exposes only Android's first three buttons, not an unlimited JS menu.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const question = (intent, field, prompt) => ({ id: intent, intent, participantProfileField: field, prompt, required: true, options: ["One", "Two"] });
const configuration = { introduction: "Accepted introduction", accentColor: "#128877", coverAssetId: null, templateId: "default", questionSet: { track: "v1", questions: [question("target_attendees", "targetAttendees", "Who?"), question("value_offered", "valueOffered", "What?")] } };
const state = window.fixture = {
  actor: "one", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, mounted: true,
  eventId: "event:/ 空", mode: "experience", requests: [], replies: [], rejects: [], alerts: [], navigation: [], presses: {}, now: 1800000000000,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  snapshot(patch = {}) {
    const version = { configuration: structuredClone(configuration), createdAt: "2026-09-10T00:00:00Z", createdByActorId: "owner", eventId: state.eventId, hash: "hash", version: 3 };
    const result = { draft: version, head: { eventId: state.eventId, revision: 7, draftVersion: 3, publishedVersion: null, frozenAt: null, publishedAt: null }, published: null };
    if (patch.published) { result.published = { ...version, version: 2 }; result.head.publishedVersion = 2; result.head.publishedAt = version.createdAt; }
    if (patch.deadline !== undefined) result.head.frozenAt = new Date(state.now + patch.deadline).toISOString();
    if (patch.different) result.draft = { ...version, configuration: { ...version.configuration, introduction: "Display draft", questionSet: { track: "v2", questions: [] } } };
    if (patch.noDraft) { result.draft = null; result.head.draftVersion = null; }
    return result;
  },
  reply(index, kind = "success", patch = {}) {
    if (kind === "network") { state.rejects[index](new Error("fixture unavailable")); return; }
    const r = state.requests[index];
    const preview = r.path.endsWith("/preview");
    let data = state.snapshot(patch);
    if (r.method === "PUT") { data.draft.configuration = { ...r.body.configuration, introduction: patch.normalized ?? r.body.configuration.introduction }; data.head.revision = 8; data.head.draftVersion = 4; data.draft.version = 4; }
    if (r.path.endsWith("/publish")) { data.published = data.draft; data.head.publishedVersion = data.draft.version; data.head.publishedAt = data.draft.createdAt; data.head.revision = 8; }
    if (preview) data = { version: { ...data.draft, configuration: r.body.configuration, eventId: "preview", createdByActorId: "preview", version: 0 } };
    if (kind === "missing-slot") { if (r.method === "PUT") { data.draft = null; data.head.draftVersion = null; } else { data.published = null; data.head.publishedVersion = null; } }
    if (kind === "old-revision") data.head.revision = r.body.expectedRevision;
    if (kind === "different-published") { data.published = { ...data.published, version: 9, hash: "different" }; data.head.publishedVersion = 9; }
    if (kind === "malformed") data = { head: {} };
    if (kind === "wrong-event") { if (preview) data.version.eventId = "other"; else { data.head.eventId = "other"; if (data.draft) data.draft.eventId = "other"; if (data.published) data.published.eventId = "other"; } }
    const failure = ["first", "generic404", "access404", "forbidden", "unavailable", "conflict", "frozen"].includes(kind);
    const status = kind === "first" || kind.endsWith("404") ? 404 : kind === "forbidden" ? 403 : kind === "conflict" || kind === "frozen" ? 409 : kind === "unavailable" || kind === "http-error" ? 503 : 200;
    const error = { code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: kind === "frozen" ? "已截止且没有已发布题集" : "测试请求未被接受", context: kind === "first" ? { service: "event-experience", eventExperienceCode: "EVENT_EXPERIENCE_NOT_FOUND" } : kind === "access404" ? { service: "event-capability-access", eventExperienceCode: "EVENT_EXPERIENCE_NOT_FOUND" } : {} };
    state.replies[index](new Response(JSON.stringify(failure ? { success: false, error } : { success: true, data }), { status, headers: { "content-type": "application/json" } }));
  },
  fill(label, value) { const field = document.querySelector('[aria-label="' + label + '"]'); if (!field) throw new Error("field missing: " + label); Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); },
  confirm(index, twice = false) { const fn = state.alerts[index].buttons.find(b => b.style !== "cancel")?.onPress; fn?.(); if (twice) fn?.(); },
};
Date.now = () => state.now;
window.fetch = async (path, init) => { state.requests.push({ method: init.method, path: new URL(path).pathname, origin: new URL(path).origin, body: init.body ? JSON.parse(init.body) : null }); return new Promise((resolve, reject) => { state.replies.push(resolve); state.rejects.push(reject); }); };
export const useFixture = () => { observe(); return state; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.actor ? { id: state.actor } : null, cookieHeader: "" }; };
export const useLocalSearchParams = () => { observe(); return { id: state.eventId, tab: "preview" }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/events/" + encodeURIComponent(state.eventId) + "/operations/experience";
const router = { canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } };
export const useRouter = () => router;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; ${hasScreen ? 'import { EventExperienceScreen } from "./src/screens/events/EventExperienceScreen";' : 'const EventExperienceScreen = () => null;'} ${hasRoute ? 'import Route from "./app/events/[id]/operations/experience";' : 'const Route = () => null;'} import { EventOperationsScreen } from "./src/screens/events/EventOperationsScreen"; function App() { const s = useFixture(); return !s.mounted ? null : s.mode === "route" ? <Route /> : s.mode === "operations" ? <EventOperationsScreen /> : <EventExperienceScreen />; } createRoot(document.getElementById("root")).render(window.initialFixture?.strict ? <React.StrictMode><App /></React.StrictMode> : <App />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "experience-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "experience" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "experience" }));
      plugin.onLoad({ filter: /.*/, namespace: "experience" }, args => ({ contents: args.path === "native" ? `import React from "react"; import { Pressable as NativePressable } from "react-native-web"; export * from "react-native-web"; export const Alert = { alert(title, message, buttons) { const alert = { title, message, buttons: buttons.slice(0, 3) }; window.fixture.alerts.push(alert); window.fixture.activeAlert = alert; } }; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after: (fn: () => Promise<void>) => void }, patch = {}): Promise<Page> {
  assert.ok(hasScreen, "real experience screen must exist");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2500);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script });
  await settle(page);
  return page;
}
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function reply(page: Page, index: number, kind = "success", patch = {}) { await page.evaluate(({ index, kind, patch }) => (window as any).fixture.reply(index, kind, patch), { index, kind, patch }); await settle(page); }
async function fill(page: Page, label: string, value: string) { await page.evaluate(({ label, value }) => (window as any).fixture.fill(label, value), { label, value }); await settle(page); }
async function press(page: Page, label: string) { await page.getByRole("button", { name: label, exact: true }).click(); await settle(page); }
async function duplicate(page: Page, label: string) { await page.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(page); }
async function count(page: Page) { return page.evaluate(() => (window as any).fixture.requests.length); }
async function confirm(page: Page, index: number, twice = false) { await page.evaluate(({ index, twice }) => (window as any).fixture.confirm(index, twice), { index, twice }); await settle(page); }

test("first creation saves exact configuration/null revision once and accepts server normalization", async t => {
  const p = await open(t); await reply(p, 0, "first");
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "");
  assert.equal(await p.getByRole("button", { name: "发布题集", exact: true }).isDisabled(), true);
  await fill(p, "活动简介", "Local display"); await duplicate(p, "保存草稿");
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.requests[1]; return { method: r.method, path: r.path, revision: r.body.expectedRevision, introduction: r.body.configuration.introduction, cover: r.body.configuration.coverAssetId, intents: r.body.configuration.questionSet.questions.map((q: any) => q.intent), keys: Object.keys(r.body).sort() }; }), { method: "PUT", path: "/api/events/event%3A%2F%20%E7%A9%BA/experience", revision: null, introduction: "Local display", cover: null, intents: ["target_attendees", "value_offered"], keys: ["configuration", "expectedRevision"] });
  assert.equal(await count(p), 2); await reply(p, 1, "success", { normalized: "Normalized" });
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Normalized");
  await p.getByText("草稿已保存。", { exact: true }).waitFor();
  await fill(p, "活动简介", "Next"); await press(p, "保存草稿");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[2].body.expectedRevision), 8);
});

for (const kind of ["generic404", "access404", "forbidden", "unavailable", "network", "malformed", "wrong-event", "http-error"]) {
  test(`${kind} initial response never authorizes editing and retry requires a new accepted read`, async t => {
    const p = await open(t); await reply(p, 0, kind); await p.getByRole("alert").waitFor();
    assert.equal(await p.getByLabel("活动简介", { exact: true }).count(), 0);
    assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).count(), 0);
    await press(p, "重新读取"); await reply(p, 1); assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Accepted introduction");
  });
}

test("save failures preserve dirty edits; conflict reload is explicit and cancel sends nothing", async t => {
  const p = await open(t); await reply(p, 0); await fill(p, "活动简介", "Keep me");
  for (const [i, kind] of ["forbidden", "network", "malformed", "wrong-event", "http-error", "conflict"].entries()) {
    await press(p, "保存草稿"); await reply(p, i + 1, kind); await p.getByRole("alert").waitFor();
    assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Keep me");
    assert.equal(await count(p), i + 2);
  }
  await press(p, "重新读取"); assert.equal(await count(p), 7);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.alerts[0].buttons.map((b: any) => b.text)), ["取消", "丢弃修改并读取"]);
  await p.evaluate(() => (window as any).fixture.alerts[0].buttons.find((b: any) => b.style === "cancel").onPress?.());
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Keep me");
  await press(p, "重新读取"); await confirm(p, 1, true); assert.equal(await count(p), 8);
  await reply(p, 7); assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Accepted introduction");
});

test("preview uses current unsaved data without persistence and any input invalidates it", async t => {
  const p = await open(t); await reply(p, 0); await fill(p, "活动简介", "Preview local");
  await duplicate(p, "预览"); assert.equal(await count(p), 2);
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.requests[1]; return [r.method, r.path, Object.keys(r.body), r.body.configuration.introduction]; }), ["POST", "/api/events/event%3A%2F%20%E7%A9%BA/experience/preview", ["configuration"], "Preview local"]);
  await reply(p, 1); await p.getByText("报名预览", { exact: true }).waitFor();
  assert.equal(await p.locator("div").getByText("Preview local", { exact: true }).filter({ hasNot: p.locator("textarea") }).evaluateAll(nodes => nodes.filter(n => n.tagName !== "TEXTAREA").length), 1);
  assert.equal(await p.getByText("Who?", { exact: true }).evaluateAll(nodes => nodes.filter(n => n.tagName !== "TEXTAREA").length), 1); assert.equal(await p.getByText("One", { exact: true }).count(), 2);
  assert.equal(await p.getByRole("button", { name: "提交报名" }).count(), 0);
  await fill(p, "强调色", "#123456"); assert.equal(await p.getByText("报名预览", { exact: true }).count(), 0);
  await press(p, "预览"); await fill(p, "活动简介", "Newer edit"); await reply(p, 2);
  assert.equal(await p.getByText("报名预览", { exact: true }).count(), 0, "deferred preview cannot reappear after edit");
  assert.equal(await p.getByRole("button", { name: "发布题集", exact: true }).isDisabled(), true);
});

test("publish requires saved clean draft and explicit version confirmation; duplicate confirm sends accepted revision once", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "发布题集");
  assert.equal(await count(p), 1);
  assert.ok(await p.evaluate(() => (window as any).fixture.alerts[0].message.includes("3")));
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.alerts[0].buttons.map((b: any) => b.text)), ["取消", "确认发布"]);
  await p.evaluate(() => (window as any).fixture.alerts[0].buttons.find((b: any) => b.style === "cancel").onPress?.());
  assert.equal(await count(p), 1); await press(p, "发布题集"); await confirm(p, 1, true);
  assert.deepEqual(await p.evaluate(() => { const r = (window as any).fixture.requests[1]; return [r.method, r.path, r.body]; }), ["POST", "/api/events/event%3A%2F%20%E7%A9%BA/experience/publish", { expectedRevision: 7 }]);
  assert.equal(await count(p), 2); await reply(p, 1); await p.getByText("题集已发布。", { exact: true }).waitFor();
});

test("no draft and unsaved edits cannot publish, including direct stale handlers", async t => {
  const p = await open(t); await reply(p, 0, "success", { noDraft: true, published: true });
  await duplicate(p, "发布题集"); assert.equal(await count(p), 1);
  await press(p, "重新读取"); await reply(p, 1); await fill(p, "活动简介", "Unsaved");
  await duplicate(p, "发布题集"); assert.equal(await count(p), 2);
  assert.equal(await p.evaluate(() => (window as any).fixture.alerts.length), 0);
});

for (const action of ["预览", "发布题集"]) test(`${action} rejects malformed/wrong-event/error-status and capability/conflict responses`, async t => {
  const p = await open(t); await reply(p, 0);
  for (const [i, kind] of ["malformed", "wrong-event", "http-error", "forbidden", "conflict"].entries()) {
    await press(p, action); if (action === "发布题集") await confirm(p, i);
    await reply(p, i + 1, kind); await p.getByRole("alert").waitFor();
    assert.equal(await p.getByText(action === "预览" ? "报名预览" : "题集已发布。", { exact: true }).count(), 0);
    assert.equal(await count(p), i + 2);
  }
});

for (const change of ["account", "server", "event", "unmount", "readiness"]) {
  for (const operation of ["read", "save", "preview", "publish"]) test(`${operation} ignores deferred completion after ${change} without unlocking the new scope`, async t => {
    const p = await open(t);
    let old = 0;
    if (operation !== "read") { await reply(p, 0); old = 1; await press(p, operation === "save" ? "保存草稿" : operation === "preview" ? "预览" : "发布题集"); if (operation === "publish") await confirm(p, 0); }
    await p.evaluate(change => { const s = (window as any).fixture; s.update(change === "account" ? { actor: "two" } : change === "server" ? { baseUrl: "https://new.example" } : change === "event" ? { eventId: "new-event" } : change === "readiness" ? { ready: false } : { mounted: false }); }, change); await settle(p);
    if (change === "unmount" || change === "readiness") { await p.evaluate(() => (window as any).fixture.update({ mounted: true, ready: true })); await settle(p); }
    assert.equal(await p.getByLabel("活动简介", { exact: true }).count(), 0);
    await reply(p, old); assert.equal(await p.getByLabel("活动简介", { exact: true }).count(), 0, "old read cannot authorize replacement scope");
    await p.waitForFunction(n => (window as any).fixture.requests.length === n, old + 2);
    await reply(p, old + 1); assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Accepted introduction");
    assert.equal(await p.getByText("草稿已保存。", { exact: true }).count(), 0);
    assert.equal(await p.getByText("题集已发布。", { exact: true }).count(), 0);
    assert.equal(await p.getByText("报名预览", { exact: true }).count(), 0);
  });
}

for (const command of ["发布题集", "重新读取"]) for (const change of ["account", "server", "event", "edit", "save"]) test(`deferred ${command} confirmation cannot act after ${change}`, async t => {
  const p = await open(t); await reply(p, 0);
  if (command === "重新读取") await fill(p, "活动简介", "Dirty");
  await press(p, command);
  if (change === "edit" || change === "save") {
    await fill(p, "活动简介", "Newer");
    if (change === "save") { await press(p, "保存草稿"); await reply(p, 1); }
  } else {
    await p.evaluate(change => (window as any).fixture.update(change === "account" ? { actor: "two" } : change === "server" ? { baseUrl: "https://new.example" } : { eventId: "new" }), change); await settle(p); await reply(p, 1);
  }
  const before = await count(p); await confirm(p, 0, true); assert.equal(await count(p), before);
  if (change === "edit" || change === "save") assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Newer");
});

test("deadline crossing locks question callbacks but permits display-only save with unchanged published questions", async t => {
  const p = await open(t); await reply(p, 0, "success", { published: true, deadline: 1000 });
  assert.equal(await p.getByLabel("问题 1", { exact: true }).isEditable(), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.now += 1001; });
  await p.waitForFunction(() => document.querySelector('[aria-label="问题 1"]')?.hasAttribute("readonly"));
  await duplicate(p, "自选问题"); assert.equal(await p.getByLabel("问题 1", { exact: true }).inputValue(), "Who?");
  await fill(p, "活动简介", "After deadline"); await press(p, "保存草稿");
  assert.ok(await p.evaluate(() => { const r = (window as any).fixture.requests[1]; return r.body.configuration.questionSet.track === "v1" && r.body.configuration.questionSet.questions[0].prompt === "Who?" && r.body.configuration.introduction === "After deadline"; }));
  await reply(p, 1, "success", { published: true, deadline: -1 }); await p.getByText("草稿已保存。", { exact: true }).waitFor();
});

test("frozen mismatched draft restores published questions only on explicit action, keeping display edits", async t => {
  const p = await open(t); await reply(p, 0, "success", { published: true, deadline: -1, different: true });
  assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isDisabled(), true);
  await fill(p, "活动简介", "Keep display"); await press(p, "恢复已发布问题");
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Keep display");
  assert.equal(await p.getByLabel("问题 1", { exact: true }).inputValue(), "Who?");
  await press(p, "保存草稿"); assert.equal(await count(p), 2);
});

test("deadline without published questions is blocked and server freeze 409 on first creation remains visible", async t => {
  const p = await open(t); await reply(p, 0, "success", { deadline: -1 });
  assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isDisabled(), true);
  await p.getByText(/尚无已发布题集/).waitFor();
  await press(p, "重新读取"); await reply(p, 1, "first"); await fill(p, "活动简介", "Retained");
  await press(p, "保存草稿"); await reply(p, 2, "frozen"); await p.getByRole("alert").waitFor();
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Retained"); assert.equal(await count(p), 3);
});

test("question/option editing is bounded, blank option rows fail visibly and preview is invalidated", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "自选问题");
  await press(p, "添加问题"); await press(p, "添加问题");
  assert.equal(await p.getByRole("button", { name: "添加问题", exact: true }).isDisabled(), true);
  await press(p, "添加选项 1"); await press(p, "保存草稿"); await p.getByRole("alert").waitFor(); assert.equal(await count(p), 1);
  await fill(p, "问题 1 选项 3", "Three"); await press(p, "预览"); await reply(p, 1);
  await fill(p, "问题 1", "Changed prompt"); assert.equal(await p.getByText("报名预览", { exact: true }).count(), 0);
  for (let i = 4; i >= 1; i--) await press(p, `移除问题 ${i}`);
  assert.equal(await p.getByLabel("问题 1", { exact: true }).count(), 0);
  await press(p, "标准问题"); assert.equal(await p.getByLabel("问题 2", { exact: true }).count(), 1);
});

test("private route blocks signed-out/loading auth and return/back navigation preserves encoded event", async t => {
  assert.ok(hasRoute, "private route exists");
  const p = await open(t, { mode: "route", signedIn: false, ready: false });
  await p.getByRole("progressbar", { name: "正在确认登录状态", exact: true }).waitFor();
  const before = await count(p); await p.evaluate(() => (window as any).fixture.update({ ready: true })); await settle(p);
  await p.getByText(/account\/login\?next=/).waitFor(); assert.equal(await count(p), before);
  await p.evaluate(() => (window as any).fixture.update({ signedIn: true })); await settle(p);
  await reply(p, (await count(p)) - 1); await press(p, "返回活动运营台");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events/event%3A%2F%20%E7%A9%BA/operations");
});

test("editor controls fit narrow/wide viewports and preview renders actual accent/questions", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "预览"); await reply(p, 1);
  for (const width of [320, 390, 1024]) {
    await p.setViewportSize({ width, height: 844 }); await settle(p);
    for (const control of await p.locator('input, textarea, [role="button"]').all()) {
      const box = await control.boundingBox(); assert.ok(box && box.x >= 0 && box.width > 0 && box.x + box.width <= width && box.height >= 44, JSON.stringify({ width, box }));
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.ok(await p.evaluate(() => Array.from(document.querySelectorAll("div")).some(e => e.textContent?.includes("报名预览") && getComputedStyle(e).borderLeftColor === "rgb(18, 136, 119)")));
});

test("operations screen navigates to the encoded native experience route", async t => {
  const p = await open(t, { mode: "operations" });
  await p.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await p.evaluate(() => { const s = (window as any).fixture; s.replies[0](new Response(JSON.stringify({ success: true, data: {
    configuration: { checkInOpensAt: "2026-09-10T08:00:00Z", eventEndsAt: "2026-09-10T13:00:00Z", eventId: s.eventId, eventStartsAt: "2026-09-10T09:00:00Z", maxAttemptsPerTask: 3, organizerActorId: "owner", profileEditDeadlineAt: "2026-09-09T09:00:00Z", recommendationCount: 3, registrationCutoffAt: "2026-09-09T10:00:00Z", resultsAvailableAt: "2026-09-10T08:30:00Z", roundOneStartsAt: "2026-09-10T10:00:00Z", roundTwoStartsAt: "2026-09-10T11:00:00Z", shardSize: 20, tableSize: 6, updatedAt: "2026-09-09T12:00:00Z" },
    eventId: s.eventId, generations: [], metrics: { acceptedContactRequests: 1, checkedIn: 3, contactRequests: 2, participantCount: 8, publishedGenerationId: null }, publishedResult: null,
  } }), { status: 200, headers: { "content-type": "application/json" } })); });
  await press(p, "报名体验");
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events/event%3A%2F%20%E7%A9%BA/operations/experience");
  assert.equal(await count(p), 1, "navigation must not publish or generate");
});

for (const patch of [{ ready: false }, { baseReady: false }, { actor: null }]) test(`initial provider authority is required: ${JSON.stringify(patch)}`, async t => {
  const p = await open(t, patch);
  assert.equal(await count(p), 0); assert.equal(await p.getByLabel("活动简介", { exact: true }).count(), 0);
  await p.evaluate(() => (window as any).fixture.update({ ready: true, baseReady: true, actor: "accepted" })); await settle(p);
  assert.equal(await count(p), 1); await reply(p, 0); assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Accepted introduction");
});

test("a deferred question-type menu cannot overwrite newer display edits", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "自选问题"); await press(p, "问题类型 1");
  await p.evaluate(() => { const s = (window as any).fixture; s.staleChoice = s.presses["工作角色"] ?? s.activeAlert?.buttons.find((b: any) => b.text === "工作角色")?.onPress; });
  assert.equal(await p.evaluate(() => typeof (window as any).fixture.staleChoice), "function", "positioning is reachable under native menu semantics");
  await fill(p, "活动简介", "New display");
  await p.evaluate(() => (window as any).fixture.staleChoice()); await settle(p);
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "New display");
  await press(p, "问题类型 1");
  await chooseQuestionType(p, "工作角色");
  await press(p, "保存草稿");
  assert.ok(await p.evaluate(() => { const q = (window as any).fixture.requests[1].body.configuration.questionSet.questions[0]; return q.intent === "positioning" && q.participantProfileField === "positioning" && q.required === false; }));
});

const fixedChoices = [
  { label: "想认识谁", intent: "target_attendees", field: "targetAttendees" },
  { label: "能提供什么", intent: "value_offered", field: "valueOffered" },
  { label: "期待的收获", intent: "desired_outcome", field: "desiredOutcome" },
  { label: "后续交流", intent: "follow_up_preference", field: "followUpPreference" },
  { label: "工作角色", intent: "positioning", field: "positioning" },
];

async function visibleQuestionTypes(page: Page): Promise<string[]> {
  const labels = [];
  for (const label of [...fixedChoices.map(c => c.label), "取消"]) {
    if (await page.getByRole("button", { name: label, exact: true }).count()) labels.push(label);
  }
  return labels.length ? labels : page.evaluate(() => (window as any).fixture.activeAlert?.buttons.map((b: any) => b.text) ?? []);
}

async function chooseQuestionType(page: Page, label: string) {
  const button = page.getByRole("button", { name: label, exact: true });
  if (await button.count()) await button.click();
  else await page.evaluate(label => {
    const s = (window as any).fixture;
    const choice = s.activeAlert?.buttons.find((b: any) => b.text === label);
    if (!choice) throw new Error("Native choice is unavailable: " + label);
    s.activeAlert = null;
    choice.onPress?.();
  }, label);
  await settle(page);
}

for (const questionCount of [1, 2, 3, 4]) test(`native question menu exposes every eligible choice and cancel with ${questionCount} questions`, async t => {
  const p = await open(t); await reply(p, 0); await press(p, "自选问题");
  if (questionCount === 1) await press(p, "移除问题 2");
  for (let n = 2; n < questionCount; n++) await press(p, "添加问题");
  const otherIntents = fixedChoices.slice(1, questionCount).map(c => c.intent);
  const eligible = fixedChoices.filter(c => !otherIntents.includes(c.intent));
  await press(p, "问题类型 1");
  assert.deepEqual(await visibleQuestionTypes(p), [...eligible.map(c => c.label), "取消"]);
  await chooseQuestionType(p, "取消");
  assert.equal(await count(p), 1, "menu cancellation makes no API request");
  assert.equal(await p.getByLabel("问题 1", { exact: true }).inputValue(), "Who?");
  assert.deepEqual(await visibleQuestionTypes(p), []);
  for (const choice of eligible) {
    await press(p, "问题类型 1");
    assert.deepEqual(await visibleQuestionTypes(p), [...eligible.map(c => c.label), "取消"]);
    const before = await count(p);
    await chooseQuestionType(p, choice.label);
    assert.equal(await count(p), before, "selection edits locally only");
    assert.deepEqual(await visibleQuestionTypes(p), []);
    await press(p, "预览");
    assert.deepEqual(await p.evaluate(() => {
      const questions = (window as any).fixture.requests.at(-1).body.configuration.questionSet.questions;
      return { count: questions.length, intent: questions[0].intent, field: questions[0].participantProfileField, required: questions[0].required, unique: new Set(questions.map((q: any) => q.intent)).size, other: questions.slice(1).map((q: any) => q.intent) };
    }), { count: questionCount, intent: choice.intent, field: choice.field, required: false, unique: questionCount, other: otherIntents });
    await reply(p, before);
  }
});

for (const change of ["cancel", "account", "server", "event", "deadline"]) test(`question menu captured selection is inert after ${change}`, async t => {
  const p = await open(t); await reply(p, 0, "success", { published: true, deadline: 1000 });
  await press(p, "自选问题"); await press(p, "问题类型 1");
  await p.evaluate(() => { const s = (window as any).fixture; s.staleChoice = s.presses["工作角色"] ?? s.activeAlert?.buttons.find((b: any) => b.text === "工作角色")?.onPress; });
  assert.equal(await p.evaluate(() => typeof (window as any).fixture.staleChoice), "function");
  if (change === "cancel") await chooseQuestionType(p, "取消");
  else if (change === "deadline") {
    await p.evaluate(() => { (window as any).fixture.now += 1001; });
    await p.waitForFunction(() => document.querySelector('[aria-label="问题 1"]')?.hasAttribute("readonly"));
  } else {
    await p.evaluate(change => (window as any).fixture.update(change === "account" ? { actor: "two" } : change === "server" ? { baseUrl: "https://new.example" } : { eventId: "new" }), change);
    await settle(p); await reply(p, 1);
  }
  const before = await count(p);
  await p.evaluate(() => (window as any).fixture.staleChoice()); await settle(p);
  assert.equal(await count(p), before);
  assert.equal(await p.getByLabel("问题 1", { exact: true }).inputValue(), "Who?");
  assert.deepEqual(await visibleQuestionTypes(p), []);
});

test("effect replay invalidates old reads and still completes a fresh authorized read", async t => {
  const p = await open(t, { strict: true });
  await reply(p, 0);
  await p.waitForFunction(() => (window as any).fixture.requests.length === 2);
  assert.equal(await p.getByLabel("活动简介", { exact: true }).count(), 0);
  await reply(p, 1);
  assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Accepted introduction");
});

for (const operation of ["save", "publish"]) for (const kind of ["missing-slot", "old-revision", ...(operation === "publish" ? ["different-published"] : [])]) test(`${operation} cannot report success for ${kind} snapshot`, async t => {
  const p = await open(t); await reply(p, 0);
  if (operation === "save") await fill(p, "活动简介", "Retain local");
  await press(p, operation === "save" ? "保存草稿" : "发布题集");
  if (operation === "publish") await confirm(p, 0);
  await reply(p, 1, kind);
  await p.getByRole("alert").waitFor();
  assert.equal(await p.getByText(operation === "save" ? "草稿已保存。" : "题集已发布。", { exact: true }).count(), 0);
  if (operation === "save") assert.equal(await p.getByLabel("活动简介", { exact: true }).inputValue(), "Retain local");
});

test("superseded preview cannot unlock a newer pending save", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "预览");
  await fill(p, "活动简介", "Newer save"); await duplicate(p, "保存草稿");
  await reply(p, 1); assert.equal(await p.getByRole("button", { name: "保存草稿", exact: true }).isDisabled(), true);
  assert.equal(await p.getByText("报名预览", { exact: true }).count(), 0); assert.equal(await count(p), 3);
  await reply(p, 2); await p.getByText("草稿已保存。", { exact: true }).waitFor();
});

test("reselecting the same question track stays clean and does not block display edits at deadline", async t => {
  const p = await open(t); await reply(p, 0, "success", { published: true, deadline: 1000 });
  await press(p, "标准问题");
  assert.equal(await p.getByRole("button", { name: "发布题集", exact: true }).isDisabled(), false);
  await p.evaluate(() => { (window as any).fixture.now += 1001; });
  await p.waitForFunction(() => document.querySelector('[aria-label="问题 1"]')?.hasAttribute("readonly"));
  assert.equal(await p.getByRole("button", { name: "恢复已发布问题", exact: true }).count(), 0);
  await fill(p, "活动简介", "Legal display"); await press(p, "保存草稿"); assert.equal(await count(p), 2);
});
