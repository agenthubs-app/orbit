import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// R11a SC-06（App 人脈一覧）: the NATIVE screen (no .web) renders from the device copy with the server's rules —
// header 「N人 · 今月 +M」, three tabs with counts, local search, 🔍 → /search?q=, 絞り込み, ?industry= preselect,
// 「＋」 opens the add sheet over the list, offline keeps working; old mirror rows (no density) are filled on the device.
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const card = (id, name, org, role, extra) => ({ id, displayName: name, organization: org, role, sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z", ...extra });
const row = (c, minute, extraDetail) => ({ id: c.id, card: c, tags: [], search: { text: [c.displayName, c.role, c.organization].join(" "), occurredAt: "2026-10-01T00:0" + minute + ":00.000000Z", updatedAt: "2026-10-01T00:0" + minute + ":00.000000Z", error: null },
  detail: { id: c.id, displayName: c.displayName, ...extraDetail } });
const defaults = () => [
  row(card("c-ito", "伊藤 直子", "株式会社ハルモニア", "CFO", { density: 3, sourceChip: "meishi", metKind: "event", addedAt: "2026-10-05T00:00:00.000Z", primaryIndustryId: "finance_investment", region: { countryCode: "JP", city: "Tokyo" } }), 5),
  row(card("c-takahashi", "高橋 美咲", "青葉ベンチャーズ", "パートナー", { density: 2, sourceChip: "meishi", metKind: "event", addedAt: "2026-10-04T00:00:00.000Z", primaryIndustryId: "finance_investment" }), 4),
  row(card("c-suzuki", "鈴木 大輔", "北辰製作所", "DX 推進室 室長", { density: 2, sourceChip: "self", metKind: "referral", addedAt: "2026-09-04T00:00:00.000Z", primaryIndustryId: "manufacturing_supply_chain" }), 3),
  row(card("c-ishikawa", "石川 陽介", "石川デザイン事務所", "代表", { density: 1, sourceChip: "manual", metKind: "other", addedAt: "2026-10-03T00:00:00.000Z" }), 2),
  // An older mirror row: no R11a fields; the device fills density / chip / met from the detail it holds.
  row(card("c-legacy", "前田 隼人", "", "", { sourceType: "event_import" }), 1, { primaryPhone: "090", cardNotes: "出会い：紹介（田中さん）" }),
];
const contacts = () => (window.fixture.contacts ?? defaults()).map(payload => ({ id: payload.id, payload }));
const tasks = () => (window.fixture.tasks ?? [{ id: "t1", status: "open", category: "work", relatedContactId: "c-ishikawa" }, { id: "t2", status: "completed", category: "work", relatedContactId: "c-ito" }]).map(payload => ({ id: payload.id, payload }));
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, status: "fresh", online: true, ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const useGlobalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/contacts";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace(href) { state.navigation.push("replace:" + href); } });
export const useFocusEffect = () => undefined;
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-10-18T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "contact" ? contacts() : kind === "task" ? tasks() : [],
  refresh: async () => { state.syncs++; return null; }, invalidate: async () => null, currentSession: () => null,
});
const offline = { kind: "offline", error: { code: "NETWORK", message: "Network request failed" }, meta: {}, status: 0, refreshing: false, refresh() {} };
export const useApiResource = (path, _isEmpty, options) => {
  if (options?.enabled !== false) state.requests.push("resource:" + path);
  return options?.enabled === false ? { kind: "loading", refreshing: false, refresh() {} } : offline;
};
const goal = { ids: ["c-takahashi"], truncated: false, asOf: "2026-10-18T00:00:00.000Z", links: [{ contactId: "c-takahashi", label: "VC パートナー", talked: true }], followUpContactIds: ["c-suzuki"] };
const client = {
  async get(path) { state.requests.push("get:" + path); return state.online ? { success: true, status: 200, data: goal } : { success: false, status: 0, error: { message: "offline" } }; },
  async post(path) { state.requests.push("post:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
  async patch(path) { state.requests.push("patch:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
  async delete(path) { state.requests.push("delete:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
};
export const useOrbitApiClient = () => client;
const authSession = { ready: true, signedIn: true, accountId: "account:one", actorId: "account:one", cookieHeader: "", user: { id: "account:one" } };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture", ready: true });
const memory = new Map();
export default { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } };
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const useSafeAreaInsets = () => ({ top: 47, bottom: 34, left: 0, right: 0 });
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { NetworkScreen } from "./src/screens/network/NetworkScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "ja";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><NetworkScreen scopeKey="scope" now={() => Date.parse("2026-10-18T03:00:00.000Z")} /></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "network-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "network-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "network-native" }));
        plugin.onResolve({ filter: /^react-native-reanimated$|^react-native-gesture-handler$|^expo-haptics$|^expo-blur$|^react-native-svg$/ }, (args) => ({ path: `${process.cwd()}/tests/helpers/stubs/${args.path}.js` }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^expo-crypto$|^expo-camera$|^expo-image-picker$/ }, () => ({ path: "icons", namespace: "network-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "network-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "network-native" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "network-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, RadialGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub, Polyline=Stub, ClipPath=Stub, Use=Stub, Symbol=Stub; export const BlurView=Stub; export const impactAsync=async()=>{}; export const selectionAsync=async()=>{}; export const notificationAsync=async()=>{}; export const ImpactFeedbackStyle={}; export const NotificationFeedbackType={}; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], "no page errors"); });
  await page.goto(url);
  return page;
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);
const navigation = (page: Page) => page.evaluate(() => (window as any).fixture.navigation as string[]);
const listNames = (page: Page) => page.locator("[data-testid^='network-row-']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")!.replace("network-row-", "")));

test("the list renders from the device copy: header, tabs with counts, chips; no /api/contacts page or summary read", async (t) => {
  const page = await open(t);
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByText("5人 · 今月 +3", { exact: true }).waitFor();
  assert.deepEqual(await listNames(page), ["c-ito", "c-takahashi", "c-suzuki", "c-ishikawa", "c-legacy"]);
  await page.getByRole("tab", { name: "すべて" }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "目標に関係" }).innerText().then((text) => text.replace(/\s+/g, "")), "目標に関係1");
  assert.equal(await page.getByRole("tab", { name: "要フォロー" }).innerText().then((text) => text.replace(/\s+/g, "")), "要フォロー2", "the task mirror (c-ishikawa) + cached lifecycle ids (c-suzuki)");
  await page.getByText("🎯 VC パートナー · 話した", { exact: true }).waitFor();
  await page.getByText("本人入力", { exact: true }).waitFor();
  await page.getByText("会社・役職 未登録", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("network-invite-card").count(), 1, "fewer than 10 people: the invite card (app.html #7)");
  assert.equal(await page.getByTestId("network-analysis-locked").count(), 1);
  const reads = await requests(page);
  assert.deepEqual(reads.filter((path) => /\/api\/contacts\/(page|summary)/.test(path)), []);
  assert.deepEqual(reads.filter((path) => path.startsWith("get:")), ["get:/api/contacts/goal-related-ids"]);
});

test("tabs: 目標に関係 keeps the plan-related people, 要フォロー the people with an open follow-up", async (t) => {
  const page = await open(t);
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "目標に関係" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='network-row-']").length === 1);
  assert.deepEqual(await listNames(page), ["c-takahashi"]);
  await page.getByRole("tab", { name: "要フォロー" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='network-row-']").length === 2);
  assert.deepEqual(await listNames(page), ["c-suzuki", "c-ishikawa"]);
  await page.getByText("5人 · 今月 +3", { exact: true }).waitFor();
});

test("the search box filters the network on the device; 🔍 opens the global search with the typed words", async (t) => {
  const page = await open(t);
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByRole("textbox").fill("ハルモニア");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='network-row-']").length === 1);
  assert.deepEqual(await listNames(page), ["c-ito"]);
  await page.getByRole("button", { name: "すべてを検索" }).click();
  assert.deepEqual(await navigation(page), ["/search?q=%E3%83%8F%E3%83%AB%E3%83%A2%E3%83%8B%E3%82%A2"]);
});

test("絞り込み: groups with counts; 出会った場所 narrows the list; /contacts?industry= preselects the industry", async (t) => {
  const page = await open(t);
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByRole("button", { name: "絞り込み" }).click();
  await page.getByTestId("network-filter-sheet").waitFor();
  for (const label of ["段階", "業界", "地域", "出会った場所", "情報の濃さ"]) await page.getByTestId("network-filter-sheet").getByText(label, { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /^要フォロー/ }).count(), 0, "段階 has no 要フォロー option (the tab covers it)");
  assert.equal(await page.getByRole("checkbox", { name: /^推進中/ }).count(), 0, "推進中 / 協業中 are not shown (代定 12)");
  await page.getByRole("checkbox", { name: /^紹介/ }).click();
  await page.getByRole("button", { name: "1人を表示" }).click();
  assert.deepEqual(await listNames(page), ["c-suzuki"]);

  const preselected = await open(t, { params: { industry: "manufacturing_supply_chain" } });
  await preselected.getByText("鈴木 大輔", { exact: true }).waitFor();
  assert.deepEqual(await listNames(preselected), ["c-suzuki"]);
});

test("「＋」 opens 人脈を追加 over the list; rows open the contact", async (t) => {
  const page = await open(t);
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByRole("button", { name: "人脈を追加" }).first().click();
  await page.getByTestId("add-contact-sheet").waitFor();
  assert.equal(await page.getByTestId("network-list").count(), 1, "the list stays behind the sheet");
  const fresh = await open(t);
  await fresh.getByText("伊藤 直子", { exact: true }).click();
  assert.deepEqual(await navigation(fresh), ["/contacts/c-ito"]);
});

test("offline (airplane mode): the list, tabs and search still work from the device copy and the last cached plan ids", async (t) => {
  const page = await open(t, { status: "stale", online: false });
  await page.getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "要フォロー" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='network-row-']").length === 1);
  assert.deepEqual(await listNames(page), ["c-ishikawa"], "offline without a cache: the task mirror only");
  await page.getByRole("textbox").fill("石川");
  assert.deepEqual(await listNames(page), ["c-ishikawa"]);
});

