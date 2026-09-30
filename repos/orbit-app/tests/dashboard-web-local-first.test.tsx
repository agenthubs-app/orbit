import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0117: the BROWSER dashboard and contacts-analysis screens (resolved
// with .web first). With the browser mirror active they compute from the device
// copy like native (no dashboard read, 「截至」 offline); without it
// (non-secure context) they keep the server reads, with no probe and no
// offline banner. Replaced boundaries: useSyncedCollection, useWebMirrorStatus,
// useApiResource and useOrbitApiClient (record requests).
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
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, status: "fresh", mirror: "local-mirror", ...window.initialFixture };
export const useWebMirrorStatus = () => state.mirror === "local-mirror" ? { mode: "local-mirror", scopeDigest: "d".repeat(64), domains: ["contacts", "dashboard-graph"] } : { mode: "online-only", reason: state.mirror };
const serverAggregate = { state: "success", relationshipAssetTotals: { contacts: 7, connections: 0, evidenceBackedRelationships: 0, eventsRepresented: 0 }, newContacts: { count: 1, windowLabel: "Live", contacts: [{ contactId: "srv", name: "服务器上的联系人", organization: "Server Org", sourceLabel: "S", source: { type: "manual", id: "s", label: "S", providerRecordId: "s", generatedBy: "live-store-query" }, evidenceIds: ["e"] }] }, highValueCount: 0, highValueRelationships: [], pendingFollowups: { count: 0, tasks: [] }, dormantContacts: { count: 0, contacts: [] }, recentActivity: [{ activityId: "a1", type: "new_contact", label: "服务器上的联系人 added", occurredAt: "2026-09-27", sourceLabel: "S", evidenceIds: ["e"] }], summary: "", provenance: { source: "s", sourceLabel: "s", evidenceIds: ["e"], collectedAt: "2026-09-27T00:00:00.000Z" }, nextAction: "" };
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/dashboard";
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace() {} });
// Sprint 0131: page copies / row-id reads open the coordinator session; this harness has none.
export const useSyncCoordinatorSession = () => null;
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
  if (state.mirror !== "local-mirror" && path.startsWith("/api/dashboard?")) return { kind: "success", data: serverAggregate, meta: {}, status: 200, refreshing: false, refresh() {} };
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
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const screen = window.initialFixture?.screen === "analysis" ? <ContactsDashboardScreen /> : <DashboardScreen />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{screen}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    // Browser resolution: .web variants first.
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "dashboard-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "dashboard-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|useWebMirrorStatus|AuthSessionProvider|ApiBaseUrlProvider)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "dashboard-native" }));
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

test("with the browser mirror active the dashboard and the contacts analysis compute from the device copy; offline says 截至 and sends no dashboard read", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByText("张伟", { exact: false }).first().waitFor();
  assert.deepEqual(await dashboardReads(page), [], "no /api/dashboard read with the browser mirror");
  const analysis = await open(t, { screen: "analysis", status: "stale" });
  await analysis.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await analysis.getByText("关键机会").waitFor();
  assert.deepEqual(await dashboardReads(analysis), []);
});

test("without the browser mirror (non-secure context) the dashboard reads the server: no probe, no offline banner, no error", async (t) => {
  const page = await open(t, { mirror: "insecure-context" });
  await page.getByText("服务器上的联系人", { exact: false }).first().waitFor();
  assert.equal(await page.getByText(/无法连接/).count(), 0);
  const reads = new Set(await dashboardReads(page));
  for (const path of ["resource:/api/dashboard?activityLimit=4", "resource:/api/dashboard/summary", "resource:/api/dashboard/opportunities", "resource:/api/dashboard/network-gaps", "resource:/api/dashboard/distributions"]) {
    assert.ok(reads.has(path), `${path} is read from the server`);
  }
  assert.equal(await page.evaluate(() => (window as any).fixture.syncs), 0, "no mirror probe");
  const analysis = await open(t, { screen: "analysis", mirror: "insecure-context" });
  await analysis.waitForFunction(() => (window as any).fixture.requests.some((path: string) => path.startsWith("resource:/api/mobile/contacts-dashboard?capabilities=roleCounts")));
  assert.equal((await requests(analysis)).some((path) => path.includes("view=analysis")), false, "the full page read, not the analysis-only read");
});
