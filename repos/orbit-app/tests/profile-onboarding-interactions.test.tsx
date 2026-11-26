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
const state = window.fixture = { language: "zh", next: "/events/e1", screen: undefined, navigation: [], requests: [], detail: null, put: "ok", flowConfirm: "ok", network: false, ai: "ok", aiCalls: 0, flow: undefined, verdicts: [], signOut: { success: true }, card: null, scan: null, infer: { status: "unavailable" }, seekSuggestions: [], storage: {}, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
if (state.flow === undefined) {
  const p = state.detail?.profile;
  const completed = p?.headline || p?.bio ? 4 : p?.offering?.length || p?.seeking?.length ? 3 : p?.relationshipGoal ? 2 : p?.displayName ? 1 : 0;
  state.flow = completed > 0 && completed < 4 ? { version: 1, currentScreen: completed + 1, lastConfirmedScreen: completed, finishedAt: null, deferred: false, revision: "flow:1" } : null;
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function onboarding(p) { const missing = []; if (!p || !String(p.displayName || "").trim()) missing.push("displayName"); if (!p || !p.primaryIndustryId) missing.push("primaryIndustryId"); if (!p || !p.secondaryIndustryId) missing.push("secondaryIndustryId"); if (!p || !p.birthDate) missing.push("birthDate"); return { policyVersion: 1, status: missing.length ? "incomplete" : "complete", missingFields: missing }; }
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input)); const method = init.method || "GET"; const body = init.body ? JSON.parse(init.body) : null;
  state.requests.push({ method, path: url.pathname, body });
  if (state.network) throw new TypeError("Network request failed");
  const d = state.detail;
  if (url.pathname === "/api/profile/onboarding-progress" && method === "GET") {
    const data = url.searchParams.get("view") === "setup" && state.legacyRepair !== undefined
      ? { progress: state.flow, legacyRepair: state.legacyRepair } : state.flow;
    return json(200, { success: true, data });
  }
  if (url.pathname === "/api/profile/onboarding-progress" && method === "POST") {
    if (body.action === "initialize") {
      state.flow ||= { version: 1, currentScreen: 1, lastConfirmedScreen: 0, finishedAt: null, deferred: false, revision: "flow:1" };
      return json(200, { success: true, data: state.flow });
    }
    if (body.action === "finish_repair" && state.legacyRepair && !body.contactMethodsConfirmed && (state.flow?.revision ?? null) === body.expectedRevision && onboarding(d.profile).status === "complete") {
      state.flow = { version: 1, lastConfirmedScreen: 5, currentScreen: null, finishedAt: "2026-10-20T00:00:00.000Z", deferred: false, revision: "flow:repair-" + ++tick };
      return json(200, { success: true, data: state.flow });
    }
    if (body.action === "confirm" && state.flowConfirm === "fail") return json(503, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    if (!state.flow || body.expectedRevision !== state.flow.revision) return json(409, { success: false, error: { code: "CONFLICT", message: "stale" } });
    const last = body.action === "confirm" ? body.screen : state.flow.lastConfirmedScreen;
    state.flow = { ...state.flow, lastConfirmedScreen: last, currentScreen: last < 5 ? last + 1 : null,
      deferred: body.action === "defer" ? true : body.action === "finish" ? false : state.flow.deferred,
      finishedAt: body.action === "finish" ? "2026-10-20T00:00:00.000Z" : state.flow.finishedAt,
      revision: "flow:" + ++tick };
    return json(200, { success: true, data: state.flow });
  }
  if (url.pathname === "/api/profile" && method === "GET") return json(200, { success: true, data: { ...d, onboarding: onboarding(d.profile) } });
  if (url.pathname === "/api/profile" && method === "PUT") {
    if (state.put === "fail") return json(503, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const { expectedUpdatedAt, mutationId, ...fields } = body;
    if ((d.profile ? d.profile.updatedAt : null) !== expectedUpdatedAt) return json(409, { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "stale" } });
    const updatedAt = new Date(Date.parse("2026-09-27T00:00:00Z") + ++tick * 1000).toISOString();
    if (fields.seniorityLevel === null) delete d.profile?.seniorityLevel;
    const profile = { ...(d.profile || { id: "profile:new", displayName: "", headline: "", organization: "", role: "", homeMarket: "", relationshipGoal: "", targetRelationshipTypes: [], preferredFollowUpWindow: "", preferredLanguage: "zh", preferredIntroChannels: [], offering: [], seeking: [], topics: [], bio: "" }), ...fields, updatedAt };
    if (profile.seniorityLevel === null) delete profile.seniorityLevel;
    state.detail = { ...d, state: "success", profile, editor: { ...d.editor, canSave: true, lastSavedAt: updatedAt } };
    if (state.loseAnswer) { state.loseAnswer = false; throw new TypeError("Network request failed"); }
    return json(200, { success: true, data: { ...state.detail, onboarding: onboarding(profile), mutationId } });
  }
  if (url.pathname === "/api/profile/intro-draft") { state.aiCalls++; if (state.aiBio) return json(200, { success: true, data: { bio: state.aiBio, headline: "Product lead" } }); return state.ai === "ok" ? json(200, { success: true, data: { bio: "第" + state.aiCalls + "版：做 AI 会议纪要的产品负责人。", headline: "产品负责人 " + state.aiCalls } }) : json(422, { success: false, error: { code: "MODEL_FAILED", message: "no" } }); }
  if (url.pathname === "/api/contact-drafts/business-card/scan") return state.scan ? json(200, { success: true, data: state.scan }) : json(422, { success: false, error: { code: "BUSINESS_CARD_OCR_PROVIDER_FAILED", message: "no" } });
  if (url.pathname === "/api/profile/autofill-inference") { if (state.inferHold) await new Promise(resolve => state.releaseInfer = resolve); return json(200, { success: true, data: { primaryIndustryId: null, secondaryIndustryId: null, seniorityLevel: null, offering: [], topics: [], ...state.infer } }); }
  if (url.pathname === "/api/profile/seek-suggestions") return json(200, { success: true, data: { suggestions: state.seekSuggestions } });
  return json(404, { success: false, error: { code: "NOT_FOUND", message: "missing" } });
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor:one", user: { id: "user:one" }, cookieHeader: "", signOut: async () => { state.signOutCalls = (state.signOutCalls || 0) + 1; return state.signOut; } });
export const useOnboardingGate = () => ({ status: "unknown", settle: async verdict => { state.verdicts.push(verdict); } });
export const OrbitLocaleContext = React.createContext({ language: state.language });
export default { getItem: async key => state.storage[key] ?? null, setItem: async (key, value) => { state.storage[key] = value; }, removeItem: async key => { delete state.storage[key]; } };
export const encodeDirectScanImage = async () => ({ base64: "AAAA", mimeType: "image/jpeg", fileName: "card.jpg", size: 3 });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
const dictionaries = { zh, en, ja };
export const useOrbitLocale = () => { observe(); const t = (key, params = {}) => Object.entries(params).reduce((text, [k, v]) => text.replaceAll("{" + k + "}", String(v)), dictionaries[state.language][key]); t.literal = v => v; return { language: state.language, choice: state.language, t }; };
export const useRouter = () => ({ replace(href) { state.navigation.push("replace:" + href); state.update({}); }, push(href) { state.navigation.push("push:" + href); state.update({}); }, back() {}, canGoBack: () => true });
export const useFocusEffect = effect => useEffect(() => effect(), [effect]);
export const useLocalSearchParams = () => ({ next: state.next });
export const randomUUID = () => "fixture-" + ++uuid;
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true });
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const launchImageLibraryAsync = async () => state.card ? { canceled: false, assets: [{ uri: "card.jpg", fileName: "card.jpg" }] } : { canceled: true, assets: null };
export const launchCameraAsync = async () => ({ canceled: true, assets: null });
export const useSafeAreaInsets = () => ({ top: 47, bottom: 34, left: 0, right: 0 });
export const SafeAreaView = ({ style, edges, ...props }) => <View {...props} style={style} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, color }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture";
import { UiPortalHost } from "./src/components/ui"; import { ProfileOnboardingScreen } from "./src/screens/profile/onboarding/ProfileOnboardingScreen";
function App(){ const s = useFixture(); return <UiPortalHost><ProfileOnboardingScreen key={s.language + (s.mount || 0)} next={s.next} /></UiPortalHost>; } createRoot(document.getElementById("root")).render(<App />);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "onboarding-fixture", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|expo-image-picker|@expo\/vector-icons|react-native-safe-area-context)$|^@react-native-async-storage\/async-storage$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|OnboardingGateProvider|batch-images)$/ }, () => ({ path: "fixture", namespace: "onboarding" }));
      plugin.onResolve({ filter: /^react-native-reanimated$|^react-native-gesture-handler$|^expo-haptics$|^expo-blur$|^react-native-svg$/ }, args => ({ path: `${process.cwd()}/tests/helpers/stubs/${args.path}.js` }));
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

