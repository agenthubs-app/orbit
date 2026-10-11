import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { TASK_TABS, taskTabFrom } from "../../app/(app)/app/orbit-2026/task/task-tabs";
import { launch } from "../ui/support/orbit-2026-harness";
import { bundle, errorsOf, open } from "../ui/support/orbit-2026-harness";
import { SHELL_STUBS } from "../ui/support/orbit-2026-shell-harness";

// R07 (SC-R07-04): /app/tasks is the Task container — four frozen tabs, ← → keys
// outside text fields, `?tab=`. (R25: the old plan address and its redirect are gone.)
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TaskContainer } from "./app/(app)/app/orbit-2026/task/TaskContainer";
    const f = window.shellFixture;
    const plan = f.plan === "screen" ? <main data-orbit-real-page="agent"><h2>my plan</h2><div style={{ height: 2400 }} /><p id="plan-action-a1">action a1</p></main> : f.plan === "none" ? null : undefined;
    createRoot(document.getElementById("root")).render(<TaskContainer initialTab={f.tab} plan={plan} planStartHref="/app/start"
      calendar={<main data-orbit-real-page="tasks"><p>personal schedule</p></main>}
      todo={<main data-orbit-real-page="tasks"><input aria-label="new to-do" /><p>to-do list</p>
        <div role="radiogroup" aria-label="view"><button type="button" role="radio" aria-checked="true">open</button><button type="button" role="radio" aria-checked="false">done</button></div>
        <div tabIndex={0} aria-label="board" style={{ overflowX: "auto" }}>wide board</div></main>} />);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function container(t: { after: (fn: () => Promise<void>) => void }, tab: string, plan: "screen" | "none" | "unread" = "none", hash = ""): Promise<Page> {
  const page = await open(browser, code, { html: `<div id="root"></div><script>${hash ? `history.replaceState(null, "", "#${hash}");` : ""}window.shellFixture=${JSON.stringify({ path: "/app/tasks", lang: "ja", calls: [], tab, plan })}</script>` });
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

test("?tab= opens a tab directly; anything else is To-do", async (t) => {
  const page = await container(t, "plan");
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "プラン");
  assert.deepEqual(TASK_TABS, ["calendar", "todo", "plan", "memo"]);
  assert.equal(taskTabFrom("memo"), "memo");
  assert.equal(taskTabFrom(["calendar"]), "calendar");
  assert.equal(taskTabFrom("bogus"), "todo");
  assert.match(readFileSync("app/(app)/app/tasks/page.tsx", "utf8"), /<TaskContainer\n\s+initialTab=\{tab\}/u);
});

// Product decision (a), R07 review M5: プラン shows the existing plan screen; the
// empty state is only for people without a plan, and its button starts one.
test("プラン shows the plan screen; without a plan the 「目標を決める」 empty state starts one; unread shows a skeleton", async (t) => {
  const withPlan = await container(t, "plan", "screen");
  await withPlan.getByRole("heading", { name: "my plan" }).waitFor();
  assert.equal(await withPlan.getByRole("button", { name: "目標を決める" }).count(), 0);
  const none = await container(t, "plan", "none");
  await none.getByRole("button", { name: "目標を決める" }).click();
  assert.deepEqual(await none.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "push" in call)), [{ push: "/app/start" }]);
  const unread = await container(t, "plan", "unread");
  assert.equal(await unread.getByRole("button", { name: "目標を決める" }).count(), 0, "no empty state before the plan was read");
});

test("a #plan-action-… link scrolls to that row once the plan screen is there", async (t) => {
  const page = await container(t, "plan", "screen", "plan-action-a1");
  await page.waitForFunction(() => { const r = document.getElementById("plan-action-a1")!.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
});

test("the server reads the plan only for ?tab=plan, and the old plan address is gone (R25)", () => {
  const page = readFileSync("app/(app)/app/tasks/page.tsx", "utf8");
  // R25: the slot also gets `?plan=` (which goal) and `?new=1` (goal input) — still only for ?tab=plan.
  assert.match(page, /const plan = tab === "plan" && actor \? await loadPlanSlot\(actor, \{ newGoal: params\?\.new === "1", planId: [^}]+\}\) : undefined;/u);
  assert.equal(existsSync("app/(app)/app/agent/plan"), false);
});
