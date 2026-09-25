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
import iconGlyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let version = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => version);
const names = [["林悦", "产品设计师", "云间工作室"], ["陈默", "产品经理", "山海科技"], ["周宁", "市场负责人", "松石咨询"], ["许妍", "创业者", "白露设计"], ["李珊", "用户研究", "谷雨科技"], ["王安", "软件工程师", "北辰工作室"], ["苏禾", "品牌设计", "夏木设计"], ["赵乔", "运营经理", "远山科技"]];
const contacts = names.map(([displayName, role, organization], i) => ({ id: "contact:/" + i, displayName, role, organization,
  location: "东京", profileSnippet: "", relationshipContext: "", lastInteractionAt: "", nextAction: "", source: { type: "manual", id: "source-" + i, label: "手动添加", evidenceId: "evidence-" + i },
  evidence: [], tags: [], value: { score: 80, valueTypes: [], rationale: "", evidenceIds: [] }, status: i === 0 ? "needs_follow_up" : "active" }));
const state = window.fixture = { requests: [], navigation: [], nativeCalls: [], expiries: 0, pending: [], presses: {}, actor: "one", cookieHeader: "", baseUrl: "https://orbit.example", signedIn: true, ready: true, baseReady: true,
  focused: true, mounted: true, fontScale: 1, width: 390, language: "zh", params: {}, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); version++; listeners.forEach(fn => fn()); },
  data(path, url) {
    if (path === "/api/contacts/page" || path === "/api/contacts/summary") {
      if (state.invalid) return { state: "success", contacts: [] };
      // An unfinished legacy response is not a valid empty page.
      if (state.pendingCollection) return { state: "pending", contacts: [] };
      const search = new URL(url).searchParams;
      const query = search.get("query") || "";
      const statuses = search.getAll("status");
      const items = state.empty ? [] : contacts.filter(c =>
        (c.displayName + c.organization).includes(query) && (!statuses.length || statuses.includes(c.status)));
      const asOf = "2026-09-25T00:00:00.000Z";
      if (path === "/api/contacts/summary") return {
        total: items.length, sources: { manual: items.length },
        statuses: Object.fromEntries(["active", "needs_follow_up"].map(status => [status, items.filter(c => c.status === status).length])),
        values: {}, tags: [], hasMoreTags: false, asOf
      };
      return { items: items.slice(0, 30).map(c => ({ id: c.id, displayName: c.displayName,
        organization: c.organization, role: c.role, sourceType: c.source.type, status: c.status,
        pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: asOf })),
        nextCursor: null, hasMore: false, asOf };
    }
    if (path === "/api/contacts") {
      const search = new URL(url).searchParams;
      const query = search.get("query") || "";
      const items = state.empty ? [] : contacts.filter(c => (c.displayName + c.organization).includes(query));
      return state.invalid ? { state: "success", contacts: [] } : { state: state.pendingCollection ? "pending" : items.length ? "success" : "empty", query,
        contacts: items, appliedFilters: {}, availableFilters: { sources: [{ value: "manual", label: "手动添加", count: items.length, selected: false }], tags: [], values: [], statuses: [] }, summary: "", nextAction: "" };
    }
    if (path.includes("suggestions")) return { suggestions: state.suggestions ? [{ id: "suggestion-1", query: "寻找创业伙伴", businessIntent: "explore_partnership", filterPreview: { industries: ["enterprise_saas"] }, evidenceHint: "来自人脉记录" }] : [] };
    if (path === "/api/contacts/search") return { ...state.data("/api/contacts", url), ...state.searchData };
    if (path === "/api/search/relationships") return { state: "empty", query: "林悦", results: [], appliedFilters: { businessIntent: null, industries: [], sources: [], valueTypes: [], followUpStatuses: [] }, summary: "", nextAction: "", ...state.searchData };
    return {};
  },
  reply(index, status = 200, payload) { const r = state.requests[index]; const data = payload === undefined ? state.data(r.path, r.url) : payload;
    state.pending[index]?.(new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法搜索，请重试" } }), { status, headers: { "Content-Type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => {
  const index = state.requests.length; const url = String(input); const path = new URL(url).pathname;
  state.requests.push({ url, path, method: init.method, body: init.body, signal: init.signal, actor: state.actor });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdSearch && init.method === "POST")) queueMicrotask(() => state.reply(index, init.method === "POST" || state.failure ? 503 : 200));
  return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.actor, actorId: state.actor, user: { id: state.actor }, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useOrbitLocale = () => { observe(); return { language: state.language, t: createTranslator(state.language) }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useLocalSearchParams = () => { observe(); return state.params; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => state.acquisition ? "/contacts/new" : "/contacts";
const router = { canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } };
export const useRouter = () => router;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(iconGlyphs[name])}</span>;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const CameraView = () => null;
export const useCameraPermissions = () => [null, async () => { state.nativeCalls.push("camera-permission"); return { granted: false }; }];
export const requestCameraPermissionsAsync = async () => { state.nativeCalls.push("camera-permission"); return { granted: false }; };
export const requestMediaLibraryPermissionsAsync = async () => { state.nativeCalls.push("photo-permission"); return { granted: false }; };
export const launchImageLibraryAsync = async () => { state.nativeCalls.push("photo-library"); return { canceled: true }; };
export const launchCameraAsync = async () => { state.nativeCalls.push("camera"); return { canceled: true }; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/(app)/contacts"; import Acquisition from "./app/contacts/new"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return !s.mounted ? null : s.acquisition ? <Acquisition /> : <Route />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ink-contact-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "contacts" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-camera|expo-image-picker)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "contacts" }));
      plugin.onLoad({ filter: /.*/, namespace: "contacts" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, StyleSheet, useWindowDimensions as useRealDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...useRealDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
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
  p.setDefaultTimeout(1500); const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await p.addScriptTag({ content: script }); await settle(p); await p.evaluate(() => document.fonts.ready);
  return p;
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function writes(p: Page): Promise<Array<{ path: string; method: string; body: Record<string, unknown> }>> { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ path: r.path, method: r.method, body: JSON.parse(r.body) }))); }

