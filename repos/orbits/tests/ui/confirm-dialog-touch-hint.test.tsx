// 「Esc 先不」只在有键盘的设备显示：触屏（hover: none + pointer: coarse）不显示（2026-11-26 iPad 检查）。
import assert from "node:assert/strict";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

test("ConfirmDialog shows the Esc hint with a keyboard and hides it on touch screens", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ConfirmDialog, Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja">
      <ConfirmDialog open title="見送りにしますか？" message="取り消せません" confirmLabel="見送りにする" cancelLabel="やめる" destructive onConfirm={() => {}} onCancel={() => {}} />
    </Orbit2026Scope>);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { width: 834 });
    try {
      const hint = page.locator("kbd", { hasText: "Esc" });
      await hint.waitFor({ state: "attached" });
      assert.equal(await hint.isVisible(), true, "keyboard (fine pointer, hover): the hint shows");
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
    // 触屏设备（iPad / 手机：isMobile + hasTouch → hover: none, pointer: coarse）。
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 834, height: 1194 } });
    const touch = await context.newPage();
    try {
      await touch.setContent('<!doctype html><html lang="ja"><body><div id="root"></div></body></html>');
      await touch.addStyleTag({ path: "app/(app)/app/orbit-2026/tokens.css" });
      if (code.css) await touch.addStyleTag({ content: code.css });
      await touch.addScriptTag({ content: code.js });
      assert.equal(await touch.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), true, "touch device");
      const hint = touch.locator("kbd", { hasText: "Esc" });
      await hint.waitFor({ state: "attached" });
      assert.equal(await hint.isVisible(), false, "touch screen: no Esc hint");
      assert.equal(await touch.getByRole("button", { name: "やめる" }).isVisible(), true, "the cancel button stays");
    } finally { await context.close(); }
  } finally { await browser.close(); }
});