const IT = { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" };
const flowAt = (lastConfirmedScreen: number, patch: Record<string, unknown> = {}) => ({ flow: { version: 1, currentScreen: lastConfirmedScreen < 5 ? lastConfirmedScreen + 1 : null, lastConfirmedScreen, finishedAt: null, deferred: false, revision: "flow:1", ...patch } });
const next = (page: Page) => page.getByTestId("onboarding-next");
const alerts = (page: Page) => page.getByRole("alert").allTextContents();

// The birthday picker opens on January, thirty years back; nothing is chosen until a day is tapped.
async function pickBirthday(page: Page, date: string) {
  await page.getByRole("button", { name: /^生日（可选）：/u }).click();
  const [year, month] = date.split("-").map(Number) as [number, number];
  for (let step = new Date().getFullYear() - 30; step > year; step -= 1) await page.getByRole("button", { name: "上一年", exact: true }).click();
  for (let step = 1; step < month; step += 1) await page.getByRole("button", { name: "下个月", exact: true }).click();
  await page.getByRole("button", { name: date, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
}
async function pickIndustry(page: Page) {
  await page.getByRole("button", { name: /^行业：/u }).click();
  await page.getByRole("button", { name: "科技与互联网", exact: true }).click();
  await page.getByRole("button", { name: /^细分：/u }).click();
  await page.getByRole("button", { name: "人工智能与数据", exact: true }).click();
}

test("a new account goes 名片与基本信息 → 目标与强项 → 自我介绍 → next, with nothing to skip", async t => {
  const page = await open(t);
  await page.getByText("第1/3步 · 名片与基本信息", { exact: true }).waitFor();
  for (const gone of ["稍后", "先随便看看", "之后再说"]) assert.equal(await page.getByRole("button", { name: gone }).count(), 0, gone);
  await page.getByText(/只填一次/u).waitFor();
  await page.getByText(/扫一下自己的名片，大部分内容会自动填好。/u).waitFor();
  await shot(page, "01-profile");
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await page.getByRole("textbox", { name: "职位" }).fill("产品负责人");
  await page.getByRole("textbox", { name: "LINE" }).fill("lin-line");
  await pickIndustry(page);
  await pickBirthday(page, "1990-05-20");
  await page.getByRole("button", { name: "生日（可选）：1990年5月20日" }).waitFor();
  await page.getByRole("button", { name: "清除生日" }).click();
  await pickBirthday(page, "1990-05-20");
  await next(page).click();

  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  assert.equal(await page.getByText(/扫一下自己的名片/u).count(), 0, "the second sentence is only on step 1");
  const first = await fx(page);
  const writes = first.requests.filter((r: any) => r.path === "/api/profile");
  assert.deepEqual(writes.map((r: any) => r.method), ["GET", "PUT", "GET"], "initial read, save, readback");
  assert.deepEqual({ ...writes[1].body, mutationId: undefined }, { birthDate: "1990-05-20", displayName: "林晓", organization: "", role: "产品负责人", ...IT, homeMarket: "", handles: { lineId: "lin-line" }, expectedUpdatedAt: null, mutationId: undefined });
  for (const goal of ["获取客户", "寻找投资"]) await page.getByRole("button", { name: goal, exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "招聘人才", exact: true }).isDisabled(), true, "a third goal is blocked");
  assert.equal((await next(page).textContent())!.replace(/\s+/gu, " "), "下一步 · 目标2/2");
  await page.getByRole("textbox", { name: "一句话说明（可选）" }).fill("先找到 5 家试用企业");
  await page.getByRole("button", { name: "客户引荐", exact: true }).click();
  await page.getByRole("button", { name: "投资人", exact: true }).click();
  await shot(page, "02-goals");
  await next(page).click();

  await page.getByText("第3/3步 · 自我介绍", { exact: true }).waitFor();
  await page.getByText("第1版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  const second = (await fx(page)).profile;
  assert.equal(second.relationshipGoal, "获取客户、寻找投资：先找到 5 家试用企业");
  assert.deepEqual([second.offering, second.seeking, second.topics], [["客户引荐"], ["投资人"], []]);
  await shot(page, "03-intro");
  assert.equal(await next(page).textContent(), "用这些内容开始");
  await next(page).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  const done = await fx(page);
  assert.deepEqual(done.navigation, ["replace:/events/e1"]);
  assert.equal(done.profile.bio, "第1版：做 AI 会议纪要的产品负责人。");
  const commands = done.requests.filter((r: any) => r.path === "/api/profile/onboarding-progress" && r.method === "POST").map((r: any) => r.body);
  assert.deepEqual(commands.map((command: any) => command.screen ?? command.action), ["initialize", 1, 2, 3, 4, 5, "finish"], "three steps on the server's five screens; never a deferral");
  assert.deepEqual(commands.filter((command: any) => command.contactMethodsConfirmed === true).map((command: any) => command.screen), [1]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.verdicts), ["required", "clear"]);
  assert.deepEqual(await page.evaluate(() => Object.keys((window as any).fixture.storage)), [], "the draft is gone");
});

test("「下一步」 is never greyed out: it lists what is missing, marks it, and each mark goes as soon as it is filled", async t => {
  const page = await open(t);
  await next(page).waitFor();
  // UR-C11：同页同一种栏位，不套卡；LINE、微信 直接给出并带「推荐」，邮箱・电话收在「＋」里。
  const contacts = page.getByTestId("onboarding-contact-methods");
  await contacts.getByText("只有人脉里的人和你报名活动的主办方能看到。", { exact: true }).waitFor();
  assert.match(await contacts.innerText(), /^联系方式\s*至少一种/u);
  assert.deepEqual(await contacts.getByRole("textbox").evaluateAll(inputs => inputs.map(input => input.getAttribute("aria-label"))), ["LINE", "微信"]);
  assert.equal(await contacts.getByText("推荐", { exact: true }).count(), 2);
  await contacts.getByRole("button", { name: "填写邮箱或电话" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await next(page).isDisabled(), false);
  assert.equal(Math.round((await next(page).boundingBox())!.height), 50, "the page's main button (.btn.xl)");
  await page.evaluate(() => document.querySelector('[data-testid="onboarding-scroll"]')!.scrollTo(0, 9999));
  await next(page).click();
  const contactError = "填写其中一种即可";
  assert.deepEqual(await alerts(page), ["请填写姓名", "请选择行业", contactError, "还差3项：姓名、行业、联系方式"]);
  assert.equal(await page.getByRole("textbox", { name: "姓名" }).evaluate(el => el === document.activeElement), true, "focus on the first missing field");
  await page.waitForFunction(() => document.querySelector('[data-testid="onboarding-scroll"]')!.scrollTop < 500);
  await shot(page, "04-missing");
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  assert.deepEqual(await alerts(page), ["请选择行业", contactError, "还差2项：行业、联系方式"]);
  await page.getByRole("button", { name: /^行业：/u }).click();
  await page.getByRole("button", { name: "科技与互联网", exact: true }).click();
  assert.deepEqual(await alerts(page), ["请选择细分行业", contactError, "还差2项：细分、联系方式"], "the detail is asked for once there is an industry");
  await page.getByRole("button", { name: /^细分：/u }).click();
  await page.getByRole("button", { name: "人工智能与数据", exact: true }).click();
  assert.deepEqual(await alerts(page), [contactError, "还差1项：联系方式"]);
  // UR-C14：格式不对只标这一栏，按钮上方一句。
  await page.getByRole("button", { name: "填写邮箱或电话" }).click();
  await page.getByRole("textbox", { name: "邮箱" }).fill("lin@orbit");
  assert.deepEqual(await alerts(page), ["请检查邮箱格式（例：name@example.com）", "请检查邮箱格式"]);
  await page.getByRole("textbox", { name: "邮箱" }).fill("lin@orbit.example");
  assert.deepEqual(await alerts(page), []);
  assert.equal((await fx(page)).requests.filter((r: any) => r.method === "PUT").length, 0, "nothing was sent while something was missing");
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  assert.deepEqual(await alerts(page), [], "a new step starts clean");
  await next(page).click();
  assert.deepEqual(await alerts(page), ["请至少选择1个目标", "还差1项：目标"]);
  await page.getByRole("button", { name: "招聘人才", exact: true }).click();
  assert.deepEqual(await alerts(page), []);
});

test("the card's WeChat, LINE and website only fill what the profile leaves empty", async t => {
  const scan = { draft: { displayName: "林晓", organization: "Orbit", role: "CEO", email: "lin@orbit.example", phone: "" }, ocr: { structuredExtraction: { ...IT, contactPoints: [{ type: "wechat", value: "card-wechat" }, { type: "line", value: "card-line" }], website: "https://card.example" } } };
  const page = await open(t, { card: true, scan, ...withProfile({ handles: { wechatId: "my-wechat", website: "", xHandle: "lin" } }) });
  await page.getByRole("button", { name: "从相册选择" }).click();
  await page.getByText(/^名片读到/u).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "LINE" }).inputValue(), "card-line");
  assert.equal(await page.getByRole("textbox", { name: "微信" }).inputValue(), "my-wechat");
  await page.getByRole("textbox", { name: "LINE" }).fill("reviewed-line");
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  assert.deepEqual((await fx(page)).profile.handles, { email: "lin@orbit.example", wechatId: "my-wechat", lineId: "reviewed-line", website: "https://card.example", xHandle: "lin" });
});