test("main contacts route shows the actual list, real count and Ink navigation without writes", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("button", { name: /打开联系人详情/ }).count(), 8);
  assert.equal(await p.getByTestId("contacts-main-count").innerText(), "8");
  assert.equal(await p.getByRole("tab", { name: "人脉", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await p.getByRole("button", { name: "返回联系人" }).count(), 0);
  assert.deepEqual(await writes(p), []);
  const reads = await p.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ path: r.path, limit: new URL(r.url).searchParams.get("limit") })));
  assert.ok(reads.some((r: any) => r.path === "/api/contacts/page" && r.limit === "30"));
  assert.ok(reads.some((r: any) => r.path === "/api/contacts/summary"));
  assert.ok(reads.every((r: any) => r.path !== "/api/contacts"), "the list must never download full contact records");
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contacts-390-" + (process.env.CONTACTS_QA_PASS ?? "current") + ".png" });
});

test("switching contact-list language preserves the query, literal identity, and selected contact id", async t => {
  const p = await open(t);
  const input = p.getByRole("textbox", { name: "搜索姓名、公司、资源", exact: true });
  await input.fill("林悦");
  await settle(p);

  await update(p, { language: "ja" });
  assert.equal(await p.getByRole("heading", { name: "つながり", exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox", { name: "名前、会社、リソースを検索", exact: true }).inputValue(), "林悦");
  assert.equal(await p.getByText("林悦", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: /林悦.*云间工作室.*連絡先詳細/u }).count(), 1);

  await update(p, { language: "en" });
  assert.equal(await p.getByRole("heading", { name: "People", exact: true }).count(), 1);
  assert.equal(await p.getByRole("textbox", { name: "Search names, companies, or resources", exact: true }).inputValue(), "林悦");
  await p.getByRole("button", { name: /林悦.*Open contact details for 林悦/u }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [{ params: { id: "contact:/0" }, pathname: "/contacts/[id]" }]);
  assert.deepEqual(await writes(p), []);
});

test("main contact controls preserve scan, manual, analysis, progress and library destinations", async t => {
  const p = await open(t);
  for (const name of ["扫名片", "手动添加", "人脉分析"]) {
    const box = (await p.getByRole("button", { name, exact: true }).boundingBox())!;
    assert.ok(box.width >= 44 && box.height >= 44, name); await press(p, name);
  }
  await press(p, "搜索选项");
  await press(p, "关系进展"); await press(p, "联系人库");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/new", "/contacts/new?mode=manual", "/contacts/dashboard", "/contacts/pipeline", "/contacts/list"]);
  await p.getByRole("button", { name: /林悦.*打开联系人详情/ }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), { params: { id: "contact:/0" }, pathname: "/contacts/[id]" });
  assert.deepEqual(await writes(p), []);
});

test("main search, clear and explicit deep and relationship search retain the original request contracts", async t => {
  const p = await open(t); const input = p.getByRole("textbox", { name: "搜索姓名、公司、资源" });
  await input.fill("林悦"); await settle(p);
  assert.equal(await p.getByRole("button", { name: /打开联系人详情/ }).count(), 1);
  await press(p, "搜索选项"); await press(p, "深度搜索");
  assert.match(await p.locator("body").innerText(), /暂时无法搜索，请重试/);
  await press(p, "关系搜索");
  const requests = await writes(p);
  assert.deepEqual(requests.map(r => [r.path, r.method, r.body.query]), [["/api/contacts/search", "POST", "林悦"], ["/api/search/relationships", "POST", "林悦"]]);
  assert.equal(await input.inputValue(), "林悦");
  await press(p, "清空搜索"); assert.equal(await p.getByRole("button", { name: /打开联系人详情/ }).count(), 8);
});

test("main filters retain their own meanings and All clears actual filtering", async t => {
  const p = await open(t);
  for (const [name, option] of [["行业筛选", "企业 SaaS"], ["进展筛选", "推进中"], ["行动筛选", "需要联系"], ["更多筛选", "添加方式"]]) {
    await press(p, name!); assert.ok(await p.getByText(option!, { exact: true }).count()); await press(p, name!);
  }
  await press(p, "行动筛选"); await p.getByRole("button", { name: /^需要联系 \d+$/ }).click(); await settle(p);
  assert.equal(await p.getByRole("button", { name: /打开联系人详情/ }).count(), 1);
  await press(p, "全部人脉"); assert.equal(await p.getByRole("button", { name: /打开联系人详情/ }).count(), 8);
  assert.deepEqual(await writes(p), []);
});

test("industry-only relationship search sends parent and distinct children without requiring query text", async t => {
  const p = await open(t, { holdSearch: true });
  await press(p, "搜索选项"); await press(p, "行业筛选");
  await press(p, "一级行业：科技与互联网");
  for (const [child, expected] of [
    [null, { primaryIndustryIds: ["technology_internet"] }],
    ["人工智能与数据", { primaryIndustryIds: ["technology_internet"], secondaryIndustryIds: ["technology_internet.ai_data"] }],
    ["企业软件与 SaaS", { primaryIndustryIds: ["technology_internet"], secondaryIndustryIds: ["technology_internet.enterprise_software"] }]
  ] as const) {
    if (child) await press(p, "二级行业：" + child);
    await press(p, "关系搜索");
    assert.deepEqual((await writes(p)).at(-1), { path: "/api/search/relationships", method: "POST", body: expected });
    await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST")); });
    await settle(p);
  }
  assert.equal((await writes(p)).length, 3);
});

test("changing the parent clears its child and All removes structured and legacy relationship filters", async t => {
  const p = await open(t, { holdSearch: true });
  await press(p, "搜索选项"); await press(p, "行业筛选");
  await press(p, "企业 SaaS");
  await press(p, "一级行业：科技与互联网"); await press(p, "二级行业：人工智能与数据");
  await press(p, "一级行业：制造与供应链");
  assert.equal(await p.getByRole("button", { name: "二级行业：人工智能与数据", exact: true }).count(), 0);
  await press(p, "关系搜索");
  assert.deepEqual((await writes(p)).at(-1)?.body, { industryFilters: ["enterprise_saas"], primaryIndustryIds: ["manufacturing_supply_chain"] });
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST")); });
  await settle(p); await press(p, "全部人脉");
  assert.equal(await p.getByRole("button", { name: "全部人脉", exact: true }).getAttribute("aria-selected"), "true");
  await p.getByRole("textbox", { name: "搜索姓名、公司、资源" }).fill("合作"); await settle(p);
  await press(p, "关系搜索");
  assert.deepEqual((await writes(p)).at(-1)?.body, { query: "合作" });
});

test("recent relationship searches keep different child filters and restore the original request", async t => {
  const p = await open(t, { holdSearch: true });
  await press(p, "搜索选项"); await press(p, "行业筛选");
  await press(p, "一级行业：科技与互联网");
  for (const label of ["人工智能与数据", "企业软件与 SaaS"]) {
    await press(p, "二级行业：" + label); await press(p, "关系搜索");
    await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST")); });
    await settle(p);
  }
  assert.equal(await p.getByRole("button", { name: "关系搜索 · 人工智能与数据", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "关系搜索 · 企业软件与 SaaS", exact: true }).count(), 1);
  await press(p, "关系搜索 · 人工智能与数据");
  assert.deepEqual((await writes(p)).at(-1)?.body, {
    primaryIndustryIds: ["technology_internet"], secondaryIndustryIds: ["technology_internet.ai_data"]
  });
  assert.equal(await p.getByRole("button", { name: "二级行业：人工智能与数据", exact: true }).getAttribute("aria-selected"), "true");
});

test("failed industry searches retain the selection for retry and account changes revoke the old criteria", async t => {
  const p = await open(t, { holdSearch: true });
  await press(p, "搜索选项"); await press(p, "行业筛选");
  await press(p, "一级行业：科技与互联网"); await press(p, "二级行业：人工智能与数据");
  await press(p, "关系搜索");
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 503); });
  await settle(p);
  assert.match(await p.locator("body").innerText(), /暂时无法搜索，请重试/);
  assert.equal(await p.getByRole("button", { name: "二级行业：人工智能与数据", exact: true }).getAttribute("aria-selected"), "true");
  await p.evaluate(() => { (window as any).oldRelationshipSearch = (window as any).fixture.presses["关系搜索"]; });
  await press(p, "关系搜索");
  const pending = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.method === "POST"));
  assert.deepEqual((await writes(p)).at(-1)?.body, {
    primaryIndustryIds: ["technology_internet"], secondaryIndustryIds: ["technology_internet.ai_data"]
  });
  await update(p, { actor: "two" });
  await p.evaluate(() => (window as any).oldRelationshipSearch()); await settle(p);
  assert.equal((await writes(p)).length, 2);
  assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, pending), true);
  await p.evaluate(index => (window as any).fixture.reply(index, 401), pending); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByRole("button", { name: "行业筛选", exact: true }).count(), 1);
  assert.equal(await p.getByText("最近搜索", { exact: true }).count(), 0);
  await p.getByRole("textbox", { name: "搜索姓名、公司、资源" }).fill("新账号合作"); await settle(p);
  await press(p, "搜索选项"); await press(p, "关系搜索");
  assert.deepEqual((await writes(p)).at(-1)?.body, { query: "新账号合作" });
});

