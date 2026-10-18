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
    window.taskCalls.push({ path, method });
    const stamp = "2026-10-17T00:00:00.000Z";
    if (path.startsWith("/api/tasks/page?")) {
      const query = new URL(path, location.href).searchParams;
      const status = query.get("status"), scope = query.get("scope"), search = query.get("query") || "";
      const items = window.taskRows.filter(row => row.status === status && row.title.includes(search) && (scope === "all" || (scope === "relationship") === (row.category === "relationship")));
      return Response.json({ success: true, data: { actorId: "a", status, scope, query: search, items: items.map(row => ({
        id: row.id, titlePreview: row.title, locationPreview: null, status: row.status, category: row.category, priority: "normal",
        plannedDate: "2026-10-17", dueAt: null, updatedAt: stamp, completedAt: row.status === "completed" ? stamp : null,
        relatedContact: null, relationship: row.category === "relationship",
      })), counts: { open: status === "open" ? items.length : 0, completed: status === "completed" ? items.length : 0 },
        total: items.length, hasMore: false, nextCursor: null, asOf: stamp } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    const row = window.taskRows.find(item => item.id === id);
    if (!row) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    const task = { ...row, notes: "", accountId: "a", ownerUserId: "a", priority: "normal", plannedDate: "2026-10-17", updatedAt: stamp };
    if (method === "DELETE") {
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
