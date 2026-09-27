import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { emptyProfilePayload, profilePayload } from "./helpers/profile-detail-fixtures";

// Real screen, view model, API client, theme and RNW controls. Only the HTTP boundary
// (window.fetch, emulating the documented /api/profile contract), the router, locale
// context and native pickers are replaced.
const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script = "";

const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { zh } from "./src/i18n/zh";
import { en } from "./src/i18n/en";
import { ja } from "./src/i18n/ja";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
const listeners = new Set(); let revision = 0; let uuid = 0; let tick = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = { language: "zh", next: "/events/e1", navigation: [], requests: [], detail: null, put: "ok", network: false, ai: "ok", aiCalls: 0, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function onboarding(p) { const missing = []; if (!p || !String(p.displayName || "").trim()) missing.push("displayName"); if (!p || !p.primaryIndustryId) missing.push("primaryIndustryId"); if (!p || !p.secondaryIndustryId) missing.push("secondaryIndustryId"); if (!p || !p.birthDate) missing.push("birthDate"); return { policyVersion: 1, status: missing.length ? "incomplete" : "complete", missingFields: missing }; }
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input)); const method = init.method || "GET"; const body = init.body ? JSON.parse(init.body) : null;
  state.requests.push({ method, path: url.pathname, body });
  if (state.network) throw new TypeError("Network request failed");
  const d = state.detail;
  if (url.pathname === "/api/profile" && method === "GET") return json(200, { success: true, data: { ...d, onboarding: onboarding(d.profile) } });
  if (url.pathname === "/api/profile" && method === "PUT") {
    if (state.put === "fail") return json(503, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const { expectedUpdatedAt, mutationId, ...fields } = body;
    if ((d.profile ? d.profile.updatedAt : null) !== expectedUpdatedAt) return json(409, { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "stale" } });
    const updatedAt = new Date(Date.parse("2026-09-27T00:00:00Z") + ++tick * 1000).toISOString();
    const profile = { ...(d.profile || { id: "profile:new", displayName: "", headline: "", organization: "", role: "", homeMarket: "", relationshipGoal: "", targetRelationshipTypes: [], preferredFollowUpWindow: "", preferredLanguage: "zh", preferredIntroChannels: [], offering: [], seeking: [], topics: [], bio: "" }), ...fields, updatedAt };
    state.detail = { ...d, state: "success", profile, editor: { ...d.editor, canSave: true, lastSavedAt: updatedAt } };
    return json(200, { success: true, data: { ...state.detail, onboarding: onboarding(profile), mutationId } });
  }
  if (url.pathname === "/api/profile/intro-draft") { state.aiCalls++; return state.ai === "ok" ? json(200, { success: true, data: { bio: "第" + state.aiCalls + "版：做 AI 会议纪要的产品负责人。", headline: "产品负责人 " + state.aiCalls } }) : json(422, { success: false, error: { code: "MODEL_FAILED", message: "no" } }); }
  if (url.pathname.endsWith("/batches/v2")) return json(200, { success: true, data: { batches: [] } });
  return json(404, { success: false, error: { code: "NOT_FOUND", message: "missing" } });
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor:one", user: { id: "user:one" }, cookieHeader: "" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
const dictionaries = { zh, en, ja };
export const useOrbitLocale = () => { observe(); const t = (key, params = {}) => Object.entries(params).reduce((text, [k, v]) => text.replaceAll("{" + k + "}", String(v)), dictionaries[state.language][key]); t.literal = v => v; return { language: state.language, choice: state.language, t }; };
export const useRouter = () => ({ replace(href) { state.navigation.push("replace:" + href); state.update({}); }, push(href) { state.navigation.push("push:" + href); state.update({}); }, back() {}, canGoBack: () => true });
export const useFocusEffect = effect => useEffect(() => effect(), [effect]);
export const useLocalSearchParams = () => ({ next: state.next });
export const randomUUID = () => "fixture-" + ++uuid;
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true });
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const launchImageLibraryAsync = async () => ({ canceled: true, assets: null });
export const launchCameraAsync = async () => ({ canceled: true, assets: null });
export const SafeAreaView = ({ style, edges, ...props }) => <View {...props} style={style} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, color }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture";
import { ProfileOnboardingScreen } from "./src/screens/profile/onboarding/ProfileOnboardingScreen";
function App(){ const s = useFixture(); return <ProfileOnboardingScreen key={s.language} next={s.next} />; } createRoot(document.getElementById("root")).render(<App />);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "onboarding-fixture", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|expo-image-picker|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext)$/ }, () => ({ path: "fixture", namespace: "onboarding" }));
      plugin.onLoad({ filter: /.*/, namespace: "onboarding" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => browser?.close());

const complete = { displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", birthDate: "1990-01-01" };
const blank = { relationshipGoal: "", offering: [], seeking: [], topics: [], bio: "", headline: "" };

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(3000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent(`<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,${iconFont})}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).initialFixture = value; }, { detail: emptyProfilePayload, ...patch });
  await page.addScriptTag({ content: script });
  return page;
}
const fx = (page: Page) => page.evaluate(() => { const s = (window as any).fixture; return { requests: s.requests, navigation: s.navigation, aiCalls: s.aiCalls, profile: s.detail.profile }; });
const set = (page: Page, patch: Record<string, unknown>) => page.evaluate(value => (window as any).fixture.update(value), patch);
async function shot(page: Page, name: string) {
  const directory = process.env.ONBOARDING_SCREENSHOT_DIR;
  if (directory) await page.screenshot({ path: `${directory}/${name}.png` });
}
const withProfile = (profile: Record<string, unknown>) => ({ detail: { ...profilePayload, profile: { ...profilePayload.profile, ...profile } } });

async function fillProfileStep(page: Page) {
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await page.getByRole("button", { name: "一级行业：请选择" }).click();
  await page.getByRole("button", { name: "科技与互联网", exact: true }).click();
  await page.getByRole("button", { name: "二级行业：请选择" }).click();
  await page.getByRole("button", { name: "人工智能与数据", exact: true }).click();
  await page.getByRole("textbox", { name: "职位" }).fill("产品负责人");
  await page.getByRole("textbox", { name: "生日" }).fill("1990-05-20");
}

test("a new account walks welcome → profile, saves with a receipt and a readback, and lands on step 2", async t => {
  const page = await open(t);
  await page.getByRole("heading", { name: /先让 iOrbit/u }).waitFor();
  for (const title of ["告诉我们你是谁", "你最近想推进什么", "你能提供什么、在找什么", "iOrbit 帮你写自我介绍", "带入已有人脉"]) await page.getByText(title, { exact: true }).waitFor();
  const start = page.getByRole("button", { name: "开始设置" });
  assert.equal(await start.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)", "black primary button");
  assert.equal(Math.round((await start.boundingBox())!.height), 50);
  await shot(page, "01-welcome");
  await start.click();
  await page.getByRole("heading", { name: "你是谁？" }).waitFor();
  const next = page.getByRole("button", { name: "继续" });
  assert.equal(await next.isDisabled(), true, "required fields gate the step");
  await fillProfileStep(page);
  await page.getByRole("textbox", { name: "生日" }).fill("2999-01-01");
  await page.getByText("请填写有效的生日（不能晚于今天）。").waitFor();
  assert.equal(await next.isDisabled(), true);
  await page.getByRole("textbox", { name: "生日" }).fill("1990-05-20");
  await shot(page, "02-profile");
  await next.click();
  await page.getByRole("heading", { name: "你最近想推进什么？" }).waitFor();
  await page.getByText("2 / 5", { exact: true }).waitFor();
  const { requests, profile } = await fx(page);
  const writes = requests.filter((r: any) => r.method !== "GET" || r.path === "/api/profile");
  assert.deepEqual(writes.map((r: any) => r.method), ["GET", "PUT", "GET"], "initial read, save, readback");
  assert.deepEqual({ ...writes[1].body, mutationId: undefined }, { birthDate: "1990-05-20", displayName: "林晓", organization: "", primaryIndustryId: "technology_internet", role: "产品负责人", secondaryIndustryId: "technology_internet.ai_data", expectedUpdatedAt: null, mutationId: undefined });
  assert.equal(profile.displayName, "林晓");
});

test("goals: up to three, horizon defaults to this quarter, saved in the web format", async t => {
  const page = await open(t, withProfile({ ...complete, ...blank }));
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("heading", { name: "你最近想推进什么？" }).waitFor();
  for (const goal of ["获取客户", "开拓新市场", "寻找投资"]) await page.getByRole("button", { name: goal, exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "招聘人才", exact: true }).isDisabled(), true, "a fourth goal is blocked");
  await page.getByText("3 / 3", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "获取客户", exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)", "selected chip is black");
  await page.getByRole("textbox", { name: "具体想做成什么" }).fill("先找到 5 家试用企业");
  await shot(page, "03-goals");
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("heading", { name: /你能提供什么/u }).waitFor();
  assert.equal((await fx(page)).profile.relationshipGoal, "获取客户、开拓新市场、寻找投资：先找到 5 家试用企业（本季度）");
});

test("a failed save keeps every value and retries from the banner", async t => {
  const page = await open(t, withProfile({ ...complete, ...blank, relationshipGoal: "获取客户（本月）" }));
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("heading", { name: /你能提供什么/u }).waitFor();
  await page.getByRole("button", { name: "客户引荐", exact: true }).click();
  await page.getByRole("button", { name: "潜在客户", exact: true }).click();
  await set(page, { put: "fail" });
  await page.getByRole("button", { name: "继续", exact: true }).click();
  const banner = page.getByText("没有保存成功，已填内容都还在。");
  await banner.waitFor();
  assert.equal(await banner.evaluate(el => getComputedStyle(el).color), "rgb(180, 35, 24)", "rose failure text");
  await shot(page, "07-save-failed");
  assert.equal(await page.getByRole("button", { name: "客户引荐", exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)", "selection survives the failure");
  await set(page, { put: "ok" });
  await page.getByRole("button", { name: "重试" }).click();
  await page.getByRole("heading", { name: /iOrbit 帮你/u }).waitFor();
  const saved = (await fx(page)).profile;
  assert.deepEqual([saved.offering, saved.seeking], [["客户引荐"], ["潜在客户"]]);
});

test("no network shows the amber notice and keeps the typed values", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "开始设置" }).click();
  await fillProfileStep(page);
  await set(page, { network: true });
  await page.getByRole("button", { name: "继续" }).click();
  const notice = page.getByText("现在没有网络。可以继续填写，联网后点「继续」保存。");
  await notice.waitFor();
  assert.equal(await notice.evaluate(el => getComputedStyle(el).color), "rgb(135, 96, 32)", "amber offline text");
  assert.equal(await page.getByRole("textbox", { name: "姓名" }).inputValue(), "林晓");
  assert.equal(await page.getByRole("textbox", { name: "生日" }).inputValue(), "1990-05-20");
  await shot(page, "08-offline");
  await set(page, { network: false });
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("heading", { name: "你最近想推进什么？" }).waitFor();
});

test("re-entry shows the resume card at the first unfinished step; 稍后 leaves without locking", async t => {
  const page = await open(t, withProfile({ ...complete, ...blank, relationshipGoal: "获取客户（本季度）" }));
  await page.getByText("已完成 2 / 5，从「你能提供什么、在找什么」继续。").waitFor();
  await shot(page, "09-resume");
  await page.getByRole("button", { name: "稍后" }).click();
  assert.deepEqual((await fx(page)).navigation, ["replace:/events/e1"]);
  const second = await open(t, withProfile({ ...complete, ...blank, relationshipGoal: "获取客户（本季度）" }));
  await second.getByRole("button", { name: "继续", exact: true }).click();
  await second.getByRole("heading", { name: /你能提供什么/u }).waitFor();
  await second.getByText("3 / 5", { exact: true }).waitFor();
});

test("an account with steps 1–4 saved goes straight to next and writes nothing", async t => {
  const page = await open(t, withProfile({ ...complete, relationshipGoal: "x", offering: ["a"], headline: "h" }));
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  const { navigation, requests } = await fx(page);
  assert.deepEqual(navigation, ["replace:/events/e1"]);
  assert.deepEqual(requests.map((r: any) => r.method), ["GET"]);
});

test("intro: auto-drafts once on entry, failure keeps the fields editable, 换一版 counts only successes", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户", offering: ["客户引荐"] }), ai: "fail" });
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByText("这次没有生成成功").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "自我介绍" }).isEditable(), true, "user can write it by hand");
  await page.getByRole("textbox", { name: "一句话介绍" }).fill("我自己写的");
  await shot(page, "10-intro-failed");
  await set(page, { ai: "ok" });
  await page.getByRole("button", { name: "重新生成 ›" }).click();
  await page.getByText("AI 草稿 · 可以直接修改").waitFor();
  await page.getByRole("button", { name: "换一版（剩 3 次）" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "自我介绍" }).inputValue(), "第2版：做 AI 会议纪要的产品负责人。");
  await page.getByRole("button", { name: "换一版（剩 3 次）" }).click();
  await page.getByRole("button", { name: "换一版（剩 2 次）" }).waitFor();
  await page.getByText("AI 草稿 · 可以直接修改").waitFor();
  await set(page, { ai: "fail" });
  await page.getByRole("button", { name: "换一版（剩 2 次）" }).click();
  await page.getByText("这次没换成功，保留了上一版，可以再试一次").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "自我介绍" }).inputValue(), "第3版：做 AI 会议纪要的产品负责人。", "previous version kept");
  await page.getByRole("button", { name: "换一版（剩 2 次）" }).waitFor();
  await shot(page, "05-intro");
  await page.getByRole("button", { name: "用这段介绍" }).click();
  await page.getByRole("heading", { name: /带入你已有/u }).waitFor();
  const { profile, aiCalls, requests } = await fx(page);
  assert.equal(aiCalls, 4);
  assert.deepEqual(requests.filter((r: any) => r.path === "/api/profile/intro-draft").map((r: any) => r.body), Array(4).fill({ language: "zh" }));
  assert.equal(profile.bio, "第3版：做 AI 会议纪要的产品负责人。");
});

test("import: 拍名片 opens the existing batch import and 完成设置 goes to next", async t => {
  const page = await open(t, withProfile({ ...complete, ...blank, relationshipGoal: "获取客户", bio: "已有介绍" }));
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("heading", { name: /你能提供什么/u }).waitFor();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("heading", { name: /iOrbit 帮你/u }).waitFor();
  await page.getByRole("button", { name: "用这段介绍" }).click();
  await page.getByRole("heading", { name: /带入你已有/u }).waitFor();
  assert.equal((await fx(page)).aiCalls, 0, "an existing introduction is not regenerated");
  await shot(page, "06-import");
  await page.getByRole("button", { name: "拍名片" }).click();
  await page.getByRole("button", { name: "完成设置" }).click();
  assert.deepEqual((await fx(page)).navigation, ["push:/contacts/new/batch2", "replace:/events/e1"]);
});

test("English and Japanese render the whole welcome and step copy", async t => {
  const english = await open(t, { language: "en" });
  await english.getByRole("heading", { name: /Let iOrbit/u }).waitFor();
  await english.getByRole("button", { name: "Get started" }).click();
  await english.getByRole("heading", { name: "Who are you?" }).waitFor();
  await english.getByRole("button", { name: "Primary industry：Select" }).waitFor();
  const japanese = await open(t, { language: "ja", ...withProfile({ ...complete, ...blank }) });
  await japanese.getByText("5 中 1 完了。「最近進めたいこと」から続けます。").waitFor();
  await japanese.getByRole("button", { name: "続ける" }).click();
  await japanese.getByRole("button", { name: "顧客獲得", exact: true }).click();
  await japanese.getByRole("button", { name: "続ける" }).click();
  await japanese.getByRole("heading", { name: /探しているものは/u }).waitFor();
  assert.equal((await fx(japanese)).profile.relationshipGoal, "顧客獲得（今四半期）");
});
