import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// R11b SC-0x（App 人脈分析）: the NATIVE screens render GET /api/network/analysis as it comes — locked below 10 (no snapshot,
// no list read), 参考値 from 10 to 29, 構造 numbers with drill-downs, 機会 cards that exist, インサイト + iOrbit の見立て with
// evidence names from the device mirror, 見直す toasts; the drill-down list pages and orders; a failed count is a retry, never
// a lock; offline the kept view shows with the offline bar. Network boundary: useOrbitApiClient + the snapshot store.
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const card = (id, name, org, role) => ({ id, displayName: name, organization: org, role, sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z" });
const row = (recordId, c) => ({ id: recordId, payload: { id: recordId, card: c, tags: [], search: { text: c.displayName, occurredAt: "2026-10-01T00:00:00.000000Z", updatedAt: "2026-10-01T00:00:00.000000Z", error: null }, detail: null } });
const contacts = () => [row("rec-ito", card("c-ito", "伊藤 直子", "株式会社ハルモニア", "CFO")), row("rec-kobayashi", card("c-kobayashi", "小林 健", "丸の内イノベーションラボ", "代表"))];
export const state = window.fixture = { requests: [], navigation: [], writes: [], retired: [], release: {}, online: true, answers: {}, cache: {}, pathname: "/contacts/dashboard", ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const useGlobalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => state.pathname;
export const Redirect = () => null;
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, navigate(href) { state.navigation.push(String(href)); }, replace(href) { state.navigation.push("replace:" + href); }, setParams() {} });
export const useFocusEffect = () => undefined;
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = ({ kind }) => ({ status: "fresh", error: null, lastSyncedAt: "2026-10-18T05:40:00.000Z", workspaceId: "workspace:one", records: kind === "contact" ? contacts() : [],
  refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const readSnapshot = async (_baseUrl, _actorId, path) => state.cache[path] ? { result: { success: true, status: 200, data: state.cache[path], meta: {} }, syncedAt: "2026-10-17T00:00:00.000Z" } : null;
export const writeSnapshot = async (_baseUrl, _actorId, path) => { state.writes.push(path); };
export const retireSnapshot = async (_baseUrl, _actorId, path) => { state.retired.push(path); delete state.cache[path]; };
const answer = (path) => {
  if (!state.online) return { success: false, status: 0, error: { code: "ORBIT_APP_NETWORK_ERROR", message: "offline" }, meta: {} };
  const found = state.answers[path];
  if (found === undefined) return { success: false, status: 404, error: { code: "NOT_FOUND", message: "nope" }, meta: {} };
  if (found && found.__status) return { success: false, status: found.__status, error: { code: found.code ?? "CONFLICT", message: "x", context: found.context }, meta: {} };
  return { success: true, status: 200, data: found, meta: {} };
};
const client = {
  async get(path) { state.requests.push("get:" + path); if (state.holdPaths?.includes(path)) await new Promise(resolve => { state.release[path] = resolve; }); return answer(path); },
  async post(path, options) { state.requests.push("post:" + path + " " + JSON.stringify(options?.body ?? null)); return answer("post:" + path); },
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
        import { NetworkAnalysisScreen } from "./src/screens/network-analysis/NetworkAnalysisScreen";
        import { NetworkAnalysisListScreen } from "./src/screens/network-analysis/NetworkAnalysisListScreen";
        import { ToastProvider, UiPortalHost } from "./src/components/ui";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "ja";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const screen = window.initialFixture?.screen === "list" ? <NetworkAnalysisListScreen /> : <NetworkAnalysisScreen />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><UiPortalHost><ToastProvider>{screen}</ToastProvider></UiPortalHost></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "analysis-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "analysis-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "analysis-native" }));
        plugin.onResolve({ filter: /^react-native-reanimated$|^react-native-gesture-handler$|^expo-haptics$|^expo-blur$|^react-native-svg$/ }, (args) => ({ path: `${process.cwd()}/tests/helpers/stubs/${args.path}.js` }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^expo-crypto$|^expo-camera$|^expo-image-picker$|^expo-clipboard$|^expo-sharing$|^expo-linking$|^expo-web-browser$/ }, () => ({ path: "icons", namespace: "analysis-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "analysis-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "analysis-native" }, () => ({ contents: `export * from "react-native-web"; export const findNodeHandle = () => null;`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "analysis-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const impactAsync=async()=>{}; export const selectionAsync=async()=>{}; export const notificationAsync=async()=>{}; export const ImpactFeedbackStyle={}; export const NotificationFeedbackType={}; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const createURL=(p)=>p; export const openURL=async()=>{}; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
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

/* ---------- fixtures (b5 numbers) ---------- */

const ASOF = "2026-10-18T03:00:00.000Z";
const VIEW = "/api/network/analysis";
const SNAPSHOT = "/api/network/snapshot?lang=ja";
const locked = (total: number) => ({ asOf: ASOF, lock: { state: "locked", total, required: 10, missing: 10 - total } });
const distribution = (dimension: string, buckets: [string, number][]) => ({ dimension, total: buckets.reduce((sum, [, count]) => sum + count, 0), buckets: buckets.map(([id, count]) => ({ id, count })) });
const open = (total: number, structure: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ asOf: ASOF, lock: { state: "open", total, required: 10, reference: total < 30 }, structure, opportunities: [], insights: [], ...extra });
const gap = (targetCount: number, linkedCount: number) => ({ planId: "p1", needId: "need-cvc", title: "CVC・事業会社の投資担当", targetCount, linkedCount });

const few14 = open(14, {
  industries: distribution("industry", [["finance_investment", 5], ["manufacturing_supply_chain", 4], ["technology_internet", 3], ["trade_logistics", 2]]),
  seniority: distribution("seniority", [["decision", 4], ["manager", 6], ["staff", 4]]),
  regions: distribution("region", [["Tokyo", 9], ["Osaka", 2], ["Nagoya", 2], ["rest", 1]]),
  mets: distribution("met", [["event", 8], ["referral", 3], ["visit", 2], ["other", 1]]),
  gaps: [gap(4, 0)], hasPlan: true,
});
const many286 = open(286, {
  industries: distribution("industry", [["finance_investment", 105], ["manufacturing_supply_chain", 83], ["technology_internet", 63], ["trade_logistics", 35]]),
  seniority: distribution("seniority", [["decision", 74], ["manager", 96], ["staff", 116]]),
  regions: distribution("region", [["Tokyo", 188], ["Osaka", 41], ["Nagoya", 33], ["rest", 24]]),
  mets: distribution("met", [["event", 142], ["referral", 61], ["visit", 52], ["other", 31]]),
  gaps: [gap(4, 1)], hasPlan: true,
}, {
  opportunities: [
    { kind: "reconnect", count: 12, preview: [{ id: "c-yamamoto", name: "山本 彩" }, { id: "c-mori", name: "森 隆之" }, { id: "c-fujita", name: "藤田 亮介" }] },
    { kind: "stalled", count: 18, averageDays: 46, preview: [{ id: "c-suzuki", name: "鈴木 大輔" }] },
  ],
  insights: [
    { kind: "met_path", industryId: "finance_investment", sample: 105, eventShare: 68, eventRate: 9, referralRate: 21 },
    { kind: "growth", industryId: "manufacturing_supply_chain", added: 9, planNeedTitle: "製造業の新規顧客開拓", months: [["2026-05", 4], ["2026-06", 5], ["2026-07", 3], ["2026-08", 6], ["2026-09", 5], ["2026-10", 9]].map(([month, added]) => ({ month, added })) },
  ],
});
const pool = { usedToday: 0, limit: 3 };
const snapshot = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
  state: "ready", generatedAt: "2026-10-07T01:00:00.000Z", contactCount: 286, blocks,
  freshness: { stale: false, newContactCount: 0, job: "none" }, quota: { manual: pool, user: pool, background: pool }, ...extra,
});
const blocks = [
  { key: "gap-1", kind: "gap", needId: "need-cvc", text: "小林さん（丸の内イノベーションラボ）経由で会える可能性があります", evidence: { contactIds: ["rec-kobayashi"], recordIds: [] } },
  { key: "dx-1", kind: "diagnosis", text: "金融・投資に人脈が集まっています。", evidence: { contactIds: ["rec-ito", "rec-unknown"], recordIds: [] } },
];

const peoplePath = (dimension: string, bucket: string, extra = "") => `/api/network/analysis/people?dimension=${dimension}&bucket=${encodeURIComponent(bucket)}&limit=30${extra}`;
const person = (id: string, name: string, stage: "active" | "nurture", needsFollowUp = false, nextActionPreview = "") => ({ id, name, organization: "青葉ベンチャーズ", role: "パートナー", stage, needsFollowUp, goalRelated: true, nextActionPreview });
const peoplePage = (items: unknown[], extra: Record<string, unknown> = {}) => ({ asOf: ASOF, dimension: "industry", bucketId: "finance_investment", total: 105, stages: { active: 58, nurture: 27 }, sort: "goal", sorts: ["goal", "recent", "name"], items, nextCursor: null, ...extra });

async function openPage(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<Page> {
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
const text = (page: Page, value: string) => page.getByText(value, { exact: true });

/* ---------- 锁定 ---------- */

test("5 people: the whole page is locked — ring 5/10, あと5人, add cards, what opens up, the sample; no snapshot or list read (B-1)", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: locked(5) } });
  await page.getByTestId("analysis-locked").waitFor();
  await text(page, "あと5人で分析が始まります").waitFor();
  await text(page, "10人から使えます").waitFor();
  await text(page, "10人から、業界の偏りや足りない人が見えてきます。").waitFor();
  assert.equal(await page.getByTestId("analysis-locked").getByText("5/10").count(), 1, "the ring centre");
  await text(page, "解放されると見えるもの").waitFor();
  for (const row of ["構造：業界・役職層・地域・出会った場所", "機会：再会すべき人・紹介を頼める人", "インサイト：あなたの人脈の傾向と理由"]) await text(page, row).waitFor();
  await text(page, "分析の例").waitFor();
  await text(page, "サンプル").waitFor();
  assert.equal(await page.getByRole("tab", { name: "構造" }).count(), 0, "no tabs while locked");
  await page.getByRole("button", { name: "名刺を追加する" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/new/scan"]);
  assert.deepEqual(await requests(page), ["get:" + VIEW], "only the count: no snapshot, no list");
});

test("9 people is still locked (あと1人); 10 opens with the 参考値 subtitle and banner and reads the snapshot in Japanese", async (t) => {
  const nine = await openPage(t, { answers: { [VIEW]: locked(9) } });
  await text(nine, "あと1人で分析が始まります").waitFor();
  assert.equal((await requests(nine)).some((path) => path.includes("/snapshot")), false);
  const ten = await openPage(t, { answers: { [VIEW]: { ...few14, lock: { state: "open", total: 10, required: 10, reference: true } }, [SNAPSHOT]: snapshot([]) } });
  await text(ten, "10人 · 参考値").waitFor();
  await text(ten, "10人のため参考値です。30人から「機会」「インサイト」が安定します").waitFor();
  await ten.waitForFunction(() => (window as any).fixture.requests.includes("get:/api/network/snapshot?lang=ja"));
});

/* ---------- 構造 ---------- */

test("14 people (b5 #33): 構造 by default, the 参考値 banner, the four dimensions, 不足 with 0 linked says more cards will help", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: few14, [SNAPSHOT]: snapshot([]) } });
  await page.getByTestId("analysis-reference").waitFor();
  await text(page, "14人のため参考値です。30人から「機会」「インサイト」が安定します").waitFor();
  assert.equal(await page.getByRole("tab", { name: "構造" }).getAttribute("aria-selected"), "true");
  await text(page, "不足：CVC・事業会社の投資担当").waitFor();
  await text(page, "プランでは 4人必要ですが、今は 0人。名刺が増えると候補を探せます").waitFor();
  // One pie card with a breakdown switch (user 2026-10-25): the four breakdowns are its tabs.
  for (const label of ["業界", "役職層", "地域", "出会った場所"]) await page.getByRole("tab", { name: label }).waitFor();
  await page.getByRole("tab", { name: "地域" }).click();
  await page.getByTestId("analysis-dimension-region").getByText("東京", { exact: true }).waitFor();
});

