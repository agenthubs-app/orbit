import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { acceptedProfileSuggestionPayload, emptyProfilePayload, profileContactsPayload, profileExtractionPayload, profilePayload, profileReadPayloads, profileSchedulePayload, profileSuggestion, profileSuggestionsPayload, profileTasksPayload, readyProfileSuggestionsPayload } from "./helpers/profile-detail-fixtures";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
// Real route, private boundary, resource/client, view-models, screen and tabbar.
// Only HTTP, native capabilities and auth/device environment are controlled.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const NativeDate = Date;
window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-09-12T00:00:00Z"])); } static now() { return NativeDate.parse("2026-09-12T00:00:00Z"); } };
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, picks: [], expiries: 0, actor: "actor-1", name: "程川", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, focused: true, mounted: true, width: 390, fontScale: 1, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  reply(index, status = 200, payload) { const r = state.requests[index]; r.replied = true; state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? state.payloads[r.path] : payload } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取，请重试。" } }), { status, headers: { "Content-Type": "application/json" } })); }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input));
  state.requests.push({ path: url.pathname, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => state.reply(index, init.method !== "GET" ? 503 : (state.failPaths?.includes(url.pathname) ? 503 : 200)));
  return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.actor, name: state.name, email: "person@example.test" } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useGlobalSearchParams = () => ({ complete: state.complete, next: state.next });
