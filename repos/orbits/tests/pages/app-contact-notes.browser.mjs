import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

const origin = process.env.ORBIT_NOTES_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_NOTES_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync(join(tmpdir(), "orbit-contact-notes-browser-"));
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "notes-qa", email: "notes-qa@example.test", name: "Notes QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_NOTES_QA_CHROME ? { executablePath: process.env.ORBIT_NOTES_QA_CHROME } : {}) });
const body = "strategic_fit / CRM mock 案例\n下次带日本市场资料。";
try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: "Asia/Tokyo" });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const writes = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
    await page.route(`${origin}/api/**`, async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "notes-qa", name: "Notes QA", email: "notes-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } }); return;
      }
      if (path === "/api/contacts/demo-contact-1" && request.method() === "PATCH") {
        writes.push(request.postDataJSON());
        if (writes.length === 1) { await route.abort("failed"); return; }
        await route.fulfill({ json: { success: true, data: { contact: { id: "demo-contact-1", notes: [{ noteId: "note:notes-qa", body, createdAt: "2026-09-08T04:00:00.000Z", privacy: "private", authorLabel: "我" }] } } } }); return;
      }
      assert.equal(request.method(), "GET", `Unexpected write: ${request.method()} ${path}`);
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.goto(`${origin}/app/contacts/demo-contact-1`, { waitUntil: "domcontentloaded" });
    const add = page.getByRole("button", { name: "添加联系人备注", exact: true }).filter({ visible: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: "添加联系人备注", exact: true });
    assert.equal(await dialog.count(), 1);
    const field = dialog.getByRole("textbox", { name: "添加联系人备注", exact: true });
    const save = dialog.getByRole("button", { name: "保存备注", exact: true });
    assert.equal(await save.isDisabled(), true);
    await field.fill(`  ${body}  `);
    await save.click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await field.inputValue(), `  ${body}  `);
    await page.screenshot({ path: `${output}/${name}-retry.png`, fullPage: true });
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes, Array(2).fill({ note: { body, authorLabel: "我" } }));
    assert.equal(await page.getByText(body, { exact: true }).filter({ visible: true }).count(), 1);
    assert.equal(await add.evaluate(button => document.activeElement === button), true);
    await add.click();
    assert.equal(await field.inputValue(), "");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await add.evaluate(button => document.activeElement === button), true);
    await page.screenshot({ path: `${output}/${name}-saved.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`${name}: single dialog, failed draft retry, note-only PATCH, literal text, reopen and focus passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
