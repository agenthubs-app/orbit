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
import React, { useState } from "react";
import { View } from "react-native";
const contacts = {
  lin: { id: "contact:lin", name: "林悦", organization: "Orbit", role: "产品" },
  late: { id: "contact:late", name: "迟到结果", organization: "旧请求", role: "测试" },
  sato1: { id: "contact:sato:1", name: "佐藤", organization: "Studio A", role: "设计" },
  sato2: { id: "contact:sato:2", name: "佐藤", organization: "Studio B", role: "投资" },
  sato3: { id: "contact:sato:3", name: "佐藤美", organization: "Studio C", role: "运营" }
};
let resolveLate;
export const state = window.fixture = { requests: [], selectedIds: [], resolveLate() { resolveLate?.({ contacts: [contacts.late] }); } };
export function Harness({ Picker }) {
  const [selectedIds, setSelectedIds] = useState([]);
  state.selectedIds = selectedIds;
  const search = async (query, cursor, _signal) => {
    state.requests.push({ query, cursor });
    if (query === "迟") return new Promise(resolve => { resolveLate = resolve; });
    if (query === "林") return { contacts: [contacts.lin] };
    if (query === "佐" && !cursor) return { contacts: [contacts.sato1, contacts.sato2], nextCursor: "page:2" };
    if (query === "佐" && cursor === "page:2") return { contacts: [contacts.sato3] };
    return { contacts: [] };
  };
  return <View><Picker search={search} selectedIds={selectedIds} onToggle={id => setSelectedIds(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id])} /></View>;
}
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { NoteContactPicker } from "./src/screens/notes/NoteContactPicker";
        import { Harness } from "fixture";
        createRoot(document.getElementById("root")).render(<Harness Picker={NoteContactPicker} />);`,
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
      name: "picker-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: "icons", namespace: "picker-test" }));
        plugin.onResolve({ filter: /^fixture$/ }, () => ({ path: "fixture", namespace: "picker-test" }));
        plugin.onLoad({ filter: /^icons$/, namespace: "picker-test" }, () => ({ contents: "export const Ionicons=()=>null;", loader: "js" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "picker-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
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

async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => page.close());
  await page.goto(url);
  return page;
}

test("empty state makes zero requests and a late result cannot replace the current word", async (t) => {
  const page = await open(t);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.getByRole("button", { name: "添加相关人脉" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  const search = page.getByRole("textbox", { name: "搜索相关人脉" });
  await search.fill("迟");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await search.fill("林");
  await page.getByText("林悦", { exact: true }).waitFor();
  await page.evaluate(() => (window as any).fixture.resolveLate());
  await page.waitForTimeout(50);
  assert.equal(await page.getByText("迟到结果", { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.map((item: any) => item.query)), ["迟", "林"]);
});

test("same-name candidates retain stable ids across selection and pagination", async (t) => {
  const page = await open(t);
  await page.getByRole("button", { name: "添加相关人脉" }).click();
  await page.getByRole("textbox", { name: "搜索相关人脉" }).fill("佐");
  await page.getByText("投资 · Studio B", { exact: true }).waitFor();
  const candidates = page.getByRole("checkbox");
  assert.equal(await candidates.count(), 2);
  await candidates.nth(1).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.selectedIds), ["contact:sato:2"]);
  await page.getByRole("button", { name: "加载更多人脉" }).click();
  await page.getByText("佐藤美", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 3);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.selectedIds), ["contact:sato:2"]);
});
