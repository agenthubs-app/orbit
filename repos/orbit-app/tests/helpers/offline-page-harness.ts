import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

/**
 * Sprint 0131: one harness for the offline page tests. The screens run for real
 * in Chromium (react-native-web); the replaced boundaries are
 *   - the network: useOrbitApiClient / useApiResource answer from
 *     window.fixture.responses (longest matching path prefix) while
 *     `online`, and fail like a lost connection (status 0) otherwise; every
 *     request is recorded, and the real server-reachability store hears the
 *     outcome exactly as the real client reports it;
 *   - the device mirror: useSyncedCollection returns window.fixture.records[kind]
 *     with `syncStatus`, and useSyncCoordinatorSession returns a session whose
 *     page copies live in window.fixture.copies (the real binding rules are
 *     proven on the real coordinator in page-copies-sync.test.ts);
 *   - auth, base URL, router and native-only modules.
 * usePageCopyResource, the reachability store, OfflineNotice and the
 * OnlineOnlyBoundary run unmodified.
 */
export interface HarnessScreen { name: string; importPath: string; exportName: string }

const root = process.cwd();
const reachabilityPath = resolve(root, "src/api/server-reachability.ts");

const fixture = `
import React from "react";
import { StyleSheet, View } from "react-native";
import { serverReachability } from ${JSON.stringify(reachabilityPath)};
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, saves: [], online: true, syncStatus: "fresh", records: {}, copies: {}, responses: {}, params: {}, ...window.initialFixture };
const base = "http://fixture";
if (state.startUnreachable) serverReachability.markUnreachable(base);
if (state.startReachable) serverReachability.markReachable(base);
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const useGlobalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => window.fixture.pathname ?? "/";
export const useIsFocused = () => true;
export const usePreventRemove = () => {};
export const notifyReminderPlansChanged = () => {};
export const requestNotificationPermission = async () => ({ granted: false });
export const useFocusEffect = (effect) => { React.useEffect(() => effect(), [effect]); };
export const useNavigation = () => ({ addListener: () => () => {}, setOptions() {} });
export const Redirect = ({ href }) => { state.navigation.push("redirect:" + (typeof href === "string" ? href : JSON.stringify(href))); return null; };
export const Link = ({ children }) => children;
export const Stack = { Screen: () => null };
export const router = { push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace(href) { state.navigation.push("replace:" + href); }, back() {} };
export const useRouter = () => ({ canGoBack: () => false, back() {}, push: router.push, replace: router.replace, navigate: router.push, dismissTo: router.push });
function answer(method, path) {
  state.requests.push(method + ":" + path);
  if (!state.online) { serverReachability.markUnreachable(base); return { success: false, status: 0, error: { code: "ORBIT_APP_NETWORK_ERROR", message: "暂时无法连接 Orbit 服务，请检查网络后再试。" }, meta: {} }; }
  // cacheAnswers: the answer is the phone's snapshot cache, so the server stays unreachable.
  if (!state.cacheAnswers) serverReachability.markReachable(base);
  if (state.status5xx) return { success: false, status: 503, error: { code: "SERVICE_UNAVAILABLE", message: "service unavailable" }, meta: {} };
  const keys = Object.keys(state.responses).filter((prefix) => path.startsWith(prefix)).sort((a, b) => b.length - a.length);
  const hit = keys.length ? state.responses[keys[0]] : null;
  if (hit && hit.__status) return { success: false, status: hit.__status, error: { code: hit.__code ?? "NOT_FOUND", message: hit.__message ?? "not found" }, meta: {} };
  if (hit) return { success: true, status: 200, data: JSON.parse(JSON.stringify(hit)), meta: {} };
  return { success: false, status: 404, error: { code: "NOT_FOUND", message: "no fixture for " + path }, meta: {} };
}
const client = {
  baseUrl: base,
  async get(path) {
    if (path === "/api/health" && state.healthDelayMs) await new Promise(resolve => setTimeout(resolve, state.healthDelayMs));
    const result = answer("get", path);
    if (path === "/api/health") state.healthResolved = true;
    return result;
  },
  async post(path) { return answer("post", path); },
  async patch(path) { return answer("patch", path); },
  async put(path) { return answer("put", path); },
  async delete(path) { return answer("delete", path); },
};
export const useOrbitApiClient = () => client;
export const useHomeDashboardClient = () => client;
export const createOrbitApiClient = () => client;
export const useApiResource = (path, isEmpty, options) => {
  const [result, setResult] = React.useState({ kind: "loading" });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (options?.enabled === false) return;
    let live = true;
    Promise.resolve(answer("resource", path)).then((value) => {
      if (!live) return;
      setResult(value.success ? { kind: isEmpty(value.data) ? "empty" : "success", data: value.data, meta: {}, status: 200 } : { kind: value.status === 0 ? "offline" : "failure", error: value.error, meta: {}, status: value.status });
    });
    return () => { live = false; };
  }, [path, tick, options?.enabled]);
  return { ...result, refreshing: false, refresh() { setTick((value) => value + 1); } };
};
export const useSyncedCollection = ({ kind }) => ({
  status: state.syncStatus, error: state.syncStatus === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-28T01:30:00.000Z", workspaceId: "workspace:one",
  records: (state.records[kind] ?? []).map((payload, index) => ({ id: payload.id ?? payload.eventId ?? payload.conversationId ?? String(index), kind, workspaceId: "workspace:one", revision: "1", updatedAt: "2026-09-28T01:00:00.000Z", deletedAt: null, payload })),
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => null,
  currentSession: () => null,
});
const session = {
  isCurrent: () => true,
  async readPageCopy(id, variant) { if (state.noMirror) return null; return state.copies[id + "|" + variant] ?? null; },
  async savePageCopy(id, variant, data) { if (state.noMirror) return; state.saves.push(id + "|" + variant); state.copies[id + "|" + variant] = { data, syncedAt: "2026-09-28T02:00:00.000Z" }; },
};
// Like the real hook, the session exists only after the first effect (screens must not miss a copy because of it).
export const useSyncCoordinatorSession = () => { const [value, setValue] = React.useState(null); React.useEffect(() => { setValue(session); }, []); return value; };
const authSession = { ready: true, signedIn: true, accountId: "account:one", actorId: "account:one", cookieHeader: "", user: { id: "account:one", name: "QA One", email: "qa1@example.test" }, notificationSessionRevision: 0 };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: base, ready: state.apiBaseReady ?? true });
const memory = new Map();
export default { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } };
export const SafeAreaView = ({ children, edges, style, ...props }) => {
  const includesTop = Array.isArray(edges)
    ? edges.includes("top")
    : edges !== null && typeof edges === "object" && Reflect.get(edges, "top") !== undefined && Reflect.get(edges, "top") !== "off";
  const inset = includesTop ? window.initialFixture?.safeAreaTop ?? 0 : 0;
  const flattened = inset ? StyleSheet.flatten(style) ?? {} : null;
  const adjusted = flattened ? { ...flattened, paddingTop: (flattened.paddingTop ?? 0) + inset } : style;
  return <View {...props} style={adjusted}>{children}</View>;
};
export const useSafeAreaInsets = () => ({ top: window.initialFixture?.safeAreaTop ?? 0, bottom: 0, left: 0, right: 0 });
export const SafeAreaProvider = ({ children }) => children;
`;

