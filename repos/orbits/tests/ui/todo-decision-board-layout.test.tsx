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
    import { TodoPresenter } from "./app/(app)/app/orbit-2026/todo/TodoPresenter";
    import { todoPageView } from "./app/(app)/app/orbit-2026/todo/todo-view-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    import { demoTodoPage } from "./shared/mock/demo-world/todo";
    const noop = () => {};
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja"><TodoPresenter state="ready" view={todoPageView(demoTodoPage)} onRetry={noop} onDecision={noop} onMore={noop} /></Orbit2026Scope>);
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("decision rows keep the board's compact title size and avatar column spacing", async t => {
  const page = await open(browser, code, { width: 1440 });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  const title = page.getByText("山本 彩さんに資料を再送", { exact: true });
  const subtitle = page.getByText("資料の再送をご確認ください", { exact: true });
  const avatar = page.getByRole("img", { name: "山本 彩" });
  await title.waitFor();
  const titleBox = await title.boundingBox();
  const avatarBox = await avatar.boundingBox();
  assert.ok(titleBox && avatarBox);
  assert.equal(await title.evaluate(element => getComputedStyle(element).fontSize), "13px");
  assert.ok(titleBox.width < 200, `title should occupy its text width, not the whole data column: ${titleBox.width}`);
  assert.equal(Math.round(titleBox.x - avatarBox.x), 50);
  assert.equal(await subtitle.evaluate(element => getComputedStyle(element).fontWeight), "500");
});
