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
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let version = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => version);
const contact = { id: "contact:/1", displayName: "林悦", role: "产品设计师", organization: "云间工作室", location: "东京 · 日本", primaryIndustryId: "professional_services", primaryIndustryLabel: "专业服务", primaryEmail: "lin.yue@example.test", relationshipContext: "在设计交流会上认识", source: { type: "manual", label: "手动记录" }, status: "active", tags: ["设计合作", "用户研究"],
  publicProfile: { bio: "关注产品体验与跨团队协作。", offering: ["设计研究与原型验证"], seeking: ["产品与工程合作伙伴"], topics: [], conversationPrompts: [] }, evidence: [], lastInteraction: { channel: "手动记录", occurredAt: "2026-09-10T09:00:00+09:00", summary: "讨论合作方向" },
  nextAction: "确认产品试点范围", notes: [{ noteId: "note-1", body: "9月10日 · 合作方向讨论\\n确认产品试点范围。", createdAt: "2026-09-10T09:00:00+09:00", privacy: "private", authorLabel: "我" }] };
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, expiries: 0, contactId: contact.id, actor: "actor-1", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, focused: true, mounted: true, canGoBack: false, width: 390, fontScale: 1, language: "zh", contact, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); version++; listeners.forEach(fn => fn()); },
  data(path) {
    if (path.startsWith("/api/contacts/")) return state.invalid ? {} : { state: "success", contact: { ...state.contact, id: state.wrongId ? "wrong" : state.contactId, ...(state.longText ? { displayName: "林悦跨团队合作负责人", role: "产品体验与跨团队协作及服务设计负责人", primaryEmail: "long-contact-identity-without-shortening@example.test", publicProfile: { ...state.contact.publicProfile, offering: ["从用户访谈到交互原型验证及跨团队协作流程的完整研究与设计支持，保留全部合作信息。", "本地社区资源", "补充的第三项合作资源"] } } : {}) }, editableStatusOptions: ["active", "needs_follow_up", "nurture", "archived"], editableTagOptions: [], summary: "", nextAction: "" };
    if (path === "/api/connections") return { connections: [] };
    return {};
  },
  reply(index, status = 200, payload) { const r = state.requests[index];
    state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? state.data(r.path) : payload } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法保存，请重试" } }), { status, headers: { "Content-Type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => {
  const index = state.requests.length; const path = new URL(String(input)).pathname;
  state.requests.push({ path, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdConnections && path === "/api/connections") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => state.reply(index, init.method !== "GET" || state.failure ? 503 : 200));
  return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: { id: state.actor }, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useOrbitLocale = () => { observe(); return { language: state.language, t: createTranslator(state.language) }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useLocalSearchParams = () => { observe(); return { id: state.contactId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/contacts/" + encodeURIComponent(state.contactId);
export const useRouter = () => ({ canGoBack: () => state.canGoBack, back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); } });
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/contacts/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ink-detail-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "detail" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context|@react-navigation\/native)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "detail" }));
      plugin.onLoad({ filter: /.*/, namespace: "detail" }, args => ({ contents: args.path === "native" ? `
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
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  await settle(p); await p.evaluate(() => document.fonts.ready); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }

test("detail route presents real identity and basic/cooperation data in the approved open layout", async t => {
  const p = await open(t);
  for (const text of ["人脉详情", "基本资料", "简介与合作信息", "lin.yue@example.test", "关注产品体验与跨团队协作。", "设计研究与原型验证"]) assert.equal(await p.getByText(text, { exact: true }).count(), 1, text);
  const avatar = (await p.getByTestId("contact-detail-avatar").boundingBox())!; assert.equal(avatar.width, 72); assert.equal(avatar.height, 72);
  assert.equal(await p.getByRole("tablist", { name: "主导航" }).count(), 0);
  for (const name of ["编辑资料", "起草消息", "查看日程", "写备注"]) { const box = (await p.getByRole("button", { name, exact: true }).boundingBox())!; assert.ok(box.height >= 44 && box.width >= 44, name); }
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contact-detail-390-" + (process.env.CONTACT_DETAIL_QA_PASS ?? "current") + ".png" });
});

test("detail primary actions keep the real contact and do not send messages or create schedules", async t => {
  const p = await open(t); await press(p, "起草消息"); await press(p, "查看日程");
  const navigation = await p.evaluate(() => (window as any).fixture.navigation);
  assert.equal(navigation[0].pathname, "/ai/[id]"); assert.equal(navigation[0].params.id, "new"); assert.match(navigation[0].params.prefillIntent, /^ai-prefill-/);
  assert.doesNotMatch(JSON.stringify(navigation[0]), /contact:\/1|林悦|云间工作室/);
  assert.equal(navigation[1], "/schedule"); assert.deepEqual(await writes(p), []);
  await press(p, "写备注");
  await press(p, "查看全部关联笔记"); await press(p, "为此人新建笔记");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation.slice(2)), ["/notes?contactId=contact%3A%2F1", "/notes/new?contactId=contact%3A%2F1"]);
  assert.deepEqual(await writes(p), []);
});

test("detail previews existing private notes and opens the complete read-only section without writing", async t => {
  const p = await open(t);
  assert.equal(await p.getByText("9月10日 · 合作方向讨论\n确认产品试点范围。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox", { name: "添加联系人备注" }).count(), 0);
  await press(p, "笔记");
  assert.equal(await p.getByText("9月10日 · 合作方向讨论\n确认产品试点范围。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox", { name: "添加联系人备注" }).count(), 0);
  assert.match(await p.locator("body").innerText(), /历史内容不会迁移或删除/);
  assert.deepEqual(await writes(p), []);
});

for (const canGoBack of [false, true]) test("detail return respects navigation history " + canGoBack, async t => {
  const p = await open(t, { canGoBack }); await press(p, "返回人脉");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [canGoBack ? "back" : "/contacts"]);
});

for (const patch of [{ invalid: true }, { wrongId: true }, { failure: true }, { contact: { id: "contact:/1", displayName: "林悦" } }]) test("unavailable detail has retry and never invents a contact " + JSON.stringify(patch), async t => {
  const p = await open(t, patch); assert.equal(await p.getByText("林悦", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "编辑资料", exact: true }).count(), 0);
  await press(p, "重新读取人脉详情"); assert.ok(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path.startsWith("/api/contacts/")).length > 1));
  assert.deepEqual(await writes(p), []);
});

test("recent activity reads the nested interaction without turning private notes into activity", async t => {
  const p = await open(t); await p.getByRole("button", { name: /完整资料/ }).click();
  assert.equal(await p.getByText("讨论合作方向", { exact: true }).count(), 1);
  assert.equal(await p.getByText("还没有记录互动。", { exact: true }).count(), 0);
  assert.equal(await p.getByText("9月10日 · 合作方向讨论\n确认产品试点范围。", { exact: true }).count(), 1);
});

test("empty contract-valid company is shown as unfilled rather than fabricated", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.contact.organization = ""; s.refresh(); }); await settle(p);
  assert.doesNotMatch(await p.locator("body").innerText(), /Independent/);
  assert.ok(await p.getByText("未填写", { exact: true }).count() > 0);
});

test("editor is staged, presents only supported fields and cancels without writes", async t => {
  const p = await open(t); await press(p, "编辑资料");
  assert.equal(await p.getByRole("heading", { name: "编辑人脉", exact: true }).count(), 1);
  for (const value of ["林悦", "云间工作室", "产品设计师", "lin.yue@example.test"]) assert.ok(await p.getByTestId("contact-editor").getByText(value, { exact: true }).isVisible(), value);
  assert.equal(await p.getByRole("textbox", { name: "姓名" }).count(), 0);
  assert.equal(await p.getByText("更换头像", { exact: true }).count(), 0); assert.equal(await p.getByText("删除此人脉", { exact: true }).count(), 0);
  const avatar = (await p.getByTestId("contact-edit-avatar").boundingBox())!; assert.equal(avatar.width, 76); assert.equal(avatar.height, 76);
  const title = (await p.getByRole("heading", { name: "编辑人脉", exact: true }).boundingBox())!; assert.ok(Math.abs(title.x + title.width / 2 - 195) <= 1, "editor title is centered between equal-width actions");
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contact-edit-standard-390-" + (process.env.CONTACT_DETAIL_QA_PASS ?? "current") + ".png" });
  await press(p, "跟进状态：长期维护"); await p.getByRole("textbox", { name: "添加标签", exact: true }).fill("新合作"); await press(p, "添加此标签");
  assert.deepEqual(await writes(p), []); await press(p, "取消编辑");
  assert.equal(await p.getByRole("heading", { name: "人脉详情", exact: true }).count(), 1); assert.deepEqual(await writes(p), []);
  await press(p, "编辑资料"); assert.equal(await p.getByRole("button", { name: "移除标签：新合作", exact: true }).count(), 0);
  await press(p, "保存人脉"); assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("heading", { name: "人脉详情", exact: true }).count(), 1);
});

test("switching contact-detail language preserves the dirty draft, literal identity, and PATCH meaning", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "编辑资料");
  await p.getByRole("textbox", { name: "添加标签", exact: true }).fill("原文タグ / source");
  await p.getByRole("textbox", { name: "互动摘要", exact: true }).fill("Keep this draft / 下書き");
  await press(p, "跟进状态：长期维护");
  await press(p, "互动渠道：邮件");

  await update(p, { language: "ja" });
  assert.equal(await p.getByRole("heading", { name: "つながりを編集", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "フォロー状況: 長期フォロー", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await p.getByTestId("contact-editor").getByText("林悦", { exact: true }).count(), 1);
  assert.equal(await p.getByTestId("contact-editor").getByText("云间工作室", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox", { name: "タグを追加", exact: true }).inputValue(), "原文タグ / source");
  assert.equal(await p.getByRole("textbox", { name: "概要", exact: true }).inputValue(), "Keep this draft / 下書き");

  await update(p, { language: "en" });
  assert.equal(await p.getByRole("heading", { name: "Edit connection", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "Follow-up status: Long-term", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await p.getByRole("textbox", { name: "Add tag", exact: true }).inputValue(), "原文タグ / source");
  assert.equal(await p.getByRole("textbox", { name: "Summary", exact: true }).inputValue(), "Keep this draft / 下書き");
  await press(p, "Save");

  assert.deepEqual(await writes(p), [{ method: "PATCH", path: "/api/contacts/contact%3A%2F1", body: {
    status: "nurture",
    tags: ["设计合作", "用户研究", "原文タグ / source"],
    lastInteraction: { channel: "email_signal", occurredAt: "2026-09-10T09:00:00+09:00", summary: "Keep this draft / 下書き" }
  } }]);
});

test("editor submits one combined request only on explicit save and confirms returned fields", async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "编辑资料"); await press(p, "跟进状态：长期维护");
  await press(p, "选择主要行业"); await press(p, "设为科技与互联网");
  await press(p, "选择二级行业"); await press(p, "二级行业：人工智能与数据");
  await press(p, "移除标签：用户研究"); await p.getByRole("textbox", { name: "添加标签", exact: true }).fill("新合作"); await press(p, "添加此标签");
  assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; s.presses["保存人脉"](); s.presses["保存人脉"](); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "PATCH", path: "/api/contacts/contact%3A%2F1", body: { status: "nurture", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", tags: ["设计合作", "新合作"] } }]);
  await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findIndex((r: any) => r.method === "PATCH"); s.contact = { ...s.contact, ...s.requests[i].body }; s.reply(i, 200); }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "人脉详情", exact: true }).count(), 1); assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 1);
});

test("contact secondary industry survives save and reopening while a mismatched receipt keeps the draft", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "编辑资料");
  assert.equal(await p.getByRole("button", { name: "选择二级行业", exact: true }).count(), 1);
  await press(p, "选择主要行业"); await press(p, "设为科技与互联网");
  await press(p, "保存人脉");
  assert.deepEqual(await writes(p), [], "changing the parent without a child must not write");
  await press(p, "选择二级行业"); await press(p, "二级行业：人工智能与数据");
  await press(p, "保存人脉");
  assert.deepEqual(await writes(p), [{ method: "PATCH", path: "/api/contacts/contact%3A%2F1", body: {
    primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data"
  } }]);
  await p.evaluate(() => {
    const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "PATCH");
    const data = s.data(s.requests[i].path);
    data.contact = { ...data.contact, primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.cybersecurity" };
    s.reply(i, 200, data);
  }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "编辑人脉", exact: true }).count(), 1);
  assert.match(await p.getByRole("button", { name: "选择二级行业", exact: true }).innerText(), /人工智能与数据/);
  await press(p, "保存人脉");
  await p.evaluate(() => {
    const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "PATCH");
    s.contact = { ...s.contact, ...s.requests[i].body }; s.reply(i, 200);
  }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "人脉详情", exact: true }).count(), 1);
  assert.match(await p.locator("body").innerText(), /科技与互联网 \/ 人工智能与数据/);
  await press(p, "编辑资料");
  assert.match(await p.getByRole("button", { name: "选择二级行业", exact: true }).innerText(), /人工智能与数据/);
  await press(p, "选择主要行业"); await press(p, "设为金融与投资");
  assert.match(await p.getByRole("button", { name: "选择二级行业", exact: true }).innerText(), /二级未填写/);
  await press(p, "保存人脉");
  assert.equal((await writes(p)).length, 2);
});

test("editor retains pending drafts across refresh and rejects every unconfirmed acknowledgement", async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "编辑资料"); await press(p, "跟进状态：长期维护");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByRole("button", { name: "跟进状态：长期维护", exact: true }).getAttribute("aria-selected"), "true");
  for (const failure of ["http", "shape", "pending", "wrong-id", "mismatch", "non2xx-success"]) {
    await press(p, "保存人脉");
    await p.evaluate(failure => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "PATCH"); let data = s.data(s.requests[i].path);
      if (failure === "shape") data = {};
      if (failure === "pending") data.state = "pending";
      if (failure === "wrong-id") data.contact.id = "wrong";
      if (failure === "non2xx-success") data.contact.status = "nurture";
      s.reply(i, failure === "http" || failure === "non2xx-success" ? 503 : 200, failure === "http" ? undefined : data);
    }, failure); await settle(p);
    assert.equal(await p.getByRole("heading", { name: "编辑人脉", exact: true }).count(), 1, failure);
    assert.match(await p.locator("body").innerText(), /尚未确认保存成功/);
    assert.equal(await p.getByRole("button", { name: "跟进状态：长期维护", exact: true }).getAttribute("aria-selected"), "true");
  }
});

test("save includes a typed new tag even when Add was not pressed and retains it on failure", async t => {
  const p = await open(t); await press(p, "编辑资料"); const field = p.getByRole("textbox", { name: "添加标签", exact: true }); await field.fill("尚未点添加的新标签"); await press(p, "保存人脉");
  assert.deepEqual(await writes(p), [{ method: "PATCH", path: "/api/contacts/contact%3A%2F1", body: { tags: ["设计合作", "用户研究", "尚未点添加的新标签"] } }]);
  assert.equal(await field.inputValue(), "尚未点添加的新标签"); assert.match(await p.locator("body").innerText(), /尚未确认保存成功/);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-cookie-2" }, { baseUrl: "https://second.example" }, { contactId: "contact:/2" }, { focused: false }, { mounted: false }]) {
  test("editor cancels pending writes and rejects stale callbacks/401 after scope change " + JSON.stringify(patch), async t => {
    const p = await open(t, { holdWrites: true });
    await press(p, "编辑资料"); await press(p, "跟进状态：长期维护");
    const name = "保存人脉";
    await p.evaluate(name => { const s = (window as any).fixture; s.oldSave = s.presses[name]; s.oldSave(); }, name); await settle(p);
    assert.equal((await writes(p)).length, 1); await update(p, patch);
    await p.evaluate(() => { const s = (window as any).fixture; s.oldSave(); const i = s.requests.findIndex((r: any) => r.method === "PATCH"); s.reply(i, 401); }); await settle(p);
    assert.equal((await writes(p)).length, 1);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "PATCH").signal?.aborted), true);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
    assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 0);
  });
}

test("retained navigation callbacks cannot leave an inactive detail route", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.oldActions = [s.presses["起草消息"], s.presses["查看日程"], s.presses["返回人脉"]]; });
  await update(p, { focused: false }); await p.evaluate(() => (window as any).fixture.oldActions.forEach((fn: () => void) => fn())); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});

test("recompute is single-flight, aborts on scope change and ignores a late session expiry", async t => {
  const p = await open(t, { holdWrites: true }); await p.getByRole("button", { name: /完整资料/ }).click();
  await p.evaluate(() => { const s = (window as any).fixture; s.oldRecompute = s.presses["重新计算"]; s.oldRecompute(); s.oldRecompute(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/analysis/relationship-value/recompute", body: { connectionId: "contact:/1" } }]);
  await update(p, { actor: "actor-2" }); await p.evaluate(() => { const s = (window as any).fixture; s.oldRecompute(); const i = s.requests.findIndex((r: any) => r.method === "POST"); s.reply(i, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "POST").signal?.aborted), true);
});

test("recompute only announces a validated current-contact result, not a successful-looking envelope", async t => {
  const p = await open(t, { holdWrites: true }); await p.getByRole("button", { name: /完整资料/ }).click();
  const valid = { state: "success", summary: "关系价值已核对", nextAction: "核对证据", assessment: { id: "value-1", connectionId: "contact:/1", contactId: "contact:/1", contactDisplayName: "林悦", relationshipValueType: "community_bridge", priorityScore: { value: 72, band: "high", calculation: "来源证据", factors: [] }, rationale: { summary: "关系背景", evidence: [], limitations: [] }, suggestedNextAction: { label: "核对证据", dueWindow: "本周", channel: "manual_note", confidence: "medium", reason: "来源" }, sourceEvidenceIds: [], scoredAt: "2026-09-12", createdBy: "live-relationship-value-scoring-service" } };
  for (const failure of ["shape", "pending", "wrong-contact", "wrong-connection", "score", "non2xx-success"]) {
    await press(p, "重新计算"); await p.evaluate(({ failure, valid }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); const data = structuredClone(valid) as any;
      if (failure === "shape") delete data.assessment;
      if (failure === "pending") data.state = "pending";
      if (failure === "wrong-contact") data.assessment.contactId = "wrong";
      if (failure === "wrong-connection") data.assessment.connectionId = "wrong";
      if (failure === "score") data.assessment.priorityScore.value = "wrong";
      s.reply(i, failure === "non2xx-success" ? 503 : 200, data);
    }, { failure, valid }); await settle(p);
    assert.equal(await p.getByText("已重新计算。未创建任务，也没有发送消息。", { exact: true }).count(), 0, failure);
    assert.match(await p.locator("body").innerText(), /关系价值暂时算不了/);
  }
  await press(p, "重新计算"); await p.evaluate(valid => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); s.reply(i, 200, valid); }, valid); await settle(p);
  assert.equal(await p.getByText("72 分", { exact: true }).count(), 1);
  assert.equal(await p.getByText("已重新计算。未创建任务，也没有发送消息。", { exact: true }).count(), 1);
});

for (const timing of ["pending", "confirmed"]) test("resolved connection identity revokes the " + timing + " recompute and its retained callback", async t => {
  const p = await open(t, { holdWrites: true, holdConnections: true });
  await p.getByRole("button", { name: /完整资料/ }).click();
  await p.evaluate(() => { const s = (window as any).fixture; s.oldRecompute = s.presses["重新计算"]; s.oldRecompute(); }); await settle(p);
  const valid = { state: "success", summary: "关系价值已核对", nextAction: "核对证据", assessment: { id: "value-1", connectionId: "contact:/1", contactId: "contact:/1", contactDisplayName: "林悦", relationshipValueType: "community_bridge", priorityScore: { value: 72, band: "high", calculation: "来源证据", factors: [] }, rationale: { summary: "关系背景", evidence: [], limitations: [] }, suggestedNextAction: { label: "核对证据", dueWindow: "本周", channel: "manual_note", confidence: "medium", reason: "来源" }, sourceEvidenceIds: [], scoredAt: "2026-09-12", createdBy: "live-relationship-value-scoring-service" } };
  if (timing === "confirmed") {
    await p.evaluate(valid => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 200, valid); }, valid); await settle(p);
    assert.equal(await p.getByText("72 分", { exact: true }).count(), 1);
  }
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.path === "/api/connections"), 200, { connections: [{ id: "connection-real", contactId: "contact:/1" }] }); }); await settle(p);
  if (timing === "pending") {
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "POST").signal.aborted), true);
    await p.evaluate(valid => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 200, valid); }, valid); await settle(p);
  }
  assert.equal(await p.getByText("72 分", { exact: true }).count(), 0);
  assert.equal(await p.getByText("已重新计算。未创建任务，也没有发送消息。", { exact: true }).count(), 0);
  await p.evaluate(() => (window as any).fixture.oldRecompute()); await settle(p);
  assert.equal((await writes(p)).length, 1, "the retained callback must not dispatch for the fallback identity");
  await press(p, "重新计算");
  assert.deepEqual((await writes(p))[1], { method: "POST", path: "/api/analysis/relationship-value/recompute", body: { connectionId: "connection-real" } });
  await p.evaluate(valid => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, { ...valid, assessment: { ...valid.assessment, connectionId: "connection-real", priorityScore: { ...valid.assessment.priorityScore, value: 85 } } }); }, valid); await settle(p);
  assert.equal(await p.getByText("85 分", { exact: true }).count(), 1);
});

test("resolved connection identity suppresses an old recompute session-expiry response", async t => {
  const p = await open(t, { holdWrites: true, holdConnections: true }); await p.getByRole("button", { name: /完整资料/ }).click(); await press(p, "重新计算");
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.path === "/api/connections"), 200, { connections: [{ id: "connection-real", contactId: "contact:/1" }] }); }); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 401); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByRole("button", { name: "重新计算", exact: true }).isEnabled(), true);
});

for (const outcome of ["new-read-failure", "old-read-expiry"]) test("resolved connection identity clears a refreshed analysis during " + outcome, async t => {
  const p = await open(t, { holdReads: true });
  const valid = { state: "success", summary: "旧关系的分析", nextAction: "核对来源", assessment: { id: "old-value", connectionId: "contact:/1", contactId: "contact:/1", contactDisplayName: "林悦", relationshipValueType: "community_bridge", priorityScore: { value: 91, band: "high", calculation: "来源证据", factors: [] }, rationale: { summary: "旧关系的分析", evidence: [], limitations: [] }, suggestedNextAction: { label: "核对来源", dueWindow: "本周", channel: "manual_note", confidence: "medium", reason: "来源" }, sourceEvidenceIds: [], scoredAt: "2026-09-12", createdBy: "live-relationship-value-scoring-service" } };
  await p.evaluate(valid => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.path.startsWith("/api/contacts/"))); s.reply(s.requests.findIndex((r: any) => r.path.startsWith("/api/analysis/relationship-value/")), 200, valid); }, valid); await settle(p);
  await p.getByRole("button", { name: /完整资料/ }).click();
  assert.equal(await p.getByText("91 分", { exact: true }).count(), 1);
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  await p.evaluate(({ valid, outcome }) => { const s = (window as any).fixture; s.oldAnalysisIndex = s.requests.findLastIndex((r: any) => r.path.startsWith("/api/analysis/relationship-value/")); if (outcome === "new-read-failure") s.reply(s.oldAnalysisIndex, 200, valid); s.reply(s.requests.findLastIndex((r: any) => r.path === "/api/connections"), 200, { connections: [{ id: "connection-real", contactId: "contact:/1" }] }); }, { valid, outcome }); await settle(p);
  assert.equal(await p.getByText("91 分", { exact: true }).count(), 0, "old analysis cannot remain while a different connection loads");
  await p.evaluate(outcome => { const s = (window as any).fixture; if (outcome === "old-read-expiry") s.reply(s.oldAnalysisIndex, 401); s.reply(s.requests.findLastIndex((r: any) => r.path.endsWith("/connection-real")), 503); }, outcome); await settle(p);
  assert.equal(await p.getByText("91 分", { exact: true }).count(), 0, "a new-connection failure cannot restore the old assessment");
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.deepEqual(await writes(p), []);
});

test("archive, clear and interaction edits retain their actual supported PATCH meanings", async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "编辑资料");
  await press(p, "跟进状态：暂不推进"); await press(p, "移除标签：设计合作"); await press(p, "移除标签：用户研究");
  await press(p, "选择主要行业"); await press(p, "清空主要行业"); await press(p, "互动渠道：邮件");
  await p.getByRole("textbox", { name: "互动摘要", exact: true }).fill("下一轮从邮件确认范围"); await press(p, "保存人脉");
  assert.deepEqual(await writes(p), [{ method: "PATCH", path: "/api/contacts/contact%3A%2F1", body: { status: "archived", primaryIndustryId: null, secondaryIndustryId: null, tags: [], lastInteraction: { channel: "email_signal", occurredAt: "2026-09-10T09:00:00+09:00", summary: "下一轮从邮件确认范围" } } }]);
  await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findIndex((r: any) => r.method === "PATCH"); s.contact = { ...s.contact, ...s.requests[i].body }; s.reply(i); }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "人脉详情", exact: true }).count(), 1); assert.equal(await p.getByText("暂不推进", { exact: true }).count(), 1);
});

test("a valid empty recompute remains visibly inconclusive instead of reporting a completed assessment", async t => {
  const p = await open(t, { holdWrites: true }); await p.getByRole("button", { name: /完整资料/ }).click(); await press(p, "重新计算");
  await p.evaluate(() => { const s = (window as any).fixture; const i = s.requests.findIndex((r: any) => r.method === "POST"); s.reply(i, 200, { state: "empty", assessment: null, summary: "", nextAction: "" }); }); await settle(p);
  assert.equal(await p.getByText("当前证据不足，暂时无法判断关系价值。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("已重新计算。未创建任务，也没有发送消息。", { exact: true }).count(), 0);
});

for (const width of [320, 390, 820]) test("editor fields keep intrinsic height, full labels and reachable final inputs " + width, async t => {
  const p = await open(t, { width, fontScale: width === 320 ? 1.6 : 1, longText: true }); await press(p, "编辑资料"); const editor = p.getByTestId("contact-editor");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  for (const label of ["姓名", "公司", "职位", "邮箱"]) {
    const field = editor.getByText(label, { exact: true }).locator(".."); const box = (await field.boundingBox())!;
    assert.ok(box.height >= 62 && box.x >= 0 && box.x + box.width <= width, label + " field must contain its label and value");
    for (const child of await field.locator(":scope > div").all()) {
      const inner = (await child.boundingBox())!; assert.ok(inner.y >= box.y && inner.y + inner.height <= box.y + box.height + 1, label + " cannot overlap the next field");
    }
  }
  for (const name of ["取消编辑", "保存人脉", "选择主要行业"]) {
    const box = (await p.getByRole("button", { name, exact: true }).boundingBox())!; assert.ok(box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= width, name);
  }
  if (width >= 390) { const company = (await editor.getByText("公司", { exact: true }).locator("..").boundingBox())!; const role = (await editor.getByText("职位", { exact: true }).locator("..").boundingBox())!; assert.ok(Math.abs(company.width - role.width) < 1, "company and role keep the source's equal columns even with long text"); }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contact-edit-" + width + "-" + (process.env.CONTACT_DETAIL_QA_PASS ?? "current") + ".png" });
  const summary = p.getByRole("textbox", { name: "互动摘要", exact: true }); await summary.scrollIntoViewIfNeeded(); await summary.fill("最后一个互动字段仍然可编辑"); assert.equal(await summary.inputValue(), "最后一个互动字段仍然可编辑");
  const box = (await summary.boundingBox())!; assert.ok(box.y >= 0 && box.y + box.height <= 844);
  assert.deepEqual(await writes(p), []);
});

test("unfocused and signed-out detail route does not start private reads", async t => {
  for (const patch of [{ focused: false }, { signedIn: false }, { baseReady: false }]) { const p = await open(t, patch); assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0); }
});

for (const width of [320, 390, 820]) test("detail controls and long text fit their viewport " + width, async t => {
  const p = await open(t, { width, fontScale: width === 320 ? 1.6 : 1 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  for (const name of ["起草消息", "查看日程", "写备注", "编辑资料"]) {
    const button = p.getByRole("button", { name, exact: true }); const box = (await button.boundingBox())!;
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, name);
    assert.ok(await button.getByText(name, { exact: true }).evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), name);
    const label = (await button.getByText(name, { exact: true }).boundingBox())!;
    assert.ok(label.y >= box.y && label.y + label.height <= box.y + box.height && label.x >= box.x && label.x + label.width <= box.x + box.width, name + " label must stay inside its control");
  }
});

test("large-text detail preserves full long identity, email and cooperation text", async t => {
  const p = await open(t, { width: 320, fontScale: 1.6, longText: true });
  for (const value of ["林悦跨团队合作负责人", "long-contact-identity-without-shortening@example.test", "从用户访谈到交互原型验证及跨团队协作流程的完整研究与设计支持，保留全部合作信息。 · 本地社区资源 · 补充的第三项合作资源"]) {
    const label = p.getByText(value, { exact: true }).first();
    assert.equal(await label.count(), 1);
    assert.ok(await label.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), value + " must not be clipped");
    const box = (await label.boundingBox())!; assert.ok(box.x >= 0 && box.x + box.width <= 320);
  }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contact-detail-large-320-" + (process.env.CONTACT_DETAIL_QA_PASS ?? "current") + ".png", fullPage: true });
});
