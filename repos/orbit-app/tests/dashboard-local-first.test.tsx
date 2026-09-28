import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0117 (dashboard D3): the NATIVE dashboard and contacts-analysis
// screens (resolved without .web) compute every section from the device copy
// of the sync domain "dashboard-graph" with the shared code (api/compute).
// useSyncedCollection is the replaced mirror boundary; useApiResource and
// useOrbitApiClient are the network boundary and record every request. Opening
// either page sends no dashboard computation request; the contacts analysis
// asks only for its AI report (?view=analysis). Offline they keep the device
// copy, say 「截至」 and turn off what needs the server.
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const at = (minute) => "2026-09-27T00:" + String(minute).padStart(2, "0") + ":00.000000Z";
const row = (collection, recordId, minute, data) => ({ id: collection + "/" + recordId, payload: { collection, recordId, occurredAt: at(minute), updatedAt: at(minute), data } });
const src = (id) => ({ type: "manual", id: "src:" + id, label: "手动记录" });
const graph = () => window.fixture.graph ?? [
  row("contacts", "c1", 30, { id: "c1", displayName: "张伟", organization: "星河能源", role: "CEO", location: "東京", primaryIndustryId: "technology_internet", stage: "nurture", source: src("c1"), evidenceIds: ["e:c1"], createdAt: "2026-09-26T09:00:00.000Z", updatedAt: "2026-09-26T09:00:00.000Z" }),
  row("contacts", "c2", 29, { id: "c2", displayName: "佐藤 花子", organization: "東京ベンチャーズ", role: "顾问", location: "大阪", primaryIndustryId: "finance_investment", stage: "active", source: src("c2"), evidenceIds: ["e:c2"], createdAt: "2026-09-25T09:00:00.000Z", updatedAt: "2026-09-25T09:00:00.000Z" }),
  row("contacts", "c3", 28, { id: "c3", displayName: "Émile Zola", organization: "Rougon Labs", role: "", location: "Paris", stage: "nurture", source: src("c3"), evidenceIds: ["e:c3"], createdAt: "2026-09-24T09:00:00.000Z", updatedAt: "2026-09-24T09:00:00.000Z" }),
  row("connections", "k1", 27, { id: "k1", accountId: "account:one", contactId: "c1", stage: "nurture", valueTypes: ["commercial_opportunity"], summary: "储能试点合作伙伴", businessRelevanceScore: 92, relationshipStrength: 80, source: src("k1"), evidenceIds: ["e:k1"], createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }),
  row("connections", "k2", 26, { id: "k2", accountId: "account:one", contactId: "c2", stage: "active", valueTypes: ["strategic_fit"], summary: "东京 AI 圈子", businessRelevanceScore: 75, source: src("k2"), evidenceIds: ["e:k2"], createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }),
  row("tasks", "t1", 25, { id: "t1", title: "跟进张伟的储能试点", status: "open", contactId: "c1", connectionId: "k1", dueAt: "2026-09-30T00:00:00.000Z", source: src("t1"), evidenceIds: ["e:t1"], createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z" }),
  row("events", "ev1", 24, { id: "ev1", name: "储能论坛", startsAt: "2026-10-01T00:00:00.000Z", source: { type: "event_import", id: "src:ev1" }, evidenceIds: ["e:ev1"] }),
  row("evidence", "e1", 23, null),
];
const card = (id, name, org) => ({ id, card: { id, displayName: name, organization: org, role: "顾问", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "下周跟进", valueTypes: [], updatedAt: "2026-09-27T00:00:00.000Z" }, tags: [],
  search: { text: name, occurredAt: at(1), updatedAt: at(1), error: null }, detail: { state: "success", contact: { id, displayName: name, organization: org, role: "顾问", location: "东京", status: "active" } } });
const contacts = () => [card("c1", "张伟", "星河能源"), card("c2", "佐藤 花子", "東京ベンチャーズ"), card("c3", "Émile Zola", "Rougon Labs")].map((payload) => ({ id: payload.id, payload }));
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, status: "fresh", ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/dashboard";
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace() {} });
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "dashboard_graph" ? graph() : kind === "contact" ? contacts() : [],
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => null,
});
const offline = { kind: "offline", error: { code: "NETWORK", message: "Network request failed" }, meta: {}, status: 0, refreshing: false, refresh() {} };
const report = { current: { analysisVersion: "contacts.analysis@1", sourceDataVersion: "a".repeat(64) },
  report: { analysisVersion: "contacts.analysis@1", body: "**关系结构**：设备上的报告正文。", generatedAt: "2026-09-27T01:00:00.000Z", messageId: "m1", sessionId: "s1", sourceDataVersion: "a".repeat(64) }, stale: false };
