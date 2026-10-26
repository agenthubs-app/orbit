import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

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
const discoveryData = () => { const at="2026-09-16T00:00:00.000Z";return {preferences:{actorId:state.user.id,enabled:state.discoveryEnabled??false,messageAnalysisEnabled:state.discoveryMessages??false,timeZone:"Asia/Tokyo",language:"zh",revision:state.discoveryRevision??1,generation:1,enabledSince:at,messageEnabledSince:at,updatedAt:at},lastRoundAt:at,lastError:null,counts:{},sources:{email:"unavailable",calendar:"unavailable"}}; };
const client = {get:async()=>state.discovery?{success:true,status:200,data:discoveryData()}:{success:false,status:404},post:async(path,options)=>{state.discoveryRequests??=[];state.discoveryRequests.push(options.body);const captured=discoveryData();const body=options.body;const result={...captured,preferences:{...captured.preferences,...(body.enabled===undefined?{}:{enabled:body.enabled}),...(body.messageAnalysisEnabled===undefined?{}:{messageAnalysisEnabled:body.messageAnalysisEnabled}),revision:captured.preferences.revision+1}};if(state.holdDiscovery)return new Promise(resolve=>state.discoveryReply=()=>resolve({success:true,status:200,data:result}));state.discoveryEnabled=result.preferences.enabled;state.discoveryMessages=result.preferences.messageAnalysisEnabled;state.discoveryRevision=result.preferences.revision;return {success:true,status:200,data:result};}};
export const useOrbitApiClient = () => client;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const useApiResource = () => { useFixture(); return { kind: state.kind, data: state.data, error: { message: "账号读取失败，请重试。" }, refreshing: false, refresh() { state.refreshes++; } }; };
export const useIsFocused = () => true;
export const randomUUID = () => "scope-" + Math.random();
export const useRouter = () => ({ canGoBack: () => false, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const usePathname = () => state.screen === "account" ? "/account" : "/settings";
export const useLocalSearchParams = () => ({});
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0 }]} />;
export const useSafeAreaInsets = () => ({ top: 48, right: 0, bottom: 0, left: 0 });
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
export const isPushNotificationsOptedIn = async () => { if (state.holdRead) await new Promise(resolve => state.releaseRead = resolve); return state.optedIn; };
export const setPushNotificationsOptIn = async enabled => { state.calls.push("opt-in:" + enabled); state.optedIn = enabled; };
export const revokeRegisteredPushDevice = async input => { state.calls.push("revoke-device"); state.revocationUsesClient = input.client === client; if (state.hold) await new Promise(resolve => state.release = resolve); return !state.revokeFailure; };
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { NotificationDiscoverySettings } from "./src/screens/settings/NotificationDiscoverySettings"; import { AccountScreen } from "./src/screens/profile/AccountScreen"; function App() { const s = useFixture(); return s.screen === "account" ? <AccountScreen /> : <NotificationDiscoverySettings />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "settings-account-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-settings" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|useOrbitApiClient|ApiBaseUrlProvider|useApiResource|native-notifications|push-device-session)$/ }, () => ({ path: "fixture", namespace: "ink-settings" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-settings" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }, nativeUiStubs] });
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
  await page.addScriptTag({ content: script });
  try { await page.getByRole("heading").first().waitFor(); }
  catch (error) { throw new Error(`Settings fixture did not render: ${errors.join(" | ") || "no page error"}`, { cause: error }); }
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function calls(page: Page) { return page.evaluate(() => (window as any).fixture.calls); }
async function navigation(page: Page) { return page.evaluate(() => (window as any).fixture.navigation); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-settings-account-${name}.png`, fullPage: true }); }





test("account shows open verified identity and only the actual workspace", async t => {
  const page = await open(t, { screen: "account" });
  const name = page.getByText("程川", { exact: true }).first();
  assert.equal(await name.evaluate(el => getComputedStyle(el).fontSize), "17px") // UX-1 type scale (kit 15);
  await page.getByText("cheng.chuan@example.test", { exact: true }).waitFor();
  const initial = page.getByText("程", { exact: true }).locator("..");
  assert.equal((await initial.boundingBox())!.width, 40); assert.equal((await initial.boundingBox())!.height, 40);
  for (const text of ["工作区", "连接目标", "数据", "权限中心", "退出登录", "东京时间", "认识日本市场的长期合作伙伴。", "已登录"]) assert.ok(await page.getByText(text, { exact: true }).count(), text);
  assert.ok(await page.getByText(/星野工作室/).count());
  assert.equal(await page.getByRole("button", { name: /新建|邀请成员|个人空间/ }).count(), 0);
  assert.equal(await page.getByText(/管理员|位成员/).count(), 0);
  assert.equal(await page.getByText(/登录中の端末|登录中的设备|パスワード/).count(), 0);
  assert.deepEqual(await calls(page), []); await shot(page, "account");
});

test("account links use existing destinations and sign-out failure remains visible", async t => {
  const page = await open(t, { screen: "account", logoutFailure: true });
  for (const name of [/^修改个人资料/, /^服务器设置/, /^权限中心/]) await page.getByRole("button", { name }).click();
  assert.deepEqual(await navigation(page), ["/profile/edit", "/settings/api", "/account/permissions"]); assert.deepEqual(await calls(page), []);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByText("退出未完成，请重试。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 0); await shot(page, "account-error");
  await page.evaluate(() => (window as any).fixture.update({ logoutFailure: false }));
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 1);
  assert.equal(await page.getByText("退出未完成，请重试。", { exact: true }).count(), 0);
  assert.deepEqual(await calls(page), ["sign-out", "sign-out"]);
  assert.deepEqual((await navigation(page)).slice(3), ["/account/login"], "only a finished sign-out resets to login");
});

test("account guest and resource failures never show stale private identity", async t => {
  const page = await open(t, { screen: "account", signedIn: false });
  for (const kind of ["loading", "failure", "offline", "success"]) {
    await page.evaluate(kind => (window as any).fixture.update({ kind }), kind);
    assert.equal(await page.getByText(/星野工作室|cheng.chuan|程川/).count(), 0);
    assert.equal(await page.getByRole("button", { name: /权限中心|退出登录|修改个人资料/ }).count(), 0);
    const server = page.getByRole("button", { name: /^服务器设置/ });
    assert.equal(await server.isEnabled(), true);
    assert.ok((await server.boundingBox())!.y >= 0, "guests can reach server settings in every resource state");
  }
  await shot(page, "account-guest");
  for (const name of [/^服务器设置/, /^登录$/, /^创建账号$/]) await page.getByRole("button", { name }).click();
  assert.deepEqual(await navigation(page), ["/settings/api", "/account/login", "/account/signup"]);
  await page.evaluate(() => (window as any).fixture.update({ signedIn: true, kind: "failure" }));
  await page.getByText("账号读取失败，请重试。", { exact: true }).waitFor();
  assert.equal(await page.getByText(/星野工作室|cheng.chuan|程川/).count(), 0);
  assert.deepEqual(await calls(page), []);
});

test("double-size account email retains a readable column instead of squeezing beside edit", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 1.7 });
  const email = page.getByText("cheng.chuan@example.test", { exact: true });
  assert.ok((await email.boundingBox())!.x >= 0);
  assert.ok((await email.boundingBox())!.x + (await email.boundingBox())!.width <= 320.1, "email stays within the viewport");
  assert.ok(await email.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "email remains readable");
});

test("large account metadata uses one readable column", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 1.35 });
  assert.ok((await page.getByText(/星野工作室/).last().boundingBox())!.width > 0);
});

test("double-size account header remains inside the viewport", async t => {
  const page = await open(t, { screen: "account", width: 320, fontScale: 1.7 });
  assert.ok((await page.getByRole("heading").first().boundingBox())!.width <= 320);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.35 }, { name: "narrow-double", width: 320, fontScale: 1.7 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: account text is complete and controls reachable`, async t => {
    for (const screen of ["account"]) {
      const page = await open(t, { ...variant, screen });
      assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
      assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => { const b = n.getBoundingClientRect(); return b.left < -0.1 || b.right > window.innerWidth + 0.1; }).map(n => n.textContent)), [], "text must fit the screen, not merely its overflowing parent");
      await shot(page, `${variant.name}-${screen}`);
      for (const control of await page.getByRole("button").all()) {
        await control.scrollIntoViewIfNeeded(); const b = (await control.boundingBox())!;
        assert.ok(b.height >= 44 && b.width >= 44 && b.x >= 0 && b.x + b.width <= variant.width + 0.1, `control fits ${JSON.stringify(b)}`);
        assert.ok(b.y >= 48 && b.y + b.height <= 845, `controls remain in scroll viewport ${JSON.stringify(b)} ${await control.textContent()}`);
      }
      await page.evaluate(() => document.querySelectorAll("*").forEach(el => {
        if (el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
      }));
      await shot(page, `${variant.name}-${screen}-bottom`);
      assert.deepEqual(await calls(page), []);
      if (screen === "account") {
        await page.evaluate(() => (window as any).fixture.update({ user: { id: "actor:1", name: "林悦，负责日本与亚太地区零售伙伴合作", email: "long.account.name@example.test" } }));
        assert.ok(await page.getByText("林悦，负责日本与亚太地区零售伙伴合作", { exact: true }).first().isVisible());
      }
    }
  });
}

test("discovery toggles are persisted independently and a late old-account receipt cannot overwrite the new account",async t=>{const page=await open(t,{discovery:true});const ai=page.getByRole('switch',{name:'自主发现',exact:true}),messages=page.getByRole('switch',{name:'分析联系人消息',exact:true});await ai.waitFor();assert.equal(await ai.getAttribute('aria-checked'),'false');await ai.click();await page.waitForFunction(()=>(window as any).fixture.discoveryRequests?.length===1);assert.equal(await ai.getAttribute('aria-checked'),'true');assert.equal(await messages.getAttribute('aria-checked'),'false');await page.evaluate(()=>(window as any).fixture.holdDiscovery=true);await messages.click();await page.waitForFunction(()=>!!(window as any).fixture.discoveryReply);await page.evaluate(()=>(window as any).fixture.update({user:{id:'actor:2',name:'新账号',email:'two@example.test'},discoveryEnabled:false,discoveryMessages:false}));await ai.waitFor();await page.evaluate(()=>(window as any).fixture.discoveryReply());assert.equal(await ai.getAttribute('aria-checked'),'false');assert.equal(await messages.getAttribute('aria-checked'),'false');});
