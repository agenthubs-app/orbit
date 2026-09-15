import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const note = (id, title, minute) => ({
  id, accountId: "account:one", ownerUserId: "account:one", title, body: title + " 正文摘要",
  manualContactIds: id === "note:2" ? [] : ["contact:a"], mentions: [], contactIds: id === "note:2" ? [] : ["contact:a"], eventIds: id === "note:2" ? ["event:a"] : [], version: 1,
  createdAt: "2026-09-15T00:0" + minute + ":00.000Z", updatedAt: "2026-09-15T00:0" + minute + ":00.000Z"
});
const first = note("note:1", "发布会准备", 2); const second = note("note:2", "预算确认", 1);
export const state = window.fixture = { latestPath: "", requests: [], navigation: [], fontScale: 1, ...window.initialFixture };
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/notes";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); } });
export const useApiResource = path => {
  state.latestPath = path;
  const filtered = path.includes("q=%E9%A2%84%E7%AE%97") ? [second] : [first];
  return { kind: "success", data: { notes: filtered, total: path.includes("q=") ? 1 : 2, ...(path.includes("q=") ? {} : { nextCursor: "page:2" }) }, refreshing: false, refresh() {} };
};
export const useOrbitApiClient = () => ({ async get(path) { state.requests.push(path); return { success: true, status: 200, data: { notes: [second], total: 2 }, meta: {} }; } });
export const SafeAreaView = ({ children, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { NotesScreen } from "./src/screens/notes/NotesScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = window.initialFixture?.language || "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><NotesScreen actorId="account:one" scopeKey="scope" /></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "notes-list-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "notes-list-test" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "notes-list-test" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: "icons", namespace: "notes-list-test" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "notes-list-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "notes-list-test" }, () => ({ contents: `
          import React from "react";
          import { Text as RealText, TextInput as RealTextInput, StyleSheet } from "react-native-web";
          export * from "react-native-web";
          const scaled = props => {
            const style = StyleSheet.flatten(props.style) || {};
            const scale = Math.min(window.fixture?.fontScale || 1, props.maxFontSizeMultiplier || Infinity);
            return !style.fontSize ? props.style : [props.style, { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }];
          };
          export const Text = props => <RealText {...props} style={scaled(props)} />;
          export const TextInput = props => <RealTextInput {...props} style={scaled(props)} />;
        `, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "notes-list-test" }, () => ({ contents: "export const Ionicons=()=>null;", loader: "js" }));
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
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(() => page.close()); await page.goto(url); return page;
}

test("notes list searches, filters, follows stable ids and appends the next page", async (t) => {
  const page = await open(t);
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByRole("button", { name: "加载更多笔记" }).click();
  await page.getByText("预算确认", { exact: true }).waitFor();
  assert.match((await page.evaluate(() => (window as any).fixture.requests[0])) as string, /cursor=page%3A2/);
  await page.getByRole("button", { name: "查看笔记 预算确认" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/notes/note%3A2"]);
  await page.getByRole("textbox", { name: "搜索笔记" }).fill("预算");
  await page.waitForFunction(() => (window as any).fixture.latestPath.includes("q=%E9%A2%84%E7%AE%97"));
  assert.equal(await page.getByText("发布会准备", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: "关联活动" }).click();
  await page.waitForFunction(() => (window as any).fixture.latestPath.includes("association=events"));
});

test("notes list caps accessibility text at two times and keeps labels readable", async (t) => {
  const page = await open(t, { fontScale: 3.1 });
  await page.getByText("发布会准备", { exact: true }).waitFor();
  const title = await page.getByText("发布会准备", { exact: true }).boundingBox();
  const search = await page.getByRole("textbox", { name: "搜索笔记" }).boundingBox();
  const filters = await Promise.all(["全部", "关联人脉", "关联活动", "未关联"].map((label) => page.getByRole("tab", { name: label }).boundingBox()));
  assert.ok(title && title.height >= 34 && title.height < 60, JSON.stringify(title));
  assert.ok(search && search.height >= 44, JSON.stringify(search));
  assert.ok(filters.every((box) => box && box.width <= 390 && box.height >= 44), JSON.stringify(filters));
  assert.equal(await page.getByText("发布会准备", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("发布会准备 正文摘要", { exact: true }).isVisible(), true);
});

test("an English account translates note-list chrome without changing note content", async (t) => {
  const page = await open(t, { language: "en" });
  await page.getByRole("textbox", { name: "Search notes" }).waitFor();
  await page.getByRole("tab", { name: "Related events" }).waitFor();
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByText("发布会准备 正文摘要", { exact: true }).waitFor();
  assert.equal(await page.getByText("搜索笔记", { exact: true }).count(), 0);
});
