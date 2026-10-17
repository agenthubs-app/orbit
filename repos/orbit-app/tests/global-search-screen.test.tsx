import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { GlobalSearchResponse } from "../src/api/contract/global-search";
import { appSearchFilters, globalSearchPath, isAppEmptyResult, rememberAppSearch } from "../src/screens/search/search-model";
import { parentForPath } from "../src/view-models/app-navigation";

// R30 全局搜索（App /search；b5 #53–#56，b12 #498 検索中）：the real screen rendered with react-native-web in Chromium.
// Every request goes to a page-side fake of GET /api/search/global that records the URLs it was asked for.
const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let browser: Browser;
let script: string;

const base = (over: Partial<GlobalSearchResponse>): GlobalSearchResponse => ({
  alternatives: [], conversations: { items: [], total: 0 }, events: { items: [], total: 0 }, examples: [], people: { items: [], total: 0 },
  query: "", searchedPeople: 286, semantic: { available: false, enabled: false }, suggestions: [], types: ["people", "events", "conversations"], ...over,
});
const CAPABILITY = base({ examples: ["投資家", "製造業の決裁者", "先月会った人"] });
const NAME = base({
  conversations: { items: [{ highlights: [{ end: 2, field: "title", start: 0 }], href: "/ai?session=s1", id: "s1", kind: "iorbit", subtitle: "10/7 · iOrbit との会話", title: "高橋さんへのお礼の下書き" }], total: 1 },
  events: { items: [{ emoji: "🎤", eventId: "e1", highlights: [{ end: 2, field: "subtitle", start: 0 }], href: "/events/e1", note: "高橋さんも参加予定 · 10/16", startsAt: "2026-10-16T10:00:00+09:00", title: "Japan SaaS Summit 2026 秋", via: null }], total: 1 },
  people: { items: [
    { contactId: "c1", highlights: [{ end: 2, field: "title", start: 0 }], href: "/contacts/c1", initial: "高", name: "高橋 美咲", org: "青葉ベンチャーズ", role: "パートナー", status: "in_progress" },
    { contactId: "c2", highlights: [{ end: 2, field: "title", start: 0 }], href: "/contacts/c2", initial: "高", name: "高橋 亮", org: "東亜精機", role: "生産技術部 課長", status: "acquaintance" },
  ], total: 2 },
  query: "高橋",
});
const EMPTY = base({
  alternatives: [
    { detail: "「半導体商社の人に会うには？」", emoji: "✨", href: "#ask", kind: "ask_iorbit", label: "iOrbit に紹介ルートを聞く" },
    { detail: "製造業 DX カンファレンス 大阪 · 出展 12社", emoji: "🎟️", href: "/events?tab=discover&q=%E5%8D%8A%E5%B0%8E%E4%BD%93", kind: "events", label: "イベントで探す" },
  ],
  query: "半導体 商社",
  suggestions: [{ count: 12, emoji: "🏭", href: "/contacts?industry=electronics", kind: "industry", label: "製造業 › 電子部品" }],
});

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { GlobalSearchScreen } from "./src/screens/search/GlobalSearchScreen";
function Root() {
  const [, force] = React.useState(0);
  window.nav.render = () => force((n) => n + 1);
  return window.nav.stack.length === 1 ? <div style={{ display: "flex", flexDirection: "column", height: "100%" }}><GlobalSearchScreen /></div> : <div data-testid="elsewhere">{window.nav.stack.at(-1)}</div>;
}
window.fetch = async (input) => {
  const url = new URL(String(input));
  window.requests.push(url.pathname + url.search);
  const reply = await window.searchServer(url.pathname + url.search);
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("root")).render(<Root />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [{ name: "search-screen", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^(expo-router|@react-native-async-storage\/async-storage)$/ }, (args) => ({ path: args.path, namespace: "search-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "search-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "search-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor-r30", cookieHeader: "c", user: { id: "actor-r30" } });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "search-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      plugin.onLoad({ filter: /^@react-native-async-storage\/async-storage$/, namespace: "search-stub" }, () => ({ contents: `
const store = () => (window.deviceStore ??= {});
export default { getItem: async (key) => store()[key] ?? null, setItem: async (key, value) => { store()[key] = value; } };`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-router$/, namespace: "search-stub" }, () => ({ contents: `
const nav = () => window.nav;
const router = {
  push: (href) => { nav().navigation.push({ method: "push", href }); nav().stack.push(typeof href === "string" ? href : href.pathname); nav().render?.(); },
  replace: (href) => { nav().navigation.push({ method: "replace", href }); nav().render?.(); },
  back: () => { nav().navigation.push({ method: "back" }); nav().render?.(); },
  canGoBack: () => true,
};
export const useRouter = () => router;
export const useLocalSearchParams = () => Object.fromEntries(new URLSearchParams(window.nav.stack[0].split("?")[1] ?? ""));`, loader: "js" }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

type Reply = { status: number; body: unknown };
async function open(t: { after: (fn: () => Promise<void>) => void }, answer: (path: string) => Reply | Promise<Reply>, deviceStore: Record<string, string> = {}, path = "/search"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.exposeFunction("searchServer", answer);
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>
window.nav=${JSON.stringify({ navigation: [], stack: [path] })};
window.requests=[];
window.deviceStore=${JSON.stringify(deviceStore)};
</script></body></html>`);
  await page.addScriptTag({ content: script });
  return page;
}
const ok = (data: GlobalSearchResponse): Reply => ({ body: { data, success: true }, status: 200 });
const byQuery = (path: string): Reply => {
  const q = new URL(`http://x${path}`).searchParams.get("q") ?? "";
  return ok(q === "高橋" ? NAME : q === "半導体 商社" ? EMPTY : q ? base({ query: q }) : CAPABILITY);
};
const requests = (page: Page) => page.evaluate(() => (window as unknown as { requests: string[] }).requests);
const nav = (page: Page) => page.evaluate(() => (window as unknown as { nav: { navigation: { method: string; href?: unknown }[] } }).nav.navigation);