test("real empty contacts use the two working source actions, not a fabricated directory", async t => {
  const p = await open(t, { empty: true });
  assert.equal(await p.getByTestId("contacts-main-count").innerText(), "0");
  assert.equal(await p.getByText("还没有人脉", { exact: true }).count(), 1);
  await press(p, "扫名片"); await press(p, "手动添加");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/new", "/contacts/new?mode=manual"]);
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contacts-empty-390-" + (process.env.CONTACTS_QA_PASS ?? "current") + ".png" });
});

for (const patch of [{ holdReads: true }, { failure: true }, { invalid: true }, { pendingCollection: true }]) {
  test("unavailable contacts do not become a zero directory " + JSON.stringify(patch), async t => {
    const p = await open(t, patch);
    assert.equal(await p.getByTestId("contacts-main-count").count(), 0);
    assert.doesNotMatch(await p.locator("body").innerText(), /还没有人脉/);
    if ("failure" in patch || "invalid" in patch || "pendingCollection" in patch) {
      await press(p, "重新读取人脉");
      assert.ok(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/contacts/page").length > 1));
    } else assert.ok(await p.getByRole("progressbar").count());
  });
}

test("main route stops private reads while unfocused or signed out", async t => {
  for (const patch of [{ focused: false }, { signedIn: false }, { baseReady: false }]) {
    const p = await open(t, patch);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
  }
});

for (const mode of [undefined, "manual", "qr", "invalid"]) {
  test("acquisition navigation selects only an existing mode " + String(mode), async t => {
    const p = await open(t, { acquisition: true, params: mode ? { mode } : {} });
    const name = mode === "manual" ? "手动" : mode === "qr" ? "QR" : "名片";
    assert.equal(await p.getByRole("tab", { name, exact: true }).getAttribute("aria-selected"), "true");
    assert.deepEqual(await p.evaluate(() => (window as any).fixture.nativeCalls), []);
    assert.deepEqual(await writes(p), []);
  });
}

for (const change of [{ actor: "two" }, { baseUrl: "https://other.example" }, { cookieHeader: "session=new" }, { focused: false }, { mounted: false }, { signedIn: false }]) {
  test("primary contact searches revoke retained actions and late 401 after " + JSON.stringify(change), async t => {
    const p = await open(t, { holdSearch: true });
    await p.getByRole("textbox", { name: "搜索姓名、公司、资源" }).fill("林悦"); await settle(p); await press(p, "搜索选项");
    await p.evaluate(() => { (window as any).oldDeepSearch = (window as any).fixture.presses["深度搜索"]; });
    await press(p, "深度搜索");
    const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.method === "POST"));
    assert.ok(index >= 0); await update(p, change);
    await p.evaluate(() => (window as any).oldDeepSearch()); await settle(p);
    assert.equal((await writes(p)).length, 1, "a retained callback must not dispatch for an old scope");
    assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, index), true);
    await p.evaluate(index => (window as any).fixture.reply(index, 401), index); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  });
}

