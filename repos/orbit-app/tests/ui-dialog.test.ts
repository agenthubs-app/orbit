import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser } from "playwright";

import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// R04 (SC-R04-02, 必需证据 02): a destructive confirm starts on キャンセル, ignores
// backdrop taps and treats Android back as cancel; a non-destructive one focuses the
// main button and a backdrop tap cancels. The imperative presentConfirm resolves.
let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(readFileSync("tests/helpers/ui-scenarios.tsx", "utf8").replace(/\.\.\/\.\.\//g, "./"));
  browser = await launch();
});
test.after(async () => browser?.close());

test("destructive: focus on キャンセル, cancel on the left, coral action on the right", async () => {
  const page = await openScenario(browser, script, { scenario: "dialog" });
  const focused = page.locator('[data-focus-target="1"]');
  assert.equal(await focused.getByRole("button").innerText(), "キャンセル");
  const [cancel, confirm] = await Promise.all([page.getByRole("button", { name: "キャンセル" }).boundingBox(), page.getByRole("button", { name: "削除する" }).boundingBox()]);
  assert.ok(cancel!.x < confirm!.x, "キャンセル is on the left");
  await page.close();
});

test("destructive: a backdrop tap does nothing; Android back cancels", async () => {
  const page = await openScenario(browser, script, { scenario: "dialog" });
  await page.mouse.click(10, 10);
  assert.deepEqual(await page.evaluate(() => (window as any).events), []);
  assert.equal(await page.evaluate(() => (window as any).fireBack()), true);
  assert.deepEqual(await page.evaluate(() => (window as any).events), ["cancel"]);
  await page.close();
});

test("non-destructive: focus on the main button and a backdrop tap cancels", async () => {
  const page = await openScenario(browser, script, { scenario: "dialog", destructive: false });
  assert.equal(await page.locator('[data-focus-target="1"]').getByRole("button").innerText(), "削除する");
  await page.mouse.click(10, 10);
  assert.deepEqual(await page.evaluate(() => (window as any).events), ["cancel"]);
  await page.close();
});

test("presentConfirm (for code outside screens) resolves with the choice", async () => {
  const page = await openScenario(browser, script, { scenario: "imperative" });
  await page.evaluate(() => { (window as any).ui.ask(); });
  await page.getByRole("button", { name: "キャンセル" }).click();
  await page.evaluate(() => { (window as any).ui.ask(); });
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForTimeout(20);
  assert.deepEqual(await page.evaluate(() => (window as any).events), ["answer:false", "answer:true"]);
  await page.close();
});
