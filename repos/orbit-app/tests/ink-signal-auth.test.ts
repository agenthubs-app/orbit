import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
// Real form, view model, theme and RNW controls. Auth owns secure session storage,
// provider discovery and native browser exchange; replace that external boundary,
// not the form's callbacks or redirect decisions. Recovery HTTP has separate tests.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0; const listeners = new Set();
const state = window.fixture = { mode: "login", width: 390, fontScale: 1, next: "/profile", ready: true, googleEnabled: true, requests: [], navigation: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
async function action(name, payload) { state.requests.push({ name, payload }); if (state.hold) await new Promise(resolve => state.release = resolve); return state.cancel ? { success: false, message: "已取消 Google 登录。" } : state.failure ? { success: false, message: "登录未完成，请重试。", error: { message: "登录未完成，请重试。" } } : { success: true, status: 202, data: { message: "申请已受理，请查看邮箱。" } }; }
export const useOrbitAuthSession = () => { useFixture(); return { ready: state.ready, signedIn: false, user: null, cookieHeader: "", googleEnabled: state.googleEnabled, signIn: payload => action("signIn", payload), register: payload => action("register", payload), startGoogleSignIn: payload => action("google", payload) }; };
const client = { post: (path, options) => action(path, options.body) };
export const useOrbitApiClient = () => client;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const useRouter = () => ({ canGoBack: () => state.canGoBack === true, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const useLocalSearchParams = () => ({ next: state.next, email: state.email || "", created: state.created });
export const usePathname = () => "/account/login";
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0, paddingBottom: edges?.includes("bottom") ? 24 : 0 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { AccountAuthScreen } from "./src/screens/profile/AccountAuthScreen"; function App() { const s = useFixture(); return <AccountAuthScreen mode={s.mode} />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "auth-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-auth" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|useOrbitApiClient|ApiBaseUrlProvider)$/ }, () => ({ path: "fixture", namespace: "ink-auth" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-auth" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
export const TextInput = props => { const s = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return <RealInput {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
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
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function navigation(page: Page) { return page.evaluate(() => (window as any).fixture.navigation); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-auth-${name}.png`, fullPage: true }); }
async function fill(page: Page) { await page.getByRole("textbox", { name: "邮箱", exact: true }).fill("cheng.chuan@example.test"); await page.locator("input[type=password]").fill("fixture8"); }

test("login presents open underlined credentials and password-adjacent recovery", async t => {
  const page = await open(t); await fill(page);
  const email = page.getByRole("textbox", { name: "邮箱", exact: true });
  assert.equal((await email.boundingBox())!.x, 24, "open fields align with the 24pt hero inset");
  const shell = email.locator("..");
  assert.equal(await shell.evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  // Chromium rounds the declared 1.5px border to a whole CSS pixel here.
  assert.equal(await shell.evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
  const heading = page.getByRole("heading", { name: "欢迎回来", exact: true });
  assert.equal(await heading.evaluate(el => getComputedStyle(el).fontSize), "34px");
  assert.equal(await page.getByText("登录你的账号，继续高效连接。", { exact: true }).evaluate(el => getComputedStyle(el).color), "rgb(107, 114, 128)");
  const primary = page.getByRole("button", { name: "登录", exact: true });
  const forgot = page.getByRole("link", { name: "忘记密码", exact: true });
  assert.ok((await forgot.boundingBox())!.y < (await primary.boundingBox())!.y, "recovery stays next to the password before submit");
  assert.equal((await primary.boundingBox())!.height, 50);
  assert.equal((await primary.boundingBox())!.x, (await shell.boundingBox())!.x);
  assert.equal((await primary.boundingBox())!.width, (await shell.boundingBox())!.width, "primary action spans the full credential area");
  assert.equal((await page.getByRole("button", { name: "使用 Google 登录", exact: true }).boundingBox())!.height, 50);
  const signup = page.getByRole("button", { name: "还没有账号，创建账号", exact: true });
  assert.ok((await signup.boundingBox())!.y > 740, "signup is anchored near the bottom on a normal screen");
  await email.focus();
  assert.equal(await email.evaluate(el => getComputedStyle(el).outlineWidth), "0px", "underline is the focus indicator, not a second box");
  assert.notEqual(await email.evaluate(el => getComputedStyle(el).outlineStyle), "auto", "browser auto focus rings can ignore a zero outline width");
  assert.equal(await shell.evaluate(el => getComputedStyle(el).borderBottomColor), "rgb(11, 18, 32)");
  assert.deepEqual(await requests(page), []); await shot(page, "login");
});

for (const canGoBack of [false, true]) test(`close uses ${canGoBack ? "history" : "public account"} without authentication`, async t => {
  const page = await open(t, { canGoBack, next: "/tasks/private" });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  assert.deepEqual(await navigation(page), [canGoBack ? "back" : "/account"]); assert.deepEqual(await requests(page), []);
});

for (const mode of ["login", "signup"] as const) test(`${mode} keeps real payload, busy/failure draft and safe success navigation`, async t => {
  const page = await open(t, { mode, hold: true, failure: true }); await fill(page);
  const primary = page.getByRole("button", { name: mode === "login" ? "登录" : "创建账号", exact: true });
  await primary.click(); assert.equal(await primary.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "使用 Google 登录", exact: true }).isDisabled(), true);
  await page.evaluate(() => { (window as any).fixture.update({ hold: false }); (window as any).fixture.release(); });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "邮箱", exact: true }).inputValue(), "cheng.chuan@example.test");
  assert.equal(await page.locator("input[type=password]").inputValue(), "fixture8");
  assert.deepEqual(await navigation(page), []); await shot(page, `${mode}-error`);
  await page.getByRole("button", { name: "显示密码", exact: true }).click(); assert.equal(await page.locator("input[type=password]").count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ failure: false })); await primary.click();
  assert.deepEqual((await requests(page))[0], { name: mode === "login" ? "signIn" : "register", payload: { email: "cheng.chuan@example.test", password: "fixture8", ...(mode === "login" ? { redirectTo: "/profile" } : {}) } });
  assert.deepEqual(await navigation(page), [mode === "login" ? "/profile" : "/account/login?created=1&email=cheng.chuan%40example.test&next=%2Fprofile"]);
});

test("provider availability, cancellation and unsafe next remain truthful", async t => {
  const page = await open(t, { googleEnabled: false, next: "https://untrusted.test", cancel: true });
  assert.equal(await page.getByRole("button", { name: "使用 Google 登录", exact: true }).count(), 0);
  assert.equal(await page.getByText("或", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ googleEnabled: true, ready: false }));
  const google = page.getByRole("button", { name: "使用 Google 登录", exact: true });
  assert.equal(await google.isDisabled(), true); assert.deepEqual(await requests(page), []);
  await page.evaluate(() => (window as any).fixture.update({ ready: true })); await google.click();
  await page.getByText("已取消 Google 登录。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0); assert.deepEqual(await navigation(page), []);
  assert.deepEqual(await requests(page), [{ name: "google", payload: { redirectTo: "/dashboard" } }]);
});

test("recovery and registration links preserve next without implicit writes", async t => {
  const page = await open(t);
  await page.getByRole("link", { name: "忘记密码", exact: true }).click();
  await page.getByRole("button", { name: "还没有账号，创建账号", exact: true }).click();
  assert.deepEqual(await navigation(page), ["/account/forgot-password?next=%2Fprofile", "/account/signup?next=%2Fprofile"]);
  assert.deepEqual(await requests(page), []);
  const forgot = await open(t, { mode: "forgot" });
  assert.equal(await forgot.getByRole("textbox").count(), 1);
  assert.equal(await forgot.locator("input[type=password]").count(), 0);
  await forgot.getByRole("textbox", { name: "邮箱", exact: true }).fill(" account@example.test ");
  await forgot.getByRole("button", { name: "发送重置链接", exact: true }).click();
  assert.deepEqual(await requests(forgot), [{ name: "/api/auth/password-reset/request", payload: { email: "account@example.test" } }]);
  await forgot.getByText("申请已受理，请查看邮箱。", { exact: true }).waitFor(); await shot(forgot, "forgot");
});

test("double-size signup has a short complete action title", async t => {
  const page = await open(t, { mode: "signup", width: 320, fontScale: 2 });
  await page.getByRole("heading", { name: "创建账号", exact: true }).waitFor();
});

test("double-size Google label keeps a complete action word", async t => {
  const page = await open(t, { mode: "signup", width: 320, fontScale: 2 });
  const google = page.getByRole("button", { name: "使用 Google 登录", exact: true });
  const label = google.locator('[dir="auto"]').last();
  assert.equal(await label.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode; const offset = node.textContent?.indexOf("登录") ?? -1;
      if (offset < 0) continue;
      const first = document.createRange(), last = document.createRange();
      first.setStart(node, offset); first.setEnd(node, offset + 1);
      last.setStart(node, offset + 1); last.setEnd(node, offset + 2);
      return Math.abs(first.getBoundingClientRect().y - last.getBoundingClientRect().y) < 1;
    }
    return false;
  }), true, "登录 must not split into an isolated 录 line");
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: all auth modes remain readable and controls reachable`, async t => {
    for (const mode of ["login", "signup", "forgot"]) {
      const page = await open(t, { ...variant, mode });
      assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
      for (const control of [...await page.getByRole("button").all(), ...await page.getByRole("link").all()]) {
        await control.scrollIntoViewIfNeeded(); const b = (await control.boundingBox())!;
        assert.ok(b.height >= 44 && b.width >= 44 && b.x >= 0 && b.x + b.width <= variant.width + 0.1);
        assert.ok(b.y >= 48 && b.y + b.height <= 820.1, "controls remain in the safe scroll viewport");
      }
      await shot(page, `${variant.name}-${mode}-bottom`);
      await page.evaluate(() => document.querySelectorAll("*").forEach(el => {
        if (el.scrollHeight > el.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY)) el.scrollTop = 0;
      }));
      await shot(page, `${variant.name}-${mode}`);
      assert.deepEqual(await requests(page), []);
    }
  });
}
