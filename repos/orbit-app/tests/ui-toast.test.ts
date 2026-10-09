import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser } from "playwright";

import { createToast, disarmOwner, toastBottom, TOAST_DURATION_MS } from "../src/components/ui/toast-model";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// R04 (SC-R04-02): Toast — one at a time, success leaves after 5 s, errors and undo
// bars stay, 元に戻す runs the undo, an undo dies with the screen that showed it.
let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(readFileSync("tests/helpers/ui-scenarios.tsx", "utf8").replace(/\.\.\/\.\.\//g, "./"));
  browser = await launch();
});
test.after(async () => browser?.close());

test("the model: errors and undo bars never time out; an owner's unmount removes only its undo", () => {
  assert.equal(createToast({ message: "完了にしました" }, 1).autoDismissMs, TOAST_DURATION_MS);
  assert.equal(createToast({ kind: "error", message: "保存できませんでした" }, 1).autoDismissMs, null);
  assert.equal(createToast({ message: "交換しました", keep: true, undo: () => undefined }, 1).autoDismissMs, null);
  const mine = createToast({ message: "完了にしました", undo: () => undefined }, 7);
  assert.equal(disarmOwner(mine, 7)?.undo, undefined);
  assert.equal(disarmOwner(mine, 7)?.message, "完了にしました");
  assert.ok(disarmOwner(mine, 8)?.undo, "another screen's unmount leaves it alone");
  assert.equal(toastBottom(true), 100);
  assert.equal(toastBottom(false), 40);
});

test("元に戻す runs the undo once and closes the toast; a new toast replaces the old one", async () => {
  const page = await openScenario(browser, script, { scenario: "toast" });
  await page.evaluate(() => (window as any).ui.success());
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).events), ["undo"]);
  assert.equal(await page.getByText("完了にしました").count(), 0);
  await page.evaluate(() => { (window as any).ui.success(); (window as any).ui.successPlain(); });
  assert.equal(await page.getByText("完了にしました").count(), 0, "replaced");
  assert.equal(await page.getByText("コピーしました").count(), 1);
  await page.close();
});

test("success leaves after 5 s; errors and undo bars stay until closed", async () => {
  const page = await openScenario(browser, script, { scenario: "toast" });
  await page.clock.install();
  await page.evaluate(() => (window as any).ui.successPlain());
  await page.clock.runFor(TOAST_DURATION_MS + 200);
  assert.equal(await page.getByText("コピーしました").count(), 0);
  await page.evaluate(() => (window as any).ui.error());
  await page.clock.runFor(TOAST_DURATION_MS * 3);
  assert.equal(await page.getByText("保存できませんでした").count(), 1);
  await page.getByRole("button", { name: "閉じる" }).click();
  assert.equal(await page.getByText("保存できませんでした").count(), 0);
  await page.evaluate(() => (window as any).ui.keep());
  await page.clock.runFor(TOAST_DURATION_MS * 3);
  assert.equal(await page.getByText("24時間以内なら取り消せます").count(), 1);
  await page.close();
});

test("an undo whose screen has gone is removed, so it can never run into that screen", async () => {
  const page = await openScenario(browser, script, { scenario: "toast" });
  await page.evaluate(() => (window as any).ui.success());
  await page.evaluate(() => (window as any).ui.unmount());
  await page.waitForTimeout(50);
  assert.equal(await page.getByText("完了にしました").count(), 1, "the message stays");
  assert.equal(await page.getByRole("button", { name: "元に戻す" }).count(), 0, "the undo is gone");
  assert.deepEqual(await page.evaluate(() => (window as any).events), []);
  await page.close();
});

test("dark mode keeps a dark capsule: one step above the dark page, light text (RD-17)", async () => {
  for (const dark of [false, true]) {
    const page = await openScenario(browser, script, { scenario: "toast" }, { dark });
    await page.evaluate(() => (window as any).ui.successPlain());
    const colors = await page.getByText("コピーしました").evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      let background = "rgba(0, 0, 0, 0)";
      while (node && background === "rgba(0, 0, 0, 0)") { background = getComputedStyle(node).backgroundColor; node = node.parentElement; }
      return { text: getComputedStyle(el).color, background };
    });
    const luminance = (rgb: string) => { const [r, g, b] = rgb.match(/\d+/g)!.map(Number).map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    assert.ok(luminance(colors.background) < 0.2, `${dark ? "dark" : "light"}: capsule is dark (${colors.background})`);
    assert.ok(luminance(colors.text) > 0.5, `${dark ? "dark" : "light"}: text is light (${colors.text})`);
    await page.close();
  }
});
