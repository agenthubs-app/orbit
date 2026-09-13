import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { isPrivateMobileRoute } from "../src/view-models/mobile-route-access";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

// Only OS safe area, keyboard events, icons and router are replaced. AppScreen,
// controls, theme, SVG geometry, text inputs and press handling stay real.
const boundaries = `
import React from "react";
import { View } from "react-native";
export const usePathname = () => new URLSearchParams(location.search).get("path") || "/home";
export const useRouter = () => ({
  canGoBack: () => location.search.includes("history"),
  back: () => window.fixture.navigation.push({ method: "back" }),
  push: href => window.fixture.navigation.push({ method: "push", href }),
  replace: href => window.fixture.navigation.push({ method: "replace", href })
});
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { AppScreen } from "./src/components/AppScreen";
import { createControlStyles } from "./src/design/controls";
import { useOrbitTheme } from "./src/design/theme";
const listeners = new Map();
window.fixture = { navigation: [], writes: [], keyboard: event => listeners.get(event)?.forEach(fn => fn()) };
// Native Keyboard.isVisible is an instance method that reads this state.
// RNW's receiver-independent implementation hid a native startup crash.
Keyboard._currentlyShowing = location.search.includes("keyboardOpen") ? {} : null;
Keyboard.isVisible = function () { "use strict"; return !!this._currentlyShowing; };
Keyboard.addListener = (event, fn) => {
  const group = listeners.get(event) || new Set(); group.add(fn); listeners.set(event, group);
  return { remove: () => group.delete(fn) };
};
function Fixture() {
  const { colors } = useOrbitTheme(); const controls = createControlStyles(colors);
  const [draft, setDraft] = useState(""); const [selected, setSelected] = useState(false);
  return <AppScreen title={location.search.includes("long") ? "查看活动报名与现场安排，继续处理所有尚未完成的工作" : "人脉"}
    titleAccessory={<Text>247</Text>} headerActions={<Pressable accessibilityRole="button" accessibilityLabel="添加人脉" style={{ minHeight: 44, minWidth: 44 }}><Text>添加</Text></Pressable>}>
    <TextInput accessibilityLabel="备注草稿" style={controls.input} value={draft} onChangeText={setDraft} />
    <Pressable accessibilityRole="button" style={controls.primaryButton} onPress={() => window.fixture.writes.push(draft)}><Text style={controls.primaryButtonText}>保存</Text></Pressable>
    <Pressable accessibilityRole="button" style={controls.secondaryButton}><Text style={controls.secondaryButtonText}>预览</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} aria-selected={selected} onPress={() => setSelected(!selected)} style={[controls.chip, selected && controls.selectedChip]}>
      <Text style={[controls.chipText, selected && controls.selectedChipText]}>只看待办</Text>
    </Pressable>
    <View style={{ height: 1200 }} />
    <Pressable accessibilityRole="button" accessibilityLabel="最后一个操作" style={controls.primaryButton}><Text style={controls.primaryButtonText}>最后一个操作</Text></Pressable>
  </AppScreen>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "shell-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$/ }, () => ({ path: "fixture", namespace: "shell" }));
      plugin.onLoad({ filter: /.*/, namespace: "shell" }, () => ({ contents: boundaries, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div><script>` + result.outputFiles[0]!.text + "</script>");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  url = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, query = "", width = 390): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme: "light" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(2000); t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url + "?path=" + encodeURIComponent(path) + "&" + query);
  await page.getByRole("textbox", { name: "备注草稿" }).waitFor();
  return page;
}

test("only exact primary routes own a tab bar and secondary routes have real parents", () => {
  const nav = existsSync("src/view-models/app-navigation.ts") ? require("../src/view-models/app-navigation") : {};
  assert.equal(typeof nav.mainTabForPath, "function", "primary route classification is missing");
  for (const [path, tab] of [["/home", "home"], ["/contacts", "contacts"], ["/events", "events"], ["/profile", "profile"], ["/ai", null], ["/contacts/one", null], ["/events/one/register", null]]) {
    assert.equal(nav.mainTabForPath(path), tab);
  }
  for (const [path, href, label] of [
    ["/settings/api", "/settings", "设置"], ["/settings", "/profile", "我的"],
    ["/contacts/one", "/contacts", "人脉"], ["/contacts/new/batch/one", "/contacts/new", "导入中心"],
    ["/events/one/operations/admission", "/events/one/operations", "活动运营"],
    ["/events/one/operations", "/events/one", "活动详情"], ["/tasks/one", "/tasks", "待办"],
    ["/inbox/one", "/inbox", "收件箱"], ["/schedule", "/home", "首页"]
  ]) assert.deepEqual(nav.parentForPath(path), { href, label });
});