test("286 people (b5 #34): subtitle with the snapshot date, the ring and legend numbers, 不足 with the snapshot route; rows open the drill-down list", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks) } });
  await text(page, "286人 · 10/7 更新").waitFor();
  assert.equal(await page.getByTestId("analysis-reference").count(), 0, "30 or more: no 参考値 banner");
  await page.getByTestId("analysis-composition").getByText("286", { exact: true }).waitFor();
  // Each row: the share of the 286 people, rounded (105 → 37%).
  for (const [label, count, percent] of [["金融・投資", "105", "37"], ["製造・サプライチェーン", "83", "29"], ["テクノロジー・インターネット", "63", "22"], ["貿易・物流", "35", "12"]]) {
    const row = page.getByTestId("analysis-dimension-industry").getByRole("button", { name: `${label}、${count}人、${percent}%` });
    assert.equal((await row.innerText()).replace(/\s+/g, ""), `${label}${count}${percent}%`);
  }
  await page.getByRole("tab", { name: "役職層" }).click();
  const seniority = page.getByTestId("analysis-dimension-seniority");
  for (const value of ["経営層", "74", "部長クラス", "96", "担当者", "116"]) await seniority.getByText(value, { exact: true }).waitFor();
  await page.getByRole("tab", { name: "地域" }).click();
  const region = page.getByTestId("analysis-dimension-region");
  for (const value of ["東京", "188", "大阪", "41", "名古屋", "33", "その他", "24"]) await region.getByText(value, { exact: true }).waitFor();
  await text(page, "プランでは 4人必要ですが、今は 1人。小林さん（丸の内イノベーションラボ）経由で会える可能性があります").waitFor();
  await page.getByRole("button", { name: "根拠を見る" }).first().click();
  await text(page, "根拠：プランの必要人脈 · 役職と会社の分類（286人）").waitFor();
  await page.getByRole("button", { name: "紹介ルートを見る" }).click();
  await page.getByRole("tab", { name: "業界" }).click();
  await page.getByRole("button", { name: "金融・投資、105人、37%" }).click();
  await page.getByRole("tab", { name: "地域" }).click();
  await region.getByRole("button", { name: "東京、188人、66%" }).click();
  await region.getByRole("button", { name: "その他、24人、8%" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/c-kobayashi", "/contacts/analysis/industry/finance_investment", "/contacts/analysis/region/Tokyo", "/contacts/analysis/region/rest"]);
});

