/**
 * W0053 review P3-1：导入页真实交互（Playwright + 系统 Chrome，对本机 dev server、本机库）。
 * 选文件 → 改字段对应 → 核对表翻 4 页 → 为「可能重复」选决定 → 提交 → 导入记录；活动导入（活动接口用路由桩：
 * 本机账号没有现场交换，真实后端行为由 tests/services/contact-import-events-postgres.test.ts 覆盖）。
 *
 *   ORBIT_IMPORT_QA_OUT=<仓库外目录> node tests/pages/app-network-import.browser.mjs [1440|375]
 *
 * 只连回环地址；会话 cookie 由 scripts/verify-session-cookie.ts 现签（verify-plan），不落盘、不打印。
 * 该 dev server 必须把 DEEPSEEK_API_KEY 置空（导入后的三层补全否则会真实调用模型）。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const origin = process.env.ORBIT_IMPORT_QA_BASE_URL ?? "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "local dev server only");
const out = process.env.ORBIT_IMPORT_QA_OUT;
assert.ok(out, "set ORBIT_IMPORT_QA_OUT to a directory outside the repository");
const width = Number(process.argv[2] ?? "1440");
const root = fileURLToPath(new URL("../..", import.meta.url));
const cookie = execFileSync("node", ["--import", "tsx", "scripts/verify-session-cookie.ts", "verify-plan"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").pop();

const run = Date.now().toString(36);
const rows = Array.from({ length: 180 }, (_, i) => `QA Person ${run}-${i},QA Org ${i % 7},qa-${run}-${i}@example.com`);
// 第 1 行与已有联系人（之前导入的 Avery Lin）邮箱相同、公司不同 → 必须选择。
const csv = ["Col A,Col B,Col C", `Avery Lin,QA Holdings ${run},avery.lin@example.com`, ...rows].join("\n");

const log = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 1000 } });
  await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") log.push(`console.error ${message.text().slice(0, 200)}`); });
  page.on("pageerror", (error) => log.push(`pageerror ${String(error).slice(0, 200)}`));
  const shot = (name) => page.screenshot({ fullPage: true, path: `${out}/interaction-${width}-${name}.png` });

  // 1. 选文件
  await page.goto(`${origin}/app/contacts/new?method=csv`, { waitUntil: "networkidle" });
  await page.setInputFiles('[data-import-uploader="csv"] input[type=file]', { buffer: Buffer.from(csv), mimeType: "text/csv", name: `qa-${run}.csv` });
  await page.waitForSelector("[data-import-review]");
  assert.match(await page.textContent("[data-import-summary]"), /无法导入 181/, "unknown headers → nothing mapped yet");
  await shot("1-unmapped");

  // 2. 改字段对应
  const mapping = page.locator(".nwi-mapping");
  assert.equal(await mapping.getAttribute("open"), "", "mapping editor opens itself when nothing could be read");
  await mapping.locator("label", { hasText: "姓名" }).locator("select").selectOption("0");
  await mapping.locator("label", { hasText: "公司" }).locator("select").selectOption("1");
  await mapping.locator("label", { hasText: "邮箱" }).locator("select").selectOption("2");
  await page.click("text=按新的对应重新识别");
  await page.waitForFunction(() => /新建 180/.test(document.querySelector("[data-import-summary]")?.textContent ?? ""));
  assert.match(await page.textContent("[data-import-summary]"), /待选择 1/);

  // 3. 翻页：50 行一页，加载到 4 页
  assert.equal(await page.locator("[data-import-row]").count(), 50);
  for (const expected of [100, 150, 181]) {
    await page.click("text=加载更多");
    await page.waitForFunction((n) => document.querySelectorAll("[data-import-row]").length === n, expected);
  }
  assert.equal(await page.locator("text=加载更多").count(), 0, "no more pages after the 4th");
  await shot("2-review-all-pages");

  // 4. 选择决定
  assert.ok(await page.isDisabled("[data-import-commit]"), "cannot import while a duplicate is undecided");
  await page.locator('[data-import-row="1"] select').selectOption("merge");
  await page.waitForSelector('[data-import-row="1"][data-import-decision="merge"]');
  assert.ok(!(await page.isDisabled("[data-import-commit]")));
  // 键盘焦点：Tab 到文件选择时 label 上有可见焦点环（review P3-2）——此处在核对态，回头在空态验证。

  // 5. 提交 → 结果与导入记录
  await page.click("[data-import-commit]");
  await page.waitForSelector("[data-import-result]");
  assert.match(await page.textContent("[data-import-result]"), /新建 180 · 合并 1/);
  await shot("3-done");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-import-log]");
  const logRow = await page.locator("[data-import-log]").first().innerText();
  assert.match(logRow.replace(/\s+/g, " "), new RegExp(`上传 CSV qa-${run}\\.csv 181 180 1 已完成`));
  log.push(`log row: ${logRow.replace(/\s+/g, " ")}`);

  // 空态下键盘 Tab 到文件选择：外层 label 出现焦点环
  await page.focus('[data-import-uploader="csv"] input[type=file]');
  const outline = await page.$eval('[data-import-uploader="csv"] label.btn', (label) => getComputedStyle(label).outlineStyle);
  assert.equal(outline, "solid", "focus ring is visible on the label");

  // 6. 活动导入（接口用路由桩）
  let posted = null;
  await page.route("**/api/contacts/import/events", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { events: [{ alreadyMarked: 0, eventId: "event:qa", exchanged: 3, inNetwork: 2, lastExchangeAt: "2026-09-20T10:00:00.000Z", startsAt: "2026-09-20T09:00:00.000Z", syncing: 1, title: "QA 架空活动" }] }, success: true } });
    }
    posted = JSON.parse(route.request().postData() ?? "{}");
    return route.fulfill({ status: 201, json: { data: { batch: { counts: { created: 0, failed: 0, merged: 2, skipped: 0 }, followUp: { enrichmentDeferredUntil: null, state: "pending" }, id: "contact-import:qa", kind: "event", status: "completed" }, replayed: false }, success: true } });
  });
  await page.goto(`${origin}/app/contacts/new?method=event`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-import-event="event:qa"]');
  assert.match(await page.textContent('[data-import-event="event:qa"]'), /已互换 3 人 · 其中已在人脉 2 人/);
  assert.match(await page.textContent('[data-import-event="event:qa"]'), /1 人同步中/);
  await page.click("text=添加 2 人");
  await page.waitForSelector("[data-import-event-result]");
  assert.equal(posted?.eventId, "event:qa");
  assert.ok(posted?.idempotencyKey);
  assert.match(await page.textContent("[data-import-event-result]"), /已为 2 人记上「在该活动认识」 · 后台更新中/);
  await shot("4-event");
  log.push(`scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} / viewport ${width}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= width, "no horizontal scroll");
  assert.deepEqual(log.filter((line) => line.startsWith("console.error") || line.startsWith("pageerror")), []);
  log.push("PASS");
} finally {
  await browser.close();
  console.log(log.join("\n"));
}
