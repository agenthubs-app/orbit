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
    const plan = f.plan === "screen" ? <main data-orbit-real-page="agent"><h2>my plan</h2><button type="button" onClick={() => f.calls.push({write:true})}>Save plan</button><div style={{ height: 2400 }} /><p id="plan-action-a1">action a1</p></main> : f.plan === "none" ? null : undefined;
    const root = createRoot(document.getElementById("root"));
    const renderTab = (tab) => root.render(<TaskContainer initialTab={tab} plan={plan} planStartHref="/app/start" demo={f.demo}
      calendar={<main data-orbit-real-page="tasks"><p>personal schedule</p></main>}
      todo={<main data-orbit-real-page="tasks"><input aria-label="new to-do" /><p>to-do list</p>
        <div role="radiogroup" aria-label="view"><button type="button" role="radio" aria-checked="true">open</button><button type="button" role="radio" aria-checked="false">done</button></div>
        <div tabIndex={0} aria-label="board" style={{ overflowX: "auto" }}>wide board</div></main>} />);
    window.renderTaskTab = renderTab;
    renderTab(f.tab);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function container(t: { after: (fn: () => Promise<void>) => void }, tab: string, plan: "screen" | "none" | "unread" = "none", hash = "", demo?: object): Promise<Page> {
  const page = await open(browser, code, { html: `<div id="root"></div><script>${hash ? `history.replaceState(null, "", "#${hash}");` : ""}window.shellFixture=${JSON.stringify({ path: "/app/tasks", lang: "ja", calls: [], tab, plan, demo })};
    if (window.shellFixture.demo) window.fetch = async (path, options) => {
      if (path === "/api/guide/state") { window.shellFixture.calls.push({ patch: JSON.parse(options.body) }); return Response.json({ success: true, data: {} }); }
      return Response.json({ success: false }, { status: 503 });
    };</script>` });
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

test("demo plan shows the real 2/3 banner, persists collapse, and blocks plan writes", async (t) => {
  const demo = { bannerCollapsed: false, completed: 2, confirmedContacts: 3, nextStep: "plan",
    steps: { contacts: true, goal: true, plan: false } };
  const page = await container(t, "plan", "screen", "", demo);
  await page.getByText(/2\s*\/\s*3/u).first().waitFor();
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByRole("dialog").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "write" in call)), []);
  await page.getByRole("link", { name: /guide|ガイド|引导/iu }).first().waitFor();
  await page.getByRole("button", { name: /close|閉じる|关闭/iu }).click();
  await page.getByRole("button", { name: /collapse|収|收/iu }).click();
  await page.getByRole("button", { name: /sample|サンプル|示例/iu }).waitFor();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((call: any) => call.patch?.bannerCollapsed === true));
});

test("demo empty plan blocks its create action and a stored pill can reopen", async (t) => {
  const demo = { bannerCollapsed: true, completed: 1, confirmedContacts: 3, nextStep: "goal",
    steps: { contacts: true, goal: false, plan: false } };
  const page = await container(t, "plan", "none", "", demo);
  await page.locator("[data-task-demo-pill]").waitFor();
  await page.getByRole("button", { name: "目標を決める" }).click();
  await page.getByRole("dialog").waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "push" in call)), []);
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.locator("[data-task-demo-pill] button").first().click();
  await page.locator("[data-task-demo-banner]").waitFor();
  await page.waitForFunction(() => (window as any).shellFixture.calls.some((call: any) => call.patch?.bannerCollapsed === false));
});

test("switching to plan waits for its server demo decision before enabling add", async (t) => {
  const transientCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ShellSlotsProvider, useShellSlots } from "./app/(app)/app/orbit-2026/shell/slots";
    import { TaskContainer } from "./app/(app)/app/orbit-2026/task/TaskContainer";
    function Page() {
      const slots = useShellSlots();
      return <><div data-shell-left>{slots.left}</div><div data-shell-right>{slots.right}</div><TaskContainer initialTab="todo" calendar={null} todo={<main>todo</main>} plan={undefined} /></>;
    }
    createRoot(document.getElementById("root")).render(<ShellSlotsProvider><Page /></ShellSlotsProvider>);
  `, SHELL_STUBS);
  const page = await open(browser, transientCode, { html: `<div id="root"></div><script>window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("tab", { name: "プラン" }).click();
  const add = page.locator("[data-shell-right]").getByRole("button", { name: "目標を追加" });
  await add.waitFor();
  assert.equal(await add.isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "push" in call)), []);
});