test("primary search locks same-frame repeated submits and query changes cancel the previous result", async t => {
  const p = await open(t, { holdSearch: true });
  const input = p.getByRole("textbox", { name: "搜索姓名、公司、资源" });
  await input.fill("林悦"); await settle(p); await press(p, "搜索选项");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["深度搜索"]; fn(); fn(); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.method === "POST"));
  await input.fill("陈默"); await settle(p);
  assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, index), true);
  await press(p, "深度搜索"); assert.equal((await writes(p)).at(-1)?.body.query, "陈默");
});

for (const selection of ["suggestion", "recent"]) {
  test("selecting a " + selection + " cancels the pending search before starting the new criteria", async t => {
    const p = await open(t, { holdSearch: true, suggestions: selection === "suggestion" });
    const input = p.getByRole("textbox", { name: "搜索姓名、公司、资源" });
    await input.fill("林悦"); await settle(p); await press(p, "搜索选项");
    if (selection === "recent") {
      await press(p, "关系搜索");
      await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST")); }); await settle(p);
      assert.equal(await p.getByText("最近搜索", { exact: true }).count(), 1);
    }
    await input.fill("陈默"); await settle(p); await press(p, "深度搜索");
    const index = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.method === "POST"));
    const selectedQuery = selection === "suggestion" ? "寻找创业伙伴" : "林悦";
    await press(p, selectedQuery);
    assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, index), true);
    assert.equal((await writes(p)).at(-1)?.path, "/api/search/relationships");
    assert.equal((await writes(p)).at(-1)?.body.query, selectedQuery);
    assert.equal(await input.inputValue(), selectedQuery);
    await p.evaluate(index => (window as any).fixture.reply(index, 401), index); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
    assert.doesNotMatch(await p.locator("body").innerText(), /位匹配/);
  });
}