test("the plan could not be read (gaps null): a plain notice instead of the 不足 card; no gaps: no card", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: { ...many286, structure: { ...many286.structure, gaps: null } }, [SNAPSHOT]: snapshot([]) } });
  await text(page, "プランを読み込めませんでした。業界などの数字はそのまま見られます。").waitFor();
  const none = await openPage(t, { answers: { [VIEW]: { ...many286, structure: { ...many286.structure, gaps: [] } }, [SNAPSHOT]: snapshot([]) } });
  await none.getByTestId("analysis-dimension-industry").waitFor();
  assert.equal(await none.getByTestId("analysis-gap").count() + await none.getByTestId("analysis-gap-unavailable").count(), 0);
});

/* ---------- 機会 ---------- */

test("機会 (b5 #35): only the kinds the view lists, with counts, people and 名簿を見る; ?tab=opportunities opens on it", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks) } });
  await page.getByRole("tab", { name: "機会" }).click();
  await page.getByTestId("analysis-opportunities").waitFor();
  await text(page, "再会すべき人").waitFor();
  await text(page, "90日以上 接点がなく、プランに関係する人").waitFor();
  await text(page, "山本 彩 ほか").waitFor();
  assert.equal((await page.getByTestId("analysis-opportunity-reconnect").getByText(/^12/).first().innerText()).replace(/\s+/g, ""), "12人");
  await text(page, "止まっている関係").waitFor();
  await text(page, "「関係構築」のまま平均 46日").waitFor();
  for (const absent of ["紹介を頼める人", "今月のイベントで会える人"]) assert.equal(await text(page, absent).count(), 0, `${absent} has no data source (B-5)`);
  await page.getByRole("button", { name: "名簿を見る" }).first().click();
  assert.deepEqual(await navigation(page), ["/contacts/analysis/opportunity/reconnect"]);
  const deep = await openPage(t, { params: { tab: "opportunities" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks) } });
  await deep.getByTestId("analysis-opportunities").waitFor();
  assert.equal(await deep.getByRole("tab", { name: "機会" }).getAttribute("aria-selected"), "true");
});