const STUB = "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub, Polyline=Stub, ClipPath=Stub, TSpan=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-'+String(Math.floor(Math.random()*1e12)).padStart(12,'0'); export const digestStringAsync=async()=> 'a'.repeat(64); export const CryptoDigestAlgorithm={SHA256:'SHA-256'}; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const getDocumentAsync=async()=>({canceled:true}); export const MediaTypeOptions={Images:'Images'}; export const requestMediaLibraryPermissionsAsync=async()=>({granted:false}); export const getLocales=()=>[{languageTag:'zh-CN',languageCode:'zh'}]; export const getCalendars=()=>[{timeZone:'Asia/Tokyo'}]; export const impactAsync=async()=>{}; export const ImpactFeedbackStyle={Light:'light'}; export const setStringAsync=async()=>{}; export const openURL=async()=>{}; export const createURL=()=> 'orbit://';";

export async function startOfflinePageHarness(screens: readonly HarnessScreen[], options: { web?: boolean } = {}) {
  const imports = screens.map((screen, index) => `import { ${screen.exportName} as S${index} } from ${JSON.stringify(screen.importPath)};`).join("\n");
  const table = screens.map((screen, index) => `${JSON.stringify(screen.name)}: S${index}`).join(", ");
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        ${imports}
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = window.initialFixture?.language ?? "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const screens = { ${table} };
        const Screen = screens[window.initialFixture?.screen];
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><Screen /></OrbitLocaleContext.Provider>);`,
      resolveDir: root, loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: options.web ? [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js", ".json"] : [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    logLevel: "silent",
    plugins: [{
      name: "offline-page-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "offline-page" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|^expo-router\/react-navigation$|\/(useApiResource|useOrbitApiClient|useHomeDashboardClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|native-notifications)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "offline-page" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$|^expo-camera$|^expo-image-picker$|^expo-document-picker$|^expo-localization$|^expo-haptics$|^expo-clipboard$|^expo-linking$/ }, () => ({ path: "icons", namespace: "offline-page" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "offline-page" }, () => ({ contents: fixture, loader: "jsx", resolveDir: root }));
        plugin.onLoad({ filter: /^native$/, namespace: "offline-page" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: root }));
        plugin.onLoad({ filter: /^icons$/, namespace: "offline-page" }, () => ({ contents: STUB, loader: "js" }));
      },
    }],
  });
  const server: Server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const browser: Browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
  return {
    async open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown>): Promise<Page> {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript((initialFixture) => { (window as unknown as { initialFixture: unknown }).initialFixture = initialFixture; }, patch);
      t.after(async () => { assert.deepEqual(errors, [], "no page errors"); await page.close(); });
      await page.goto(url);
      return page;
    },
    async close() {
      await browser.close();
      await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
    },
  };
}

export const fixtureValue = <T>(page: Page, key: string) => page.evaluate((name) => (window as unknown as { fixture: Record<string, unknown> }).fixture[name], key) as Promise<T>;
export const requestsOf = (page: Page) => fixtureValue<string[]>(page, "requests");
export const OFFLINE_BANNER = /^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/;
export const UNAVAILABLE_BANNER = /^服务暂时不可用 · 显示截至 .+ 的内容；新建和编辑需要联网$/;
