import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";
const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { OrbitTimeZoneProvider, useOrbitTimeZone } from "./src/time/OrbitTimeZoneProvider"; function View() { const zone=useOrbitTimeZone(); return <output>{JSON.stringify(zone)}</output>; } createRoot(document.getElementById("root")).render(<OrbitTimeZoneProvider><View /></OrbitTimeZoneProvider>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "native-lifecycle", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `import React from "react"; const listeners = new Set(); window.foreground = () => listeners.forEach(fn => fn("active")); export const AppState = { addEventListener: (_name, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } }; export const Text = ({children}) => <div role="alert">{children}</div>;`, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
for (const initial of ["Asia/Tokyo", "invalid"]) test(`device zone ${initial} handles failure and foreground recovery visibly`, async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(initial => {
    const Original = Intl.DateTimeFormat;
    (window as any).zone = initial;
    Intl.DateTimeFormat = function(locale: any, options: any) {
      if (options?.timeZone) return new Original(locale, options);
      if ((window as any).zone === "invalid") throw new Error("Device unavailable");
      return new Original(locale, { ...options, timeZone: (window as any).zone });
    } as any;
  }, initial);
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => document.querySelector("output")?.textContent?.includes("timeZone"));
  const result = () => page.locator("output").textContent().then(value => JSON.parse(value!));
  assert.deepEqual(await result(), initial === "invalid" ? { timeZone: "UTC", canSave: false, error: true } : { timeZone: initial, canSave: true, error: false });
  await page.evaluate(() => { (window as any).zone = "invalid"; (window as any).foreground(); });
  await page.getByRole("alert").waitFor();
  assert.deepEqual(await result(), { timeZone: initial === "invalid" ? "UTC" : initial, canSave: initial !== "invalid", error: true });
  await page.evaluate(() => { (window as any).zone = "America/Los_Angeles"; (window as any).foreground(); });
  await page.waitForFunction(() => document.querySelector("output")?.textContent?.includes("Los_Angeles"));
  assert.deepEqual(await result(), { timeZone: "America/Los_Angeles", canSave: true, error: false });
  assert.equal(await page.getByRole("alert").count(), 0);
});
