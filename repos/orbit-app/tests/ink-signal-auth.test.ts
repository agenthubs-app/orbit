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
export const useOrbitAuthSession = () => { useFixture(); return { ready: state.ready, signedIn: false, user: null, cookieHeader: "", googleEnabled: state.googleEnabled, signIn: payload => action("signIn", payload), register: payload => action("register", payload).then(result => result.success && state.mailSentTo ? { ...result, mailSentTo: state.mailSentTo } : result), startGoogleSignIn: payload => action("google", payload) }; };
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
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { AccountAuthScreen } from "./src/screens/profile/AccountAuthScreen"; function App() { const s = useFixture(); return <AccountAuthScreen key={s.remount || 0} mode={s.mode} />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "auth-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-auth" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|useOrbitApiClient|ApiBaseUrlProvider)$/ }, () => ({ path: "fixture", namespace: "ink-auth" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-auth" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Text = props => { const s = StyleSheet.flatten(props.style) || {}, scale = props.allowFontScaling === false ? 1 : useFixture().fontScale; return <RealText {...props} style={[props.style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]} />; };
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
  await page.evaluate(() => { const real = window.fetch; (window as any).funnel = []; window.fetch = (input, init) => { if (String(input).endsWith("/api/auth/signup-funnel")) (window as any).funnel.push(init!.body); return real(input, init); }; });
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function navigation(page: Page) { return page.evaluate(() => (window as any).fixture.navigation); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-auth-${name}.png`, fullPage: true }); }
/** 同意勾选：注册必须先勾。 */
async function agree(page: Page) { await page.getByRole("checkbox", { name: "同意使用条款和隐私政策", exact: true }).click(); }
/** The visitor id of the sign-up funnel is random per device: checked to be there, then left out. */
async function payloads(page: Page) {
  return page.evaluate(() => (window as any).fixture.requests.map((request: any) => {
    const { visitorId, signup, ...payload } = request.payload;
    return { ...request, payload: { ...payload, ...(signup ? { signup: { source: signup.source } } : {}) } };
  }));
}
async function fill(page: Page) { await page.getByRole("textbox", { name: "邮箱", exact: true }).fill("cheng.chuan@example.test"); await page.locator("input[type=password]").fill("fixture8"); }

test("login presents labelled credentials, recovery and reachable actions", async t => {
  const page = await open(t); await fill(page);
  const email = page.getByRole("textbox", { name: "邮箱", exact: true });
  assert.ok((await email.boundingBox())!.x >= 36, "fields remain within the public page gutter");
  const shell = email.locator("..");
  assert.equal(await shell.evaluate(el => getComputedStyle(el).borderTopWidth), "1px");
  assert.equal(await shell.evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
  const heading = page.getByRole("heading", { name: "欢迎回来", exact: true });
  assert.equal(await heading.evaluate(el => getComputedStyle(el).fontSize), "24px"); // UX-1 type scale (kit 22)
  assert.equal(await page.getByText("登录你的账号，继续高效连接。", { exact: true }).evaluate(el => getComputedStyle(el).color), "rgb(94, 88, 102)");
  const primary = page.getByRole("button", { name: "登录", exact: true });
  const forgot = page.getByRole("link", { name: "忘记密码", exact: true });
  assert.ok((await forgot.boundingBox())!.y > (await primary.boundingBox())!.y, "recovery stays reachable below submit");
  assert.ok((await primary.boundingBox())!.height >= 44);
  assert.equal((await primary.boundingBox())!.x, (await shell.boundingBox())!.x);
  assert.equal((await primary.boundingBox())!.width, (await shell.boundingBox())!.width, "primary action spans the credential area");
  assert.ok((await page.getByRole("button", { name: "使用 Google 登录", exact: true }).boundingBox())!.height >= 44);
  const signup = page.getByRole("button", { name: /还没有账号/ });
  assert.ok((await signup.boundingBox())!.y > (await primary.boundingBox())!.y);
  await email.focus();
  assert.equal(await email.evaluate(el => getComputedStyle(el).outlineWidth), "0px", "underline is the focus indicator, not a second box");
  assert.notEqual(await email.evaluate(el => getComputedStyle(el).outlineStyle), "auto", "browser auto focus rings can ignore a zero outline width");
  assert.ok((await shell.evaluate(el => getComputedStyle(el).borderBottomColor)).startsWith("rgb("));
  assert.deepEqual(await requests(page), []); await shot(page, "login");
});

for (const canGoBack of [false, true]) test(`back uses ${canGoBack ? "history" : "public landing"} without authentication`, async t => {
  const page = await open(t, { canGoBack, next: "/tasks/private" });
  await page.getByRole("button", { name: "返回", exact: true }).click();
  assert.deepEqual(await navigation(page), [canGoBack ? "back" : "/"]); assert.deepEqual(await requests(page), []);
});

for (const mode of ["login", "signup"] as const) test(`${mode} keeps real payload, busy/failure draft and safe success navigation`, async t => {
  const page = await open(t, { mode, hold: true, failure: true }); await fill(page);
  if (mode === "signup") await agree(page);
  const primary = page.getByRole("button", { name: mode === "login" ? "登录" : "创建账号", exact: true });
  await primary.click(); assert.equal(await primary.isDisabled(), true);
  await page.waitForFunction(() => Boolean((window as any).fixture.release));
  assert.equal(await page.getByRole("button", { name: "使用 Google 登录", exact: true }).isDisabled(), true);
  await page.evaluate(() => { (window as any).fixture.update({ hold: false }); (window as any).fixture.release(); });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "邮箱", exact: true }).inputValue(), "cheng.chuan@example.test");
  assert.equal(await page.locator("input[type=password]").inputValue(), "fixture8");
  assert.deepEqual(await navigation(page), []); await shot(page, `${mode}-error`);
  await page.getByRole("button", { name: "显示密码", exact: true }).click(); assert.equal(await page.locator("input[type=password]").count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ failure: false })); await primary.click();
  assert.deepEqual((await payloads(page))[0], { name: mode === "login" ? "signIn" : "register", payload: { email: "cheng.chuan@example.test", password: "fixture8", ...(mode === "login" ? { redirectTo: "/profile" } : { language: "zh", source: "direct" }) } });
  // Login now reads /api/auth/password/status first (aborted here → never blocks sign-in), so the move is async.
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fprofile"]);
});

async function answerPasswordStatus(page: Page, body: unknown, status = 200) {
  const seen: string[] = [];
  await page.route("https://orbit.test/api/auth/password/status", route => {
    seen.push(`${route.request().method()} ${route.request().url()}`);
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "null", "access-control-allow-credentials": "true" }, body: JSON.stringify(body) });
  });
  return seen;
}

test("email + password login of an account marked mustChangePassword goes to change the password first, keeping next", async t => {
  const page = await open(t, { next: "/events/event-1?tab=details" });
  const seen = await answerPasswordStatus(page, { mustChangePassword: true });
  await fill(page);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["/account/change-password?next=%2Fevents%2Fevent-1%3Ftab%3Ddetails&first=1"]);
  assert.deepEqual(seen, ["GET https://orbit.test/api/auth/password/status"]);
});

test("login carries on as before when the account is not marked or the status cannot be read", async t => {
  for (const [body, status] of [[{ mustChangePassword: false }, 200], [{ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "x" } }, 503]] as const) {
    const page = await open(t);
    await answerPasswordStatus(page, body, status);
    await fill(page);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
    assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fprofile"]);
  }
});

test("Google login does not read the password status", async t => {
  const page = await open(t);
  const seen = await answerPasswordStatus(page, { mustChangePassword: true });
  await page.getByRole("button", { name: "使用 Google 登录", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fprofile"]);
  assert.deepEqual(seen, []);
});

test("a pasted login password loses surrounding spaces; typed spaces stay", async t => {
  const page = await open(t);
  const password = page.locator("input[type=password]");
  await password.fill("  pasted-secret \n");
  assert.equal(await password.inputValue(), "pasted-secret");
  await password.fill("");
  await password.pressSequentially("ab ");
  assert.equal(await password.inputValue(), "ab ");
});

test("Google login enters profile completion while preserving the safe return target", async t => {
  const page = await open(t, { next: "/events/event-1?tab=details" });
  await page.getByRole("button", { name: "使用 Google 登录", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await payloads(page), [{ name: "google", payload: { redirectTo: "/events/event-1?tab=details", signup: { source: "event" } } }]);
  assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fevents%2Fevent-1%3Ftab%3Ddetails"]);
});

test("Google signup enters profile completion instead of returning an authenticated user to login", async t => {
  const page = await open(t, { mode: "signup", next: "/events/event-1?tab=details" });
  await page.getByRole("button", { name: "使用 Google 登录", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await payloads(page), [{ name: "google", payload: { redirectTo: "/events/event-1?tab=details", signup: { source: "event" } } }]);
  assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fevents%2Fevent-1%3Ftab%3Ddetails"]);
});

test("signup always offers sign-in for an existing account, keeping next and the typed email", async t => {
  const page = await open(t, { mode: "signup", next: "/events/event-1?tab=details" });
  const toLogin = page.getByRole("button", { name: "已有账号，去登录", exact: true });
  assert.equal(await toLogin.textContent(), "已有账号？ 登录");
  assert.ok((await toLogin.boundingBox())!.y > (await page.getByRole("button", { name: "创建账号", exact: true }).boundingBox())!.y);
  await page.getByRole("textbox", { name: "邮箱", exact: true }).fill("cheng.chuan@example.test");
  await toLogin.click();
  assert.deepEqual(await navigation(page), ["/account/login?next=%2Fevents%2Fevent-1%3Ftab%3Ddetails"], "no email in the URL");
  assert.deepEqual(await requests(page), []);
  await page.evaluate(() => (window as any).fixture.update({ remount: 1, mode: "login" }));
  await page.getByRole("heading", { name: "欢迎回来", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "邮箱", exact: true }).inputValue(), "cheng.chuan@example.test");
  assert.equal(await page.locator("input[type=password]").inputValue(), "", "the password is not carried over");
  // …and back again.
  await page.getByRole("textbox", { name: "邮箱", exact: true }).fill("other@example.test");
  await page.getByRole("button", { name: "还没有账号，创建账号", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.update({ remount: 2, mode: "signup" }));
  await page.getByRole("heading", { name: "创建账号", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "邮箱", exact: true }).inputValue(), "other@example.test");
});

test("signup shows each problem on its own field, sends nothing, and clears it on typing", async t => {
  const page = await open(t, { mode: "signup" });
  await agree(page);
  const email = page.getByRole("textbox", { name: "邮箱", exact: true }), password = page.locator("input[type=password]");
  const submit = page.getByRole("button", { name: "创建账号", exact: true });
  await email.fill("name@host"); await password.fill("short7!"); await submit.click();
  assert.deepEqual(await page.getByRole("alert").allTextContents(), ["请输入有效的邮箱地址。", "密码至少8位。"]);
  const alerts = page.getByRole("alert");
  assert.ok((await alerts.nth(0).boundingBox())!.y > (await email.boundingBox())!.y && (await alerts.nth(0).boundingBox())!.y < (await password.boundingBox())!.y, "the email problem sits between the two fields");
  assert.equal(await email.evaluate(el => el === document.activeElement), true, "focus goes to the first problem");
  assert.notEqual(await email.locator("..").evaluate(el => getComputedStyle(el).backgroundColor), await page.evaluate(() => "rgba(0, 0, 0, 0)"));
  await shot(page, "signup-field-errors");
  await email.fill("name@host.test");
  assert.deepEqual(await page.getByRole("alert").allTextContents(), ["密码至少8位。"]);
  await submit.click();
  assert.equal(await password.evaluate(el => el === document.activeElement), true);
  await password.fill("界".repeat(25)); await submit.click();
  assert.deepEqual(await page.getByRole("alert").allTextContents(), ["密码不能超过72个UTF-8字节。"]);
  assert.deepEqual(await requests(page), []);
  await password.fill("fixture8"); await submit.click();
  await page.waitForFunction(() => (window as any).fixture.requests.length > 0);
  assert.deepEqual((await payloads(page))[0], { name: "register", payload: { email: "name@host.test", password: "fixture8", language: "zh", source: "direct" } });
});

test("login keeps the server's word on the email and shows a short password on its field", async t => {
  const page = await open(t);
  await page.getByRole("textbox", { name: "邮箱", exact: true }).fill("name@host");
  await page.locator("input[type=password]").fill("short");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  assert.deepEqual(await page.getByRole("alert").allTextContents(), ["密码至少8位。"]);
});

test("signup's 「至少 8 位」 is met as soon as the password is long enough", async t => {
  const page = await open(t, { mode: "signup" });
  const hint = page.getByText("至少 8 位", { exact: true }), password = page.locator("input[type=password]");
  const look = () => hint.evaluate(el => ({ color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight, check: el.parentElement!.querySelectorAll("svg").length }));
  const before = await look();
  assert.equal(before.check, 0);
  await password.fill("1234567"); assert.deepEqual(await look(), before);
  await password.fill("12345678");
  assert.deepEqual(await look(), { color: "rgb(68, 115, 97)", weight: "700", check: 1 });
  await shot(page, "signup-helper-met");
  await password.fill("1234567"); assert.deepEqual(await look(), before);
});

test("Enter on the email moves to the password, Enter on the password submits; autofill knows a new password", async t => {
  const page = await open(t, { mode: "signup" });
  const email = page.getByRole("textbox", { name: "邮箱", exact: true }), password = page.locator("input[type=password]");
  assert.equal(await email.getAttribute("enterkeyhint"), "next");
  assert.equal(await password.getAttribute("enterkeyhint"), "go");
  assert.equal(await password.getAttribute("autocomplete"), "new-password");
  await agree(page);
  await email.fill("name@host.test"); await email.press("Enter");
  assert.equal(await password.evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await requests(page), []);
  await password.fill("fixture8"); await password.press("Enter");
  await page.waitForFunction(() => (window as any).fixture.requests.length > 0);
  assert.deepEqual((await payloads(page))[0], { name: "register", payload: { email: "name@host.test", password: "fixture8", language: "zh", source: "direct" } });
  const login = await open(t);
  assert.equal(await login.locator("input[type=password]").getAttribute("autocomplete"), "password");
});

for (const action of ["password", "google"] as const) test(`obsolete ${action} login cannot navigate a replacement auth scope`, async t => {
  const page = await open(t, { hold: true });
  if (action === "password") {
    await fill(page);
    await page.getByRole("button", { name: "登录", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "使用 Google 登录", exact: true }).click();
  }
  await page.waitForFunction(() => Boolean((window as any).fixture.release));
  await page.evaluate(() => (window as any).fixture.update({ mode: "signup" }));
  await page.getByRole("heading", { name: "创建账号", exact: true }).waitFor();
  await page.evaluate(() => { const s = (window as any).fixture; s.update({ hold: false }); s.release(); });
  await page.waitForTimeout(20);
  assert.deepEqual(await navigation(page), []);
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
  assert.deepEqual(await payloads(page), [{ name: "google", payload: { redirectTo: "/home", signup: { source: "direct" } } }]);
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
  await forgot.getByRole("button", { name: "申请重置密码", exact: true }).click();
  assert.deepEqual(await requests(forgot), [{ name: "/api/auth/password-reset/request", payload: { email: "account@example.test" } }]);
  await forgot.getByText("已受理。如果该地址已注册，你会收到邮件。", { exact: true }).waitFor(); await shot(forgot, "forgot");
});

test("signup opens public legal pages without submitting or clearing the draft", async t => {
  const page = await open(t, { mode: "signup", next: "/i/invite-123" });
  await fill(page);
  // The same two links twice: under the Google button and in the checkbox's sentence. A link never ticks the box.
  for (const index of [0, 1]) for (const name of ["使用条款", "隐私政策"]) await page.getByRole("link", { name, exact: true }).nth(index).click();
  assert.deepEqual(await navigation(page), ["/legal/terms", "/legal/privacy", "/legal/terms", "/legal/privacy"]);
  assert.equal(await page.getByRole("checkbox").locator("svg").count(), 0);
  assert.deepEqual(await requests(page), []);
  assert.equal(await page.getByRole("textbox", { name: "邮箱", exact: true }).inputValue(), "cheng.chuan@example.test");
  assert.equal(await page.locator("input[type=password]").inputValue(), "fixture8");
  // Login: only Google can create an account there, so only its line.
  const login = await open(t);
  assert.equal(await login.getByRole("link", { name: "使用条款", exact: true }).count(), 1);
  assert.equal(await login.getByRole("checkbox").count(), 0);
  const plain = await open(t, { googleEnabled: false });
  assert.equal(await plain.getByRole("link", { name: "使用条款", exact: true }).count(), 0);
});

test("signup without the tick sends nothing and says why; the words tick it; no tick once ticked complains again", async t => {
  const page = await open(t, { mode: "signup" }); await fill(page);
  const submit = page.getByRole("button", { name: "创建账号", exact: true }), box = page.getByRole("checkbox");
  await submit.click();
  assert.deepEqual(await page.getByRole("alert").allTextContents(), ["请先勾选同意使用条款和隐私政策。"]);
  assert.deepEqual(await requests(page), []);
  await page.getByText(/^同意/u).last().click({ position: { x: 4, y: 10 } });
  assert.equal(await box.locator("svg").count(), 1);
  assert.equal(await page.getByRole("alert").count(), 0);
  await submit.click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.equal((await payloads(page))[0].name, "register");
});

test("signup with a mail on its way: one popup that only its button closes, then the same next page", async t => {
  const page = await open(t, { mode: "signup", next: "/i/ABCD-EFGH", mailSentTo: "cheng.chuan@example.test" }); await fill(page); await agree(page);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  const dialog = page.getByTestId("mail-sent-dialog");
  await dialog.waitFor();
  assert.match((await dialog.textContent())!, /确认邮件已发送.*cheng\.chuan@example\.test.*请打开邮件，点里面的链接完成认证。.*知道了/su);
  await page.mouse.click(10, 10);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 1);
  assert.deepEqual(await navigation(page), []);
  await shot(page, "signup-mail-sent");
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  assert.deepEqual(await navigation(page), ["/profile/onboarding?next=%2Fi%2FABCD-EFGH"]);
  const seen = (await requests(page))[0].payload;
  assert.equal(seen.source, "invite");
});

test("the sign-up page reports that it was opened, once, with no personal data; the login page reports nothing", async t => {
  const sent: string[] = [];
  const opened = async (patch: Record<string, unknown>) => {
    const page = await open(t, { ...patch, hold: true });
    await page.waitForTimeout(150);
    return page;
  };
  for (const mode of ["signup", "login"]) {
    const page = await opened({ mode, next: "/events/event-1?tab=details" });
    sent.push(...await page.evaluate(() => (window as any).funnel ?? []));
  }
  assert.equal(sent.length, 1);
  const { visitorId, ...body } = JSON.parse(sent[0]!);
  assert.deepEqual(body, { name: "register_opened", client: "app", source: "event" });
  assert.ok(visitorId === undefined || /^[0-9a-f-]{36}$/u.test(visitorId));
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
        // Links inside a sentence (WCAG 2.5.8's inline exception): the words around them are not targets.
        if (["使用条款", "隐私政策"].includes((await control.textContent())!)) continue;
        assert.ok(b.height >= 44 && b.width >= 44 && b.x >= 0 && b.x + b.width <= variant.width + 0.5, `${mode}: ${await control.getAttribute("aria-label") ?? await control.textContent()} ${JSON.stringify(b)}`);
        assert.ok(b.y >= 48 && b.y + b.height <= 820.5, `controls remain in the safe scroll viewport: ${mode} ${await control.textContent()} ${JSON.stringify(b)}`);
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
