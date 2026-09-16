import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { aiConversationPayload, aiReadPayloads, aiSession, aiSessionListPayload, emptyAiConversationPayload, emptyAiSessionListPayload } from "./helpers/ai-fixtures";
import { aiSessionReceiptMatches } from "../src/api/ai-history-contract";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
// Actual private route, hooks, HTTP client, screen and native-web controls.
// Auth/device capabilities, network transport and local snapshot I/O are external boundaries.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
import { registerAiTemplatePrefill } from "./src/data/ai-template-prefill";
let revision = 0; const listeners = new Set();
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const NativeDate = Date;
window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-09-12T03:00:00Z"])); } static now() { return NativeDate.parse("2026-09-12T03:00:00Z"); } };
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, expiries: 0, actor: "actor-1", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, focused: true, mounted: true, width: 390, fontScale: 1, params: { id: "conversation:1" }, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  reply(index, status = 200, payload) { const r = state.requests[index]; r.replied = true; state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? state.payloads[r.path] : payload } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取，请重试。" } }), { status, headers: { "Content-Type": "application/json" } })); }
};
if (window.initialFixture.prefill) state.params = { id: "new", prefillIntent: registerAiTemplatePrefill({ actorId: state.actor, baseUrl: state.baseUrl, ...window.initialFixture.prefill }) };
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input)); state.requests.push({ path: url.pathname, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => state.reply(index, init.method !== "GET" ? 503 : (state.failPaths?.includes(url.pathname) ? 503 : 200))); return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.actor, name: "程川", email: "person@example.test" } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useGlobalSearchParams = () => { observe(); return state.params; };
export const useLocalSearchParams = () => { observe(); return state.params; };
export const usePathname = () => "/ai/" + state.params.id;
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); if (state.followNavigation && href.pathname === "/ai/[id]") state.update({ screen: "conversation", params: href.params }); }, setParams(patch) { state.update({ params: { ...state.params, ...patch } }); } });
export const randomUUID = () => "test-send-" + ++state.intentSequence;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }, edges?.includes?.("bottom") && { paddingBottom: 24 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const readSnapshot = async () => null; export const writeSnapshot = async () => {};
`;
test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/ai/[id]"; import HomeRoute from "./app/(app)/ai"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? s.screen === "home" ? <HomeRoute /> : <Route /> : null; } const app = <App />; createRoot(document.getElementById("root")).render(window.initialFixture?.strictMode ? <React.StrictMode>{app}</React.StrictMode> : app);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ai-http-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ai" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "ai" }));
      plugin.onLoad({ filter: /.*/, namespace: "ai" }, args => ({ contents: args.path === "native" ? `
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
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
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
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { holdWrites: true, intentSequence: 0, payloads: conversationReadPayloads, ...patch }); await p.addScriptTag({ content: script }); await settle(p); assert.deepEqual(errors, [], "route must render without runtime errors"); await p.evaluate(() => document.fonts.ready); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function openAndSend(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown>) {
  const p = await open(t, patch);
  assert.deepEqual(await writes(p), []);
  await press(p, "发送消息");
  return p;
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function navigation(p: Page) { return p.evaluate(() => (window as any).fixture.navigation); }
async function twice(p: Page, label: string) { await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p); }

function reliableRequestBase(request: any) {
  assert.equal(request.body.protocolVersion, 2);
  assert.equal(request.body.references.length, 0);
  assert.equal(typeof request.body.sessionId, "string");
  assert.equal(typeof request.body.clientMessageId, "string");
  assert.equal(typeof request.body.requestId, "string");
  assert.notEqual(request.body.clientMessageId, request.body.requestId);
  assert.equal(Number.isSafeInteger(request.body.expectedMessageRevision), true);
  const {
    clientMessageId: _clientMessageId,
    expectedMessageRevision: _expectedMessageRevision,
    protocolVersion: _protocolVersion,
    references: _references,
    requestId: _requestId,
    sessionId: _sessionId,
    origin: _origin,
    ...body
  } = request.body;
  return { ...request, body };
}

const conversationReadPayloads = {
  ...aiReadPayloads,
  "/api/ai/conversations/conversation%3A1": aiConversationPayload,
  "/api/ai/conversations/sessions/session%3A1": { session: aiSession, storage: aiSessionListPayload.storage },
  "/api/events": { events: [] }, "/api/contacts": { contacts: [] }, "/api/tasks": { tasks: [] }, "/api/profile": {}
};

test("saved contact results render all eight true candidates under their own reply and refresh without writes", async t => {
  const session = { ...aiSession, messages: [{ id: "user:contact:qa", role: "user", text: "从我的人脉找联系人来讨论点单助手，谁愿意聊聊？" }, { id: "assistant:contact:qa", role: "assistant", text: "我来查找。" }] };
  const items = Array.from({ length: 8 }, (_, index) => ({ id: `contact-recommendation:contact:qa:${index + 1}`, title: `虚构候选${index + 1}`, subtitle: "餐饮数字化负责人", reason: "参与点单测试项目", body: "在虚构交流会认识。", evidenceIds: [`evidence:qa:${index + 1}`], metadata: [{ label: "组织", value: "虚构组织" }], contactHref: `/contacts/contact%3Aqa%3A${index + 1}` }));
  const recovery = { turns: [{ sessionId: session.id, requestId: "request:contact:qa", userMessageId: "user:contact:qa", assistantMessageId: "assistant:contact:qa", status: "ready", artifacts: [{ artifactId: "artifact:qa", taskId: "task:qa", kind: "contact_recommendations", status: "ready", title: "匹配结果", summary: "8位测试候选人", sections: [{ title: "已有关系", items }] }] }], truncated: false };
  const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/contacts": { contacts: unrelatedContacts }, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage, artifactRecovery: recovery } } });
  const candidates = p.getByTestId("ai-contact-candidate");
  assert.deepEqual(await candidates.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))), items.map(item => `${item.title} · ${item.subtitle}`));
  assert.equal(await p.getByText(/^未推荐联系人[123]$/u).count(), 0);
  assert.doesNotMatch(await p.getByTestId("ai-contact-artifact").innerText(), /evidence:qa|contact-recommendation:|contact:qa/u);
  assert.equal(await p.getByText("参与点单测试项目", { exact: true }).count(), 8);
  assert.equal(await p.getByText("在虚构交流会认识。", { exact: true }).count(), 8);
  await press(p, "打开虚构候选1");
  assert.equal((await navigation(p)).at(-1), "/contacts/contact%3Aqa%3A1");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await candidates.count(), 8);
  assert.deepEqual(await writes(p), []);
});

