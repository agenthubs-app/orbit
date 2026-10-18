import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TaskListWorkspace } from "./app/(app)/app/orbit-2026/todo/TaskListWorkspace";
    createRoot(document.getElementById("root")).render(<TaskListWorkspace actorId="a" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />);
  `, { "^next-auth/react$": `import React from "react"; export const SessionContext = React.createContext(null);` });
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
  window.fetch = async (input, init = {}) => {
    const path = String(input), method = init.method || "GET";
    window.taskCalls.push({ path, method, body: init.body ? JSON.parse(init.body) : null });
    const stamp = "2026-10-17T00:00:00.000Z";
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
    const task = { ...row, notes: "", accountId: "a", ownerUserId: "a", priority: "normal", plannedDate: "2026-10-17", updatedAt: row.updatedAt || stamp };
    if (method === "PATCH") {
      row.status = JSON.parse(init.body).action === "complete" ? "completed" : "open";
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
  const current = await open(browser, code, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html: fixture });
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
