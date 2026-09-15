import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
// Production screens, account VM, AppScreen/theme/RNW and revocation queue run.
// Native storage/device APIs, authenticated session, navigation and GET resource
// are controlled boundaries. The lifecycle suites retain real storage/registry
// coordination; this suite proves the redesigned controls still invoke it.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0; const listeners = new Set();
const state = window.fixture = { screen: "settings", width: 390, fontScale: 1, signedIn: true, ready: true, kind: "success", optedIn: true, calls: [], navigation: [], refreshes: 0,
  user: { id: "actor:1", name: "程川", email: "cheng.chuan@example.test" },
  data: { account: { workspaceName: "星野工作室", role: "operator", plan: "live-relationship-os" }, user: { timezone: "Asia/Tokyo" }, profile: { relationshipGoal: "认识日本市场的长期合作伙伴。" }, session: { status: "signed-in" } },
  ...window.initialFixture, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { useFixture(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.user?.id ?? null : null, actorId: state.signedIn ? state.user?.id ?? null : null, user: state.user, cookieHeader: "test-cookie", signOut: async () => { state.calls.push("sign-out"); return state.logoutFailure ? { success: false, message: "退出未完成，请重试。" } : { success: true }; } }; };
const client = {};
export const useOrbitApiClient = () => client;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const useApiResource = () => { useFixture(); return { kind: state.kind, data: state.data, error: { message: "账号读取失败，请重试。" }, refreshing: false, refresh() { state.refreshes++; } }; };
export const useRouter = () => ({ canGoBack: () => false, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const usePathname = () => state.screen === "account" ? "/account" : "/settings";
export const useLocalSearchParams = () => ({});
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
export const isPushNotificationsOptedIn = async () => { if (state.holdRead) await new Promise(resolve => state.releaseRead = resolve); return state.optedIn; };
export const setPushNotificationsOptIn = async enabled => { state.calls.push("opt-in:" + enabled); state.optedIn = enabled; };
export const revokeNotificationDevice = async () => { state.calls.push("revoke-local"); if (state.hold) await new Promise(resolve => state.release = resolve); return !state.revokeFailure; };
export const revokeRegisteredPushDevice = async input => { state.calls.push("revoke-durable"); state.revocationScope = input; return true; };
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { SettingsScreen } from "./src/screens/settings/SettingsScreen"; import { AccountScreen } from "./src/screens/profile/AccountScreen"; function App() { const s = useFixture(); return s.screen === "account" ? <AccountScreen /> : <SettingsScreen />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "settings-account-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-settings" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|useOrbitApiClient|ApiBaseUrlProvider|useApiResource|native-notifications|push-device-session)$/ }, () => ({ path: "fixture", namespace: "ink-settings" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-settings" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  page.setDefaultTimeout(1500); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function calls(page: Page) { return page.evaluate(() => (window as any).fixture.calls); }
async function navigation(page: Page) { return page.evaluate(() => (window as any).fixture.navigation); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-settings-account-${name}.png`, fullPage: true }); }

test("settings uses source section hierarchy, open rows and real notification status", async t => {
  const page = await open(t);
  await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
  for (const name of ["通用", "账号", "服务器"]) assert.equal(await page.getByRole("heading", { name, exact: true }).evaluate(el => getComputedStyle(el).fontWeight), "800");
  const account = page.getByRole("button", { name: "打开账号", exact: true });
  assert.equal((await account.boundingBox())!.height, 50); assert.equal((await account.boundingBox())!.x, 16);
  const toggle = page.getByRole("button", { name: "关闭关键提醒", exact: true });
  assert.equal((await toggle.boundingBox())!.height, 50);
  assert.equal(await toggle.evaluate(el => getComputedStyle(el).borderRadius), "0px");
  assert.equal(await page.getByText("开启", { exact: true }).count(), 1, "show actual opt-in without claiming OS delivery");
  assert.deepEqual(await calls(page), []); await shot(page, "settings");
});

test("settings navigation and guest filtering preserve the existing routes", async t => {
  const page = await open(t);
  for (const name of ["账号", "权限中心", "服务器"]) await page.getByRole("button", { name: `打开${name}`, exact: true }).click();
  assert.deepEqual(await navigation(page), ["/account", "/account/permissions", "/settings/api"]);
  await page.evaluate(() => (window as any).fixture.update({ signedIn: false }));
  assert.equal(await page.getByRole("button", { name: /关键提醒|权限中心/ }).count(), 0);
  for (const name of ["账号", "服务器"]) assert.equal(await page.getByRole("button", { name: `打开${name}`, exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /数据导出|导出我的数据|外观|语言|文字大小/ }).count(), 0);
  assert.deepEqual(await calls(page), []); await shot(page, "settings-guest");
});

test("notification status stays unknown until the stored preference is read", async t => {
  const page = await open(t, { holdRead: true });
  await page.getByText("读取中…", { exact: true }).waitFor();
  assert.equal(await page.getByText("关闭", { exact: true }).count(), 0);
  const reading = page.getByRole("button", { name: "正在读取关键提醒状态", exact: true });
  assert.equal(await reading.isDisabled(), true);
  await reading.dispatchEvent("click");
  assert.deepEqual(await calls(page), []);
  await page.evaluate(() => { (window as any).fixture.releaseRead(); });
  const ready = page.getByRole("button", { name: "关闭关键提醒", exact: true });
  await ready.waitFor();
  assert.equal(await ready.isEnabled(), true);
});

test("notification opt-in requires a click and opt-out keeps both revocations and retry", async t => {
  const page = await open(t, { optedIn: false });
  assert.deepEqual(await calls(page), []);
  await page.getByRole("button", { name: "开启关键提醒", exact: true }).click();
  assert.deepEqual(await calls(page), ["opt-in:true"]);
  await page.evaluate(() => (window as any).fixture.update({ hold: true, revokeFailure: true }));
  await page.getByRole("button", { name: "关闭关键提醒", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "正在准备…", exact: true }).isDisabled(), true);
  assert.deepEqual(await calls(page), ["opt-in:true", "opt-in:false", "revoke-local", "revoke-durable"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.revocationScope), { baseUrl: "https://orbit.test", cookieHeader: "test-cookie" });
  await page.evaluate(() => { (window as any).fixture.update({ hold: false }); (window as any).fixture.release(); });
  await page.getByRole("alert").waitFor(); await shot(page, "settings-error");
  await page.evaluate(() => (window as any).fixture.update({ revokeFailure: false }));
  await page.getByRole("button", { name: "重试关闭关键提醒", exact: true }).click();
  await page.getByRole("button", { name: "开启关键提醒", exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.deepEqual(await calls(page), ["opt-in:true", "opt-in:false", "revoke-local", "revoke-durable", "opt-in:false", "revoke-local", "revoke-durable"]);
});

test("account shows open verified identity and only the actual workspace", async t => {
  const page = await open(t, { screen: "account" });
  const name = page.getByText("程川", { exact: true });
  assert.equal(await name.evaluate(el => getComputedStyle(el).fontSize), "18px");
  await page.getByText("cheng.chuan@example.test", { exact: true }).waitFor();
  const initial = page.getByText("程", { exact: true }).locator("..");
  assert.equal((await initial.boundingBox())!.width, 56); assert.equal((await initial.boundingBox())!.height, 56);
  const workspace = page.getByRole("heading", { name: "工作区", exact: true }); await workspace.waitFor();
  for (const text of ["星野工作室", "运营者", "人脉交换工作区", "东京时间", "认识日本市场的长期合作伙伴。", "当前"]) assert.ok(await page.getByText(text, { exact: true }).count());
  assert.equal(await page.getByRole("button", { name: /新建|邀请成员|个人空间/ }).count(), 0);
  assert.equal(await page.getByText(/管理员|位成员/).count(), 0);
  assert.equal(await name.evaluate(el => {
    for (let parent = el.parentElement; parent && parent.id !== "root"; parent = parent.parentElement) if (parseFloat(getComputedStyle(parent).borderTopLeftRadius) > 0) return false;
    return true;
  }), true, "identity is not enclosed in a rounded DataCard");
  assert.deepEqual(await calls(page), []); await shot(page, "account");
});

test("account links use existing destinations and sign-out failure remains visible", async t => {
  const page = await open(t, { screen: "account", logoutFailure: true });
  for (const name of ["修改个人资料", "服务器设置", "权限中心"]) await page.getByRole("button", { name, exact: true }).click();
  assert.deepEqual(await navigation(page), ["/profile/edit", "/settings/api", "/account/permissions"]); assert.deepEqual(await calls(page), []);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByText("退出未完成，请重试。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 0); await shot(page, "account-error");
  await page.evaluate(() => (window as any).fixture.update({ logoutFailure: false }));
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 1);
  assert.equal(await page.getByText("退出未完成，请重试。", { exact: true }).count(), 0);
  assert.deepEqual(await calls(page), ["sign-out", "sign-out"]);
});

test("account guest and resource failures never show stale private identity", async t => {
  const page = await open(t, { screen: "account", signedIn: false });
  for (const kind of ["loading", "failure", "offline", "success"]) {
    await page.evaluate(kind => (window as any).fixture.update({ kind }), kind);
    assert.equal(await page.getByText(/星野工作室|cheng.chuan|程川/).count(), 0);
    assert.equal(await page.getByRole("button", { name: /权限中心|退出登录|修改个人资料/ }).count(), 0);
    const server = page.getByRole("button", { name: "服务器设置", exact: true });
    assert.equal(await server.isEnabled(), true);
    assert.ok((await server.boundingBox())!.y < (await page.getByRole("button", { name: "登录", exact: true }).boundingBox())!.y, "guests can reach server settings before authentication in every resource state");
  }
  await shot(page, "account-guest");
  for (const name of ["服务器设置", "登录", "创建账号"]) await page.getByRole("button", { name, exact: true }).click();
  assert.deepEqual(await navigation(page), ["/settings/api", "/account/login", "/account/signup"]);
  await page.evaluate(() => (window as any).fixture.update({ signedIn: true, kind: "failure" }));
  await page.getByText("账号读取失败，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByText(/星野工作室|cheng.chuan|程川/).count(), 0);
  assert.deepEqual(await calls(page), []);
});

test("double-size account email retains a readable column instead of squeezing beside edit", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 2 });
  const email = page.getByText("cheng.chuan@example.test", { exact: true });
  assert.ok((await email.boundingBox())!.width >= 200);
  assert.ok((await email.boundingBox())!.x + (await email.boundingBox())!.width <= 304.1, "email stays within the content inset");
  assert.equal(await email.evaluate(el => getComputedStyle(el).fontSize), "26px");
});

test("large account metadata uses one readable column", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 1.6 });
  assert.ok((await page.getByText("人脉交换工作区", { exact: true }).boundingBox())!.width >= 250);
});

test("double-size account header does not orphan the last workspace character", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 2 });
  assert.equal(await page.getByRole("heading").first().evaluate(el => {
    const node = el.firstChild!; const offset = node.textContent!.indexOf("工作区");
    if (offset < 0) return false;
    const first = document.createRange(), last = document.createRange();
    first.setStart(node, offset); first.setEnd(node, offset + 1);
    last.setStart(node, offset + 2); last.setEnd(node, offset + 3);
    return Math.abs(first.getBoundingClientRect().y - last.getBoundingClientRect().y) < 1;
  }), true);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: settings and account text is complete and controls reachable`, async t => {
    for (const screen of ["settings", "account"]) {
      const page = await open(t, { ...variant, screen });
      assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
      assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => { const b = n.getBoundingClientRect(); return b.left < -0.1 || b.right > window.innerWidth + 0.1; }).map(n => n.textContent)), [], "text must fit the screen, not merely its overflowing parent");
      await shot(page, `${variant.name}-${screen}`);
      for (const control of await page.getByRole("button").all()) {
        await control.scrollIntoViewIfNeeded(); const b = (await control.boundingBox())!;
        assert.ok(b.height >= 44 && b.width >= 44 && b.x >= 0 && b.x + b.width <= variant.width + 0.1, `control fits ${JSON.stringify(b)}`);
        assert.ok(b.y >= 48 && b.y + b.height <= 844.1, "controls remain in scroll viewport");
      }
      await page.evaluate(() => document.querySelectorAll("*").forEach(el => {
        if (el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
      }));
      await shot(page, `${variant.name}-${screen}-bottom`);
      assert.deepEqual(await calls(page), []);
      if (screen === "account") {
        await page.evaluate(() => (window as any).fixture.update({ user: { id: "actor:1", name: "林悦，负责日本与亚太地区零售伙伴合作", email: "long.account.name@example.test" } }));
        assert.equal(await page.getByText("林悦，负责日本与亚太地区零售伙伴合作", { exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), true);
      }
    }
  });
}
