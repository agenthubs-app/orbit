import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0108: the NATIVE personal-schedule list, detail and editor (resolved
// without .web) read the device mirror. useSyncedCollection is the replaced
// boundary; the occurrence rules, screens, theme and translators are real.
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const base = { accountId: "actor-1", ownerUserId: "actor-1", kind: "personal", category: "personal", state: "upcoming", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" };
const defaultRecords = [
  { ...base, id: "personal:dentist", sourceId: "personal:dentist", title: "看牙医", startsAt: "2026-09-29T01:00:00.000Z", endsAt: "2026-09-29T02:00:00.000Z", location: "涩谷" },
  { ...base, id: "personal:weekly", sourceId: "personal:weekly", title: "每周复盘", startsAt: "2026-09-28T10:00:00.000Z", endsAt: "2026-09-28T11:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "weekly" },
    occurrenceExceptions: [{ occurrenceDate: "2026-10-05", cancelled: true, patch: {} }, { occurrenceDate: "2026-10-12", cancelled: false, patch: { title: "改到周二的复盘", startsAt: "2026-10-13T10:00:00.000Z", endsAt: "2026-10-13T11:00:00.000Z" } }] },
];
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, invalidations: 0, status: "fresh", ...window.initialFixture };
export const useLocalSearchParams = () => state.params ?? {};
export const usePathname = () => "/tasks";
export const useFocusEffect = () => {};
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push("replace:" + href); } });
// Sprint 0131: page copies / row-id reads open the coordinator session; this harness has none.
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = () => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "lastSyncedAt" in state ? state.lastSyncedAt : "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: (state.records ?? defaultRecords).map(payload => ({ id: payload.id, payload })),
  refresh: async () => { state.syncs++; return null; }, invalidate: async () => { state.invalidations++; return null; },
});
export const useOrbitApiClient = () => ({ async get(path) { state.requests.push("get:" + path); return { success: false, status: 0, error: { message: "offline" } }; }, async post(path) { state.requests.push("post:" + path); return { success: false, status: 0, error: { message: "offline" } }; } });
export const useOrbitAuthSession = () => state.auth ??= { ready: true, signedIn: true, actorId: "actor-1", accountId: "actor-1", user: { id: "actor-1" }, cookieHeader: "" };
export const useOrbitApiBaseUrl = () => state.server ??= { ready: true, baseUrl: "https://orbit.example" };
export const useOrbitTimeZone = () => state.zone ??= { timeZone: "Asia/Tokyo", canSave: true };
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const SafeAreaView = ({ children, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { PersonalScheduleList } from "./src/screens/schedule/PersonalScheduleList";
        import { PersonalScheduleDetailScreen } from "./src/screens/schedule/PersonalScheduleDetailScreen";
        import { PersonalScheduleScreen } from "./src/screens/schedule/PersonalScheduleScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        Date.now = () => new Date("2026-09-27T06:00:00.000Z").getTime();
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "detail" ? <PersonalScheduleDetailScreen /> : which === "editor" ? <PersonalScheduleScreen /> : <PersonalScheduleList />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{screen}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "schedule-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "schedule-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider)$/ }, () => ({ path: "fixture", namespace: "schedule-native" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$/ }, () => ({ path: "stubs", namespace: "schedule-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "schedule-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "schedule-native" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^stubs$/, namespace: "schedule-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000000';", loader: "js" }));
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
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], "no page errors"); }); await page.goto(url); return page;
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);

test("the list derives occurrences from the mirror: one-off, weekly, a cancelled and a moved occurrence, no request", async (t) => {
  const page = await open(t);
  await page.getByText("看牙医", { exact: true }).waitFor();
  await page.getByText("改到周二的复盘", { exact: true }).waitFor();
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(text.includes("2026-09-28 19:00"), "the first weekly occurrence in Tokyo time");
  assert.ok(!text.includes("2026-10-05 19:00"), "the cancelled occurrence is not listed");
  assert.ok(text.includes("2026-10-13 19:00"), "the moved occurrence is listed at its new time");
  assert.deepEqual(await requests(page), [], "no /api/schedule-items request on native");
  assert.equal(await page.getByRole("button", { name: "新建个人日程" }).isDisabled(), false);
});

test("offline: the list keeps the device copy with 截至 and turns off 新建个人日程", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText("看牙医", { exact: true }).waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  assert.equal(await page.getByRole("button", { name: "新建个人日程，需要联网" }).isDisabled(), true);
});

test("an empty synced mirror says so; a never-synced one does not", async (t) => {
  const empty = await open(t, { records: [] });
  await empty.getByText("暂无个人日程", { exact: true }).waitFor();
  const never = await open(t, { records: [], status: "unsynced", lastSyncedAt: null });
  await never.waitForTimeout(150);
  assert.equal(await never.getByText("暂无个人日程", { exact: true }).count(), 0);
});

test("the detail opens an occurrence from the mirror; offline it disables 编辑 and 改期", async (t) => {
  const online = await open(t, { screen: "detail", params: { id: "personal:weekly:occurrence:2026-10-12" } });
  await online.getByText("改到周二的复盘", { exact: true }).waitFor();
  assert.equal(await online.getByRole("button", { name: "编辑" }).isDisabled(), false);
  assert.deepEqual(await requests(online), []);
  const offline = await open(t, { screen: "detail", status: "stale", params: { id: "personal:dentist" } });
  await offline.getByText("看牙医", { exact: true }).waitFor();
  await offline.getByText(/^无法连接 · 显示截至/).waitFor();
  assert.equal(await offline.getByRole("button", { name: "编辑，需要联网" }).isDisabled(), true);
  assert.equal(await offline.getByRole("button", { name: "改期，需要联网" }).isDisabled(), true);
  const cancelled = await open(t, { screen: "detail", params: { id: "personal:weekly:occurrence:2026-10-05" } });
  await cancelled.getByText("无法确认", { exact: false }).waitFor();
});

test("the editor starts from the mirror and cannot save offline", async (t) => {
  const page = await open(t, { screen: "editor", status: "stale", params: { id: "personal:dentist" } });
  await page.getByRole("textbox", { name: "标题" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "标题" }).inputValue(), "看牙医");
  await page.getByText(/^无法连接 · 显示截至/).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存日程" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  assert.deepEqual((await requests(page)).filter((path) => !path.includes("association")), [], "reading the form costs no request");
});