/* ---------- インサイト + iOrbit の見立て ---------- */

test("インサイト (b5 #36): the two trends, then iOrbit の見立て with evidence names from the device (unknown ids hidden); 見直す 429 toasts", async (t) => {
  const page = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks), "post:/api/network/snapshot/recompute?lang=ja": { __status: 429, code: "RATE_LIMITED", context: { reason: "MANUAL_REFRESH_LIMIT" } } } });
  await page.getByTestId("analysis-insight").waitFor();
  await text(page, "金融・投資との出会いの 68% はイベント経由。「関係構築」まで進んだ割合は、紹介経由が 21%、イベント経由が 9%").waitFor();
  await text(page, "「関係構築」への移行率（金融・投資 105人）").waitFor();
  await text(page, "製造・サプライチェーンが今月 +9人。プラン「製造業の新規顧客開拓」に追い風です").waitFor();
  await text(page, "5月").waitFor();
  await text(page, "10月").waitFor();
  assert.equal(await text(page, "返信").count(), 0, "no 返信 card (no data source)");
  const ai = page.getByTestId("analysis-snapshot-ready");
  await ai.getByText("iOrbit の見立て", { exact: true }).waitFor();
  await ai.getByText("10/7 時点", { exact: true }).waitFor();
  await ai.getByText("金融・投資に人脈が集まっています。", { exact: true }).waitFor();
  assert.equal(await ai.getByText("小林さん（丸の内イノベーションラボ）経由で会える可能性があります").count(), 0, "the gap sentence belongs to the 不足 card");
  assert.equal(await ai.getByRole("link").count(), 1, "rec-unknown is not this owner's contact on the device: not shown");
  await ai.getByRole("link", { name: "伊藤 直子" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/c-ito"]);
  await ai.getByRole("button", { name: "見直す" }).click();
  await text(page, "今日の見直しは使い切りました").waitFor();
  const posts = (await requests(page)).filter((path) => path.startsWith("post:"));
  assert.equal(posts.length, 1);
  assert.match(posts[0]!, /^post:\/api\/network\/snapshot\/recompute\?lang=ja \{"idempotencyKey":"app-[0-9a-f-]{36}"\}$/);
});