test("history recovery truncation is visible and failed refresh or actor change removes old candidates", async t => {
  const session = { ...aiSession, messages: [{ id: "u:qa", role: "user", text: "点单助手讨论" }, { id: "a:qa", role: "assistant", text: "原始回复保留。" }] };
  const item = { id: "contact-recommendation:contact:qa:1", title: "虚构候选甲", evidenceIds: ["evidence:qa"], metadata: [], contactHref: "/contacts/contact%3Aqa%3A1" };
  const artifactRecovery = { turns: [{ sessionId: session.id, requestId: "r:qa", userMessageId: "u:qa", assistantMessageId: "a:qa", status: "ready", artifacts: [{ artifactId: "artifact:qa", taskId: "task:qa", kind: "contact_recommendations", status: "ready", title: "候选结果", summary: "1位候选", sections: [{ title: "已有关系", items: [item] }] }] }], truncated: true };
  const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage, artifactRecovery } } });
  assert.equal(await p.getByTestId("ai-contact-candidate").count(), 1);
  assert.equal(await p.getByText("部分结果无法恢复或超出展示上限，历史回复已保留。", { exact: true }).count(), 1);
  await update(p, { failPaths: ["/api/ai/conversations/sessions/session%3A1"] });
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByTestId("ai-contact-candidate").count(), 0);
  await update(p, { actor: "actor-other", signedIn: false });
  assert.equal(await p.getByTestId("ai-contact-candidate").count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("present malformed history projection keeps the original reply and explicitly marks recovery unavailable, unlike absent legacy projection", async t => {
  const session = { ...aiSession, messages: [{ id: "u:bad:qa", role: "user", text: "点单助手讨论" }, { id: "a:bad:qa", role: "assistant", text: "历史原文不改写。" }] };
  for (const present of [true, false]) {
    const payload = { session, storage: aiSessionListPayload.storage, ...(present ? { artifactRecovery: { turns: "invalid", truncated: false } } : {}) };
    const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": payload } });
    assert.equal(await p.getByText("历史原文不改写。", { exact: true }).count(), 1);
    assert.equal(await p.getByTestId("ai-contact-candidate").count(), 0);
    assert.equal(await p.getByText("部分结果无法恢复或超出展示上限，历史回复已保留。", { exact: true }).count(), present ? 1 : 0);
    assert.deepEqual(await writes(p), []);
  }
});

const unrelatedContacts = Array.from({ length: 3 }, (_, index) => ({ id: `contact:unrecommended:${index}`, displayName: `未推荐联系人${index + 1}`, organization: "通用列表组织", role: "负责人", status: "active" }));
const peopleKeywordSession = { ...aiSession, messages: [{ id: "u:people:qa", role: "user", text: "从我的人脉找联系人，并安排下一步跟进。" }, { id: "a:people:qa", role: "assistant", text: "历史原文应保留。" }] };

for (const [name, artifactRecovery] of [
  ["malformed", { turns: "invalid", truncated: false }],
  ["unavailable", { turns: [], truncated: false, unavailable: true }]
] as const) test(`people keyword cannot replace ${name} recovery with unrecommended generic contacts`, async t => {
  const p = await open(t, { params: { id: aiSession.id, source: "session" }, payloads: { ...conversationReadPayloads,
    "/api/contacts": { contacts: unrelatedContacts },
    "/api/ai/conversations/sessions/session%3A1": { session: peopleKeywordSession, storage: aiSessionListPayload.storage, artifactRecovery }
  } });
  assert.equal(await p.getByText("历史原文应保留。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("部分结果无法恢复或超出展示上限，历史回复已保留。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 0);
  assert.equal(await p.getByText("待办", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("absent legacy recovery keeps people compatibility", async t => {
  const p = await open(t, { params: { id: aiSession.id, source: "session" }, payloads: { ...conversationReadPayloads,
    "/api/contacts": { contacts: unrelatedContacts },
    "/api/ai/conversations/sessions/session%3A1": { session: peopleKeywordSession, storage: aiSessionListPayload.storage }
  } });
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 1);
  assert.equal(await p.getByText("历史原文应保留。", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("people keyword cannot expose generic candidates while a retained reply refreshes or its read fails", async t => {
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/contacts": { contacts: unrelatedContacts } } });
  await p.getByRole("textbox").fill("从我的人脉找联系人，并安排下一步跟进。");
  await press(p, "发送消息");
  await replyLastWrite(p, replyPayload("从我的人脉找联系人，并安排下一步跟进。", "历史原文应保留。"));
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 1);
  await update(p, { holdReads: true });
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByText("历史原文应保留。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 0);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.path === "/api/ai/conversations/conversation%3A1"), 503); }); await settle(p);
  assert.equal(await p.getByText("历史原文应保留。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 0);
  await update(p, { focused: false });
  assert.equal(await p.getByText("未推荐联系人1", { exact: true }).count(), 0);
  assert.equal((await writes(p)).length, 1);
});

function replyPayload(question = "再想一个方案", answer = "可以先讨论时间安排。") {
  return { ...aiConversationPayload, assistantMessage: answer,
    messages: [{ ...aiConversationPayload.messages[0], messageId: "new-user", content: question }, { ...aiConversationPayload.messages[1], messageId: "new-assistant", content: answer }]
  };
}
async function replyLastWrite(p: Page, data: unknown, status = 200) {
  await p.evaluate(({ data, status }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method !== "GET"), status, data); }, { data, status }); await settle(p);
}

test("AI home click issues a scoped one-use intent and continues without another send", async t => {
  const p = await open(t, { screen: "home", followNavigation: true });
  await p.getByRole("textbox", { name: "消息", exact: true }).fill("  首页明确发送的问题  ");
  await twice(p, "发送");
  const target = (await navigation(p))[0];
  assert.equal((await navigation(p)).length, 1);
  assert.equal(target.params.sendIntent, "test-send-1");
  const firstWrite = (await writes(p))[0];
  assert.equal(firstWrite.body.origin.entryClient, "app");
  assert.equal(firstWrite.body.origin.entryPointId, "ai.home");
  assert.deepEqual((await writes(p)).map(reliableRequestBase), [{ method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "首页明确发送的问题" } }]);
  await update(p, { mounted: false }); await update(p, { mounted: true, params: target.params });
  assert.equal((await writes(p)).length, 1, "reopening even the original unconsumed URL cannot replay the click");
});

test("AI home submitted question retains explicit unknown-result recovery after route remount", async t => {
  const p = await open(t, { screen: "home", followNavigation: true });
  await p.getByRole("textbox", { name: "消息", exact: true }).fill("结果需要确认的问题");
  await press(p, "发送");
  assert.equal(await p.evaluate(() => (window as any).fixture.params.initialMessageConsumed), "1");
  await replyLastWrite(p, undefined, 503);
  await update(p, { mounted: false }); await update(p, { mounted: true });
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.getByRole("button", { name: "重新生成", exact: true }).count(), 1);
  assert.equal(await p.getByText("结果需要确认的问题", { exact: true }).count(), 1);
  await press(p, "编辑问题");
  assert.equal(await p.getByRole("textbox").inputValue(), "结果需要确认的问题");
  assert.equal((await writes(p)).length, 1);
});

for (const replacement of [{ actor: "actor-2" }, { baseUrl: "https://other.example" }]) test("AI deferred home navigation never transfers its draft across identity " + JSON.stringify(replacement), async t => {
  const p = await open(t, { screen: "home" });
  await p.getByRole("textbox", { name: "消息", exact: true }).fill("原账号待发送的背景");
  await press(p, "发送");
  const target = (await navigation(p))[0];
  await update(p, { ...replacement, screen: "conversation", params: target.params });
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("textbox").inputValue(), "");
  await update(p, { mounted: false }); await update(p, { mounted: true });
  assert.equal(await p.getByRole("textbox").inputValue(), "");
  await update(p, { actor: "actor-1", baseUrl: "https://orbit.example" });
  assert.deepEqual(await writes(p), [], "returning to the first identity must not resume a cancelled click");
});

for (const extra of [{}, { source: "business" }, { source: "send", sendIntent: "unregistered" }, { initialMessage: ["先核对活动背景", "另一个参数"], sendIntent: ["unregistered"] }]) test("AI initial links only prefill without generation " + JSON.stringify(extra), async t => {
  const p = await open(t, { params: { id: "new", initialMessage: "先核对活动背景", ...extra } });
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("textbox").inputValue(), "先核对活动背景");
  assert.equal(await p.getByText("正在处理", { exact: true }).count(), 0);
  await p.getByRole("textbox").fill("我修改后的问题");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  await update(p, { focused: false }); await update(p, { focused: true });
  await update(p, { cookieHeader: "session=renewed" });
  assert.equal(await p.getByRole("textbox").inputValue(), "我修改后的问题");
  assert.deepEqual(await writes(p), []);
  await twice(p, "发送消息");
  assert.deepEqual((await writes(p)).map(reliableRequestBase), [{ method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "我修改后的问题" } }]);
});

test("business template prefill is one-use and sends its stable contact reference with origin", async t => {
  const contact = { id: "contact:lin:design", displayName: "林悦", organization: "云间设计", role: "设计师", status: "active" };
  const message = "请为 @林悦 起草一封联系邮件，只生成草稿，不要发送。";
  const p = await open(t, {
    prefill: { entryPointId: "contact.message_draft", message, references: [{ id: contact.id, type: "contact" }], template: { id: "contact.message_draft", version: 1 } },
    payloads: { ...conversationReadPayloads, "/api/contacts": { contacts: [contact] } },
  });
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), message);
  await p.getByRole("button", { name: "移除联系人：林悦", exact: true }).waitFor();
  await press(p, "发送消息");
  const write = (await writes(p))[0];
  assert.deepEqual(write.body.references, [{ id: "contact:lin:design", type: "contact" }]);
  assert.equal(write.body.origin.entryPointId, "contact.message_draft");
  assert.deepEqual(write.body.origin.template, { id: "contact.message_draft", version: 1 });
  await replyLastWrite(p, replyPayload(message));
  const sessionWrite = (await writes(p))[1];
  assert.deepEqual(sessionWrite.body.session.messages.find((item: any) => item.role === "user").references, [{ id: "contact:lin:design", type: "contact" }]);
  await replyLastWrite(p, { session: sessionWrite.body.session, storage: aiSessionListPayload.storage });
  await update(p, { mounted: false }); await update(p, { mounted: true });
  assert.equal((await writes(p)).length, 2);
});

test("contacts analysis prefill stays editable, cancels without generation and sends its source version only on user action", async t => {
  const sourceDataVersion = "a".repeat(64);
  const prefill = {
    entryPointId: "contacts.analysis",
    message: "请根据当前已保存的人脉资料生成一份人脉分析。",
    references: [],
    sourceDataVersion,
    template: { id: "contacts.analysis", version: 1 },
  };
  const cancelled = await open(t, { prefill });
  assert.deepEqual(await writes(cancelled), []);
  await update(cancelled, { mounted: false });
  assert.deepEqual(await writes(cancelled), []);

  const p = await open(t, { prefill });
  const composer = p.getByRole("textbox", { name: "消息", exact: true });
  await composer.fill("请重新分析，并优先说明投资人覆盖。 ");
  assert.deepEqual(await writes(p), []);
  await press(p, "发送消息");
  const write = (await writes(p))[0];
  assert.equal(write.body.message, "请重新分析，并优先说明投资人覆盖。");
  assert.equal(write.body.origin.entryPointId, "contacts.analysis");
  assert.equal(write.body.origin.sourceDataVersion, sourceDataVersion);
  assert.deepEqual(write.body.origin.template, { id: "contacts.analysis", version: 1 });
});

test("contacts analysis prefill keeps its origin through a focus round trip before explicit send", async t => {
  const sourceDataVersion = "c".repeat(64);
  const message = "请根据当前人脉资料检查合作伙伴覆盖。";
  const p = await open(t, {
    prefill: {
      entryPointId: "contacts.analysis",
      message,
      references: [],
      sourceDataVersion,
      template: { id: "contacts.analysis", version: 1 },
    },
  });

  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), message);
  await update(p, { focused: false });
  await update(p, { focused: true });
  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), message);
  assert.deepEqual(await writes(p), []);

  await press(p, "发送消息");
  const write = (await writes(p))[0];
  assert.equal(write.body.origin.entryPointId, "contacts.analysis");
  assert.equal(write.body.origin.sourceDataVersion, sourceDataVersion);
});

