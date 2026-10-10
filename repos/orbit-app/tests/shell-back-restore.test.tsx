import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./helpers/native-ui-stubs";
import { mainTabForPath } from "../src/view-models/app-navigation";
import { initialTaskSegment, rememberTaskSegment, rememberedScroll, rememberScroll, resetShellMemory, shellScrollKey } from "../src/view-models/shell-state";

// R05 (SC-R05-05): secondary pages have no tab bar, and coming back to a tab —
// even when the tab is mounted again (tab switch, direct-open fallback, a Task
// redirect) — lands on the same Task segment and scroll position.
const root = new URL("..", import.meta.url).pathname;
let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Pressable, Text, View } from "react-native";
import { AppScreen } from "./src/components/AppScreen";
import { ShellTabBar } from "./src/components/OrbitTabBar";
function Page() {
  return <AppScreen title="一覧">{Array.from({ length: 60 }, (_, i) => <Text key={i} style={{ height: 40 }}>row {i}</Text>)}</AppScreen>;
}
function Harness() {
  const [shown, setShown] = useState(true);
  window.toggle = () => setShown((value) => !value);
  return <View style={{ flex: 1 }}>{shown ? <Page /> : <Text>secondary page</Text>}<ShellTabBar /></View>;
}
createRoot(document.getElementById("root")).render(<Harness />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "shell", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: join(root, "tests/helpers/stubs/task-shell-router.js") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.shellFixture=${JSON.stringify({ path, params: {}, navigation: [] })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  await page.getByText("row 0", { exact: true }).waitFor();
  return page;
}

const scroller = (page: Page) => page.locator("div").filter({ has: page.getByText("row 59", { exact: true }) }).last();
const scrollTop = (page: Page) => page.evaluate(() => {
  const nodes = [...document.querySelectorAll("div")].filter((el) => el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== "visible");
  return nodes.map((el) => el.scrollTop).find((value) => value > 0) ?? 0;
});

test("a tab page that is mounted again comes back at the same scroll position", async (t) => {
  const page = await open(t, "/contacts");
  await page.getByRole("tablist", { name: "メインナビゲーション" }).waitFor();
  await page.evaluate(() => {
    const node = [...document.querySelectorAll("div")].find((el) => el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== "visible")!;
    node.scrollTop = 900; node.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as any).toggle());
  await page.getByText("secondary page").waitFor();
  await page.evaluate(() => (window as any).toggle());
  await scroller(page).waitFor();
  await page.waitForTimeout(200);
  assert.ok(Math.abs((await scrollTop(page)) - 900) <= 2, String(await scrollTop(page)));
});

test("secondary pages never show the tab bar; the four tab pages always do", () => {
  for (const path of ["/contacts/c1", "/events/e1", "/settings", "/tasks/t1", "/profile", "/ai", "/inbox", "/notes/n1", "/schedule/personal/p1"]) assert.equal(mainTabForPath(path), null, path);
  for (const path of ["/home", "/contacts", "/events", "/task"]) assert.notEqual(mainTabForPath(path), null, path);
});

test("the shell remembers the Task segment and each scroll position for the session", () => {
  resetShellMemory();
  assert.equal(initialTaskSegment(undefined), "calendar", "first open: the first slot");
  rememberTaskSegment("memo");
  assert.equal(initialTaskSegment(undefined), "memo", "back to Task: the segment the user left");
  assert.equal(initialTaskSegment("todo"), "todo", "a link names its segment");
  assert.equal(initialTaskSegment(["plan"]), "plan");
  assert.equal(initialTaskSegment("bogus"), "memo");
  rememberScroll(shellScrollKey("/task", "todo"), 320);
  rememberScroll(shellScrollKey("/home"), 40);
  assert.equal(rememberedScroll("/task#todo"), 320);
  assert.equal(rememberedScroll("/task#memo"), 0, "segments keep separate positions");
  assert.equal(rememberedScroll("/home"), 40);
  resetShellMemory();
});

test("マイページ and イベント no longer draw their own tab bar; the root layout draws the one bar", () => {
  for (const file of ["src/screens/profile/ProfileScreen.tsx", "src/screens/events/EventsScreen.tsx", "src/components/AppScreen.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /OrbitTabBar/u, file);
  }
  const layout = readFileSync(join(root, "app/_layout.tsx"), "utf8");
  assert.match(layout, /<ShellTabBar \/>/u);
  assert.match(readFileSync(join(root, "src/screens/profile/ProfileScreen.tsx"), "utf8"), /<ShellBackBar \/>[\s\S]*<ShellInboxRow \/>/u, "マイページ has a back bar and keeps the 受信箱 row");
});
