import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";
import { SHELL_STUBS } from "../ui/support/orbit-2026-shell-harness";

let browser: Browser;
let code: { js: string; css: string };
let shellCode: { js: string; css: string };
let framedCode: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TaskListWorkspace } from "./app/(app)/app/orbit-2026/todo/TaskListWorkspace";
    createRoot(document.getElementById("root")).render(<TaskListWorkspace actorId="a" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />);
  `, { "^next-auth/react$": `import React from "react"; export const SessionContext = React.createContext(null);` });
  shellCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TaskListWorkspace } from "./app/(app)/app/orbit-2026/todo/TaskListWorkspace";
    import { ShellSlotsProvider, useShellSlots } from "./app/(app)/app/orbit-2026/shell/slots";
    function RailProbe() { return <aside aria-label="Task rail">{useShellSlots().rightRail}</aside>; }
    createRoot(document.getElementById("root")).render(<ShellSlotsProvider><TaskListWorkspace actorId="a" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" /><RailProbe /></ShellSlotsProvider>);
  `, { "^next-auth/react$": `import React from "react"; export const SessionContext = React.createContext(null);` });
  framedCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { TaskListWorkspace } from "./app/(app)/app/orbit-2026/todo/TaskListWorkspace";
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language="ja" signedIn><TaskListWorkspace actorId="a" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId={new URLSearchParams(location.search).get("task") || undefined} /></Orbit2026Shell></OrbitAskProvider>);
  `, { ...SHELL_STUBS, "^next-auth/react$": `${SHELL_STUBS["^next-auth/react$"]}\nexport const SessionContext = React.createContext(null);` });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

const fixture = `<div id="root"></div><script>
  window.taskCalls = [];
  window.taskRows = [
    { id: "personal", title: "\\u4eca\\u65e5\\u306e\\u8cc7\\u6599", status: "open", category: "work" },
    { id: "linked", title: "\\u5c71\\u672c\\u3055\\u3093\\u3078\\u8fd4\\u4fe1", status: "open", category: "relationship" },
    { id: "done", title: "\\u6e08\\u3093\\u3060\\u7528\\u4e8b", status: "completed", category: "work" },
  ];
  window.taskActivityRows = { personal: [{ id: "activity-personal", type: "created", occurredAt: "2026-10-15T01:00:00.000Z" }] };
  window.taskReminderRows = { personal: [{ id: "reminder-personal", fireAt: "2026-10-18T00:00:00.000Z", status: "scheduled" }] };
  window.fetch = async (input, init = {}) => {
    const path = String(input), method = init.method || "GET";
    window.taskCalls.push({ path, method, body: init.body ? JSON.parse(init.body) : null });
    const stamp = "2026-10-17T00:00:00.000Z";
    if (path.startsWith("/api/reminders?")) {
      const id = new URL(path, location.href).searchParams.get("targetId");
      return Response.json({ success: true, data: { reminders: window.taskReminderRows[id] || [] } });
    }
    if (/^\\/api\\/tasks\\/[^/]+\\/activities$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[3]);
      return Response.json({ success: true, data: { activities: window.taskActivityRows[id] || [] } });
    }
    if (path.startsWith("/api/tasks/page?")) {
      const query = new URL(path, location.href).searchParams;
      const status = query.get("status"), scope = query.get("scope"), search = query.get("query") || "";
      const items = window.taskRows.filter(row => row.status === status && row.title.includes(search) && (scope === "all" || (scope === "relationship") === (row.category === "relationship")));
      const start = Number(query.get("cursor") || 0), limit = Number(query.get("limit") || 30);
      return Response.json({ success: true, data: { actorId: "a", status, scope, query: search, items: items.slice(start, start + limit).map(row => ({
        id: row.id, titlePreview: row.title, locationPreview: null, status: row.status, category: row.category, priority: "normal",
        plannedDate: row.plannedDate || "2026-10-17", dueAt: null, updatedAt: stamp, completedAt: row.status === "completed" ? stamp : null,
        relatedContact: null, relationship: row.category === "relationship",
      })), counts: { open: status === "open" ? items.length : 0, completed: status === "completed" ? items.length : 0 },
        total: items.length, hasMore: start + limit < items.length, nextCursor: start + limit < items.length ? String(start + limit) : null, asOf: stamp } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    const row = window.taskRows.find(item => item.id === id);
    if (!row) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    const task = { ...row, notes: row.notes || "", accountId: "a", ownerUserId: "a", priority: "normal", plannedDate: "2026-10-17", updatedAt: row.updatedAt || stamp };
    if (method === "PATCH") {
      const body = JSON.parse(init.body);
      if (body.action === "update") {
        if (window.forceEditConflictOnce) {
          window.forceEditConflictOnce = false;
          row.title = "\\u30b5\\u30fc\\u30d0\\u30fc\\u7248";
          row.updatedAt = "2026-10-17T00:00:01.000Z";
          return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
        }
        if (body.expectedUpdatedAt !== (row.updatedAt || stamp)) return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
        row.title = body.patch.title;
        row.notes = body.patch.notes || row.notes || "";
        row.updatedAt = "2026-10-17T00:00:02.000Z";
        return Response.json({ success: true, data: { task: { ...task, ...row } } });
      }
      row.status = body.action === "complete" ? "completed" : "open";
      return Response.json({ success: true, data: { task: { ...task, status: row.status } } });
    }
    if (method === "DELETE") {
      if (window.forceDeleteConflictOnce) { row.updatedAt = "2026-10-17T00:00:01.000Z"; window.forceDeleteConflictOnce = false; }
      if (JSON.parse(init.body).expectedUpdatedAt !== (row.updatedAt || stamp)) return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
      window.taskRows = window.taskRows.filter(item => item.id !== id);
      return Response.json({ success: true, data: { task } });
    }
    return Response.json({ success: true, data: { task } });
  };
</script>`;

async function page(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const current = await open(browser, code, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html: fixture, width: Number(process.env.ORBIT_TASK_BROWSER_WIDTH ?? 1440) });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("heading", { name: "タスク一覧" }).waitFor();
  await current.getByRole("button", { name: "今日の資料の詳細" }).waitFor();
  return current;
}

test("product task list filters on server scopes and discloses completed tasks", async t => {
  const current = await page(t);
  assert.equal(await current.getByRole("button", { name: "済んだ用事の詳細" }).count(), 0);
  await current.getByRole("radio", { name: "つながり" }).click();
  assert.equal(await current.getByRole("button", { name: "今日の資料の詳細" }).count(), 0);
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).waitFor();
  await current.getByRole("radio", { name: "個人" }).click();
  await current.getByRole("button", { name: "完了したタスクを表示" }).click();
  await current.getByRole("button", { name: "済んだ用事の詳細" }).waitFor();
  assert.ok((await current.evaluate(() => (window as any).taskCalls)).some((call: { path: string }) => call.path.includes("scope=personal")));
});

test("few tasks render in the board's five-column table with local-date groups", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "linked").plannedDate = "2026-10-18"; });
  await current.getByRole("radio", { name: "つながり" }).click();
  await current.getByRole("radio", { name: "すべて" }).click();
  const table = current.getByRole("table", { name: "タスク一覧" });
  await table.waitFor({ timeout: 2000 });
  assert.deepEqual((await table.locator("thead th").allTextContents()).map(value => value.trim()), ["", "タスク", "関連", "期限", ""]);
  await table.getByRole("heading", { name: "今日 1" }).waitFor();
  await table.getByRole("heading", { name: "今後 1" }).waitFor();
  const personal = table.getByRole("row").filter({ has: current.getByRole("button", { name: "今日の資料の詳細" }) });
  await personal.getByRole("cell", { name: "個人", exact: true }).waitFor();
});

test("wide Task list opens selected details in the shell rail, not a covering drawer", async t => {
  const current = await open(browser, shellCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html: fixture, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary", { name: "Task rail" });
  await rail.getByRole("heading", { name: "タスクの詳細" }).waitFor();
  await rail.getByRole("heading", { name: "今日の資料" }).waitFor();
  assert.equal(await current.getByRole("dialog", { name: "タスクの詳細" }).count(), 0);
  assert.equal(new URL(current.url()).searchParams.get("task"), "personal");
  await rail.getByRole("button", { name: "閉じる" }).click();
  assert.equal(new URL(current.url()).searchParams.has("task"), false);
});

test("narrow Task list keeps selected details in a drawer", async t => {
  const current = await open(browser, shellCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html: fixture, width: 1024 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("dialog", { name: "タスクの詳細" }).waitFor();
  assert.equal(await current.getByRole("complementary", { name: "Task rail" }).getByRole("heading", { name: "タスクの詳細" }).count(), 0);
});

test("the real 1440 shell keeps the task detail rail beside the list", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.locator('[data-orbit-2026-shell][data-rail="true"]').waitFor();
  await current.getByRole("complementary").getByRole("heading", { name: "タスクの詳細" }).waitFor();
  assert.equal(await current.getByRole("dialog", { name: "タスクの詳細" }).count(), 0);
  assert.ok(await current.getByRole("table", { name: "タスク一覧" }).isVisible());
});

test("wide Task header lives in the shell without a second page title", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  const header = current.locator("[data-orbit-2026-mainhead]");
  await header.getByRole("heading", { name: "タスク", exact: true }).waitFor();
  await header.getByRole("searchbox", { name: "タスクを検索" }).waitFor();
  await header.getByRole("button", { name: "タスクを追加" }).waitFor();
  assert.equal(await current.locator("main").getByRole("heading", { name: "タスク一覧" }).count(), 0);
});

test("selected Task rail reads reminder and history for that task", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("heading", { name: "リマインダー" }).waitFor({ timeout: 2000 });
  await rail.getByRole("heading", { name: "履歴" }).waitFor();
  await rail.locator('time[datetime="2026-10-18T00:00:00.000Z"]').waitFor();
  await rail.getByText("作成", { exact: true }).waitFor();
  const reads = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string }) => call.path.endsWith("/activities") || call.path.startsWith("/api/reminders?"));
  assert.equal(reads.length, 2);
  assert.ok(reads.every((call: { path: string }) => call.path.includes("personal")));
});

test("the real 390 shell keeps Task search and add usable inside the page", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 390 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.locator("main").getByRole("heading", { name: "タスク一覧" }).waitFor();
  const search = current.getByRole("searchbox", { name: "タスクを検索" });
  await search.fill("今日");
  await current.getByRole("button", { name: "今日の資料の詳細" }).waitFor();
  await current.getByRole("button", { name: "タスクを追加" }).click();
  await current.getByRole("dialog", { name: "タスクを追加" }).waitFor();
  assert.equal(await current.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

test("a deep-linked Task does not flash a covering drawer before its wide rail appears", async t => {
  const html = fixture.replace("<script>", `<script>
    window.taskDrawerSeen = false;
    new MutationObserver(() => { if (document.querySelector('[role="dialog"]')) window.taskDrawerSeen = true; }).observe(document.body, { childList: true, subtree: true });
    window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };
  `);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&task=personal", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("complementary").getByRole("heading", { name: "今日の資料" }).waitFor();
  assert.equal(await current.evaluate(() => (window as any).taskDrawerSeen), false);
});

test("task drawer edits title and notes with one versioned write", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: "編集する" }).click();
  await current.getByRole("textbox", { name: "やること" }).fill("更新した資料");
  await current.getByRole("textbox", { name: "メモ" }).fill("確認する");
  await current.getByRole("button", { name: "保存" }).click();
  await current.getByRole("heading", { name: "更新した資料" }).waitFor();
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.expectedUpdatedAt, "2026-10-17T00:00:00.000Z");
  assert.deepEqual(writes[0].body.patch, { title: "更新した資料", notes: "確認する" });
});

test("task drawer conflict keeps the draft without a second write", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: "編集する" }).click();
  await current.getByRole("textbox", { name: "やること" }).fill("私の下書き");
  await current.evaluate(() => { (window as any).forceEditConflictOnce = true; });
  await current.getByRole("button", { name: "保存" }).click();
  await current.getByText(/ほかの画面で変更されました/).waitFor();
  assert.equal(await current.getByRole("textbox", { name: "やること" }).inputValue(), "私の下書き");
  assert.equal(await current.getByRole("button", { name: "保存" }).isDisabled(), true);
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.equal(writes.length, 1);
  await current.getByRole("button", { name: "キャンセル" }).click();
  await current.getByRole("heading", { name: "サーバー版" }).waitFor();
});

test("product task list deletion is cancelled safely and only disappears after confirmation", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: "タスクを削除" }).click();
  await current.getByRole("alertdialog").waitFor();
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string }) => call.method === "DELETE").length, 0);
  await current.getByRole("button", { name: "キャンセル" }).click();
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string }) => call.method === "DELETE").length, 0);
  await current.getByRole("button", { name: "タスクを削除" }).click();
  await current.getByRole("button", { name: "削除する" }).click();
  await current.getByRole("button", { name: "今日の資料の詳細" }).waitFor({ state: "detached" });
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string }) => call.method === "DELETE").length, 1);
});

test("arrow keys move task-list selection and focus without writing", async t => {
  const current = await page(t);
  const first = current.getByRole("button", { name: "山本さんへ返信の詳細" });
  const second = current.getByRole("button", { name: "今日の資料の詳細" });
  await first.click();
  await first.press("ArrowDown");
  await current.waitForFunction(() => document.querySelector('[aria-label="今日の資料の詳細"]')?.getAttribute("aria-current") === "true");
  assert.equal(await second.evaluate(element => element === document.activeElement), true);
  await second.press("ArrowUp");
  await current.waitForFunction(() => document.querySelector('[aria-label="山本さんへ返信の詳細"]')?.getAttribute("aria-current") === "true");
  assert.equal(await first.evaluate(element => element === document.activeElement), true);
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string }) => call.method !== "GET").length, 0);
});

test("E completes the selected task row without opening its action button", async t => {
  const current = await page(t);
  const row = current.getByRole("button", { name: "今日の資料の詳細" });
  await row.click();
  await row.press("e");
  await row.waitFor({ state: "detached" });
  const writes = await current.evaluate(() => (window as any).taskCalls.filter((call: { method: string }) => call.method !== "GET"));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PATCH");
  assert.equal(writes[0].body.action, "complete");
});

test("N opens the To-do add dialog without writing a task", async t => {
  const current = await page(t);
  await current.keyboard.press("n");
  await current.getByRole("dialog", { name: "タスクを追加" }).waitFor({ timeout: 2000 });
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string }) => call.method !== "GET").length, 0);
});

test("typing N in task search does not open the add dialog", async t => {
  const current = await page(t);
  const search = current.getByRole("searchbox", { name: "タスクを検索" });
  await search.focus();
  await current.keyboard.press("n");
  assert.equal(await search.inputValue(), "n");
  assert.equal(await current.getByRole("dialog", { name: "タスクを追加" }).count(), 0);
});

test("overdue task rows use the warning color while today's rows do not", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "linked").plannedDate = "2026-10-16"; });
  await current.getByRole("radio", { name: "つながり" }).click();
  await current.getByRole("heading", { name: "期限超過 1" }).waitFor();
  await current.getByRole("radio", { name: "すべて" }).click();
  const colors = await current.evaluate(() => {
    return {
      heading: getComputedStyle(document.querySelector("h2[class*=overdue]")!).color,
      overdue: getComputedStyle(document.querySelector('[aria-label="山本さんへ返信の詳細"] strong')!).color,
      today: getComputedStyle(document.querySelector('[aria-label="今日の資料の詳細"] strong')!).color,
    };
  });
  assert.equal(colors.overdue, colors.heading);
  assert.notEqual(colors.today, colors.heading);
});

test("hover and keyboard focus expose a quick complete action that moves the task out of open rows", async t => {
  const current = await page(t);
  const row = current.getByRole("button", { name: "今日の資料の詳細" });
  await row.hover();
  const complete = current.getByRole("button", { name: "今日の資料を完了" });
  await complete.waitFor();
  await current.waitForFunction(() => {
    const action = document.querySelector('[aria-label="今日の資料を完了"]');
    return action && getComputedStyle(action).opacity === "1";
  });
  await current.mouse.move(0, 0);
  await row.focus();
  await current.waitForFunction(() => {
    const action = document.querySelector('[aria-label="今日の資料を完了"]');
    return action && getComputedStyle(action).opacity === "1";
  });
  await complete.click();
  await row.waitFor({ state: "detached" });
  const writes = await current.evaluate(() => (window as any).taskCalls.filter((call: { method: string }) => call.method !== "GET"));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PATCH");
  assert.equal(writes[0].body.action, "complete");
});

test("deleting the only row on a later page returns to remaining tasks rather than showing the global empty state", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).taskRows = Array.from({ length: 31 }, (_, index) => ({ id: `many-${index}`, title: `タスク ${index}`, status: "open", category: "work" })); });
  await current.getByRole("radio", { name: "つながり" }).click();
  await current.getByRole("radio", { name: "すべて" }).click();
  await current.getByRole("button", { name: "次のページ" }).click();
  await current.getByRole("button", { name: "タスク 30の詳細" }).click();
  await current.getByRole("button", { name: "タスクを削除" }).click();
  await current.getByRole("button", { name: "削除する" }).click();
  await current.getByRole("button", { name: "タスク 0の詳細" }).waitFor();
  assert.equal(await current.getByText("タスクはまだありません", { exact: true }).count(), 0);
});

test("completing the only open row on a later page returns to remaining open tasks", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).taskRows = Array.from({ length: 31 }, (_, index) => ({ id: `many-${index}`, title: `タスク ${index}`, status: "open", category: "work" })); });
  await current.getByRole("radio", { name: "つながり" }).click();
  await current.getByRole("radio", { name: "すべて" }).click();
  await current.getByRole("button", { name: "次のページ" }).click();
  await current.getByRole("checkbox", { name: "タスク 30を完了" }).click();
  await current.getByRole("button", { name: "タスク 0の詳細" }).waitFor({ timeout: 5000 });
  assert.equal(await current.getByText("タスクはまだありません", { exact: true }).count(), 0);
});

test("a stale delete closes confirmation, reloads the detail, and retries only with the new version", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).forceDeleteConflictOnce = true; });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: "タスクを削除" }).click();
  await current.getByRole("button", { name: "削除する" }).click();
  await current.getByRole("alertdialog").waitFor({ state: "detached" });
  await current.getByRole("button", { name: "今日の資料の詳細" }).waitFor();
  assert.equal(await current.getByRole("button", { name: "今日の資料の詳細" }).count(), 1, "a conflict keeps the task");
  await current.getByRole("button", { name: "タスクを削除" }).click();
  assert.equal(await current.getByRole("alertdialog").getByText("メモとやりとりは残ります。", { exact: true }).count(), 1);
  await current.getByRole("button", { name: "削除する" }).click();
  await current.getByRole("button", { name: "今日の資料の詳細" }).waitFor({ state: "detached" });
  const deletes = await current.evaluate(() => (window as any).taskCalls.filter((call: { method: string }) => call.method === "DELETE"));
  assert.deepEqual(deletes.map((call: { body: { expectedUpdatedAt: string } }) => call.body.expectedUpdatedAt), ["2026-10-17T00:00:00.000Z", "2026-10-17T00:00:01.000Z"]);
});