test("contacts analysis prefill is claimed once when StrictMode replays its effect", async t => {
  const sourceDataVersion = "e".repeat(64);
  const message = "请在严格模式下保留人脉分析来源。";
  const p = await open(t, {
    strictMode: true,
    prefill: {
      entryPointId: "contacts.analysis",
      message,
      references: [],
      sourceDataVersion,
      template: { id: "contacts.analysis", version: 1 },
    },
  });

  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), message);
  await press(p, "发送消息");
  const writesAfterSend = await writes(p);
  assert.equal(writesAfterSend.length, 1);
  assert.equal(writesAfterSend[0].body.origin.sourceDataVersion, sourceDataVersion);
});

for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://other.example" }]) test("contacts analysis prefill clears on identity scope change " + JSON.stringify(patch), async t => {
  const p = await open(t, {
    prefill: {
      entryPointId: "contacts.analysis",
      message: "仅属于原账号的人脉分析草稿",
      references: [],
      sourceDataVersion: "d".repeat(64),
      template: { id: "contacts.analysis", version: 1 },
    },
  });
  await update(p, patch);
  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), "");
  assert.deepEqual(await writes(p), []);
});

test("mention picker disambiguates same-name contacts and sends the selected stable id", async t => {
  const contacts = [
    { id: "contact:lin:design", displayName: "林悦", organization: "云间设计", role: "设计师", status: "active" },
    { id: "contact:lin:commerce", displayName: "林悦", organization: "云间商贸", role: "采购", status: "active" },
  ];
  const p = await open(t, { params: { id: "new" }, payloads: { ...conversationReadPayloads, "/api/contacts": { contacts } } });
  await press(p, "提及联系人");
  await p.getByRole("textbox", { name: "搜索要提及的联系人", exact: true }).fill("商贸");
  await press(p, "选择联系人：林悦，云间商贸，采购");
  assert.match(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), /@林悦/u);
  await press(p, "发送消息");
  assert.deepEqual((await writes(p))[0].body.references, [{ id: "contact:lin:commerce", type: "contact" }]);
});

