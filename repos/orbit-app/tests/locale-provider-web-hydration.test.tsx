import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("the Web locale hydrates with the static language before reading the device", async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from "react";
        import { hydrateRoot } from "react-dom/client";
        import { OrbitLocaleProvider, useOrbitLocale } from "./src/i18n/OrbitLocaleProvider";
        function Probe() { const locale = useOrbitLocale(); return <span>{locale.language === "zh" ? "欢迎回来" : "Welcome back"}</span>; }
        hydrateRoot(document.getElementById("root"), <OrbitLocaleProvider><Probe /></OrbitLocaleProvider>);
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
    format: "iife",
    jsx: "automatic",
    plugins: [{
      name: "web-locale-hydration-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^fixture$|^expo-localization$|^react-native$|\/(ApiBaseUrlProvider|AuthSessionProvider|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "locale-hydration" }));
        plugin.onLoad({ filter: /.*/, namespace: "locale-hydration" }, () => ({
          contents: `
            export const Platform = { OS: "web" };
            export const AppState = { addEventListener() { return { remove() {} }; } };
            export function getLocales() { return [{ languageCode: "en", languageTag: "en-US" }]; }
            export function useOrbitApiBaseUrl() { return { baseUrl: "", ready: false }; }
            export function useOrbitAuthSession() { return { actorId: null, cookieHeader: "", ready: false, signedIn: false, user: null }; }
            export function useOrbitApiClient() { return { get: async () => ({ success: false, status: 503 }), put: async () => ({ success: false, status: 503 }) }; }
          `,
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    }],
    write: false,
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="root"><span>欢迎回来</span></div>');
    await page.addScriptTag({ content: result.outputFiles[0]!.text });
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
