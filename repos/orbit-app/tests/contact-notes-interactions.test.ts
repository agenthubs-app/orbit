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
const literal = "strategic_fit / CRM mock 案例\n刚刚聊到日本市场。";
const fixture = `
import React from "react";
import { View } from "react-native";
const state = window.fixture = { navigation: [], requests: [] };
export const useRouter = () => ({ push(href) { state.navigation.push(href); } });
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
export const data = { state: "success", contact: {
  id: "contact:/notes", notes: [
    { noteId: "legacy:1", body: ${JSON.stringify(literal)}, createdAt: "2026-09-08T01:00:00.000Z", privacy: "private", authorLabel: "我" },
    { noteId: "legacy:2", body: "第二条备注", createdAt: "2026-09-08T02:00:00.000Z", privacy: "private", authorLabel: "我" },
    { noteId: "shared", body: "双方纪要", createdAt: "2026-09-08T03:00:00.000Z", privacy: "relationship_shared" }
  ]
} };
export const colors = {
  accent: "#2563eb", background: "#fff", border: "#ddd", border2: "#eee", card: "#fff", disabled: "#aaa",
  emerald: "#059669", ink: "#111", muted: "#666", onAccent: "#fff", rose: "#dc2626", signal: "#2563eb",
  surface: "#fff", surface2: "#f7f7f7", surface3: "#eee", text: "#222", text2: "#444", text3: "#666", text4: "#888"
};
export const SafeAreaView = ({ children, ...props }) => <View {...props}>{children}</View>;
export const linkedNotes = [
  { id: "note:linked:1", accountId: "account:one", ownerUserId: "account:one", title: "客户提案跟进", body: "明天确认预算与交付时间。", manualContactIds: ["contact:/notes"], mentions: [], contactIds: ["contact:/notes"], eventIds: [], version: 2, createdAt: "2026-09-12T01:00:00.000Z", updatedAt: "2026-09-12T02:00:00.000Z" }
];
export const client = {
  async get(path) {
    state.requests.push({ method: "GET", path });
    return { success: true, status: 200, data: { notes: linkedNotes, total: 1 }, meta: {} };
  },
  patch() { throw new Error("legacy write called"); }
};
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { ContactNotesSection } from "./src/screens/contacts/ContactNotesSection";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        import { data, colors, client } from "fixture";
        const language = new URLSearchParams(location.search).get("language") || "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><ContactNotesSection actorId="account:one" client={client} colors={colors} contactId="contact:/notes" data={data} onRefresh={() => { throw new Error("legacy refresh called"); }} preview /></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "notes-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|fixture)$/ }, () => ({ path: "fixture", namespace: "notes-test" }));
        plugin.onLoad({ filter: /.*/, namespace: "notes-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function open(t: { after(fn: () => Promise<void>): void }, language = "zh"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => page.close());
  await page.goto(`${url}?language=${language}`);
  await page.getByRole("button", { name: language === "en" ? "Notes" : "笔记", exact: true }).click();
  return page;
}

test("legacy private notes remain readable and the old writer is closed", async (t) => {
  const page = await open(t);
  assert.equal(await page.getByText(literal, { exact: true }).count(), 1);
  assert.equal(await page.getByText("第二条备注", { exact: true }).count(), 1);
  assert.equal(await page.getByText("双方纪要", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "搜索关联笔记" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "保存备注" }).count(), 0);
  assert.match(await page.locator("body").innerText(), /只读/);
});

test("contact note tab reads actor-scoped linked notes and searches only this contact", async (t) => {
  const page = await open(t);
  await page.getByText("客户提案跟进", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests[0]), {
    method: "GET",
    path: "/api/notes?contactId=contact%3A%2Fnotes&limit=20",
  });
  await page.getByRole("textbox", { name: "搜索关联笔记" }).fill("预算");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests[1].path), "/api/notes?q=%E9%A2%84%E7%AE%97&contactId=contact%3A%2Fnotes&limit=20");
  await page.getByRole("button", { name: "查看关联笔记 客户提案跟进" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), "/notes/note%3Alinked%3A1");
});

test("legacy section opens independent filtered notes and create routes without writes", async (t) => {
  const page = await open(t);
  await page.getByRole("button", { name: "查看全部关联笔记", exact: true }).click();
  await page.getByRole("button", { name: "为此人新建笔记", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [
    "/notes?contactId=contact%3A%2Fnotes",
    "/notes/new?contactId=contact%3A%2Fnotes",
  ]);
});

test("an English contact detail translates note chrome and preserves legacy text", async (t) => {
  const page = await open(t, "en");
  await page.getByRole("textbox", { name: "Search related notes" }).waitFor();
  await page.getByRole("button", { name: "View all related notes" }).waitFor();
  await page.getByText("Legacy contact notes (read only)", { exact: true }).waitFor();
  await page.getByText(literal, { exact: true }).waitFor();
  await page.getByText("客户提案跟进", { exact: true }).waitFor();
});