test("mention picker explains empty and unavailable contact sources without blocking ordinary questions", async t => {
  const empty = await open(t, { params: { id: "new" } });
  await press(empty, "提及联系人");
  await empty.getByText("没有匹配的联系人。", { exact: true }).waitFor();
  assert.deepEqual(await writes(empty), []);

  const unavailable = await open(t, { params: { id: "new" }, failPaths: ["/api/contacts"] });
  await press(unavailable, "提及联系人");
  await unavailable.getByText("联系人暂时不可用，问题仍可不关联联系人发送。", { exact: true }).waitFor();
  await unavailable.getByRole("textbox", { name: "消息", exact: true }).fill("不关联联系人也可以继续");
  await press(unavailable, "发送消息");
  assert.deepEqual((await writes(unavailable))[0].body.references, []);
});
test("note template stays local until explicit send and retains input for date confirmation", async t => {
  const p = await open(t, { params: {
    id: "new",
    initialMessage: "请根据这篇笔记整理一个待办，并明确标题和日期。",
    sourceNoteId: "note:one",
    sourceNoteVersion: "3",
  } });
  assert.deepEqual(await writes(p), []);
  const input = p.getByRole("textbox");
  assert.equal(await input.inputValue(), "请根据这篇笔记整理一个待办，并明确标题和日期。");
  await input.fill("请整理待办，下周完成");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.deepEqual(await writes(p), []);
  await press(p, "发送消息");
  const sent = (await writes(p))[0];
  assert.equal(sent.method, "POST");
  assert.equal(sent.path, "/api/ai/conversations");
  assert.equal(sent.body.locale, "zh");
  assert.equal(sent.body.message, "请整理待办，下周完成");
  assert.deepEqual(sent.body.sourceNote, { id: "note:one", version: 3 });
  assert.equal(sent.body.protocolVersion, 2);
  assert.equal(sent.body.expectedMessageRevision, 0);
  assert.deepEqual(sent.body.references, []);
  assert.match(sent.body.sessionId, /^agent-session-mobile-/u);
  assert.equal(typeof sent.body.clientMessageId, "string");
  assert.equal(typeof sent.body.requestId, "string");
  await replyLastWrite(p, { ...replyPayload("请整理待办，下周完成"), taskInteraction: {
    category: "work", reason: "请补充明确日期后再发送，当前没有创建建议或待办。",
    relatedContactIds: ["contact:a"], sourceNoteId: "note:one", sourceNoteVersion: 3,
    state: "needs_date_confirmation", title: "整理待办",
  } });
  assert.equal(await input.inputValue(), "请整理待办，下周完成");
  assert.equal(await p.getByText("需要确认日期", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "加入待办", exact: true }).count(), 0);
});
for (const initialMessage of [undefined, "   "]) test("AI empty new conversation accepts its first explicit question " + JSON.stringify(initialMessage), async t => {
  const p = await open(t, { params: { id: "new", initialMessage } });
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("textbox").count(), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.some((r: any) => r.path === "/api/ai/conversations/new")), false);
  await p.getByRole("textbox").fill("再想一个方案"); await twice(p, "发送消息");
  assert.deepEqual((await writes(p)).map(reliableRequestBase), [{ method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "再想一个方案" } }]);
  await replyLastWrite(p, replyPayload());
  const session = (await writes(p))[1].body.session;
  await replyLastWrite(p, { session, storage: aiSessionListPayload.storage });
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: session.id, source: "session" } }]);
});
test("AI first reliable reply joins the group selected before the chat started", async t => {
  const p = await open(t, { params: { id: "new", entryPointId: "ai.new_chat", initialGroupId: "group:work" } });
  await p.getByRole("textbox").fill("分组里的新问题");
  await press(p, "发送消息");
  const first = (await writes(p))[0];
  assert.equal(first.body.origin.initialGroupId, "group:work");
  await replyLastWrite(p, {
    ...replyPayload("分组里的新问题", "已经整理完成。"),
    reliableSend: {
      messageRevision: 2,
      protocolVersion: 2,
      replayed: false,
      requestId: first.body.requestId,
      sessionId: first.body.sessionId,
      state: "completed",
    },
  });
  const patchRequest = (await writes(p))[1];
  assert.deepEqual({ method: patchRequest.method, path: patchRequest.path, patch: patchRequest.body.patch, expectedRevision: patchRequest.body.expectedRevision }, {
    method: "PATCH",
    path: `/api/ai/conversations/sessions/${encodeURIComponent(first.body.sessionId)}`,
    patch: { groupId: "group:work" },
    expectedRevision: 0,
  });
  const now = "2026-09-12T03:00:00.000Z";
  await replyLastWrite(p, {
    session: {
      id: first.body.sessionId,
      title: "分组里的新问题",
      createdAt: now,
      updatedAt: now,
      messages: [{ id: first.body.clientMessageId, role: "user", text: "分组里的新问题" }, { id: "new-assistant", role: "assistant", text: "已经整理完成。" }],
      organization: { customTitle: null, groupId: "group:work", pinned: false, revision: 1 },
      pinned: false,
    },
    storage: aiSessionListPayload.storage,
  });
  assert.equal((await writes(p)).length, 2);
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: first.body.sessionId, source: "session" } }]);
});
test("AI reliable send creates stable ids before dispatch and queries an unknown result before retrying", async t => {
  const p = await open(t, { params: { id: "new" } });
  await p.getByRole("textbox").fill("需要可靠恢复的问题");
  await press(p, "发送消息");
  const firstWrite = (await writes(p))[0];

  assert.equal(firstWrite.path, "/api/ai/conversations");
  assert.equal(firstWrite.body.protocolVersion, 2);
  assert.equal(firstWrite.body.expectedMessageRevision, 0);
  assert.equal(firstWrite.body.message, "需要可靠恢复的问题");
  assert.deepEqual(firstWrite.body.references, []);
  assert.match(firstWrite.body.sessionId, /^agent-session-mobile-/);
  assert.ok(firstWrite.body.clientMessageId);
  assert.ok(firstWrite.body.requestId);
  assert.notEqual(firstWrite.body.clientMessageId, firstWrite.body.requestId);

  await replyLastWrite(p, undefined, 503);
  await press(p, "检查结果");
  const requests = await p.evaluate(() =>
    (window as any).fixture.requests.map((request: any) => ({
      method: request.method,
      url: request.url,
    })),
  );
  const recovery = requests.at(-1)!;

  assert.equal(recovery.method, "GET");
  assert.match(
    recovery.url,
    new RegExp(
      `/api/ai/conversations/sessions/${encodeURIComponent(firstWrite.body.sessionId)}\\?requestId=${encodeURIComponent(firstWrite.body.requestId)}`,
    ),
  );
  assert.equal((await writes(p)).length, 1, "unknown result recovery must not dispatch a second model request");
});
for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://other.example" }]) test("AI prefilled question does not transfer to another identity " + JSON.stringify(patch), async t => {
  const p = await open(t, { params: { id: "new", initialMessage: "原账号的活动背景" } });
  assert.deepEqual(await writes(p), []);
  await update(p, patch);
  assert.equal(await p.getByRole("textbox").inputValue(), "");
  assert.equal(await p.getByText("原账号的活动背景", { exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("AI conversation uses the source hierarchy with flat messages and retained shortcuts", async t => {
  const p = await open(t);
  assert.equal(await p.getByText("你", { exact: true }).count(), 1);
  assert.equal(await p.getByText("IORBIT", { exact: true }).count(), 2);
  const user = p.getByLabel("我的消息", { exact: true });
  assert.equal(await user.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
  await press(p, "更多对话选项"); await press(p, "活动"); assert.deepEqual(await navigation(p), ["/events"]);
  assert.deepEqual(await writes(p), []);
});
test("AI conversation preserves actual multilingual title and markdown business text", async t => {
  const payload = { ...aiConversationPayload, conversations: [{ ...aiConversationPayload.conversations[0], title: "Live provider 合作 / 日本語" }],
    messages: [{ ...aiConversationPayload.messages[0], content: "讨论 live provider 合作" }, { ...aiConversationPayload.messages[1], content: "Live provider 合作\n\n1. **确认范围**\n\n保留日本語と English 的原文。" }] };
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": payload } });
  assert.equal(await p.getByText("Live provider 合作 / 日本語", { exact: true }).count(), 1);
  assert.equal(await p.getByText("Live provider 合作", { exact: true }).count(), 1);
  assert.equal(await p.getByText("确认范围", { exact: true }).count(), 1);
  assert.equal(await p.getByText("保留日本語と English 的原文。", { exact: true }).count(), 1);
});
test("AI continuation submits only once on a synchronous double press", async t => {
  const p = await open(t); const input = p.getByRole("textbox"); await input.fill("再想一个方案"); await twice(p, "发送消息");
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/ai/conversations/conversation%3A1", body: { locale: "zh", message: "再想一个方案" } }]);
});
test("AI valid reply cannot clear a newer draft", async t => {
  const p = await open(t); const input = p.getByRole("textbox"); await input.fill("再想一个方案"); await press(p, "发送消息");
  await input.fill("下一条尚未发送"); await replyLastWrite(p, replyPayload());
  assert.equal(await input.inputValue(), "下一条尚未发送"); assert.equal(await p.getByText("可以先讨论时间安排。", { exact: true }).count(), 1);
});
for (const bad of [{}, { ...replyPayload(), state: "pending" }, { ...replyPayload(), activeConversationId: null }, { ...replyPayload(), messages: [] }]) test("AI malformed send result is visible failure and retains the question " + JSON.stringify(bad), async t => {
  const p = await open(t); await p.getByRole("textbox").fill("再想一个方案"); await press(p, "发送消息"); await replyLastWrite(p, bad);
  assert.equal(await p.getByText("这次回答没有生成", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox").inputValue(), "再想一个方案"); assert.equal((await writes(p)).length, 1);
});
test("AI failed send retries the submitted request and never consumes a newer draft", async t => {
  const p = await open(t); const input = p.getByRole("textbox"); await input.fill("再想一个方案"); await press(p, "发送消息"); await replyLastWrite(p, undefined, 503);
  assert.equal(await p.getByText("这次回答没有生成", { exact: true }).count(), 1);
  assert.equal(await p.getByText("UNAVAILABLE", { exact: true }).count(), 1);
  await input.fill("另一条草稿"); await twice(p, "重新生成");
  assert.deepEqual((await writes(p)).map((r: any) => r.body.message), ["再想一个方案", "再想一个方案"]);
  await replyLastWrite(p, replyPayload()); assert.equal(await input.inputValue(), "另一条草稿");
});
test("AI failed initial question can be edited without automatically resubmitting", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "帮我准备交流会" } });
  assert.equal((await writes(p)).length, 1); await replyLastWrite(p, undefined, 503); await press(p, "编辑问题");
  assert.equal(await p.getByRole("textbox").inputValue(), "帮我准备交流会"); assert.equal((await writes(p)).length, 1);
});
test("AI stored session preserves raw multiline history and its custom title", async t => {
  const session = { ...aiSession, customTitle: "Live provider 日本語", messages: [{ role: "user", text: "最初の相談\nEnglish context" }, { role: "assistant", text: "第一段\n\n1. **保留结构**\n\n第二段" }] };
  const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage } } });
  assert.equal(await p.getByText("Live provider 日本語", { exact: true }).count(), 1);
  assert.equal(await p.getByText("第一段", { exact: true }).count(), 1); assert.equal(await p.getByText("保留结构", { exact: true }).count(), 1);
  await p.getByRole("textbox").fill("继续讨论"); await press(p, "发送消息");
  assert.deepEqual(reliableRequestBase((await writes(p))[0]), { method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "继续讨论", history: [{ role: "user", content: "最初の相談\nEnglish context" }, { role: "assistant", content: "第一段\n\n1. **保留结构**\n\n第二段" }] } });
});
test("AI initial generation awaits a persisted matching session receipt before canonical navigation", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, replyPayload());
  const pending = await writes(p); assert.equal(pending.length, 2); assert.equal(pending[1].path, "/api/ai/conversations/sessions"); assert.deepEqual(await navigation(p), []);
  const session = pending[1].body.session; await replyLastWrite(p, { session, storage: aiSessionListPayload.storage });
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: session.id, source: "session" } }]);
});
for (const kind of ["unpersisted", "wrong-id", "missing-message", "http-failure"]) test("AI save failure retries only the same snapshot without generating again " + kind, async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, replyPayload());
  const submitted = (await writes(p))[1]; const session = submitted.body.session;
  const receipt = { session: kind === "wrong-id" ? { ...session, id: "another" } : kind === "missing-message" ? { ...session, messages: session.messages.slice(0, 1) } : session,
    storage: { ...aiSessionListPayload.storage, persisted: kind !== "unpersisted" } };
  await replyLastWrite(p, receipt, kind === "http-failure" ? 503 : 200);
  assert.deepEqual(await navigation(p), []); assert.equal(await p.getByRole("button", { name: "重试保存", exact: true }).count(), 1);
  await twice(p, "重试保存"); const retried = await writes(p); assert.equal(retried.length, 3); assert.deepEqual(retried[2], submitted);
  await replyLastWrite(p, { session, storage: aiSessionListPayload.storage }); assert.equal((await navigation(p)).length, 1);
});
test("AI generated reply keeps a newer draft when its session is saved", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await p.getByRole("textbox").fill("还没发送的下一条"); await replyLastWrite(p, replyPayload());
  const session = (await writes(p))[1].body.session; await replyLastWrite(p, { session, storage: aiSessionListPayload.storage });
  assert.equal(await p.getByRole("textbox").inputValue(), "还没发送的下一条"); assert.deepEqual(await navigation(p), []);
});
for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://other.example" }, { cookieHeader: "session=changed" }, { focused: false }, { signedIn: false }, { mounted: false }, { params: { id: "new-route" } }]) test("AI stale send cannot publish, save or navigate after scope replacement " + JSON.stringify(patch), async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } });
  const writeIndex = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.method === "POST"));
  await update(p, patch); await p.evaluate(({ writeIndex, payload }) => (window as any).fixture.reply(writeIndex, 200, payload), { writeIndex, payload: replyPayload() }); await settle(p);
  assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted ?? false, writeIndex), true);
  assert.equal((await writes(p)).filter((r: any) => r.path === "/api/ai/conversations").length, 1, "an inherited initial prompt must not replay under a new account or focus scope");
  assert.equal((await writes(p)).filter((r: any) => r.path === "/api/ai/conversations/sessions").length, 0); assert.deepEqual(await navigation(p), []);
});
test("AI refresh cannot erase a failed draft or submit its initial prompt twice", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, undefined, 503);
  await p.getByRole("textbox").fill("编辑后的草稿"); await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByRole("textbox").inputValue(), "编辑后的草稿"); assert.equal((await writes(p)).length, 1);
});