test("the own card fills what is printed and what AI judged, says which is which, and a change drops the mark", async t => {
  const scan = { draft: { displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "代表取締役 CEO", email: "sato@minatolink.example", phone: "03-5555-0142" }, ocr: { structuredExtraction: IT } };
  const page = await open(t, { card: true, scan, infer: { status: "ready", offering: ["客户引荐", "人才推荐"], topics: ["生成式 AI"] } });
  await page.getByRole("button", { name: "从相册选择" }).click();
  await page.getByText("名片读到5项，AI推断2项", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "姓名" }).inputValue(), "佐藤 健一");
  assert.equal(await page.getByRole("textbox", { name: "邮箱" }).inputValue(), "sato@minatolink.example");
  assert.equal(await page.getByRole("textbox", { name: "电话" }).inputValue(), "03-5555-0142");
  assert.deepEqual([await page.getByText("来自名片", { exact: true }).count(), await page.getByText("AI推断", { exact: true }).count()], [5, 2]);
  await shot(page, "05-scanned");
  await page.getByRole("textbox", { name: "职位" }).fill("CEO");
  assert.equal(await page.getByText("来自名片", { exact: true }).count(), 4);
  await page.getByRole("button", { name: /^细分：/u }).click();
  await page.getByRole("button", { name: "企业软件与 SaaS", exact: true }).click();
  assert.equal(await page.getByText("AI推断", { exact: true }).count(), 1, "only the changed detail loses its mark");
  const { requests } = await fx(page);
  const infer = requests.find((r: any) => r.path === "/api/profile/autofill-inference");
  assert.deepEqual(infer.body, { displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "代表取締役 CEO", language: "zh", ...IT });
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  const saved = (await fx(page)).profile;
  assert.deepEqual([saved.handles, saved.role], [{ email: "sato@minatolink.example", phone: "03-5555-0142" }, "CEO"]);
  assert.equal(await page.getByRole("button", { name: "客户引荐", exact: true }).getAttribute("aria-selected"), "true", "AI preselects strengths");
  assert.equal(await page.getByText("AI推断", { exact: true }).count(), 2, "strengths and topics are marked");
  await page.getByRole("button", { name: "人才推荐", exact: true }).click();
  assert.equal(await page.getByText("AI推断", { exact: true }).count(), 1, "the changed group is the person's own now");
  assert.equal((await fx(page)).requests.filter((r: any) => r.path === "/api/profile/autofill-inference").length, 1, "asked once");
});

