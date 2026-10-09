import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { sheetMaxHeight, SHEET_KEYBOARD_GAP } from "../src/components/ui/sheet-logic";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// R04 review fixes, checked on open overlays (sheet, dialog, drawer, action sheet)
// and toasts: a toast stays visible and usable above an open overlay (M1); every
// control there has a ≥44 target (M2); the action sheet starts on the safe choice
// (M5); the keyboard never pushes the sheet's top off screen (M6); with Reduce
// Motion nothing moves (M7); a backdrop tap and Android back close the sheet (m8).
let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(readFileSync("tests/helpers/ui-scenarios.tsx", "utf8").replace(/\.\.\/\.\.\//g, "./"));
  browser = await launch();
});
test.after(async () => browser?.close());

const OVERLAYS = ["sheet", "dialog", "drawer", "actionSheet"] as const;
const events = (page: Page) => page.evaluate(() => (window as any).events as string[]);

test("a toast shows above every open overlay and its button can be pressed", async () => {
  for (const overlay of OVERLAYS) {
    const page = await openScenario(browser, script, { scenario: "overlays", overlay });
    await page.evaluate(() => (window as any).ui.retry());
    const retry = page.getByRole("button", { name: "再試行" });
    const box = (await retry.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role="button"]')?.getAttribute("aria-label") ?? null, [box.x + box.width / 2, box.y + box.height / 2]);
    assert.equal(hit, "再試行", `${overlay}: the toast is covered`);
    await retry.click();
    assert.ok((await events(page)).includes("retry"), overlay);
    await page.close();
  }
});

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]'))
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => { const box = el.getBoundingClientRect(); const slop = Number(el.dataset.hitslop ?? 0); return { label: el.getAttribute("aria-label") ?? el.textContent ?? "", size: Math.min(box.width, box.height) + 2 * slop }; })
    .filter((item) => item.size < 43.5).map((item) => `${item.label.slice(0, 20)}: ${item.size}`));
}

test("open overlays and every kind of toast offer ≥44 touch targets", async () => {
  for (const overlay of OVERLAYS) {
    const page = await openScenario(browser, script, { scenario: "overlays", overlay });
    assert.deepEqual(await smallTargets(page), [], overlay);
    await page.close();
  }
  for (const kind of ["success", "retry", "keep"]) {
    const page = await openScenario(browser, script, { scenario: "toast" });
    await page.evaluate((name) => (window as any).ui[name](), kind);
    assert.deepEqual(await smallTargets(page), [], kind);
    await page.close();
  }
});

test("the destructive action sheet starts screen-reader focus on the safe choice", async () => {
  const page = await openScenario(browser, script, { scenario: "overlays", overlay: "actionSheet" });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-focus-target="1"]').getByRole("button").innerText(), "参加を続ける");
  await page.close();
});

test("a backdrop tap closes the sheet; Android back closes the action sheet", async () => {
  const sheet = await openScenario(browser, script, { scenario: "overlays", overlay: "sheet" });
  await sheet.mouse.click(10, 10);
  assert.deepEqual(await events(sheet), ["sheet-close"]);
  await sheet.close();
  const actions = await openScenario(browser, script, { scenario: "overlays", overlay: "actionSheet" });
  assert.equal(await actions.evaluate(() => (window as any).fireBack()), true);
  assert.deepEqual(await events(actions), ["sheet-dismiss"]);
  await actions.close();
});

test("with the keyboard up a tall sheet fits above it: handle and first field stay on screen", async () => {
  assert.equal(sheetMaxHeight(844), 675);
  assert.equal(sheetMaxHeight(844, 336, 47), 844 - 336 - 47 - SHEET_KEYBOARD_GAP);
  assert.equal(sheetMaxHeight(844, 100, 47), 675, "a short keyboard keeps the 80% rule");
  const page = await openScenario(browser, script, { scenario: "overlays", overlay: "tallSheet" }, { width: 390 });
  await page.evaluate(() => (window as any).fireKeyboard(336));
  await page.waitForTimeout(30);
  const sheet = (await page.locator('[aria-label="長いシート"]').first().boundingBox())!;
  assert.ok(sheet.height <= 844 - 336 - SHEET_KEYBOARD_GAP + 1, `sheet is ${sheet.height} tall`);
  const field = (await page.getByText("一番上のメモ").boundingBox())!;
  assert.ok(sheet.y >= 0 && field.y >= sheet.y, "the top of the sheet is on screen");
  await page.close();
});

const MOVED = `(() => Array.from(document.querySelectorAll("#root *"))
  .map((el) => getComputedStyle(el).transform)
  .filter((value) => value !== "none" && value !== "matrix(1, 0, 0, 1, 0, 0)"))()`;

test("Reduce Motion: open overlays and toasts do not move, from their first frame", async () => {
  for (const overlay of OVERLAYS) {
    const page = await openScenario(browser, script, { scenario: "overlays", overlay, reducedMotion: true });
    assert.deepEqual(await page.evaluate(MOVED), [], overlay);
    await page.close();
  }
  // System setting (no override): a toast fired later knows it on its first frame.
  const page = await openScenario(browser, script, { scenario: "toast", systemReducedMotion: true });
  const moved = await page.evaluate(`new Promise((resolve) => { window.ui.success(); requestAnimationFrame(() => resolve(${MOVED})); })`);
  assert.deepEqual(moved, []);
  await page.close();
});