const suggestion = { id: "suggestion:1", accountId: "actor-1", ownerUserId: "actor-1", title: "准备交流会", reason: "需要确认场地", category: "event", status: "pending", evidenceIds: [], confidence: 0.9, deduplicationKey: "suggestion:1", createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z" };
const acceptedTask = { id: "task:1", accountId: "actor-1", ownerUserId: "actor-1", title: "准备交流会", status: "open", category: "event", priority: "normal", source: "ai_confirmed", suggestionId: "suggestion:1", createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z" };
const suggestedPayload = { ...aiConversationPayload, taskInteraction: { state: "suggested", title: suggestion.title, category: "event", suggestionId: suggestion.id, reason: suggestion.reason } };
const acceptedReceipt = { suggestion: { ...suggestion, status: "accepted", acceptedTaskId: acceptedTask.id }, task: acceptedTask };
test("AI task suggestion confirmation locks before the first response", async t => {
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": suggestedPayload } });
  assert.deepEqual(await writes(p), []); await twice(p, "加入待办"); assert.equal((await writes(p)).length, 1);
  assert.equal((await writes(p))[0].path, "/api/task-suggestions/suggestion%3A1/accept"); await replyLastWrite(p, acceptedReceipt);
  assert.equal(await p.getByText("已加入待办", { exact: true }).count(), 1); await press(p, "打开待办详情：准备交流会"); assert.deepEqual(await navigation(p), ["/tasks/task%3A1"]);
});
for (const bad of [{}, { ...acceptedReceipt, suggestion: { ...acceptedReceipt.suggestion, id: "another" } }, { ...acceptedReceipt, task: { ...acceptedTask, id: "mismatch" } }, { ...acceptedReceipt, suggestion: { ...suggestion, status: "pending" } }]) test("AI task suggestion cannot claim acceptance from an invalid receipt " + JSON.stringify(bad), async t => {
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": suggestedPayload } }); await press(p, "加入待办"); await replyLastWrite(p, bad);
  assert.equal(await p.getByText("已加入待办", { exact: true }).count(), 0); assert.equal(await p.getByRole("button", { name: "加入待办", exact: true }).count(), 1);
  assert.equal(await p.getByText("尚未确认操作结果，请重试。", { exact: true }).count(), 1);
});
test("AI dismiss requires the selected suggestion's dismissed receipt", async t => {
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": suggestedPayload } }); await press(p, "暂不需要"); await replyLastWrite(p, { suggestion });
  assert.equal(await p.getByText("已暂不处理", { exact: true }).count(), 0); await press(p, "暂不需要"); await replyLastWrite(p, { suggestion: { ...suggestion, status: "dismissed" } });
  assert.equal(await p.getByText("已暂不处理", { exact: true }).count(), 1);
  assert.equal((await writes(p))[0].body.idempotencyKey, (await writes(p))[1].body.idempotencyKey);
});
test("AI session continuation keeps old messages and an intentional repeated question in the save", async t => {
  const session = { ...aiSession, customTitle: "原始自定义标题", pinned: true, panel: { kind: "people", title: "旧面板" }, messages: [{ role: "user", text: "再想一个方案" }, { role: "assistant", text: "第一轮回复\n\n原文段落", items: [{ id: "old-evidence" }], kind: "people", panelTitle: "原始面板" }] };
  const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage } } });
  await p.getByRole("textbox").fill("再想一个方案"); await press(p, "发送消息"); await replyLastWrite(p, replyPayload());
  const save = (await writes(p))[1]; assert.equal(save.path, "/api/ai/conversations/sessions");
  assert.deepEqual(save.body.session.messages.map((m: any) => [m.role, m.text]), [["user", "再想一个方案"], ["assistant", "第一轮回复\n\n原文段落"], ["user", "再想一个方案"], ["assistant", "可以先讨论时间安排。"]]);
  assert.equal(save.body.session.customTitle, session.customTitle); assert.equal(save.body.session.pinned, true); assert.deepEqual(save.body.session.panel, session.panel);
  assert.deepEqual(save.body.session.messages[1].items, [{ id: "old-evidence" }]);
  await replyLastWrite(p, { session: save.body.session, storage: { ...aiSessionListPayload.storage, persisted: false } });
  assert.equal(await p.getByRole("button", { name: "重试保存", exact: true }).count(), 1); await press(p, "重试保存"); assert.deepEqual((await writes(p))[2], save);
});

