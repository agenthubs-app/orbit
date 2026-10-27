import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build, type Plugin } from "esbuild";

const require = createRequire(import.meta.url);

test("the root shell omits tab navigation and tab-height toast placement until signed in", async () => {
  const fixture = `
    import React from "react";
    export function Wrapper({ children }) { return children; }
    export const OrbitTimeZoneProvider = Wrapper;
    export const SafeAreaProvider = Wrapper;
    export const SafeAreaView = Wrapper;
    export const View = Wrapper;
    export const ScrollView = Wrapper;
    export const ActivityIndicator = Wrapper;
    export const UiText = Wrapper;
    export const Linking = { openURL: async () => undefined };
    export const AppState = { addEventListener: () => ({ remove() {} }) };
    export const LogBox = { ignoreAllLogs() {} };
    export const OrbitAuthSessionProvider = Wrapper;
    export const OrbitApiBaseUrlProvider = Wrapper;
    export const AppErrorBoundary = Wrapper;
    export const OrbitLocaleProvider = Wrapper;
    export const GestureHandlerRootView = Wrapper;
    export const UiPortalHost = Wrapper;
    export function RootVersionGate({ children }) { return React.createElement("div", { "data-root-version-gate": "" }, children(true)); }
    export function ToastProvider({ children, hasTabBar }) { return React.createElement("div", { "data-has-tab-bar": String(hasTabBar) }, children); }
    export function ShellTabBar() { return React.createElement("nav", { "aria-label": "main tabs" }); }
    export function usePathname() { return globalThis.__rootShellAuthFixture.pathname; }
    export function useRootNavigationState() { return { type: "stack", index: 0, routes: [{}] }; }
    export function trackRootNavigationState(state) { globalThis.__rootShellAuthFixture.tracked = state; }
    export function mainTabForPath(pathname) { return pathname === "/home" ? "home" : null; }
    export function useOrbitAuthSession() { return globalThis.__rootShellAuthFixture; }
    export function useOrbitLocale() { return { language: "ja", t: (key) => key }; }
    export function useOrbitApiClient() { return {}; }
    export async function loadAppVersionGate() { return { kind: "allow" }; }
    export function ForceUpdateContent() { return null; }
    export function MaintenanceContent() { return null; }
    export function validAppStoreUrl() { return null; }
    export function formatMaintenanceUntil() { return null; }
    export function useOrbitApiBaseUrl() { return { baseUrl: "https://api.example.test" }; }
    export function useMobileViewport() { return { keyboardVisible: false }; }
    export function useOrbitTheme() { return { scheme: "light", colors: { bg: "white", accentText: "black" } }; }
    export function UiFeedbackHost() { return null; }
    export function AppErrorScreen() { return null; }
    export function OrbitRouteAccessBoundary() { return null; }
    export function DevOpenPath() { return null; }
    export function OrbitNotificationsCoordinator() { return null; }
    export function OrbitNotificationLifecycle() { return null; }
    export function StatusBar() { return null; }
    export default { getItem: async () => null, setItem: async () => undefined };
    export async function loadAppearancePreference() {}
    export function applyStoredAppearanceSync() { return false; }
    export function isAppPerformanceEnabled() { return false; }
    export function appPerformanceInput() { return {}; }
    export function markAppPerformance() {}
    export function setAppPerformanceScope() {}
    export const widgetSnapshotRuntime = { clear: async () => true, activate: async () => null };
  `;
  const plugin: Plugin = {
    name: "root-shell-auth-ssr-boundaries",
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, args => {
        if (!args.importer.endsWith("/app/_layout.tsx")) return null;
        if (args.path === "react" || args.path === "react/jsx-runtime") return null;
        return { path: "fixture", namespace: "root-shell-auth" };
      });
      buildApi.onLoad({ filter: /.*/, namespace: "root-shell-auth" }, () => ({
        contents: fixture,
        loader: "tsx",
        resolveDir: process.cwd(),
      }));
    },
  };
  const built = await build({
    stdin: { contents: 'export { default } from "./app/_layout";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    external: ["react", "react/jsx-runtime"],
    format: "cjs",
    jsx: "automatic",
    platform: "node",
    plugins: [plugin],
    write: false,
  });
  const module = { exports: {} as { default?: React.ComponentType } };
  new Function("require", "module", "exports", built.outputFiles[0]!.text)(require, module, module.exports);
  const RootLayout = module.exports.default;
  assert.ok(RootLayout);
  const render = (signedIn: boolean, pathname: string) => {
    (globalThis as any).__rootShellAuthFixture = { actorId: signedIn ? "actor:one" : null, ready: signedIn, signedIn, pathname };
    return renderToStaticMarkup(React.createElement(RootLayout));
  };

  const signedOutHome = render(false, "/home");
  assert.match(signedOutHome, /data-root-version-gate/u, "the route tree passes through the root version gate");
  assert.doesNotMatch(signedOutHome, /<nav aria-label="main tabs"/u);
  assert.match(signedOutHome, /data-has-tab-bar="false"/u);
  assert.deepEqual((globalThis as any).__rootShellAuthFixture.tracked, { type: "stack", index: 0, routes: [{}] }, "the stack is tracked signed out too, for the reset on sign-in");

  const signedInHome = render(true, "/home");
  assert.match(signedInHome, /<nav aria-label="main tabs"/u);
  assert.match(signedInHome, /data-has-tab-bar="true"/u);
});
