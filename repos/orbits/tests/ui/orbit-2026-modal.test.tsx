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

test("dark content drawers have no hairline border", async (t) => {
  const page = await showcase(t);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.getByRole("button", { name: "drawer lg" }).click();
  const drawer = page.getByRole("dialog");
  assert.equal(await drawer.evaluate((el) => getComputedStyle(el).borderTopWidth), "0px");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await drawer.evaluate((el) => getComputedStyle(el).borderTopWidth), "0px");
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
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "popover", "keyboard focus moves into the popover (review M2)");
  assert.equal(await page.getByRole("dialog", { name: "popover" }).evaluate((el) => getComputedStyle(el).zIndex), "400", "popovers share the dialog layer, so one opened in a dialog is on top (review M1)");
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

// R09 walkthrough W2: on the real page ⌘K opened with focus on 閉じる (the trap's
// first control) instead of the search field. Modal takes `initialFocus`, applied
// after the trap's own first focus.
test("a dialog can start on a chosen control instead of its first one", async (t) => {
  const focusCode = await bundle(`
    import React, { useRef, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { Modal, Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    function Demo() {
      const [open, setOpen] = useState(false);
      const field = useRef(null);
      return <Orbit2026Scope language="ja">
        <button type="button" onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="検索" initialFocus={field}><input ref={field} aria-label="search field" /></Modal>
      </Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<Demo />);
  `);
  const page = await open(browser, focusCode);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("button", { name: "open" }).click();
  await page.getByRole("dialog", { name: "検索" }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await active(page), "search field");
  await page.keyboard.press("Escape");
  assert.equal(await active(page), "open", "focus still returns to the opener");
});

// R31b (D 线 R20a 依赖)：b3 表单型大模态 760 / 860 / 1000（日程を提案 1000 · 送る前の確認 760 · フォロー完了 860）只加不改，已有档位宽度不变。
test("form modal widths 760 / 860 / 1000 are added and the existing 420 stays 420", async (t) => {
  const sizesCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Modal, Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    const root = createRoot(document.getElementById("root"));
    (window as unknown as { show: (size: number) => void }).show = (size) => root.render(<Orbit2026Scope language="ja"><Modal key={size} open onClose={() => undefined} title={"size " + size} size={size as 420}><p>本文</p></Modal></Orbit2026Scope>);
  `);
  const page = await open(browser, sizesCode);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  for (const size of [420, 560, 760, 860, 1000]) {
    await page.evaluate((value) => (window as unknown as { show: (size: number) => void }).show(value), size);
    await page.waitForTimeout(400);
    const box = await page.getByRole("dialog", { name: `size ${size}` }).boundingBox();
    assert.equal(Math.round(box?.width ?? 0), size, `Modal size ${size}`);
  }
});

// R31b（SC-R31b-02 / 04）：closable={false} 不画 ✕，但 Esc 仍关、焦点回到打开它的按钮；标题左侧图标块是装饰，
// 不进 Tab 顺序；Web ConfirmDialog 同样无 ✕、破坏性时焦点先在キャンセル、非破坏性时在主按钮。
test("a modal without ✕ still closes on Escape and gives focus back; its icon tile is not in the Tab order", async (t) => {
  const iconCode = await bundle(`
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { Button, ConfirmDialog, MacTile, Modal, Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    function Demo() {
      const [open, setOpen] = useState(false);
      const [confirm, setConfirm] = useState<null | "danger" | "plain">(null);
      return <Orbit2026Scope language="ja">
        <button type="button" onClick={() => setOpen(true)}>open</button>
        <button type="button" onClick={() => setConfirm("danger")}>danger</button>
        <button type="button" onClick={() => setConfirm("plain")}>plain</button>
        <Modal open={open} onClose={() => setOpen(false)} title="スキップしますか？" description="あとで取り消せます。" icon={<MacTile emoji="🧠" tone="apricot" />} closable={false} size={380}
          actions={<><Button label="キャンセル" onClick={() => setOpen(false)} /><Button label="スキップする" variant="primary" /></>} />
        <ConfirmDialog open={confirm !== null} title="削除しますか？" message="元に戻せません。" confirmLabel="削除する" destructive={confirm === "danger"} onConfirm={() => setConfirm(null)} onCancel={() => setConfirm(null)} />
      </Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<Demo />);
  `);
  const page = await open(browser, iconCode);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("button", { name: "open" }).click();
  const dialog = page.getByRole("dialog", { name: "スキップしますか？" });
  await dialog.waitFor();
  await page.waitForTimeout(400);
  assert.equal(await dialog.getByRole("button", { name: "閉じる" }).count(), 0, "no ✕");
  assert.equal(Math.round((await dialog.boundingBox())?.width ?? 0), 380);
  const order: string[] = [];
  for (let index = 0; index < 3; index++) { order.push(await active(page)); await page.keyboard.press("Tab"); }
  assert.deepEqual(order, ["キャンセル", "スキップする", "キャンセル"], "only the two actions take focus (the tile does not)");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await active(page), "open", "focus returns to the opener");
  await page.getByRole("button", { name: "danger" }).click();
  const danger = page.getByRole("alertdialog", { name: "削除しますか？" });
  await danger.waitFor();
  assert.equal(await danger.getByRole("button", { name: "閉じる" }).count(), 0);
  assert.equal(await active(page), "キャンセル", "destructive: focus starts on キャンセル");
  await page.keyboard.press("Escape");
  await danger.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "plain" }).click();
  await page.getByRole("alertdialog", { name: "削除しますか？" }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await active(page), "削除する", "not destructive: focus starts on the main action");
});