test("見直す: 409 INSUFFICIENT_CONTACTS and a failure say so; a success replaces the sentences", async (t) => {
  const insufficient = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks), "post:/api/network/snapshot/recompute?lang=ja": { __status: 409, context: { reason: "INSUFFICIENT_CONTACTS" } } } });
  await insufficient.getByRole("button", { name: "見直す" }).click();
  await text(insufficient, "確認済み3人から見直せます").waitFor();
  const failed = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks), "post:/api/network/snapshot/recompute?lang=ja": { __status: 503, code: "SERVICE_UNAVAILABLE" } } });
  await failed.getByRole("button", { name: "見直す" }).click();
  await text(failed, "見直せませんでした").waitFor();
  const fresh = snapshot([{ key: "dx-2", kind: "diagnosis", text: "製造業が伸びています。", evidence: { contactIds: [], recordIds: [] } }], { generatedAt: "2026-10-18T01:00:00.000Z" });
  const ok = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks), "post:/api/network/snapshot/recompute?lang=ja": fresh } });
  await ok.getByRole("button", { name: "見直す" }).click();
  await text(ok, "製造業が伸びています。").waitFor();
  await text(ok, "286人 · 10/18 更新").waitFor();
});

test("a Japanese snapshot without sentences shows no AI text (B-7); a failed or updating snapshot keeps the numbers with its own status (B-8)", async (t) => {
  const empty = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot([]) } });
  await empty.getByTestId("analysis-snapshot-ready").getByText("まだ見立てがありません", { exact: true }).waitFor();
  assert.equal(await text(empty, "10/7 時点").count(), 0);
  const failed = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286 } });
  await failed.getByTestId("analysis-snapshot-failed").getByText("見立てを読み込めませんでした", { exact: true }).waitFor();
  assert.equal(await failed.getByRole("button", { name: "見直す" }).count(), 0);
  await text(failed, "製造・サプライチェーンが今月 +9人。プラン「製造業の新規顧客開拓」に追い風です").waitFor();
  const running = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot(blocks, { freshness: { stale: false, newContactCount: 0, job: "running" } }) } });
  await text(running, "見立てを更新しています").waitFor();
  const deferred = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: many286, [SNAPSHOT]: snapshot([], { state: "none", generatedAt: null, freshness: { stale: false, newContactCount: 0, job: "deferred" } }) } });
  await text(deferred, "明日更新します").waitFor();
  const thin = await openPage(t, { params: { tab: "insight" }, answers: { [VIEW]: few14, [SNAPSHOT]: snapshot([]) } });
  await text(thin, "30人から、人脈の傾向が見えてきます。").waitFor();
});

