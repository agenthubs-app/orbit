import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { bundle, errorsOf, launch } from "./support/orbit-2026-harness";

const current = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const first = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const next = "cccccccccccccccccccccccccccccccccccccccc";
const origin = "https://orbit-r18b-version.test";
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    import { WebVersionBannerGate } from "./app/(app)/app/orbit-2026/auth-public/WebVersionBanner";
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja"><WebVersionBannerGate currentBuildId="${current}" language="ja" /></Orbit2026Scope>);
  `);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

test("W-10 checks the live ID, closes the target build, and reappears for another build", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let announced = first;
  let requests = 0;
  await page.route(`${origin}/`, (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="ja"><body style="margin:0"><div id="root"></div></body></html>',
  }));
  await page.route(`${origin}/api/app/version`, (route) => {
    requests += 1;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data: { webBuildId: announced } }) });
  });
  try {
    await page.goto(`${origin}/`);
    await page.addStyleTag({ path: `${process.cwd()}/app/(app)/app/orbit-2026/tokens.css` });
    await page.addStyleTag({ content: code.css });
    await page.addScriptTag({ content: code.js });
    const notice = page.getByRole("status", { name: "新しいバージョンがあります" });
    await notice.waitFor();
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), true);
    assert.equal(await notice.getByText("入力中なら、内容を確認してから再読み込み。").count(), 1);
    await notice.getByRole("button", { name: "あとで" }).click();
    await notice.waitFor({ state: "detached" });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(100);
    assert.equal(await notice.count(), 0, "the dismissed build stays hidden after another check");
    announced = next;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await notice.waitFor();
    assert.ok(requests >= 3);
    assert.deepEqual(errorsOf(page).concat(errors), []);
  } finally {
    await page.close();
  }
});
