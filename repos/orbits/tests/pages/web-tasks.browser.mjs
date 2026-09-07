import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

// Run only against an isolated local preview. All browser API traffic is
// intercepted below; the fixture never writes real Orbit records.
const origin = process.env.ORBIT_TASKS_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_TASKS_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-web-tasks-browser-");
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "web-qa", email: "web-qa@example.test", name: "Web QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TASKS_QA_CHROME ? { executablePath: process.env.ORBIT_TASKS_QA_CHROME } : {}) });
const seed = (id, title) => ({ id, title, notes: "带上资料", accountId: "web-qa", ownerUserId: "web-qa", status: "open", category: "work", priority: "normal", source: "manual", plannedDate: "2026-09-07", createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z" });

try {
  for (const path of ["/app/tasks", "/app/tasks/web%3Aone"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, 307);
    const redirect = new URL(response.headers.get("location"), origin);
    assert.equal(redirect.pathname, "/app/account/login");
    assert.equal(redirect.searchParams.get("next"), path);
  }
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    let tasks = [seed("web:one", "准备会面")];
    let suggestions = [{ id: "suggestion:1", title: "发送会后资料", reason: "昨天已完成会面" }];
    let reminders = [];
    let revision = 1;
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const body = request.postDataJSON();
      let data = {};
      if (url.pathname === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "web-qa", name: "Web QA", email: "web-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
        return;
      }
      if (url.pathname === "/api/tasks" && method === "POST") {
        assert.equal(body.category, "other");
        assert.ok(body.idempotencyKey);
        const task = { ...seed("web:new", body.title), notes: "" };
        tasks.push(task); data = { task };
      } else if (url.pathname === "/api/tasks") {
        data = { tasks: tasks.filter((item) => item.status === url.searchParams.get("status")) };
      } else if (url.pathname === "/api/today") {
        const open = tasks.filter((item) => item.status === "open");
        data = { tasks: open, suggestions, summary: { openTaskCount: open.length, suggestionCount: suggestions.length } };
      } else if (url.pathname === "/api/task-suggestions") data = { suggestions };
      else if (url.pathname.startsWith("/api/task-suggestions/")) {
        suggestions = [];
        const task = seed("web:accepted", "发送会后资料");
        if (url.pathname.endsWith("/accept")) tasks.push(task);
        data = { task };
      } else if (url.pathname === "/api/reminders" && method === "POST") {
        assert.deepEqual(body.channels, ["in_app"]);
        const reminder = { id: "reminder:1", fireAt: body.fireAt, status: "scheduled" };
        reminders.push(reminder); data = { reminder };
      } else if (url.pathname === "/api/reminders") data = { reminders };
      else if (url.pathname.startsWith("/api/reminders/")) { reminders = []; data = {}; }
      else if (url.pathname.endsWith("/activities")) data = { activities: [{ id: "history:1", type: "created", occurredAt: "2026-09-07T00:00:00Z" }] };
      else if (url.pathname.startsWith("/api/tasks/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/tasks/".length));
        let task = tasks.find((item) => item.id === id);
        if (!task) { await route.fulfill({ status: 404, json: { success: false, error: { code: "NOT_FOUND" } } }); return; }
        if (method === "DELETE") tasks = tasks.filter((item) => item.id !== id);
        if (method === "PATCH") {
          if (body.action === "update") assert.equal(body.expectedUpdatedAt, task.updatedAt);
          task = { ...task, ...(body.patch ?? {}), status: body.action === "complete" ? "completed" : body.action === "reopen" ? "open" : task.status, updatedAt: `2026-09-07T00:00:${String(++revision).padStart(2, "0")}Z` };
          tasks = tasks.map((item) => item.id === id ? task : item);
        }
        data = { task };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`${origin}/app/tasks`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /准备会面/ }).waitFor();
    await page.getByLabel("添加待办", { exact: true }).fill("整理会议记录");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page.getByRole("link", { name: /整理会议记录/ }).waitFor();
    await page.getByRole("button", { name: "加入待办", exact: true }).click();
    await page.getByRole("link", { name: /发送会后资料/ }).waitFor();
    await page.screenshot({ path: `${output}/${name}-list.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "list must not overflow horizontally");
    await page.getByRole("link", { name: /准备会面/ }).click();
    await page.getByLabel("待办标题", { exact: true }).fill("准备访谈");
    await page.getByLabel("备注", { exact: true }).fill("确认访谈问题");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "已保存修改" }).waitFor();
    await page.getByRole("button", { name: "1 小时后提醒", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}-detail.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "detail must not overflow horizontally");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "标记完成", exact: true }).click();
    await page.getByRole("button", { name: "恢复待办", exact: true }).waitFor();
    await page.getByRole("button", { name: "恢复待办", exact: true }).click();
    await page.getByRole("button", { name: "删除待办", exact: true }).click();
    assert.equal(tasks.some((task) => task.id === "web:one"), true);
    await page.getByRole("button", { name: "保留待办", exact: true }).click();
    await page.getByRole("button", { name: "删除待办", exact: true }).click();
    await page.getByRole("button", { name: "确认删除待办", exact: true }).click();
    await page.getByText("待办已删除", { exact: true }).waitFor();
    await page.goto(`${origin}/app/today`, { waitUntil: "networkidle" });
    const summary = page.getByRole("region", { name: "今天的待办" });
    await summary.getByRole("link", { name: "全部待办", exact: true }).waitFor();
    await summary.getByRole("link", { name: /整理会议记录/ }).waitFor();
    await page.screenshot({ path: `${output}/${name}-today.png`, fullPage: true });
    assert.deepEqual(errors, [], "no uncaught browser errors");
    console.log(`${name}: auth gate, CRUD, suggestions, reminders, Today entry and responsive checks passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