test("AI saved session sends its complete recent history on every continuation", async t => {
  const session = { ...aiSession, customTitle: "原始自定义标题", pinned: true };
  const p = await open(t, { params: { id: session.id, source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage } } });
  const input = p.getByRole("textbox");
  await input.fill("再想一个方案"); await press(p, "发送消息"); await replyLastWrite(p, replyPayload());
  const firstSave = (await writes(p))[1];
  await replyLastWrite(p, { session: firstSave.body.session, storage: aiSessionListPayload.storage });
  await input.fill("接着讨论下一步"); await twice(p, "发送消息");
  assert.deepEqual(reliableRequestBase((await writes(p))[2]), { method: "POST", path: "/api/ai/conversations", body: {
    locale: "zh", message: "接着讨论下一步", history: [
      { role: "user", content: "讨论产品试点" }, { role: "assistant", content: "梳理了试点范围、时间节点和资源需求。" },
      { role: "user", content: "再想一个方案" }, { role: "assistant", content: "可以先讨论时间安排。" }
    ]
  } });
  await replyLastWrite(p, replyPayload("接着讨论下一步", "下一步核对参与人员。"));
  const secondSave = (await writes(p))[3];
  assert.equal(secondSave.path, "/api/ai/conversations/sessions");
  assert.equal(secondSave.body.session.id, "session:1");
  assert.equal(secondSave.body.session.customTitle, "原始自定义标题");
  assert.equal(secondSave.body.session.pinned, true);
  assert.deepEqual(secondSave.body.session.messages.map((m: any) => [m.role, m.text]), [
    ["user", "讨论产品试点"], ["assistant", "梳理了试点范围、时间节点和资源需求。"],
    ["user", "再想一个方案"], ["assistant", "可以先讨论时间安排。"],
    ["user", "接着讨论下一步"], ["assistant", "下一步核对参与人员。"]
  ]);
  await replyLastWrite(p, { session: secondSave.body.session, storage: aiSessionListPayload.storage });
  assert.equal((await writes(p)).length, 4); assert.deepEqual(await navigation(p), []);
});

test("AI draft continuation keeps confirmed history and queries a failed send without blind retry", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } });
  const input = p.getByRole("textbox"); await input.fill("接着讨论下一步");
  await replyLastWrite(p, replyPayload());
  const firstSave = (await writes(p))[1];
  await replyLastWrite(p, { session: firstSave.body.session, storage: aiSessionListPayload.storage });
  assert.deepEqual(await navigation(p), []);
  await press(p, "发送消息");
  const continuation = { method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "接着讨论下一步",
    history: [{ role: "user", content: "再想一个方案" }, { role: "assistant", content: "可以先讨论时间安排。" }] } };
  assert.deepEqual(reliableRequestBase((await writes(p))[2]), continuation);
  await replyLastWrite(p, undefined, 503);
  await input.fill("第三条问题尚未发送"); await press(p, "检查结果");
  assert.equal((await writes(p)).length, 3, "outcome-unknown recovery must not issue another POST");
  const lastRequest = await p.evaluate(() => {
    const request = (window as any).fixture.requests.at(-1);
    return { method: request.method, url: request.url };
  });
  assert.equal(lastRequest.method, "GET");
  assert.match(lastRequest.url, /\/api\/ai\/conversations\/sessions\/.+\?requestId=/);
  assert.equal(await input.inputValue(), "第三条问题尚未发送"); assert.deepEqual(await navigation(p), []);
});

test("AI edited first failure never becomes confirmed history for a new question", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "尚未成功的问题" } });
  await replyLastWrite(p, undefined, 503); await press(p, "编辑问题");
  await p.getByRole("textbox").fill("修改后重新提问"); await press(p, "发送消息");
  assert.deepEqual(reliableRequestBase((await writes(p))[1]), { method: "POST", path: "/api/ai/conversations", body: { locale: "zh", message: "修改后重新提问" } });
});

