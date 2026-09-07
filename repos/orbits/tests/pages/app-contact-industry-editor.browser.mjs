import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

// Use an isolated mock preview. Every browser API request is intercepted.
const origin = process.env.ORBIT_INDUSTRY_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_INDUSTRY_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-industry-editor-browser-");
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "industry-qa", email: "industry-qa@example.test", name: "Industry QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_INDUSTRY_QA_CHROME ? { executablePath: process.env.ORBIT_INDUSTRY_QA_CHROME } : {}) });

try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "industry-qa", name: "Industry QA", email: "industry-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
        return;
      }
      if (path === "/api/contacts/demo-contact-1" && request.method() === "PATCH") {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body), ["primaryIndustryId"]);
        writes.push(body);
        if (writes.length === 1) { await route.abort("failed"); return; }
        await route.fulfill({ json: { success: true, data: { contact: { id: "demo-contact-1", primaryIndustryId: body.primaryIndustryId ?? undefined } } } });
        return;
      }
      assert.equal(request.method(), "GET", `unexpected browser write: ${request.method()} ${path}`);
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.goto(`${origin}/app/contacts/demo-contact-1`, { waitUntil: "networkidle" });
    const edit = page.getByRole("button", { name: "编辑主要行业", exact: true });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "主要行业", exact: true });
    const select = dialog.getByRole("combobox");
    await select.selectOption("finance_investment");
    const save = dialog.getByRole("button", { name: "保存行业", exact: true });
    assert.notEqual(await save.evaluate((button) => getComputedStyle(button).backgroundColor), "rgba(0, 0, 0, 0)");
    await save.click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await select.inputValue(), "finance_investment");
    await page.screenshot({ path: `${output}/${name}-retry.png`, fullPage: true });
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes.slice(0, 2), [{ primaryIndustryId: "finance_investment" }, { primaryIndustryId: "finance_investment" }]);
    await page.getByText("金融与投资", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await edit.evaluate((button) => document.activeElement === button), true, "closing restores focus to the edit button");
    await edit.click();
    assert.equal(await select.inputValue(), "finance_investment", "reopening uses the saved ID");
    await select.selectOption("");
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes[2], { primaryIndustryId: null });
    await page.getByText("未分类", { exact: true }).filter({ visible: true }).waitFor();
    await edit.click();
    assert.equal(await select.inputValue(), "");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.screenshot({ path: `${output}/${name}-cleared.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`${name}: edit, retained failed draft, retry, canonical saved label, clear, reopen and focus restoration passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
