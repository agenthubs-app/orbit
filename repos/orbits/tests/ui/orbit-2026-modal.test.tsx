import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { closeLayer, isTopLayer, openLayer, openLayerCount } from "../../app/(app)/app/orbit-2026/ui/layer-stack";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

// R06 (SC-R06-02): dialogs and drawers trap focus (useOrbitModalA11y), return it to
// the opener, Escape closes only the top layer, a destructive confirm starts on
// Cancel and ignores the scrim; popover and menu close on Esc / outside click.
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ComponentShowcase } from "./app/showcase/components/ComponentShowcase";
    createRoot(document.getElementById("root")).render(<ComponentShowcase language="ja" />);
  `);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

async function showcase(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await open(browser, code);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("heading", { name: "Button" }).waitFor();
  return page;
}

const active = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");

test("the layer stack only lets the top layer act", () => {
  const a = openLayer();
  const b = openLayer();
  assert.equal(isTopLayer(b), true);
  assert.equal(isTopLayer(a), false);
  closeLayer(b);
  assert.equal(isTopLayer(a), true);
  closeLayer(a);
  assert.equal(openLayerCount(), 0);
});

test("a modal traps Tab, closes on Escape and gives focus back to its opener", async (t) => {
  const page = await showcase(t);
  const opener = page.getByRole("button", { name: "modal 480" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  assert.equal(await active(page), "閉じる", "focus starts inside on the first control");
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true, `Tab ${index} stays inside`);
  }
  await page.keyboard.press("Shift+Tab");
  assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await active(page), "modal 480");
  const box = await page.evaluate(() => getComputedStyle(document.querySelector("[data-orbit-2026-host]")!.parentElement!).getPropertyValue("--z-modal"));
  assert.equal(box.trim(), "400", "stacking comes from ORBIT_Z");
});

test("Escape closes only the top layer: a confirm opened from a drawer closes first", async (t) => {
  const page = await showcase(t);
  await page.getByRole("button", { name: "drawer lg" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "nested confirm" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.waitFor();
  assert.equal(await active(page), "キャンセル", "a destructive confirm starts on Cancel");
  await page.keyboard.press("Escape");
  await confirm.waitFor({ state: "detached" });
  assert.equal(await page.getByRole("dialog").count(), 1, "the drawer stays open");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await active(page), "drawer lg");
});

test("a destructive confirm ignores the scrim; a plain modal closes on it", async (t) => {
  const page = await showcase(t);
  await page.getByRole("button", { name: "confirm (destructive)" }).click();
  await page.mouse.click(10, 10);
  assert.equal(await page.getByRole("alertdialog").count(), 1);
  await page.getByRole("button", { name: "キャンセル" }).click();
  await page.getByRole("button", { name: "modal 420" }).click();
  await page.mouse.click(10, 10);
  await page.getByRole("dialog").waitFor({ state: "detached" });
});

test("popover and context menu: Escape and outside clicks close them; the menu moves with arrow keys", async (t) => {
  const page = await showcase(t);
  await page.getByRole("button", { name: "popover" }).click();
  await page.getByRole("dialog", { name: "popover" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "popover" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "popover" }).click();
  await page.mouse.click(10, 10);
  await page.getByRole("dialog", { name: "popover" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "context menu" }).click();
  const menu = page.getByRole("menu");
  assert.equal(await active(page), "開く");
  await page.keyboard.press("ArrowDown");
  assert.equal(await active(page), "コピー");
  await page.keyboard.press("End");
  assert.equal(await active(page), "削除");
  assert.equal(Math.round((await menu.boundingBox())!.width), 200);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await active(page), "context menu", "focus returns to the trigger");
});
