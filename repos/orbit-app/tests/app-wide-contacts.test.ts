import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

// Only HTTP, navigation and native camera/permission boundaries are controlled.
// Screens, charts, view-models, theme, inputs and disclosure state are production.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
const state = window.fixture = { actor: "actor:one", cookieHeader: "session=one", baseUrl: "http://fixture", requests: [], navigation: [], nativeCalls: [], cameraGranted: true, photoGranted: true, kind: "success", postMode: "failure", putMode: "failure", pendingPost: null, pendingPut: null, refreshes: 0, resourceScopeKey: JSON.stringify(["actor:one", "session=one", "http://fixture"]), uuidSequence: 0, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(f => f()); } };
const rerender = () => useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => revision);
const contacts = { contacts: [{ id: "contact:1", displayName: "林悦", organization: "红桥科技", role: "市场负责人", location: "东京", industry: "enterprise_saas", status: "active", value: { score: 89, valueTypes: [] } }] };
const mobile = {
  aggregate: { relationshipAssetTotals: { contacts: 1 }, highValueCount: 1, pendingFollowups: { count: 1 }, dormantContacts: { count: 0 } },
  analysis: { current: { analysisVersion: "contacts.analysis@1", sourceDataVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, report: { analysisVersion: "contacts.analysis@1", body: "现有人脉覆盖零售合作，下一步应补充投资人联系。", generatedAt: "2026-09-15T01:00:01.000Z", messageId: "message:analysis:1", sessionId: "session:analysis:1", sourceDataVersion: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }, stale: true },
  contacts, profile: { profile: { id: "profile:one", displayName: "测试用户", relationshipGoal: "拓展日本零售合作", updatedAt: "2026-09-15T00:00:00.000Z" } },
  summary: { metrics: [{ id: "relationship-assets", value: 1 }, { id: "high-value", value: 1 }] },
  distributions: { industryDistribution: [{ bucketId: "industry:technology", label: "科技", contactCount: 1, percentage: 100, topOrganizations: ["红桥科技"] }], relationshipStrengthDistribution: [{ strength: "strong", relationshipCount: 1, percentage: 100, followupRisk: "low" }], valueTypeDistribution: [] },
  gaps: { coverageScore: 72, gaps: [] },
  opportunities: { highPriorityOpportunities: [{ contactId: "contact:1", contactName: "林悦", organization: "红桥科技", title: "确认合作时间", priorityScore: 91, dueLabel: "今天", reason: "合作时间待确认", suggestedAction: "联系林悦", actionBrief: { ruleVersion: "opportunity-brief-v1", type: "follow_up", title: "确认合作时间", judgment: "本周需要确认合作安排。", evidence: ["已有交流记录"], steps: ["查看最近记录", "确认合作安排"], primaryAction: { contactId: "contact:1", kind: "open_contact", label: "开始联系" }, secondaryAction: { contactId: "contact:1", kind: "open_contact", label: "查看联系人" }, priority: { total: 91 }, evidenceIds: [], evaluatedAt: "2026-09-08T00:00:00Z" } }] },
  unavailableSections: []
};
export const useLocalSearchParams = () => ({ dimension: "industry", bucketId: "industry:technology" });
// Sprint 0117: these cases cover the server-read path (a browser without its mirror); the device path has its own tests.
export const useLocalContacts = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh() {} });
export const useLocalDashboard = () => ({ available: false, sections: null, error: null, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh() {} });
export const usePathname = () => "/contacts";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
const structure = { dimension: "industry", bucket: { label: "科技合作伙伴", contactCount: 1, percentage: 100 }, contacts: [{ ...contacts.contacts[0], relationshipStrength: "strong" }], commonTags: [{ label: "日本市场", contactCount: 1 }], relationshipQuality: [{ id: "strong", label: "强关系", contactCount: 1, percentage: 100 }], insight: "科技合作伙伴已有交流基础。" };
const connections = { connections: [{ id: "connection:1", contactId: "contact:1", displayName: "林悦", organization: "红桥科技", relationshipStage: "needs_follow_up", strengthScore: 89, sourceLinks: [{ label: "朋友引荐", type: "referral" }], evidenceTimeline: [{ title: "已有交流记录" }] }] };
export const useApiResource = path => { rerender(); return { kind: state.kind, error: { message: "连接暂时失败" }, data: path.includes("structure/") ? structure : path.includes("connections") ? connections : path.includes("tasks") ? { tasks: [] } : path.includes("draft") ? {} : path.includes("aggregate") ? mobile.aggregate : path.includes("opportunities") ? mobile.opportunities : path.includes("distributions") ? mobile.distributions : path.includes("gaps") ? mobile.gaps : contacts, refreshing: false, refresh() {} }; };
export const useValidatedApiResource = (_path, _schema, isEmpty, options = {}) => { rerender(); state.dashboardScopeKey = options.scopeKey; state.dashboardPath = _path; const base = state.zeroContacts ? { ...mobile, aggregate: { ...mobile.aggregate, relationshipAssetTotals: { ...mobile.aggregate.relationshipAssetTotals, contacts: 0 } }, contacts: { contacts: [] } } : mobile; const data = state.remoteGoal === undefined ? base : { ...base, profile: { ...base.profile, profile: { ...base.profile.profile, relationshipGoal: state.remoteGoal, updatedAt: state.remoteUpdatedAt } } }; const scopeCurrent = options.scopeKey === undefined || options.scopeKey === state.resourceScopeKey; return { kind: scopeCurrent ? (isEmpty(data) ? "empty" : state.kind) : "loading", data, error: { message: "连接暂时失败" }, refreshing: false, refresh() { state.refreshes++; state.resourceScopeKey = options.scopeKey; revision++; listeners.forEach(f => f()); } }; };
const record = method => async (path, options) => {
  state.requests.push({ method, path, body: options?.body });
  if (method === "POST" && state.postMode === "pending") return new Promise(resolve => { state.pendingPost = resolve; });
  if (method === "PUT" && state.putMode === "pending") return new Promise(resolve => { state.pendingPut = resolve; });
  if (method === "PUT" && state.putMode === "conflict") { state.remoteGoal = "服务器上的并发目标"; state.remoteUpdatedAt = "2026-09-15T00:00:05.000Z"; return { success: false, status: 409, error: { message: "关系目标已在另一端更新" } }; }
  if (method === "GET" && path === "/api/connections/connection%3A1") return { success: true, data: { connection: connections.connections[0], sourceLinks: [{ evidenceId: "source:1", label: "朋友引荐", type: "referral" }], evidenceTimeline: [{ evidenceId: "evidence:1", title: "已有交流记录", excerpt: "上周确认了合作方向。", contribution: "user_note" }] } };
  return { success: false, error: { message: "暂时无法保存，请重试" } };
};
// Like the real hook, the client is stable for a given scope key.
const clients = new Map();
export const useOrbitApiClient = (options = {}) => { state.clientScopeKey = options.scopeKey; if (!clients.has(options.scopeKey)) clients.set(options.scopeKey, { post: record("POST"), put: record("PUT"), patch: record("PATCH"), get: record("GET") }); return clients.get(options.scopeKey); };
export const useOrbitApiBaseUrl = () => { rerender(); return { ready: true, baseUrl: state.baseUrl }; };
export const useOrbitAuthSession = () => { rerender(); return { ready: true, signedIn: true, accountId: state.actor, actorId: state.actor, cookieHeader: state.cookieHeader, user: { id: state.actor } }; };
export const randomUUID = () => "fixture-relationship-goal-mutation-" + ++state.uuidSequence;
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
export const CameraView = ({ children, style }) => <View style={style} testID="camera-preview">{children}</View>;
export const useCameraPermissions = () => { rerender(); return [{ granted: state.cameraGranted }, async () => { state.nativeCalls.push("qr-permission"); return { granted: state.cameraGranted }; }]; };
export const requestCameraPermissionsAsync = async () => { state.nativeCalls.push("camera-permission"); return { granted: state.cameraGranted }; };
export const requestMediaLibraryPermissionsAsync = async () => { state.nativeCalls.push("photo-permission"); return { granted: state.photoGranted }; };
export const UIImagePickerPreferredAssetRepresentationMode = { Current: "current" };
export const launchCameraAsync = async () => { state.nativeCalls.push("camera-launch"); return { canceled: true }; };
export const launchImageLibraryAsync = async () => { state.nativeCalls.push("photo-launch"); return { canceled: true }; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
import { DashboardScreen } from "./src/screens/dashboard/DashboardScreen";
const screens = { dashboard: DashboardScreen };
const Screen = screens[new URLSearchParams(location.search).get("screen") || "dashboard"];
createRoot(document.getElementById("root")).render(<Screen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "contacts-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context|expo-camera|expo-image-picker)$|\/(useApiResource|useValidatedApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider|useRelationshipInboxBadgeCount|useLocalDashboard|useLocalContacts)$/ }, () => ({ path: "fixture", namespace: "contacts-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "contacts-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function openScreen(t: { after: (fn: () => Promise<void>) => void }, screen: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 320, height: 874 }, colorScheme });
  page.setDefaultTimeout(2500);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(`${url}?screen=${screen}`);
  return page;
}

async function touchFits(locator: Locator, minHeight = 44) {
  const box = (await locator.boundingBox())!;
  // The sliding modal's compositor can return 43.99993896484375 for a 44pt box.
  assert.ok(box && box.height + 0.001 >= minHeight, `expected ${minHeight}pt touch target, got ${box?.height}`);
  assert.ok(box.x >= 0 && box.x + box.width <= 320, "control must fit a 320pt phone");
}

test("touch measurement accepts compositor precision but rejects undersized controls", async () => {
  const measured = (height: number) => ({ boundingBox: async () => ({ x: 0, y: 0, width: 44, height }) }) as Locator;
  await touchFits(measured(43.99993896484375));
  await assert.rejects(touchFits(measured(43.99)), /touch target/);
});

test("dashboard retains its real actions and request boundaries", async t => {
  const dashboard = await openScreen(t, "dashboard");
  const recompute = dashboard.getByRole("button", { name: "重新计算机会", exact: true });
  await touchFits(recompute, 50);
  assert.deepEqual(await dashboard.evaluate(() => (window as any).fixture.requests), []);
  await recompute.click();
  await dashboard.getByText("暂时无法保存，请重试", { exact: true }).waitFor();
  assert.equal((await dashboard.evaluate(() => (window as any).fixture.requests)).length, 1);
});

