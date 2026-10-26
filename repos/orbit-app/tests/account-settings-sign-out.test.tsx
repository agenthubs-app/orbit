import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

// L1 / O2: 设置 › 退出登录 asks first (iOS-style confirm), and a finished sign-out leaves
// login as the only page. The real settings screen, confirm dialog and overlay host run;
// the session, navigation, profile and permission reads are controlled boundaries.
const require = createRequire(import.meta.url);
let browser: Browser, script: string;
const fixture = `
let revision = 0; const listeners = new Set();
const state = window.fixture = { calls: [], navigation: [], ...window.initialFixture, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, accountId: "actor:1", actorId: "actor:1", user: { id: "actor:1", name: "程川", email: "cheng@example.test" },
  signOut: async () => { state.calls.push("sign-out"); return state.logoutFailure ? { success: false, message: "退出未完成，请重试。" } : { success: true }; } });
export const useOrbitApiBaseUrl = () => ({ baseUrl: "https://orbit.test", ready: true });
export const useRouter = () => ({ canGoBack: () => true, push(href) { state.navigation.push("push:" + href); }, replace(href) { state.navigation.push("replace:" + href); }, back() {}, dismissAll() { state.navigation.push("dismissAll"); } });
export const usePathname = () => "/settings";
export const useLocalSearchParams = () => ({});
export const useIsFocused = () => true;
export const useAccountProfile = () => ({ data: { profile: { displayName: "程川", handles: { email: "cheng@example.test" } } }, path: "/profile" });
export const useAccountPermissions = () => ({ rows: [], failed: false });
export const clearProfileEditSession = () => { state.calls.push("clear-edit-session"); };
export const SafeAreaView = ({ edges, style, ...props }) => React.createElement("div", props);
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
export const Ionicons = () => null;
import React from "react";
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
import { AccountSettingsScreen } from "./src/screens/me/AccountSettingsScreen";
import { ToastProvider, UiFeedbackHost, UiPortalHost } from "./src/components/ui";
createRoot(document.getElementById("root")).render(<ToastProvider><UiPortalHost><AccountSettingsScreen /><UiFeedbackHost /></UiPortalHost></ToastProvider>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "settings-sign-out", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "settings-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "settings-native" }, () => ({ contents: 'import * as RNW from "react-native-web"; export * from "react-native-web"; export const findNodeHandle = instance => instance ?? null; export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }), setAccessibilityFocus() {} };', resolveDir: process.cwd(), loader: "js" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|useAccountProfile|useAccountPermissions|profile-edit-session)$/ }, () => ({ path: "fixture", namespace: "settings-sign-out" }));
      plugin.onLoad({ filter: /.*/, namespace: "settings-sign-out" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }, nativeUiStubs],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<style>html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(value => { (window as any).initialFixture = value; }, patch);
  await page.addScriptTag({ content: script });
  return page;
}
const fx = (page: Page) => page.evaluate(() => { const s = (window as any).fixture; return { calls: s.calls, navigation: s.navigation }; });

test("退出登录 asks first; 取消 keeps the session and the page", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByText("退出登录？", { exact: true }).waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByText("退出登录？", { exact: true }).waitFor({ state: "detached" });
  assert.deepEqual(await fx(page), { calls: [], navigation: [] });
});

test("confirming signs out, then login replaces the whole stack", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByText("退出登录？", { exact: true }).waitFor();
  const buttons = page.getByRole("button", { name: "退出登录", exact: true });
  await buttons.last().click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  const { calls, navigation } = await fx(page);
  assert.deepEqual(calls, ["sign-out", "clear-edit-session"]);
  assert.equal(navigation.at(-1), "replace:/account/login", "login, with no next pointing back at this account's page");
});

test("a failed sign-out stays on settings and says so", async t => {
  const page = await open(t, { logoutFailure: true });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByText("退出登录？", { exact: true }).waitFor();
  await page.getByRole("button", { name: "退出登录", exact: true }).last().click();
  await page.getByText("退出未完成，请重试。", { exact: true }).waitFor();
  assert.deepEqual(await fx(page), { calls: ["sign-out"], navigation: [] });
});