test("level and place: optional, filled from the card with their own marks, changed or cleared by the person", async t => {
  const draft = { displayName: "佐藤 健一", organization: "株式会社ミナトリンク", role: "CEO", email: "", phone: "" };
  const page = await open(t, { card: true, scan: { draft, ocr: { structuredExtraction: { ...IT, seniorityLevel: "c_level", regionCountryCode: "JP", regionCity: "Tokyo" } } }, infer: { status: "ready", seniorityLevel: "founder" } });
  await page.getByText("职级（可选）", { exact: true }).waitFor();
  await page.getByText("所在地（可选）", { exact: true }).waitFor();
  const y = async (name: RegExp | string, role: "button" | "textbox") => (await page.getByRole(role, { name }).boundingBox())!.y;
  assert.ok(await y(/^细分：/u, "button") < await y(/^职级：/u, "button") && await y(/^职级：/u, "button") < await y("所在地", "textbox") && await y("所在地", "textbox") < await y(/^生日/u, "button"));
  await page.getByRole("button", { name: "从相册选择" }).click();
  await page.getByText("名片读到4项，AI推断3项", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "所在地" }).inputValue(), "日本 · 东京");
  await page.getByRole("button", { name: "职级：高管（C 级）" }).waitFor();
  assert.deepEqual([await page.getByText("来自名片", { exact: true }).count(), await page.getByText("AI推断", { exact: true }).count()], [4, 3]);
  await page.getByRole("textbox", { name: "所在地" }).fill("大阪");
  await page.getByRole("button", { name: /^职级：/u }).click();
  for (const label of ["未选", "一般职员", "经理", "总监", "副总裁", "高管（C 级）", "创始人"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1, label);
  await page.getByRole("button", { name: "经理", exact: true }).click();
  assert.deepEqual([await page.getByText("来自名片", { exact: true }).count(), await page.getByText("AI推断", { exact: true }).count()], [3, 2]);
  await page.getByRole("textbox", { name: "微信" }).fill("example-wechat");
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  let saved = (await fx(page)).profile;
  assert.deepEqual([saved.seniorityLevel, saved.homeMarket], ["manager", "大阪"]);
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "职级：经理" }).click();
  await page.getByRole("button", { name: "未选", exact: true }).click();
  await page.getByRole("textbox", { name: "所在地" }).fill("");
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  saved = (await fx(page)).profile;
  assert.deepEqual([saved.seniorityLevel ?? null, saved.homeMarket], [null, ""], "both can be emptied; neither stops 下一步");
  assert.equal((await fx(page)).requests.filter((r: any) => r.path === "/api/profile/autofill-inference").length, 1);
});