/* ---------- failures / offline ---------- */

test("a failed count is a retry, never a 0-person lock; retry reads again", async (t) => {
  const page = await openPage(t, { answers: { [VIEW]: { __status: 503, code: "SERVICE_UNAVAILABLE" } } });
  await text(page, "人数を読み込めませんでした").waitFor();
  assert.equal(await page.getByTestId("analysis-locked").count(), 0);
  await page.evaluate((view) => { (window as any).fixture.answers["/api/network/analysis"] = view; }, locked(3));
  await page.getByRole("button", { name: "再試行" }).click();
  await text(page, "あと7人で分析が始まります").waitFor();
});

test("offline: the kept view shows with the offline bar; the snapshot says it could not be read; online answers are kept", async (t) => {
  const page = await openPage(t, { online: false, cache: { [VIEW]: many286 }, params: { tab: "insight" } });
  await text(page, "オフライン · 変更は接続後に同期されます").waitFor();
  await text(page, "製造・サプライチェーンが今月 +9人。プラン「製造業の新規顧客開拓」に追い風です").waitFor();
  await text(page, "見立てを読み込めませんでした").waitFor();
  const cold = await openPage(t, { online: false });
  await text(cold, "人数を読み込めませんでした").waitFor();
  const online = await openPage(t, { answers: { [VIEW]: many286, [SNAPSHOT]: snapshot([]) } });
  await online.getByTestId("analysis-dimension-industry").waitFor();
  await online.waitForFunction(() => (window as any).fixture.writes.includes("/api/network/analysis"));
  assert.equal((await online.evaluate(() => (window as any).fixture.writes as string[])).some((path) => path.includes("snapshot")), false, "the AI snapshot is never kept");
});