export const usePathname = () => "/profile";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); } });
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }, (edges?.includes?.("bottom") || edges?.bottom) && { paddingBottom: 24 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const launchImageLibraryAsync = async options => { state.picks.push({ kind: "image", options }); return new Promise(resolve => state.finishPick = resolve); };
export const getDocumentAsync = async options => { state.picks.push({ kind: "document", options }); return new Promise(resolve => state.finishPick = resolve); };
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
let mutationSequence = 0;
export const randomUUID = () => { if (state.failMutationId) throw new Error("Device random source unavailable"); return "profile-fixture-" + ++mutationSequence; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/(app)/profile"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "profile-http-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "profile" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|expo-image-picker|expo-document-picker|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "profile" }));
      plugin.onLoad({ filter: /.*/, namespace: "profile" }, args => ({ contents: args.path === "native" ? `
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
  await p.route("**/*", r => r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { payloads: profileReadPayloads, ...patch }); await p.addScriptTag({ content: script });
  await settle(p); await p.evaluate(() => document.fonts.ready);
  return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function navigation(p: Page) { return p.evaluate(() => (window as any).fixture.navigation); }
async function edit(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await open(t, { holdWrites: true, payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": readyProfileSuggestionsPayload }, ...patch });
  await press(p, "编辑资料"); return p;
}
async function pressTwice(p: Page, label: string) {
  await p.evaluate(label => { const onPress = (window as any).fixture.presses[label]; onPress(); onPress(); }, label); await settle(p);
}
async function replyWrite(p: Page, data: unknown, status = 200) {
  await p.evaluate(({ data, status }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method !== "GET"); s.reply(i, status, data); }, { data, status }); await settle(p);
}
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
async function savedProfile(p: Page, profile: Record<string, unknown>) {
  return { ...profilePayload, onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] },
    mutationId: (await writes(p)).at(-1).body.mutationId,
    profile: { ...profilePayload.profile, ...profile, updatedAt: "2026-09-12T00:00:01Z" },
    editor: { ...profilePayload.editor, lastSavedAt: "2026-09-12T00:00:01Z" } };
}

test("profile completion opens the existing editor from the server policy without writing", async t => {
  const p = await open(t, { complete: "1", next: "/events/event-1", payloads: { ...profileReadPayloads,
    "/api/profile": { ...profilePayload, onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } } } });
  await p.getByRole("textbox", { name: "生日（仅自己可见）", exact: true }).waitFor();
  assert.equal(await p.getByText("还需填写：生日", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
  assert.deepEqual(await navigation(p), []);
});

for (const [next, expected] of [["/events/event-1?tab=details", "/events/event-1?tab=details"], ["https://untrusted.test", "/dashboard"]]) {
  test("profile completion already complete returns only to a safe target " + next, async t => {
    const p = await open(t, { complete: "1", next, payloads: { ...profileReadPayloads,
      "/api/profile": { ...profilePayload, onboarding: { policyVersion: 1, status: "complete", missingFields: [] } } } });
    await p.waitForFunction(() => (window as any).fixture.navigation.length > 0);
    assert.deepEqual(await navigation(p), [expected]);
    assert.deepEqual(await writes(p), []);
  });
}

test("profile completion cannot infer a missing policy from the old richness score", async t => {
  const p = await open(t, { complete: "1", next: "/events/event-1" });
  await p.getByText("尚未确认资料补全状态，请重试。", { exact: true }).waitFor();
  assert.deepEqual(await navigation(p), []);
  assert.deepEqual(await writes(p), []);
});

test("profile completion returns to the safe target only after the matching save completes the server policy", async t => {
  const p = await open(t, { complete: "1", next: "/events/event-1", holdWrites: true, payloads: { ...profileReadPayloads,
    "/api/profile": { ...profilePayload, onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } } } });
  await p.getByRole("textbox", { name: "生日（仅自己可见）", exact: true }).fill("2000-02-29");
  await press(p, "保存资料");
  assert.deepEqual(await navigation(p), []);
  const sent = (await writes(p))[0].body;
  await replyWrite(p, { ...profilePayload, mutationId: sent.mutationId,
    onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
    profile: { ...profilePayload.profile, birthDate: "2000-02-29", updatedAt: "2026-09-12T00:00:01Z" },
    editor: { ...profilePayload.editor, lastSavedAt: "2026-09-12T00:00:01Z" } });
  assert.deepEqual(await navigation(p), ["/events/event-1"]);
});

test("profile CAS retry keeps the original version and mutation ID across a failed save", async t => {
  const p = await edit(t);
  await p.getByRole("textbox", { name: "简介", exact: true }).fill("保留的介绍");
  await press(p, "保存资料");
  const first = (await writes(p))[0].body;
  assert.equal(first.expectedUpdatedAt, "2026-09-12T00:00:00Z");
  assert.equal(typeof first.mutationId, "string");
  assert.ok(first.mutationId.length > 0);
  await replyWrite(p, undefined, 503);
  await press(p, "保存资料");
  assert.deepEqual((await writes(p))[1].body, first);
});

test("profile CAS device ID failure stays visible without writing or losing the draft", async t => {
  const p = await edit(t, { failMutationId: true });
  const bio = p.getByRole("textbox", { name: "简介", exact: true });
  await bio.fill("设备失败时保留");
  await press(p, "保存资料");
  await p.getByText("暂时无法准备保存，请重试。", { exact: true }).waitFor();
  assert.equal(await bio.inputValue(), "设备失败时保留");
  assert.deepEqual(await writes(p), []);
});

test("profile CAS refresh cannot attach a newer server version to an older dirty draft", async t => {
  const p = await edit(t);
  const bio = p.getByRole("textbox", { name: "简介", exact: true });
  await bio.fill("我的未保存介绍");
  const newer = { ...profilePayload, profile: { ...profilePayload.profile, bio: "另一端的新介绍", updatedAt: "2026-09-12T00:00:02Z" }, editor: { ...profilePayload.editor, lastSavedAt: "2026-09-12T00:00:02Z" } };
  await update(p, { payloads: { ...profileReadPayloads, "/api/profile": newer } });
  await refresh(p);
  assert.equal(await bio.inputValue(), "我的未保存介绍");
  await press(p, "保存资料");
  assert.equal((await writes(p))[0].body.expectedUpdatedAt, "2026-09-12T00:00:00Z");
  await replyWrite(p, undefined, 409);
  await p.getByText("资料已在其他地方更新。草稿已保留，请刷新后核对。", { exact: true }).waitFor();
  assert.equal(await bio.inputValue(), "我的未保存介绍");
  await press(p, "放弃草稿并载入最新资料");
  assert.equal(await bio.inputValue(), "另一端的新介绍");
  assert.equal((await writes(p)).length, 1);
});

test("profile private birthday stays in the editor and saves the unchanged calendar day", async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile": { ...profilePayload, profile: { ...profilePayload.profile, birthDate: "2000-02-29" } } } });
  const birth = p.getByRole("textbox", { name: "生日（仅自己可见）", exact: true });
  assert.equal(await birth.inputValue(), "2000-02-29");
  await birth.fill("1996-02-29");
  await press(p, "保存资料");
  assert.equal((await writes(p))[0].body.birthDate, "1996-02-29");
  await replyWrite(p, undefined, 503);
  await press(p, "返回资料预览");
  assert.equal(await p.getByText("2000-02-29", { exact: true }).filter({ visible: true }).count(), 0);
  await press(p, "编辑资料");
  assert.equal(await birth.inputValue(), "1996-02-29");
});

test("profile overview follows the approved hierarchy with real statistics and no writes", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("heading", { name: "我的", exact: true }).count(), 1);
  const avatar = await p.getByTestId("profile-avatar").boundingBox();
  assert.equal(avatar?.width, 72); assert.equal(avatar?.height, 72);
  assert.equal(await p.getByRole("textbox").count(), 0, "editing is opened explicitly");
  for (const label of ["人脉 2", "今日待办 3", "近期日程 2"]) assert.equal(await p.getByRole("button", { name: label, exact: true }).count(), 1);
  for (const text of ["基本资料", "互联网", "星野工作室", "产品经理", "记录工作中的交流，也寻找能一起做事的人。"]) assert.equal(await p.getByText(text, { exact: true }).count(), 1);
  for (const group of ["我能提供", "我想寻找", "想聊的话题"]) assert.equal(await p.getByLabel(group, { exact: true }).count(), 1);
  assert.equal(await p.getByRole("tab", { name: "我的", exact: true }).getAttribute("aria-selected"), "true");
  assert.deepEqual(await writes(p), []);
  const queries = await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.url));
  assert.ok(queries.some((url: string) => url.endsWith("/api/tasks?status=open")));
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-390-" + (process.env.PROFILE_QA_PASS ?? "round1") + ".png" });
});

test("profile industry pickers send a parent-child pair and preserve the draft on failed receipt", async t => {
  const p = await edit(t);
  await press(p, "选择主要行业");
  await press(p, "主要行业：科技与互联网");
  await press(p, "选择二级行业");
  await press(p, "二级行业：人工智能与数据");
  await press(p, "保存资料");
  const request = (await writes(p)).at(-1)!;
  assert.equal(request.body.primaryIndustryId, "technology_internet");
  assert.equal(request.body.secondaryIndustryId, "technology_internet.ai_data");
  await replyWrite(p, {}, 503);
  assert.equal(await p.getByText("人工智能与数据", { exact: true }).count(), 1);
  await press(p, "选择主要行业");
  await press(p, "主要行业：金融与投资");
  assert.equal(await p.getByRole("button", { name: "保存资料", exact: true }).isDisabled(), true);
  await press(p, "选择二级行业");
  assert.equal(await p.getByRole("button", { name: "二级行业：人工智能与数据", exact: true }).count(), 0);
});

for (const actor of ["user_mry5y200_58jpi8", "actor-1"]) {
  for (const fields of [
    { displayName: "林悦", industry: "音乐", organization: "蓝桥工作室", role: "制作人", bio: "寻找一起做音乐的伙伴。", offering: ["录音制作"], seeking: ["演出伙伴"], topics: ["独立音乐"], relationshipGoal: "认识独立创作者" },
    { displayName: "さくら", industry: "おんがく", organization: "はるスタジオ", role: "プロデューサー", bio: "いっしょにおんがくをつくりたい。", offering: ["レコーディング"], seeking: ["コラボレーター"], topics: ["ライブ"], relationshipGoal: "パートナーをさがす" },
    { displayName: "Alex Chen", industry: "Audio", organization: "Live Music Studio", role: "Producer", bio: "I build generated sound tools for live music.", offering: ["Recording"], seeking: ["Music partners"], topics: ["Live audio"], relationshipGoal: "Meet independent creators" }
  ]) test(`profile preserves server identity and original fields for every account: ${actor} ${fields.displayName}`, async t => {
    const payload = { ...profilePayload, profile: { ...profilePayload.profile, ...fields } };
    const p = await open(t, { actor, name: "Different login name", payloads: { ...profileReadPayloads, "/api/profile": payload } });
    for (const value of [fields.displayName, fields.industry, fields.organization, fields.role, fields.bio, fields.relationshipGoal, ...fields.offering, ...fields.seeking, ...fields.topics]) {
      assert.equal(await p.getByText(value, { exact: true }).count(), 1, value);
    }
    assert.equal(await p.getByText("Different login name", { exact: true }).count(), 0);
    await press(p, "编辑资料");
    for (const [label, value] of [["名字", fields.displayName], ["简介", fields.bio], ["我能提供", fields.offering[0]], ["我想认识", fields.seeking[0]]] as const) {
      assert.equal(await p.getByRole("textbox", { name: label, exact: true }).inputValue(), value);
    }
    await p.getByRole("textbox", { name: "简介", exact: true }).fill("Unsubmitted draft · まだ保存していない");
    await refresh(p); await press(p, "返回资料预览");
    assert.equal(await p.getByText(fields.displayName, { exact: true }).count(), 1);
    await press(p, "编辑资料");
    assert.equal(await p.getByRole("textbox", { name: "简介", exact: true }).inputValue(), "Unsubmitted draft · まだ保存していない");
    assert.deepEqual(await writes(p), []);
  });
}

for (const profile of [null, { ...profilePayload.profile, displayName: "", headline: "", industry: "", organization: "", role: "", bio: "", relationshipGoal: "", offering: [], seeking: [], topics: [] }]) {
  test(`profile keeps absent fields empty for the formerly aliased account: ${profile === null ? "missing" : "blank"}`, async t => {
    const payload = profile === null ? emptyProfilePayload : { ...profilePayload, profile };
    const p = await open(t, { actor: "user_mry5y200_58jpi8", name: "Actual login name", payloads: { ...profileReadPayloads, "/api/profile": payload } });
    assert.equal(await p.getByText("尚未填写个人资料", { exact: true }).count(), 1);
    assert.equal(await p.getByText("未填写", { exact: true }).count(), 4);
    for (const value of ["小雨", "Actual login name", "Orbit", "企业 AI 场景梳理与落地"]) assert.equal(await p.getByText(value, { exact: true }).count(), 0);
    for (const label of ["我能提供", "我想寻找", "想聊的话题"]) assert.equal(await p.getByLabel(label, { exact: true }).innerText(), "");
    await press(p, "编辑资料");
    for (const label of ["名字", "简介", "我能提供", "我想认识"]) assert.equal(await p.getByRole("textbox", { name: label, exact: true }).inputValue(), "");
    assert.deepEqual(await writes(p), []);
  });
}

test("profile counters occupy three equal columns despite different labels and numbers", async t => {
  const p = await open(t);
  const boxes = await Promise.all(["人脉 2", "今日待办 3", "近期日程 2"].map(label => p.getByRole("button", { name: label, exact: true }).boundingBox()));
  assert.ok(boxes.every(box => box && Math.abs(box.width - 358 / 3) < 1 && box.height >= 76));
  assert.ok(boxes[0] && boxes[1] && boxes[2] && boxes[0].y === boxes[1].y && boxes[1].y === boxes[2].y);
});

for (const [label, href] of [["设置", "/settings"], ["账号与工作区", "/account"], ["人脉 2", "/contacts"], ["今日待办 3", "/tasks"], ["近期日程 2", "/schedule"]]) test("profile real navigation " + label, async t => {
  const p = await open(t); await press(p, label!);
  assert.deepEqual(await navigation(p), [href]); assert.deepEqual(await writes(p), []);
});

test("profile edit is explicit and returning to the overview preserves the unsubmitted draft", async t => {
  const p = await open(t); await press(p, "编辑资料");
  const bio = p.getByRole("textbox", { name: "简介", exact: true });
  await bio.fill("还在编辑的一段简介"); await press(p, "返回资料预览");
  assert.equal(await p.getByText("记录工作中的交流，也寻找能一起做事的人。", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
  await press(p, "编辑资料"); assert.equal(await bio.inputValue(), "还在编辑的一段简介");
  assert.equal(await p.getByRole("button", { name: "提取名片", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "提取简历", exact: true }).count(), 1);
});

test("profile statistics show real zero and keep a failed counter distinct with independent retry", async t => {
  const payloads = { ...profileReadPayloads, "/api/contacts": { ...profileContactsPayload, state: "empty", contacts: [] }, "/api/tasks": { tasks: [] }, "/api/schedule-items": { scheduleItems: [] } };
  const p = await open(t, { payloads, failPaths: ["/api/tasks"] });
  for (const label of ["人脉 0", "近期日程 0"]) assert.equal(await p.getByRole("button", { name: label, exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "今日待办 0", exact: true }).count(), 0);
  assert.equal(await p.getByText("未读到", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-statistic-failure.png" });
  const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await update(p, { failPaths: [], holdReads: true }); await press(p, "重试今日待办");
  await p.waitForFunction(before => (window as any).fixture.requests.length > before, before);
  assert.equal(await p.getByRole("button", { name: "今日待办 0", exact: true }).count(), 0, "a pending retry must not fabricate zero");
  await p.evaluate(before => (window as any).fixture.reply(before), before);
  await p.getByRole("button", { name: "今日待办 0", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "今日待办 0", exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(before => (window as any).fixture.requests.slice(before).map((r: any) => [r.method, r.path]), before), [["GET", "/api/tasks"]]);
  assert.deepEqual(await writes(p), []);
});

test("profile loading does not fabricate counters or an empty profile", async t => {
  const p = await open(t, { holdReads: true });
  assert.equal(await p.getByText("正在读取个人资料", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "编辑资料", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: /^(人脉|今日待办|近期日程) \d/ }).count(), 0);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-loading.png" });
  assert.deepEqual(await writes(p), []);
});

test("a genuinely empty profile can open creation without borrowing sample content", async t => {
  const p = await open(t, { name: "当前用户", payloads: { ...profileReadPayloads, "/api/profile": emptyProfilePayload } });
  assert.equal(await p.getByText("尚未填写个人资料", { exact: true }).count(), 1);
  assert.equal(await p.getByText("星野工作室", { exact: true }).count(), 0);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-empty.png" });
  await press(p, "编辑资料");
  assert.equal(await p.getByRole("textbox", { name: "名字", exact: true }).inputValue(), "");
  assert.deepEqual(await writes(p), []);
});

for (const profile of [{}, { ...profilePayload, state: "empty" }, { ...profilePayload, profile: null }, { ...profilePayload, profile: { ...profilePayload.profile, id: "" } }, { ...profilePayload, profile: { ...profilePayload.profile, offering: 1 } }]) test("invalid profile data stays a visible retryable failure " + JSON.stringify(profile), async t => {
  const p = await open(t, { payloads: { ...profileReadPayloads, "/api/profile": profile } });
  assert.equal(await p.getByText("个人资料未能读取", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "编辑资料", exact: true }).count(), 0);
  if (process.env.APP_STYLE_SCREENSHOTS && Object.keys(profile).length === 0) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-read-failure.png" });
  await update(p, { payloads: profileReadPayloads }); await press(p, "重试个人资料");
  await p.getByRole("button", { name: "编辑资料", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "编辑资料", exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

for (const [path, payload, label] of [
  ["/api/contacts", { ...profileContactsPayload, contacts: [profileContactsPayload.contacts[0], profileContactsPayload.contacts[0]] }, "人脉"],
  ["/api/contacts", { ...profileContactsPayload, state: "empty" }, "人脉"],
  ["/api/tasks", { tasks: [{ ...profileTasksPayload.tasks[0], plannedDate: "2026-02-30" }] }, "今日待办"],
  ["/api/schedule-items", { scheduleItems: [{ ...profileSchedulePayload.scheduleItems[0], category: undefined }] }, "近期日程"],
  ["/api/schedule-items", { scheduleItems: [{ ...profileSchedulePayload.scheduleItems[0], category: "invalid" }] }, "近期日程"],
  ["/api/schedule-items", { scheduleItems: [{ ...profileSchedulePayload.scheduleItems[0], endsAt: "2026-09-12T04:00:00Z" }] }, "近期日程"]
] as const) test("invalid profile statistic is not counted " + path + " " + JSON.stringify(payload), async t => {
  const p = await open(t, { payloads: { ...profileReadPayloads, [path]: payload } });
  assert.equal(await p.getByRole("button", { name: "重试" + label, exact: true }).count(), 1);
  assert.equal(await p.getByText("未读到", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "编辑资料", exact: true }).count(), 1);
});

for (const patch of [{ ready: false }, { baseReady: false }, { focused: false }, { signedIn: false }, { actor: "" }]) test("profile inactive route does not read private resources " + JSON.stringify(patch), async t => {
  const p = await open(t, patch);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
  if (patch.signedIn === false) assert.ok((await p.locator("body").innerText()).includes("/account/login?next=%2Fprofile"));
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "orbit_session=changed" }, { baseUrl: "https://other.example" }, { ready: false }, { baseReady: false }, { focused: false }, { signedIn: false }, { mounted: false }]) test("profile obsolete reads and callbacks cannot cross scope " + JSON.stringify(patch), async t => {
  const p = await open(t, { holdReads: true });
  const oldReads = await p.evaluate(() => (window as any).fixture.requests.length);
  await update(p, patch);
  await p.evaluate(oldReads => { const s = (window as any).fixture; for (let i = 0; i < oldReads; i++) s.reply(i, 401); }, oldReads); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByText("星野工作室", { exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

for (const patch of [{ width: 320, fontScale: 1.6 }, { width: 820 }, { dark: true }]) test("profile long text remains readable and final navigation stays reachable " + JSON.stringify(patch), async t => {
  const p = await open(t, { ...patch, name: "一位正在和不同领域伙伴合作的产品负责人", payloads: { ...profileReadPayloads, "/api/profile": { ...profilePayload, profile: { ...profilePayload.profile, bio: "我们正在探索不同领域之间的合作方式。".repeat(10), offering: ["可以交流的产品研究和访谈方法".repeat(3)] } } } });
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-top-" + (patch.dark ? "390-dark" : patch.width) + ".png" });
  await p.getByRole("button", { name: "账号与工作区", exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await p.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await press(p, "账号与工作区"); assert.deepEqual(await navigation(p), ["/account"]);
  for (const label of ["设置", "编辑资料", "账号与工作区"]) { const box = await p.getByRole("button", { name: label, exact: true }).boundingBox(); assert.ok(box && box.width >= 43.999 && box.height >= 43.999); }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-" + (patch.dark ? "390-dark" : patch.width) + ".png" });
});

test("profile save confirms a matching receipt once and does not submit an unchanged draft", async t => {
  const p = await edit(t);
  await pressTwice(p, "保存资料"); assert.deepEqual(await writes(p), [], "opening the editor is not a change");
  await p.getByRole("textbox", { name: "简介", exact: true }).fill("  新的真实介绍  ");
  await pressTwice(p, "保存资料");
  const sent = await writes(p); assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "PUT"); assert.equal(sent[0].path, "/api/profile");
  const { mutationId, expectedUpdatedAt, ...fields } = sent[0].body;
  assert.equal(typeof mutationId, "string"); assert.ok(mutationId.length > 0);
  assert.equal(expectedUpdatedAt, "2026-09-12T00:00:00Z");
  assert.deepEqual(fields, { displayName: "程川", headline: "产品经理 · 星野工作室", bio: "新的真实介绍", industry: "互联网", organization: "星野工作室", role: "产品经理", homeMarket: "东京 · 日本", relationshipGoal: "认识可以一起做产品的同行", offering: ["产品研究", "需求梳理"], seeking: ["设计合作", "技术交流"], topics: ["产品设计", "用户研究"], targetRelationshipTypes: ["产品伙伴"], preferredFollowUpWindow: "本周", preferredIntroChannels: ["email"] });
  await replyWrite(p, await savedProfile(p, { bio: "新的真实介绍" }));
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 1);
  await pressTwice(p, "保存资料"); assert.equal((await writes(p)).length, 1);
  await press(p, "返回资料预览"); assert.equal(await p.getByText("新的真实介绍", { exact: true }).filter({ visible: true }).count(), 1);
});

test("profile editor lets the member update company role and conversation topics", async t => {
  const p = await edit(t);
  await p.getByRole("textbox", { name: "公司", exact: true }).fill("新公司");
  await p.getByRole("textbox", { name: "职位", exact: true }).fill("新职位");
  await p.getByRole("textbox", { name: "想聊的话题", exact: true }).fill("AI 产品\n创业");
  await press(p, "保存资料");
  const sent = (await writes(p))[0].body;
  assert.equal(sent.organization, "新公司");
  assert.equal(sent.role, "新职位");
  assert.deepEqual(sent.topics, ["AI 产品", "创业"]);
  await replyWrite(p, await savedProfile(p, {
    organization: "新公司",
    role: "新职位",
    topics: ["AI 产品", "创业"]
  }));
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 1);
});

for (const [name, payload, status] of [
  ["empty response", {}, 200], ["pending response", { ...profilePayload, state: "pending" }, 200],
  ["wrong profile", { ...profilePayload, profile: { ...profilePayload.profile, id: "profile:other", bio: "新的真实介绍" } }, 200],
  ["unacknowledged field", profilePayload, 200], ["missing save date", { ...profilePayload, editor: { ...profilePayload.editor, lastSavedAt: null }, profile: { ...profilePayload.profile, bio: "新的真实介绍" } }, 200],
  ["HTTP failure with success body", { ...profilePayload, profile: { ...profilePayload.profile, bio: "新的真实介绍" } }, 503]
] as const) test("profile save rejects " + name + " and keeps the draft", async t => {
  const p = await edit(t); const bio = p.getByRole("textbox", { name: "简介", exact: true }); await bio.fill("新的真实介绍"); await press(p, "保存资料");
  await replyWrite(p, payload, status);
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 0);
  assert.equal(await p.getByText("资料尚未确认保存，请重试。", { exact: true }).count(), 1);
  assert.equal(await bio.inputValue(), "新的真实介绍");
  if (process.env.APP_STYLE_SCREENSHOTS && name === "empty response") await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-save-failure.png" });
  await press(p, "保存资料"); assert.equal((await writes(p)).length, 2);
});

test("profile refresh failure and recovery preserve both manual and extraction input", async t => {
  const p = await edit(t); const bio = p.getByRole("textbox", { name: "简介", exact: true }); const source = p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true });
  await bio.fill("刷新时也要保留的介绍"); await source.fill("Name: Alex Chen");
  await update(p, { failPaths: ["/api/profile"] }); await refresh(p);
  await p.getByText("个人资料未能读取", { exact: true }).waitFor();
  assert.equal(await bio.inputValue(), "刷新时也要保留的介绍"); assert.equal(await source.inputValue(), "Name: Alex Chen");
  assert.equal(await p.getByRole("button", { name: "保存资料", exact: true }).isDisabled(), true);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-refresh-failure.png" });
  await update(p, { failPaths: [] }); await press(p, "重试个人资料");
  assert.equal(await bio.inputValue(), "刷新时也要保留的介绍"); assert.equal(await source.inputValue(), "Name: Alex Chen"); assert.deepEqual(await writes(p), []);
});

test("profile save receipt cannot erase a newer edit or mark that newer draft saved", async t => {
  const p = await edit(t); const bio = p.getByRole("textbox", { name: "简介", exact: true });
  await bio.fill("提交中的介绍"); await press(p, "保存资料"); await bio.fill("继续修改的介绍");
  await replyWrite(p, await savedProfile(p, { bio: "提交中的介绍" }));
  assert.equal(await bio.inputValue(), "继续修改的介绍"); assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 0);
  await press(p, "保存资料"); assert.equal((await writes(p))[1].body.bio, "继续修改的介绍");
  assert.equal((await writes(p))[1].body.expectedUpdatedAt, "2026-09-12T00:00:01Z");
  assert.notEqual((await writes(p))[0].body.mutationId, (await writes(p))[1].body.mutationId);
});

test("a pending profile remains visible but cannot save", async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile": { ...profilePayload, state: "pending", editor: { ...profilePayload.editor, canSave: false } } } });
  await p.getByRole("textbox", { name: "简介", exact: true }).fill("等待资料审核");
  assert.ok(Number(await p.getByRole("button", { name: "保存资料", exact: true }).evaluate(el => getComputedStyle(el).opacity)) < 1, "an unavailable save looks disabled");
  assert.equal(await p.getByText("个人资料正在等待复核，暂时不能保存。", { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-pending.png" });
  assert.equal(await p.getByRole("button", { name: "保存资料", exact: true }).isDisabled(), true);
  await pressTwice(p, "保存资料"); assert.deepEqual(await writes(p), []);
});

test("profile suggestion preserves business evidence and applies only after a matching receipt", async t => {
  const p = await edit(t);
  for (const text of [profileSuggestion.rationale, profileSuggestion.evidence[0]!.excerpt, readyProfileSuggestionsPayload.nextAction]) assert.equal(await p.getByText(text, { exact: false }).count(), 1);
  await pressTwice(p, "确认标题建议"); assert.equal((await writes(p)).length, 1);
  await replyWrite(p, acceptedProfileSuggestionPayload);
  assert.equal(await p.getByRole("textbox", { name: "标题", exact: true }).inputValue(), profileSuggestion.suggestedValue);
  assert.equal(await p.getByText("建议已放进编辑表单。检查后保存资料。", { exact: true }).count(), 1);
  assert.ok((await writes(p)).every((r: any) => r.method === "POST"));
});

for (const [name, payload] of [
  ["empty", {}], ["wrong suggestion", { ...acceptedProfileSuggestionPayload, acceptedSuggestion: { ...acceptedProfileSuggestionPayload.acceptedSuggestion, id: "suggestion:other" } }],
  ["not accepted", { ...acceptedProfileSuggestionPayload, state: "pending" }], ["wrong value", { ...acceptedProfileSuggestionPayload, profilePatch: { headline: "another value" } }],
  ["wrong applied fields", { ...acceptedProfileSuggestionPayload, appliedFields: ["homeMarket"] }], ["unknown patch field", { ...acceptedProfileSuggestionPayload, profilePatch: { headline: profileSuggestion.suggestedValue, bio: "injected" } }]
] as const) test("profile suggestion rejects " + name + " without changing any field", async t => {
  const p = await edit(t); await press(p, "确认标题建议"); await replyWrite(p, payload);
  assert.equal(await p.getByRole("textbox", { name: "标题", exact: true }).inputValue(), "产品经理 · 星野工作室");
  assert.equal(await p.getByText("这条建议尚未确认，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("待保存改动", { exact: true }).count(), 0);
});

for (const [field, value, label] of [["targetRelationshipTypes", ["live music partners"], "目标关系类型"], ["preferredFollowUpWindow", "next week", "联系时间"], ["preferredIntroChannels", ["email", "introduction"], "介绍渠道"]] as const) test("profile supported suggestion survives through saving " + field, async t => {
  const suggestion = { ...profileSuggestion, targetProfileField: field, suggestedValue: value, currentValue: field === "preferredFollowUpWindow" ? "本周" : [] };
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, suggestions: [suggestion] } } });
  await p.getByRole("button", { name: /^确认.*建议$/ }).click();
  await replyWrite(p, { ...acceptedProfileSuggestionPayload, acceptedSuggestion: { ...suggestion, status: "accepted" }, profilePatch: { [field]: value }, appliedFields: [field] });
  await p.getByText("建议已放进编辑表单。检查后保存资料。", { exact: true }).waitFor();
  assert.equal(await p.getByRole("textbox", { name: label, exact: true }).inputValue(), Array.isArray(value) ? value.join("\n") : value);
  await press(p, "保存资料"); assert.deepEqual((await writes(p))[1].body[field], value);
});

test("profile suggestions expose empty failure and pending states with independent read-only retry", async t => {
  const p = await edit(t, { failPaths: ["/api/profile/update-suggestions"] });
  assert.equal(await p.getByText("资料建议未能读取", { exact: true }).count(), 1);
  await update(p, { failPaths: [], payloads: profileReadPayloads });
  const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await press(p, "重试资料建议"); assert.equal(await p.getByText("暂无资料建议", { exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(n => (window as any).fixture.requests.slice(n).map((r: any) => r.path), before), ["/api/profile/update-suggestions"]);
  await update(p, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, state: "pending" } } });
  await press(p, "重试资料建议"); assert.equal(await p.getByText("资料建议正在准备", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: /^确认.*建议$/ }).count(), 0); assert.deepEqual(await writes(p), []);
});

test("profile extraction is review only and preserves real multilingual fields through apply", async t => {
  const p = await edit(t); await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen\nRole: Product lead");
  await pressTwice(p, "提取名片"); assert.equal((await writes(p)).length, 1);
  assert.deepEqual((await writes(p))[0].body, { text: "Name: Alex Chen\nRole: Product lead" });
  await replyWrite(p, profileExtractionPayload);
  assert.equal(await p.getByRole("textbox", { name: "名字", exact: true }).inputValue(), "程川");
  for (const text of [profileExtractionPayload.confidenceSummary, profileExtractionPayload.nextAction]) assert.equal(await p.getByText(text, { exact: true }).count(), 1);
  await press(p, "应用到编辑表单");
  assert.equal(await p.getByRole("textbox", { name: "名字", exact: true }).inputValue(), "Alex Chen");
  assert.equal(await p.getByRole("textbox", { name: "标题", exact: true }).inputValue(), "Music product lead");
  assert.equal(await p.getByRole("textbox", { name: "目标关系类型", exact: true }).inputValue(), "audio partners");
  assert.equal(await p.getByRole("textbox", { name: "我想认识", exact: true }).inputValue(), "设计合作\n技术交流", "relationship type is not a replacement for the user's seeking list");
  assert.equal((await writes(p)).length, 1); await press(p, "保存资料");
  assert.equal((await writes(p))[1].body.organization, "Live Music Studio"); assert.equal((await writes(p))[1].body.homeMarket, "Tokyo");
});

for (const [name, payload] of [
  ["empty envelope", {}], ["wrong kind", { ...profileExtractionPayload, kind: "resume" }],
  ["wrong nested kind", { ...profileExtractionPayload, draft: { ...profileExtractionPayload.draft, kind: "resume" } }],
  ["bad draft", { ...profileExtractionPayload, draft: { ...profileExtractionPayload.draft, id: "" } }]
] as const) test("profile extraction rejects " + name + " and retains the source", async t => {
  const p = await edit(t); const source = p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }); await source.fill("Name: Alex Chen");
  await press(p, "提取名片"); await replyWrite(p, payload);
  assert.equal(await p.getByText("提取结果尚未确认，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "应用到编辑表单", exact: true }).count(), 0); assert.equal(await source.inputValue(), "Name: Alex Chen");
});

for (const state of ["empty", "pending"] as const) test("profile " + state + " extraction cannot be applied", async t => {
  const p = await edit(t); await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen"); await press(p, "提取名片");
  await replyWrite(p, { ...profileExtractionPayload, state, draft: state === "empty" ? null : profileExtractionPayload.draft });
  assert.equal(await p.getByRole("button", { name: "应用到编辑表单", exact: true }).count(), 0);
  assert.equal(await p.getByText(state === "empty" ? "暂无可提取信息" : "处理中", { exact: false }).count(), 1);
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 0);
});

test("profile picker is single-flight and explains that document bytes are not extracted", async t => {
  const p = await edit(t); await pressTwice(p, "选择名片图片");
  assert.equal(await p.evaluate(() => (window as any).fixture.picks.length), 1);
  await p.evaluate(() => (window as any).fixture.finishPick({ canceled: false, assets: [{ fileName: "my-card.jpg", mimeType: "image/jpeg", uri: "file:///private/my-card.jpg" }] })); await settle(p);
  assert.equal(await p.getByText("已选择 my-card.jpg。此处只能提取粘贴的文本，请补充原文。", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), [], "a file name alone is not a document upload");
});

const scopeChanges = [{ actor: "actor-2" }, { cookieHeader: "orbit_session=changed" }, { baseUrl: "https://other.example" }, { ready: false }, { baseReady: false }, { focused: false }, { signedIn: false }, { mounted: false }];
for (const operation of ["save", "suggestion", "extraction", "picker"] as const) for (const patch of scopeChanges) test("profile obsolete " + operation + " cannot mutate a new scope " + JSON.stringify(patch), async t => {
  const p = await edit(t);
  const label = operation === "save" ? "保存资料" : operation === "suggestion" ? "确认标题建议" : operation === "extraction" ? "提取名片" : "选择简历文件";
  if (operation === "save") await p.getByRole("textbox", { name: "简介", exact: true }).fill("旧的介绍");
  if (operation === "extraction") await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen");
  await p.evaluate(label => { (window as any).fixture.oldPress = (window as any).fixture.presses[label]; }, label);
  await press(p, label); const before = (await writes(p)).length;
  await update(p, patch); await p.evaluate(() => { (window as any).fixture.oldPress(); }); await settle(p);
  assert.equal((await writes(p)).length, before, "an obsolete callback cannot send another request");
  if (operation === "picker") { await p.evaluate(() => (window as any).fixture.finishPick({ canceled: false, assets: [{ name: "resume.pdf", mimeType: "application/pdf" }] })); await settle(p); }
  else { assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method !== "GET").signal.aborted), true); await replyWrite(p, {}, 401); }
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0); assert.equal((await writes(p)).length, before);
  for (const message of ["资料已保存。", "建议已放进编辑表单。检查后保存资料。", "提取结果已放进编辑表单。检查后保存资料。", "资料尚未确认保存，请重试。", "提取结果尚未确认，请重试。"]) assert.equal(await p.getByText(message, { exact: true }).count(), 0);
});

for (const operation of ["save", "suggestion", "extraction", "picker"] as const) test("profile refresh cancels " + operation + " without losing local inputs", async t => {
  const p = await edit(t); const bio = p.getByRole("textbox", { name: "简介", exact: true }); const source = p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true });
  await bio.fill("刷新时保留这段介绍"); await source.fill("Name: Alex Chen");
  const label = operation === "save" ? "保存资料" : operation === "suggestion" ? "确认标题建议" : operation === "extraction" ? "提取名片" : "选择简历文件";
  await press(p, label); const before = (await writes(p)).length;
  await refresh(p);
  if (operation === "picker") { await p.evaluate(() => (window as any).fixture.finishPick({ canceled: false, assets: [{ name: "late-resume.pdf", mimeType: "application/pdf" }] })); await settle(p); }
  else {
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method !== "GET").signal.aborted), true);
    await replyWrite(p, operation === "save" ? { ...profilePayload, profile: { ...profilePayload.profile, bio: "刷新时保留这段介绍" } } : operation === "suggestion" ? acceptedProfileSuggestionPayload : profileExtractionPayload);
  }
  assert.equal(await bio.inputValue(), "刷新时保留这段介绍"); assert.equal(await source.inputValue(), "Name: Alex Chen"); assert.equal((await writes(p)).length, before);
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 0); assert.equal(await p.getByText("待保存改动", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "应用到编辑表单", exact: true }).count(), 0);
});

for (const [name, payload] of [["missing queue", {}], ["duplicate suggestion", { ...readyProfileSuggestionsPayload, suggestions: [profileSuggestion, profileSuggestion] }],
  ["empty contradicts content", { ...readyProfileSuggestionsPayload, state: "empty" }], ["wrong field value type", { ...readyProfileSuggestionsPayload, suggestions: [{ ...profileSuggestion, suggestedValue: ["unexpected"] }] }],
  ["missing evidence date", { ...readyProfileSuggestionsPayload, suggestions: [{ ...profileSuggestion, evidence: [{ ...profileSuggestion.evidence[0], collectedAt: undefined }] }] }]
] as const) test("profile invalid suggestions show an explicit failure " + name, async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": payload } });
  assert.equal(await p.getByText("资料建议未能读取", { exact: true }).count(), 1); assert.equal(await p.getByRole("button", { name: /^确认.*建议$/ }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("profile pending extraction without a draft stays pending rather than looking empty", async t => {
  const p = await edit(t); await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen"); await press(p, "提取名片");
  await replyWrite(p, { ...profileExtractionPayload, state: "pending", draft: null });
  assert.equal(await p.getByText("处理中", { exact: false }).count(), 1); assert.equal(await p.getByText("暂无可提取信息", { exact: false }).count(), 0);
});

test("profile creates an empty record only after its own new profile receipt", async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile": emptyProfilePayload } });
  await p.getByRole("textbox", { name: "名字", exact: true }).fill("新用户"); await press(p, "保存资料");
  const sent = (await writes(p))[0].body;
  assert.equal(sent.displayName, "新用户");
  const { expectedUpdatedAt, mutationId, ...profileFields } = sent;
  assert.equal(expectedUpdatedAt, null);
  await replyWrite(p, { ...profilePayload, mutationId,
    onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["primaryIndustryId", "secondaryIndustryId", "birthDate"] },
    profile: { id: "profile:new", ...profileFields, preferredLanguage: "zh", updatedAt: "2026-09-12T00:00:00Z" },
    editor: { ...profilePayload.editor, lastSavedAt: "2026-09-12T00:00:00Z" } });
  assert.equal(await p.getByText("资料已保存。", { exact: true }).count(), 1);
});

for (const kind of ["image", "document"] as const) test("profile " + kind + " picker cancellation is neutral and failure can be retried", async t => {
  const p = await edit(t); const label = kind === "image" ? "选择名片图片" : "选择简历文件";
  await press(p, label); await p.evaluate(() => (window as any).fixture.finishPick({ canceled: true })); await settle(p);
  assert.equal(await p.getByRole("alert").count(), 0); assert.deepEqual(await writes(p), []);
  await press(p, label); await p.evaluate(() => (window as any).fixture.finishPick({ canceled: false, assets: [] })); await settle(p);
  assert.equal(await p.getByText(kind === "image" ? "没有选到可读取的图片。" : "没有选到可读取的文件。", { exact: true }).count(), 1);
  await press(p, label); assert.equal(await p.evaluate(() => (window as any).fixture.picks.length), 3);
});

for (const operation of ["suggestion", "extraction"] as const) test("profile " + operation + " rejects HTTP failure even with a success-shaped body", async t => {
  const p = await edit(t); if (operation === "extraction") await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen");
  await press(p, operation === "suggestion" ? "确认标题建议" : "提取名片"); await replyWrite(p, operation === "suggestion" ? acceptedProfileSuggestionPayload : profileExtractionPayload, 503);
  assert.equal(await p.getByText(operation === "suggestion" ? "这条建议尚未确认，请重试。" : "提取结果尚未确认，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("待保存改动", { exact: true }).count(), 0); assert.equal(await p.getByRole("button", { name: "应用到编辑表单", exact: true }).count(), 0);
});

test("profile source labels remain meaningful and do not replace real business text", async t => {
  const p = await edit(t);
  assert.equal(await p.getByText("最近的交流记录", { exact: true }).count(), 1);
  assert.equal(await p.getByText(profileSuggestion.evidence[0]!.excerpt, { exact: true }).count(), 1);
});

for (const [source, expected] of [
  ["The strongest generated relationship graph edges cluster around operators, founders, and community introduction paths.", "近期关系记录主要涉及运营者、创始人和社群引荐。"],
  ["Recent chat notes repeatedly frame Orbit's value around concrete follow-up decisions.", "最近的交流多次提到希望明确下一步联系安排。"],
  ["Recent interaction memory includes follow-up requests, so the operator should review a shorter follow-up window.", "近期交流中有继续联系的请求，可以考虑更早联系。"]
] as const) test("profile known service rationale is localized exactly " + source, async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, suggestions: [{ ...profileSuggestion, rationale: source }] } } });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1); assert.equal(await p.getByText(source, { exact: true }).count(), 0);
});

for (const [source, expected] of [
  ["High confidence because the mock resume fixture includes a name, role, market, and relationship goal.", "识别到了姓名、职位、市场和关系目标，请逐项核对。"],
  ["Medium confidence because the mock business card fixture has clear identity fields but lighter relationship context.", "身份信息较清楚，关系背景仍需补充。"],
  ["No profile draft was produced because the mock resume fixture is empty.", "未提供可提取的原文，暂时没有资料草稿。"],
  ["The mock business card is queued for manual review before an onboarding draft is available.", "这张名片正在等待复核，资料草稿尚未就绪。"],
  ["Image extraction is not available in this profile form because no document bytes were uploaded.", "此处尚未读取图片内容，请粘贴原文。"],
  ["6 explicit profile fields were extracted with high confidence.", "识别到 6 项资料，请逐项核对。"]
] as const) test("profile known extraction message is localized exactly " + source, async t => {
  const p = await edit(t); await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen"); await press(p, "提取名片");
  await replyWrite(p, { ...profileExtractionPayload, confidenceSummary: source });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1); assert.equal(await p.getByText(source, { exact: true }).count(), 0);
});

for (const [source, expected] of [["Chat signal", "聊天记录"], ["Activity signal", "活动记录"], ["Contact signal", "人脉记录"]] as const) test("profile service source label uses a readable name " + source, async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, suggestions: [{ ...profileSuggestion, sourceLabel: source }] } } });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1);
});

for (const [source, expected] of [
  ["Paste source text before extracting profile fields.", "请先粘贴需要提取的原文。"],
  ["No explicit supported fields were found; unlabeled prose is not guessed into profile data.", "没有识别到明确的资料字段，请给原文补充字段名称。"],
  ["Use the contact import hub for business-card scanning.", "需要扫描名片时，请使用人脉导入入口。"],
  ["Paste structured profile text with explicit field labels.", "请粘贴带有姓名、公司等字段名称的原文。"],
  ["Add labels such as 姓名、公司、职位、市场、关系目标、联系方式 and try again.", "请补上姓名、公司、职位、市场、关系目标或联系方式等字段名称，再试一次。"],
  ["Review every extracted field in the form before saving the profile.", "请在编辑表单中逐项核对后保存资料。"],
  ["Review the extracted profile draft before using it to personalize relationship follow-up.", "请先核对提取草稿，再决定是否用于后续联系。"],
  ["Confirm the card owner and add context from the event before creating follow-up tasks.", "先确认名片归属并补充交流背景，再安排后续联系。"],
  ["Add a resume document or paste profile text before extracting onboarding fields.", "请粘贴简历原文后再提取资料。"],
  ["Keep the card in review until the operator confirms which lines should become profile fields.", "请继续复核名片，确认哪些内容需要放入资料。"]
] as const) test("profile service extraction guidance is localized exactly " + source, async t => {
  const p = await edit(t); await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen"); await press(p, "提取名片");
  await replyWrite(p, { ...profileExtractionPayload, nextAction: source });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1);
});

test("profile service suggestion and accepted guidance remain a separate save decision", async t => {
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, nextAction: "Review each suggestion before applying any change to the profile." } } });
  assert.equal(await p.getByText("逐条核对来源，再决定是否放入编辑表单。", { exact: false }).count(), 1);
  await press(p, "确认标题建议"); await replyWrite(p, { ...acceptedProfileSuggestionPayload, nextAction: "Apply this patch only after the operator confirms the profile save." });
  assert.equal(await p.getByText("这些改动尚未保存，请检查编辑表单后另行保存。", { exact: true }).count(), 1); assert.equal((await writes(p)).length, 1);
});

test("profile starting another extraction invalidates the previous apply callback", async t => {
  const p = await edit(t); const source = p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }); await source.fill("Name: Alex Chen");
  await press(p, "提取名片"); await replyWrite(p, profileExtractionPayload);
  await p.evaluate(() => { (window as any).fixture.oldApply = (window as any).fixture.presses["应用到编辑表单"]; });
  await source.fill("Name: A Different Person"); await press(p, "提取名片");
  await p.evaluate(() => { (window as any).fixture.oldApply(); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "名字", exact: true }).inputValue(), "程川");
  assert.equal(await p.getByText("提取结果已放进编辑表单。检查后保存资料。", { exact: true }).count(), 0);
});

test("profile accepting a suggestion cannot overwrite a newer manual edit to that field", async t => {
  const p = await edit(t); await press(p, "确认标题建议");
  const headline = p.getByRole("textbox", { name: "标题", exact: true }); await headline.fill("确认期间我写的新标题");
  await replyWrite(p, acceptedProfileSuggestionPayload);
  assert.equal(await headline.inputValue(), "确认期间我写的新标题");
  assert.equal(await p.getByText("标题已有新的编辑，建议未覆盖这项改动。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("建议已放进编辑表单。检查后保存资料。", { exact: true }).count(), 0);
});

for (const value of ["constructor", "__proto__", "Live performance with generated music from a local provider."]) test("profile arbitrary business content remains literal " + value, async t => {
  const suggestion = { ...profileSuggestion, sourceLabel: value, rationale: value, suggestedValue: value };
  const p = await edit(t, { payloads: { ...profileReadPayloads, "/api/profile/update-suggestions": { ...readyProfileSuggestionsPayload, suggestions: [suggestion] } } });
  assert.equal(await p.getByText(value, { exact: true }).count(), 3);
  await press(p, "确认标题建议"); await replyWrite(p, { ...acceptedProfileSuggestionPayload, acceptedSuggestion: { ...suggestion, status: "accepted" }, profilePatch: { headline: value } });
  assert.equal(await p.getByRole("textbox", { name: "标题", exact: true }).inputValue(), value);
});

for (const patch of [{ width: 390 }, { width: 320, fontScale: 1.6 }, { width: 820 }, { width: 390, dark: true }]) test("profile editor controls and long source remain readable " + JSON.stringify(patch), async t => {
  const p = await edit(t, patch);
  await p.getByRole("textbox", { name: "简介", exact: true }).fill("这是一段需要保留的真实简介。".repeat(8));
  await p.getByRole("textbox", { name: "名片文本或简历摘要", exact: true }).fill("Name: Alex Chen\nOrganization: Live music and audio research".repeat(4));
  await press(p, "保存资料"); await replyWrite(p, {}, 503);
  await p.getByRole("button", { name: "保存资料", exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await p.locator("body").evaluate(el => el.scrollWidth <= innerWidth), true);
  for (const label of ["返回资料预览", "保存资料", "选择名片图片", "选择简历文件", "确认标题建议"]) {
    const control = p.getByRole("button", { name: label, exact: true }); const box = await control.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= Number(patch.width) + 1);
    assert.deepEqual(await control.locator("[dir='auto']").evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).map(node => node.textContent)), []);
  }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-editor-" + (patch.dark ? "dark" : patch.width) + ".png" });
  await press(p, "提取名片"); await replyWrite(p, profileExtractionPayload);
  await p.getByRole("button", { name: "应用到编辑表单", exact: true }).scrollIntoViewIfNeeded();
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-profile-extraction-" + (patch.dark ? "dark" : patch.width) + ".png" });
});