test("the inferred level fills only an empty, untouched field", async t => {
  const scan = { draft: { displayName: "林晓", organization: "Orbit", role: "CEO", email: "", phone: "" }, ocr: { structuredExtraction: { ...IT, regionCountryCode: "SG", regionCity: "Singapore" } } };
  const filled = await open(t, { card: true, scan, infer: { status: "ready", seniorityLevel: "founder" } });
  await filled.getByRole("button", { name: "从相册选择" }).click();
  await filled.getByText("名片读到4项，AI推断3项", { exact: true }).waitFor();
  await filled.getByRole("button", { name: "职级：创始人" }).waitFor();
  assert.equal(await filled.getByRole("textbox", { name: "所在地" }).inputValue(), "新加坡", "a city state is not said twice");
  const touched = await open(t, { card: true, scan, inferHold: true, infer: { status: "ready", seniorityLevel: "founder" } });
  await touched.getByRole("button", { name: "从相册选择" }).click();
  await touched.getByText("名片读到4项，AI推断2项", { exact: true }).waitFor();
  await touched.getByRole("button", { name: /^职级：/u }).click();
  await touched.getByRole("button", { name: "未选", exact: true }).click();
  await touched.evaluate(() => { const s = (window as any).fixture; s.inferHold = false; s.releaseInfer(); });
  await touched.waitForTimeout(60);
  await touched.getByRole("button", { name: "职级：选择" }).waitFor();
  assert.equal((await fx(touched)).requests.filter((r: any) => r.path === "/api/profile/autofill-inference").length, 1);
});

