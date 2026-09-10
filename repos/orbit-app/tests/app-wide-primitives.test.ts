import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;
const title = "查看所有活动报名与现场安排，继续处理尚未完成的工作";

// Replace only native safe-area/icon and navigation/auth boundaries. Production
// components, theme, RN Web input/press handling and SettingsScreen stay real.
const boundaries = `
import React from "react";
import { View } from "react-native";
const state = window.fixture = { requests: [], navigation: [], canGoBack: !location.search.includes("direct") };
export const useRouter = () => ({ canGoBack: () => state.canGoBack, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const usePathname = () => "/settings";
export const useOrbitAuthSession = () => ({ signedIn: true, ready: true });
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
`;

test.before(async () => {
  // Before the new style factory exists, render an unstyled consumer so RED is
  // the actual missing touch/layout contract, never a module-resolution error.
  const controlsImport = existsSync("src/design/controls.ts")
    ? 'import { createControlStyles } from "./src/design/controls";'
    : "const createControlStyles = () => ({});";
  const result = await build({
    stdin: { contents: `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Pressable, Text, TextInput, View } from "react-native";
import { AppScreen } from "./src/components/AppScreen";
import { DataCard } from "./src/components/DataCard";
import { SectionHeader } from "./src/components/SectionHeader";
import { MetricPill } from "./src/components/MetricPill";
import { EmptyState } from "./src/components/EmptyState";
import { ErrorState } from "./src/components/ErrorState";
import { LoadingState } from "./src/components/LoadingState";
import { AppErrorScreen } from "./src/components/AppErrorBoundary";
import { SettingsScreen } from "./src/screens/settings/SettingsScreen";
import { useOrbitTheme } from "./src/design/theme";
${controlsImport}
function Fixture() {
  const { colors } = useOrbitTheme(); const controls = createControlStyles(colors);
  const [draft, setDraft] = useState(""); const [selected, setSelected] = useState(false);
  const record = action => window.fixture.requests.push({ action, draft });
  if (location.search.includes("recovery")) return <AppErrorScreen error={new Error("连接中断，请检查后重试")} onRetry={() => record("retry")} />;
  if (location.search.includes("settings")) return <SettingsScreen />;
  return <AppScreen title=${JSON.stringify(title)} eyebrow={location.search.includes("context") ? "活动运营" : "Orbit"} headerVariant={location.search.includes("compact") ? "compact" : "large"}>
    <DataCard title="打开活动详情" detail="保留完整活动资料与报名安排" onPress={() => record("open")}><Text style={{ color: colors.text }}>现有内容仍可阅读</Text></DataCard>
    <DataCard title="报名信息" variant="inset"><TextInput accessibilityLabel="报名备注" value={draft} onChangeText={setDraft} style={controls.input} />
      <Pressable accessibilityRole="button" onPress={() => record("save")} style={controls.primaryButton}><Text style={controls.primaryButtonText}>保存报名资料并继续查看接下来的活动安排</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => record("preview")} style={controls.secondaryButton}><Text style={controls.secondaryButtonText}>先预览完整资料再决定下一步</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !draft }} disabled={!draft} onPress={() => record("submit")} style={[controls.primaryButton, !draft && { opacity: 0.45 }]}><Text style={controls.primaryButtonText}>提交</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelected(!selected)} style={[controls.chip, selected && controls.selectedChip]}><Text style={[controls.chipText, selected && controls.selectedChipText]}>只看我报名的活动</Text></Pressable>
    </DataCard>
    <SectionHeader title="接下来要处理的事项" detail="完整保留辅助说明" />
    <MetricPill label="近期仍待确认的活动报名人数" value="128 人" />
    <EmptyState title="暂时没有更多活动" message="新活动会显示在这里" />
    <ErrorState message="活动资料暂时未能读取" />
    <LoadingState />
  </AppScreen>;
}
createRoot(document.getElementById("root")).render(<Fixture />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "primitives-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/AuthSessionProvider$/ }, () => ({ path: "fixture", namespace: "primitives-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "primitives-test" }, () => ({ contents: boundaries, loader: "jsx", resolveDir: process.cwd() }));
    } }],
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

async function openScreen(t: { after: (fn: () => Promise<void>) => void }, query = "", colorScheme: "light" | "dark" = "light", width = 320): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 874 }, colorScheme });
  page.setDefaultTimeout(2000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url + "?" + query);
  await page.getByText(query.includes("settings") ? "设置" : query.includes("recovery") ? "这个页面出了点问题" : title, { exact: true }).waitFor();
  return page;
}

async function fits(locator: Locator, width = 320, minHeight = 0) {
  const box = (await locator.boundingBox())!;
  assert.ok(box.height >= minHeight, `expected touch height >= ${minHeight}, got ${box.height}`);
  assert.ok(box.x >= 0 && box.x + box.width <= width + 0.1, "content must stay within the viewport");
  assert.equal(await locator.evaluate(node => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1), true, "content must grow instead of clipping");
}

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => (color.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("shared header grows for long titles and retains unframed 44pt back and direct-open fallback", async t => {
  const page = await openScreen(t);
  const back = page.getByRole("button", { name: "返回", exact: true });
  await fits(back, 320, 44);
  assert.ok((await back.boundingBox())!.width >= 44);
  await back.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["back"]);
  await fits(page.getByText(title, { exact: true }));
  assert.equal(await back.evaluate(node => getComputedStyle(node).borderTopWidth), "0px", "the native return entry must not create a card frame");
  assert.equal(await page.getByText("Orbit", { exact: true }).count(), 0);
  const direct = await openScreen(t, "direct&compact&context");
  await direct.getByText("活动运营", { exact: true }).waitFor();
  await direct.getByRole("button", { name: "回到 Orbit AI", exact: true }).click();
  assert.deepEqual(await direct.evaluate(() => (window as any).fixture.navigation), ["/ai"]);
  await fits(direct.getByText(title, { exact: true }));
});

for (const appearance of ["light", "dark"] as const) {
  test(`${appearance}: open sections and inset forms preserve content, actions and readable hierarchy`, async t => {
    const page = await openScreen(t, "", appearance);
    const card = page.getByRole("button", { name: /打开活动详情/ });
    await fits(card, 320, 44);
    await card.click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "open", draft: "" }]);
    await page.getByText("现有内容仍可阅读", { exact: true }).waitFor();
    const section = page.getByText("打开活动详情", { exact: true }).locator("..").locator("..");
    assert.equal(await section.evaluate(node => getComputedStyle(node).borderLeftWidth), "0px", "ordinary sections must not keep an outer card frame");
    const inset = page.getByText("报名信息", { exact: true }).locator("..").locator("..");
    assert.equal(await inset.evaluate(node => getComputedStyle(node).borderRadius), "12px");
    const error = page.getByText("活动资料暂时未能读取", { exact: true });
    const errorSurface = error.locator("..").locator("..");
    const surface = await errorSurface.evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(surface, await section.evaluate(node => getComputedStyle(node).backgroundColor), "error recovery needs a distinct inset surface");
    assert.ok(contrast(await error.evaluate(node => getComputedStyle(node).color), surface) >= 4.5);
    for (const [label, container] of [["打开活动详情", section], ["暂时没有更多活动", page.getByText("暂时没有更多活动", { exact: true }).locator("..").locator("..")]] as const) {
      assert.ok(contrast(await page.getByText(label, { exact: true }).evaluate(node => getComputedStyle(node).color), await container.evaluate(node => getComputedStyle(node).backgroundColor)) >= 4.5);
    }
    const metric = page.getByText("近期仍待确认的活动报名人数", { exact: true });
    await fits(metric);
    assert.equal(await metric.locator("..").evaluate(node => getComputedStyle(node).borderWidth), "0px", "secondary statistics must not create another bordered card");
    assert.equal(await page.getByText("128 人", { exact: true }).evaluate(node => getComputedStyle(node).color), appearance === "light" ? "rgb(32, 36, 44)" : "rgb(240, 240, 236)");
    await fits(page.getByText("接下来要处理的事项", { exact: true }));
    await page.getByRole("progressbar", { name: "正在加载" }).waitFor();
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-primitives-${appearance}.png`, fullPage: true });
  });
}