test("初期 (b5 #53): recent searches from this device, the examples, the four type chips; 消去 forgets them", async (t) => {
  const page = await open(t, byQuery, { "orbit.search.recent": JSON.stringify(["高橋", "CFO Night"]) });
  await page.getByText("最近の検索").waitFor();
  for (const text of ["高橋", "CFO Night", "投資家", "製造業の決裁者", "すべて", "人", "イベント", "会話", "キャンセル"]) await page.getByText(text, { exact: true }).first().waitFor();
  assert.equal(await page.getByText("言葉の意味でも探します", { exact: false }).count(), 0, "no semantic hint while semantic search is unavailable (A2)");
  assert.deepEqual(await requests(page), ["/api/search/global?q=&platform=app"], "only the capability answer on open");
  await page.getByRole("button", { name: "消去 高橋" }).click();
  assert.equal(await page.getByText("高橋", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "消去", exact: true }).click();
  assert.equal(await page.getByText("最近の検索").count(), 0);
  assert.equal(await page.evaluate(() => (window as unknown as { deviceStore: Record<string, string> }).deviceStore["orbit.search.recent"]), "[]");
});

test("名前 (b5 #54): one request after typing, groups with counts, status chips, iOrbit prefix; a row opens and is remembered", async (t) => {
  const page = await open(t, byQuery);
  await page.getByTestId("global-search-input").fill("高橋");
  await page.getByTestId("global-search-results").waitFor();
  for (const text of ["人 · 2", "イベント · 1", "会話 · 1", "推進中", "知り合い", "青葉ベンチャーズ · パートナー", "さんも参加予定 · 10/16"]) await page.getByText(text, { exact: false }).first().waitFor();
  await page.getByText("iOrbit：", { exact: false }).waitFor();
  assert.deepEqual((await requests(page)).filter((path) => path.includes("q=%E9")), ["/api/search/global?q=%E9%AB%98%E6%A9%8B&platform=app"], "debounced: one keyword search");
  await page.getByRole("button", { name: "高橋 美咲" }).click();
  assert.deepEqual((await nav(page)).at(-1), { href: "/contacts/c1", method: "push" });
  assert.equal(await page.evaluate(() => (window as unknown as { deviceStore: Record<string, string> }).deviceStore["orbit.search.recent"]), JSON.stringify(["高橋"]));
});

test("type chip narrows the request; live without conversations draws no 会話 chip (A1)", async (t) => {
  const page = await open(t, (path) => {
    const q = new URL(`http://x${path}`).searchParams.get("q") ?? "";
    return ok(q ? { ...NAME, conversations: undefined, types: ["people", "events"] } : { ...CAPABILITY, types: ["people", "events"] });
  });
  await page.getByText("すべて", { exact: true }).waitFor();
  assert.equal(await page.getByText("会話", { exact: true }).count(), 0);
  await page.getByTestId("global-search-input").fill("高橋");
  await page.getByTestId("global-search-results").waitFor();
  await page.getByRole("button", { name: "人", exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { requests: string[] }).requests.some((path) => path.includes("types=people")));
});