test("no industry on the card, AI unavailable or late: nothing blocks, nothing the person chose is overwritten", async t => {
  const scan = { draft: { displayName: "林晓", organization: "Orbit", role: "", email: "", phone: "" }, ocr: {} };
  const page = await open(t, { card: true, scan, inferHold: true, infer: { status: "ready", primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.venture_capital", offering: ["客户引荐"], topics: [] } });
  await page.getByRole("button", { name: "从相册选择" }).click();
  await page.getByText("名片读到2项", { exact: true }).waitFor();
  await page.getByRole("button", { name: "填写邮箱或电话" }).click();
  assert.equal(await page.getByRole("textbox", { name: "邮箱" }).inputValue(), "", "methods can be entered when a card has none");
  await pickIndustry(page);
  await page.evaluate(() => { const s = (window as any).fixture; s.inferHold = false; s.releaseInfer(); });
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "行业：科技与互联网" }).waitFor();
  const failed = await open(t, { card: true });
  await failed.getByRole("button", { name: "从相册选择" }).click();
  await failed.getByText("没能识别这张名片。请换一张清晰的照片，或手动填写。", { exact: true }).waitFor();
  await failed.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await failed.getByRole("textbox", { name: "LINE" }).fill("lin-line");
  await pickIndustry(failed);
  await next(failed).click();
  await failed.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
});

test("goals bring dashed candidates for what is being looked for; they join only when tapped", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank }), ...flowAt(1), seekSuggestions: ["潜在客户", "服务商"] });
  await page.getByRole("button", { name: "获取客户", exact: true }).click();
  const candidate = page.getByRole("button", { name: "服务商", exact: true });
  await candidate.waitFor();
  assert.equal(await candidate.getAttribute("aria-selected"), null, "not chosen");
  const request = (await fx(page)).requests.find((r: any) => r.path === "/api/profile/seek-suggestions");
  assert.equal(request.body.goal, "获取客户");
  await candidate.click();
  assert.equal(await page.getByRole("button", { name: "服务商", exact: true }).getAttribute("aria-selected"), "true");
  await page.getByRole("button", { name: "正在寻找的：添加" }).click();
  await page.getByRole("textbox", { name: "输入后添加" }).fill("共同研发伙伴");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await next(page).click();
  await page.getByText("第3/3步 · 自我介绍", { exact: true }).waitFor();
  assert.deepEqual((await fx(page)).profile.seeking, ["服务商", "共同研发伙伴"]);
});

test("what was typed survives a kill: same step, same values, marks included", async t => {
  const page = await open(t);
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await page.getByRole("textbox", { name: "公司" }).fill("Orbit");
  await page.waitForFunction(() => Object.values((window as any).fixture.storage).some((value: any) => value.includes("Orbit")));
  const storage = await page.evaluate(() => (window as any).fixture.storage);
  const again = await open(t, { storage });
  await again.getByText("第1/3步 · 名片与基本信息", { exact: true }).waitFor();
  assert.equal(await again.getByRole("textbox", { name: "姓名" }).inputValue(), "林晓");
  assert.equal(await again.getByRole("textbox", { name: "公司" }).inputValue(), "Orbit");
});

test("it reopens on the step that was reached, and never past one that is incomplete", async t => {
  for (const [patch, flow, expected] of [
    [{ ...complete, ...blank }, flowAt(1), "第2/3步 · 目标与强项"],
    [{ ...complete, ...blank, relationshipGoal: "获取客户" }, flowAt(2), "第2/3步 · 目标与强项"],
    [{ ...complete, ...blank, relationshipGoal: "获取客户" }, flowAt(3), "第3/3步 · 自我介绍"],
    [{ ...complete, ...blank, relationshipGoal: "获取客户", bio: "已有介绍" }, flowAt(4), "第3/3步 · 自我介绍"],
    [{ ...complete, ...blank, bio: "已有介绍" }, flowAt(4, { deferred: true }), "第2/3步 · 目标与强项"],
    [{ ...complete, ...blank, displayName: "", bio: "已有介绍" }, flowAt(3, { deferred: true }), "第1/3步 · 名片与基本信息"],
  ] as const) {
    const page = await open(t, { ...withProfile(patch), ...flow });
    await page.getByText(expected, { exact: true }).waitFor();
    assert.deepEqual((await fx(page)).navigation, [], expected);
  }
});

test("a migrated account repairs its required fields on one page, keeps saved details, and returns to the event", async t => {
  const handles = { email: "legacy@example.test", wechatId: "existing" };
  const page = await open(t, {
    ...withProfile({ ...complete, ...blank, displayName: "", secondaryIndustryId: null, organization: "已有公司", bio: "已有简介", handles }),
    ...flowAt(3), legacyRepair: true,
  });
  // UR-R10：顶部一句来由；标题「确认个人资料」。
  await page.getByText("确认个人资料", { exact: true }).first().waitFor();
  assert.equal(await page.getByTestId("onboarding-repair-notice").innerText(), "📦\n已沿用你之前报名活动时填写的内容。补齐缺少的项目并保存后，会回到你刚才打开的页面。");
  await page.getByText("行业用于在活动中帮你找到聊得来的人。", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("onboarding-contact-methods").count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "公司" }).count(), 0);
  assert.equal(await page.getByText(/第1\/3步/).count(), 0);
  await next(page).click();
  assert.equal((await fx(page)).requests.filter((request: any) => request.method === "PUT").length, 0);
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  // UR-R11：行业面板标题旁写件数，选项是单选。
  await page.getByRole("button", { name: /^细分：/u }).click();
  const sheet = page.getByTestId("onboarding-pick-list");
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /^选择细分行业\s*\d+ 项/u);
  await sheet.getByRole("radio", { name: "人工智能与数据", exact: true }).click();
  await page.getByRole("button", { name: "保存并继续" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  const { aiCalls, navigation, profile, requests } = await fx(page);
  assert.deepEqual(navigation, ["replace:/events/e1"]);
  assert.equal(aiCalls, 0);
  assert.equal(profile.organization, "已有公司");
  assert.equal(profile.bio, "已有简介");
  assert.deepEqual(profile.handles, handles);
  const writes = requests.filter((request: any) => request.method === "PUT" || request.method === "POST");
  assert.deepEqual(writes.map((request: any) => request.path), ["/api/profile", "/api/profile/onboarding-progress"]);
  const { expectedUpdatedAt, mutationId, ...patched } = writes[0].body;
  assert.deepEqual(patched, { displayName: "林晓", ...IT });
  assert.equal(writes[1].body.action, "finish_repair");
  assert.equal(writes[1].body.expectedRevision, "flow:1");
});