for (const session of [{ ...aiSession, id: "other-session" }, { ...aiSession, messages: [] }, {}]) test("AI invalid or mismatched session cannot become a successful empty conversation " + JSON.stringify(session), async t => {
  const p = await open(t, { params: { id: "session:1", source: "session" }, payloads: { ...conversationReadPayloads, "/api/ai/conversations/sessions/session%3A1": { session, storage: aiSessionListPayload.storage } } });
  assert.equal(await p.getByText("会话未能读取", { exact: true }).count(), 1); assert.equal(await p.getByText("没有消息", { exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

const sourceQuestion = "帮我整理明天交流会的准备事项。";
const sourceAnswer = "好的，以下是为你整理的准备事项，帮助你更高效地参与明天的交流会。\n\n1. **先准备一个具体问题**\n\n选一个正在推进的项目，说清楚目前卡在哪里。把背景控制在几句话内，给对方留下追问空间。\n\n2. **带上可分享的材料**\n\n准备一页项目介绍和一个能快速演示的原型。不必一次讲完全部功能，先确认对方最关心的部分。\n\n3. **会后记下约定**\n\n交流结束后整理讨论内容与下一步，再决定是否创建待办或日程。不要把尚未确认的想法写成已约定事项。";
const sourceReadPayloads = { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": replyPayload(sourceQuestion, sourceAnswer) };
test("AI real event reference uses a compact source-sized thumbnail and retains navigation", async t => {
  const payloads = { ...sourceReadPayloads, "/api/events": { events: [{ id: "event:1", title: "周末产品交流会", startsAt: "2026-09-12T14:00:00+09:00", endsAt: "2026-09-12T16:00:00+09:00", city: "东京", venue: "涩谷", status: "published", participantCount: 12, coverPath: "/orbit-covers/meeting.jpg" }] } };
  const p = await open(t, { payloads }); const row = p.getByRole("button").filter({ has: p.getByText("周末产品交流会", { exact: true }) });
  if (process.env.ORBIT_CAPTURE_AI) await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-conversation-reference-390.png" });
  assert.equal(await row.evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  const img = await p.getByTestId('ai-event-image-event:1').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
  assert.deepEqual(img, { width: 64, height: 52 });
  const rowBox = await row.boundingBox(); assert.ok(rowBox && rowBox.y < 620 && rowBox.y + rowBox.height < 714);
  await row.click(); assert.deepEqual(await navigation(p), ["/events/event%3A1"]);
});
test("AI conversation fits the supplied compact header with its centered brand", async t => {
  const p = await open(t, { payloads: sourceReadPayloads });
  if (process.env.ORBIT_CAPTURE_AI) await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-conversation-390.png" });
  const header = await p.getByLabel("对话导航", { exact: true }).boundingBox(); assert.equal(header?.height, 52);
  const brand = p.getByTestId("iorbit-brand-mark"); assert.equal(await brand.count(), 1); assert.equal((await brand.boundingBox())?.width, 18);
  const title = await p.getByText("交流会准备", { exact: true }).boundingBox(); assert.ok(title && Math.abs(title.x + title.width / 2 - 195) < 1);
});
test("AI conversation displays readable numbered steps with aligned supporting paragraphs", async t => {
  const p = await open(t, { payloads: sourceReadPayloads }); const number = p.getByText("1", { exact: true });
  assert.equal(await number.count(), 1); assert.equal(await number.evaluate(el => getComputedStyle(el).fontSize), "22px");
  const title = await p.getByText("先准备一个具体问题", { exact: true }).boundingBox();
  const detail = await p.getByText("选一个正在推进的项目，说清楚目前卡在哪里。把背景控制在几句话内，给对方留下追问空间。", { exact: true }).boundingBox();
  assert.ok(title && detail && Math.abs(title.x - detail.x) < 1);
});
test("AI conversation keeps related panels after the answer instead of interrupting it", async t => {
  const p = await open(t, { payloads: sourceReadPayloads });
  const lastParagraph = await p.getByText("交流结束后整理讨论内容与下一步，再决定是否创建待办或日程。不要把尚未确认的想法写成已约定事项。", { exact: true }).boundingBox();
  const related = await p.getByText("相关活动", { exact: true }).boundingBox();
  assert.ok(lastParagraph && related && related.y >= lastParagraph.y + lastParagraph.height);
});
test("AI conversation composer stays compact then grows without covering the send control", async t => {
  const p = await open(t); const input = p.getByRole("textbox", { name: "消息", exact: true }); assert.equal((await input.boundingBox())?.height, 44);
  await input.fill("第一行\n第二行\n第三行\n第四行\n第五行\n第六行"); const box = await input.boundingBox(), send = await p.getByRole("button", { name: "发送消息", exact: true }).boundingBox();
  assert.ok(box && box.height > 44 && box.height <= 120 && send && send.y >= box.y + box.height && send.height >= 44);
});
test("AI failure identifies the assistant and keeps the question editable", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: sourceQuestion } }); await replyLastWrite(p, undefined, 503);
  if (process.env.ORBIT_CAPTURE_AI) await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-failure-390.png" });
  assert.equal(await p.getByText("IORBIT", { exact: true }).count(), 2); await press(p, "编辑问题"); assert.equal(await p.getByRole("textbox").inputValue(), sourceQuestion);
});
test("AI failed generation stops showing a pending answer and puts recovery beside the question", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: sourceQuestion } }); await replyLastWrite(p, undefined, 503);
  assert.equal(await p.getByText("正在整理相关上下文。", { exact: true }).count(), 0);
  assert.equal(await p.getByText("正在处理", { exact: true }).count(), 0);
  const failure = await p.getByText("这次回答没有生成", { exact: true }).boundingBox(); assert.ok(failure && failure.y < 270);
});
test("AI suggestion acceptance recognizes the backend completed task status", async t => {
  const p = await open(t, { payloads: { ...conversationReadPayloads, "/api/ai/conversations/conversation%3A1": suggestedPayload } }); await press(p, "加入待办");
  await replyLastWrite(p, { ...acceptedReceipt, task: { ...acceptedTask, status: "completed", completedAt: "2026-09-12T00:00:00Z", completedBy: "actor-1", completionSource: "user" } });
  assert.equal(await p.getByText("已加入待办", { exact: true }).count(), 1);
});
for (const variant of [{ width: 320, fontScale: 1.6, suffix: "320" }, { width: 820, fontScale: 1, suffix: "820" }, { width: 390, fontScale: 1, dark: true, suffix: "dark" }]) test("AI conversation remains readable with reachable controls " + variant.suffix, async t => {
  const p = await open(t, { ...variant, payloads: sourceReadPayloads }); const input = p.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿\n第五行草稿\n第六行草稿");
  for (const label of ["返回 Orbit AI", "更多对话选项", "打开快捷入口", "发送消息"]) {
    const box = await p.getByRole("button", { name: label, exact: true }).boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= variant.width && box.y + box.height <= 820);
  }
  await p.getByTestId("conversation-history").evaluate(el => { el.scrollTop = el.scrollHeight; }); await settle(p);
  if (process.env.ORBIT_CAPTURE_AI) await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-conversation-" + variant.suffix + ".png" });
  await press(p, "打开快捷入口"); await press(p, "打开快捷入口"); assert.equal(await input.inputValue(), "第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿\n第五行草稿\n第六行草稿"); assert.deepEqual(await writes(p), []);
});
test("AI saved initial reply and newer draft survive a focus round trip", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await p.getByRole("textbox").fill("尚未发送的新草稿"); await replyLastWrite(p, replyPayload());
  const session = (await writes(p))[1].body.session; await replyLastWrite(p, { session, storage: aiSessionListPayload.storage });
  await update(p, { focused: false }); await update(p, { focused: true });
  assert.equal(await p.getByText("可以先讨论时间安排。", { exact: true }).count(), 1); assert.equal(await p.getByRole("textbox").inputValue(), "尚未发送的新草稿"); assert.equal((await writes(p)).length, 2);
});
test("AI consumed initial question cannot automatically replay on a full route remount", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, undefined, 503);
  await update(p, { mounted: false }); await update(p, { mounted: true }); assert.equal((await writes(p)).length, 1);
});
test("AI successful session persistence accepts protocol-normalized reply text", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, replyPayload("再想一个方案", "  完整回复保留段落。\n\n第二段。\n"));
  const session = (await writes(p))[1].body.session;
  await replyLastWrite(p, { session: { ...session, messages: session.messages.map((message: any) => ({ ...message, text: message.text.trim().slice(0, 12000) })) }, storage: aiSessionListPayload.storage });
  assert.equal((await navigation(p)).length, 1); assert.equal(await p.getByRole("button", { name: "重试保存", exact: true }).count(), 0);
});
test("AI canonical navigation adopts the saved receipt ID after server normalization", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } });
  await replyLastWrite(p, { ...replyPayload(), aiRuns: [{ runId: "run-" + "r".repeat(180) }] });
  const expected = (await writes(p))[1].body.session; const saved = { ...expected, id: expected.id.slice(0, 160) };
  assert.ok(expected.id.length > 160);
  await replyLastWrite(p, { session: saved, storage: aiSessionListPayload.storage });
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: saved.id, source: "session" } }]);
});
test("AI session receipt follows title, message and history protocol limits without accepting altered text", () => {
  const expected = { ...aiSession, title: "标题".repeat(65), customTitle: "名称".repeat(65), messages: Array.from({ length: 102 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, text: `第${i}条 ` + "文".repeat(12000) })) };
  const normalized = { ...expected, title: expected.title.slice(0, 120), customTitle: expected.customTitle.slice(0, 120), messages: expected.messages.slice(-100).map(item => ({ ...item, text: item.text.trim().slice(0, 12000) })) };
  assert.equal(aiSessionReceiptMatches({ session: normalized, storage: aiSessionListPayload.storage }, expected), true);
  assert.equal(aiSessionReceiptMatches({ session: { ...normalized, messages: normalized.messages.map((item, index) => index === 99 ? { ...item, text: "错误回复" } : item) }, storage: aiSessionListPayload.storage }, expected), false);
});
test("AI truncated session persistence is visibly limited and does not silently navigate", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, replyPayload("再想一个方案", "很长的回答。".repeat(2100)));
  const expected = (await writes(p))[1].body.session;
  await replyLastWrite(p, { session: { ...expected, messages: expected.messages.map((m: any) => ({ ...m, text: m.text.slice(0, 12000) })) }, storage: aiSessionListPayload.storage });
  assert.equal(await p.getByText("会话已保存，但超出上限的内容已截断。服务最多保留最近 100 条消息，每条 12,000 字、标题 120 字。", { exact: true }).count(), 1);
  const notice = await p.getByText(/会话已保存，但超出上限的内容已截断/).boundingBox(); assert.ok(notice && notice.y >= 100 && notice.y + notice.height < 714);
  assert.deepEqual(await navigation(p), []); assert.equal(await p.getByRole("button", { name: "重试保存", exact: true }).count(), 0);
  await update(p, { focused: false }); await update(p, { focused: true });
  assert.equal(await p.getByText(/会话已保存，但超出上限的内容已截断/).count(), 1);
});
test("AI interrupted session save resumes only saving and retains its draft after refocus", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await p.getByRole("textbox").fill("稍后再问"); await replyLastWrite(p, replyPayload());
  const save = (await writes(p))[1]; await update(p, { focused: false }); await update(p, { focused: true }); await press(p, "重试保存");
  assert.deepEqual((await writes(p))[2], save); await replyLastWrite(p, { session: save.body.session, storage: aiSessionListPayload.storage });
  assert.equal(await p.getByRole("textbox").inputValue(), "稍后再问"); assert.deepEqual(await navigation(p), []);
});
test("AI saved suggestion remains actionable after a focus round trip", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await replyLastWrite(p, { ...replyPayload(), taskInteraction: suggestedPayload.taskInteraction });
  const session = (await writes(p))[1].body.session; await replyLastWrite(p, { session, storage: aiSessionListPayload.storage });
  await update(p, { focused: false }); await update(p, { focused: true }); await press(p, "加入待办"); await replyLastWrite(p, acceptedReceipt);
  assert.equal((await writes(p)).length, 3); assert.equal((await navigation(p))[0].params.id, session.id);
});
test("AI saved reply and draft never transfer to another actor", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await p.getByRole("textbox").fill("账户一的草稿"); await replyLastWrite(p, replyPayload());
  const session = (await writes(p))[1].body.session; await replyLastWrite(p, { session, storage: aiSessionListPayload.storage }); await update(p, { actor: "actor-2" });
  assert.equal(await p.getByRole("textbox").inputValue(), ""); assert.equal(await p.getByText("可以先讨论时间安排。", { exact: true }).count(), 0); assert.equal((await writes(p)).length, 2);
});
test("AI interrupted initial request restores explicit recovery without an automatic replay", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await update(p, { focused: false }); await update(p, { focused: true });
  assert.equal(await p.getByRole("button", { name: "重新生成", exact: true }).count(), 1); assert.equal(await p.getByText("正在处理", { exact: true }).count(), 0); assert.equal((await writes(p)).length, 1);
});
test("AI refresh during generation leaves the owned write running", async t => {
  const p = await openAndSend(t, { params: { id: "new", initialMessage: "再想一个方案" } }); await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "POST").signal.aborted), false);
  await replyLastWrite(p, replyPayload()); assert.equal((await writes(p)).length, 2);
});
test("AI refresh keeps the existing transcript until a fresh conversation replaces the local reply", async t => {
  const p = await open(t); await p.getByRole("textbox").fill("再想一个方案"); await press(p, "发送消息"); await replyLastWrite(p, replyPayload());
  await p.getByRole("textbox").fill("刷新时保留草稿"); await update(p, { holdReads: true }); await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByText("可以先讨论时间安排。", { exact: true }).count(), 1);
  await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "GET" && r.path === "/api/ai/conversations/conversation%3A1"), 200, payload); }, replyPayload("再想一个方案", "来自另一端的新回复。")); await settle(p);
  assert.equal(await p.getByText("来自另一端的新回复。", { exact: true }).count(), 1); assert.equal(await p.getByRole("textbox").inputValue(), "刷新时保留草稿");
});

