import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser;

test.before(async () => {
  browser = await chromium.launch({
    headless: true,
    timeout: 15_000,
    ...(process.env.ORBIT_TEST_CHROME_PATH
      ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH }
      : {}),
  });
});

test.after(async () => {
  await browser?.close();
});

async function openBundle(
  t: { after(fn: () => Promise<void>): void },
  entry: string,
  plugins: Plugin[],
): Promise<Page> {
  const built = await build({
    stdin: {
      contents: entry,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    define: {
      "process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA": '"baseline-sha"',
      "process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN": '"1"',
      "process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER": '"1"',
      "process.env.NODE_ENV": '"test"',
    },
    format: "iife",
    jsx: "automatic",
    plugins,
    write: false,
  });
  const server: Server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${built.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const page = await browser.newPage();
  page.setDefaultTimeout(2_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await page.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.deepEqual(errors, []);
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  return page;
}

test("useApiResource measures the core network phase and scopes samples by actor and server", async (t) => {
  const fixture = `
    import { useSyncExternalStore } from "react";
    export const state = window.fixture = { measurements: [], scopes: [] };
    export function useOrbitAuthSession() {
      useSyncExternalStore(() => () => {}, () => 0);
      return { actorId: "actor:one", cookieHeader: "", ready: true };
    }
    export function useOrbitApiBaseUrl() { return { baseUrl: "https://api.example.test" }; }
    export function createOrbitApiClient() { return { async get() { return { data: { notes: [] }, meta: { featureMode: null, privacy: null, runtimeBoundary: null }, status: 200, success: true }; } }; }
    export async function readSnapshot() { return null; }
    export async function writeSnapshot() {}
    export function appPerformanceScenarioForPath() { return "app.notes"; }
    export function appPerformanceInput(metric, scenario) { return { commit: "baseline-sha", environment: "app-release-simulator", metric, run: 1, scenario, unit: "milliseconds" }; }
    export function isAppPerformanceEnabled() { return true; }
    export async function measureAppPerformance(input, work) { const result = await work(); state.measurements.push(input); return result; }
    export function setAppPerformanceScope(scope) { state.scopes.push(scope); }
  `;
  const plugin: Plugin = {
    name: "app-resource-performance-boundaries",
    setup(buildApi) {
      buildApi.onResolve(
        { filter: /\/(AuthSessionProvider|ApiBaseUrlProvider|client|snapshot-store|app-performance)$/ },
        (args) => args.path === "react-dom/client"
          ? null
          : ({ path: "fixture", namespace: "app-performance" }),
      );
      buildApi.onLoad(
        { filter: /.*/, namespace: "app-performance" },
        () => ({ contents: fixture, loader: "tsx", resolveDir: process.cwd() }),
      );
    },
  };
  const page = await openBundle(
    t,
    `import React from "react";
     import { createRoot } from "react-dom/client";
     import { useApiResource } from "./src/hooks/useApiResource";
     function Screen() { const resource = useApiResource("/api/notes?limit=20", () => false, { scopeKey: "actor:one" }); return <output>{resource.kind}</output>; }
     createRoot(document.getElementById("root")).render(<Screen />);`,
    [plugin],
  );

  await page.getByText("success", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.measurements), [
    {
      commit: "baseline-sha",
      environment: "app-release-simulator",
      metric: "app.resource",
      run: 1,
      scenario: "app.notes",
      unit: "milliseconds",
    },
  ]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopes.at(-1)), {
    actorId: "actor:one",
    baseUrl: "https://api.example.test",
  });
});

test("snapshot reads measure SQLite plus parse work without changing the returned record", async (t) => {
  const fixture = `
    export const state = window.fixture = { measurements: [] };
    export const syncLifecycle = { async withDatabase(scope, work) { return work({
      async get() { return { payload: JSON.stringify({ contacts: [{ id: "contact:one" }] }), status: 200, synced_at: "2026-09-15T00:00:00.000Z" }; }
    }); } };
    export function appPerformanceScenarioForPath() { return "app.profile"; }
    export function appPerformanceInput(metric, scenario) { return { commit: "baseline-sha", environment: "app-release-simulator", metric, run: 1, scenario, unit: "milliseconds" }; }
    export function isAppPerformanceEnabled() { return true; }
    export async function measureAppPerformance(input, work) { const result = await work(); state.measurements.push(input); return result; }
  `;
  const plugin: Plugin = {
    name: "snapshot-performance-boundaries",
    setup(buildApi) {
      buildApi.onResolve(
        { filter: /\/sync-lifecycle$/ },
        () => ({ path: "fixture", namespace: "snapshot-performance" }),
      );
      buildApi.onResolve(
        { filter: /\/performance\/app-performance$/ },
        () => ({ path: "fixture", namespace: "snapshot-performance" }),
      );
      buildApi.onLoad(
        { filter: /.*/, namespace: "snapshot-performance" },
        () => ({ contents: fixture, loader: "tsx", resolveDir: process.cwd() }),
      );
    },
  };
  const page = await openBundle(
    t,
    `import { readSnapshot } from "./src/data/snapshot-store";
     void readSnapshot("https://api.example.test", "actor:one", "/api/profile").then((record) => { window.fixture.record = record; });`,
    [plugin],
  );

  await page.waitForFunction(() => Boolean((window as any).fixture.record));
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.record), {
    result: {
      data: { contacts: [{ id: "contact:one" }] },
      meta: { featureMode: null, privacy: null, runtimeBoundary: null },
      status: 200,
      success: true,
    },
    syncedAt: "2026-09-15T00:00:00.000Z",
  });
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.measurements), [
    {
      commit: "baseline-sha",
      environment: "app-release-simulator",
      metric: "app.snapshot",
      run: 1,
      scenario: "app.profile",
      unit: "milliseconds",
    },
  ]);
});