test("結果なし (b5 #56): searched count, 近い条件なら, ほかの方法; iOrbit prefills (does not send), イベントで探す opens discover", async (t) => {
  const page = await open(t, byQuery);
  await page.getByTestId("global-search-input").fill("半導体 商社");
  await page.getByTestId("global-search-empty").waitFor();
  for (const text of ["「半導体 商社」に一致する人はいません", "286人の名前・会社・役職・メモを探しました", "近い条件なら", "12人 · 業界で絞り込む", "ほかの方法", "iOrbit に紹介ルートを聞く", "イベントで探す"]) await page.getByText(text, { exact: true }).waitFor();
  await page.getByRole("button", { name: "iOrbit に紹介ルートを聞く" }).click();
  const pushed = (await nav(page)).at(-1) as { href: { pathname: string; params: { id: string; prefillIntent: string } } };
  assert.equal(pushed.href.pathname, "/ai/[id]");
  assert.equal(pushed.href.params.id, "new");
  assert.match(pushed.href.params.prefillIntent, /^ai-prefill-/);
  assert.equal("initialMessage" in pushed.href.params, false, "the text is a prefill, never an automatic send");
});

test("検索中 (b12 #498) only after 300 ms without an answer; 429 shows one line and is not retried", async (t) => {
  let release: (() => void) | null = null;
  const page = await open(t, async (path) => {
    if (!path.includes("q=&")) {
      if (path.includes("q=slow")) await new Promise<void>((resolve) => { release = resolve; });
      if (path.includes("q=busy")) return { body: { error: { code: "FORBIDDEN", context: { reason: "RATE_LIMITED" }, message: "Too many" }, success: false }, status: 429 };
    }
    return byQuery(path);
  });
  await page.getByTestId("global-search-input").fill("slow");
  await page.waitForTimeout(400);
  assert.equal(await page.getByTestId("global-search-searching").count(), 0, "not yet at 400 ms (250 ms debounce + 300 ms)");
  await page.getByTestId("global-search-searching").waitFor();
  await page.getByText("検索中…").waitFor();
  (release as (() => void) | null)?.();
  await page.getByTestId("global-search-input").fill("busy");
  await page.getByText("少し待ってからもう一度").waitFor();
  await page.waitForTimeout(600);
  assert.equal((await requests(page)).filter((path) => path.includes("q=busy")).length, 1);
});

test("?q= opens with the query searched (R11 人脈 🔍 hands its text over)", async (t) => {
  const page = await open(t, byQuery, {}, "/search?q=%E9%AB%98%E6%A9%8B");
  await page.getByTestId("global-search-results").waitFor();
  assert.equal(await page.getByTestId("global-search-input").inputValue(), "高橋");
});

test("helpers: filters, empty rule, recent list, request path", () => {
  assert.deepEqual(appSearchFilters(["people", "events"]), ["all", "people", "events"]);
  assert.deepEqual(appSearchFilters(["people", "events", "conversations"]), ["all", "people", "events", "conversations"]);
  assert.equal(isAppEmptyResult(EMPTY), true);
  assert.equal(isAppEmptyResult(NAME), false);
  assert.equal(isAppEmptyResult(CAPABILITY), false, "an empty query is the initial screen, not 結果なし");
  assert.deepEqual(rememberAppSearch(["a", "b", "c", "d", "e"], " b "), ["b", "a", "c", "d", "e"]);
  assert.deepEqual(rememberAppSearch(["a", "b", "c", "d", "e"], "f"), ["f", "a", "b", "c", "d"]);
  assert.equal(globalSearchPath({ filter: "events", limit: 20, query: " CFO ", semantic: true }), "/api/search/global?q=CFO&types=events&semantic=1&limit=20&platform=app");
});

test("Task 🔍 opens /search (R20-01); the route is private and online-only; /search falls back to Task", () => {
  const task = read("src/screens/task/TaskScreen.tsx");
  assert.match(task, /icon="search" accessibilityLabel=\{locale\.t\("search\.open"\)\} onPress=\{\(\) => router\.push\("\/search" as Href\)\}/);
  assert.doesNotMatch(task, /router\.push\("\/contacts\/list"/);
  assert.match(read("app/search.tsx"), /withOrbitPrivateRoute\(withOnlineOnlyRoute\(GlobalSearchScreen\)\)/);
  assert.equal(parentForPath("/search", (key) => key).href, "/task?seg=todo");
});