for (const name of ["深度搜索", "关系搜索"]) {
  for (const payload of [{}, { state: "success", contacts: [{}], results: [{}] }, { state: "pending", contacts: [], results: [] }]) {
    test(name + " reports malformed or unfinished 2xx results instead of a successful empty search " + JSON.stringify(payload), async t => {
      const p = await open(t, { holdSearch: true });
      const input = p.getByRole("textbox", { name: "搜索姓名、公司、资源" });
      await input.fill("林悦"); await settle(p); await press(p, "搜索选项"); await press(p, name);
      await p.evaluate(payload => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST"), 200, payload); }, payload); await settle(p);
      assert.match(await p.locator("body").innerText(), /未能确认搜索结果，请重试/);
      assert.doesNotMatch(await p.locator("body").innerText(), /暂无匹配|0 位相关人脉|最近搜索/);
      assert.equal(await input.inputValue(), "林悦");
      assert.equal(await p.getByRole("button", { name, exact: true }).isEnabled(), true);
    });
  }
  test(name + " accepts a contract-valid empty result", async t => {
    const p = await open(t, { holdSearch: true, empty: true, params: { query: "林悦" } });
    await press(p, "搜索选项"); await press(p, name);
    await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST")); }); await settle(p);
    assert.match(await p.locator("body").innerText(), name === "深度搜索" ? /暂无匹配/ : /0 位相关人脉/);
    assert.doesNotMatch(await p.locator("body").innerText(), /未能确认搜索结果/);
  });
  test(name + " displays valid real result identities and opens their contact", async t => {
    const p = await open(t, { holdSearch: true, searchData: name === "关系搜索" ? {
      state: "success", results: [{ id: "search-1", contactId: "contact:/7", displayName: "真实搜索命中", organization: "云间工作室", role: "设计师", industry: "enterprise_saas", location: "东京", relationshipContext: "在设计活动认识", recommendedAction: "交流设计经验", evidence: [{ excerpt: "会面记录" }], value: { valueTypes: [] }, matchScore: { value: 80, band: "high" } }]
    } : {} });
    await p.getByRole("textbox", { name: "搜索姓名、公司、资源" }).fill("林悦"); await settle(p);
    await press(p, "搜索选项"); await press(p, name);
    await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findIndex((r: any) => r.method === "POST")); }); await settle(p);
    assert.doesNotMatch(await p.locator("body").innerText(), /未能确认搜索结果/);
    const resultName = name === "关系搜索" ? "真实搜索命中" : "林悦";
    await p.getByRole("button").filter({ has: p.getByText(resultName, { exact: true }) }).first().click();
    assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), { params: { id: name === "关系搜索" ? "contact:/7" : "contact:/0" }, pathname: "/contacts/[id]" });
  });
}