// Exercise the real route, client and screen with raw HTTP failures, not the
// JSON-only reply helper. Clearing drafts, auto-retrying or saving would fail.
for (const failure of [
  { name: "HTML login page", status: 200, contentType: "text/html", body: "<html>Sign in</html>", code: "ORBIT_APP_NON_JSON_RESPONSE" },
  { name: "HTML server error", status: 500, contentType: "text/html", body: "<html>Error: Synthetic compile failure at /srv/ai.ts</html>", code: "ORBIT_APP_NON_JSON_RESPONSE" },
  { name: "plain-text gateway error", status: 502, contentType: "text/plain", body: "Error: Synthetic gateway failure at /srv/proxy.ts", code: "ORBIT_APP_NON_JSON_RESPONSE" },
  { name: "JSON business error", status: 503, contentType: "application/json", body: '{"success":false,"error":{"code":"SERVICE_UNAVAILABLE","message":"Error: Synthetic service failure at /srv/ai.ts"}}', code: "SERVICE_UNAVAILABLE" },
]) test("AI raw failure preserves recovery and the newer draft: " + failure.name, async t => {
  const p = await open(t);
  const input = p.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("检查明天的安排");
  await press(p, "发送消息");
  const submitted = [{ method: "POST", path: "/api/ai/conversations/conversation%3A1", body: { locale: "zh", message: "检查明天的安排" } }];
  assert.deepEqual(await writes(p), submitted);
  await input.fill("这条草稿尚未发送");
  await p.evaluate(failure => {
    const state = (window as any).fixture;
    const index = state.requests.findLastIndex((request: any) => request.method === "POST");
    state.requests[index].replied = true;
    state.pending[index](new Response(failure.body, { status: failure.status, headers: { "Content-Type": failure.contentType } }));
  }, failure);
  await settle(p);
  assert.equal(await p.getByText("这次回答没有生成", { exact: true }).count(), 1);
  assert.equal(await p.getByText(failure.code, { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "重新生成", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "重试保存", exact: true }).count(), 0);
  assert.doesNotMatch(await p.locator("body").innerText(), /<html|Synthetic|\/srv\/|ORBIT_APP_NETWORK_ERROR/u);
  assert.equal(await input.inputValue(), "这条草稿尚未发送");
  await update(p, { focused: false });
  await update(p, { focused: true });
  assert.equal(await input.inputValue(), "这条草稿尚未发送");
  assert.equal(await p.getByText(failure.code, { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), submitted, "focus changes must not retry generation or save a failed answer");
  assert.deepEqual(await navigation(p), []);
});
