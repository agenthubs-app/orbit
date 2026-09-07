import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

// Isolated preview only. All browser API requests are intercepted; no AI,
// business database, or remote account is used by these browser fixtures.
const origin = process.env.ORBIT_TASKS_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_TASKS_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-agent-tasks-browser-");
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "agent-qa", email: "agent-qa@example.test", name: "Agent QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TASKS_QA_CHROME ? { executablePath: process.env.ORBIT_TASKS_QA_CHROME } : {}) });
const task = { id: "task:accepted/one", accountId: "agent-qa", ownerUserId: "agent-qa", title: "准备会面", category: "work", status: "open", priority: "normal", source: "ai_confirmed", dueAt: "2026-09-09T01:00:00Z", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z" };

try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    const sessions = new Map();
    const writes = [];
    let acceptAttempts = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postDataJSON();
      let data = {};
      if (url.pathname === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "agent-qa", name: "Agent QA", email: "agent-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
        return;
      }
      if (url.pathname === "/api/ai/conversations/sessions") {
        if (request.method() === "POST") { sessions.set(body.session.id, body.session); data = { storage: { persisted: true } }; }
        else data = { sessions: [...sessions.values()] };
      } else if (url.pathname === "/api/ai/conversations") {
        data = { assistantMessage: "把会面前需要完成的准备留在待办中。", artifacts: [], taskInteraction: body.message === "fail"
          ? { state: "failed", title: "准备会面", category: "work" }
          : { state: "suggested", title: "准备会面", category: "work", suggestionId: `suggestion:${body.message}`, dueAt: task.dueAt } };
      } else if (url.pathname.startsWith("/api/task-suggestions/")) {
        assert.equal(request.method(), "POST");
        assert.ok(body.idempotencyKey);
        writes.push({ path: url.pathname, key: body.idempotencyKey });
        if (url.pathname.endsWith("/accept")) {
          if (++acceptAttempts === 1) { await route.abort("failed"); return; }
          data = { task };
        } else data = { suggestion: { id: decodeURIComponent(url.pathname.split("/").at(-2)), status: "dismissed" } };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`${origin}/app/agent?q=accept`, { waitUntil: "networkidle" });
    const accept = page.getByRole("button", { name: "加入待办：准备会面", exact: true });
    await accept.waitFor();
    assert.notEqual(await accept.evaluate((button) => getComputedStyle(button).backgroundColor), "rgba(0, 0, 0, 0)", "the primary task action needs its existing filled-button affordance");
    await page.screenshot({ path: `${output}/${name}-suggested.png`, fullPage: true });
    await accept.click();
    await page.getByRole("alert").filter({ hasText: "连接失败" }).waitFor();
    await accept.click();
    await page.getByRole("link", { name: "查看待办", exact: true }).waitFor();
    assert.equal(writes[0].key, writes[1].key, "uncertain retries retain the same key");
    assert.equal(await page.getByRole("link", { name: "查看待办", exact: true }).getAttribute("href"), "/app/tasks/task%3Aaccepted%2Fone");
    await page.waitForFunction(() => !document.querySelector('[data-agent-task-state="suggested"]'));
    const acceptedSession = [...sessions.values()].find((session) => session.messages.some((message) => message.taskInteraction?.state === "created"));
    assert.ok(acceptedSession, "acceptance is persisted with the conversation");
    await page.goto(`${origin}/app/agent?session=${encodeURIComponent(acceptedSession.id)}`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "查看待办", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${name}-created.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "thread must not overflow horizontally");
    await page.goto(`${origin}/app/agent?q=dismiss`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "暂不需要：准备会面", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "已忽略这条建议" }).waitFor();
    await page.goto(`${origin}/app/agent?q=fail`, { waitUntil: "networkidle" });
    await page.getByRole("alert").filter({ hasText: "未能创建待办" }).waitFor();
    await page.getByRole("link", { name: "全部待办", exact: true }).waitFor();
    assert.deepEqual(errors, [], "no uncaught browser errors");
    console.log(`${name}: suggestion, failure/retry, acceptance, history restoration, dismissal and failed creation passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