test("shared controls grow around long labels, keep drafts on appearance change and respect disabled actions", async t => {
  const page = await openScreen(t);
  const input = page.getByRole("textbox", { name: "报名备注" });
  const save = page.getByRole("button", { name: "保存报名资料并继续查看接下来的活动安排" });
  const preview = page.getByRole("button", { name: "先预览完整资料再决定下一步" });
  const submit = page.getByRole("button", { name: "提交", exact: true });
  await submit.dispatchEvent("click");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await fits(input, 320, 44);
  await fits(save, 320, 50);
  await fits(preview, 320, 44);
  for (const button of [save, preview]) {
    assert.ok(contrast(await button.locator("div").first().evaluate(node => getComputedStyle(node).color), await button.evaluate(node => getComputedStyle(node).backgroundColor)) >= 4.5);
  }
  await input.fill("带上同事的报名资料");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await input.inputValue(), "带上同事的报名资料");
  await save.click(); await preview.click(); await submit.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), ["save", "preview", "submit"].map(action => ({ action, draft: "带上同事的报名资料" })));
  const chip = page.getByRole("button", { name: "只看我报名的活动" });
  await fits(chip, 320, 44);
  const before = await chip.evaluate(node => getComputedStyle(node).backgroundColor);
  await chip.click();
  assert.notEqual(await chip.evaluate(node => getComputedStyle(node).backgroundColor), before);
  for (const button of [save, preview, chip]) {
    const label = button.locator("div").first();
    const color = await label.evaluate(node => getComputedStyle(node).color);
    const background = await button.evaluate(node => getComputedStyle(node).backgroundColor);
    assert.ok(contrast(color, background) >= 4.5);
  }
  // Browser font inflation checks reflow; native Dynamic Type is verified on the simulator separately.
  await page.evaluate(() => document.querySelectorAll("[dir='auto'],input").forEach(node => {
    const element = node as HTMLElement, style = getComputedStyle(element);
    element.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
    element.style.lineHeight = `${parseFloat(style.lineHeight) * 2}px`;
  }));
  for (const locator of [page.getByText(title, { exact: true }), save, preview, chip]) await fits(locator);
  for (const button of [save, preview, chip]) await fits(button.locator("div").first());
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-primitives-large-dark.png", fullPage: true });
});

