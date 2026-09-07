import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

// All browser API traffic is intercepted in this isolated mock preview.
const origin = process.env.ORBIT_INTERACTION_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_INTERACTION_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-contact-interaction-browser-");
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "interaction-qa", email: "interaction-qa@example.test", name: "Interaction QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_INTERACTION_QA_CHROME ? { executablePath: process.env.ORBIT_INTERACTION_QA_CHROME } : {}) });
try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: "Asia/Tokyo" });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    let storedInteraction;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "interaction-qa", name: "Interaction QA", email: "interaction-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
        return;
      }
      if (path === "/api/contacts/demo-contact-1" && request.method() === "PATCH") {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body), ["lastInteraction"]);
        writes.push(body);
        if (writes.length === 1) { await route.abort("failed"); return; }
        storedInteraction = { ...storedInteraction, ...body.lastInteraction };
        await route.fulfill({ json: { success: true, data: { contact: { id: "demo-contact-1", lastInteraction: storedInteraction } } } });
        return;
      }
      assert.equal(request.method(), "GET", `unexpected write: ${request.method()} ${path}`);
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.goto(`${origin}/app/contacts/demo-contact-1`, { waitUntil: "networkidle" });
    const edit = page.getByRole("button", { name: "编辑最近互动", exact: true });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "最近互动", exact: true });
    await dialog.getByRole("combobox", { name: "互动渠道", exact: true }).selectOption("email_signal");
    await dialog.getByLabel("互动时间", { exact: true }).fill("2026-09-08T12:30");
    await dialog.getByRole("textbox", { name: "互动摘要", exact: true }).fill("CRM:已讨论下次见面的资料");
    await dialog.getByRole("button", { name: "保存互动", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await page.screenshot({ path: `${output}/${name}-retry.png`, fullPage: true });
    await dialog.getByRole("button", { name: "保存互动", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes, Array(2).fill({ lastInteraction: { channel: "email_signal", occurredAt: "2026-09-08T03:30:00.000Z", summary: "CRM:已讨论下次见面的资料" } }));
    await page.getByText("CRM:已讨论下次见面的资料", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await edit.evaluate((button) => document.activeElement === button), true);
    await edit.click();
    assert.equal(await dialog.getByRole("textbox", { name: "互动摘要", exact: true }).inputValue(), "CRM:已讨论下次见面的资料");
    assert.match(await dialog.getByLabel("互动时间", { exact: true }).inputValue(), /^2026-09-08T12:30/);
    assert.equal(await dialog.getByRole("button", { name: "保存互动", exact: true }).isDisabled(), true);
    await dialog.getByRole("textbox", { name: "互动摘要", exact: true }).fill("strategic_fit");
    await dialog.getByRole("button", { name: "保存互动", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes[2], { lastInteraction: { channel: "email_signal", summary: "strategic_fit" } });
    await page.getByText("战略契合", { exact: true }).filter({ visible: true }).waitFor({ timeout: 3000 });
    await edit.click();
    assert.equal(await dialog.getByRole("textbox", { name: "互动摘要", exact: true }).inputValue(), "strategic_fit");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await edit.evaluate((button) => document.activeElement === button), true);
    await page.screenshot({ path: `${output}/${name}-saved.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`${name}: interaction-only PATCH, local time to UTC, failed draft retry, confirmed label, reopen and focus passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
