import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { createToast, disarmOwner, pushToast, TOAST_STACK_MAX } from "../../app/(app)/app/orbit-2026/ui/toast-model";
import { bundle, contrast, errorsOf, launch, open } from "./support/orbit-2026-harness";

// R06 (SC-R06-04): the Web toast stack — bottom-right, at most 3, errors stay, the
// undo bar does not count down, undo dies with its component; dark stays a capsule.
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Scope, ToastProvider, useToast, Button } from "./app/(app)/app/orbit-2026/ui";
    function Shower() {
      const toast = useToast();
      window.show = (kind, message, options) => toast[kind](message, options);
      return <Button label="owner" />;
    }
    function App() {
      const [owner, setOwner] = useState(true);
      window.unmountOwner = () => setOwner(false);
      return <Orbit2026Scope language="ja"><ToastProvider>{owner ? <Shower /> : null}<KeepShower /></ToastProvider></Orbit2026Scope>;
    }
    function KeepShower() { const toast = useToast(); window.showKept = (message, options) => toast.success(message, options); return null; }
    window.undone = [];
    createRoot(document.getElementById("root")).render(<App />);
  `);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

test("the model keeps the newest three and disarms a gone owner's undo", () => {
  let stack = [1, 2, 3, 4].reduce((current, n) => pushToast(current, createToast({ message: String(n) }, 1)), [] as ReturnType<typeof createToast>[]);
  assert.equal(TOAST_STACK_MAX, 3);
  assert.deepEqual(stack.map((toast) => toast.message), ["2", "3", "4"]);
  stack = pushToast(stack, createToast({ message: "u", undo: () => undefined }, 2));
  assert.equal(typeof disarmOwner(stack, 2).at(-1)!.undo, "undefined");
  assert.equal(createToast({ kind: "error", message: "e" }, 1).autoDismissMs, null);
  assert.equal(createToast({ message: "k", keep: true, undo: () => undefined }, 1).autoDismissMs, null);
  assert.equal(createToast({ message: "s" }, 1).autoDismissMs, 5000);
});

test("at most three on screen, bottom-right, newest last; success leaves after 5 s, an error stays", async (t) => {
  const page = await open(browser, code, { width: 1440 });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install();
  await page.getByRole("button", { name: "owner" }).waitFor();
  await page.evaluate(() => { const w = window as any; w.show("error", "E1"); w.show("success", "S1"); w.show("success", "S2"); w.show("info", "I1"); });
  const toasts = page.locator("[data-kind]");
  const texts = () => toasts.allTextContents().then((all) => all.map((text) => text.replace(/閉じる|元に戻す/g, "").trim()));
  // The 4th pushed out the oldest one that counts down; the error stays (review m1).
  assert.deepEqual(await texts(), ["E1", "S2", "I1"]);
  const stack = (await toasts.first().evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON())) as DOMRect;
  assert.equal(Math.round(1440 - stack.right), 24);
  assert.equal(Math.round(stack.width), 420);
  await page.evaluate(() => (window as any).show("error", "E2"));
  assert.deepEqual(await texts(), ["E1", "I1", "E2"]);
  await page.clock.runFor(5200);
  assert.deepEqual(await texts(), ["E1", "E2"]);
  assert.equal(await page.locator('[data-kind="error"]').first().getAttribute("role"), "alert");
  while (await page.getByRole("button", { name: "閉じる" }).count()) await page.getByRole("button", { name: "閉じる" }).first().click();
  assert.equal(await toasts.count(), 0);
});

test("the undo bar does not count down; undo runs once; a gone owner's undo is removed", async (t) => {
  const page = await open(browser, code);
  t.after(async () => { await page.close(); });
  await page.clock.install();
  await page.getByRole("button", { name: "owner" }).waitFor();
  await page.evaluate(`window.showKept("コピーしました", { keep: true, sub: "24h", undo: () => window.undone.push("kept") })`);
  assert.equal(await page.locator("[data-kind] i").count(), 0, "no countdown line");
  await page.clock.runFor(60_000);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).undone), ["kept"]);
  await page.evaluate(`window.show("success", "完了にしました", { undo: () => window.undone.push("owner") })`);
  await page.evaluate(() => (window as any).unmountOwner());
  assert.equal(await page.getByRole("button", { name: "元に戻す" }).count(), 0, "the undo of an unmounted component is gone");
});

test("hovering or focusing a toast pauses its countdown (review m2)", async (t) => {
  const page = await open(browser, code);
  t.after(async () => { await page.close(); });
  await page.clock.install();
  await page.getByRole("button", { name: "owner" }).waitFor();
  await page.evaluate(`window.show("success", "完了にしました", { undo: () => window.undone.push("late") })`);
  await page.locator("[data-kind]").hover();
  await page.clock.runFor(8000);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).undone), ["late"]);
});

test("dark: still a dark capsule (raised surface, light text) and readable", async (t) => {
  const page = await open(browser, code, { dark: true });
  t.after(async () => { await page.close(); });
  await page.getByRole("button", { name: "owner" }).waitFor();
  await page.evaluate(() => (window as any).show("success", "完了にしました"));
  const style = await page.locator("[data-kind]").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, page: getComputedStyle(document.body).backgroundColor }));
  assert.notEqual(style.bg, style.page, "the capsule stands out from the page");
  assert.ok(contrast(style.color, style.bg) >= 4.5, JSON.stringify(style));
  const light = await open(browser, code);
  t.after(async () => { await light.close(); });
  await light.getByRole("button", { name: "owner" }).waitFor();
  await light.evaluate(() => (window as any).show("success", "完了にしました"));
  const lightStyle = await light.locator("[data-kind]").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(contrast(lightStyle.color, lightStyle.bg) >= 4.5, JSON.stringify(lightStyle));
});
