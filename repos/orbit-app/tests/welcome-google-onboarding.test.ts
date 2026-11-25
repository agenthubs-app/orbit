import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Real index route, welcome page, view models and theme. Replaced: the auth session (its
// Google exchange needs the native browser), the router, and expo-router's <Redirect>,
// which replaces the page while mounted just as the real one does on focus.
const require = createRequire(import.meta.url);
let browser: Browser, script: string;
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
let revision = 0; const listeners = new Set();
const state = window.fixture = { user: null, deletionPending: false, navigation: [], requests: [], gate: "clear", result: { success: true }, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { const s = useFixture(); return { ready: true, user: s.user, deletionPending: s.deletionPending, googleEnabled: true,
  // As the provider does: the new session is published first, then the promise resolves.
  startGoogleSignIn: async payload => { s.requests.push(payload); await new Promise(resolve => s.release = resolve);
    if (s.result.success) { s.update({ user: { id: "u1" }, deletionPending: s.result.pendingDeletion === true }); await new Promise(resolve => setTimeout(resolve, 30)); }
    return s.result; } }; };
export const useOnboardingGate = () => { const s = useFixture(); return { status: s.user ? s.gate : "off" }; };
export const useRouter = () => ({ push(href) { state.navigation.push("push:" + href); }, replace(href) { state.navigation.push("replace:" + href); } });
export const Redirect = ({ href }) => { useEffect(() => { state.navigation.push("redirect:" + href); }, [href]); return null; };
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import IndexRoute from "./app/index"; createRoot(document.getElementById("root")).render(<IndexRoute />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE": "undefined", __DEV__: "false" },
    plugins: [{ name: "welcome-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|react-native-safe-area-context)$|\/(AuthSessionProvider|OnboardingGateProvider)$/ }, () => ({ path: "fixture", namespace: "welcome" }));
      plugin.onLoad({ filter: /.*/, namespace: "welcome" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(1500);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root" style="height:844px;display:flex;flex-direction:column"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, patch);
  await page.addScriptTag({ content: script });
  return page;
}
async function google(page: Page) {
  await page.getByRole("button", { name: "使用 Google 继续", exact: true }).click();
  await page.waitForFunction(() => Boolean((window as any).fixture.release));
  await page.evaluate(() => (window as any).fixture.release());
}
const navigation = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).fixture.navigation);

test("Google from the welcome page opens onboarding, as on signup; Home is never opened first", async t => {
  const page = await open(t);
  await google(page);
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  await page.waitForTimeout(50);
  assert.deepEqual(await navigation(page), ["replace:/profile/onboarding?next=%2Fhome"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.map((request: any) => ({ redirectTo: request.redirectTo, source: request.signup.source }))), [{ redirectTo: "/home", source: "direct" }]);
});

test("Google into an account being deleted opens its own page", async t => {
  const page = await open(t, { result: { success: true, pendingDeletion: true } });
  await google(page);
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  await page.waitForTimeout(50);
  assert.deepEqual(await navigation(page), ["replace:/account/pending"]);
});

test("a cancelled Google sign-in stays on the welcome page and can be tried again", async t => {
  const page = await open(t, { result: { success: false, message: "已取消 Google 登录。" } });
  await google(page);
  await page.getByText("已取消 Google 登录。", { exact: true }).waitFor();
  assert.deepEqual(await navigation(page), []);
  await page.evaluate(() => { const s = (window as any).fixture; s.release = null; s.result = { success: true }; });
  await google(page);
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["replace:/profile/onboarding?next=%2Fhome"]);
});

test("someone already signed in still goes straight to Home", async t => {
  const page = await open(t, { user: { id: "u1" } });
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["redirect:/home"]);
});

test("a cold start with unfinished onboarding opens it, not Home; nothing opens before that is known", async t => {
  const page = await open(t, { user: { id: "u1" }, gate: "unknown" });
  await page.waitForTimeout(50);
  assert.deepEqual(await navigation(page), []);
  await page.evaluate(() => (window as any).fixture.update({ gate: "required" }));
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await navigation(page), ["redirect:/profile/onboarding?next=%2Fhome"]);
});
