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
    const root = createRoot(document.getElementById("root"));
    window.setTaskListTimeZone = timeZone => root.render(<TaskListWorkspace actorId="a" language="ja" date="2026-10-17" timeZone={timeZone} />);
    window.setTaskListTimeZone("Asia/Tokyo");
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
    { id: "personal", title: "\\u4eca\\u65e5\\u306e\\u8cc7\\u6599", status: "open", category: "work", plannedDate: "2026-10-17" },
    { id: "linked", title: "\\u5c71\\u672c\\u3055\\u3093\\u3078\\u8fd4\\u4fe1", status: "open", category: "relationship", plannedDate: "2026-10-17" },
    { id: "done", title: "\\u6e08\\u3093\\u3060\\u7528\\u4e8b", status: "completed", category: "work", plannedDate: "2026-10-17" },
  ];
  window.taskActivityRows = { personal: [{ id: "activity-personal", type: "created", occurredAt: "2026-10-15T01:00:00.000Z" }] };
  window.taskReminderRows = { personal: [{ id: "reminder-personal", fireAt: "2026-10-18T00:00:00.000Z", status: "scheduled" }] };
  window.reminderFailNextPost = false;
  window.reminderFailNextPatch = false;
  window.dateFailNextPatch = false;
  window.eventFailNextGet = false;
  window.noteFailNextGet = false;
  window.fetch = async (input, init = {}) => {
    const path = String(input), method = init.method || "GET";
    window.taskCalls.push({ path, method, body: init.body ? JSON.parse(init.body) : null });
    const stamp = "2026-10-17T00:00:00.000Z";
    if (path.startsWith("/api/reminders?")) {
      const id = new URL(path, location.href).searchParams.get("targetId");
      return Response.json({ success: true, data: { reminders: window.taskReminderRows[id] || [] } });
    }
    if (path === "/api/reminders" && method === "POST") {
      if (window.reminderFailNextPost) { window.reminderFailNextPost = false; return Response.json({ success: false, error: { code: "UNAVAILABLE" } }, { status: 503 }); }
      const input = JSON.parse(init.body);
      const id = input.targetId;
      const reminder = { id: "added-reminder", fireAt: input.fireAt, status: "scheduled" };
      window.taskReminderRows[id] = [...(window.taskReminderRows[id] || []), reminder];
      return Response.json({ success: true, data: { reminder } });
    }
    if (path.startsWith("/api/reminders/") && method === "PATCH") {
      if (window.reminderFailNextPatch) { window.reminderFailNextPatch = false; return Response.json({ success: false, error: { code: "UNAVAILABLE" } }, { status: 503 }); }
      const id = decodeURIComponent(path.split("/")[3]);
      for (const rows of Object.values(window.taskReminderRows)) for (const row of rows) if (row.id === id) row.status = "cancelled";
      return Response.json({ success: true, data: {} });
    }
    if (/^\\/api\\/tasks\\/[^/]+\\/activities$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[3]);
      return Response.json({ success: true, data: { activities: window.taskActivityRows[id] || [] } });
    }
    if (path.startsWith("/api/events/")) {
      if (window.eventFailNextGet) { window.eventFailNextGet = false; return Response.json({ success: false, error: { code: "UNAVAILABLE" } }, { status: 503 }); }
      const id = decodeURIComponent(path.slice("/api/events/".length));
      return Response.json({ success: true, data: { event: { id, title: "Japan Startup Night", startsAt: "2026-09-18T09:00:00.000Z" } } });
    }
    if (path.startsWith("/api/notes/")) {
      if (window.noteFailNextGet) { window.noteFailNextGet = false; return Response.json({ success: false, error: { code: "UNAVAILABLE" } }, { status: 503 }); }
      const id = decodeURIComponent(path.slice("/api/notes/".length));
      return Response.json({ success: true, data: { note: { id, title: "9/13 Meeting memo", body: window.sourceNoteBody || "Send the revised deck.", createdAt: "2026-09-13T09:00:00.000Z" } } });
    }
    if (path.startsWith("/api/tasks/page?")) {
      const query = new URL(path, location.href).searchParams;
      const status = query.get("status"), scope = query.get("scope"), search = query.get("query") || "";
      const items = window.taskRows.filter(row => row.status === status && row.title.includes(search) && (scope === "all" || (scope === "relationship") === (row.category === "relationship")));
      const start = Number(query.get("cursor") || 0), limit = Number(query.get("limit") || 30);
      return Response.json({ success: true, data: { actorId: "a", status, scope, query: search, items: items.slice(start, start + limit).map(row => ({
        id: row.id, titlePreview: row.title, locationPreview: null, status: row.status, category: row.category, priority: "normal",
        plannedDate: row.plannedDate ?? null, dueAt: row.dueAt || null, updatedAt: stamp, completedAt: row.status === "completed" ? stamp : null,
        relatedContact: null, relationship: row.category === "relationship",
      })), counts: { open: status === "open" ? items.length : 0, completed: status === "completed" ? items.length : 0 },
        total: items.length, hasMore: start + limit < items.length, nextCursor: start + limit < items.length ? String(start + limit) : null, asOf: stamp } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    const row = window.taskRows.find(item => item.id === id);
    if (!row) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    const task = { ...row, notes: row.notes || "", accountId: "a", ownerUserId: "a", priority: "normal", updatedAt: row.updatedAt || stamp };
    if (method === "PATCH") {
      const body = JSON.parse(init.body);
      if (body.action === "update") {
        if (window.dateFailNextPatch && ("plannedDate" in body.patch || "dueAt" in body.patch)) {
          window.dateFailNextPatch = false;
          return Response.json({ success: false, error: { code: "UNAVAILABLE" } }, { status: 503 });
        }
        if (window.forceEditConflictOnce) {
          window.forceEditConflictOnce = false;
          row.title = "\\u30b5\\u30fc\\u30d0\\u30fc\\u7248";
          row.updatedAt = "2026-10-17T00:00:01.000Z";
          return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
        }
        if (body.expectedUpdatedAt !== (row.updatedAt || stamp)) return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
        for (const [field, value] of Object.entries(body.patch)) {
          if (value === null) delete row[field]; else row[field] = value;
        }
        row.notes ||= "";
        row.updatedAt = "2026-10-17T00:00:02.000Z";
        const updatedTask = { ...task, ...row };
        if (body.patch.plannedDate === null) delete updatedTask.plannedDate;
        if (body.patch.dueAt === null) delete updatedTask.dueAt;
        return Response.json({ success: true, data: { task: updatedTask } });
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

test("Task list and detail keep the board's card hierarchy at wide width", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "personal").notes = "Keep this note"; });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const card = current.locator("[data-task-list-card]");
  await card.getByRole("radio", { name: "すべて" }).waitFor();
  await card.getByRole("table", { name: "タスク一覧" }).waitFor();
  await card.getByRole("button", { name: "完了したタスクを表示" }).waitFor();
  await card.getByRole("button", { name: "完了したタスクを表示" }).click();
  await card.getByRole("heading", { name: "完了 1" }).waitFor();
  assert.ok(await card.getByText("1件", { exact: true }).evaluate(element => element.getBoundingClientRect().width > 20));
  const rail = current.getByRole("complementary");
  await rail.locator('[data-task-detail-card="identity"]').getByRole("heading", { name: "今日の資料" }).waitFor();
  await rail.locator('[data-task-detail-card="schedule"]').getByRole("button", { name: /日付を編集/ }).waitFor();
  await rail.locator('[data-task-detail-card="history"]').getByRole("heading", { name: "履歴" }).waitFor();
  await rail.getByText("Keep this note").waitFor();
  assert.equal(await rail.locator('[data-task-detail-card="schedule"]').getByText("Keep this note").count(), 0);
  assert.ok(await rail.locator('[data-task-detail-card="identity"]').evaluate(element => {
    const following = element.nextElementSibling;
    return following !== null && element.getBoundingClientRect().bottom < following.getBoundingClientRect().top;
  }));
  assert.ok(await card.evaluate(element => getComputedStyle(element).borderRadius !== "0px"));
  assert.equal(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test("the middle-width Task table keeps due dates readable", async t => {
  const html = fixture.replace('id: "personal", title:', 'id: "personal", dueAt: "2026-10-17T10:30:00.000Z", title:')
    .replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 768 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  const row = current.getByRole("table", { name: "タスク一覧" }).getByRole("row").filter({ has: current.getByRole("button", { name: "今日の資料の詳細" }) });
  const dateCell = row.locator("td").nth(3);
  await dateCell.waitFor();
  const clipped: number[] = [];
  for (const width of [768, 850, 851, 900, 959, 960, 1000, 1001, 1024]) {
    await current.setViewportSize({ width, height: 900 });
    if (!await dateCell.evaluate(element => element.scrollWidth <= element.clientWidth)) clipped.push(width);
    assert.equal(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}px`);
  }
  assert.deepEqual(clipped, [], `due date clipped at ${clipped.join(", ")}px`);
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

test("selected Task shows a linked event and removes it when selection changes", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "linked").relatedEventId = "event-linked"; });
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).click();
  const rail = current.getByRole("complementary");
  const related = rail.getByRole("region", { name: "関連するイベント" });
  await related.getByRole("link", { name: "Japan Startup Night" }).waitFor({ timeout: 2000 });
  assert.equal(await related.getByRole("link", { name: "Japan Startup Night" }).getAttribute("href"), "/app/events/event-linked");
  const eventTime = related.locator('time[datetime="2026-09-18T09:00:00.000Z"]');
  assert.match(await eventTime.textContent() ?? "", /9\/18.*18:00/);
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string }) => call.path === "/api/events/event-linked").length, 1);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  assert.equal(await rail.getByRole("region", { name: "関連するイベント" }).count(), 0);
});

test("a linked event read failure shows a retry without inventing event details", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => {
    (window as any).taskRows.find((row: { id: string }) => row.id === "linked").relatedEventId = "event-linked";
    (window as any).eventFailNextGet = true;
  });
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).click();
  const related = current.getByRole("complementary").getByRole("region", { name: "関連するイベント" });
  await related.getByRole("alert").getByRole("heading", { name: "イベントを読み込めませんでした" }).waitFor();
  assert.equal(await related.getByRole("link", { name: "Japan Startup Night" }).count(), 0);
  await related.getByRole("button", { name: "再試行" }).click();
  await related.getByRole("link", { name: "Japan Startup Night" }).waitFor();
});

test("selected Task shows its source memo without a broken memo link and clears it on selection change", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "linked").sourceNoteId = "note-source"; });
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).click();
  const rail = current.getByRole("complementary");
  const source = rail.getByRole("region", { name: "元になったメモ" });
  await source.getByText("Send the revised deck.").waitFor({ timeout: 2000 });
  await source.getByText("9/13 Meeting memo").waitFor();
  assert.match(await source.locator('time[datetime="2026-09-13T09:00:00.000Z"]').textContent() ?? "", /9\/13/);
  assert.equal(await source.getByRole("link").count(), 0);
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string }) => call.path === "/api/notes/note-source").length, 1);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  assert.equal(await rail.getByRole("region", { name: "元になったメモ" }).count(), 0);
});

test("source memo read failure offers retry without displaying stale memo text", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => {
    (window as any).taskRows.find((row: { id: string }) => row.id === "linked").sourceNoteId = "note-source";
    (window as any).noteFailNextGet = true;
  });
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).click();
  const source = current.getByRole("complementary").getByRole("region", { name: "元になったメモ" });
  await source.getByRole("alert").getByRole("heading", { name: "元のメモを読み込めませんでした" }).waitFor();
  assert.equal(await source.getByText("Send the revised deck.").count(), 0);
  await source.getByRole("button", { name: "再試行" }).click();
  await source.getByText("Send the revised deck.").waitFor();
});

test("a long source memo stays fully readable when no memo detail route exists", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.evaluate(() => {
    (window as any).taskRows.find((row: { id: string }) => row.id === "linked").sourceNoteId = "note-source";
    (window as any).sourceNoteBody = "The complete source memo must remain readable. ".repeat(30);
  });
  await current.getByRole("button", { name: "山本さんへ返信の詳細" }).click();
  const quote = current.getByRole("region", { name: "元になったメモ" }).locator("blockquote");
  await quote.waitFor();
  assert.equal(await quote.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true);
});

test("selected Task rail sets an in-app reminder for one hour and can cancel it", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().waitFor();
  const calls = await current.evaluate(() => (window as any).taskCalls);
  const post = calls.find((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST");
  assert.equal(post.body.targetId, "personal");
  assert.deepEqual(post.body.channels, ["in_app"]);
  assert.equal(post.body.title, "リマインダー");
  assert.equal(post.body.timeZone, "Asia/Tokyo");
  assert.ok(Date.parse(post.body.fireAt) > Date.now());
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().click();
  assert.ok((await current.evaluate(() => (window as any).taskCalls)).some((call: { path: string; method: string }) => call.path === "/api/reminders/added-reminder" && call.method === "PATCH"));
});

test("custom Task reminder rejects the past and saves an unambiguous local time", async t => {
  const futureYear = new Date().getUTCFullYear() + 10;
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "カスタム…" }).click();
  await rail.getByLabel("通知する日時").fill("2020-01-01T12:30");
  await rail.getByRole("button", { name: "設定する" }).click();
  await rail.getByText("これからの有効な日時を選んでください。").waitFor();
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST").length, 0);
  await rail.getByLabel("通知する日時").fill(`${futureYear}-01-02T12:30`);
  await rail.getByRole("button", { name: "設定する" }).click();
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().waitFor();
  const posts = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.fireAt, `${futureYear}-01-02T03:30:00.000Z`);
});

test("tomorrow reminder button sends 8:00 in the task page's time zone", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "明日の朝 8:00" }).click();
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().waitFor();
  const post = (await current.evaluate(() => (window as any).taskCalls)).find((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST");
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tokyo" }).formatToParts(new Date(post.body.fireAt));
  assert.equal(parts.find(part => part.type === "hour")?.value, "08");
  assert.equal(parts.find(part => part.type === "minute")?.value, "00");
});

test("failed reminder creation keeps the scheduled list and retries the same hour request", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "1時間後" }).waitFor();
  await current.evaluate(() => { (window as any).reminderFailNextPost = true; });
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByText("リマインダーを設定できませんでした。もう一度お試しください。").waitFor({ timeout: 2000 });
  assert.ok(await rail.locator('time[datetime="2026-10-18T00:00:00.000Z"]').isVisible());
  assert.equal(await current.getByText("リマインダーを設定しました").count(), 0);
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().waitFor();
  const posts = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST");
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.fireAt, posts[1].body.fireAt);
  assert.equal(posts[0].body.idempotencyKey, posts[1].body.idempotencyKey);
});

test("choosing one hour after a failed custom reminder does not reuse the custom time", async t => {
  const futureYear = new Date().getUTCFullYear() + 10;
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "カスタム…" }).click();
  await rail.getByLabel("通知する日時").fill(`${futureYear}-01-02T12:30`);
  await current.evaluate(() => { (window as any).reminderFailNextPost = true; });
  await rail.getByRole("button", { name: "設定する" }).click();
  await rail.getByText("リマインダーを設定できませんでした。もう一度お試しください。").waitFor();
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByRole("button", { name: /通知を取り消す/ }).last().waitFor();
  const posts = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST");
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.fireAt, `${futureYear}-01-02T03:30:00.000Z`);
  assert.ok(Date.parse(posts[1].body.fireAt) < Date.now() + 2 * 60 * 60 * 1000);
  assert.notEqual(posts[0].body.idempotencyKey, posts[1].body.idempotencyKey);
});

test("failed reminder cancellation leaves the schedule visible and reports that it was not cancelled", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  const cancel = rail.getByRole("button", { name: /通知を取り消す/ });
  await cancel.waitFor();
  await current.evaluate(() => { (window as any).reminderFailNextPatch = true; });
  await cancel.click();
  await rail.getByText("通知を取り消せませんでした。予約は残っています。").waitFor({ timeout: 2000 });
  assert.ok(await rail.locator('time[datetime="2026-10-18T00:00:00.000Z"]').isVisible());
  assert.equal(await current.getByText("リマインダーを取り消しました").count(), 0);
  await cancel.click();
  await rail.locator('time[datetime="2026-10-18T00:00:00.000Z"]').waitFor({ state: "detached" });
});

test("an expired uncertain one-hour reminder explains how to recover instead of silently retiming it", async t => {
  const html = fixture.replace("<script>", `<script>window.shellFixture = { path: "/app/tasks", lang: "ja", unread: false, calls: [] };`);
  const current = await open(browser, framedCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary");
  await rail.getByRole("button", { name: "1時間後" }).waitFor();
  await current.evaluate(() => { (window as any).reminderFailNextPost = true; (window as any).qaNow = Date.now(); Date.now = () => (window as any).qaNow; });
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByText("リマインダーを設定できませんでした。もう一度お試しください。").waitFor({ timeout: 2000 });
  await current.evaluate(() => { (window as any).qaNow += 2 * 60 * 60 * 1000; });
  await rail.getByRole("button", { name: "1時間後" }).click();
  await rail.getByText("前の通知時刻を過ぎました。ページを再読み込みして予約を確認し、改めて設定してください。").waitFor({ timeout: 2000 });
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { path: string; method: string }) => call.path === "/api/reminders" && call.method === "POST").length, 1);
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
  assert.ok(await current.locator("[data-task-list-card]").getByText("1件", { exact: true }).evaluate(element => element.getBoundingClientRect().width > 20));
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

test("task detail edits its date and time through one versioned schedule write", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  assert.equal(await current.getByRole("button", { name: /^日付を編集/ }).count(), 0);
  await current.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.getByLabel("時刻", { exact: true }).fill("09:30");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  const facts = current.getByRole("dialog", { name: "タスクの詳細" });
  const dateRow = facts.getByRole("button", { name: /^日付を編集/ });
  await dateRow.getByText("10/18", { exact: true }).waitFor();
  await current.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("日付を編集"));
  assert.equal(await dateRow.evaluate(element => element === document.activeElement), true, "save returns focus to the opening row");
  assert.match(await facts.getByRole("button", { name: /^時刻を編集/ }).textContent() ?? "", /09:30/);
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.expectedUpdatedAt, "2026-10-17T00:00:00.000Z");
  assert.deepEqual(writes[0].body.patch, { plannedDate: "2026-10-18", dueAt: "2026-10-18T00:30:00.000Z" });
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { method: string; path: string }) => call.method !== "GET" && call.path.startsWith("/api/reminders")).length, 0);
});

test("task detail date and time rows open the shared editor with the chosen field focused", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  assert.match(await current.getByRole("button", { name: /^日付を編集/ }).getAttribute("aria-label") ?? "", /10\/17/);
  assert.match(await current.getByRole("button", { name: /^時刻を編集/ }).getAttribute("aria-label") ?? "", /指定なし/);
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  assert.equal(await current.getByLabel("日付", { exact: true }).evaluate(element => element === document.activeElement), true);
  await current.getByRole("button", { name: "キャンセル" }).click();
  assert.equal(await current.getByRole("button", { name: /^日付を編集/ }).evaluate(element => element === document.activeElement), true, "cancel returns focus to the opening row");
  await current.getByRole("button", { name: /^時刻を編集/ }).click();
  assert.equal(await current.getByLabel("時刻", { exact: true }).evaluate(element => element === document.activeElement), true);
  await current.getByRole("button", { name: "キャンセル" }).click();
  assert.equal(await current.getByRole("button", { name: /^時刻を編集/ }).evaluate(element => element === document.activeElement), true, "time cancel returns focus to its row");
  const writes = await current.evaluate(() => (window as any).taskCalls.filter((call: { method: string }) => call.method !== "GET"));
  assert.equal(writes.length, 0);
});

test("wide Task rail returns keyboard focus to the visible schedule row", async t => {
  const current = await open(browser, shellCode, { origin: "https://orbit.test/app/tasks?tab=todo&view=all", html: fixture, width: 1440 });
  t.after(async () => { const errors = errorsOf(current); await current.close(); assert.deepEqual(errors, []); });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const rail = current.getByRole("complementary", { name: "Task rail" });
  await rail.getByRole("button", { name: /^時刻を編集/ }).click();
  await rail.getByRole("button", { name: "キャンセル" }).click();
  await current.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("時刻を編集"));
  assert.equal(await rail.getByRole("button", { name: /^時刻を編集/ }).evaluate(element => element === document.activeElement), true);
});

test("date draft keeps its opening time zone when the page time zone changes", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  await current.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.getByLabel("時刻", { exact: true }).fill("19:30");
  await current.evaluate(() => (window as any).setTaskListTimeZone("America/New_York"));
  assert.equal(await current.getByLabel("時刻", { exact: true }).inputValue(), "19:30");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).waitFor();
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.patch.dueAt, "2026-10-18T10:30:00.000Z");
});

test("clearing a split task's time keeps its visible date and removes dueAt", async t => {
  const current = await page(t);
  await current.evaluate(() => {
    const row = (window as any).taskRows.find((item: { id: string }) => item.id === "personal");
    row.plannedDate = "2026-10-16";
    row.dueAt = "2026-10-17T10:30:00.000Z";
  });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^時刻を編集/ }).click();
  await current.getByLabel("時刻", { exact: true }).fill("");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  const facts = current.getByRole("dialog", { name: "タスクの詳細" });
  await facts.getByRole("button", { name: /^時刻を編集/ }).getByText("指定なし").waitFor();
  assert.match(await facts.getByRole("button", { name: /^日付を編集/ }).textContent() ?? "", /10\/17/);
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.deepEqual(writes[0].body.patch, { plannedDate: "2026-10-17", dueAt: null });
});

test("moving a due-only task does not create a planned date", async t => {
  const current = await page(t);
  await current.evaluate(() => {
    const row = (window as any).taskRows.find((item: { id: string }) => item.id === "personal");
    delete row.plannedDate;
    row.dueAt = "2026-10-17T10:30:00.000Z";
  });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  await current.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).waitFor();
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.deepEqual(writes[0].body.patch, { dueAt: "2026-10-18T10:30:00.000Z" });
  assert.equal(await current.evaluate(async () => "plannedDate" in (await (await fetch("/api/tasks/personal")).json()).data.task), false);
});

test("clearing a task date remains cleared on the next read", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  await current.getByLabel("日付", { exact: true }).fill("");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  await current.getByRole("dialog", { name: "タスクの詳細" }).getByRole("button", { name: /^日付を編集/ }).getByText("日付なし").waitFor();
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.deepEqual(writes[0].body.patch, { plannedDate: null });
  assert.equal(await current.evaluate(async () => "plannedDate" in (await (await fetch("/api/tasks/personal")).json()).data.task), false);
});

test("second task date deferral needs confirmation before writing", async t => {
  const current = await page(t);
  await current.evaluate(() => { (window as any).taskRows.find((row: { id: string }) => row.id === "personal").deferralCount = 1; });
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  await current.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  await current.getByRole("alertdialog", { name: "もう一度延期しますか？" }).waitFor();
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update").length, 0);
  await current.getByRole("button", { name: "延期する" }).click();
  await current.getByRole("dialog", { name: "タスクの詳細" }).getByText("10/18", { exact: true }).waitFor();
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update").length, 1);
});

test("date edit conflict preserves the draft and blocks a stale retry", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  await current.getByRole("button", { name: /^日付を編集/ }).click();
  await current.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.evaluate(() => { (window as any).forceEditConflictOnce = true; });
  await current.getByRole("button", { name: "日付と時刻を保存" }).click();
  await current.getByText(/ほかの画面で変更されました/).waitFor();
  assert.equal(await current.getByLabel("日付", { exact: true }).inputValue(), "2026-10-18");
  assert.equal(await current.getByRole("button", { name: "日付と時刻を保存" }).isDisabled(), true);
  assert.equal((await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update").length, 1);
});

test("failed date save keeps the draft and retries the same request", async t => {
  const current = await page(t);
  await current.getByRole("button", { name: "今日の資料の詳細" }).click();
  const detail = current.getByRole("dialog", { name: "タスクの詳細" });
  await detail.getByRole("button", { name: /^日付を編集/ }).click();
  await detail.getByLabel("日付", { exact: true }).fill("2026-10-18");
  await current.evaluate(() => { (window as any).dateFailNextPatch = true; });
  await detail.getByRole("button", { name: "日付と時刻を保存" }).click();
  await detail.getByText("日付と時刻を保存できませんでした。もう一度お試しください。").waitFor();
  assert.equal(await detail.getByLabel("日付", { exact: true }).inputValue(), "2026-10-18");
  await detail.getByRole("button", { name: "日付と時刻を保存" }).click();
  await detail.getByText("10/18", { exact: true }).waitFor();
  const writes = (await current.evaluate(() => (window as any).taskCalls)).filter((call: { body: { action?: string } }) => call.body?.action === "update");
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
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