test("RootLayout records first commit and auth restoration after assigning the actor scope", async (t) => {
  const fixture = `
    import React from "react";
    export const state = window.fixture = { marks: [], scopes: [] };
    export function Wrapper({ children }) { return <>{children}</>; }
    export const OrbitTimeZoneProvider = Wrapper;
    export const SafeAreaProvider = Wrapper;
    export const OrbitAuthSessionProvider = Wrapper;
    export const OrbitApiBaseUrlProvider = Wrapper;
    export const AppErrorBoundary = Wrapper;
    export const OrbitLocaleProvider = Wrapper;
    export function AppErrorScreen() { return null; }
    export function OrbitRouteAccessBoundary() { return null; }
    export function OrbitNotificationsCoordinator() { return null; }
    export function OrbitNotificationLifecycle() { return null; }
    export function StatusBar() { return null; }
    export function useOrbitTheme() { return { scheme: "light" }; }
    export function useOrbitAuthSession() { return { actorId: "actor:one", ready: true }; }
    export function useOrbitApiBaseUrl() { return { baseUrl: "https://api.example.test" }; }
    export function appPerformanceInput(metric, scenario) { return { commit: "baseline-sha", environment: "app-release-simulator", metric, run: 1, scenario, unit: "milliseconds" }; }
    export function isAppPerformanceEnabled() { return true; }
    export function markAppPerformance(sample) { state.marks.push(sample); }
    export function setAppPerformanceScope(scope) { state.scopes.push(scope); }
  `;
  const plugin: Plugin = {
    name: "root-performance-boundaries",
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (!args.importer.endsWith("/app/_layout.tsx")) return null;
        if (args.path === "react" || args.path === "react/jsx-runtime") return null;
        return { path: "fixture", namespace: "root-performance" };
      });
      buildApi.onLoad(
        { filter: /.*/, namespace: "root-performance" },
        () => ({ contents: fixture, loader: "tsx", resolveDir: process.cwd() }),
      );
    },
  };
  const page = await openBundle(
    t,
    `import React from "react";
     import { createRoot } from "react-dom/client";
     import RootLayout from "./app/_layout";
     createRoot(document.getElementById("root")).render(<RootLayout />);`,
    [plugin],
  );

  await page.waitForFunction(() => (window as any).fixture?.marks.length >= 2);
  assert.deepEqual(
    await page.evaluate(() => (window as any).fixture.marks.map((sample: any) => ({
      failed: sample.failed,
      metric: sample.metric,
      scenario: sample.scenario,
    }))),
    [
      { failed: false, metric: "app.startup", scenario: "app.startup" },
      { failed: false, metric: "app.auth_restore", scenario: "app.auth_restore" },
    ],
  );
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.scopes.at(-1)), {
    actorId: "actor:one",
    baseUrl: "https://api.example.test",
  });
});
