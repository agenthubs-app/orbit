import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PublicInfoPage } from "./app/(app)/app/orbit-2026/auth-public/PublicInfoPage";
    createRoot(document.getElementById("root")).render(<PublicInfoPage kind="help" language="ja" signedIn={false} />);
  `);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

test("public FAQ filters locally, expands answers, and stays usable on a phone in both themes", async (t) => {
  for (const dark of [false, true]) {
    const page = await open(browser, code, { width: 390, dark, html: '<div id="root"></div>' });
    t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
    const search = page.getByRole("searchbox");
    await search.waitFor();
    assert.equal(await page.getByText("メールは自動で送信されますか？").count(), 1);
    await page.getByText("メールは自動で送信されますか？").click();
    assert.equal(await page.getByText("いいえ。メール・メッセージは下書きまで。送信はあなたが行います。").isVisible(), true);
    await search.fill("領収書");
    assert.equal(await page.getByText("「領収書」に一致する質問はありません").count(), 1);
    assert.equal(await page.getByText("メールは自動で送信されますか？").count(), 0);
    await search.fill("名刺");
    assert.equal(await page.getByText("名刺の読み取りが間違っているときは？").count(), 1);
    assert.equal(await page.getByText("Gmail 連携で読むのはどの範囲？").count(), 0);
    assert.equal(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.locator('a[href="/app/account/login"]').count(), 1);
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
  }
});