test("the legacy row is filled on the device: ●●○ (phone + met context), イベント chip", async (t) => {
  const page = await open(t);
  const legacy = page.getByTestId("network-row-c-legacy");
  await legacy.waitFor();
  await legacy.getByText("イベント", { exact: true }).waitFor();
});

test("no contacts yet: the guide, the two tiles and the sample rows (app.html #6)", async (t) => {
  const page = await open(t, { contacts: [] });
  await page.getByTestId("network-empty").waitFor();
  await page.getByText("最初のつながりを追加", { exact: true }).waitFor();
  await page.getByText("まだ登録がありません", { exact: true }).waitFor();
  await page.getByRole("button", { name: "名刺をスキャン" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/new/scan"]);
});

test("ten or more people: the density card with 身元だけ / 名刺レベル / 関係まで and the 1日1問 hint (app.html #8)", async (t) => {
  const many = Array.from({ length: 12 }, (_, n) => ({ id: `m${n}`, card: { id: `m${n}`, displayName: `名前 ${n}`, organization: "会社", role: "役職", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z", density: (n % 3) + 1, sourceChip: "manual", metKind: "other", addedAt: "2026-09-01T00:00:00.000Z" }, tags: [], search: { text: `名前 ${n}`, occurredAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}.000000Z`, updatedAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}.000000Z`, error: null }, detail: null }));
  const page = await open(t, { contacts: many, tasks: [] });
  await page.getByTestId("network-density-card").waitFor();
  for (const label of ["身元だけ", "名刺レベル", "関係まで"]) await page.getByText(label, { exact: true }).waitFor();
  await page.getByText("12人 · 今月 +0", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("network-invite-card").count(), 0);
});
