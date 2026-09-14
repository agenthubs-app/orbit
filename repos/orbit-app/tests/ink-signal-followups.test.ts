import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, script: string;
// Actual legacy route and private boundary. Device/session/router are controlled;
// any obsolete resource read is recorded and must disappear after the redirect.
const fixture = `
import React from "react";
import { View } from "react-native-web";
const state = window.fixture = { ready: true, signedIn: true, params: {}, reads: [], writes: [], ...window.initialFixture };
export const useOrbitAuthSession = () => ({ ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: "owner" } : null, cookieHeader: "" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const useLocalSearchParams = () => state.params;
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/followups";
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const useRouter = () => ({ canGoBack: () => false, push() {}, replace() {}, back() {} });
export const useApiResource = path => { state.reads.push(path); return { kind: "success", data: { tasks: [], contacts: [], reminders: [] }, refreshing: false, refresh() {} }; };
export const useOrbitApiClient = () => ({ post(...args) { state.writes.push(args); }, patch(...args) { state.writes.push(args); } });
export const useRelationshipInboxBadgeCount = () => 0;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const SafeAreaView = ({ style, ...props }) => <View {...props} style={style} />;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/followups"; createRoot(document.getElementById("root")).render(<Route />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "legacy-route-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|useApiResource|useOrbitApiClient|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "legacy-route" }));
      plugin.onLoad({ filter: /.*/, namespace: "legacy-route" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  }); script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

for (const [params, target] of [
  [{}, "/tasks?scope=relationship"],
  [{ view: "completed", scope: "all" }, "/tasks?scope=relationship&view=completed"],
  [{ view: ["completed", "open"], next: "https://outside.example" }, "/tasks?scope=relationship&view=completed"],
  [{ view: "unknown" }, "/tasks?scope=relationship"],
] as const) {
  test(`authenticated legacy route redirects to ${target}: ${JSON.stringify(params)}`, async t => {
    const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(1500);
    await page.setContent('<div id="root"></div>');
    await page.evaluate(params => { (window as any).initialFixture = { params }; }, params);
    await page.addScriptTag({ content: script });
    await page.getByRole("status").waitFor(); assert.equal(await page.getByRole("status").textContent(), target);
    assert.deepEqual(await page.evaluate(() => ({ reads: (window as any).fixture.reads, writes: (window as any).fixture.writes })), { reads: [], writes: [] });
  });
}

test("signed-out legacy link keeps authentication and a normalized relationship return", async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).initialFixture = { signedIn: false, params: { view: "completed", next: "https://outside.example" } }; });
  await page.addScriptTag({ content: script });
  assert.equal(await page.getByRole("status").textContent(), "/account/login?next=" + encodeURIComponent("/tasks?scope=relationship&view=completed"));
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.reads), []);
});