test("set-up accounts go straight to next and write nothing", async t => {
  for (const flow of [{ flow: null }, flowAt(5, { finishedAt: "2026-10-20T00:00:00.000Z" }), flowAt(2, { deferred: true })]) {
    const page = await open(t, { ...withProfile({ ...complete, relationshipGoal: "x", bio: "b" }), ...flow });
    await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
    const { navigation, requests } = await fx(page);
    assert.deepEqual(navigation, ["replace:/events/e1"]);
    assert.deepEqual(requests.map((r: any) => r.method), ["GET", "GET"]);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.verdicts), ["clear"]);
  }
});

test("with no next, finishing lands on Home as a tab page", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户", bio: "已有介绍" }), ...flowAt(4), next: "" });
  await page.getByText("已有介绍", { exact: true }).waitFor();
  assert.equal((await fx(page)).aiCalls, 0, "an existing introduction is not regenerated");
  await next(page).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual((await fx(page)).navigation, ["replace:/home"]);
});

test("left half way and opened again from Home, finishing still leads to where it was first asked for, once", async t => {
  const half = { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户", bio: "已有介绍" }), ...flowAt(4) };
  const first = await open(t, { ...half, next: "/events/e1?tab=people" });
  await first.getByText("已有介绍", { exact: true }).waitFor();
  const storage = await first.evaluate(() => (window as any).fixture.storage);
  const again = await open(t, { ...half, next: "/home", storage });
  await again.getByText("已有介绍", { exact: true }).waitFor();
  await next(again).click();
  await again.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual((await fx(again)).navigation, ["replace:/events/e1?tab=people"]);
  assert.ok(!(await again.evaluate(() => Object.keys((window as any).fixture.storage).some(key => key.includes("onboarding-return")))));
  // Another page asked for meanwhile wins over the remembered one.
  const other = await open(t, { ...half, next: "/inbox/notifications/n1", storage });
  await other.getByText("已有介绍", { exact: true }).waitFor();
  await next(other).click();
  await other.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual((await fx(other)).navigation, ["replace:/inbox/notifications/n1"]);
});

test("a load failure offers retry and log out, and no way past", async t => {
  const page = await open(t, { network: true });
  await page.getByText("资料暂时读取不了，请重试。", { exact: true }).waitFor();
  const names = await page.getByRole("button").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  assert.deepEqual(names.sort(), ["退出登录", "重试"].sort());
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.verdicts), ["required"], "an account nothing is known about is held");
  const before = (await fx(page)).requests.length;
  await page.getByRole("button", { name: "重试" }).click();
  await page.waitForFunction(count => (window as any).fixture.requests.length >= count + 2, before);
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual((await fx(page)).navigation, ["replace:/account/login"]);
});

test("log out keeps the draft for the next sign-in; a refused log out stays and says so", async t => {
  const page = await open(t);
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await set(page, { signOut: { success: false, message: "退出登录失败，请稍后再试。" } });
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByText("退出登录失败，请稍后再试。", { exact: true }).waitFor();
  await set(page, { signOut: { success: true } });
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual((await fx(page)).navigation, ["replace:/account/login"]);
  assert.ok(Object.values(await page.evaluate(() => (window as any).fixture.storage)).some(value => String(value).includes("林晓")));
});

test("a failed save keeps every value; the next tap saves and goes on", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户（本月）" }), ...flowAt(1) });
  await page.getByRole("button", { name: "客户引荐", exact: true }).click();
  await set(page, { put: "fail" });
  await next(page).click();
  await page.getByText("没保存成功，填写的内容都还在。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "客户引荐", exact: true }).getAttribute("aria-selected"), "true");
  await set(page, { put: "ok", network: true });
  await next(page).click();
  await page.getByText("当前离线，填写的内容都还在。", { exact: true }).waitFor();
  await set(page, { network: false });
  await next(page).click();
  await page.getByText("第3/3步 · 自我介绍", { exact: true }).waitFor();
  assert.equal((await fx(page)).profile.relationshipGoal, "获取客户（本月）", "a saved deadline is kept");
});

test("a save whose answer was lost goes on at the next tap; a real conflict is told and takes the newer version", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank }), ...flowAt(1) });
  await page.getByRole("button", { name: "获取客户", exact: true }).click();
  await set(page, { loseAnswer: true });
  await next(page).click();
  await page.getByText("当前离线，填写的内容都还在。", { exact: true }).waitFor();
  await next(page).click();
  await page.getByText("第3/3步 · 自我介绍", { exact: true }).waitFor();
  assert.equal((await fx(page)).profile.relationshipGoal, "获取客户");
  const other = await open(t, { ...withProfile({ ...complete, ...blank }), ...flowAt(1) });
  await other.getByRole("button", { name: "获取客户", exact: true }).click();
  await other.evaluate(() => { const s = (window as any).fixture; s.detail = { ...s.detail, profile: { ...s.detail.profile, updatedAt: "2026-11-20T00:00:00.000Z", relationshipGoal: "别处改的" } }; });
  await next(other).click();
  await other.getByText("资料在另一台设备上更新过，正在读取最新内容。", { exact: true }).waitFor();
  assert.equal((await fx(other)).profile.relationshipGoal, "别处改的", "nothing overwritten yet");
});