for (const [path, active] of [["/home", "首页"], ["/contacts", "人脉"], ["/events", "活动"], ["/profile", "我的"]]) {
  test(path + " has ordered working tabs, an active destination and no back button", async t => {
    const page = await open(t, path!, "history");
    const tabs = page.getByRole("tab");
    assert.deepEqual(await tabs.allTextContents(), ["首页", "人脉", "IORBIT", "活动", "我的"]);
    assert.equal(await page.getByRole("tab", { name: active!, exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByRole("button", { name: "返回", exact: true }).count(), 0);
    await page.getByRole("tab", { name: "IORBIT", exact: true }).click();
    await page.getByRole("tab", { name: "活动", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [{ method: "push", href: "/ai" }, { method: "replace", href: "/events" }]);
  });
}

test("secondary page has no tabs, prefers history and has a meaningful direct-open fallback", async t => {
  const history = await open(t, "/settings/api", "history");
  assert.equal(await history.getByRole("tab").count(), 0);
  assert.equal(await history.getByRole("button", { name: "返回", exact: true }).textContent(), "返回", "history navigation must not promise an unrelated fallback destination");
  await history.getByRole("button", { name: "返回", exact: true }).click();
  assert.deepEqual(await history.evaluate(() => (window as any).fixture.navigation), [{ method: "back" }]);
  const direct = await open(t, "/settings/api");
  await direct.getByRole("button", { name: "返回设置", exact: true }).click();
  assert.deepEqual(await direct.evaluate(() => (window as any).fixture.navigation), [{ method: "replace", href: "/settings" }]);
});

test("direct-open login and permissions return to their public account parent", async t => {
  for (const path of ["/account/login", "/account/permissions"]) {
    const page = await open(t, path);
    await page.getByRole("button", { name: "返回账号", exact: true }).click();
    const navigation = await page.evaluate(() => (window as any).fixture.navigation);
    assert.deepEqual(navigation, [{ method: "replace", href: "/account" }]);
    assert.equal(isPrivateMobileRoute(navigation[0]!.href), false, "the fallback must not immediately send a guest back to login");
  }
});

test("compact secondary title grows without clipping at narrow widths and doubled text", async t => {
  const page = await open(t, "/contacts/one", "long", 320);
  const heading = page.getByRole("heading");
  assert.equal(await heading.evaluate(el => getComputedStyle(el).fontSize), "16px");
  await page.addStyleTag({ content: '[role="heading"] { font-size: 32px !important; line-height: 42px !important; }' });
  const box = (await heading.boundingBox())!;
  assert.ok(box.x >= 0 && box.x + box.width <= 320);
  assert.equal(await heading.evaluate(el => el.scrollHeight <= el.clientHeight + 1), true);
});

test("tabs fit 320pt, stay outside the scroll content and never cover its last action", async t => {
  const page = await open(t, "/contacts", "", 320);
  const tabBar = page.getByRole("tablist", { name: "主导航" });
  await tabBar.waitFor();
  for (const tab of await page.getByRole("tab").all()) {
    const box = (await tab.boundingBox())!;
    assert.ok(box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= 320);
  }
  const before = (await tabBar.boundingBox())!;
  assert.equal(before.height, 72, "normal-size navigation follows the approved 72pt source");
  const last = page.getByRole("button", { name: "最后一个操作" });
  await last.evaluate(el => el.scrollIntoView({ block: "start" }));
  const final = (await last.boundingBox())!;
  assert.ok(final.y + final.height <= before.y, "the last action must be reachable above the floating bar");
  assert.equal((await tabBar.boundingBox())!.y, before.y);
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-ink-signal-shell-320.png" });
});

test("all navigation labels stay inside their targets at doubled text size", async t => {
  const page = await open(t, "/home", "", 320);
  await page.getByRole("tablist").waitFor();
  await page.getByRole("tab").locator("[dir='auto']").evaluateAll(nodes => nodes.forEach(node => {
    const el = node as HTMLElement, s = getComputedStyle(el);
    el.style.fontSize = parseFloat(s.fontSize) * 2 + "px";
    el.style.lineHeight = parseFloat(s.lineHeight) * 2 + "px";
  }));
  for (const tab of await page.getByRole("tab").all()) {
    const box = (await tab.boundingBox())!, label = (await tab.locator("[dir='auto']").boundingBox())!;
    assert.ok(label.x >= box.x && label.x + label.width <= box.x + box.width + 0.01, "the label stays inside its target");
    assert.ok(label.y >= box.y && label.y + label.height <= box.y + box.height + 0.01);
  }
});

test("keyboard hides the floating bar and restores it without dropping drafts", async t => {
  const page = await open(t, "/contacts");
  const bar = page.getByRole("tablist", { name: "主导航" }); await bar.waitFor();
  await page.getByRole("textbox", { name: "备注草稿" }).fill("下次见面带资料");
  await page.evaluate(() => (window as any).fixture.keyboard("keyboardDidShow"));
  await bar.waitFor({ state: "hidden" });
  await page.evaluate(() => (window as any).fixture.keyboard("keyboardDidHide"));
  await bar.waitFor();
  assert.equal(await page.getByRole("textbox", { name: "备注草稿" }).inputValue(), "下次见面带资料");
});

test("native keyboard visibility initializes without losing its receiver and respects an already open keyboard", async t => {
  const page = await open(t, "/contacts", "keyboardOpen");
  const bar = page.getByRole("tablist", { name: "主导航" });
  assert.equal(await bar.count(), 0);
  await page.getByRole("textbox", { name: "备注草稿" }).fill("保留正在编辑的草稿");
  await page.evaluate(() => (window as any).fixture.keyboard("keyboardDidHide"));
  await bar.waitFor();
  assert.equal(await page.getByRole("textbox", { name: "备注草稿" }).inputValue(), "保留正在编辑的草稿");
});

test("ink actions, outlined secondary and selected chips retain drafts and real writes across appearance", async t => {
  const page = await open(t, "/home");
  const primary = page.getByRole("button", { name: "保存", exact: true });
  const secondary = page.getByRole("button", { name: "预览", exact: true });
  assert.equal(await primary.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)");
  assert.deepEqual(await secondary.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderTopWidth, s.borderTopColor]; }), ["rgb(255, 255, 255)", "1px", "rgb(11, 18, 32)"]);
  const chip = page.getByRole("button", { name: "只看待办", exact: true });
  await chip.click();
  assert.equal(await chip.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)");
  await page.getByRole("textbox", { name: "备注草稿" }).fill("保留备注");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await page.getByRole("textbox", { name: "备注草稿" }).inputValue(), "保留备注");
  assert.equal(await chip.getAttribute("aria-selected"), "true");
  await primary.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), ["保留备注"]);
});
