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
  detail: extraDetail?.state ? extraDetail : { id: c.id, displayName: c.displayName, ...extraDetail } });
const defaults = () => [
  row(card("c-ito", "伊藤 直子", "株式会社ハルモニア", "CFO", { density: 3, sourceChip: "meishi", metKind: "event", addedAt: "2026-10-05T00:00:00.000Z", primaryIndustryId: "finance_investment", region: { countryCode: "JP", city: "Tokyo" } }), 5,
    { state: "success", contact: { id: "c-ito", displayName: "伊藤 直子", organization: "株式会社ハルモニア", role: "CFO", status: "nurture", primaryIndustryId: "finance_investment", primaryIndustryLabel: "金融・投資", region: { countryCode: "JP", city: "Tokyo" },
      primaryEmail: "ito@example.test", primaryPhone: "", nextAction: "決算資料のお礼を送る", tags: ["source:external-import", "CFO", "会食"], publicProfile: { offering: ["資本政策の助言"], seeking: ["製造業 SaaS"] },
      notes: [{ noteId: "n1", body: "DD の資料リストを受領", kind: "memo", createdAt: "2026-10-06T01:00:00.000Z" }],
      lastInteraction: { occurredAt: "2026-10-06T01:00:00.000Z", summary: "DD の資料リストを受領" },
      fieldHistory: [{ field: "role", previous: "経理部長", next: "CFO", source: "manual", at: "2026-10-02T00:00:00.000Z" }] } }),
  row(card("c-takahashi", "高橋 美咲", "青葉ベンチャーズ", "パートナー", { density: 2, sourceChip: "meishi", metKind: "event", addedAt: "2026-10-04T00:00:00.000Z", primaryIndustryId: "finance_investment" }), 4),
  row(card("c-suzuki", "鈴木 大輔", "北辰製作所", "DX 推進室 室長", { density: 2, sourceChip: "self", metKind: "referral", addedAt: "2026-09-04T00:00:00.000Z", primaryIndustryId: "manufacturing_supply_chain" }), 3,
    { state: "success", contact: { id: "c-suzuki", displayName: "鈴木 大輔", organization: "北辰製作所", role: "DX 推進室 室長", status: "active", primaryEmail: "s@example.test", primaryPhone: "", nextAction: "", tags: [],
      publicProfile: { offering: ["製造業の現場ネットワーク"], seeking: ["SaaS の販路"] }, notes: [], lastInteraction: null,
      fieldHistory: [{ field: "role", previous: "室長代理", next: "DX 推進室 室長", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" }] } }),
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
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, navigate(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace(href) { state.navigation.push("replace:" + href); } });
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
const offlineResult = { success: false, status: 0, error: { message: "offline" } };
const answers = {
  "/api/contacts/goal-related-ids": goal,
  "/api/contacts/value-lines?ids=c-ito&lang=en": { lines: [{ contactId: "c-ito", state: "ready", relation: "Led two Series A raises as CFO.", evidence: ["card", "memo:面談メモ"] }] },
  "/api/agent/plans/v2/contacts/c-ito/fit": { contactId: "c-ito", fits: [{ planId: "p1", goal: "シリーズA", itemId: "cfo", shortLabel: "CFO 経験者", emoji: "📊", status: "candidate", reason: "役職が CFO" }] },
  "/api/invite-codes/connections/c-suzuki": { contactId: "c-suzuki", connectedAt: "2026-10-08T03:00:00.000Z", via: { code: "7Q2K-8M4P" }, sharedByMe: ["organization"], sharedByPeer: ["organization", "email", "offering", "seeking"], pausedFields: ["email"] },
};
const client = {
  async get(path) { state.requests.push("get:" + path); if (!state.online) return offlineResult; return Object.hasOwn(answers, path) ? { success: true, status: 200, data: answers[path] } : { success: false, status: 404, error: { code: "NOT_FOUND", message: "nope" } }; },
  async post(path, options) { state.requests.push("post:" + path + (options?.body ? " " + JSON.stringify(options.body) : "")); return state.online ? { success: true, status: 200, data: {} } : offlineResult; },
  async patch(path, options) { state.requests.push("patch:" + path + " " + JSON.stringify(options?.body ?? null)); return state.online ? { success: true, status: 200, data: {} } : offlineResult; },
  async delete(path) { state.requests.push("delete:" + path); return state.online ? { success: true, status: 200, data: {} } : offlineResult; },
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
        import { NetworkContactScreen } from "./src/screens/network/NetworkContactScreen";
        import { ContactEditScreen } from "./src/screens/network/ContactEditScreen";
        import { ToastProvider, UiPortalHost } from "./src/components/ui";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "ja";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const now = () => Date.parse("2026-10-18T03:00:00.000Z");
        function Root() {
          const [screen, setScreen] = React.useState(window.initialFixture?.screen ?? "list");
          window.showScreen = setScreen;
          const id = window.initialFixture?.params?.id ?? "c-ito";
          return screen === "detail" ? <NetworkContactScreen contactId={id} now={now} /> : screen === "edit" ? <ContactEditScreen contactId={id} now={now} /> : <NetworkScreen scopeKey="scope" now={now} />;
        }
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><UiPortalHost><ToastProvider><Root /></ToastProvider></UiPortalHost></OrbitLocaleContext.Provider>);`,
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
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^expo-crypto$|^expo-camera$|^expo-image-picker$|^expo-clipboard$|^expo-sharing$|^expo-linking$|^expo-web-browser$/ }, () => ({ path: "icons", namespace: "network-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "network-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "network-native" }, () => ({ contents: `export * from "react-native-web"; export const findNodeHandle = () => null;`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "network-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, RadialGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub, Polyline=Stub, ClipPath=Stub, Use=Stub, Symbol=Stub; export const BlurView=Stub; export const impactAsync=async()=>{}; export const selectionAsync=async()=>{}; export const notificationAsync=async()=>{}; export const ImpactFeedbackStyle={}; export const NotificationFeedbackType={}; export const setStringAsync=async()=>true; export const getStringAsync=async()=>''; export const shareAsync=async()=>{}; export const isAvailableAsync=async()=>false; export const createURL=(p)=>p; export const openURL=async()=>{}; export const openBrowserAsync=async()=>({}); export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
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
  page.on("pageerror", (error) => { errors.push(error.message); console.log("PAGEERROR", error.message); });
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
  // 人脈分析 entry below 10 people (RD-33, app.html:469): 「10人から使えます · あと N人」 → the locked page; N from the header total.
  await page.getByTestId("network-analysis-locked").getByText("10人から使えます · あと 5人", { exact: true }).waitFor();
  await page.getByTestId("network-analysis-locked").click();
  assert.deepEqual(await navigation(page), ["/contacts/dashboard"]);
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
  assert.equal(await page.getByTestId("network-analysis-locked").count(), 0, "10 or more: the normal 人脈分析 › entry in the density card");
  await page.getByRole("link", { name: "人脈分析" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/dashboard"]);
});

test("detail (app.html #29): head card, the type confirm card, why (value line), next step, offering / seeking, interactions, 以前の値", async (t) => {
  const page = await open(t, { screen: "detail", params: { id: "c-ito" } });
  await page.getByTestId("network-contact-head").getByText("伊藤 直子", { exact: true }).waitFor();
  await page.getByText("関係構築", { exact: true }).waitFor();
  await page.getByText("金融・投資", { exact: true }).waitFor();
  await page.getByText("東京", { exact: true }).waitFor();
  await page.getByTestId("network-fit-card").getByText("プランの「CFO 経験者」に当てはまりそうです", { exact: true }).waitFor();
  await page.getByText("Led two Series A raises as CFO.", { exact: true }).waitFor();
  await page.getByText("決算資料のお礼を送る", { exact: true }).waitFor();
  await page.getByText("力になれること", { exact: true }).waitFor();
  await page.getByText("資本政策の助言", { exact: true }).waitFor();
  await page.getByTestId("network-interactions").getByText("DD の資料リストを受領", { exact: true }).waitFor();
  await page.getByTestId("network-previous-values").getByRole("button", { name: "以前の値" }).click();
  await page.getByText("経理部長", { exact: true }).waitFor();
  await page.getByRole("button", { name: "当てはまる" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid='network-fit-card']"));
  assert.ok((await requests(page)).some((path) => path.startsWith("post:/api/agent/plans/v2/p1/types/cfo/candidates/c-ito/decision") && path.includes("\"decision\":\"accept\"")));
  await page.getByRole("button", { name: "下書きを作成" }).click();
  assert.ok((await navigation(page)).some((href) => href.includes("prefillIntent")));
  await page.getByRole("button", { name: "面談の日程提案" }).click();
  await page.getByRole("dialog").first().waitFor({ timeout: 5000 }).catch(() => undefined);
});

test("detail of an invite-linked person: 本人入力, their fields with 本人 / 同期停止, connected via, their latest update (b9 #20 / #21)", async (t) => {
  const page = await open(t, { screen: "detail", params: { id: "c-suzuki" } });
  await page.getByText("本人が入力 · 相手の更新は自動で反映されます", { exact: true }).waitFor();
  await page.getByTestId("network-invite-fields").getByText("同期停止", { exact: true }).waitFor();
  await page.getByText("招待コード 7Q2K-8M4P · 10/8", { exact: true }).waitFor();
  await page.getByText("鈴木 大輔さんがプロフィールを更新しました", { exact: true }).waitFor();
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("button", { name: "共有する項目" }).waitFor();
  await page.getByRole("button", { name: "つながりを解除" }).waitFor();
});

test("detail offline: the device copy still shows; network-only blocks are hidden, nothing errors", async (t) => {
  const page = await open(t, { screen: "detail", params: { id: "c-ito" }, status: "stale", online: false });
  await page.getByTestId("network-contact-head").getByText("伊藤 直子", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("network-fit-card").count(), 0);
  assert.equal(await page.getByText("Led two Series A raises as CFO.", { exact: true }).count(), 0);
  await page.getByText("決算資料のお礼を送る", { exact: true }).waitFor();
});

test("delete online: confirm → DELETE → back to the list, gone, with 元に戻す (restore)", async (t) => {
  const page = await open(t, { screen: "detail", params: { id: "c-ito" } });
  await page.getByTestId("network-contact-head").waitFor();
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByText("伊藤 直子さんを削除しますか？", { exact: true }).waitFor();
  await page.getByRole("button", { name: "削除する" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.includes("delete:/api/contacts/c-ito"));
  assert.ok((await navigation(page)).includes("/contacts"));
  await page.evaluate(() => (window as any).showScreen("list"));
  await page.getByText("高橋 美咲", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("network-row-c-ito").count(), 0, "gone from the list");
  await page.getByText("削除しました", { exact: true }).waitFor();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.includes("post:/api/contacts/c-ito/restore"));
  await page.getByTestId("network-row-c-ito").waitFor();
});

test("delete offline goes to the write queue: hidden now, sent when the list opens online", async (t) => {
  const page = await open(t, { screen: "detail", params: { id: "c-ishikawa" }, online: false });
  await page.getByTestId("network-contact-head").waitFor();
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "削除する" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.includes("/contacts"));
  await page.evaluate(() => (window as any).showScreen("list"));
  await page.getByText("オンラインになったら削除します", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("network-row-c-ishikawa").count(), 0);
  await page.evaluate(() => { (window as any).fixture.online = true; (window as any).showScreen("detail"); });
  await page.evaluate(() => (window as any).showScreen("list"));
  await page.waitForFunction(() => (window as any).fixture.requests.filter((path: string) => path === "delete:/api/contacts/c-ishikawa").length >= 2);
});

test("edit (b5 #42 / #43): fields → PATCH …/fields, industry / level / stage / tags → PATCH …/:id; offline cannot save", async (t) => {
  const page = await open(t, { screen: "edit", params: { id: "c-ito" } });
  await page.getByTestId("network-edit").waitFor();
  await page.getByRole("textbox", { name: "役職" }).fill("CFO・取締役");
  await page.getByTestId("network-edit-industry").click();
  await page.getByTestId("network-industry-picker").waitFor();
  await page.getByRole("radio", { name: "ベンチャー投資" }).click();
  await page.getByRole("tab", { name: "役職層" }).click();
  await page.getByRole("radio", { name: "経営層" }).click();
  await page.getByRole("button", { name: "決定" }).click();
  await page.getByRole("tab", { name: "知り合い" }).click();
  // R11a 追补：导入写下的内部标签（source:external-import）不显示，删掉一个用户标签后保存仍原样带回。
  assert.equal(await page.getByText("source:external-import").count(), 0);
  await page.getByRole("button", { name: "会食" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.some((path: string) => path.startsWith("patch:/api/contacts/c-ito/fields")));
  const patches = (await requests(page)).filter((path) => path.startsWith("patch:"));
  assert.ok(patches.some((path) => path.includes("/fields") && path.includes("CFO・取締役")));
  assert.ok(patches.some((path) => path.startsWith("patch:/api/contacts/c-ito {") && path.includes("finance_investment.venture_capital") && path.includes("c_level") && path.includes("\"status\":\"active\"")));
  assert.ok(patches.some((path) => path.startsWith("patch:/api/contacts/c-ito {") && path.includes("\"tags\":[\"source:external-import\",\"CFO\"]")));
  const offline = await open(t, { screen: "edit", params: { id: "c-ito" }, status: "stale", online: false });
  await offline.getByText("編集にはインターネット接続が必要です", { exact: true }).waitFor();
  assert.equal(await offline.getByRole("button", { name: "保存" }).isDisabled(), true);
});
