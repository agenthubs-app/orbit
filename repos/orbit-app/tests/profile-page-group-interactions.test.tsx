import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { profilePayload, profileSuggestion, readyProfileSuggestionsPayload } from "./helpers/profile-detail-fixtures";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script = "";

const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { zh } from "./src/i18n/zh";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
const listeners = new Set(); let revision = 0; let uuid = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const interpolate = (value, params = {}) => Object.entries(params).reduce((text, [key, item]) => text.replaceAll("{" + key + "}", String(item)), value);
const state = window.fixture = { route: "/profile/edit", actorId: "actor:one", baseUrl: "https://orbit.example", requests: [], profile: null, suggestions: null, failWrites: true, failureStatus: 503, failSuggestionIds: [], pickerResult: "cancel", ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
};
window.fetch = async (input, init = {}) => { const url = new URL(String(input)); const body = init.body ? JSON.parse(init.body) : null; const request = { path: url.pathname, method: init.method || "GET", body }; state.requests.push(request);
  if (request.method === "GET" && request.path === "/api/profile") return new Response(JSON.stringify({ success: true, data: state.profile }), { status: 200, headers: { "content-type": "application/json" } });
  if (request.method === "GET" && request.path === "/api/profile/update-suggestions") return new Response(JSON.stringify({ success: true, data: state.suggestions }), { status: 200, headers: { "content-type": "application/json" } });
  if (request.method === "PUT") return new Response(JSON.stringify(state.failWrites ? { success: false, error: { code: state.failureStatus === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "retry" } } : { success: true, data: { ...state.profile, mutationId: body.mutationId, profile: { ...state.profile.profile, ...body, updatedAt: "2026-09-15T00:00:01.000Z" }, editor: { ...state.profile.editor, lastSavedAt: "2026-09-15T00:00:01.000Z" } } }), { status: state.failWrites ? state.failureStatus : 200, headers: { "content-type": "application/json" } });
  const source = state.suggestions.suggestions.find(item => request.path.includes(encodeURIComponent(item.id))) || state.suggestions.suggestions[0];
  if (state.failSuggestionIds.includes(source.id)) return new Response(JSON.stringify({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "retry" } }), { status: 503, headers: { "content-type": "application/json" } });
  if (request.path.endsWith("/accept")) return new Response(JSON.stringify({ success: true, data: { state: "accepted", acceptedSuggestion: { ...source, status: "accepted" }, profilePatch: { [source.targetProfileField]: source.suggestedValue }, appliedFields: [source.targetProfileField], acceptedAt: "2026-09-15T00:00:01.000Z", mutationId: body.mutationId, provenance: source.provenance, nextAction: "Review before saving." } }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ success: true, data: { state: "dismissed", dismissedSuggestion: { ...source, status: "dismissed" }, dismissedAt: "2026-09-15T00:00:01.000Z", mutationId: body.mutationId, provenance: source.provenance, nextAction: "Continue review." } }), { status: 200, headers: { "content-type": "application/json" } });
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: true, signedIn: true, actorId: state.actorId, accountId: state.actorId, user: { id: "raw-auth-id", name: "Raw auth name", email: "person@example.test" }, cookieHeader: "" }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: true, baseUrl: state.baseUrl }; };
const t = (key, params) => interpolate(zh[key], params); t.literal = value => value;
export const useOrbitLocale = () => ({ choice: "zh", language: "zh", t });
export const useRouter = () => ({ canGoBack: () => true, back() { state.update({ route: "/profile/edit" }); }, replace(href) { state.update({ route: String(href) }); }, push(href) { state.update({ route: String(href) }); } });
export const useLocalSearchParams = () => ({ field: new URL("https://local" + state.route).searchParams.get("field") || undefined });
export const randomUUID = () => "fixture-" + ++uuid;
export const readSnapshot = async () => null; export const writeSnapshot = async () => {};
export const launchImageLibraryAsync = async () => { if (state.pickerResult === "failure") throw new Error("picker failed"); return state.pickerResult === "cancel" ? { canceled: true, assets: null } : { canceled: false, assets: [{ fileName: "card.jpg", mimeType: "image/jpeg", uri: "memory://card" }] }; };
export const getDocumentAsync = async () => { if (state.pickerResult === "failure") throw new Error("picker failed"); return state.pickerResult === "cancel" ? { canceled: true, assets: null } : { canceled: false, assets: [{ name: "resume.pdf", mimeType: "application/pdf", uri: "memory://resume" }] }; };
export const SafeAreaView = ({ style, ...props }) => <View {...props} style={style} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, color }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture";
import { EditProfileScreen } from "./src/screens/profile/EditProfileScreen"; import { ProfileMoreScreen } from "./src/screens/profile/ProfileMoreScreen"; import { ProfileTagPickerScreen } from "./src/screens/profile/ProfileTagPickerScreen"; import { ProfileSuggestionsScreen } from "./src/screens/profile/ProfileSuggestionsScreen"; import { ProfilePreviewScreen } from "./src/screens/profile/ProfilePreviewScreen";
function App(){ const s = useFixture(); const path = s.route.split("?")[0]; const Screen = path === "/profile/more" ? ProfileMoreScreen : path === "/profile/tags" ? ProfileTagPickerScreen : path === "/profile/suggestions" ? ProfileSuggestionsScreen : path === "/profile/preview" ? ProfilePreviewScreen : EditProfileScreen; return <Screen />; } createRoot(document.getElementById("root")).render(<App />);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "profile-page-fixture", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "profile-pages" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|expo-image-picker|expo-document-picker|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "profile-pages" }));
      plugin.onLoad({ filter: /.*/, namespace: "profile-pages" }, args => ({ contents: args.path === "native" ? `import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; export * from "react-native-web"; export const useWindowDimensions = () => ({ ...realDimensions(), width: window.innerWidth, fontScale: window.fixture.fontScale || 1 }); export const Pressable = props => <RealPressable {...props} />; const scaled = props => { const style = StyleSheet.flatten(props.style) || {}; const scale = window.fixture.fontScale || 1; return !style.fontSize ? props.style : [props.style, { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]; }; export const Text = props => <RealText {...props} style={scaled(props)} />; export const TextInput = props => <RealTextInput {...props} style={scaled(props)} />;` : fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => browser?.close());

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, colorScheme: patch.dark ? "dark" : "light", deviceScaleFactor: 2 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent(`<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,${iconFont})}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).initialFixture = value; }, { profile: profilePayload, suggestions: { ...readyProfileSuggestionsPayload, suggestions: [{ ...profileSuggestion, targetProfileField: "bio", currentValue: profilePayload.profile.bio, suggestedValue: "新的公开简介" }] }, ...patch });
  await page.addScriptTag({ content: script }); await page.waitForTimeout(80); return page;
}
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function shot(page: Page, name: string) {
  const directory = process.env.PROFILE_PAGE_SCREENSHOT_DIR;
  if (directory) await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

test("edit, more, tags and preview share one canonical scoped draft without early writes", async t => {
  const page = await open(t);
  await shot(page, "5a-profile-edit-implementation");
  await page.getByRole("textbox", { name: "现在在做" }).fill("跨页面保留的简介");
  await page.getByRole("button", { name: "打开更多资料" }).click();
  await shot(page, "5a-profile-more-implementation");
  await page.getByRole("textbox", { name: "所在地" }).fill("京都");
  await page.getByRole("button", { name: "编辑资料" }).click();
  await page.getByRole("button", { name: "选择标签" }).first().click();
  await shot(page, "5a-profile-tags-implementation");
  await page.getByRole("textbox", { name: "选择标签" }).fill("战略咨询");
  await page.getByRole("button", { name: "添加自定义标签" }).click();
  await page.getByRole("button", { name: "完成" }).click();
  assert.equal(await page.getByRole("textbox", { name: "现在在做" }).inputValue(), "跨页面保留的简介");
  await page.getByRole("button", { name: "预览他人视角" }).click();
  await page.getByText("跨页面保留的简介", { exact: true }).waitFor();
  await page.getByText("京都", { exact: true }).waitFor();
  await page.getByText("战略咨询", { exact: true }).waitFor();
  assert.equal(await page.getByText("1990-05-01", { exact: true }).count(), 0);
  assert.equal(await page.getByText("产品经理 · 星野工作室", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "发消息（预览）" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "加入人脉（预览）" }).isDisabled(), true);
  await shot(page, "5a-profile-preview-implementation");
  assert.equal((await requests(page)).filter((item: any) => item.method !== "GET").length, 0);
});

test("suggestion decisions persist separately and only patch the local draft", async t => {
  const page = await open(t, { route: "/profile/suggestions" });
  await shot(page, "5a-profile-suggestions-implementation");
  await page.getByRole("button", { name: "确认建议 现在在做" }).click();
  await page.getByText("已接受", { exact: true }).waitFor();
  const sent = await requests(page);
  assert.equal(sent.filter((item: any) => item.path.endsWith("/accept")).length, 1);
  assert.equal(sent.filter((item: any) => item.method === "PUT").length, 0);
});

test("dismiss persists through its endpoint without changing the profile draft", async t => {
  const page = await open(t, { route: "/profile/suggestions" });
  await page.getByRole("button", { name: "忽略建议 现在在做" }).click();
  await page.getByText("已忽略", { exact: true }).waitFor();
  const sent = await requests(page);
  assert.equal(sent.filter((item: any) => item.path.endsWith("/dismiss")).length, 1);
  assert.equal(sent.filter((item: any) => item.method === "PUT").length, 0);
});

test("an accepted suggestion remains editable and saves only from the main editor", async t => {
  const page = await open(t, { route: "/profile/suggestions", failWrites: false });
  await page.getByRole("button", { name: "确认建议 现在在做" }).click();
  await page.getByText("已接受", { exact: true }).waitFor();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  const bio = page.getByRole("textbox", { name: "现在在做" });
  assert.equal(await bio.inputValue(), "新的公开简介");
  await bio.fill("采用后人工修订的简介");
  await page.getByRole("button", { name: "保存资料" }).click();
  const sent = await requests(page);
  assert.equal(sent.filter((item: any) => item.path.endsWith("/accept")).length, 1);
  assert.equal(sent.filter((item: any) => item.method === "PUT").length, 1);
  assert.equal(sent.find((item: any) => item.method === "PUT").body.bio, "采用后人工修订的简介");
});

test("accept all keeps a failed item pending while confirming the remaining item", async t => {
  const failed = { ...profileSuggestion, id: "suggestion:failed", targetProfileField: "bio", currentValue: profilePayload.profile.bio, suggestedValue: "失败建议" };
  const accepted = { ...profileSuggestion, id: "suggestion:accepted", targetProfileField: "headline", currentValue: profilePayload.profile.headline, suggestedValue: "成功建议" };
  const page = await open(t, { route: "/profile/suggestions", failSuggestionIds: [failed.id], suggestions: { ...readyProfileSuggestionsPayload, suggestions: [failed, accepted] } });
  await page.getByRole("button", { name: "全部采用" }).click();
  await page.getByText("这条建议尚未确认，请重试。", { exact: true }).waitFor();
  await page.getByText("已接受", { exact: true }).waitFor();
  assert.equal(await page.getByText("待确认", { exact: true }).count(), 1);
  const sent = await requests(page);
  assert.equal(sent.filter((item: any) => item.path.endsWith("/accept")).length, 2);
  assert.equal(sent.filter((item: any) => item.method === "PUT").length, 0);
});

test("picker cancellation is quiet and picker failure is recoverable on the more page", async t => {
  const page = await open(t, { route: "/profile/more", pickerResult: "cancel" });
  await page.getByRole("button", { name: "选择名片图片" }).click();
  assert.equal(await page.getByText("这张图片暂时读取不了，请重试。", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ pickerResult: "failure" }));
  await page.getByRole("button", { name: "选择名片图片" }).click();
  await page.getByText("这张图片暂时读取不了，请重试。", { exact: true }).waitFor();
  assert.equal((await requests(page)).filter((item: any) => item.method !== "GET").length, 0);
});

test("a failed profile save preserves and replays the exact versioned request", async t => {
  const page = await open(t);
  await page.getByRole("textbox", { name: "职位" }).fill("产品负责人");
  await page.getByRole("button", { name: "保存资料" }).click();
  await page.getByText("资料尚未确认保存，请重试。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存资料" }).click();
  const writes = (await requests(page)).filter((item: any) => item.method === "PUT");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].body, writes[0].body);
  assert.equal(writes[0].body.expectedUpdatedAt, profilePayload.profile.updatedAt);
});

test("a 409 preserves the draft until the explicit reload action", async t => {
  const page = await open(t, { failureStatus: 409 });
  await page.getByRole("textbox", { name: "职位" }).fill("冲突中的职位");
  await page.getByRole("button", { name: "保存资料" }).click();
  assert.equal(await page.getByRole("textbox", { name: "职位" }).inputValue(), "冲突中的职位");
  await page.getByRole("button", { name: "放弃草稿并载入最新资料" }).click();
  await page.waitForTimeout(80);
  assert.equal(await page.getByRole("textbox", { name: "职位" }).inputValue(), profilePayload.profile.role);
});

test("compact large text keeps every visible control at least 44pt", async t => {
  const page = await open(t, { width: 320, fontScale: 2, route: "/profile/more" });
  for (const button of await page.getByRole("button").all()) {
    const box = await button.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, JSON.stringify(box));
  }
});