test("memo slot opens its add flow from the Task header without changing the selected tab", async (t) => {
  const memoCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ShellSlotsProvider, useShellSlots } from "./app/(app)/app/orbit-2026/shell/slots";
    import { TaskContainer } from "./app/(app)/app/orbit-2026/task/TaskContainer";
    function Page() {
      const slots = useShellSlots();
      return <><div data-shell-right>{slots.right}</div><TaskContainer initialTab="memo" calendar={null} todo={null} memo={<main><p>memo workspace</p></main>} /></>;
    }
    createRoot(document.getElementById("root")).render(<ShellSlotsProvider><Page /></ShellSlotsProvider>);
  `, SHELL_STUBS);
  const page = await open(browser, memoCode, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    window.memoApiAvailable=true;
    window.fetch=async ()=>window.memoApiAvailable
      ? Response.json({success:true,data:{notes:[],total:0}})
      : Response.json({success:false}, {status:503});
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  page.setDefaultTimeout(3000);
  await page.getByText("memo workspace").waitFor();
  const add = page.locator("[data-shell-right]").getByRole("button", { name: "メモを追加" });
  await page.waitForFunction(() => (document.querySelector("[data-shell-right] button") as HTMLButtonElement | null)?.disabled === false);
  await page.evaluate(() => { (window as any).memoApiAvailable = false; window.dispatchEvent(new Event("focus")); });
  assert.equal(await page.evaluate(() => navigator.onLine), true, "the browser stays online during the API outage");
  await page.waitForFunction(() => (document.querySelector("[data-shell-right] button") as HTMLButtonElement | null)?.disabled === true);
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls), [], "unreachable notes must not open the editor");
  await page.evaluate(() => { (window as any).memoApiAvailable = true; window.dispatchEvent(new Event("focus")); });
  await page.waitForFunction(() => (document.querySelector("[data-shell-right] button") as HTMLButtonElement | null)?.disabled === false);
  await page.evaluate(() => { (window as any).memoApiAvailable = false; });
  await add.click();
  await page.waitForFunction(() => (document.querySelector("[data-shell-right] button") as HTMLButtonElement | null)?.disabled === true);
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls), [], "an outage after the probe cannot open the editor");
  await page.evaluate(() => { (window as any).memoApiAvailable = true; window.dispatchEvent(new Event("focus")); });
  await page.waitForFunction(() => (document.querySelector("[data-shell-right] button") as HTMLButtonElement | null)?.disabled === false);
  await add.click();
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls), [{ push: "/app/tasks?tab=memo&new=1" }]);
  assert.equal(await page.locator("[data-task-slot=memo]").count(), 1);
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  assert.equal(await add.isDisabled(), true);
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

test("a same-page route update changes the selected Task tab without another navigation", async (t) => {
  const page = await container(t, "todo");
  await page.evaluate(() => (window as any).renderTaskTab("calendar"));
  await page.getByText("personal schedule").waitFor();
  assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "カレンダー");
  assert.deepEqual(await page.evaluate(() => (window as any).shellFixture.calls), []);
});

test("the Plan header hides 目標を追加 at 1024 but keeps it at 1440", async (t) => {
  const shellCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ShellSlotsProvider, useShellSlots } from "./app/(app)/app/orbit-2026/shell/slots";
    import { TaskContainer } from "./app/(app)/app/orbit-2026/task/TaskContainer";
    function Page() {
      const slots = useShellSlots();
      return <><div data-shell-right>{slots.right}</div><TaskContainer initialTab="plan" plan={<main>my plan</main>} calendar={null} todo={null} /></>;
    }
    createRoot(document.getElementById("root")).render(<ShellSlotsProvider><Page /></ShellSlotsProvider>);
  `, SHELL_STUBS);
  const page = await open(browser, shellCode, {
    width: 1024,
    html: '<div id="root"></div><script>window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]}</script>',
  });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  const addGoal = page.locator("[data-shell-right] button").filter({ hasText: "目標を追加" });
  await addGoal.waitFor({ state: "attached" });
  assert.equal(await addGoal.isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await addGoal.isVisible(), true);
});

test("leaving after a tab URL change saves scroll under the current Task address", async (t) => {
  const page = await open(browser, code, {
    origin: "https://task-scroll.test/app/tasks?tab=calendar",
    html: `<div id="root"></div><div style="height:1500px"></div><script>window.shellFixture=${JSON.stringify({ path: "/app/tasks", lang: "ja", calls: [], tab: "calendar", plan: "none" })}</script>`,
  });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("tablist", { name: "Task" }).waitFor();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const saved = await page.evaluate(() => {
    history.replaceState(null, "", "/app/tasks?tab=todo");
    window.scrollTo(0, 300);
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    return sessionStorage.getItem("orbit-task-scroll:/app/tasks?tab=todo");
  });
  assert.equal(saved, "300");
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