test("a failed progress confirmation retains the saved step but does not drop later edits", async t => {
  const page = await open(t);
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓");
  await page.getByRole("textbox", { name: "LINE" }).fill("lin-line");
  await pickIndustry(page);
  await set(page, { flowConfirm: "fail" });
  await next(page).click();
  await page.getByText("没保存成功，填写的内容都还在。", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "姓名" }).fill("林晓二");
  await set(page, { flowConfirm: "ok" });
  await next(page).click();
  await page.getByText("第2/3步 · 目标与强项", { exact: true }).waitFor();
  const writes = (await fx(page)).requests.filter((request: any) => request.path === "/api/profile" && request.method === "PUT");
  assert.deepEqual(writes.map((request: any) => request.body.displayName), ["林晓", "林晓二"]);
});

test("intro: drafted once on entry; failure can be retried or written by hand; 换一版 counts only successes", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户", offering: ["客户引荐"] }), ...flowAt(3), ai: "fail" });
  await page.getByText("这次没写出来。可以重试，或直接在下面写几句。", { exact: true }).waitFor();
  await next(page).click();
  assert.deepEqual((await alerts(page)).slice(-2), ["请填写自我介绍", "还差1项：自我介绍"]);
  await set(page, { ai: "ok" });
  await page.getByRole("button", { name: "重试" }).click();
  await page.getByText("第2版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  await page.getByText("还剩2次", { exact: true }).waitFor();
  await page.getByRole("button", { name: "换一版" }).click();
  await page.getByText("第3版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  await page.getByText("还剩1次", { exact: true }).waitFor();
  await set(page, { ai: "fail" });
  await page.getByRole("button", { name: "换一版" }).click();
  await page.getByText("这次没换成功，保留了上一版。", { exact: true }).waitFor();
  await page.getByText("第3版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  await page.getByText("还剩1次", { exact: true }).waitFor();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("textbox", { name: "自我介绍" }).fill("界".repeat(81));
  await page.getByText("81 / 80字", { exact: true }).waitFor();
  await next(page).click();
  assert.deepEqual(await alerts(page), ["自我介绍请控制在80字以内", "还差1项：自我介绍"]);
  await page.getByRole("textbox", { name: "自我介绍" }).fill("自己写的介绍");
  assert.deepEqual(await alerts(page), []);
  await next(page).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  const { profile, aiCalls, requests } = await fx(page);
  assert.equal(aiCalls, 4);
  assert.deepEqual(requests.filter((r: any) => r.path === "/api/profile/intro-draft").map((r: any) => r.body.language), Array(4).fill("zh"));
  assert.equal(profile.bio, "自己写的介绍");
});

test("intro tones are Web's two: a new one is drafted and counted, one already drafted comes back with its edits, a failure keeps the old", async t => {
  const page = await open(t, { ...withProfile({ ...complete, ...blank, relationshipGoal: "获取客户" }), ...flowAt(3) });
  await page.getByText("第1版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  assert.deepEqual(await page.getByRole("radio").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))), ["商务", "English"]);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("textbox", { name: "自我介绍" }).fill("改过的商务版");
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await set(page, { ai: "fail" });
  await page.getByRole("radio", { name: "English" }).click();
  await page.getByText("这次没换成功，保留了上一版。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "商务" }).getAttribute("aria-checked"), "true", "back on the tone that has a draft");
  await page.getByText("改过的商务版", { exact: true }).waitFor();
  await page.getByText("还剩2次", { exact: true }).waitFor();
  await set(page, { ai: "ok" });
  await page.getByRole("radio", { name: "English" }).click();
  await page.getByText("第3版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  await page.getByText("还剩1次", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "商务" }).click();
  await page.getByText("改过的商务版", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "English" }).click();
  await page.getByText("第3版：做 AI 会议纪要的产品负责人。", { exact: true }).waitFor();
  await page.getByText("还剩1次", { exact: true }).waitFor();
  const { aiCalls, requests } = await fx(page);
  assert.equal(aiCalls, 3, "switching between drafted tones asks nothing");
  assert.deepEqual(requests.filter((r: any) => r.path === "/api/profile/intro-draft").map((r: any) => r.body.language), ["zh", "en", "en"]);
});

test("every visible word is translated; the fixed notice and the button speak each language", async t => {
  for (const [language, step, notice, button, missing] of [
    ["ja", "ステップ 1 / 3 · 名刺・基本情報", "名刺を読み取ると、ほとんどの項目が自動で入ります。", "次へ", "あと 3 項目：氏名、業界、連絡先"],
    ["en", "Step 1 of 3 · Card & basics", "Scan your business card to fill in most of it.", "Next", "3 left: Name, Industry, Contact method"],
  ] as const) {
    const page = await open(t, { language });
    await page.getByText(step, { exact: true }).waitFor();
    await page.getByText(notice, { exact: false }).waitFor();
    assert.equal(await next(page).textContent(), button);
    await next(page).click();
    await page.getByText(missing, { exact: true }).waitFor();
  }
});