for (const width of [320, 390, 820]) {
  test("main contacts fit their viewport with scaled text and scroll the final record above navigation " + width, async t => {
    const p = await open(t, { width, fontScale: width === 320 ? 1.6 : 1 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const last = p.getByRole("button", { name: /赵乔.*打开联系人详情/ });
    await last.evaluate(el => el.scrollIntoView({ block: "start" })); await settle(p);
    const box = (await last.boundingBox())!; const tabs = (await p.getByRole("tablist", { name: "主导航" }).boundingBox())!;
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    assert.ok(box.y + box.height <= tabs.y, JSON.stringify({ box, tabs }));
    if (width === 320 && process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-contacts-large-320-" + (process.env.CONTACTS_QA_PASS ?? "current") + ".png" });
  });
}

test("large-text filters expose complete visible labels without squeezing or clipping", async t => {
  const p = await open(t, { width: 320, fontScale: 1.6 });
  for (const label of ["行业", "进展", "行动", "更多"]) {
    const button = p.getByRole("button", { name: label + "筛选", exact: true });
    await button.evaluate(el => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
    assert.ok(await button.getByText(label, { exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), label + " must not be ellipsized");
    const box = (await button.boundingBox())!; assert.ok(box.height >= 44 && box.width >= 44);
  }
});

test("main scan action uses the approved source asset including the scan line", async t => {
  const p = await open(t);
  const scan = p.getByRole("button", { name: "扫名片", exact: true });
  assert.equal(await scan.locator("svg").count(), 1);
  assert.match((await scan.locator("path").getAttribute("d"))!, /M3 12h18/);
});
