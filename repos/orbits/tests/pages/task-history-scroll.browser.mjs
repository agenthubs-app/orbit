import assert from "node:assert/strict";

import { encode } from "next-auth/jwt";
import { chromium } from "playwright";

const origin = process.env.ORBIT_TASKS_QA_BASE_URL;
const secret = process.env.ORBIT_TASKS_QA_SECRET;
assert.ok(origin && secret, "Use the isolated Task browser preview and test-only secret.");
const url = new URL(origin);
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1");

const cookie = await encode({
  secret,
  salt: "authjs.session-token",
  token: {
    sub: "user_orbit_task_browser_qa",
    email: "task-browser-qa@orbit.test",
    name: "Task Browser QA",
    authenticatedAt: Date.now(),
  },
});
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 650 } });
  await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto(`${origin}/app/tasks?tab=todo`, { waitUntil: "networkidle", timeout: 60000 });
  assert.equal(response?.status(), 200);
  await page.locator('a[href="/app/tasks?tab=todo&view=all"]').waitFor();
  await page.waitForFunction(() => document.documentElement.scrollHeight >= innerHeight + 300);
  await page.evaluate(() => window.scrollTo(0, 300));
  assert.equal(await page.evaluate(() => window.scrollY), 300);

  // Trigger the actual product link without Playwright changing the scroll
  // position to bring the link into view before navigation.
  await page.locator('a[href="/app/tasks?tab=todo&view=all"]').evaluate((link) => link.click());
  await page.waitForURL(`${origin}/app/tasks?tab=todo&view=all`);
  await page.goBack({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForURL(`${origin}/app/tasks?tab=todo`);
  await page.waitForFunction(() => document.documentElement.scrollHeight >= innerHeight + 300);
  assert.equal(await page.locator("[data-task-slot]").getAttribute("data-task-slot"), "todo");
  await page.waitForFunction(() => Math.abs(window.scrollY - 300) <= 2, null, { timeout: 10000 });
  const restored = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(restored - 300) <= 2, `Task scroll position after Back: ${restored}`);

  // The Task container stays mounted while a tab click replaces ?tab=. The
  // later full navigation must save the URL the user actually left.
  await page.goto(`${origin}/app/tasks?tab=calendar`, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => sessionStorage.removeItem("orbit-task-scroll:/app/tasks?tab=todo"));
  await page.getByRole("tab", { name: "To-do" }).last().click();
  await page.waitForURL(`${origin}/app/tasks?tab=todo`);
  await page.waitForFunction(() => document.documentElement.scrollHeight >= innerHeight + 300);
  await page.evaluate(() => window.scrollTo(0, 300));
  assert.equal(await page.evaluate(() => window.scrollY), 300);
  await page.locator('a[href="/app/tasks?tab=todo&view=all"]').evaluate((link) => link.click());
  await page.waitForURL(`${origin}/app/tasks?tab=todo&view=all`);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("orbit-task-scroll:/app/tasks?tab=todo")), "300");
  await page.goBack({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForURL(`${origin}/app/tasks?tab=todo`);
  await page.waitForFunction(() => document.documentElement.scrollHeight >= innerHeight + 300);
  await page.waitForFunction(() => Math.abs(window.scrollY - 300) <= 2, null, { timeout: 10000 });
  assert.equal(await page.locator("[data-task-slot]").getAttribute("data-task-slot"), "todo");
  assert.deepEqual(errors, []);
  console.log("Task history Back restored the To-do segment and scroll position after direct and tab-switched entries.");
} finally {
  await browser.close();
}
