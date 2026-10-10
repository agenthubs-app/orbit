import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { TASK_TABS, taskTabFrom } from "../../app/(app)/app/orbit-2026/task/task-tabs";
import { launch } from "../ui/support/orbit-2026-harness";
import { bundle, errorsOf, open } from "../ui/support/orbit-2026-harness";
import { SHELL_STUBS } from "../ui/support/orbit-2026-shell-harness";

// R07 (SC-R07-04): /app/tasks is the Task container — four frozen tabs, ← → keys
// outside text fields, `?tab=`; /app/agent/plan lands on プラン.
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TaskContainer } from "./app/(app)/app/orbit-2026/task/TaskContainer";
    createRoot(document.getElementById("root")).render(<TaskContainer initialTab={window.shellFixture.tab}
      calendar={<main data-orbit-real-page="tasks"><p>personal schedule</p></main>}
      todo={<main data-orbit-real-page="tasks"><input aria-label="new to-do" /><p>to-do list</p>
        <div role="radiogroup" aria-label="view"><button type="button" role="radio" aria-checked="true">open</button><button type="button" role="radio" aria-checked="false">done</button></div>
        <div tabIndex={0} aria-label="board" style={{ overflowX: "auto" }}>wide board</div></main>} />);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function container(t: { after: (fn: () => Promise<void>) => void }, tab: string): Promise<Page> {
  const page = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ path: "/app/tasks", lang: "ja", calls: [], tab })}</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("tablist", { name: "Task" }).waitFor();
  return page;
}

test("four tabs in the frozen order; the To-do and calendar slots are the existing pages", async (t) => {
  const page = await container(t, "todo");
  assert.deepEqual(await page.getByRole("tab").allTextContents(), ["カレンダー", "To-do", "プラン", "メモ"]);
  await page.getByText("to-do list").waitFor();
  await page.getByRole("tab", { name: "カレンダー" }).click();
  await page.getByText("personal schedule").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls), [{ replace: "/app/tasks?tab=calendar" }]);
});

test("← → switch tabs from the page, but not while typing in a field", async (t) => {
  const page = await container(t, "todo");
  await page.mouse.click(5, 600);
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "プラン");
  await page.getByRole("button", { name: "目標を決める" }).waitFor();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "メモ");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "カレンダー", "wraps around");
  await page.keyboard.press("ArrowRight");
  await page.getByLabel("new to-do").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "To-do", "the field keeps its arrow keys");
  // R07 review m4: any control in the slot keeps its arrow keys (radio groups, lists, scrollers …).
  await page.getByRole("radio", { name: "open" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByLabel("board").focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "To-do", "focus inside the slot never switches tabs");
});

test("?tab= opens a tab directly; anything else is To-do; /app/agent/plan goes to プラン", async (t) => {
  const page = await container(t, "plan");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "プラン");
  assert.deepEqual(TASK_TABS, ["calendar", "todo", "plan", "memo"]);
  assert.equal(taskTabFrom("memo"), "memo");
  assert.equal(taskTabFrom(["calendar"]), "calendar");
  assert.equal(taskTabFrom("bogus"), "todo");
  assert.match(readFileSync("app/(app)/app/agent/plan/page.tsx", "utf8"), /redirect\("\/app\/tasks\?tab=plan"\)/u);
  assert.match(readFileSync("app/(app)/app/tasks/page.tsx", "utf8"), /<TaskContainer\n\s+initialTab=\{tab\}/u);
});