export const useApiResource = (path, _isEmpty, options) => {
  if (options?.enabled === false) return { kind: "loading", refreshing: false, refresh() {} };
  state.requests.push("resource:" + path);
  if (state.status !== "stale" && path.includes("view=analysis")) return { kind: "success", data: { schemaVersion: 1, generatedAt: "2026-09-27T01:00:00.000Z", analysis: report, profile: null, unavailableSections: [] }, meta: {}, status: 200, refreshing: false, refresh() {} };
  return offline;
};
const client = {
  async get(path) { state.requests.push("get:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
  async post(path) { state.requests.push("post:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
};
export const useOrbitApiClient = () => client;
const authSession = { ready: true, signedIn: true, accountId: "account:one", actorId: "account:one", cookieHeader: "", user: { id: "account:one" } };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture", ready: true });
const memory = new Map();
export default { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } };
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { DashboardScreen } from "./src/screens/dashboard/DashboardScreen";
        import { ContactsDashboardScreen } from "./src/screens/contacts/ContactsDashboardScreen";
        import { ContactStructureDetailScreen } from "./src/screens/contacts/ContactStructureDetailScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "analysis" ? <ContactsDashboardScreen /> : which === "structure" ? <ContactStructureDetailScreen /> : <DashboardScreen />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{screen}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "dashboard-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "dashboard-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "dashboard-native" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$|^expo-camera$|^expo-image-picker$/ }, () => ({ path: "icons", namespace: "dashboard-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "dashboard-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "dashboard-native" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "dashboard-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
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
  t.after(async () => { assert.deepEqual(errors, [], "no page errors"); await page.close(); });
  await page.goto(url);
  return page;
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);
const dashboardReads = async (page: Page) => (await requests(page)).filter((path) => /\/api\/dashboard|\/api\/mobile\/contacts-dashboard/.test(path) && !path.includes("view=analysis"));

test("the dashboard renders from the device copy with the shared computations and sends no dashboard request", async (t) => {
  const page = await open(t);
  await page.getByText("今天先看这三件事").waitFor();
  await page.getByText("张伟", { exact: false }).first().waitFor();
  await page.getByText("储能论坛", { exact: false }).count();
  const body = await page.evaluate(() => document.body.innerText);
  assert.match(body, /\b3\b/, "the relationship-asset metric counts the three device contacts");
  assert.deepEqual(await dashboardReads(page), [], "no /api/dashboard* read on native");
  assert.ok((await requests(page)).includes("resource:/api/audit/provenance"), "the source audit (not a dashboard computation) is still read online");
  assert.ok(await page.evaluate(() => (window as any).fixture.syncs) >= 1, "opening the page probes for changes (a conditional manifest read)");
});

test("offline: the dashboard keeps the device copy with 截至, and recomputing needs the network", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByText("张伟", { exact: false }).first().waitFor();
  const recompute = page.getByRole("button", { name: /重新计算机会 · 需要联网/ });
  assert.equal(await recompute.isDisabled(), true);
  await recompute.click({ force: true });
  assert.deepEqual((await requests(page)).filter((path) => path.startsWith("post:")), [], "a disabled recompute sends nothing");
  assert.equal(await page.getByText("服务器连不上").count(), 0, "no error block over the device copy");
  assert.deepEqual(await dashboardReads(page), []);
});

test("the contacts analysis computes its sections on the device and reads only its AI report", async (t) => {
  const page = await open(t, { screen: "analysis" });
  await page.getByText("人脉分析报告").waitFor();
  await page.getByText("设备上的报告正文", { exact: false }).waitFor();
  await page.getByText("关键机会").waitFor();
  assert.deepEqual(await dashboardReads(page), [], "no section read");
  // (The replaced hook records once per render; the paths are what matter.)
  assert.deepEqual([...new Set((await requests(page)).filter((path) => path.includes("/api/mobile/contacts-dashboard")))], ["resource:/api/mobile/contacts-dashboard?view=analysis&capabilities=roleCounts"], "only the AI report and its profile");
});

test("offline: the contacts analysis keeps the device copy with 截至; the AI report says it is unavailable and asking needs the network", async (t) => {
  const page = await open(t, { screen: "analysis", status: "stale" });
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByText("关键机会").waitFor();
  await page.getByText("人脉分析暂不可用").waitFor();
  assert.equal(await page.getByRole("button", { name: "去 IORBIT 分析" }).count(), 0, "no AI entry without its version");
  assert.equal(await page.getByText("服务器连不上").count(), 0);
  assert.deepEqual(await dashboardReads(page), []);
});

test("offline: the analysis drill-down (one structure bucket) is computed on the device, with 截至 and no structure read", async (t) => {
  const page = await open(t, { screen: "structure", status: "stale", params: { dimension: "location", bucketId: "location_osaka" } });
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByText("佐藤 花子", { exact: false }).first().waitFor();
  assert.equal(await page.getByText("张伟", { exact: false }).count(), 0, "only the bucket's contacts (大阪)");
  assert.deepEqual(await dashboardReads(page), [], "no /api/dashboard/structure read");
  const unknown = await open(t, { screen: "structure", params: { dimension: "location", bucketId: "no-such-bucket" } });
  // The same failure the server answers for a bucket that does not exist.
  await unknown.getByText("That network structure group is not available for this actor.").waitFor();
  assert.deepEqual(await dashboardReads(unknown), []);
});