test("real settings consumer retains all destinations on an open page with bounded wide layout", async t => {
  const page = await openScreen(t, "settings", "light", 900);
  for (const [label, href] of [["打开账号", "/account"], ["打开权限中心", "/account/permissions"], ["打开服务器", "/settings/api"]]) {
    const button = page.getByRole("button", { name: new RegExp(label!) });
    await button.click();
    assert.ok((await button.boundingBox())!.width <= 496);
  }
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/account", "/account/permissions", "/settings/api"]);
});

for (const appearance of ["light", "dark"] as const) {
  test(`${appearance}: recovery screen keeps a full-size retry and readable error details at 320pt`, async t => {
    const page = await openScreen(t, "recovery", appearance);
    const retry = page.getByRole("button", { name: "重试", exact: true });
    await fits(retry, 320, 50);
    await retry.click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "retry", draft: "" }]);
    await fits(page.getByText("连接中断，请检查后重试", { exact: true }));
    const text = retry.getByText("重试", { exact: true });
    assert.ok(contrast(await text.evaluate(node => getComputedStyle(node).color), await retry.evaluate(node => getComputedStyle(node).backgroundColor)) >= 4.5);
    await page.evaluate(() => document.querySelectorAll("[dir='auto']").forEach(node => {
      const element = node as HTMLElement, style = getComputedStyle(element);
      element.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
      element.style.lineHeight = `${parseFloat(style.lineHeight) * 2}px`;
    }));
    await fits(page.getByText("这个页面出了点问题", { exact: true }));
    await fits(retry, 320, 50);
    await retry.click();
    assert.equal((await page.evaluate(() => (window as any).fixture.requests)).length, 2);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-recovery-large-${appearance}.png`, fullPage: true });
  });
}