test("a cached open dashboard waits for the latest count before requesting a snapshot", async (t) => {
  const page = await openPage(t, { cache: { [VIEW]: many286 }, answers: { [VIEW]: locked(9), [SNAPSHOT]: snapshot(blocks) }, holdPaths: [VIEW], params: { tab: "insight" } });
  await text(page, "製造・サプライチェーンが今月 +9人。プラン「製造業の新規顧客開拓」に追い風です").waitFor();
  await page.evaluate((path) => (window as any).fixture.release[path](), VIEW);
  await page.getByTestId("analysis-locked").waitFor();
  assert.equal((await requests(page)).some((path) => path.includes("/api/network/snapshot")), false);
});

/* ---------- 下钻名单 (b5 #37) ---------- */

test("the list (b5 #37): bucket title, N人 · 人脈分析から, 段階の内訳 (two stages), three orders, rows with chips; paging; order change; row → contact; 人脈一覧で開く", async (t) => {
  const first = peoplePage([
    person("c-takahashi", "高橋 美咲", "nurture", false, "💼 シリーズAのリード投資家候補"),
    person("c-yamamoto", "山本 彩", "active", true, "💼 前回の面談で資料の再送を依頼されたまま"),
    person("c-mori", "森 隆之", "active"),
  ], { nextCursor: "30" });
  const answers = {
    [peoplePath("industry", "finance_investment")]: first,
    [peoplePath("industry", "finance_investment", "&sort=goal&cursor=30")]: peoplePage([person("c-ishii", "石井 恵", "nurture")]),
    [peoplePath("industry", "finance_investment", "&sort=recent")]: peoplePage([person("c-mori", "森 隆之", "active")], { sort: "recent" }),
  };
  const page = await openPage(t, { screen: "list", pathname: "/contacts/analysis/industry/finance_investment", params: { dimension: "industry", bucketId: "finance_investment" }, answers });
  await text(page, "金融・投資").waitFor();
  await text(page, "105人 · 人脈分析から").waitFor();
  const stages = page.getByTestId("analysis-stages");
  await stages.getByText("知り合い 58", { exact: true }).waitFor();
  await stages.getByText("関係構築 27", { exact: true }).waitFor();
  for (const absent of ["推進中", "協業"]) assert.equal(await stages.getByText(new RegExp(absent)).count(), 0, `${absent} is not an R11a stage`);
  for (const order of ["目標に近い順", "最終接点", "名前"]) await page.getByRole("tab", { name: order }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "目標に近い順" }).getAttribute("aria-selected"), "true");
  const yamamoto = page.getByTestId("analysis-person-c-yamamoto");
  await yamamoto.getByText("要フォロー", { exact: true }).waitFor();
  await yamamoto.getByText("青葉ベンチャーズ · パートナー", { exact: true }).waitFor();
  await yamamoto.getByText("💼 前回の面談で資料の再送を依頼されたまま", { exact: true }).waitFor();
  await page.getByTestId("analysis-person-c-takahashi").getByText("関係構築", { exact: true }).waitFor();
  await page.getByTestId("analysis-person-c-mori").getByText("知り合い", { exact: true }).waitFor();
  await page.getByRole("button", { name: "さらに表示" }).click();
  await page.getByTestId("analysis-person-c-ishii").waitFor();
  assert.equal(await page.getByRole("button", { name: "さらに表示" }).count(), 0, "the last page has no cursor");
  await page.getByRole("button", { name: "石井 恵" }).click();
  await page.getByRole("button", { name: "105人を人脈一覧で開く" }).click();
  assert.deepEqual(await navigation(page), ["/contacts/c-ishii", "/contacts?industry=finance_investment"]);
  await page.getByRole("tab", { name: "最終接点" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid^='analysis-person-']").length === 1);
  assert.equal(await page.getByRole("tab", { name: "最終接点" }).getAttribute("aria-selected"), "true");
  assert.ok((await requests(page)).includes("get:" + peoplePath("industry", "finance_investment", "&sort=recent")));
});

test("the list: 人脈一覧で開く only for an industry; a direct link below 10 people shows the lock; a failed list is a retry", async (t) => {
  const region = await openPage(t, { screen: "list", params: { dimension: "region", bucketId: "Tokyo" }, answers: { [peoplePath("region", "Tokyo")]: peoplePage([person("c-mori", "森 隆之", "active")], { dimension: "region", bucketId: "Tokyo", total: 188, sorts: ["recent", "name"], sort: "recent" }) } });
  await text(region, "東京").waitFor();
  await text(region, "188人 · 人脈分析から").waitFor();
  await region.getByTestId("analysis-person-c-mori").waitFor();
  assert.equal(await region.getByRole("button", { name: /人脈一覧で開く/ }).count(), 0);
  assert.equal(await region.getByRole("tab", { name: "目標に近い順" }).count(), 0, "only the orders the list offers");
  const lockedLink = await openPage(t, { screen: "list", params: { dimension: "industry", bucketId: "finance_investment" }, answers: { [peoplePath("industry", "finance_investment")]: { __status: 409, context: { reason: "LOCKED" } }, [VIEW]: locked(7) } });
  await text(lockedLink, "あと3人で分析が始まります").waitFor();
  await text(lockedLink, "10人から使えます").waitFor();
  await text(lockedLink, "人脈分析").waitFor();
  assert.equal(await lockedLink.getByTestId("analysis-locked").count(), 1);
  const failed = await openPage(t, { screen: "list", params: { dimension: "met", bucketId: "event" }, answers: { [peoplePath("met", "event")]: { __status: 503, code: "SERVICE_UNAVAILABLE" } } });
  await text(failed, "読み込めませんでした").waitFor();
  await failed.getByRole("button", { name: "再試行" }).waitFor();
});

test("a 409 LOCKED answer replaces and retires a cached people page", async (t) => {
  const path = peoplePath("industry", "finance_investment");
  const page = await openPage(t, { screen: "list", params: { dimension: "industry", bucketId: "finance_investment" }, cache: { [path]: peoplePage([person("private", "私有姓名", "active")]) }, answers: { [path]: { __status: 409, context: { reason: "LOCKED" } }, [VIEW]: locked(9) } });
  await page.getByTestId("analysis-locked").waitFor();
  assert.equal(await page.getByText("私有姓名", { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.retired), [path]);
  assert.equal(await page.evaluate((key) => (window as any).fixture.cache[key], path), undefined);
});

test("routes: /contacts/dashboard and the list route render the new screens; /contacts/graph redirects to 構造", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("app/contacts/dashboard.tsx"), /withOrbitPrivateRoute\(NetworkAnalysisScreen\)/);
  assert.match(read("app/contacts/analysis/[dimension]/[bucketId].tsx"), /withOrbitPrivateRoute\(NetworkAnalysisListScreen\)/);
  const graph = read("app/contacts/graph.tsx");
  assert.match(graph, /<Redirect href="\/contacts\/dashboard\?tab=structure" \/>/);
  assert.match(graph, /withOrbitPrivateRoute\(ContactsGraphRoute\)/);
});

test("LF3: with plan needs from the server, the analysis is computed on the device from its own contacts", async (t) => {
  // The server says 14 people and open; the device copy has two contacts, so the device view is locked (あと8人).
  const page = await openPage(t, { answers: { [VIEW]: { ...few14, needs: [] } } });
  await page.getByTestId("analysis-locked").waitFor();
  await text(page, "あと8人で分析が始まります").waitFor();
});
